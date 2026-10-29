-- Terminal Operating System: commuter / provincial service type per destination.
--
-- Trip Scheduling has no service type on routes or vehicles, so TOS keeps its
-- own list, edited by staff on Devices & rules. A destination with no row is
-- provincial. The passenger board splits departures by this list.

create table if not exists tos.route_service (
  route       text primary key,
  service     text not null check (service in ('commuter', 'provincial')),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);
alter table tos.route_service enable row level security;
drop policy if exists "staff can read" on tos.route_service;
create policy "staff can read" on tos.route_service for select to authenticated using ((select public.is_staff()));
grant select on tos.route_service to authenticated;

-- Starting point: the Metro Manila and nearby short-haul destinations.
-- Staff change any of these on Devices & rules.
insert into tos.route_service (route, service) values
  ('ALABANG', 'commuter'),
  ('PACITA COMPLEX', 'commuter'),
  ('BIÑAN, LAGUNA', 'commuter'),
  ('STA. ROSA, LAGUNA', 'commuter')
on conflict (route) do nothing;

-- Every destination TOS knows (from the approved vehicle masterfile, plus any
-- already in the list), with its service type.
create or replace function public.tos_route_services()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, tos
as $$
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can see route service types';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('route', r.route, 'service', coalesce(s.service, 'provincial')) order by r.route), '[]')
      from (select distinct m.route from public.tos_vehicle_masterfile() m where m.route is not null
            union
            select route from tos.route_service) r
      left join tos.route_service s on s.route = r.route
  );
end $$;

create or replace function public.tos_set_route_service(p_route text, p_service text)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can change route service types';
  end if;
  if coalesce(trim(p_route), '') = '' then raise exception 'Choose a destination'; end if;
  if p_service not in ('commuter', 'provincial') then raise exception 'Service must be commuter or provincial'; end if;
  insert into tos.route_service as s (route, service, updated_at, updated_by)
  values (p_route, p_service, now(), auth.uid())
  on conflict (route) do update set service = excluded.service, updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('route', p_route, 'service', p_service);
end $$;

-- tos_snapshot: each trip now carries its service type.
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
           'is_test', coalesce(s.is_test, false),
           'service', coalesce(rs.service, 'provincial')) order by f.slot, f.route), '[]')
    into trips
    from public.tos_trip_feed(d) f
    left join tos.trip_state s on s.booking_id = f.booking_id
    left join tos.route_service rs on rs.route = f.route;

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

revoke all on function public.tos_route_services() from public, anon;
revoke all on function public.tos_set_route_service(text, text) from public, anon;
grant execute on function public.tos_route_services() to authenticated;
grant execute on function public.tos_set_route_service(text, text) to authenticated;
