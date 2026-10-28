-- Terminal Operating System (TOS): gate reads, gate rules and trip arrival state.
--
-- Tables live in the `tos` schema (CONTRIBUTING.md: one schema per module).
-- The schema is not exposed through the REST API: pages talk to it only
-- through the public.tos_* functions below, each of which checks
-- public.is_staff(). Trips and vehicles come from Trip Scheduling's feed
-- functions (public.tos_trip_feed / tos_vehicle_lookup / tos_vehicle_masterfile),
-- never from its tables.
--
-- A trip's ETD is its Trip Scheduling slot start. Its bay window opens
-- 30 minutes before ETD; the gate rules (early window, grace period) are
-- measured from that bay-window start.

create schema if not exists tos;

create table if not exists tos.rules (
  id               int primary key default 1 check (id = 1),
  early_min        int  not null default 30 check (early_min between 0 and 240),
  grace_min        int  not null default 10 check (grace_min between 0 and 120),
  on_late          text not null default 'REVIEW' check (on_late         in ('REVIEW', 'DENY')),
  on_expired       text not null default 'DENY'   check (on_expired      in ('REVIEW', 'DENY')),
  on_no_booking    text not null default 'DENY'   check (on_no_booking   in ('REVIEW', 'DENY')),
  on_unregistered  text not null default 'DENY'   check (on_unregistered in ('REVIEW', 'DENY')),
  min_confidence   int  not null default 85 check (min_confidence between 50 and 99),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id) on delete set null
);
insert into tos.rules (id) values (1) on conflict do nothing;

create table if not exists tos.gates (
  id           text primary key,
  name         text not null,
  description  text,
  direction    text not null check (direction in ('entry', 'exit')),
  sort_order   int  not null default 0
);
insert into tos.gates (id, name, description, direction, sort_order) values
  ('G1', 'Entry Gate 1', 'Provincial buses', 'entry', 1),
  ('G2', 'Entry Gate 2', 'City and P2P buses', 'entry', 2),
  ('X1', 'Exit Gate',    'All departures',     'exit',  3)
on conflict (id) do nothing;

create table if not exists tos.devices (
  id              text primary key,
  gate_id         text references tos.gates(id),
  location        text not null,
  kind            text not null,
  role            text,
  status          text not null default 'planned' check (status in ('online', 'offline', 'not installed', 'planned')),
  last_heartbeat  timestamptz,
  sort_order      int  not null default 0
);
insert into tos.devices (id, gate_id, location, kind, role, status, sort_order) values
  ('G1-LPR',  'G1', 'Entry Gate 1', 'LPR camera',             'Reads plate, returns match confidence', 'planned', 1),
  ('G1-RFID', 'G1', 'Entry Gate 1', 'RFID reader',            'Reads windshield tag as a second ID',   'planned', 2),
  ('G1-BAR',  'G1', 'Entry Gate 1', 'Boom barrier',           'Open / keep closed command',            'planned', 3),
  ('G2-LPR',  'G2', 'Entry Gate 2', 'LPR camera',             'Reads plate, returns match confidence', 'planned', 4),
  ('G2-BAR',  'G2', 'Entry Gate 2', 'Boom barrier',           'Open / keep closed command',            'planned', 5),
  ('X1-LPR',  'X1', 'Exit Gate',    'LPR camera',             'Marks the trip departed',               'planned', 6),
  ('X1-BAR',  'X1', 'Exit Gate',    'Boom barrier',           'Opens for every exiting bus',           'planned', 7),
  ('X1-RFID', 'X1', 'Exit Gate',    'RFID reader',            'Optional second ID',                    'not installed', 8),
  ('DISP',    null, 'Concourse',    'Departure displays',     'Shows ETD, bay and remarks',            'planned', 9),
  ('BAYSIGN', null, 'All bays',     'Bay signs',              'Shows destination at each bay',         'planned', 10),
  ('ADMIN',   null, 'Admin office', 'Alert console',          'Bell for vehicles held at the gate',    'planned', 11)
on conflict (id) do nothing;

-- Every plate read at a gate and what TOS decided. booking_id points at a
-- Trip Scheduling booking but is deliberately not a foreign key: TOS keeps
-- its record even if that booking is later changed or removed.
create table if not exists tos.gate_events (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),
  gate_id         text not null references tos.gates(id),
  plate           text not null,
  confidence      numeric(4,3) not null default 1,
  decision        text not null check (decision in ('ALLOW', 'DENY', 'HOLD', 'REVIEW', 'EXIT')),
  category        text,
  reason          text,
  booking_id      uuid,
  trip_number     text,
  route           text,
  pending         boolean not null default false,
  resolution      text check (resolution in ('ALLOWED', 'DENIED')),
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users(id) on delete set null,
  barrier_opened  boolean not null default false,
  is_test         boolean not null default false
);
create index if not exists gate_events_created_idx on tos.gate_events (created_at desc);
create index if not exists gate_events_pending_idx on tos.gate_events (pending) where pending;
create index if not exists gate_events_booking_idx on tos.gate_events (booking_id);
create index if not exists gate_events_resolved_by_idx on tos.gate_events (resolved_by);

-- What the gates have seen of each trip.
create table if not exists tos.trip_state (
  booking_id   uuid primary key,
  arrived_at   timestamptz,
  departed_at  timestamptz,
  held         boolean not null default false,
  denied       boolean not null default false,
  is_test      boolean not null default false,
  updated_at   timestamptz not null default now()
);

alter table tos.rules       enable row level security;
alter table tos.gates       enable row level security;
alter table tos.devices     enable row level security;
alter table tos.gate_events enable row level security;
alter table tos.trip_state  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['rules', 'gates', 'devices', 'gate_events', 'trip_state'] loop
    execute format('drop policy if exists "staff can read" on tos.%I', t);
    execute format('create policy "staff can read" on tos.%I for select to authenticated using ((select public.is_staff()))', t);
  end loop;
end $$;

revoke all on schema tos from public, anon;
grant usage on schema tos to authenticated;
grant select on all tables in schema tos to authenticated;

/* ------------------------------------------------------------- gate logic */

-- One plate read at a gate. Real devices call this through the device
-- adapter; the "Test a vehicle" buttons call it with p_test = true.
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
    d := r.on_no_booking; cat := 'No booking'; why := 'No approved trip for this plate today';
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

-- Admin decision on a read that is waiting for one.
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

  if ev.booking_id is not null then
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

-- Buses in staging go in once their entry window opens. Called on every
-- snapshot, so it needs no scheduler.
create or replace function tos.release_due()
returns int
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  r      tos.rules;
  t      record;
  opens  timestamptz;
  n      int := 0;
  today  date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into r from tos.rules where id = 1;
  for t in
    select f.*, s.is_test as state_test
      from public.tos_trip_feed(today) f
      join tos.trip_state s on s.booking_id = f.booking_id
     where s.held and not s.denied and s.arrived_at is null
  loop
    opens := t.etd - interval '30 minutes' - make_interval(mins => r.early_min);
    if opens > now() then continue; end if;
    insert into tos.gate_events (gate_id, plate, confidence, decision, category, reason, booking_id, trip_number, route, barrier_opened, is_test)
    values ('G1', coalesce(t.plate_no, '—'), 1, 'ALLOW', 'Early', 'Released from staging, entry window open',
            t.booking_id, t.trip_number, t.route, true, t.state_test);
    update tos.trip_state set held = false, arrived_at = now(), updated_at = now() where booking_id = t.booking_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function tos.release_due() from public, anon, authenticated;

-- Everything a TOS page shows for one terminal day, in one call.
create or replace function public.tos_snapshot(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  d     date := coalesce(p_date, (now() at time zone 'Asia/Manila')::date);
  d0    timestamptz := d::timestamp at time zone 'Asia/Manila';
  trips jsonb;
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can open the Terminal Operating System';
  end if;
  if d = (now() at time zone 'Asia/Manila')::date then
    perform tos.release_due();
  end if;

  select coalesce(jsonb_agg(to_jsonb(f) || jsonb_build_object(
           'arrived_at', s.arrived_at, 'departed_at', s.departed_at,
           'held', coalesce(s.held, false), 'denied', coalesce(s.denied, false),
           'is_test', coalesce(s.is_test, false)) order by f.slot, f.route), '[]')
    into trips
    from public.tos_trip_feed(d) f
    left join tos.trip_state s on s.booking_id = f.booking_id;

  return jsonb_build_object(
    'now',       now(),
    'date',      d,
    'day_start', d0,
    'rules',     (select to_jsonb(r) from tos.rules r where id = 1),
    'gates',     (select coalesce(jsonb_agg(to_jsonb(g) order by g.sort_order), '[]') from tos.gates g),
    'devices',   (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from tos.devices x),
    'bays',      (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'gate', b.gate) order by b.id), '[]')
                    from public.bays b where b.is_active),
    'trips',     trips,
    'events',    (select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object('resolved_by_name', p.username)
                    order by e.created_at desc, e.id desc), '[]')
                    from tos.gate_events e
                    left join public.profiles p on p.id = e.resolved_by
                   where e.created_at >= d0 and e.created_at < d0 + interval '1 day'),
    'vehicles',  (select coalesce(jsonb_agg(to_jsonb(m)), '[]')
                    from public.tos_vehicle_masterfile() m
                   where m.plate_no in (select x->>'plate_no' from jsonb_array_elements(trips) x)
                      or m.plate_no in (select e.plate from tos.gate_events e
                                         where e.created_at >= d0 and e.created_at < d0 + interval '1 day'))
  );
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
    min_confidence  = coalesce((p ->> 'min_confidence')::int, min_confidence),
    updated_at      = now(),
    updated_by      = auth.uid()
  where id = 1
  returning * into out;
  return to_jsonb(out);
end $$;

/* ---------------------------------------------------- test reads (no hardware yet) */

-- One test read for a chosen scenario, picked from today's real trips.
-- Saved with is_test = true so it can be cleared with tos_clear_tests().
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

-- Removes every test read, and trip state that only test reads created.
create or replace function public.tos_clear_tests()
returns int
language plpgsql
security definer
set search_path = public, tos
as $$
declare n int;
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can clear test reads';
  end if;
  delete from tos.gate_events where is_test;
  get diagnostics n = row_count;
  delete from tos.trip_state where is_test;
  return n;
end $$;

revoke all on function public.tos_gate_read(text, text, numeric, uuid, boolean) from public, anon;
revoke all on function public.tos_resolve_review(bigint, boolean) from public, anon;
revoke all on function public.tos_snapshot(date) from public, anon;
revoke all on function public.tos_set_rules(jsonb) from public, anon;
revoke all on function public.tos_simulate(text) from public, anon;
revoke all on function public.tos_clear_tests() from public, anon;
grant execute on function public.tos_gate_read(text, text, numeric, uuid, boolean) to authenticated;
grant execute on function public.tos_resolve_review(bigint, boolean) to authenticated;
grant execute on function public.tos_snapshot(date) to authenticated;
grant execute on function public.tos_set_rules(jsonb) to authenticated;
grant execute on function public.tos_simulate(text) to authenticated;
grant execute on function public.tos_clear_tests() to authenticated;
