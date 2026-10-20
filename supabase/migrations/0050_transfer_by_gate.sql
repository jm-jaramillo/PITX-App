-- Transfers by gate instead of by route.
--
-- A transfer used to be limited to operators with an approved vehicle on the
-- booking's exact route (0032). That is narrower than how the terminal
-- actually works - the bay is assigned by GATE, and any bus serving a route
-- on the same gate can take the slot. So the receiving operator, and the
-- plate they pick, now only have to be registered for a route on the SAME
-- GATE as the booking's route (the same route still qualifies, of course).
--
-- 1. route_gates: the route -> gate map, which until now lived only in the
--    browser (ROUTE_GATES in docs/assets/app.js, generated from the
--    Vehicle Masterlist). The database needs it to enforce the rule.
--    scripts/import-vehicle-masterlist.mjs rewrites it alongside
--    route_trip_codes. A route with no gate falls back to exact-route.
-- 2. vehicle_fits_transfer(vehicle_route, booking_route): one rule used by
--    the lists and by the enforcement below.
-- 3. list_operator_accounts / list_operator_vehicles: widened to the gate
--    (list_operator_vehicles also returns each vehicle's route, so the
--    sender can see where the bus normally runs).
-- 4. request_booking_transfer: re-validates with the same rule - the real
--    gate, the dropdowns are UX.
-- 5. request_booking_change: a plate that arrived through a gate-wide
--    transfer stays valid while the booking's route is unchanged.
--    Without this, the new owner could not change the booking's time
--    afterwards. Choosing a *different* plate still has to match the route
--    exactly - the booking form itself is unchanged.
--
-- Run after 0049.

create table if not exists public.route_gates (
  route text primary key,
  gate  text not null
);
alter table public.route_gates enable row level security;
drop policy if exists route_gates_select on public.route_gates;
create policy route_gates_select on public.route_gates
  for select using (auth.uid() is not null);

delete from public.route_gates;
insert into public.route_gates (route, gate) values
  ('BAGAMANOC', 'Gate 4'),
  ('BAGUIO CITY', 'Gate 5'),
  ('BALANGA, BATAAN', 'Gate 5'),
  ('BALATAN', 'Gate 4'),
  ('BALAYAN', 'Gate 2'),
  ('BANAUE, IFUGAO', 'Gate 5'),
  ('BARAS, CATANDUANES', 'Gate 4'),
  ('BATANGAS CITY', 'Gate 2'),
  ('BATANGAS CITY (PIER)', 'Gate 2'),
  ('BATANGAS CITY PIER (BATANGAS) - PLAZA LAWTON (MANILA)', 'Gate 2'),
  ('BAUAN, BATANGAS', 'Gate 2'),
  ('BIÑAN, LAGUNA', 'Gate 2'),
  ('BORONGAN, E. SAMAR', 'Gate 4'),
  ('BUHI', 'Gate 4'),
  ('BUHI NABUA', 'Gate 4'),
  ('BULAN', 'Gate 4'),
  ('BUTUAN CITY', 'Gate 4'),
  ('CAGAYAN DE ORO', 'Gate 4'),
  ('CALATAGAN', 'Gate 2'),
  ('CALBAYOG CITY', 'Gate 4'),
  ('CARAMOAN', 'Gate 4'),
  ('CATANDUANES', 'Gate 4'),
  ('CATARMAN, N. SAMAR', 'Gate 4'),
  ('CEBU CITY', 'Gate 4'),
  ('CLARK INTERNATIONAL AIRPORT', 'Gate 5'),
  ('DAET', 'Gate 4'),
  ('DAGUPAN CITY', 'Gate 5'),
  ('DAVAO CITY', 'Gate 4'),
  ('DONSOL, SORSOGON', 'Gate 4'),
  ('GARCHITORENA', 'Gate 4'),
  ('GENERAL SANTOS CITY', 'Gate 4'),
  ('GUBAT', 'Gate 4'),
  ('GUIMARAS ISLAND', 'Gate 4'),
  ('GUIUAN, E. SAMAR', 'Gate 4'),
  ('ILO-ILO CITY', 'Gate 4'),
  ('IRIGA CITY', 'Gate 4'),
  ('JOSE PANGANIBAN', 'Gate 4'),
  ('LAGANGILANG', 'Gate 5'),
  ('LAGONOY', 'Gate 4'),
  ('LAOAG CITY', 'Gate 5'),
  ('LEGAZPI CITY', 'Gate 4'),
  ('LEMERY, BATANGAS', 'Gate 2'),
  ('LILOAN', 'Gate 4'),
  ('LIPA CITY', 'Gate 2'),
  ('MAASIN CITY', 'Gate 4'),
  ('MAGALLANES', 'Gate 4'),
  ('MANDAON, MASBATE', 'Gate 4'),
  ('MARIVELES, BATAAN', 'Gate 5'),
  ('MASBATE', 'Gate 4'),
  ('MASBATE CITY', 'Gate 4'),
  ('MATNOG', 'Gate 4'),
  ('NAGA CITY', 'Gate 4'),
  ('NAGA, CAMARINES NORTE', 'Gate 4'),
  ('NASUGBU', 'Gate 2'),
  ('NEGROS OCCI.', 'Gate 4'),
  ('OLONGAPO CITY', 'Gate 5'),
  ('ORAS, E. SAMAR', 'Gate 4'),
  ('ORMOC CITY', 'Gate 4'),
  ('PACITA COMPLEX', 'Gate 2'),
  ('PALOMPON, LEYTE', 'Gate 4'),
  ('PARACALE, CAMARINES NORTE', 'Gate 4'),
  ('PASACAO', 'Gate 4'),
  ('PILAR, SORSOGON', 'Gate 4'),
  ('PIO DURAN', 'Gate 4'),
  ('PLACER, MASBATE', 'Gate 4'),
  ('PRESENTACION', 'Gate 4'),
  ('PRIETO DIAZ, SORSOGON', 'Gate 4'),
  ('RAWIS, LAOANG', 'Gate 4'),
  ('SABANG', 'Gate 4'),
  ('SAN CARLOS CITY', 'Gate 5'),
  ('SAN JOSE CITY, NUEVA ECIJA', 'Gate 5'),
  ('SAN JOSE, DINAGAT ISLANDS', 'Gate 4'),
  ('SAN JOSE, OCC. MINDORO', 'Gate 2'),
  ('SAN JUAN, BATANGAS', 'Gate 2'),
  ('SILAGO', 'Gate 4'),
  ('SORSOGON CITY', 'Gate 4'),
  ('STA. ANA', 'Gate 5'),
  ('STA. CRUZ, LAGUNA', 'Gate 2'),
  ('STA. ELENA', 'Gate 4'),
  ('STA. ROSA, LAGUNA', 'Gate 2'),
  ('TABACO CITY', 'Gate 4'),
  ('TACLOBAN CITY', 'Gate 4'),
  ('TAGBILARAN, BOHOL', 'Gate 4'),
  ('TAGUM CITY, DAVAO DEL NORTE', 'Gate 4'),
  ('TIWI', 'Gate 4'),
  ('TUGUEGARAO CITY', 'Gate 5'),
  ('VIGA, CATANDUANES', 'Gate 4'),
  ('VIRAC', 'Gate 4');

create or replace function public.route_gate(p_route text)
returns text
language sql
stable
set search_path = public
as $$
  select gate from public.route_gates where route = p_route;
$$;

create or replace function public.vehicle_fits_transfer(p_vehicle_route text, p_booking_route text)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_vehicle_route is not null
     and p_booking_route is not null
     and (
       p_vehicle_route = p_booking_route
       or (
         public.route_gate(p_booking_route) is not null
         and public.route_gate(p_vehicle_route) = public.route_gate(p_booking_route)
       )
     );
$$;

revoke all on function public.route_gate(text) from public, anon;
revoke all on function public.vehicle_fits_transfer(text, text) from public, anon;
grant execute on function public.route_gate(text) to authenticated;
grant execute on function public.vehicle_fits_transfer(text, text) to authenticated;

create or replace function public.list_operator_accounts(p_route text)
returns table (username text, operator_name text)
language sql
security definer
set search_path = public
stable
as $$
  select p.username, p.operator_name
  from public.profiles p
  where p.role = 'operator'
    and p.id <> auth.uid()
    and exists (
      select 1 from public.vehicles v
      where v.operator_id = p.id
        and v.status = 'approved'
        and (v.ltfrb_status is null or v.ltfrb_status in ('active', 'ltfrb_verified'))
        and (v.cpc_validity is null or v.cpc_validity >= current_date)
        and (not v.cpc_eov or v.cpc_eov_validity is null or v.cpc_eov_validity >= current_date)
        and public.vehicle_fits_transfer(v.route, p_route)
    )
  order by coalesce(p.operator_name, p.username);
$$;

drop function if exists public.list_operator_vehicles(text, text);

create function public.list_operator_vehicles(p_username text, p_route text)
returns table (plate_no text, body_number text, route text)
language sql
security definer
set search_path = public
stable
as $$
  select v.plate_no, v.body_number, v.route
  from public.vehicles v
  join public.profiles p on p.id = v.operator_id
  where lower(p.username) = lower(btrim(p_username))
    and p.role = 'operator'
    and v.status = 'approved'
    and (v.ltfrb_status is null or v.ltfrb_status in ('active', 'ltfrb_verified'))
    and (v.cpc_validity is null or v.cpc_validity >= current_date)
    and (not v.cpc_eov or v.cpc_eov_validity is null or v.cpc_eov_validity >= current_date)
    and public.vehicle_fits_transfer(v.route, p_route)
  order by (v.route = p_route) desc, v.route, v.plate_no;
$$;

revoke all on function public.list_operator_vehicles(text, text) from public, anon;
grant execute on function public.list_operator_vehicles(text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.request_booking_transfer(p_booking_id uuid, p_to_username text, p_new_plate_no text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking public.bookings%rowtype;
  v_to_profile public.profiles%rowtype;
  v_from_name text;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id and operator_id = auth.uid()
  for update;

  if v_booking.id is null then
    raise exception 'Booking not found.';
  end if;
  if v_booking.status not in ('pending', 'approved') then
    raise exception 'Only pending or approved bookings can be transferred.';
  end if;
  if public.slot_start_at(v_booking.booking_date, v_booking.slot) < now() + interval '4 hours' then
    raise exception 'This booking starts within 4 hours and can no longer be transferred.';
  end if;
  if exists (
    select 1 from public.booking_transfers
    where booking_id = p_booking_id and status = 'pending'
  ) then
    raise exception 'A transfer for this booking is already awaiting review.';
  end if;

  if coalesce(btrim(p_to_username), '') = '' then
    raise exception 'The receiving operator''s username is required.';
  end if;
  if coalesce(btrim(p_new_plate_no), '') = '' then
    raise exception 'Plate number is required.';
  end if;

  select * into v_to_profile
  from public.profiles
  where lower(username) = lower(btrim(p_to_username)) and role = 'operator';

  if v_to_profile.id is null then
    raise exception 'No operator account found with that username.';
  end if;
  if v_to_profile.id = auth.uid() then
    raise exception 'You can''t transfer a booking to yourself.';
  end if;

  if not exists (
    select 1 from public.vehicles
    where operator_id = v_to_profile.id
      and status = 'approved'
      and lower(plate_no) = lower(btrim(p_new_plate_no))
      and public.vehicle_fits_transfer(route, v_booking.route)
  ) then
    raise exception 'That plate isn''t one of the receiving operator''s approved vehicles registered for this booking''s route or gate.';
  end if;

  select coalesce(operator_name, username) into v_from_name
  from public.profiles where id = auth.uid();

  insert into public.booking_transfers (
    booking_id, from_operator_id, to_operator_id, to_username, new_plate_no, reason,
    booking_date, slot, route, previous_plate_no, from_operator_name
  ) values (
    p_booking_id, auth.uid(), v_to_profile.id, v_to_profile.username,
    btrim(p_new_plate_no), nullif(btrim(coalesce(p_reason, '')), ''),
    v_booking.booking_date, v_booking.slot, v_booking.route, v_booking.plate_no, v_from_name
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_booking_change(p_booking_id uuid, p_route text, p_plate_no text, p_booking_date date, p_slot smallint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking public.bookings%rowtype;
  v_was_approved boolean;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_plate text := nullif(btrim(coalesce(p_plate_no, '')), '');
  v_material boolean;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id and operator_id = auth.uid()
  for update;

  if v_booking.id is null then
    raise exception 'Booking not found.';
  end if;
  if v_booking.status not in ('pending', 'approved') then
    raise exception
      'Only pending or approved bookings can be changed. Submit a new request instead.';
  end if;
  if v_booking.cancellation_requested_at is not null then
    raise exception
      'A cancellation request is pending for this booking - withdraw it first.';
  end if;

  if coalesce(btrim(p_route), '') = '' then
    raise exception 'Route is required.';
  end if;
  if p_slot is null or p_slot < 0 or p_slot > 95 then
    raise exception 'Slot must be between 0 and 95.';
  end if;
  if p_booking_date is null or p_booking_date < v_today then
    raise exception 'Booking date cannot be in the past.';
  end if;

  v_material := (
    btrim(p_route) is distinct from v_booking.route
    or p_booking_date is distinct from v_booking.booking_date
    or p_slot is distinct from v_booking.slot
  );

  if v_material then
    if public.slot_start_at(v_booking.booking_date, v_booking.slot) < now() + interval '2 hours' then
      raise exception
        'This booking starts within 2 hours and can no longer be changed.';
    end if;
    if public.slot_start_at(p_booking_date, p_slot) < now() + interval '2 hours' then
      raise exception 'Please choose a time at least 2 hours from now.';
    end if;
  end if;

  if v_plate is not null then
    if not exists (
      select 1 from public.vehicles v
      where v.operator_id = auth.uid()
        and v.status = 'approved'
        and (v.ltfrb_status is null or v.ltfrb_status in ('active', 'ltfrb_verified'))
        and (v.cpc_validity is null or v.cpc_validity >= current_date)
        and (not v.cpc_eov or v.cpc_eov_validity is null or v.cpc_eov_validity >= current_date)
        and regexp_replace(upper(v.plate_no), '[^A-Z0-9]', '', 'g')
          = regexp_replace(upper(v_plate), '[^A-Z0-9]', '', 'g')
        and (
          public.vehicle_matches_route(v.route, p_route)
          -- A plate that arrived through a gate-wide transfer (#111) belongs
          -- to a vehicle registered for another route on the same gate. It
          -- stays valid while the booking's route is unchanged, so the new
          -- owner can still change the date or time without being told
          -- their own bus isn't registered for the route.
          or (
            btrim(p_route) = v_booking.route
            and regexp_replace(upper(coalesce(v_booking.plate_no, '')), '[^A-Z0-9]', '', 'g')
              = regexp_replace(upper(v_plate), '[^A-Z0-9]', '', 'g')
            and public.vehicle_fits_transfer(v.route, p_route)
          )
        )
    ) then
      raise exception
        'That vehicle isn''t registered for this route (or its CPC has expired). Choose a vehicle registered for %, or pick a different route.', p_route;
    end if;

    -- Same vehicle, adjacent 15-minute slot, same date - the same bus
    -- can't depart on two trips back to back. Checked against the final
    -- date/slot this booking will have (p_booking_date/p_slot - already
    -- equal to the current values when this is a plate-only change).
    if exists (
      select 1 from public.bookings b2
      where b2.id <> p_booking_id
        and b2.operator_id = auth.uid()
        and b2.status in ('pending', 'approved')
        and b2.booking_date = p_booking_date
        and abs(b2.slot - p_slot) = 1
        and regexp_replace(upper(b2.plate_no), '[^A-Z0-9]', '', 'g')
          = regexp_replace(upper(v_plate), '[^A-Z0-9]', '', 'g')
    ) then
      raise exception
        'That vehicle already has a booking in the adjacent time slot on this date - the same vehicle can''t serve two trips back to back.';
    end if;
  end if;

  v_was_approved := (v_booking.status = 'approved');

  if v_material then
    update public.bookings set
      route               = btrim(p_route),
      plate_no            = v_plate,
      booking_date        = p_booking_date,
      slot                = p_slot,
      status              = 'pending',
      assigned_bay_id     = null,
      rejection_reason    = null,
      decided_by          = null,
      decided_at          = null,
      previously_approved = previously_approved or v_was_approved,
      revision_count      = revision_count + 1,
      last_edited_at      = now()
    where id = p_booking_id;
  else
    -- Plate-only update: status, approval and assigned bay are untouched,
    -- and the lead-time check above was skipped entirely.
    update public.bookings set
      plate_no       = v_plate,
      revision_count = revision_count + 1,
      last_edited_at = now()
    where id = p_booking_id;
  end if;
end;
$function$;

notify pgrst, 'reload schema';
