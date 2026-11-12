-- Terminal Operating System: label each bay commuter or provincial, and the
-- routes it serves.
--
-- Not every bay is a provincial bay booked through Trip Scheduling; some serve
-- commuter routes. Staff now set, per bay on Devices & rules > Bays:
--   service       'provincial' or 'commuter' (blank = provincial)
--   route_label   free text, e.g. "Alabang, Pacita - P2P" or "Bicol line"
-- Both are TOS's own settings, kept with the bay's floor in tos.bay_floor
-- (now one row of TOS settings per bay; every column optional).
--
-- The late-bus search only offers bays of the same service as the trip's own
-- bay, so a provincial bus is never sent to a commuter bay.
-- Trip Scheduling's bay picking is unchanged.

alter table tos.bay_floor alter column floor drop not null;
alter table tos.bay_floor add column if not exists service text check (service in ('provincial', 'commuter'));
alter table tos.bay_floor add column if not exists route_label text;
comment on table tos.bay_floor is 'TOS settings per bay: floor, service (provincial/commuter) and a free-text route label.';

-- Floor: blank clears it (the row goes once nothing is set).
create or replace function public.tos_set_bay_floor(p_bay bigint, p_floor text)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  f text := nullif(left(trim(coalesce(p_floor, '')), 30), '');
  b public.bays;
begin
  if not public.is_staff() then raise exception 'Only terminal staff can set bay floors'; end if;
  select * into b from public.bays where id = p_bay;
  if not found then raise exception 'Unknown bay'; end if;
  insert into tos.bay_floor (bay_id, floor, updated_by) values (p_bay, f, auth.uid())
  on conflict (bay_id) do update set floor = excluded.floor, updated_at = now(), updated_by = excluded.updated_by;
  delete from tos.bay_floor where bay_id = p_bay and floor is null and service is null and route_label is null;
  return jsonb_build_object('id', b.id, 'name', b.name, 'floor', f);
end $$;

-- Service and route label for a bay.
create or replace function public.tos_set_bay_service(p_bay bigint, p_service text, p_route_label text)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  s text := nullif(lower(trim(coalesce(p_service, ''))), '');
  r text := nullif(left(trim(coalesce(p_route_label, '')), 120), '');
  b public.bays;
begin
  if not public.is_staff() then raise exception 'Only terminal staff can label bays'; end if;
  if s is not null and s not in ('provincial', 'commuter') then raise exception 'Service must be provincial or commuter'; end if;
  select * into b from public.bays where id = p_bay;
  if not found then raise exception 'Unknown bay'; end if;
  insert into tos.bay_floor (bay_id, service, route_label, updated_by) values (p_bay, s, r, auth.uid())
  on conflict (bay_id) do update
    set service = excluded.service, route_label = excluded.route_label, updated_at = now(), updated_by = excluded.updated_by;
  delete from tos.bay_floor where bay_id = p_bay and floor is null and service is null and route_label is null;
  return jsonb_build_object('id', b.id, 'name', b.name, 'service', coalesce(s, 'provincial'), 'route_label', r);
end $$;
revoke all on function public.tos_set_bay_service(bigint, text, text) from public, anon;
grant execute on function public.tos_set_bay_service(bigint, text, text) to authenticated;

create or replace function public.tos_bays()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, tos
as $$
begin
  if not public.is_staff() then raise exception 'Only terminal staff can manage bays'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', b.id, 'name', b.name, 'gate', b.gate, 'active', b.is_active, 'floor', bf.floor,
             'service', coalesce(bf.service, 'provincial'), 'route_label', bf.route_label,
             'upcoming', coalesce(u.trips, 0), 'next_etd', u.next_etd, 'next_trip', u.next_trip,
             'changed_at', c.changed_at, 'changed_by', p.username, 'note', c.note)
           order by b.gate nulls last, b.id), '[]')
      from public.bays b
      left join tos.bay_floor bf on bf.bay_id = b.id
      left join tos.bay_upcoming(14) u on u.bay_id = b.id
      left join lateral (select * from tos.bay_changes x where x.bay_id = b.id order by x.changed_at desc limit 1) c on true
      left join public.profiles p on p.id = c.changed_by
  );
end $$;

-- Late-bus search: same order as before, now only among bays of the same service.
create or replace function tos.late_bay_options(p_booking uuid, p_at timestamptz default now(), p_horizon int default 8)
returns table (step smallint, bay_id bigint, bay_name text, gate text, floor text, slot smallint, etd timestamptz)
language plpgsql
stable
security definer
set search_path = public, tos
as $$
declare
  k        public.bookings;
  d0       timestamptz;
  ob       public.bays;
  ofloor   text;
  oservice text;
  cur      int;
  s_min    int;
begin
  select * into k from public.bookings where id = p_booking;
  if not found or k.status not in ('pending', 'approved') then return; end if;
  d0  := k.booking_date::timestamp at time zone 'Asia/Manila';
  cur := greatest(0, floor(extract(epoch from (p_at - d0)) / 900))::int;
  s_min := greatest(k.slot, ceil(extract(epoch from (p_at + interval '15 minutes' - d0)) / 900)::int);
  if s_min > 95 then return; end if;

  select * into ob from public.bays where id = k.assigned_bay_id;
  select bf.floor, bf.service into ofloor, oservice from tos.bay_floor bf where bf.bay_id = k.assigned_bay_id;

  return query
  with slots as (
    select s::smallint as s from generate_series(s_min, least(95, s_min + p_horizon - 1)) s
  ), held as (
    select x.assigned_bay_id as bay, x.slot
      from public.bookings x
      left join tos.trip_state ts on ts.booking_id = x.id
     where x.booking_date = k.booking_date and x.id <> k.id
       and x.status in ('pending', 'approved') and x.assigned_bay_id is not null
       and ts.departed_at is null
  ), cand as (
    select case when b.id = k.assigned_bay_id then 1
                when ob.gate is not null and b.gate = ob.gate then 2
                else 3 end::smallint as step,
           b.id, b.name, b.gate, bf.floor, sl.s
      from public.bays b
      left join tos.bay_floor bf on bf.bay_id = b.id
      cross join slots sl
     where b.is_active
       and coalesce(bf.service, 'provincial') = coalesce(oservice, 'provincial')
       and (b.id = k.assigned_bay_id
            or (ob.gate is not null and b.gate = ob.gate)
            or coalesce(bf.floor, '') = coalesce(ofloor, ''))
       and not exists (select 1 from held h where h.bay = b.id and h.slot between least(cur, sl.s) and sl.s)
       and not exists (select 1 from public.bookings v
                        where k.plate_no is not null and v.plate_no = k.plate_no and v.id <> k.id
                          and v.booking_date = k.booking_date and v.status in ('pending', 'approved')
                          and abs(v.slot - sl.s) <= 1)
  )
  select c.step, c.id, c.name, c.gate, c.floor, c.s, public.slot_start_at(k.booking_date, c.s)
    from cand c
   order by c.step, c.s, (regexp_replace(c.name, '\D', '', 'g'))::int nulls last, c.name;
end $$;
revoke all on function tos.late_bay_options(uuid, timestamptz, int) from public, anon, authenticated;
