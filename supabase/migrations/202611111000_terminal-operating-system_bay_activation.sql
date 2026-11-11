-- Terminal Operating System: bays are switched on and off in TOS only.
--
-- Bay activation (public.bays.is_active) moves from Trip Scheduling's Bays
-- page to TOS > Devices & rules > Bays in service. Trip Scheduling keeps adding
-- and renaming bays and still uses is_active exactly as before (bay picking,
-- slot capacity); it just no longer changes it.
--
--  * tos_bays()                     list for the TOS page, with each bay's
--                                   approved trips in the next 14 days (read
--                                   through tos_trip_feed, not bookings)
--  * tos_set_bay_active(bay, on)    the only way staff change is_active; logged
--                                   in tos.bay_changes; refuses to switch off
--                                   the last active bay
--  * tos_guard_bay_activation       trigger on public.bays: a signed-in user
--                                   (the Data API) can no longer change
--                                   is_active directly
--  * tos_snapshot                   returns inactive bays too (flag `active`)
--                                   so the Bay timeline still shows trips
--                                   already booked on a bay that was switched off
--
-- public.bays belongs to Trip Scheduling: the trigger is the one change to it.
-- Owner sign-off: @jm-jaramillo (public.bays trigger) @Jcbllanto16 (tos)

create table if not exists tos.bay_changes (
  id              bigint generated always as identity primary key,
  bay_id          bigint not null references public.bays(id) on delete cascade,
  is_active       boolean not null,
  upcoming_trips  int not null default 0,
  note            text,
  changed_by      uuid references auth.users(id) on delete set null,
  changed_at      timestamptz not null default now()
);
alter table tos.bay_changes enable row level security;
drop policy if exists "staff can read" on tos.bay_changes;
create policy "staff can read" on tos.bay_changes for select to authenticated using ((select public.is_staff()));
create index if not exists bay_changes_bay_idx on tos.bay_changes (bay_id, changed_at desc);
create index if not exists bay_changes_changed_by_idx on tos.bay_changes (changed_by);

/* ------------------------------------------------------------ guard */

create or replace function tos.guard_bay_activation()
returns trigger
language plpgsql
set search_path = public, tos
as $$
begin
  -- Pages reach the table as "authenticated"; TOS's function runs as its owner.
  if new.is_active is distinct from old.is_active and current_user in ('authenticated', 'anon') then
    raise exception 'Bays are switched on and off in the Terminal Operating System (Devices & rules > Bays in service).'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists tos_guard_bay_activation on public.bays;
create trigger tos_guard_bay_activation
  before update of is_active on public.bays
  for each row execute function tos.guard_bay_activation();

/* ------------------------------------------------------------ list */

-- Approved trips on each bay from today for p_days days (Manila dates).
create or replace function tos.bay_upcoming(p_days int default 14)
returns table (bay_id bigint, trips bigint, next_etd timestamptz, next_trip text)
language sql
stable
security definer
set search_path = public, tos
as $$
  with f as (
    select t.bay_id, t.etd, t.trip_number
      from generate_series((now() at time zone 'Asia/Manila')::date,
                           (now() at time zone 'Asia/Manila')::date + (p_days - 1), interval '1 day') d,
           lateral public.tos_trip_feed(d::date) t
     where t.bay_id is not null and t.etd >= now() - interval '30 minutes'
  )
  select bay_id, count(*), min(etd),
         (array_agg(trip_number order by etd))[1]
    from f group by bay_id;
$$;
revoke all on function tos.bay_upcoming(int) from public, anon, authenticated;

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
             'id', b.id, 'name', b.name, 'gate', b.gate, 'active', b.is_active,
             'upcoming', coalesce(u.trips, 0), 'next_etd', u.next_etd, 'next_trip', u.next_trip,
             'changed_at', c.changed_at, 'changed_by', p.username, 'note', c.note)
           order by b.gate nulls last, b.id), '[]')
      from public.bays b
      left join tos.bay_upcoming(14) u on u.bay_id = b.id
      left join lateral (select * from tos.bay_changes x where x.bay_id = b.id order by x.changed_at desc limit 1) c on true
      left join public.profiles p on p.id = c.changed_by
  );
end $$;

/* ------------------------------------------------------------ switch */

create or replace function public.tos_set_bay_active(p_bay bigint, p_active boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  b   public.bays;
  n   int;
begin
  if not public.is_staff() then raise exception 'Only terminal staff can switch bays on or off'; end if;
  if p_active is null then raise exception 'Say whether the bay is on or off'; end if;

  select * into b from public.bays where id = p_bay for update;
  if not found then raise exception 'Unknown bay'; end if;
  if b.is_active = p_active then
    raise exception '% is already %', b.name, case when p_active then 'in service' else 'out of service' end;
  end if;
  if not p_active and not exists (select 1 from public.bays where is_active and id <> p_bay) then
    raise exception '% is the last bay in service. Switch another bay on first.', b.name;
  end if;

  select coalesce((select trips from tos.bay_upcoming(14) where bay_id = p_bay), 0) into n;

  update public.bays set is_active = p_active where id = p_bay;
  insert into tos.bay_changes (bay_id, is_active, upcoming_trips, note, changed_by)
  values (p_bay, p_active, n, nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid());

  return jsonb_build_object('id', b.id, 'name', b.name, 'active', p_active, 'upcoming', n);
end $$;

revoke all on function public.tos_bays() from public, anon;
revoke all on function public.tos_set_bay_active(bigint, boolean, text) from public, anon;
grant execute on function public.tos_bays() to authenticated;
grant execute on function public.tos_set_bay_active(bigint, boolean, text) to authenticated;

/* ------------------------------------------------------------ snapshot */

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
    'bays',      (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'gate', b.gate, 'active', b.is_active) order by b.id), '[]')
                    from public.bays b),
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
