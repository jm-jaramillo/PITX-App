-- Passenger seat selection + the Ticketing Admin role.
--
-- A passenger (no account, no login) opens the public seat picker, picks
-- an approved trip, taps the seats they want and leaves a name and mobile
-- number. That writes one `seat_reservations` row per seat in status
-- 'requested' (the seat is held - nobody else can pick it) and notifies
-- the Ticketing Admin(s), who block the same seats in the ticketing
-- system and mark the request 'blocked' here, or release it.
--
-- Design notes:
--   * Passengers never touch a table. Everything they can do goes through
--     the SECURITY DEFINER functions below, which expose only what a
--     passenger needs (no plate numbers, no operator ids) and validate
--     every input server-side - the client's seat map is a convenience.
--   * A seat can only be held/blocked once per trip: a partial unique
--     index on (booking_id, seat_no) for live rows. Two passengers racing
--     for the same seat can't both win; the loser gets 'seat_taken'.
--   * Seat numbers follow the paper diagrams in "PTX. OPS. Seat
--     Configuration" (2026-10-27), 1..capacity. `seat_layouts` lists the
--     capacities that have a diagram; the layouts themselves live in
--     docs/assets/seat-map.js.
--   * Ticketing Admin is a new role ('ticketing'). It is deliberately
--     NOT staff: it can see and act on seat requests only, not approve
--     bookings or vehicles.
--   * No anti-abuse beyond validation and a 6-seat cap per request: the
--     page is public by design. Add a CAPTCHA / rate limit in front of
--     request_seats() if it gets spammed.
--
-- Run after 0050_transfer_by_gate.sql.

-- ---------------------------------------------------------------------------
-- 1. Ticketing role
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('operator', 'staff', 'ticketing'));

alter table public.notifications drop constraint if exists notifications_recipient_role_check;
alter table public.notifications
  add constraint notifications_recipient_role_check
  check (recipient_role in ('operator', 'staff', 'ticketing'));

alter table public.notifications drop constraint if exists notifications_operator_has_recipient;
alter table public.notifications
  add constraint notifications_operator_has_recipient
  check (recipient_role in ('staff', 'ticketing') or recipient_id is not null);

create or replace function public.is_ticketing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ticketing'
  );
$$;

-- Ticketing broadcasts are read like staff broadcasts: null recipient_id =
-- every Ticketing Admin's. Replace the select/update policies so they know
-- about the new role.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (
    (recipient_role = 'operator' and recipient_id = auth.uid())
    or (recipient_role = 'staff' and public.is_staff() and (recipient_id is null or recipient_id = auth.uid()))
    or (recipient_role = 'ticketing' and public.is_ticketing() and (recipient_id is null or recipient_id = auth.uid()))
  );

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (
    (recipient_role = 'operator' and recipient_id = auth.uid())
    or (recipient_role = 'staff' and public.is_staff() and (recipient_id is null or recipient_id = auth.uid()))
    or (recipient_role = 'ticketing' and public.is_ticketing() and (recipient_id is null or recipient_id = auth.uid()))
  )
  with check (
    (recipient_role = 'operator' and recipient_id = auth.uid())
    or (recipient_role = 'staff' and public.is_staff() and (recipient_id is null or recipient_id = auth.uid()))
    or (recipient_role = 'ticketing' and public.is_ticketing() and (recipient_id is null or recipient_id = auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 2. Seat layouts + reservations
-- ---------------------------------------------------------------------------
create table if not exists public.seat_layouts (
  capacity integer primary key check (capacity > 0),
  config text not null
);

comment on table public.seat_layouts is
  'Bus capacities that have a seat diagram (PTX. OPS. Seat Configuration, '
  '2026-10-27). The grid itself is in docs/assets/seat-map.js.';

insert into public.seat_layouts (capacity, config) values
  (26, '2x1'), (36, '2x1'),
  (45, '2x2'), (49, '2x2'), (53, '2x2'),
  (61, '2x3'), (63, '2x3'), (66, '2x3')
on conflict (capacity) do nothing;

alter table public.seat_layouts enable row level security;
create policy seat_layouts_read on public.seat_layouts
  for select to anon, authenticated using (true);
grant select on public.seat_layouts to anon, authenticated;

create table if not exists public.seat_reservations (
  id uuid primary key default gen_random_uuid(),
  -- One passenger request (1-6 seats) shares a ref; it is what the
  -- passenger is shown and what the Ticketing Admin acts on.
  request_ref text not null,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  seat_no integer not null check (seat_no > 0),
  passenger_name text not null check (length(btrim(passenger_name)) between 2 and 80),
  contact_no text not null check (length(btrim(contact_no)) between 7 and 20),
  status text not null default 'requested'
    check (status in ('requested', 'blocked', 'released')),
  release_note text,
  handled_by uuid references public.profiles (id),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.seat_reservations.status is
  'requested = held for the passenger, waiting on the Ticketing Admin; '
  'blocked = Ticketing Admin has blocked the seat in the ticketing system; '
  'released = given back (rejected or cancelled) - the seat is free again.';

-- A seat is live (taken) while requested or blocked.
create unique index if not exists seat_reservations_live_seat
  on public.seat_reservations (booking_id, seat_no)
  where status in ('requested', 'blocked');
create index if not exists seat_reservations_ref_idx on public.seat_reservations (request_ref);
create index if not exists seat_reservations_booking_idx on public.seat_reservations (booking_id);
create index if not exists seat_reservations_status_idx on public.seat_reservations (status, created_at desc);

alter table public.seat_reservations enable row level security;
-- No insert/update/delete policies on purpose: writes happen only through
-- the functions below. Reads are for Ticketing Admins and PITX staff.
create policy seat_reservations_read on public.seat_reservations
  for select to authenticated
  using (public.is_ticketing() or public.is_staff());

-- ---------------------------------------------------------------------------
-- 3. Passenger-facing (public) functions
-- ---------------------------------------------------------------------------

-- Approved departures for one date that have a bus with a seat diagram.
-- Exposes the minimum a passenger needs: no plate, no operator id.
create or replace function public.list_seat_trips(p_date date)
returns table (
  booking_id uuid,
  trip_number text,
  route text,
  booking_date date,
  slot smallint,
  operator_name text,
  trade_name text,
  capacity integer,
  config text,
  seats_taken integer
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.trip_number, b.route, b.booking_date, b.slot,
         b.operator_name, coalesce(b.trade_name, v.trade_name),
         v.seating_capacity, sl.config,
         (select count(*)::integer from public.seat_reservations r
           where r.booking_id = b.id and r.status in ('requested', 'blocked'))
  from public.bookings b
  join public.vehicles v
    on v.operator_id = b.operator_id
   and regexp_replace(upper(v.plate_no), '[^A-Z0-9]', '', 'g')
     = regexp_replace(upper(b.plate_no), '[^A-Z0-9]', '', 'g')
  join public.seat_layouts sl on sl.capacity = v.seating_capacity
  where b.status = 'approved'
    and b.plate_no is not null
    and b.booking_date = p_date
    and public.slot_start_at(b.booking_date, b.slot) > now()
  order by b.slot, b.route;
$$;

-- Which seats on a trip are taken ('held' = requested, 'blocked' = confirmed
-- by ticketing). The passenger's map greys out both.
create or replace function public.get_trip_seats(p_booking_id uuid)
returns table (seat_no integer, state text)
language sql
stable
security definer
set search_path = public
as $$
  select r.seat_no, case r.status when 'requested' then 'held' else 'blocked' end
  from public.seat_reservations r
  where r.booking_id = p_booking_id and r.status in ('requested', 'blocked');
$$;

create or replace function public.request_seats(
  p_booking_id uuid,
  p_seats integer[],
  p_name text,
  p_contact text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_trip record;
  v_seats integer[];
  v_ref text;
  v_seat integer;
begin
  select array(select distinct s from unnest(coalesce(p_seats, '{}')) s order by s) into v_seats;

  if coalesce(array_length(v_seats, 1), 0) not between 1 and 6 then
    raise exception 'Pick between 1 and 6 seats.' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 or length(btrim(p_name)) > 80 then
    raise exception 'Enter the passenger''s name.' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_contact, '')) !~ '^[0-9+()\- ]{7,20}$' then
    raise exception 'Enter a valid mobile number.' using errcode = 'P0001';
  end if;

  select b.id, b.route, b.booking_date, b.slot, b.operator_name, b.trip_number, v.seating_capacity
    into v_trip
  from public.bookings b
  join public.vehicles v
    on v.operator_id = b.operator_id
   and regexp_replace(upper(v.plate_no), '[^A-Z0-9]', '', 'g')
     = regexp_replace(upper(b.plate_no), '[^A-Z0-9]', '', 'g')
  where b.id = p_booking_id
    and b.status = 'approved'
    and public.slot_start_at(b.booking_date, b.slot) > now();
  if not found then
    raise exception 'This trip is no longer open for seat selection.' using errcode = 'P0001';
  end if;

  v_capacity := v_trip.seating_capacity;
  if not exists (select 1 from public.seat_layouts where capacity = v_capacity) then
    raise exception 'This bus has no seat map.' using errcode = 'P0001';
  end if;
  if v_seats[1] < 1 or v_seats[array_length(v_seats, 1)] > v_capacity then
    raise exception 'Invalid seat for this bus.' using errcode = 'P0001';
  end if;

  -- 8 hex chars: short enough to read out over the phone, long enough not
  -- to guess a neighbour's request.
  v_ref := 'S-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  begin
    foreach v_seat in array v_seats loop
      insert into public.seat_reservations (request_ref, booking_id, seat_no, passenger_name, contact_no)
      values (v_ref, p_booking_id, v_seat, btrim(p_name), btrim(p_contact));
    end loop;
  exception when unique_violation then
    raise exception 'seat_taken: one of those seats was just reserved by someone else. Please pick again.'
      using errcode = 'P0001';
  end;

  insert into public.notifications (recipient_role, type, title, body, link, related_table, related_id)
  values (
    'ticketing',
    'seat_request',
    'Seat request: block ' || array_length(v_seats, 1) || (case when array_length(v_seats, 1) = 1 then ' seat' else ' seats' end),
    btrim(p_name) || ' - ' || v_trip.route || ' ' || v_trip.booking_date
      || ' (seat' || (case when array_length(v_seats, 1) = 1 then ' ' else 's ' end)
      || array_to_string(v_seats, ', ') || ')',
    'ticketing.html',
    'seat_reservations',
    p_booking_id
  );

  return v_ref;
end;
$$;

-- What the passenger sees after submitting (and when they come back with
-- their reference): the status of each seat on the request.
create or replace function public.get_seat_request(p_ref text)
returns table (
  request_ref text, seat_no integer, status text, release_note text,
  route text, booking_date date, slot smallint, operator_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.request_ref, r.seat_no, r.status, r.release_note,
         b.route, b.booking_date, b.slot, b.operator_name
  from public.seat_reservations r
  join public.bookings b on b.id = r.booking_id
  where r.request_ref = upper(btrim(p_ref))
  order by r.seat_no;
$$;

-- A passenger can give their own seats back with the reference.
create or replace function public.cancel_seat_request(p_ref text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.seat_reservations
     set status = 'released', release_note = 'Cancelled by passenger', handled_at = now()
   where request_ref = upper(btrim(p_ref)) and status = 'requested';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.list_seat_trips(date) to anon, authenticated;
grant execute on function public.get_trip_seats(uuid) to anon, authenticated;
grant execute on function public.request_seats(uuid, integer[], text, text) to anon, authenticated;
grant execute on function public.get_seat_request(text) to anon, authenticated;
grant execute on function public.cancel_seat_request(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ticketing Admin functions (signed-in, role-checked)
-- ---------------------------------------------------------------------------

-- One row per request, with the trip it is for. `status` is the request's
-- overall state: requested if any seat is still waiting, else blocked if
-- any seat is blocked, else released.
create or replace function public.list_seat_requests()
returns table (
  request_ref text, booking_id uuid, trip_number text, route text,
  booking_date date, slot smallint, operator_name text, plate_no text,
  passenger_name text, contact_no text, seats integer[], status text,
  release_note text, created_at timestamptz, handled_at timestamptz,
  capacity integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_ticketing() or public.is_staff()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return query
  select r.request_ref, r.booking_id, b.trip_number, b.route, b.booking_date, b.slot,
         b.operator_name, b.plate_no,
         min(r.passenger_name), min(r.contact_no),
         array_agg(r.seat_no order by r.seat_no),
         (case when bool_or(r.status = 'requested') then 'requested'
               when bool_or(r.status = 'blocked') then 'blocked'
               else 'released' end),
         min(r.release_note), min(r.created_at), max(r.handled_at),
         (select v.seating_capacity from public.vehicles v
           where v.operator_id = b.operator_id
             and regexp_replace(upper(v.plate_no), '[^A-Z0-9]', '', 'g')
               = regexp_replace(upper(b.plate_no), '[^A-Z0-9]', '', 'g')
           limit 1)
  from public.seat_reservations r
  join public.bookings b on b.id = r.booking_id
  group by r.request_ref, r.booking_id, b.trip_number, b.route, b.booking_date, b.slot,
           b.operator_name, b.plate_no, b.operator_id
  order by min(r.created_at) desc
  limit 500;
end;
$$;

-- Seats of one trip, for the Ticketing Admin's whole-bus view.
create or replace function public.list_trip_seat_holders(p_booking_id uuid)
returns table (seat_no integer, status text, passenger_name text, request_ref text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_ticketing() or public.is_staff()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return query
  select r.seat_no, r.status, r.passenger_name, r.request_ref
  from public.seat_reservations r
  where r.booking_id = p_booking_id and r.status in ('requested', 'blocked');
end;
$$;

create or replace function public.block_seat_request(p_ref text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.is_ticketing() then
    raise exception 'Only a Ticketing Admin can block seats.' using errcode = '42501';
  end if;
  update public.seat_reservations
     set status = 'blocked', handled_by = auth.uid(), handled_at = now()
   where request_ref = upper(btrim(p_ref)) and status = 'requested';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Release a request (or a blocked one, if the passenger cancels): the
-- seats become pickable again.
create or replace function public.release_seat_request(p_ref text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.is_ticketing() then
    raise exception 'Only a Ticketing Admin can release seats.' using errcode = '42501';
  end if;
  update public.seat_reservations
     set status = 'released', release_note = nullif(btrim(coalesce(p_note, '')), ''),
         handled_by = auth.uid(), handled_at = now()
   where request_ref = upper(btrim(p_ref)) and status in ('requested', 'blocked');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.list_seat_requests() from public, anon;
revoke execute on function public.list_trip_seat_holders(uuid) from public, anon;
revoke execute on function public.block_seat_request(text) from public, anon;
revoke execute on function public.release_seat_request(text, text) from public, anon;
grant execute on function public.list_seat_requests() to authenticated;
grant execute on function public.list_trip_seat_holders(uuid) to authenticated;
grant execute on function public.block_seat_request(text) to authenticated;
grant execute on function public.release_seat_request(text, text) to authenticated;
