-- Terminal Operating System: find a vacant bay for a bus that arrives late.
--
-- When a bus arrives past the grace period (a "Late" read waiting for staff),
-- TOS suggests where it can go, searching in this order:
--   1. the trip's own bay, at its own time if there is still room, else the
--      next free 15-minute slots on that bay
--   2. another bay at the same gate
--   3. another bay on the same floor
-- Within a step the earliest departure time wins, then the bay number. Staff
-- confirm with one click (tos_move_late_trip): the trip's bay and departure
-- slot change in Trip Scheduling, the move is logged, and the barrier opens.
--
-- A bay is free for departure slot s if it is in service and no other pending
-- or approved trip that has not left yet is booked on it from the current slot
-- through s. The bus also needs at least 15 minutes to board, and the same
-- vehicle may not be booked in an adjacent slot (Trip Scheduling's rule). The
-- search looks 8 slots (2 hours) ahead, the same day only.
--
-- Floors: Trip Scheduling has no floors, so TOS keeps one per bay
-- (tos.bay_floor, set on Devices & rules > Bays). Bays with no floor set
-- count as one floor together.
--
-- The move writes public.bookings (slot, assigned_bay_id) directly, because
-- Trip Scheduling has no staff function for it yet. Its own triggers and the
-- one-approved-trip-per-bay-and-slot index still apply.
-- Owner sign-off: @jm-jaramillo (bookings write) @Jcbllanto16 (tos)

/* ------------------------------------------------------------ floors */

create table if not exists tos.bay_floor (
  bay_id      bigint primary key references public.bays(id) on delete cascade,
  floor       text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);
alter table tos.bay_floor enable row level security;
drop policy if exists "staff can read" on tos.bay_floor;
create policy "staff can read" on tos.bay_floor for select to authenticated using ((select public.is_staff()));
create index if not exists bay_floor_updated_by_idx on tos.bay_floor (updated_by);

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
  if f is null then
    delete from tos.bay_floor where bay_id = p_bay;
  else
    insert into tos.bay_floor (bay_id, floor, updated_by) values (p_bay, f, auth.uid())
    on conflict (bay_id) do update set floor = excluded.floor, updated_at = now(), updated_by = excluded.updated_by;
  end if;
  return jsonb_build_object('id', b.id, 'name', b.name, 'floor', f);
end $$;
revoke all on function public.tos_set_bay_floor(bigint, text) from public, anon;
grant execute on function public.tos_set_bay_floor(bigint, text) to authenticated;

-- tos_bays() also returns each bay's floor.
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

/* ------------------------------------------------------------ search */

create or replace function tos.late_bay_options(p_booking uuid, p_at timestamptz default now(), p_horizon int default 8)
returns table (step smallint, bay_id bigint, bay_name text, gate text, floor text, slot smallint, etd timestamptz)
language plpgsql
stable
security definer
set search_path = public, tos
as $$
declare
  k      public.bookings;
  d0     timestamptz;
  ob     public.bays;
  ofloor text;
  cur    int;
  s_min  int;
begin
  select * into k from public.bookings where id = p_booking;
  if not found or k.status not in ('pending', 'approved') then return; end if;
  d0  := k.booking_date::timestamp at time zone 'Asia/Manila';
  cur := greatest(0, floor(extract(epoch from (p_at - d0)) / 900))::int;
  -- First slot the bus can still make: 15 min to board, never earlier than booked.
  s_min := greatest(k.slot, ceil(extract(epoch from (p_at + interval '15 minutes' - d0)) / 900)::int);
  if s_min > 95 then return; end if;

  select * into ob from public.bays where id = k.assigned_bay_id;
  select bf.floor into ofloor from tos.bay_floor bf where bf.bay_id = k.assigned_bay_id;

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

-- Staff: where can this late bus go? Up to 6 options, best first.
create or replace function public.tos_late_bay_options(p_event bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, tos
as $$
declare
  ev tos.gate_events;
  k  public.bookings;
  ob public.bays;
begin
  if not public.is_staff() then raise exception 'Only terminal staff can open the Terminal Operating System'; end if;
  select * into ev from tos.gate_events where id = p_event;
  if not found or ev.booking_id is null then raise exception 'This read has no trip'; end if;
  select * into k from public.bookings where id = ev.booking_id;
  select * into ob from public.bays where id = k.assigned_bay_id;
  return jsonb_build_object(
    'event_id', ev.id,
    'booking_id', k.id,
    'original', jsonb_build_object('bay_id', ob.id, 'bay', ob.name, 'gate', ob.gate,
                  'floor', (select floor from tos.bay_floor where bay_id = ob.id),
                  'slot', k.slot, 'etd', public.slot_start_at(k.booking_date, k.slot)),
    'options', (select coalesce(jsonb_agg(jsonb_build_object(
                  'step', o.step, 'bay_id', o.bay_id, 'bay', o.bay_name, 'gate', o.gate, 'floor', o.floor,
                  'slot', o.slot, 'etd', o.etd, 'keeps_time', o.slot = k.slot)), '[]')
                  from (select * from tos.late_bay_options(k.id, now()) limit 6) o));
end $$;
revoke all on function public.tos_late_bay_options(bigint) from public, anon;
grant execute on function public.tos_late_bay_options(bigint) to authenticated;

/* ------------------------------------------------------------ move */

create table if not exists tos.trip_moves (
  id         bigint generated always as identity primary key,
  booking_id uuid not null,
  event_id   bigint references tos.gate_events(id) on delete set null,
  from_bay   bigint,
  from_slot  smallint,
  to_bay     bigint not null,
  to_slot    smallint not null,
  step       smallint not null,
  is_test    boolean not null default false,
  moved_by   uuid references auth.users(id) on delete set null,
  moved_at   timestamptz not null default now()
);
alter table tos.trip_moves enable row level security;
drop policy if exists "staff can read" on tos.trip_moves;
create policy "staff can read" on tos.trip_moves for select to authenticated using ((select public.is_staff()));
create index if not exists trip_moves_booking_idx on tos.trip_moves (booking_id);
create index if not exists trip_moves_event_idx on tos.trip_moves (event_id);
create index if not exists trip_moves_moved_by_idx on tos.trip_moves (moved_by);

-- Staff confirm a suggested bay: move the trip there and let the bus in.
-- Test reads run the move and roll it back, so real bookings never change.
create or replace function public.tos_move_late_trip(p_event bigint, p_bay bigint, p_slot smallint)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  ev    tos.gate_events;
  k     public.bookings;
  o     record;
  b     public.bays;
  moved boolean;
  t     record;
  how   text;
begin
  if not public.is_staff() then raise exception 'Only terminal staff can move a trip at the gate'; end if;
  select * into ev from tos.gate_events where id = p_event for update;
  if not found or not ev.pending then raise exception 'This vehicle was already decided'; end if;
  if ev.category is distinct from 'Late' or ev.booking_id is null then
    raise exception 'Only a late bus waiting at the gate can be moved to another bay';
  end if;

  select * into k from public.bookings where id = ev.booking_id for update;
  select * into o from tos.late_bay_options(k.id, now(), 96) x where x.bay_id = p_bay and x.slot = p_slot limit 1;
  if o.bay_id is null then raise exception 'That bay is no longer free at that time. Refresh and pick again.'; end if;
  select * into b from public.bays where id = p_bay;
  moved := p_bay is distinct from k.assigned_bay_id or p_slot <> k.slot;

  if moved then
    if ev.is_test then
      begin
        update public.bookings set assigned_bay_id = p_bay, slot = p_slot where id = k.id;
        raise exception using errcode = 'P0042', message = 'tos test move rolled back';
      exception when sqlstate 'P0042' then null;
      end;
    else
      update public.bookings set assigned_bay_id = p_bay, slot = p_slot where id = k.id;
    end if;
    insert into tos.trip_moves (booking_id, event_id, from_bay, from_slot, to_bay, to_slot, step, is_test, moved_by)
    values (k.id, ev.id, k.assigned_bay_id, k.slot, p_bay, p_slot, o.step, ev.is_test, auth.uid());
  end if;

  perform public.tos_resolve_review(p_event, true);

  how := case o.step when 1 then case when moved then 'same bay, later slot' else 'own bay and time' end
                     when 2 then 'same gate' else 'same floor' end;
  select f.* into t from public.tos_trip_feed(k.booking_date) f where f.booking_id = k.id;
  update tos.gate_events
     set trip_number = coalesce(t.trip_number, trip_number),
         reason = reason || '. ' || case
           when not moved then format('Let in on %s as booked', b.name)
           when ev.is_test then format('Test: would move to %s, departing %s (%s); booking left unchanged',
                                       b.name, to_char(o.etd at time zone 'Asia/Manila', 'HH24:MI'), how)
           else format('Moved to %s, departing %s (%s)', b.name, to_char(o.etd at time zone 'Asia/Manila', 'HH24:MI'), how) end
   where id = p_event
  returning * into ev;
  return to_jsonb(ev) || jsonb_build_object('bay', b.name, 'etd', o.etd, 'step', o.step, 'moved', moved);
end $$;
revoke all on function public.tos_move_late_trip(bigint, bigint, smallint) from public, anon;
grant execute on function public.tos_move_late_trip(bigint, bigint, smallint) to authenticated;
