-- Trip Scheduling: let the TOS device endpoint read the TOS feed.
--
-- The gate devices reach TOS through a Supabase Edge Function (tos-device)
-- that runs with the service role, not as a signed-in staff member. These two
-- read-only feed functions now also answer the service role. Nothing else
-- changes: they still return only approved trips / approved vehicles, and
-- anonymous and operator accounts still get nothing.

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
   where (public.is_staff() or coalesce(auth.jwt() ->> 'role', '') = 'service_role')
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
   where (public.is_staff() or coalesce(auth.jwt() ->> 'role', '') = 'service_role')
     and v.status = 'approved'
   order by p.operator_name, v.plate_no;
$$;

revoke all on function public.tos_trip_feed(date) from public, anon;
revoke all on function public.tos_vehicle_masterfile() from public, anon;
grant execute on function public.tos_trip_feed(date) to authenticated, service_role;
grant execute on function public.tos_vehicle_masterfile() to authenticated, service_role;
grant execute on function public.tos_vehicle_lookup(text) to service_role;
