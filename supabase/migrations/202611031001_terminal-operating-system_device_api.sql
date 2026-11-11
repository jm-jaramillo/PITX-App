-- Terminal Operating System: device API (gate cameras, barriers, local gate controller).
--
-- Devices talk to TOS through the tos-device Edge Function with a per-gate
-- device key (header x-device-key). Keys are created by staff on Devices &
-- rules, shown once, and stored only as a SHA-256 hash. The device functions
-- below are callable only by the service role (the Edge Function).
--
-- The gate decision itself moves into tos.gate_read_core(), used by both
-- staff/test reads (public.tos_gate_read) and device reads
-- (public.tos_device_read). Device reads carry the camera's own read time, so
-- reads queued while offline are judged against when the bus actually arrived.
-- See docs/modules/terminal-operating-system/DEVICE-API.md.

create table if not exists tos.device_keys (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  gate_id       text references tos.gates(id),   -- null = any gate (e.g. a local controller serving all gates)
  key_hash      text not null unique,
  key_hint      text not null,                   -- last 4 characters, to tell keys apart
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  revoked_at    timestamptz,
  last_used_at  timestamptz
);
alter table tos.device_keys enable row level security;
drop policy if exists "staff can read" on tos.device_keys;
create policy "staff can read" on tos.device_keys for select to authenticated using ((select public.is_staff()));
create index if not exists device_keys_created_by_idx on tos.device_keys (created_by);
create index if not exists device_keys_gate_idx on tos.device_keys (gate_id);

alter table tos.gate_events add column if not exists source text not null default 'staff'
  check (source in ('staff', 'test', 'device'));
alter table tos.gate_events add column if not exists device_key_id uuid references tos.device_keys(id) on delete set null;
alter table tos.gate_events add column if not exists device_read_id text;
create unique index if not exists gate_events_device_read_uniq
  on tos.gate_events (device_key_id, device_read_id) where device_read_id is not null;
update tos.gate_events set source = 'test' where is_test and source = 'staff';

/* ------------------------------------------------------------ gate logic */

-- The gate decision for one plate read at time p_at. No permission check here:
-- callers (tos_gate_read for staff, tos_device_read for devices) check first.
create or replace function tos.gate_read_core(
  p_gate        text,
  p_plate       text,
  p_confidence  numeric,
  p_booking     uuid,
  p_test        boolean,
  p_at          timestamptz,
  p_source      text,
  p_key_id      uuid,
  p_read_id     text
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
  t_now  timestamptz := p_at;
  today  date := (p_at at time zone 'Asia/Manila')::date;
  norm   text := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  win    timestamptz;
  diff   int;
  d      text;
  cat    text;
  why    text;
begin
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
         set departed_at = t_now, updated_at = now(), is_test = is_test and p_test
       where booking_id = t.booking_id;
      diff := round(extract(epoch from (t_now - t.etd)) / 60);
      why := case when diff > 2 then format('Left %s min after ETD', diff) else 'Left on time' end;
    else
      why := 'Exit without an open trip';
    end if;
    insert into tos.gate_events (created_at, gate_id, plate, confidence, decision, category, reason, booking_id, trip_number, route,
                                 barrier_opened, is_test, source, device_key_id, device_read_id)
    values (t_now, p_gate, norm, p_confidence, 'EXIT', 'Exit', why, t.booking_id, t.trip_number, t.route,
            true, p_test, p_source, p_key_id, p_read_id)
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

  insert into tos.gate_events (created_at, gate_id, plate, confidence, decision, category, reason, booking_id, trip_number, route,
                               pending, barrier_opened, is_test, source, device_key_id, device_read_id)
  values (t_now, p_gate, norm, p_confidence, d, cat, why, t.booking_id, t.trip_number, t.route,
          d = 'REVIEW', d = 'ALLOW', p_test, p_source, p_key_id, p_read_id)
  returning * into ev;

  if t.booking_id is not null and d in ('ALLOW', 'HOLD', 'DENY') then
    insert into tos.trip_state as s (booking_id, arrived_at, held, denied, is_test, updated_at)
    values (t.booking_id, case when d = 'ALLOW' then t_now end, d = 'HOLD', d = 'DENY', p_test, now())
    on conflict (booking_id) do update
      set arrived_at = coalesce(s.arrived_at, excluded.arrived_at),
          held       = excluded.held,
          denied     = excluded.denied,
          is_test    = s.is_test and p_test,
          updated_at = now();
  end if;

  return to_jsonb(ev);
end $$;
revoke all on function tos.gate_read_core(text, text, numeric, uuid, boolean, timestamptz, text, uuid, text) from public, anon, authenticated;

-- Staff and test reads (unchanged signature): now a thin wrapper over the core.
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
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can record gate reads';
  end if;
  return tos.gate_read_core(p_gate, p_plate, p_confidence, p_booking, p_test, now(),
                            case when p_test then 'test' else 'staff' end, null, null);
end $$;

/* ------------------------------------------------------------ device keys */

-- Checks a device key; returns its row or raises DEVICE_AUTH.
create or replace function tos.device_auth(p_key text)
returns tos.device_keys
language plpgsql
security definer
set search_path = public, tos
as $$
declare k tos.device_keys;
begin
  select * into k from tos.device_keys
   where key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex') and active;
  if not found then raise exception 'DEVICE_AUTH: unknown or revoked device key'; end if;
  update tos.device_keys set last_used_at = now() where id = k.id;
  return k;
end $$;
revoke all on function tos.device_auth(text) from public, anon, authenticated;

-- Staff: create a key. The plain key is returned once and never stored.
create or replace function public.tos_create_device_key(p_label text, p_gate text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  plain text := 'tos_' || encode(extensions.gen_random_bytes(24), 'hex');
  k     tos.device_keys;
begin
  if not public.is_staff() then raise exception 'Only terminal staff can create device keys'; end if;
  if coalesce(trim(p_label), '') = '' then raise exception 'Give the key a name, e.g. "Entry Gate 1 camera"'; end if;
  if p_gate is not null and not exists (select 1 from tos.gates where id = p_gate) then
    raise exception 'Unknown gate %', p_gate;
  end if;
  insert into tos.device_keys (label, gate_id, key_hash, key_hint, created_by)
  values (left(trim(p_label), 80), p_gate, encode(extensions.digest(plain, 'sha256'), 'hex'), right(plain, 4), auth.uid())
  returning * into k;
  return jsonb_build_object('id', k.id, 'label', k.label, 'gate_id', k.gate_id, 'key', plain, 'key_hint', k.key_hint);
end $$;

create or replace function public.tos_revoke_device_key(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare k tos.device_keys;
begin
  if not public.is_staff() then raise exception 'Only terminal staff can revoke device keys'; end if;
  update tos.device_keys set active = false, revoked_at = now() where id = p_id and active returning * into k;
  if not found then raise exception 'That key is already revoked'; end if;
  return jsonb_build_object('id', k.id, 'label', k.label);
end $$;

create or replace function public.tos_device_keys()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, tos
as $$
begin
  if not public.is_staff() then raise exception 'Only terminal staff can see device keys'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', k.id, 'label', k.label, 'gate_id', k.gate_id, 'key_hint', k.key_hint, 'active', k.active,
            'created_at', k.created_at, 'created_by', p.username, 'revoked_at', k.revoked_at, 'last_used_at', k.last_used_at,
            'reads', (select count(*) from tos.gate_events e where e.device_key_id = k.id))
          order by k.active desc, k.created_at desc), '[]')
            from tos.device_keys k left join public.profiles p on p.id = k.created_by);
end $$;

/* ------------------------------------------------------------ device calls */

-- What a device should do with a decision.
create or replace function tos.device_answer(ev jsonb, p_duplicate boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, tos
as $$
  select jsonb_build_object(
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
    'action', case
      when (ev ->> 'barrier_opened')::boolean then 'open'
      when (ev ->> 'pending')::boolean then 'wait_for_staff'
      when ev ->> 'decision' = 'HOLD' then 'staging'
      else 'keep_closed' end,
    'trip', case when ev ->> 'booking_id' is null then null else jsonb_build_object(
      'booking_id', ev ->> 'booking_id', 'trip_number', ev ->> 'trip_number', 'route', ev ->> 'route') end,
    'read_at', ev ->> 'created_at',
    'test', (ev ->> 'is_test')::boolean);
$$;
revoke all on function tos.device_answer(jsonb, boolean) from public, anon, authenticated;

-- One plate read from a device. Idempotent per (key, read_id).
create or replace function public.tos_device_read(
  p_key         text,
  p_gate        text,
  p_plate       text,
  p_confidence  numeric,
  p_read_at     timestamptz default null,
  p_read_id     text default null,
  p_test        boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  k   tos.device_keys := tos.device_auth(p_key);
  at  timestamptz := coalesce(p_read_at, now());
  ev  tos.gate_events;
begin
  if k.gate_id is not null and k.gate_id <> p_gate then
    raise exception 'DEVICE_GATE: this key is for gate %, not %', k.gate_id, p_gate;
  end if;
  if at > now() + interval '5 minutes' then raise exception 'read_at is in the future'; end if;
  if at < now() - interval '3 days' then raise exception 'read_at is more than 3 days old'; end if;

  if p_read_id is not null then
    select * into ev from tos.gate_events where device_key_id = k.id and device_read_id = p_read_id;
    if found then return tos.device_answer(to_jsonb(ev), true); end if;
  end if;

  return tos.device_answer(
    tos.gate_read_core(p_gate, p_plate, p_confidence, null, coalesce(p_test, false), at, 'device', k.id, p_read_id),
    false);
end $$;

-- Current state of a read (for a device waiting on a staff decision).
create or replace function public.tos_device_event(p_key text, p_event_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  k  tos.device_keys := tos.device_auth(p_key);
  ev tos.gate_events;
begin
  select * into ev from tos.gate_events
   where id = p_event_id and (k.gate_id is null or gate_id = k.gate_id);
  if not found then raise exception 'DEVICE_NOT_FOUND: no such event for this key'; end if;
  return tos.device_answer(to_jsonb(ev), false);
end $$;

-- Device heartbeats: [{ "id": "G1-LPR", "status": "online" | "offline" | "fault" }, ...]
create or replace function public.tos_device_heartbeat(p_key text, p_devices jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  k       tos.device_keys := tos.device_auth(p_key);
  n       int;
  unknown jsonb;
begin
  if jsonb_typeof(p_devices) is distinct from 'array' then raise exception 'devices must be a list'; end if;
  with d as (
    select x ->> 'id' as id, coalesce(x ->> 'status', 'online') as status from jsonb_array_elements(p_devices) x
  ), upd as (
    update tos.devices dv
       set status = case when d.status in ('online', 'offline', 'fault') then d.status else 'online' end,
           last_heartbeat = now()
      from d
     where dv.id = d.id and (k.gate_id is null or dv.gate_id = k.gate_id)
    returning dv.id
  )
  select count(*), (select coalesce(jsonb_agg(d.id), '[]') from d where d.id not in (select id from upd))
    into n, unknown from upd;
  return jsonb_build_object('updated', n, 'unknown_or_not_allowed', unknown, 'server_time', now());
end $$;

-- Everything a local gate controller needs to decide on its own while offline.
create or replace function public.tos_device_bundle(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  k     tos.device_keys := tos.device_auth(p_key);
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  return jsonb_build_object(
    'generated_at', now(),
    'date', today,
    'key_gate', k.gate_id,
    'bay_window_min', 30,
    'rules', (select to_jsonb(r) - 'updated_by' from tos.rules r where id = 1),
    'gates', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'direction', g.direction) order by g.sort_order), '[]') from tos.gates g),
    'trips', (select coalesce(jsonb_agg(jsonb_build_object(
                'booking_id', f.booking_id, 'trip_number', f.trip_number, 'route', f.route, 'operator_id', f.operator_id,
                'plate_no', f.plate_no, 'etd', f.etd, 'bay', f.bay_name,
                'arrived_at', s.arrived_at, 'departed_at', s.departed_at,
                'held', coalesce(s.held, false), 'denied', coalesce(s.denied, false)) order by f.etd), '[]')
                from public.tos_trip_feed(today) f left join tos.trip_state s on s.booking_id = f.booking_id),
    'vehicles', (select coalesce(jsonb_agg(jsonb_build_object(
                'plate_no', m.plate_no, 'operator_id', m.operator_id, 'route', m.route,
                'cpc_validity', m.cpc_validity, 'orcr_validity', m.orcr_validity)), '[]')
                from public.tos_vehicle_masterfile() m)
  );
end $$;

revoke all on function public.tos_device_read(text, text, text, numeric, timestamptz, text, boolean) from public, anon, authenticated;
revoke all on function public.tos_device_event(text, bigint) from public, anon, authenticated;
revoke all on function public.tos_device_heartbeat(text, jsonb) from public, anon, authenticated;
revoke all on function public.tos_device_bundle(text) from public, anon, authenticated;
grant execute on function public.tos_device_read(text, text, text, numeric, timestamptz, text, boolean) to service_role;
grant execute on function public.tos_device_event(text, bigint) to service_role;
grant execute on function public.tos_device_heartbeat(text, jsonb) to service_role;
grant execute on function public.tos_device_bundle(text) to service_role;

revoke all on function public.tos_create_device_key(text, text) from public, anon;
revoke all on function public.tos_revoke_device_key(uuid) from public, anon;
revoke all on function public.tos_device_keys() from public, anon;
grant execute on function public.tos_create_device_key(text, text) to authenticated;
grant execute on function public.tos_revoke_device_key(uuid) to authenticated;
grant execute on function public.tos_device_keys() to authenticated;
