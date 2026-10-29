-- Terminal Operating System: staff type the substitute bus's plate when swapping.
--
-- tos_swap_plate() used the plate the camera read. Staff now enter the plate
-- on the bus themselves (which also covers a misread). The entered plate must
-- be an approved vehicle with valid documents, then Trip Scheduling's
-- staff_set_booking_plate() applies its own checks as before. The gate event
-- keeps the camera read in `plate` and the entered plate in `swapped_to`.

alter table tos.gate_events add column if not exists swapped_to text;

drop function if exists public.tos_swap_plate(bigint, uuid);

create or replace function public.tos_swap_plate(p_event bigint, p_booking uuid, p_plate text)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  ev    tos.gate_events;
  t     record;
  v     record;
  today date := (now() at time zone 'Asia/Manila')::date;
  norm  text := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can swap a plate at the gate';
  end if;
  if norm = '' then raise exception 'Enter the plate number on the bus'; end if;

  select * into ev from tos.gate_events where id = p_event for update;
  if not found or not ev.pending then raise exception 'This vehicle was already decided'; end if;

  select f.* into t from public.tos_trip_feed(today) f where f.booking_id = p_booking;
  if t.booking_id is null then raise exception 'That trip is not an approved trip for today'; end if;
  if exists (select 1 from tos.trip_state s where s.booking_id = p_booking and (s.arrived_at is not null or s.denied)) then
    raise exception 'That trip''s bus has already been let in or refused';
  end if;

  select * into v from public.tos_vehicle_lookup(norm);
  if v.plate_no is null then
    raise exception 'Plate % is not in the approved vehicle masterfile', norm;
  end if;
  if v.orcr_validity < today then
    raise exception 'Plate % has an expired OR/CR (%)', norm, to_char(v.orcr_validity, 'YYYY-MM-DD');
  end if;
  if v.cpc_validity < today then
    raise exception 'Plate % has an expired CPC (%)', norm, to_char(v.cpc_validity, 'YYYY-MM-DD');
  end if;
  if t.plate_no = norm then
    raise exception 'Plate % is already on %', norm, coalesce(t.trip_number, 'that trip');
  end if;

  if ev.is_test then
    -- A test read must not change a real booking: run Trip Scheduling's
    -- checks, then roll the change back. Its refusals still come through.
    begin
      perform public.staff_set_booking_plate(p_booking, norm);
      raise exception using errcode = 'P0042', message = 'tos test swap rolled back';
    exception when sqlstate 'P0042' then null;
    end;
  else
    perform public.staff_set_booking_plate(p_booking, norm);
  end if;

  update tos.gate_events
     set pending = false, resolution = 'ALLOWED', resolved_at = now(), resolved_by = auth.uid(),
         barrier_opened = true, booking_id = t.booking_id, trip_number = t.trip_number, route = t.route,
         swapped_from = coalesce(t.plate_no, 'none'),
         swapped_to = norm,
         reason = (case when ev.is_test
             then format('Test: swap of %s onto %s passed Trip Scheduling''s checks; booking left unchanged', norm, coalesce(t.trip_number, t.route))
             else format('Substitute bus: %s swapped onto %s (was %s)', norm, coalesce(t.trip_number, t.route), coalesce(t.plate_no, 'no plate'))
           end)
           || case when norm <> ev.plate then format('. Camera read %s', ev.plate) else '' end
   where id = p_event
  returning * into ev;

  insert into tos.trip_state as s (booking_id, arrived_at, held, denied, is_test, updated_at)
  values (p_booking, now(), false, false, ev.is_test, now())
  on conflict (booking_id) do update
    set arrived_at = coalesce(s.arrived_at, now()), held = false, denied = false,
        is_test = s.is_test and ev.is_test, updated_at = now();

  return to_jsonb(ev);
end $$;

revoke all on function public.tos_swap_plate(bigint, uuid, text) from public, anon;
grant execute on function public.tos_swap_plate(bigint, uuid, text) to authenticated;
