-- Trip Scheduling: staff_list_booking_vehicles also returns each vehicle's trade name.
--
-- After accounts are merged (202611191000) one operator login holds vehicles of
-- several trades; the Schedule page's Edit trip dialog groups its plate list by
-- trade name, so the list needs the column. Same rows and rules as before.

drop function if exists public.staff_list_booking_vehicles(uuid, text);

create or replace function public.staff_list_booking_vehicles(p_booking_id uuid, p_username text default null)
returns table (plate_no text, body_number text, route text, trade_name text)
language sql
security definer
set search_path = public
stable
as $$
  select v.plate_no, v.body_number, v.route, v.trade_name
  from public.bookings k
  join public.profiles p
    on p.role = 'operator'
   and (case when p_username is null then p.id = k.operator_id
             else lower(p.username) = lower(btrim(p_username)) end)
  join public.vehicles v on v.operator_id = p.id
  where public.is_staff()
    and k.id = p_booking_id
    and v.status = 'approved'
    and (v.ltfrb_status is null or v.ltfrb_status in ('active', 'ltfrb_verified'))
    and (v.cpc_validity is null or v.cpc_validity >= current_date)
    and (not v.cpc_eov or v.cpc_eov_validity is null or v.cpc_eov_validity >= current_date)
    and (case when p_username is null
             then public.vehicle_matches_route(v.route, k.route)
             else public.vehicle_fits_transfer(v.route, k.route) end)
  order by (v.route = k.route) desc, v.route, v.plate_no;
$$;

revoke all on function public.staff_list_booking_vehicles(uuid, text) from public, anon;
grant execute on function public.staff_list_booking_vehicles(uuid, text) to authenticated;

notify pgrst, 'reload schema';
