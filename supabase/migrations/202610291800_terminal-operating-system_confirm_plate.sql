-- Terminal Operating System: staff confirm the plate of unregistered / unclear reads.
--
-- An unregistered plate now waits for staff by default (rule on_unregistered
-- = REVIEW) instead of being refused outright. Whether staff let the bus in
-- or keep it out, they must type the plate number on the bus; it is kept in
-- gate_events.confirmed_plate for tracking. The typed plate is checked: if it
-- is a registered bus with a trip due today (the camera misread it), letting
-- it in records the arrival on that trip.

alter table tos.gate_events add column if not exists confirmed_plate text;

alter table tos.rules alter column on_unregistered set default 'REVIEW';
update tos.rules set on_unregistered = 'REVIEW', updated_at = now() where id = 1 and on_unregistered = 'DENY';

create or replace function public.tos_confirm_plate(p_event bigint, p_plate text, p_allow boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  ev     tos.gate_events;
  v      record;
  t      record;
  today  date := (now() at time zone 'Asia/Manila')::date;
  norm   text := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  found_ text;
  note   text;
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can confirm a plate at the gate';
  end if;
  if length(norm) < 2 then raise exception 'Enter the plate number on the bus'; end if;

  select * into ev from tos.gate_events where id = p_event for update;
  if not found or not ev.pending then raise exception 'This vehicle was already decided'; end if;
  if ev.category not in ('Unregistered vehicle', 'Unclear plate read') then
    raise exception 'This read does not need a plate confirmation';
  end if;

  select * into v from public.tos_vehicle_lookup(norm);
  -- Always assigns t (to nulls when nothing matches), so t.* is safe below.
  select f.* into t
    from public.tos_trip_feed(today) f
    left join tos.trip_state s on s.booking_id = f.booking_id
   where v.plate_no is not null
     and f.plate_no = norm
     and s.arrived_at is null and not coalesce(s.denied, false)
     and f.etd >= now() - interval '60 minutes'
   order by abs(extract(epoch from (f.etd - interval '30 minutes' - now())))
   limit 1;

  found_ := case
    when v.plate_no is null then 'not in the vehicle masterfile'
    when v.orcr_validity < today then format('registered to %s, OR/CR expired %s', coalesce(v.operator_name, 'an operator'), v.orcr_validity)
    when v.cpc_validity < today then format('registered to %s, CPC expired %s', coalesce(v.operator_name, 'an operator'), v.cpc_validity)
    when t.booking_id is not null then format('registered to %s, trip %s at %s', coalesce(v.operator_name, 'an operator'),
                                              coalesce(t.trip_number, t.route), to_char(t.etd at time zone 'Asia/Manila', 'HH24:MI'))
    else format('registered to %s, no trip today', coalesce(v.operator_name, 'an operator'))
  end;
  note := format('Staff entered %s: %s', norm, found_)
          || case when norm <> ev.plate then format(' (camera read %s)', ev.plate) else '' end;

  update tos.gate_events
     set pending = false,
         resolution = case when p_allow then 'ALLOWED' else 'DENIED' end,
         resolved_at = now(), resolved_by = auth.uid(),
         barrier_opened = p_allow,
         confirmed_plate = norm,
         booking_id = case when p_allow then t.booking_id else booking_id end,
         trip_number = case when p_allow and t.booking_id is not null then t.trip_number else trip_number end,
         route = case when p_allow and t.booking_id is not null then t.route else route end,
         reason = note
   where id = p_event
  returning * into ev;

  -- Letting in a registered bus that has a trip records the arrival on it.
  -- Keeping it out does not cancel the trip: the bus may come back.
  if p_allow and t.booking_id is not null then
    insert into tos.trip_state as s (booking_id, arrived_at, held, denied, is_test, updated_at)
    values (t.booking_id, now(), false, false, ev.is_test, now())
    on conflict (booking_id) do update
      set arrived_at = coalesce(s.arrived_at, now()), held = false, denied = false,
          is_test = s.is_test and ev.is_test, updated_at = now();
  end if;

  return to_jsonb(ev);
end $$;

revoke all on function public.tos_confirm_plate(bigint, text, boolean) from public, anon;
grant execute on function public.tos_confirm_plate(bigint, text, boolean) to authenticated;
