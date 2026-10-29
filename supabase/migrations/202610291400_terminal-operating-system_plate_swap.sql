-- Terminal Operating System: substitute buses (plate swap at the gate).
--
-- A registered bus with valid documents but no trip today used to be refused
-- under "No trip today". When its operator has a trip to the same destination
-- whose entry window is open (or that is overdue), TOS now holds the bus for
-- staff instead (rule on_substitute, default REVIEW). Staff can swap the
-- bus's plate onto that trip, which goes through Trip Scheduling's own
-- staff_set_booking_plate() (same operator, route, CPC and back-to-back
-- checks) and then lets the bus in on that trip. Nobody has to rebook.

alter table tos.rules add column if not exists on_substitute text not null default 'REVIEW'
  check (on_substitute in ('REVIEW', 'DENY'));
alter table tos.gate_events add column if not exists swapped_from text;

-- Trips a substitute bus could take: same operator and destination as the
-- vehicle, not yet in, entry window open or overdue (up to 60 min past ETD).
create or replace function tos.substitute_trips(p_plate text, p_at timestamptz default now())
returns table (booking_id uuid, etd timestamptz, trip_number text, route text, plate_no text)
language sql
stable
security definer
set search_path = public, tos
as $$
  select f.booking_id, f.etd, f.trip_number, f.route, f.plate_no
    from public.tos_vehicle_lookup(p_plate) v
    join public.tos_trip_feed((p_at at time zone 'Asia/Manila')::date) f
      on f.operator_id = v.operator_id and f.route = v.route
    left join tos.trip_state s on s.booking_id = f.booking_id
    cross join tos.rules r
   where r.id = 1
     and s.arrived_at is null and not coalesce(s.denied, false)
     and f.etd >= p_at - interval '60 minutes'
     and f.etd - interval '30 minutes' - make_interval(mins => r.early_min) <= p_at
     and f.plate_no is distinct from v.plate_no
   order by abs(extract(epoch from (f.etd - interval '30 minutes' - p_at)));
$$;
revoke all on function tos.substitute_trips(text, timestamptz) from public, anon, authenticated;

create or replace function public.tos_gate_read(
  p_gate        text,
  p_plate       text,
  p_confidence  numeric default 0.95,
  p_booking     uuid    default null,
  p_test        boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  r      tos.rules;
  g      tos.gates;
  v      record;
  t      record;
  sub    record;
  nsub   int;
  ev     tos.gate_events;
  t_now  timestamptz := now();
  today  date := (now() at time zone 'Asia/Manila')::date;
  norm   text := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  win    timestamptz;
  diff   int;
  d      text;
  cat    text;
  why    text;
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can record gate reads';
  end if;
  if norm = '' then raise exception 'No plate number in this read'; end if;
  if p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception 'Read confidence must be between 0 and 1';
  end if;

  select * into r from tos.rules where id = 1;
  select * into g from tos.gates where id = p_gate;
  if not found then raise exception 'Unknown gate %', p_gate; end if;

  select * into v from public.tos_vehicle_lookup(norm);

  if g.direction = 'exit' then
    select f.* into t
      from public.tos_trip_feed(today) f
      join tos.trip_state s on s.booking_id = f.booking_id
     where (f.booking_id = p_booking or (p_booking is null and f.plate_no = norm))
       and s.arrived_at is not null and s.departed_at is null
     order by f.etd
     limit 1;
    if t.booking_id is not null then
      update tos.trip_state
         set departed_at = t_now, updated_at = t_now, is_test = is_test and p_test
       where booking_id = t.booking_id;
      diff := round(extract(epoch from (t_now - t.etd)) / 60);
      why := case when diff > 2 then format('Left %s min after ETD', diff) else 'Left on time' end;
    else
      why := 'Exit without an open trip';
    end if;
    insert into tos.gate_events (gate_id, plate, confidence, decision, category, reason, booking_id, trip_number, route, barrier_opened, is_test)
    values (p_gate, norm, p_confidence, 'EXIT', 'Exit', why, t.booking_id, t.trip_number, t.route, true, p_test)
    returning * into ev;
    return to_jsonb(ev);
  end if;

  select f.* into t
    from public.tos_trip_feed(today) f
    left join tos.trip_state s on s.booking_id = f.booking_id
   where (f.booking_id = p_booking or (p_booking is null and f.plate_no = norm))
     and s.arrived_at is null and not coalesce(s.denied, false)
     and f.etd >= t_now - interval '60 minutes'
   order by abs(extract(epoch from (f.etd - interval '30 minutes' - t_now)))
   limit 1;

  if p_confidence * 100 < r.min_confidence then
    d := 'REVIEW'; cat := 'Unclear plate read';
    why := format('Plate read unclear (%s%% match), confirm on camera', round(p_confidence * 100));
  elsif v.plate_no is null then
    d := r.on_unregistered; cat := 'Unregistered vehicle'; why := 'Plate not in the approved vehicle masterfile';
  elsif v.orcr_validity < today then
    d := r.on_expired; cat := 'Expired documents'; why := 'OR/CR expired ' || to_char(v.orcr_validity, 'YYYY-MM-DD');
  elsif v.cpc_validity < today then
    d := r.on_expired; cat := 'Expired documents'; why := 'CPC expired ' || to_char(v.cpc_validity, 'YYYY-MM-DD');
  elsif t.booking_id is null then
    select count(*) into nsub from tos.substitute_trips(norm, t_now);
    if nsub > 0 and r.on_substitute = 'REVIEW' then
      select * into sub from tos.substitute_trips(norm, t_now) limit 1;
      d := 'REVIEW'; cat := 'Substitute bus';
      why := format('Not on any trip today. %s has %s trip%s to %s due now (next %s, %s). Swap the plate onto it?',
                    coalesce(v.operator_name, 'The operator'), nsub, case when nsub = 1 then '' else 's' end, v.route,
                    coalesce(sub.trip_number, 'no trip no.'),
                    case when sub.plate_no is null then 'no plate yet' else 'booked with ' || sub.plate_no end);
      t := null;
      select f.* into t from public.tos_trip_feed(today) f where f.booking_id = sub.booking_id;
    else
      d := r.on_no_booking; cat := 'No booking'; why := 'No approved trip for this plate today';
    end if;
  else
    win  := t.etd - interval '30 minutes';
    diff := round(extract(epoch from (t_now - win)) / 60);
    if diff < -r.early_min then
      d := 'HOLD'; cat := 'Early';
      why := format('Early by %s min. Sent to staging; entry opens %s', -diff,
                    to_char((win - make_interval(mins => r.early_min)) at time zone 'Asia/Manila', 'HH24:MI'));
    elsif diff > r.grace_min then
      d := r.on_late; cat := 'Late';
      why := format('Late by %s min for the %s bay window (grace %s min)', diff,
                    to_char(win at time zone 'Asia/Manila', 'HH24:MI'), r.grace_min);
    else
      d := 'ALLOW'; cat := 'On time';
      why := case when diff > 0 then format('On schedule, %s min into grace period', diff) else 'On schedule' end;
    end if;
  end if;

  insert into tos.gate_events (gate_id, plate, confidence, decision, category, reason, booking_id, trip_number, route, pending, barrier_opened, is_test)
  values (p_gate, norm, p_confidence, d, cat, why, t.booking_id, t.trip_number, t.route, d = 'REVIEW', d = 'ALLOW', p_test)
  returning * into ev;

  -- A substitute bus only points at a candidate trip; the trip is not touched
  -- until staff swap the plate onto it.
  if t.booking_id is not null and d in ('ALLOW', 'HOLD', 'DENY') then
    insert into tos.trip_state as s (booking_id, arrived_at, held, denied, is_test, updated_at)
    values (t.booking_id, case when d = 'ALLOW' then t_now end, d = 'HOLD', d = 'DENY', p_test, t_now)
    on conflict (booking_id) do update
      set arrived_at = coalesce(s.arrived_at, excluded.arrived_at),
          held       = excluded.held,
          denied     = excluded.denied,
          is_test    = s.is_test and p_test,
          updated_at = t_now;
  end if;

  return to_jsonb(ev);
end $$;

-- "Open barrier" / "Keep closed". For a substitute bus, opening the barrier
-- without a swap lets the bus in but does not mark any trip arrived, and
-- keeping it closed does not cancel the candidate trip.
create or replace function public.tos_resolve_review(p_event bigint, p_allow boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare ev tos.gate_events;
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can decide gate reviews';
  end if;
  update tos.gate_events
     set pending = false,
         resolution = case when p_allow then 'ALLOWED' else 'DENIED' end,
         resolved_at = now(),
         resolved_by = auth.uid(),
         barrier_opened = p_allow
   where id = p_event and pending
  returning * into ev;
  if not found then raise exception 'This vehicle was already decided'; end if;

  if ev.booking_id is not null and ev.category is distinct from 'Substitute bus' then
    insert into tos.trip_state as s (booking_id, arrived_at, held, denied, is_test, updated_at)
    values (ev.booking_id, case when p_allow then now() end, false, not p_allow, ev.is_test, now())
    on conflict (booking_id) do update
      set arrived_at = case when p_allow then coalesce(s.arrived_at, now()) else s.arrived_at end,
          held       = false,
          denied     = not p_allow,
          is_test    = s.is_test and ev.is_test,
          updated_at = now();
  end if;
  return to_jsonb(ev);
end $$;

-- Swap the waiting bus's plate onto one of today's approved trips and let it in.
-- Trip Scheduling's staff_set_booking_plate() does the booking change and its
-- checks; if it refuses, nothing here changes and its message is returned.
create or replace function public.tos_swap_plate(p_event bigint, p_booking uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  ev    tos.gate_events;
  t     record;
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can swap a plate at the gate';
  end if;
  select * into ev from tos.gate_events where id = p_event for update;
  if not found or not ev.pending then raise exception 'This vehicle was already decided'; end if;

  select f.* into t from public.tos_trip_feed(today) f where f.booking_id = p_booking;
  if t.booking_id is null then raise exception 'That trip is not an approved trip for today'; end if;
  if exists (select 1 from tos.trip_state s where s.booking_id = p_booking and (s.arrived_at is not null or s.denied)) then
    raise exception 'That trip''s bus has already been let in or refused';
  end if;

  if ev.is_test then
    -- A test read must not change a real booking: run Trip Scheduling's
    -- checks, then roll the change back. Its refusals still come through.
    begin
      perform public.staff_set_booking_plate(p_booking, ev.plate);
      raise exception using errcode = 'P0042', message = 'tos test swap rolled back';
    exception when sqlstate 'P0042' then null;
    end;
  else
    perform public.staff_set_booking_plate(p_booking, ev.plate);
  end if;

  update tos.gate_events
     set pending = false, resolution = 'ALLOWED', resolved_at = now(), resolved_by = auth.uid(),
         barrier_opened = true, booking_id = t.booking_id, trip_number = t.trip_number, route = t.route,
         swapped_from = coalesce(t.plate_no, 'none'),
         reason = case when ev.is_test
           then format('Test: plate swap onto %s passed Trip Scheduling''s checks; booking left unchanged', coalesce(t.trip_number, t.route))
           else format('Substitute bus: plate swapped onto %s (was %s)', coalesce(t.trip_number, t.route), coalesce(t.plate_no, 'no plate'))
         end
   where id = p_event
  returning * into ev;

  insert into tos.trip_state as s (booking_id, arrived_at, held, denied, is_test, updated_at)
  values (p_booking, now(), false, false, ev.is_test, now())
  on conflict (booking_id) do update
    set arrived_at = coalesce(s.arrived_at, now()), held = false, denied = false,
        is_test = s.is_test and ev.is_test, updated_at = now();

  return to_jsonb(ev);
end $$;

create or replace function public.tos_set_rules(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare out tos.rules;
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can change gate rules';
  end if;
  update tos.rules set
    early_min       = coalesce((p ->> 'early_min')::int, early_min),
    grace_min       = coalesce((p ->> 'grace_min')::int, grace_min),
    on_late         = coalesce(p ->> 'on_late', on_late),
    on_expired      = coalesce(p ->> 'on_expired', on_expired),
    on_no_booking   = coalesce(p ->> 'on_no_booking', on_no_booking),
    on_unregistered = coalesce(p ->> 'on_unregistered', on_unregistered),
    on_substitute   = coalesce(p ->> 'on_substitute', on_substitute),
    min_confidence  = coalesce((p ->> 'min_confidence')::int, min_confidence),
    updated_at      = now(),
    updated_by      = auth.uid()
  where id = 1
  returning * into out;
  return to_jsonb(out);
end $$;

-- Test reads gain "substitute": a registered, valid bus of an operator with a
-- trip due now, whose plate is not on any trip today.
create or replace function public.tos_simulate(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  r      tos.rules;
  t      record;
  v      record;
  pl     text;
  today  date := (now() at time zone 'Asia/Manila')::date;
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can send test reads';
  end if;
  select * into r from tos.rules where id = 1;

  if p_kind in ('ontime', 'unclear', 'late', 'early') then
    select f.* into t
      from public.tos_trip_feed(today) f
      join public.tos_vehicle_masterfile() m on m.plate_no = f.plate_no
      left join tos.trip_state s on s.booking_id = f.booking_id
     where s.booking_id is null
       and coalesce(m.cpc_validity, today) >= today and coalesce(m.orcr_validity, today) >= today
       and case p_kind
             when 'late'  then f.etd - interval '30 minutes' between now() - interval '120 minutes' and now() - make_interval(mins => r.grace_min + 1)
             when 'early' then f.etd - interval '30 minutes' between now() + make_interval(mins => r.early_min + 15) and now() + interval '300 minutes'
             else f.etd - interval '30 minutes' between now() - make_interval(mins => r.grace_min - 1) and now() + make_interval(mins => r.early_min - 1)
           end
     order by abs(extract(epoch from (f.etd - interval '30 minutes' - now())))
     limit 1;
    if t.booking_id is null then
      return jsonb_build_object('ok', false, 'msg', case p_kind
        when 'late'  then 'No trip with an assigned plate is overdue right now.'
        when 'early' then 'No later trip today has an assigned plate with valid documents.'
        else 'No trip with an assigned plate is due at the gate right now.' end);
    end if;
    return jsonb_build_object('ok', true, 'event',
      public.tos_gate_read('G1', t.plate_no, case when p_kind = 'unclear' then 0.66 else 0.96 end, t.booking_id, true));
  elsif p_kind = 'substitute' then
    select m.plate_no into pl
      from public.tos_trip_feed(today) f
      left join tos.trip_state s on s.booking_id = f.booking_id
      join public.tos_vehicle_masterfile() m on m.operator_id = f.operator_id and m.route = f.route
     where s.arrived_at is null and not coalesce(s.denied, false)
       and f.etd >= now() - interval '60 minutes'
       and f.etd - interval '30 minutes' - make_interval(mins => r.early_min) <= now()
       and coalesce(m.cpc_validity, today) >= today and coalesce(m.orcr_validity, today) >= today
       and not exists (select 1 from public.tos_trip_feed(today) x where x.plate_no = m.plate_no)
     order by abs(extract(epoch from (f.etd - interval '30 minutes' - now()))), random()
     limit 1;
    if pl is null then
      return jsonb_build_object('ok', false, 'msg', 'No trip is due now with a spare bus of the same operator and destination.');
    end if;
    return jsonb_build_object('ok', true, 'event', public.tos_gate_read('G1', pl, 0.96, null, true));
  elsif p_kind = 'unreg' then
    pl := translate(upper(substr(md5(random()::text), 1, 3)), '0123456789', 'ABCDEFGHJK') || (1000 + floor(random() * 8999)::int);
    return jsonb_build_object('ok', true, 'event', public.tos_gate_read('G1', pl, 0.96, null, true));
  elsif p_kind = 'expired' then
    select * into v from public.tos_vehicle_masterfile() m
     where m.cpc_validity < today or m.orcr_validity < today
     order by random() limit 1;
    if v.plate_no is null then return jsonb_build_object('ok', false, 'msg', 'Every approved vehicle has valid documents.'); end if;
    return jsonb_build_object('ok', true, 'event', public.tos_gate_read('G1', v.plate_no, 0.96, null, true));
  elsif p_kind = 'exit' then
    select f.* into t
      from public.tos_trip_feed(today) f
      join tos.trip_state s on s.booking_id = f.booking_id
     where s.arrived_at is not null and s.departed_at is null
     order by f.etd limit 1;
    if t.booking_id is null then return jsonb_build_object('ok', false, 'msg', 'No bus is inside the terminal right now.'); end if;
    return jsonb_build_object('ok', true, 'event', public.tos_gate_read('X1', coalesce(t.plate_no, 'UNKNOWN'), 0.97, t.booking_id, true));
  end if;
  raise exception 'Unknown test scenario %', p_kind;
end $$;

revoke all on function public.tos_swap_plate(bigint, uuid) from public, anon;
grant execute on function public.tos_swap_plate(bigint, uuid) to authenticated;
