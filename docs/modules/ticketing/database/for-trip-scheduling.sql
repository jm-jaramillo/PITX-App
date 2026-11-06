-- PROPOSAL for @jm-jaramillo, not a migration. Trip Scheduling owns these
-- functions; Ticketing does not change them. If you agree, put this in a
-- trip-scheduling migration after 202611061100_ticketing_core_links.sql.
--
-- What it changes in 0051's passenger seat requests:
--   * request_seats() finds the bus through links instead of matching
--     bookings.plate_no text against vehicles.plate_no: first the vehicle
--     Ticketing sells the booking on (public.ticketing_booking_vehicle), then
--     core.vehicles by normalised plate for the same operator.
--   * Seats Ticketing has sold, held or blocked (public.ticketing_taken_seats)
--     can't be requested, and show as taken on the seat picker.
--
-- Signatures are unchanged, so seats.html keeps working. Ticketing already
-- treats live seat_reservations as taken (it reads get_trip_seats()), and
-- ticketing_taken_seats() never calls back into Trip Scheduling, so there is
-- no loop.

-- Seats taken on a trip: passenger requests plus Ticketing's seats ('sold').
create or replace function public.get_trip_seats(p_booking_id uuid)
returns table (seat_no integer, state text)
language sql
stable
security definer
set search_path = public
as $$
  select r.seat_no, case r.status when 'requested' then 'held' else 'blocked' end
  from public.seat_reservations r
  where r.booking_id = p_booking_id and r.status in ('requested', 'blocked')
  union
  select s, 'sold'
  from unnest(public.ticketing_taken_seats(p_booking_id)) s
  where not exists (select 1 from public.seat_reservations r
                     where r.booking_id = p_booking_id and r.seat_no = s
                       and r.status in ('requested', 'blocked'));
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

  -- Changed: the vehicle comes from Ticketing's link, else core by plate key.
  select b.id, b.route, b.booking_date, b.slot, b.operator_name, b.trip_number, v.seating_capacity
    into v_trip
  from public.bookings b
  join core.vehicles v
    on v.vehicle_id = coalesce(
         public.ticketing_booking_vehicle(b.id),
         (select cv.vehicle_id from core.vehicles cv
           where cv.operator_id = b.operator_id and cv.plate_key = core.plate_norm(b.plate_no)
           limit 1))
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

  -- New: seats Ticketing has already sold, held or blocked.
  if v_seats && public.ticketing_taken_seats(p_booking_id) then
    raise exception 'seat_taken: one of those seats is already sold. Please pick again.' using errcode = 'P0001';
  end if;

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

-- list_seat_trips() can get the same vehicle lookup; left to you.

-- ---------------------------------------------------------------------------
-- 2. Operators see their own trips and vehicles (added 6 Nov)
--
-- Ticketing gives each operator account (e.g. genesis-ops) one Bus Company role
-- for its own company. To show the operator its real trips and units, Ticketing
-- reads tos_trip_feed() and tos_vehicle_masterfile(), which today return rows to
-- PITX staff only. The change: staff still see everything; an operator sees its
-- own rows. Signatures unchanged, so TOS is not affected.

create or replace function public.tos_trip_feed(p_date date)
returns table (
  booking_id    uuid,
  booking_date  date,
  slot          smallint,
  etd           timestamptz,
  route         text,
  operator_id   uuid,
  operator_name text,
  trade_name    text,
  trip_number   text,
  plate_no      text,
  bay_id        bigint,
  bay_name      text,
  bay_gate      text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.booking_date, b.slot, public.slot_start_at(b.booking_date, b.slot),
         b.route, b.operator_id, b.operator_name, b.trade_name, b.trip_number,
         nullif(upper(regexp_replace(coalesce(b.plate_no, ''), '[^A-Za-z0-9]', '', 'g')), ''),
         b.assigned_bay_id, bay.name, bay.gate
    from public.bookings b
    left join public.bays bay on bay.id = b.assigned_bay_id
   where (public.is_staff() or b.operator_id = auth.uid())
     and b.booking_date = p_date
     and b.status = 'approved'
   order by b.slot, b.route;
$$;

create or replace function public.tos_vehicle_masterfile()
returns table (
  plate_no      text,
  operator_id   uuid,
  operator_name text,
  trade_name    text,
  body_number   text,
  bus_type      text,
  route         text,
  cpc_validity  date,
  orcr_validity date
)
language sql
stable
security definer
set search_path = public
as $$
  select upper(regexp_replace(v.plate_no, '[^A-Za-z0-9]', '', 'g')),
         v.operator_id, p.operator_name, v.trade_name, v.body_number, v.bus_type, v.route,
         v.cpc_validity, v.orcr_validity
    from public.vehicles v
    left join public.profiles p on p.id = v.operator_id
   where (public.is_staff() or v.operator_id = auth.uid())
     and v.status = 'approved'
   order by p.operator_name, v.plate_no;
$$;
