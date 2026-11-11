-- Terminal Operating System: tell the driver where to go.
--
-- Every answer the tos-device endpoint gives (read, batch, event poll) now
-- carries the trip's bay and a ready-made text for the gate display, e.g.
--   PROCEED TO BAY 12  /  LUC1400 LUCENA 14:00
-- The gate controller shows display.line1 / line2 on the LED board in
-- display.color. Nothing else changes: `action` still drives the barrier.
-- See DEVICE-API.md section 2.1.

create or replace function tos.device_answer(ev jsonb, p_duplicate boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, tos
as $$
declare
  r       tos.rules;
  t       record;
  g       tos.gates;
  bay     jsonb;
  act     text;
  l1      text;
  l2      text;
  color   text;
  opens   text;
  d       date := ((ev ->> 'created_at')::timestamptz at time zone 'Asia/Manila')::date;
begin
  select * into r from tos.rules where id = 1;
  select * into g from tos.gates where id = ev ->> 'gate_id';
  -- Always runs, so t is assigned (all nulls) when the read has no trip.
  select f.* into t from public.tos_trip_feed(d) f where f.booking_id = (ev ->> 'booking_id')::uuid;
  if t.bay_id is not null then
    bay := jsonb_build_object('id', t.bay_id, 'name', t.bay_name, 'gate', t.bay_gate);
  end if;

  act := case
    when (ev ->> 'barrier_opened')::boolean then 'open'
    when (ev ->> 'pending')::boolean then 'wait_for_staff'
    when ev ->> 'decision' = 'HOLD' then 'staging'
    else 'keep_closed' end;

  if g.direction = 'exit' then
    l1 := 'THANK YOU'; l2 := 'SAFE TRIP'; color := 'green';
  elsif act = 'open' and t.bay_name is not null then
    l1 := upper('Proceed to ' || t.bay_name);
    l2 := upper(concat_ws(' ', t.trip_number, t.route, to_char(t.etd at time zone 'Asia/Manila', 'HH24:MI')));
    color := 'green';
  elsif act = 'open' then
    l1 := 'PROCEED'; l2 := 'ASK MARSHAL FOR YOUR BAY'; color := 'green';
  elsif act = 'staging' then
    opens := to_char((t.etd - interval '30 minutes' - make_interval(mins => r.early_min)) at time zone 'Asia/Manila', 'HH24:MI');
    l1 := 'PROCEED TO STAGING';
    l2 := case when opens is not null then 'ENTRY FROM ' || opens else 'WAIT FOR YOUR BAY WINDOW' end;
    color := 'amber';
  elsif act = 'wait_for_staff' then
    l1 := 'PLEASE WAIT'; l2 := 'STAFF ARE CHECKING'; color := 'amber';
  else
    l1 := 'ENTRY NOT ALLOWED'; l2 := 'PLEASE SEE TERMINAL OFFICE'; color := 'red';
  end if;

  return jsonb_build_object(
    'event_id', (ev ->> 'id')::bigint,
    'duplicate', p_duplicate,
    'gate', ev ->> 'gate_id',
    'plate', ev ->> 'plate',
    'decision', ev ->> 'decision',
    'category', ev ->> 'category',
    'reason', ev ->> 'reason',
    'pending', (ev ->> 'pending')::boolean,
    'resolution', ev ->> 'resolution',
    'open_barrier', coalesce((ev ->> 'barrier_opened')::boolean, false),
    'action', act,
    'trip', case when ev ->> 'booking_id' is null then null else jsonb_build_object(
      'booking_id', ev ->> 'booking_id', 'trip_number', ev ->> 'trip_number', 'route', ev ->> 'route',
      'etd', t.etd) end,
    'bay', bay,
    'display', jsonb_build_object('line1', l1, 'line2', l2, 'color', color),
    'read_at', ev ->> 'created_at',
    'test', (ev ->> 'is_test')::boolean);
end $$;
revoke all on function tos.device_answer(jsonb, boolean) from public, anon, authenticated;
