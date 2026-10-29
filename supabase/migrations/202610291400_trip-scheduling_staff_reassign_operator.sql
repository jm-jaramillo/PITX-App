-- Trip Scheduling: staff can swap a trip to a different bus operator.
--
-- Plate assignment by staff already exists (staff_set_booking_plate, 0045).
-- This adds the other half: hand a pending/approved trip to another operator
-- without the operator-to-operator transfer round-trip (request -> receiver
-- confirms -> staff approve). The bay and the slot stay exactly as they are.
--
-- Same eligibility rule transfers use (0050): the receiving operator and the
-- plate must be registered for a route on the booking's gate (the same route
-- qualifies), and the vehicle's CPC/LTFRB must be valid. A plate is required,
-- because a trip belongs to a vehicle. The old operator's name is kept in
-- previous_operator_name (shown on the booking like a transfer), and both
-- operators are notified.

create or replace function public.staff_reassign_booking(
  p_booking_id  uuid,
  p_to_username text,
  p_plate_no    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_to      public.profiles%rowtype;
  v_plate   text := nullif(btrim(coalesce(p_plate_no, '')), '');
  v_vehicle public.vehicles%rowtype;
  v_norm    text;
begin
  if not public.is_staff() then
    raise exception 'Only staff can move a trip to another operator.';
  end if;
  if v_plate is null then
    raise exception 'Pick the receiving operator''s vehicle (plate number) for this trip.';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'Booking not found.';
  end if;
  if v_booking.status not in ('pending', 'approved') then
    raise exception 'Only a pending or approved trip can be moved to another operator.';
  end if;

  select * into v_to from public.profiles
  where lower(username) = lower(btrim(p_to_username)) and role = 'operator';
  if v_to.id is null then
    raise exception 'Operator not found.';
  end if;
  if v_to.id = v_booking.operator_id then
    raise exception 'That operator already owns this trip.';
  end if;

  v_norm := regexp_replace(upper(v_plate), '[^A-Z0-9]', '', 'g');

  select v.* into v_vehicle
  from public.vehicles v
  where v.operator_id = v_to.id
    and v.status = 'approved'
    and (v.ltfrb_status is null or v.ltfrb_status in ('active', 'ltfrb_verified'))
    and (v.cpc_validity is null or v.cpc_validity >= current_date)
    and (not v.cpc_eov or v.cpc_eov_validity is null or v.cpc_eov_validity >= current_date)
    and regexp_replace(upper(v.plate_no), '[^A-Z0-9]', '', 'g') = v_norm
    and public.vehicle_fits_transfer(v.route, v_booking.route)
  limit 1;
  if v_vehicle.plate_no is null then
    raise exception
      'That vehicle isn''t registered to % for this route''s gate (or its CPC has expired).',
      coalesce(v_to.operator_name, v_to.username);
  end if;

  -- same back-to-back rule as everywhere else: one bus, adjacent slots
  if exists (
    select 1 from public.bookings b2
    where b2.id <> p_booking_id
      and b2.operator_id = v_to.id
      and b2.status in ('pending', 'approved')
      and b2.booking_date = v_booking.booking_date
      and abs(b2.slot - v_booking.slot) = 1
      and regexp_replace(upper(b2.plate_no), '[^A-Z0-9]', '', 'g') = v_norm
  ) then
    raise exception 'That vehicle already has a booking in the adjacent time slot on this date.';
  end if;

  update public.bookings set
    previous_operator_name = v_booking.operator_name,
    previous_trade_name    = v_booking.trade_name,
    operator_id            = v_to.id,
    operator_name          = coalesce(v_to.operator_name, v_to.username),
    plate_no               = v_vehicle.plate_no,   -- trade_name follows via trigger
    last_edited_at         = now()
  where id = p_booking_id;

  insert into public.notifications (recipient_role, recipient_id, type, title, body, link, related_table, related_id)
  values
    ('operator', v_booking.operator_id, 'trip_reassigned',
     'Trip moved to another operator',
     coalesce(v_booking.route, '') || ' on ' || v_booking.booking_date
       || ' was reassigned by PITX staff.',
     'operator-overview.html', 'bookings', v_booking.id),
    ('operator', v_to.id, 'trip_reassigned',
     'A trip was assigned to you',
     coalesce(v_booking.route, '') || ' on ' || v_booking.booking_date
       || ' (plate ' || v_vehicle.plate_no || ').',
     'my-schedule.html', 'bookings', v_booking.id)
  on conflict do nothing;
end;
$$;

revoke all on function public.staff_reassign_booking(uuid, text, text) from public, anon;
grant execute on function public.staff_reassign_booking(uuid, text, text) to authenticated;

-- Staff need the same lists operators get in the transfer dialog, but the
-- existing list_operator_accounts() hides the caller and is only meant for
-- operators. This one lists every operator that could take the booking
-- (an approved, valid vehicle on the booking's gate), staff only.
create or replace function public.staff_list_reassign_operators(p_booking_id uuid)
returns table (username text, operator_name text)
language sql
security definer
set search_path = public
stable
as $$
  select p.username, p.operator_name
  from public.bookings k
  join public.profiles p on p.role = 'operator' and p.id <> k.operator_id
  where public.is_staff()
    and k.id = p_booking_id
    and exists (
      select 1 from public.vehicles v
      where v.operator_id = p.id
        and v.status = 'approved'
        and (v.ltfrb_status is null or v.ltfrb_status in ('active', 'ltfrb_verified'))
        and (v.cpc_validity is null or v.cpc_validity >= current_date)
        and (not v.cpc_eov or v.cpc_eov_validity is null or v.cpc_eov_validity >= current_date)
        and public.vehicle_fits_transfer(v.route, k.route)
    )
  order by p.operator_name;
$$;

revoke all on function public.staff_list_reassign_operators(uuid) from public, anon;
grant execute on function public.staff_list_reassign_operators(uuid) to authenticated;

-- The plate list for the booking's CURRENT operator (assign/change plate
-- without moving the trip): same rule as staff_set_booking_plate.
create or replace function public.staff_list_booking_vehicles(p_booking_id uuid, p_username text default null)
returns table (plate_no text, body_number text, route text)
language sql
security definer
set search_path = public
stable
as $$
  select v.plate_no, v.body_number, v.route
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
