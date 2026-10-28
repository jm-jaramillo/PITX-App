-- Trip Scheduling: read-only feed for the Terminal Operating System module.
--
-- CONTRIBUTING.md: modules never query each other's tables. TOS needs the
-- day's approved trips and the vehicle masterfile to decide what to do with a
-- bus at the gate, so Trip Scheduling exposes exactly that through these
-- staff-only functions. TOS calls them; it never reads public.bookings or
-- public.vehicles itself.
--
-- A trip's departure (ETD) is its slot start, the same moment slot_start_at()
-- returns and the trip number encodes (slot 32 = 08:00 = "BIA0800").

-- Approved trips for one terminal day, with their bay.
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
   where public.is_staff()
     and b.booking_date = p_date
     and b.status = 'approved'
   order by b.slot, b.route;
$$;

-- Approved vehicles: what the gate checks a plate against.
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
   where public.is_staff()
     and v.status = 'approved'
   order by p.operator_name, v.plate_no;
$$;

-- One plate, as read by a gate camera (spaces and dashes ignored).
create or replace function public.tos_vehicle_lookup(p_plate text)
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
  select m.*
    from public.tos_vehicle_masterfile() m
   where m.plate_no = upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'))
   limit 1;
$$;

revoke all on function public.tos_trip_feed(date) from public, anon;
revoke all on function public.tos_vehicle_masterfile() from public, anon;
revoke all on function public.tos_vehicle_lookup(text) from public, anon;
grant execute on function public.tos_trip_feed(date) to authenticated;
grant execute on function public.tos_vehicle_masterfile() to authenticated;
grant execute on function public.tos_vehicle_lookup(text) to authenticated;
