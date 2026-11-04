-- Passenger accounts and online booking.
--
-- Anyone can sign up to this project's Auth and register as a passenger.
-- Passengers are not ticketing.members: they never read the tables. They use
-- only the functions below, which show trips and free seats (no other
-- passenger's details) and let them book, see and cancel their own bookings.
--
-- An online booking is a hold: tickets start as 'Reserved' with hold_until.
-- The passenger pays at a PITX counter before the hold runs out, and the
-- Teller turns it into an 'Issued' ticket. Holds that run out are voided
-- automatically the next time anyone looks at or books that trip. There is
-- no online payment yet.

/* ----------------------------------------------------------------- Settings */

alter table ticketing.settings
  add column if not exists online_booking     boolean not null default true,
  add column if not exists online_cutoff_min  int not null default 60 check (online_cutoff_min between 0 and 1440),
  add column if not exists online_hold_min    int not null default 30 check (online_hold_min between 5 and 1440),
  add column if not exists online_max_seats   int not null default 5  check (online_max_seats between 1 and 20);

/* --------------------------------------------------------------- Passengers */

create table if not exists ticketing.passengers (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) between 2 and 120),
  contact_no  text not null check (length(trim(contact_no)) between 7 and 20),
  created_at  timestamptz not null default now()
);
alter table ticketing.passengers enable row level security;
drop policy if exists "members can read" on ticketing.passengers;
create policy "members can read" on ticketing.passengers for select to authenticated
  using ((select ticketing.is_member()));
grant select on ticketing.passengers to authenticated;

/* ------------------------------------------------------------------ Tickets */

alter table ticketing.tickets
  add column if not exists booked_by   uuid references auth.users(id) on delete set null,
  add column if not exists hold_until  timestamptz,
  alter column payment_method drop not null;

alter table ticketing.tickets drop constraint if exists tickets_status_check;
alter table ticketing.tickets add constraint tickets_status_check
  check (status in ('Reserved', 'Booked', 'Issued', 'Boarded', 'Voided'));
alter table ticketing.tickets drop constraint if exists tickets_paid_check;
alter table ticketing.tickets add constraint tickets_paid_check
  check (status in ('Reserved', 'Voided') or payment_method is not null);
alter table ticketing.tickets drop constraint if exists tickets_hold_check;
alter table ticketing.tickets add constraint tickets_hold_check
  check (status <> 'Reserved' or hold_until is not null);

create index if not exists tickets_booked_by_idx on ticketing.tickets (booked_by);
create index if not exists tickets_hold_idx on ticketing.tickets (hold_until) where status = 'Reserved';

-- Online ticket numbers: <company ticket code>W-<number>.
create sequence if not exists ticketing.online_ticket_seq start 100001;

/* ------------------------------------------------------------------ Helpers */

create or replace function ticketing.departs_at(t ticketing.trips)
returns timestamptz
language sql
immutable
as $$
  select (t.trip_date + t.trip_time) at time zone 'Asia/Manila';
$$;

-- Voids holds that ran out, on one trip or (p_trip null) everywhere.
create or replace function ticketing.release_expired(p_trip uuid default null)
returns int
language plpgsql
security definer
set search_path = ticketing
as $$
declare n int;
begin
  update ticketing.tickets
     set status = 'Voided', void_reason = 'Hold expired', voided_by = 'System'
   where status = 'Reserved' and hold_until < now()
     and (p_trip is null or trip_id = p_trip);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function ticketing.release_expired(uuid) from public, anon, authenticated;

-- Seats nobody can book on a trip: the bus type's blocked seats, live
-- tickets and active seat marks.
create or replace function ticketing.unavailable_seats(p_trip uuid)
returns int[]
language sql
stable
security definer
set search_path = ticketing
as $$
  select coalesce(array_agg(distinct s order by s), '{}')
    from (
      select unnest(bt.blocked_seats) as s
        from ticketing.trips t
        join ticketing.buses b on b.plate_no = t.plate_no
        join ticketing.bus_types bt on bt.company_code = b.company_code and bt.code = b.bus_type_code
       where t.id = p_trip
      union all
      select k.seat_no from ticketing.tickets k
       where k.trip_id = p_trip and k.status <> 'Voided'
         and not (k.status = 'Reserved' and k.hold_until < now())
      union all
      select m.seat_no from ticketing.seat_marks m
       where m.trip_id = p_trip
         and (m.kind = 'Permanent Block' or (m.kind = 'Temporary Block' and coalesce(m.until, 'infinity') > now()))
    ) x;
$$;
revoke all on function ticketing.unavailable_seats(uuid) from public, anon, authenticated;

-- Trips a passenger can book: scheduled, a bus assigned, selling, inside the
-- company's advance-booking days and before the online cutoff.
create or replace view ticketing.online_trips as
select t.id as trip_id, t.trip_no, t.trip_date, t.trip_time, ticketing.departs_at(t) as departs_at,
       r.code as route_code, r.description as route, r.denomination,
       c.code as company_code, c.name as company_name, c.logo, c.ticket_code,
       t.bay, bt.layout_id, bt.layout_id::int as capacity,
       r.adult,
       coalesce(r.student, round(r.adult * 0.8, 2)) as student,
       coalesce(r.senior,  round(r.adult * 0.8, 2)) as senior,
       coalesce(r.pwd,     round(r.adult * 0.8, 2)) as pwd,
       r.message
  from ticketing.trips t
  join ticketing.routes r     on r.code = t.route_code and r.active
  join ticketing.companies c  on c.code = r.company_code and c.active
  join ticketing.buses b      on b.plate_no = t.plate_no and b.active
  join ticketing.bus_types bt on bt.company_code = b.company_code and bt.code = b.bus_type_code
  cross join ticketing.settings s
 where s.id = 1 and s.online_booking
   and t.status = 'Scheduled' and not t.stop_selling
   and ticketing.departs_at(t) > now() + make_interval(mins => s.online_cutoff_min)
   and t.trip_date <= (now() at time zone 'Asia/Manila')::date + c.advance_days;
revoke all on ticketing.online_trips from public, anon, authenticated;

/* ------------------------------------------------- Public: trips and seats */

-- Bookable trips for one day (Manila date), with seats left. No sign-in needed.
create or replace function public.ticketing_online_trips(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, ticketing
as $$
declare d date := coalesce(p_date, (now() at time zone 'Asia/Manila')::date);
begin
  perform ticketing.release_expired(null);
  return coalesce((
    select jsonb_agg(to_jsonb(o) || jsonb_build_object(
             'seats_left', o.capacity - cardinality(ticketing.unavailable_seats(o.trip_id)))
           order by o.departs_at, o.route)
      from ticketing.online_trips o
     where o.trip_date = d), '[]');
end $$;

-- Seat map data for one bookable trip: layout and the seats already taken.
create or replace function public.ticketing_trip_seats(p_trip uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, ticketing
as $$
declare o ticketing.online_trips;
begin
  select * into o from ticketing.online_trips where trip_id = p_trip;
  if not found then raise exception 'This trip is not open for online booking'; end if;
  perform ticketing.release_expired(p_trip);
  return to_jsonb(o) || jsonb_build_object('unavailable', to_jsonb(ticketing.unavailable_seats(p_trip)));
end $$;

/* ----------------------------------------------------- Passenger: account */

-- Registers (or updates) the signed-in user as a passenger.
create or replace function public.ticketing_register_passenger(p_full_name text, p_contact_no text)
returns jsonb
language plpgsql
security definer
set search_path = public, ticketing
as $$
declare p ticketing.passengers;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  insert into ticketing.passengers as x (user_id, full_name, contact_no)
  values (auth.uid(), trim(p_full_name), trim(p_contact_no))
  on conflict (user_id) do update set full_name = excluded.full_name, contact_no = excluded.contact_no
  returning * into p;
  return to_jsonb(p);
end $$;

/* ----------------------------------------------------- Passenger: booking */

-- Books seats on one trip for the signed-in passenger.
-- p_seats: [{"seat_no": 12, "passenger_name": "...", "fare_type": "Adult", "id_no": null}, ...]
-- Discount fares (Student, Senior, PWD) need an ID number, checked at the counter.
create or replace function public.ticketing_book(p_trip uuid, p_seats jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, ticketing
as $$
declare
  s        ticketing.settings;
  o        ticketing.online_trips;
  me       ticketing.passengers;
  email    text;
  grp      uuid := gen_random_uuid();
  hold     timestamptz;
  taken    int[];
  x        jsonb;
  seat     int;
  ftype    text;
  fare     numeric;
  tno      text;
  tid      uuid;
  out      jsonb := '[]';
  total    numeric := 0;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into me from ticketing.passengers where user_id = auth.uid();
  if not found then raise exception 'Complete your passenger details first'; end if;
  select * into s from ticketing.settings where id = 1;

  -- One booking at a time per trip, so two passengers can't take the same seat.
  perform 1 from ticketing.trips where id = p_trip for update;
  select * into o from ticketing.online_trips where trip_id = p_trip;
  if not found then raise exception 'This trip is not open for online booking'; end if;

  if jsonb_typeof(p_seats) <> 'array' or jsonb_array_length(p_seats) = 0 then
    raise exception 'Pick at least one seat';
  end if;
  if jsonb_array_length(p_seats) > s.online_max_seats then
    raise exception 'You can book up to % seats at a time', s.online_max_seats;
  end if;
  if (select count(distinct (e->>'seat_no')) from jsonb_array_elements(p_seats) e) <> jsonb_array_length(p_seats) then
    raise exception 'The same seat is picked twice';
  end if;

  perform ticketing.release_expired(p_trip);
  taken := ticketing.unavailable_seats(p_trip);
  hold  := least(now() + make_interval(mins => s.online_hold_min),
                 o.departs_at - make_interval(mins => s.online_cutoff_min));
  select u.email into email from auth.users u where u.id = auth.uid();

  for x in select * from jsonb_array_elements(p_seats) loop
    seat  := (x->>'seat_no')::int;
    ftype := coalesce(nullif(x->>'fare_type', ''), 'Adult');
    if seat is null or seat < 1 or seat > o.capacity then
      raise exception 'Seat % is not on this bus', coalesce(x->>'seat_no', '?');
    end if;
    if seat = any(taken) then raise exception 'Seat % is already taken', seat; end if;
    if ftype not in ('Adult', 'Student', 'Senior', 'PWD') then raise exception 'Unknown fare type %', ftype; end if;
    if ftype <> 'Adult' and coalesce(trim(x->>'id_no'), '') = '' then
      raise exception 'Seat %: a % fare needs an ID number', seat, ftype;
    end if;
    if length(trim(coalesce(x->>'passenger_name', ''))) < 2 then
      raise exception 'Seat %: enter the passenger''s name', seat;
    end if;
    fare := case ftype when 'Adult' then o.adult when 'Student' then o.student when 'Senior' then o.senior else o.pwd end;
    tno  := o.ticket_code || 'W-' || lpad(nextval('ticketing.online_ticket_seq')::text, 6, '0');

    begin
      insert into ticketing.tickets (ticket_no, group_id, source, booking_ref, trip_id, seat_no, passenger_name,
                                     contact_no, email, fare_type, fare, insurance, id_no, status, hold_until,
                                     booked_by, sold_by)
      values (tno, grp, 'Online', 'BK-' || upper(substr(replace(grp::text, '-', ''), 1, 8)), p_trip, seat,
              trim(x->>'passenger_name'), me.contact_no, email, ftype, fare, s.insurance_price,
              nullif(trim(x->>'id_no'), ''), 'Reserved', hold, auth.uid(), 'Online: ' || me.full_name)
      returning id into tid;
    exception when unique_violation then
      raise exception 'Seat % was just taken. Pick another seat.', seat;
    end;

    insert into ticketing.audit_log (by_name, by_id, action, ticket_id, trip_id, detail)
    values (me.full_name, auth.uid(), 'Online booking', tid, p_trip, tno || ', ' || o.trip_no || ' seat ' || seat);

    out   := out || jsonb_build_object('ticket_no', tno, 'seat_no', seat, 'passenger_name', trim(x->>'passenger_name'),
                                       'fare_type', ftype, 'fare', fare + s.insurance_price);
    total := total + fare + s.insurance_price;
  end loop;

  return jsonb_build_object(
    'group_id', grp,
    'booking_ref', 'BK-' || upper(substr(replace(grp::text, '-', ''), 1, 8)),
    'trip', to_jsonb(o),
    'hold_until', hold,
    'total', total,
    'tickets', out,
    'pay_at', 'Pay at any PITX ticket counter before the hold ends, or the seats are released.');
end $$;

-- The signed-in passenger's bookings, newest first. No ID numbers.
create or replace function public.ticketing_my_bookings()
returns jsonb
language plpgsql
security definer
set search_path = public, ticketing
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform ticketing.release_expired(null);
  return jsonb_build_object(
    'passenger', (select to_jsonb(p) from ticketing.passengers p where p.user_id = auth.uid()),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'group_id', k.group_id, 'booking_ref', k.booking_ref, 'ticket_no', k.ticket_no,
               'seat_no', k.seat_no, 'passenger_name', k.passenger_name, 'fare_type', k.fare_type,
               'fare', k.fare + k.insurance, 'status', k.status, 'hold_until', k.hold_until,
               'void_reason', k.void_reason, 'issued_at', k.issued_at,
               'trip_no', t.trip_no, 'departs_at', ticketing.departs_at(t), 'bay', t.bay,
               'route', r.description, 'company_name', c.name, 'logo', c.logo)
             order by k.issued_at desc, k.seat_no)
        from ticketing.tickets k
        join ticketing.trips t on t.id = k.trip_id
        join ticketing.routes r on r.code = t.route_code
        join ticketing.companies c on c.code = r.company_code
       where k.booked_by = auth.uid()), '[]'));
end $$;

-- Cancels the signed-in passenger's unpaid holds in one booking. Paid tickets
-- are refunded at the counter instead.
create or replace function public.ticketing_cancel_booking(p_group uuid)
returns int
language plpgsql
security definer
set search_path = public, ticketing
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update ticketing.tickets
     set status = 'Voided', void_reason = 'Cancelled by passenger', voided_by = 'Passenger'
   where group_id = p_group and booked_by = auth.uid() and status = 'Reserved';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nothing to cancel. Paid tickets are refunded at a PITX counter.'; end if;
  insert into ticketing.audit_log (by_name, by_id, action, detail)
  values ((select full_name from ticketing.passengers where user_id = auth.uid()), auth.uid(),
          'Online booking cancelled', n || ' seat(s), group ' || p_group);
  return n;
end $$;

revoke all on function public.ticketing_online_trips(date) from public;
revoke all on function public.ticketing_trip_seats(uuid) from public;
revoke all on function public.ticketing_register_passenger(text, text) from public, anon;
revoke all on function public.ticketing_book(uuid, jsonb) from public, anon;
revoke all on function public.ticketing_my_bookings() from public, anon;
revoke all on function public.ticketing_cancel_booking(uuid) from public, anon;
grant execute on function public.ticketing_online_trips(date) to anon, authenticated;
grant execute on function public.ticketing_trip_seats(uuid) to anon, authenticated;
grant execute on function public.ticketing_register_passenger(text, text) to authenticated;
grant execute on function public.ticketing_book(uuid, jsonb) to authenticated;
grant execute on function public.ticketing_my_bookings() to authenticated;
grant execute on function public.ticketing_cancel_booking(uuid) to authenticated;
