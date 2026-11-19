-- Trip Scheduling: staff can merge one bus-operator account into another.
--
-- Some operators hold several lines/trades under separate accounts but only
-- one person manages the fleet. staff_merge_operators() folds the SOURCE
-- account into the TARGET account so everything lives under one login:
--
--   * vehicles                 -> re-pointed to the target
--   * bookings                 -> re-pointed; operator_name snapshot follows the
--                                 target (previous_operator_name is left alone)
--   * booking_transfers        -> from/to re-pointed; a pending transfer that
--                                 would now be target -> target is rejected
--   * notifications            -> re-pointed
--   * operator_profile         -> the target's is kept; if the target has none
--                                 the source's is moved over. The source's
--                                 pending profile change is dropped.
--   * ticketing.companies      -> re-pointed (when the ticketing schema exists)
--
-- The source account itself is NOT deleted here (that needs the auth Admin API,
-- so the Accounts page calls the existing delete-account function afterwards).
-- It is left empty and can no longer own anything.
--
-- Refuses to run if both accounts have a vehicle with the same plate: that is
-- a data question for staff (which record is right?), not something to guess.
-- Everything runs in one transaction - any failure rolls the whole merge back.

-- ---------------------------------------------------------------- preview
create or replace function public.staff_merge_operators_preview(
  p_source uuid,
  p_target uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_src public.profiles%rowtype;
  v_tgt public.profiles%rowtype;
begin
  if not public.is_staff() then
    raise exception 'Only staff can merge operator accounts.';
  end if;
  select * into v_src from public.profiles where id = p_source and role = 'operator';
  select * into v_tgt from public.profiles where id = p_target and role = 'operator';
  if v_src.id is null or v_tgt.id is null then
    raise exception 'Both accounts must be bus-operator accounts.';
  end if;
  if v_src.id = v_tgt.id then
    raise exception 'Pick two different accounts.';
  end if;

  return jsonb_build_object(
    'source', coalesce(v_src.operator_name, v_src.username),
    'target', coalesce(v_tgt.operator_name, v_tgt.username),
    'vehicles',  (select count(*) from public.vehicles  where operator_id = p_source),
    'bookings',  (select count(*) from public.bookings  where operator_id = p_source),
    'transfers', (select count(*) from public.booking_transfers
                   where from_operator_id = p_source or to_operator_id = p_source),
    'duplicate_plates', coalesce((
      select jsonb_agg(sv.plate_no order by sv.plate_no)
      from public.vehicles sv
      join public.vehicles tv
        on tv.operator_id = p_target
       and regexp_replace(upper(tv.plate_no), '[^A-Z0-9]', '', 'g')
         = regexp_replace(upper(sv.plate_no), '[^A-Z0-9]', '', 'g')
      where sv.operator_id = p_source
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_merge_operators_preview(uuid, uuid) from public, anon;
grant execute on function public.staff_merge_operators_preview(uuid, uuid) to authenticated;

-- ------------------------------------------------------------------ merge
create or replace function public.staff_merge_operators(
  p_source uuid,
  p_target uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src      public.profiles%rowtype;
  v_tgt      public.profiles%rowtype;
  v_dups     text;
  v_name     text;
  n_vehicles int;
  n_bookings int;
  n_transfers int;
  n_notifs   int;
begin
  if not public.is_staff() then
    raise exception 'Only staff can merge operator accounts.';
  end if;

  -- lock both rows so two staff can't merge the same account at once
  select * into v_src from public.profiles where id = p_source and role = 'operator' for update;
  select * into v_tgt from public.profiles where id = p_target and role = 'operator' for update;
  if v_src.id is null or v_tgt.id is null then
    raise exception 'Both accounts must be bus-operator accounts.';
  end if;
  if v_src.id = v_tgt.id then
    raise exception 'Pick two different accounts.';
  end if;

  v_name := coalesce(v_tgt.operator_name, v_tgt.username);

  select string_agg(sv.plate_no, ', ' order by sv.plate_no) into v_dups
  from public.vehicles sv
  join public.vehicles tv
    on tv.operator_id = p_target
   and regexp_replace(upper(tv.plate_no), '[^A-Z0-9]', '', 'g')
     = regexp_replace(upper(sv.plate_no), '[^A-Z0-9]', '', 'g')
  where sv.operator_id = p_source;
  if v_dups is not null then
    raise exception
      'Both accounts have a vehicle with the same plate (%). Remove the duplicate from one account first.',
      v_dups;
  end if;

  -- vehicles
  update public.vehicles set operator_id = p_target where operator_id = p_source;
  get diagnostics n_vehicles = row_count;

  -- bookings (status untouched, so the pending/decided notification triggers stay quiet)
  update public.bookings
     set operator_id   = p_target,
         operator_name = v_name
   where operator_id = p_source;
  get diagnostics n_bookings = row_count;

  -- transfers: a pending hand-off between the two merged accounts is now moot
  update public.booking_transfers
     set status = 'rejected',
         rejection_reason = 'Operator accounts were merged',
         decided_by = auth.uid(),
         decided_at = now()
   where status = 'pending'
     and ((from_operator_id = p_source and to_operator_id = p_target)
       or (from_operator_id = p_target and to_operator_id = p_source));
  update public.booking_transfers set from_operator_id = p_target where from_operator_id = p_source;
  update public.booking_transfers set to_operator_id   = p_target where to_operator_id   = p_source;
  get diagnostics n_transfers = row_count;

  -- notifications
  update public.notifications set recipient_id = p_target where recipient_id = p_source;
  get diagnostics n_notifs = row_count;

  -- company profile: keep the target's; adopt the source's only if the target has none
  delete from public.operator_profile_changes where operator_id = p_source and status = 'pending';
  update public.operator_profile_changes set operator_id = p_target where operator_id = p_source;
  if not exists (select 1 from public.operator_profiles where operator_id = p_target) then
    update public.operator_profiles set operator_id = p_target where operator_id = p_source;
  end if;

  -- ticketing company link (schema may not exist on every environment)
  if to_regclass('ticketing.companies') is not null then
    execute 'update ticketing.companies set operator_id = $1 where operator_id = $2'
      using p_target, p_source;
  end if;

  insert into public.notifications (recipient_role, recipient_id, type, title, body, link)
  values ('operator', p_target, 'operators_merged',
          'Operator accounts merged',
          coalesce(v_src.operator_name, v_src.username)
            || ' was merged into this account by PITX staff. Its vehicles and trips are now here.',
          'operator-overview.html');

  return jsonb_build_object(
    'source', coalesce(v_src.operator_name, v_src.username),
    'source_username', v_src.username,
    'target', v_name,
    'vehicles', n_vehicles,
    'bookings', n_bookings
  );
end;
$$;

revoke all on function public.staff_merge_operators(uuid, uuid) from public, anon;
grant execute on function public.staff_merge_operators(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
