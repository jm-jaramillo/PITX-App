-- Terminal Operating System: commuter tracking.
--
-- Everything built so far is for provincial operations: booked trips, gate
-- rules, barriers and staff decisions. Commuter buses don't go through any of
-- that. The same ANPR cameras only log their plates, so TOS can count
-- dispatches per commuter route.
--
--   * tos.gates.mode     'provincial' (rules + barrier) or 'commuter' (log only).
--                         Two commuter lanes are added: CE1 Commuter entry and
--                         CX1 Commuter exit, each with an LPR camera.
--   * tos.commuter_reads every plate read at a commuter gate. No rules and no
--                         staff step; any barrier there stays open.
--   * tos.commuter_plates staff tag a plate to a commuter route once. Plates in
--                         Trip Scheduling's vehicle masterfile use their route
--                         from there unless staff tagged them.
--   * Device endpoint    a read sent for a commuter gate is logged and answered
--                         "open" (decision TRACKED), with the same idempotent
--                         read_id handling as provincial reads.
--   * tos_commuter_dispatch(from, to, include_tests): dispatches per route,
--                         per day and per hour, plates with no route, latest reads.
--                         A dispatch is a read at a commuter exit camera; entries
--                         are reads at commuter entry cameras. The same plate at
--                         the same camera within 10 minutes counts once.
-- The route is worked out when the numbers are asked for, so tagging a plate
-- also fixes its earlier reads.

/* ------------------------------------------------------------ lanes */

alter table tos.gates add column if not exists mode text not null default 'provincial'
  check (mode in ('provincial', 'commuter'));

insert into tos.gates (id, name, description, direction, sort_order, mode) values
  ('CE1', 'Commuter entry', 'Commuter buses, plate logged only (no barrier control)', 'entry', 10, 'commuter'),
  ('CX1', 'Commuter exit', 'Commuter dispatches, plate logged only (no barrier control)', 'exit', 11, 'commuter')
on conflict (id) do nothing;

insert into tos.devices (id, gate_id, location, kind, role, status, sort_order) values
  ('CE1-LPR', 'CE1', 'Commuter entry', 'LPR camera', 'Logs commuter plates coming in', 'planned', 12),
  ('CX1-LPR', 'CX1', 'Commuter exit', 'LPR camera', 'Logs commuter dispatches', 'planned', 13)
on conflict (id) do nothing;

/* ------------------------------------------------------------ data */

create table if not exists tos.commuter_reads (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  gate_id         text not null references tos.gates(id),
  plate           text not null,
  confidence      numeric(4,3),
  is_test         boolean not null default false,
  source          text not null default 'device' check (source in ('device', 'test')),
  device_key_id   uuid references tos.device_keys(id) on delete set null,
  device_read_id  text
);
alter table tos.commuter_reads enable row level security;
drop policy if exists "staff can read" on tos.commuter_reads;
create policy "staff can read" on tos.commuter_reads for select to authenticated using ((select public.is_staff()));
create index if not exists commuter_reads_time_idx on tos.commuter_reads (created_at);
create index if not exists commuter_reads_plate_idx on tos.commuter_reads (plate, gate_id, created_at);
create index if not exists commuter_reads_gate_idx on tos.commuter_reads (gate_id);
create index if not exists commuter_reads_key_idx on tos.commuter_reads (device_key_id);
create unique index if not exists commuter_reads_device_read_uniq
  on tos.commuter_reads (device_key_id, device_read_id) where device_read_id is not null;

create table if not exists tos.commuter_plates (
  plate       text primary key,
  route       text not null,
  operator    text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);
alter table tos.commuter_plates enable row level security;
drop policy if exists "staff can read" on tos.commuter_plates;
create policy "staff can read" on tos.commuter_plates for select to authenticated using ((select public.is_staff()));
create index if not exists commuter_plates_updated_by_idx on tos.commuter_plates (updated_by);

/* ------------------------------------------------------------ logging */

-- Logs one commuter read and returns the device answer. No rules, no barrier hold.
create or replace function tos.commuter_read_core(
  p_gate text, p_plate text, p_confidence numeric, p_at timestamptz, p_test boolean,
  p_source text, p_key_id uuid, p_read_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  g     tos.gates;
  r     tos.commuter_reads;
  norm  text := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  route text;
  dup   boolean := false;
begin
  if norm = '' then raise exception 'No plate number in this read'; end if;
  if p_confidence is not null and (p_confidence < 0 or p_confidence > 1) then
    raise exception 'Read confidence must be between 0 and 1';
  end if;
  select * into g from tos.gates where id = p_gate;
  if not found or g.mode <> 'commuter' then raise exception 'Gate % is not a commuter lane', p_gate; end if;

  if p_read_id is not null and p_key_id is not null then
    select * into r from tos.commuter_reads where device_key_id = p_key_id and device_read_id = p_read_id;
    dup := found;
  end if;
  if not dup then
    insert into tos.commuter_reads (created_at, gate_id, plate, confidence, is_test, source, device_key_id, device_read_id)
    values (p_at, p_gate, norm, p_confidence, coalesce(p_test, false), p_source, p_key_id, p_read_id)
    returning * into r;
  end if;

  select coalesce(cp.route, m.route) into route
    from (select 1) x
    left join tos.commuter_plates cp on cp.plate = r.plate
    left join public.tos_vehicle_masterfile() m on m.plate_no = r.plate;

  return jsonb_build_object(
    'event_id', r.id,
    'commuter', true,
    'duplicate', dup,
    'gate', r.gate_id,
    'plate', r.plate,
    'decision', 'TRACKED',
    'category', 'Commuter',
    'reason', 'Commuter bus logged' || coalesce(' · ' || route, ' · no route yet'),
    'pending', false,
    'resolution', null,
    'open_barrier', true,
    'action', 'open',
    'trip', null,
    'bay', null,
    'route', route,
    'display', jsonb_build_object('line1', upper(coalesce(route, 'COMMUTER')),
                                  'line2', case when g.direction = 'exit' then 'SAFE TRIP' else 'WELCOME TO PITX' end,
                                  'color', 'green'),
    'read_at', r.created_at,
    'test', r.is_test);
end $$;
revoke all on function tos.commuter_read_core(text, text, numeric, timestamptz, boolean, text, uuid, text) from public, anon, authenticated;

-- Device reads: commuter lanes are logged; everything else goes through the gate rules as before.
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

  if exists (select 1 from tos.gates where id = p_gate and mode = 'commuter') then
    return tos.commuter_read_core(p_gate, p_plate, p_confidence, at, coalesce(p_test, false), 'device', k.id, p_read_id);
  end if;

  if p_read_id is not null then
    select * into ev from tos.gate_events where device_key_id = k.id and device_read_id = p_read_id;
    if found then return tos.device_answer(to_jsonb(ev), true); end if;
  end if;

  return tos.device_answer(
    tos.gate_read_core(p_gate, p_plate, p_confidence, null, coalesce(p_test, false), at, 'device', k.id, p_read_id),
    false);
end $$;

-- Offline bundle: gates now carry their mode, so a controller knows which lanes only log.
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
    'gates', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'direction', g.direction, 'mode', g.mode) order by g.sort_order), '[]') from tos.gates g),
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

/* ------------------------------------------------------------ staff */

-- A test read from the Commuter page (marked as a test).
create or replace function public.tos_commuter_test_read(p_gate text, p_plate text)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
begin
  if not public.is_staff() then raise exception 'Only terminal staff can send test reads'; end if;
  return tos.commuter_read_core(p_gate, p_plate, 0.95, now(), true, 'test', null, null);
end $$;
revoke all on function public.tos_commuter_test_read(text, text) from public, anon;
grant execute on function public.tos_commuter_test_read(text, text) to authenticated;

-- Tag a plate to a commuter route. Blank route removes the tag.
create or replace function public.tos_tag_commuter_plate(p_plate text, p_route text, p_operator text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  norm text := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  r    text := nullif(upper(left(trim(coalesce(p_route, '')), 80)), '');
  o    text := nullif(left(trim(coalesce(p_operator, '')), 80), '');
begin
  if not public.is_staff() then raise exception 'Only terminal staff can tag commuter plates'; end if;
  if norm = '' then raise exception 'Enter a plate number'; end if;
  if r is null then
    delete from tos.commuter_plates where plate = norm;
  else
    insert into tos.commuter_plates (plate, route, operator, updated_by) values (norm, r, o, auth.uid())
    on conflict (plate) do update set route = excluded.route, operator = coalesce(excluded.operator, tos.commuter_plates.operator),
                                      updated_at = now(), updated_by = excluded.updated_by;
  end if;
  return jsonb_build_object('plate', norm, 'route', r, 'operator', o);
end $$;
revoke all on function public.tos_tag_commuter_plate(text, text, text) from public, anon;
grant execute on function public.tos_tag_commuter_plate(text, text, text) to authenticated;

-- Dispatches per commuter route for a day or a month (at most 62 days).
create or replace function public.tos_commuter_dispatch(p_from date, p_to date, p_include_tests boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, tos
as $$
declare
  t0 timestamptz := p_from::timestamp at time zone 'Asia/Manila';
  t1 timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Manila';
begin
  if not public.is_staff() then raise exception 'Only terminal staff can open the Terminal Operating System'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Pick a start date on or before the end date'; end if;
  if p_to - p_from > 61 then raise exception 'Pick at most 62 days'; end if;

  return (
    with mf as (
      select plate_no, route, operator_name from public.tos_vehicle_masterfile()
    ), raw as (
      select r.*, g.direction,
             lag(r.created_at) over (partition by r.plate, r.gate_id order by r.created_at) as prev_at
        from tos.commuter_reads r
        join tos.gates g on g.id = r.gate_id
       where r.created_at >= t0 - interval '10 minutes' and r.created_at < t1
         and (p_include_tests or not r.is_test)
    ), reads as (
      select raw.id, raw.created_at, raw.gate_id, raw.plate, raw.direction, raw.is_test,
             (raw.created_at at time zone 'Asia/Manila')::date as day,
             extract(hour from raw.created_at at time zone 'Asia/Manila')::int as hr,
             coalesce(cp.route, mf.route) as route,
             coalesce(cp.operator, mf.operator_name) as operator,
             case when cp.plate is not null then 'tagged' when mf.plate_no is not null then 'masterfile' end as route_from
        from raw
        left join tos.commuter_plates cp on cp.plate = raw.plate
        left join mf on mf.plate_no = raw.plate
       where raw.created_at >= t0
         and (raw.prev_at is null or raw.created_at - raw.prev_at > interval '10 minutes')
    ), disp as (
      select * from reads where direction = 'exit'
    )
    select jsonb_build_object(
      'from', p_from, 'to', p_to, 'include_tests', p_include_tests,
      'gates', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'direction', direction) order by sort_order), '[]')
                  from tos.gates where mode = 'commuter'),
      'totals', jsonb_build_object(
                  'dispatches', (select count(*) from disp),
                  'entries', (select count(*) from reads where direction = 'entry'),
                  'buses', (select count(distinct plate) from reads),
                  'routes', (select count(distinct route) from reads where route is not null),
                  'no_route_plates', (select count(distinct plate) from reads where route is null)),
      'routes', (select coalesce(jsonb_agg(jsonb_build_object(
                   'route', a.route, 'dispatches', a.dispatches, 'entries', a.entries, 'buses', a.buses,
                   'first_at', a.first_at, 'last_at', a.last_at, 'busiest_hour', bh.hr) order by a.dispatches desc, a.route), '[]')
                   from (select coalesce(route, '') as route,
                                count(*) filter (where direction = 'exit') as dispatches,
                                count(*) filter (where direction = 'entry') as entries,
                                count(distinct plate) as buses,
                                min(created_at) filter (where direction = 'exit') as first_at,
                                max(created_at) filter (where direction = 'exit') as last_at
                           from reads group by 1) a
                   left join lateral (select h.hr from disp h where coalesce(h.route, '') = a.route
                                       group by h.hr order by count(*) desc, h.hr limit 1) bh on true),
      'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date,
                   'dispatches', (select count(*) from disp where disp.day = d::date)) order by d), '[]')
                  from generate_series(p_from, p_to, interval '1 day') d),
      'hourly', (select coalesce(jsonb_agg(jsonb_build_object('hour', h,
                   'dispatches', (select count(*) from disp where disp.hr = h)) order by h), '[]')
                  from generate_series(0, 23) h),
      'no_route', (select coalesce(jsonb_agg(x order by x.reads desc, x.plate), '[]') from (
                   select plate, count(*) as reads, max(created_at) as last_at
                     from reads where route is null group by plate) x),
      'recent', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
                   select r.id, r.created_at, r.gate_id, r.plate, r.direction, r.route, r.route_from, r.operator, r.is_test
                     from reads r order by r.created_at desc limit 50) x),
      'route_options', (select coalesce(jsonb_agg(distinct x.route order by x.route), '[]') from (
                   select route from tos.route_service where service = 'commuter'
                   union select route from tos.commuter_plates) x)
    )
  );
end $$;
revoke all on function public.tos_commuter_dispatch(date, date, boolean) from public, anon;
grant execute on function public.tos_commuter_dispatch(date, date, boolean) to authenticated;

-- Clearing test reads also clears commuter test reads.
create or replace function public.tos_clear_commuter_tests()
returns int
language plpgsql
security definer
set search_path = public, tos
as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'Only terminal staff can clear test reads'; end if;
  delete from tos.commuter_reads where is_test;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.tos_clear_commuter_tests() from public, anon;
grant execute on function public.tos_clear_commuter_tests() to authenticated;
