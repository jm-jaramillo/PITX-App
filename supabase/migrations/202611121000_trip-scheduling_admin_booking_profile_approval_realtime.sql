-- Trip Scheduling: admin booking and editing, profile-change approval, live updates.
--
-- 1. staff_create_booking   - staff book trips on an operator's behalf (approved straight
--                             away, bay picked by the balanced-assignment trigger).
-- 2. staff_edit_booking     - staff change a trip's destination, date, time or plate.
-- 3. Operator profile changes now need staff approval:
--      operator_profile_changes (pending / approved / rejected),
--      request_operator_profile_change  (operator),
--      decide_operator_profile_change   (staff approves / rejects),
--      staff_update_operator_profile    (staff edit, applied at once).
--    Operators can no longer write operator_profiles directly; every change goes
--    through these functions. A profile that does not exist yet is created
--    immediately (nothing to protect); after that it is request -> approval.
-- 4. Realtime: the tables the pages watch are added to the supabase_realtime
--    publication so screens update without a refresh. RLS still decides who
--    receives which row.

/* ------------------------------------------------------------ 1. book */

create or replace function public.staff_create_booking(
  p_operator_id uuid,
  p_route       text,
  p_dates       date[],
  p_slot        smallint,
  p_plate_no    text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op     public.profiles%rowtype;
  v_plate  text := nullif(btrim(coalesce(p_plate_no, '')), '');
  v_norm   text;
  v_date   date;
  v_id     uuid;
  v_n      integer := 0;
begin
  if not public.is_staff() then
    raise exception 'Only staff can book a trip for an operator.';
  end if;
  select * into v_op from public.profiles where id = p_operator_id and role = 'operator';
  if v_op.id is null then raise exception 'Operator not found.'; end if;
  if nullif(btrim(coalesce(p_route, '')), '') is null then raise exception 'Pick a destination.'; end if;
  if p_slot is null or p_slot < 0 or p_slot > 95 then raise exception 'Pick a time between 00:00 and 23:45.'; end if;
  if p_dates is null or cardinality(p_dates) = 0 then raise exception 'Pick at least one date.'; end if;
  if cardinality(p_dates) > 60 then raise exception 'Book at most 60 dates at a time.'; end if;

  if v_plate is not null then
    v_norm := regexp_replace(upper(v_plate), '[^A-Z0-9]', '', 'g');
    select v.plate_no into v_plate
    from public.vehicles v
    where v.operator_id = p_operator_id and v.status = 'approved'
      and (v.ltfrb_status is null or v.ltfrb_status in ('active', 'ltfrb_verified'))
      and (v.cpc_validity is null or v.cpc_validity >= current_date)
      and (not v.cpc_eov or v.cpc_eov_validity is null or v.cpc_eov_validity >= current_date)
      and regexp_replace(upper(v.plate_no), '[^A-Z0-9]', '', 'g') = v_norm
      and public.vehicle_matches_route(v.route, p_route)
    limit 1;
    if v_plate is null then
      raise exception 'That vehicle isn''t registered to % for %, or its CPC has expired.',
        coalesce(v_op.operator_name, v_op.username), p_route;
    end if;
  end if;

  foreach v_date in array p_dates loop
    if public.slot_start_at(v_date, p_slot) < now() then
      raise exception '% at that time has already passed.', v_date;
    end if;
    if v_plate is not null and exists (
      select 1 from public.bookings b2
      where b2.operator_id = p_operator_id and b2.status in ('pending', 'approved')
        and b2.booking_date = v_date and abs(b2.slot - p_slot) = 1
        and regexp_replace(upper(b2.plate_no), '[^A-Z0-9]', '', 'g') = v_norm
    ) then
      raise exception 'That vehicle already has a booking in the adjacent time slot on %.', v_date;
    end if;

    insert into public.bookings (operator_id, operator_name, route, booking_date, slot, status, plate_no)
    values (p_operator_id, coalesce(v_op.operator_name, v_op.username), btrim(p_route), v_date, p_slot, 'pending', v_plate)
    returning id into v_id;

    -- approved straight away: staff made the booking, so there is nothing to review
    update public.bookings
       set status = 'approved', decided_by = auth.uid(), decided_at = now()
     where id = v_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.staff_create_booking(uuid, text, date[], smallint, text) from public, anon;
grant execute on function public.staff_create_booking(uuid, text, date[], smallint, text) to authenticated;

/* ------------------------------------------------------------ 2. edit */

create or replace function public.staff_edit_booking(
  p_booking_id uuid,
  p_route      text,
  p_date       date,
  p_slot       smallint,
  p_plate_no   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b      public.bookings%rowtype;
  v_route  text := nullif(btrim(coalesce(p_route, '')), '');
  v_plate  text := nullif(btrim(coalesce(p_plate_no, '')), '');
  v_norm   text;
  v_moved  boolean;
begin
  if not public.is_staff() then raise exception 'Only staff can edit a trip.'; end if;
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'Booking not found.'; end if;
  if v_b.status not in ('pending', 'approved') then raise exception 'Only a pending or approved trip can be edited.'; end if;
  if v_route is null or p_date is null or p_slot is null or p_slot < 0 or p_slot > 95 then
    raise exception 'Destination, date and time are required.';
  end if;

  v_moved := v_route is distinct from v_b.route or p_date <> v_b.booking_date or p_slot <> v_b.slot;
  if v_moved and public.slot_start_at(p_date, p_slot) < now() then
    raise exception 'That date and time has already passed.';
  end if;

  if v_plate is not null then
    v_norm := regexp_replace(upper(v_plate), '[^A-Z0-9]', '', 'g');
    select v.plate_no into v_plate
    from public.vehicles v
    where v.operator_id = v_b.operator_id and v.status = 'approved'
      and (v.ltfrb_status is null or v.ltfrb_status in ('active', 'ltfrb_verified'))
      and (v.cpc_validity is null or v.cpc_validity >= current_date)
      and (not v.cpc_eov or v.cpc_eov_validity is null or v.cpc_eov_validity >= current_date)
      and regexp_replace(upper(v.plate_no), '[^A-Z0-9]', '', 'g') = v_norm
      and public.vehicle_matches_route(v.route, v_route)
    limit 1;
    if v_plate is null then
      raise exception 'That vehicle isn''t registered to this operator for % (or its CPC has expired). Pick another plate or clear it.', v_route;
    end if;
    if exists (
      select 1 from public.bookings b2
      where b2.id <> p_booking_id and b2.operator_id = v_b.operator_id
        and b2.status in ('pending', 'approved') and b2.booking_date = p_date
        and abs(b2.slot - p_slot) = 1
        and regexp_replace(upper(b2.plate_no), '[^A-Z0-9]', '', 'g') = v_norm
    ) then
      raise exception 'That vehicle already has a booking in the adjacent time slot on this date.';
    end if;
  end if;

  update public.bookings set
    route           = v_route,
    booking_date    = p_date,
    slot            = p_slot,
    plate_no        = v_plate,
    -- a new place or time needs a fresh bay; the balanced-assignment trigger
    -- picks one for the new slot when this is cleared
    assigned_bay_id = case when v_moved then null else assigned_bay_id end,
    trip_number     = case when v_moved and status = 'approved'
                           then public.compute_trip_number(v_route, p_slot, p_date, id)
                           else trip_number end,
    last_edited_at  = now()
  where id = p_booking_id;

  if v_moved then
    insert into public.notifications (recipient_role, recipient_id, type, title, body, link, related_table, related_id)
    values ('operator', v_b.operator_id, 'trip_edited', 'Your trip was changed by PITX staff',
            v_route || ' on ' || p_date || ' at '
              || to_char(public.slot_start_at(p_date, p_slot) at time zone 'Asia/Manila', 'HH24:MI') || '.',
            'my-schedule.html', 'bookings', v_b.id)
    on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.staff_edit_booking(uuid, text, date, smallint, text) from public, anon;
grant execute on function public.staff_edit_booking(uuid, text, date, smallint, text) to authenticated;

/* ------------------------------------------- 3. profile change approval */

create table if not exists public.operator_profile_changes (
  id           uuid primary key default gen_random_uuid(),
  operator_id  uuid not null references public.profiles(id) on delete cascade,
  changes      jsonb not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz,
  reject_reason text
);
create unique index if not exists operator_profile_changes_one_pending
  on public.operator_profile_changes (operator_id) where status = 'pending';
create index if not exists operator_profile_changes_decided_by_idx
  on public.operator_profile_changes (decided_by);

alter table public.operator_profile_changes enable row level security;
drop policy if exists operator_profile_changes_select on public.operator_profile_changes;
create policy operator_profile_changes_select on public.operator_profile_changes
  for select using (operator_id = (select auth.uid()) or (select public.is_staff()));
-- no insert/update/delete policies: only the functions below write to it

-- applies a full profile snapshot (the profile form always sends every field)
create or replace function public.apply_operator_profile(p_operator uuid, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contacts jsonb := case when jsonb_typeof(p_changes->'contacts') = 'array'
                           then p_changes->'contacts' else '[]'::jsonb end;
  v_system   text := nullif(btrim(coalesce(p_changes->>'booking_system_name', '')), '');
begin
  if jsonb_array_length(v_contacts) > 5 then
    raise exception 'You can add up to 5 contact persons.';
  end if;
  insert into public.operator_profiles
    (operator_id, company_name, trade_name, operator_code, company_owner,
     booking_system_name, has_booking_system, logo_path, contacts)
  values (p_operator,
          nullif(btrim(coalesce(p_changes->>'company_name', '')), ''),
          nullif(btrim(coalesce(p_changes->>'trade_name', '')), ''),
          nullif(btrim(coalesce(p_changes->>'operator_code', '')), ''),
          nullif(btrim(coalesce(p_changes->>'company_owner', '')), ''),
          v_system, v_system is not null,
          nullif(btrim(coalesce(p_changes->>'logo_path', '')), ''),
          v_contacts)
  on conflict (operator_id) do update set
    company_name        = excluded.company_name,
    trade_name          = excluded.trade_name,
    operator_code       = excluded.operator_code,
    company_owner       = excluded.company_owner,
    booking_system_name = excluded.booking_system_name,
    has_booking_system  = excluded.has_booking_system,
    logo_path           = excluded.logo_path,
    contacts            = excluded.contacts;
end;
$$;
revoke all on function public.apply_operator_profile(uuid, jsonb) from public, anon, authenticated;

create or replace function public.request_operator_profile_change(p_changes jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
  v_cid  uuid;
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid and role = 'operator') then
    raise exception 'Only operators can request a profile change.';
  end if;

  -- first-ever profile: nothing exists to protect, so it is saved straight away
  if not exists (select 1 from public.operator_profiles where operator_id = v_uid) then
    perform public.apply_operator_profile(v_uid, p_changes);
    return 'applied';
  end if;

  delete from public.operator_profile_changes where operator_id = v_uid and status = 'pending';
  insert into public.operator_profile_changes (operator_id, changes) values (v_uid, p_changes)
  returning id into v_cid;

  select coalesce(operator_name, username) into v_name from public.profiles where id = v_uid;
  insert into public.notifications (recipient_role, type, title, body, link, related_table, related_id)
  values ('staff', 'profile_change_pending', 'Operator profile change to review',
          v_name, 'approvals.html?type=profiles', 'operator_profile_changes', v_cid)
  on conflict do nothing;
  return 'pending';
end;
$$;
revoke all on function public.request_operator_profile_change(jsonb) from public, anon;
grant execute on function public.request_operator_profile_change(jsonb) to authenticated;

create or replace function public.decide_operator_profile_change(
  p_change_id uuid,
  p_approve   boolean,
  p_reason    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.operator_profile_changes%rowtype;
begin
  if not public.is_staff() then raise exception 'Only staff can decide on a profile change.'; end if;
  select * into v_c from public.operator_profile_changes where id = p_change_id and status = 'pending' for update;
  if v_c.id is null then raise exception 'Change not found or already decided.'; end if;

  if p_approve then
    perform public.apply_operator_profile(v_c.operator_id, v_c.changes);
  end if;
  update public.operator_profile_changes
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(),
         reject_reason = case when p_approve then null else nullif(btrim(coalesce(p_reason, '')), '') end
   where id = p_change_id;

  insert into public.notifications (recipient_role, recipient_id, type, title, body, link, related_table, related_id)
  values ('operator', v_c.operator_id,
          case when p_approve then 'profile_change_approved' else 'profile_change_rejected' end,
          case when p_approve then 'Profile change approved' else 'Profile change declined' end,
          case when p_approve then 'Your updated operator profile is now live.'
               else coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'PITX staff declined your profile change.') end,
          'operator-profile.html', 'operator_profile_changes', v_c.id)
  on conflict do nothing;
end;
$$;
revoke all on function public.decide_operator_profile_change(uuid, boolean, text) from public, anon;
grant execute on function public.decide_operator_profile_change(uuid, boolean, text) to authenticated;

create or replace function public.staff_update_operator_profile(p_operator_id uuid, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Only staff can edit an operator profile.'; end if;
  if not exists (select 1 from public.profiles where id = p_operator_id and role = 'operator') then
    raise exception 'Operator not found.';
  end if;
  perform public.apply_operator_profile(p_operator_id, p_changes);

  -- a staff edit supersedes anything the operator had waiting
  update public.operator_profile_changes
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
         reject_reason = 'Superseded by an edit from PITX staff.'
   where operator_id = p_operator_id and status = 'pending';

  insert into public.notifications (recipient_role, recipient_id, type, title, body, link, related_table, related_id)
  values ('operator', p_operator_id, 'profile_edited', 'Your operator profile was updated',
          'PITX staff updated your operator profile.', 'operator-profile.html', 'operator_profiles', p_operator_id)
  on conflict do nothing;
end;
$$;
revoke all on function public.staff_update_operator_profile(uuid, jsonb) from public, anon;
grant execute on function public.staff_update_operator_profile(uuid, jsonb) to authenticated;

-- operators no longer write their profile directly
drop policy if exists operator_profiles_insert_own on public.operator_profiles;
drop policy if exists operator_profiles_update_own on public.operator_profiles;

/* -------------------------------------------------------- 4. realtime */

do $$
declare t text;
begin
  foreach t in array array['bookings', 'vehicles', 'notifications', 'booking_transfers',
                           'operator_profiles', 'operator_profile_changes', 'bays', 'profiles']
  loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
