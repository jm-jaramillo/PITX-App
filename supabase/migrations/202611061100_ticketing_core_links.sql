-- Ticketing on top of the shared core layer (docs/MERGE_PROMPTS.md).
--
-- Run after 202611061000_core_shared_master_data.sql. It does four things:
--
--   1. Review: ticketing.link_review lists the real (non-demo) companies,
--      buses and routes the automatic plate/name match missed, and links that
--      disagree with core. Fix them by hand, then validate the NOT VALID
--      foreign keys: docs/modules/ticketing/database/link_fix.sql.
--   2. Source of truth: plates, seating capacity and operator names come from
--      core.vehicles and core.operators wherever a row is linked.
--      ticketing.buses and ticketing.companies keep their own fields (ticket
--      code, PTU/TIN, bus type, fares), but their plate and operator
--      columns are no longer what the pages or bookings show.
--   3. Trip Scheduling links: trips.booking_id references public.bookings.
--      Seats a passenger requested through Trip Scheduling's request_seats()
--      (read through its own get_trip_seats()) are taken in Ticketing too,
--      and public.ticketing_taken_seats() gives Trip Scheduling the seats
--      Ticketing has sold, held or blocked. The matching change to
--      request_seats() is Trip Scheduling's to make:
--      docs/modules/ticketing/database/for-trip-scheduling.sql.
--   4. Demo data: demo rows show in pages, bookings and reports only while
--      settings.demo_mode is on (off by default, turned on by demo_data.sql
--      on dev). Demo rows can never link to core.
--
-- No Trip Scheduling or TOS table or function is changed.

/* --------------------------------------------------------------- Demo mode */

alter table ticketing.settings
  add column if not exists demo_mode boolean not null default false;

-- True for real rows, and for demo rows only while demo_mode is on. Every
-- page, booking and report function filters with it.
create or replace function ticketing.shown(p_is_demo boolean)
returns boolean
language sql
stable
security definer
set search_path = ticketing
as $$
  select not p_is_demo or coalesce((select demo_mode from ticketing.settings where id = 1), false);
$$;
revoke all on function ticketing.shown(boolean) from public, anon, authenticated;

-- Demo rows never point at real operators, vehicles or bookings.
alter table ticketing.companies drop constraint if exists companies_demo_unlinked;
alter table ticketing.companies add constraint companies_demo_unlinked check (not is_demo or operator_id is null);
alter table ticketing.buses drop constraint if exists buses_demo_unlinked;
alter table ticketing.buses add constraint buses_demo_unlinked check (not is_demo or vehicle_id is null);
alter table ticketing.trips drop constraint if exists trips_demo_unlinked;
alter table ticketing.trips add constraint trips_demo_unlinked check (not is_demo or booking_id is null);

/* ------------------------------------------------------------------- Roles */

-- profiles.role = 'ticketing' (Ticketing Admin since 0051) counts as admin.
create or replace function ticketing.my_role()
returns text
language sql
stable
security definer
set search_path = ticketing
as $$
  select coalesce(
    (select role from ticketing.members where user_id = auth.uid() and active),
    case when public.is_ticketing() then 'admin' end);
$$;

/* ------------------------------------------------- Buses and operators */

-- A linked bus must be a vehicle of its company's operator.
create or replace function ticketing.check_bus_vehicle()
returns trigger
language plpgsql
security definer
set search_path = ticketing
as $$
declare v_owner uuid; v_operator uuid;
begin
  if new.vehicle_id is null then
    return new;
  end if;
  select operator_id into v_owner from core.vehicles where vehicle_id = new.vehicle_id;
  select operator_id into v_operator from ticketing.companies where code = new.company_code;
  if not found or v_operator is null then
    raise exception 'Link company % to its operator before linking its buses', new.company_code using errcode = 'P0001';
  end if;
  if v_owner is distinct from v_operator then
    raise exception 'Vehicle % is not registered to the operator of company %', new.vehicle_id, new.company_code
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists buses_check_vehicle on ticketing.buses;
create trigger buses_check_vehicle before insert or update of vehicle_id, company_code on ticketing.buses
  for each row execute function ticketing.check_bus_vehicle();

-- Buses as the pages see them: plate, capacity and status from core when
-- linked; the Ticketing copy only for unlinked (demo or not yet fixed) buses.
create or replace view ticketing.bus_units as
select b.plate_no as bus_code, b.company_code, b.bus_type_code, b.description, b.aircon, b.charter,
       b.active, b.is_demo, b.vehicle_id,
       coalesce(v.plate_no, b.plate_no) as plate_no,
       v.body_number, v.status as vehicle_status, v.ltfrb_status,
       v.seating_capacity, bt.layout_id::int as layout_capacity
  from ticketing.buses b
  join ticketing.bus_types bt on bt.company_code = b.company_code and bt.code = b.bus_type_code
  left join core.vehicles v on v.vehicle_id = b.vehicle_id;
revoke all on ticketing.bus_units from public, anon, authenticated;

-- Companies with the operator's name from core.
create or replace view ticketing.company_units as
select c.*, o.name as operator_name, o.trade_name as operator_trade_name, o.operator_code
  from ticketing.companies c
  left join core.operators o on o.operator_id = c.operator_id;
revoke all on ticketing.company_units from public, anon, authenticated;

/* ---------------------------------------------------- Trip Scheduling links */

alter table ticketing.trips drop constraint if exists trips_booking_fk;
alter table ticketing.trips
  add constraint trips_booking_fk foreign key (booking_id) references public.bookings(id) not valid;
create unique index if not exists trips_booking_uq on ticketing.trips (booking_id) where booking_id is not null;

-- Seats Ticketing itself has taken on a trip: the bus type's blocked seats,
-- live tickets and active seat marks.
create or replace function ticketing.own_unavailable_seats(p_trip uuid)
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
revoke all on function ticketing.own_unavailable_seats(uuid) from public, anon, authenticated;

-- All seats nobody can book: Ticketing's own plus Trip Scheduling's live
-- passenger seat requests on the linked booking.
create or replace function ticketing.unavailable_seats(p_trip uuid)
returns int[]
language sql
stable
security definer
set search_path = ticketing
as $$
  select coalesce(array_agg(distinct s order by s), '{}')
    from (
      select unnest(ticketing.own_unavailable_seats(p_trip)) as s
      union all
      select g.seat_no
        from ticketing.trips t
        cross join lateral public.get_trip_seats(t.booking_id) g
       where t.id = p_trip and t.booking_id is not null
    ) x;
$$;
revoke all on function ticketing.unavailable_seats(uuid) from public, anon, authenticated;

-- For Trip Scheduling's seat picker and request_seats(): seat numbers
-- Ticketing has taken on a booking. No names. Never calls back into Trip
-- Scheduling, so get_trip_seats() can safely include it.
create or replace function public.ticketing_taken_seats(p_booking_id uuid)
returns int[]
language sql
stable
security definer
set search_path = ticketing
as $$
  select coalesce((select ticketing.own_unavailable_seats(t.id)
                     from ticketing.trips t
                    where t.booking_id = p_booking_id and t.status <> 'Cancelled'), '{}');
$$;
revoke all on function public.ticketing_taken_seats(uuid) from public;
grant execute on function public.ticketing_taken_seats(uuid) to anon, authenticated;

-- For Trip Scheduling's request_seats(): the registered vehicle Ticketing
-- sells this booking on, so it doesn't have to match the free-text plate.
-- Null when the booking has no Ticketing trip or its bus isn't linked.
create or replace function public.ticketing_booking_vehicle(p_booking_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ticketing
as $$
  select b.vehicle_id
    from ticketing.trips t
    join ticketing.buses b on b.plate_no = t.plate_no
   where t.booking_id = p_booking_id and t.status <> 'Cancelled';
$$;
revoke all on function public.ticketing_booking_vehicle(uuid) from public, anon;
grant execute on function public.ticketing_booking_vehicle(uuid) to authenticated;

/* ----------------------------------------------------------- Online trips */

-- Same columns as before. New rules: demo trips only in demo mode, and a
-- linked bus sells only if its registered seating capacity matches the
-- seat layout (otherwise the seat map would be wrong).
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
  left join core.vehicles v   on v.vehicle_id = b.vehicle_id
  cross join ticketing.settings s
 where s.id = 1 and s.online_booking
   and ticketing.shown(t.is_demo)
   and (v.vehicle_id is null or v.seating_capacity = bt.layout_id::int)
   and t.status = 'Scheduled' and not t.stop_selling
   and ticketing.departs_at(t) > now() + make_interval(mins => s.online_cutoff_min)
   and t.trip_date <= (now() at time zone 'Asia/Manila')::date + c.advance_days;
revoke all on ticketing.online_trips from public, anon, authenticated;

/* ---------------------------------------------------------------- Snapshot */

-- Same shape as before, plus 'operators'. Demo rows only in demo mode;
-- buses and companies carry core's plate, capacity and operator name.
create or replace function public.ticketing_snapshot(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, ticketing
as $$
declare
  d0 date := coalesce(p_from, (now() at time zone 'Asia/Manila')::date);
  d1 date := coalesce(p_to, d0 + 7);
begin
  if not ticketing.is_member() then
    raise exception 'This account is not a Ticketing member' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'now',        now(),
    'from',       d0,
    'to',         d1,
    'me',         coalesce((select to_jsonb(m) from ticketing.members m where m.user_id = auth.uid() and m.active),
                           jsonb_build_object('user_id', auth.uid(), 'role', ticketing.my_role())),
    'settings',   (select to_jsonb(s) from ticketing.settings s where id = 1),
    'provinces',  (select coalesce(jsonb_agg(to_jsonb(x) order by x.code), '[]') from ticketing.provinces x where ticketing.shown(x.is_demo)),
    'towns',      (select coalesce(jsonb_agg(to_jsonb(x) order by x.code), '[]') from ticketing.towns x where ticketing.shown(x.is_demo)),
    'operators',  (select coalesce(jsonb_agg(to_jsonb(o) order by o.name), '[]') from core.operators o
                    where o.operator_id in (select operator_id from ticketing.companies)),
    'companies',  (select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') from ticketing.company_units x where ticketing.shown(x.is_demo)),
    'counters',   (select coalesce(jsonb_agg(to_jsonb(x) order by x.code), '[]') from ticketing.counters x where ticketing.shown(x.is_demo)),
    'bus_types',  (select coalesce(jsonb_agg(to_jsonb(x) order by x.company_code, x.code), '[]') from ticketing.bus_types x where ticketing.shown(x.is_demo)),
    'buses',      (select coalesce(jsonb_agg(to_jsonb(x) order by x.plate_no), '[]') from ticketing.bus_units x where ticketing.shown(x.is_demo)),
    'routes',     (select coalesce(jsonb_agg(to_jsonb(x) order by x.code), '[]') from ticketing.routes x where ticketing.shown(x.is_demo)),
    'counter_fares', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from ticketing.counter_fares x
                       join ticketing.routes r on r.code = x.route_code where ticketing.shown(r.is_demo)),
    'trips',      (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object(
                     'seat_marks', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from ticketing.seat_marks m where m.trip_id = t.id),
                     'unavailable', to_jsonb(ticketing.unavailable_seats(t.id)))
                     order by t.trip_date, t.trip_time), '[]')
                     from ticketing.trips t where t.trip_date between d0 and d1 and ticketing.shown(t.is_demo)),
    'tickets',    (select coalesce(jsonb_agg(to_jsonb(k) order by k.issued_at), '[]')
                     from ticketing.tickets k join ticketing.trips t on t.id = k.trip_id
                    where t.trip_date between d0 and d1 and ticketing.shown(k.is_demo)),
    'requests',   (select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc), '[]')
                     from ticketing.requests r
                    where (r.status = 'Pending' or r.requested_at >= d0::timestamp at time zone 'Asia/Manila')
                      and ticketing.shown(r.is_demo)),
    'closings',   (select coalesce(jsonb_agg(to_jsonb(c) order by c.closed_at desc), '[]')
                     from ticketing.closings c where c.sales_date between d0 and d1 and ticketing.shown(c.is_demo))
  );
end $$;

/* ------------------------------------------------------------- Link review */

-- What still needs a hand fix before validating the foreign keys. Real rows
-- only: demo rows are never linked.
create or replace view ticketing.link_review as
select 'company' as kind, c.code, c.name as label, 'No operator linked' as problem
  from ticketing.companies c where not c.is_demo and c.operator_id is null
union all
select 'company', c.code, c.name, 'Operator is not an operator account'
  from ticketing.companies c
 where not c.is_demo and c.operator_id is not null
   and not exists (select 1 from core.operators o where o.operator_id = c.operator_id)
union all
select 'bus', b.plate_no, b.plate_no,
       case (select count(*) from core.vehicles v where v.plate_key = core.plate_norm(b.plate_no))
         when 0 then 'No vehicle linked; no registered vehicle has this plate'
         when 1 then 'No vehicle linked; one registered vehicle has this plate'
         else 'No vehicle linked; several registered vehicles have this plate' end
  from ticketing.buses b where not b.is_demo and b.vehicle_id is null
union all
select 'bus', b.plate_no, b.plate_no, 'Vehicle is registered to another operator'
  from ticketing.buses b
  join ticketing.companies c on c.code = b.company_code
  join core.vehicles v on v.vehicle_id = b.vehicle_id
 where not b.is_demo and v.operator_id is distinct from c.operator_id
union all
select 'bus', u.bus_code, u.plate_no,
       'Registered capacity ' || u.seating_capacity || ' does not match seat layout ' || u.layout_capacity
  from ticketing.bus_units u
 where not u.is_demo and u.vehicle_id is not null and u.seating_capacity is distinct from u.layout_capacity
union all
select 'route', r.code, r.description, 'No destination linked'
  from ticketing.routes r where not r.is_demo and r.destination_id is null
union all
select 'trip', t.trip_no, t.trip_date::text, 'No Trip Scheduling booking linked'
  from ticketing.trips t
 where not t.is_demo and t.booking_id is null and t.status = 'Scheduled'
   and t.trip_date >= (now() at time zone 'Asia/Manila')::date;
revoke all on ticketing.link_review from public, anon, authenticated;

create or replace function public.ticketing_link_review()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, ticketing
as $$
begin
  if ticketing.my_role() is distinct from 'admin' then
    raise exception 'Only the Ticketing Admin can review links' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.kind, x.code), '[]') from ticketing.link_review x);
end $$;
revoke all on function public.ticketing_link_review() from public, anon;
grant execute on function public.ticketing_link_review() to authenticated;
