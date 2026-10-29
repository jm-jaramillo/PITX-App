-- Trip Scheduling: automatic, balanced bay assignment.
--
-- Problem: the bay was only ever chosen when staff approved a request, and the
-- default (single approve dropdown and bulk approve alike) was "the first free
-- bay in the gate" - so Bay 18 got everything and Bay 23 sat idle.
--
-- Now every booking gets a bay the moment it is scheduled, picked by
-- pick_balanced_bay() below, and staff can still override it:
--   * on approval, the dropdown is preselected with the booking's bay and any
--     vacant bay can be chosen instead (approvals page);
--   * on an already-approved trip, the Schedule board's bay selector reassigns
--     it to any vacant bay - the overstay case (a bus still sitting in its bay
--     when the next trip is due) - unchanged by this migration.
--
-- THE ALGORITHM  (pick_balanced_bay)
--   Candidates: active bays that are free at this date + slot. "Free" counts
--   approved trips AND other bookings' proposed bays (pending), so two requests
--   for the same slot never get the same bay.
--   Then the first bay by this order wins:
--     1. in the route's gate (route_gates, 0050) before any other gate -
--        a route with no gate treats all bays alike;
--     2. no trip in the bay within +/-2 slots (30 min) of this one - a bus
--        that arrived just before may still be standing there;
--     3. fewest trips in that bay on this date (the main balancing term);
--     4. fewest trips in that bay over +/-14 days (keeps the spread fair over
--        the fortnight, so days with only a trip or two still rotate);
--     5. a stable pseudo-random order (md5 of bay + date + slot), NOT the lowest
--        bay number - with everything else equal, lowest-first is exactly the
--        "always Bay 18" behaviour this replaces. Same inputs always give the
--        same answer, so it is repeatable.
--   Greedy "least loaded first" is what balances: each new trip lands on the
--   emptiest bay, so loads stay within one trip of each other.
--
-- WHEN IT RUNS (trigger assign_balanced_bay, before insert/update)
--   * a new booking, or an operator's change that clears the bay
--     (request_booking_change nulls it on a route/date/time change), gets a
--     bay if it has none;
--   * an operator can never choose their own bay: on insert by a non-staff
--     user the supplied value is discarded;
--   * a bay staff set explicitly is never touched.
--   When staff approve a booking into a bay that another PENDING request had
--   been proposed (a manual override), that request is re-picked
--   automatically (trigger repick_conflicting_bay_proposals).
--
-- If no bay is free at all the booking simply has none, as before; staff see
-- "No bays available".

create or replace function public.pick_balanced_bay(
  p_route   text,
  p_date    date,
  p_slot    smallint,
  p_exclude uuid default null
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  with g as (select public.route_gate(p_route) as gate),
  held as (
    -- every booking currently holding a bay near this date (pending proposals
    -- included), except the one being placed
    select k.assigned_bay_id as bay, k.booking_date, k.slot
    from public.bookings k
    where k.assigned_bay_id is not null
      and k.status in ('pending', 'approved')
      and k.booking_date between p_date - 14 and p_date + 14
      and (p_exclude is null or k.id <> p_exclude)
  )
  select b.id
  from public.bays b
  where b.is_active
    and not exists (
      select 1 from held h
      where h.bay = b.id and h.booking_date = p_date and h.slot = p_slot
    )
  order by
    -- 1. the route's own gate first
    (b.gate is not distinct from (select gate from g)
       and (select gate from g) is not null) desc,
    -- 2. not right next to another trip in the same bay
    exists (
      select 1 from held h
      where h.bay = b.id and h.booking_date = p_date and abs(h.slot - p_slot) <= 2
    ) asc,
    -- 3. emptiest that day
    (select count(*) from held h where h.bay = b.id and h.booking_date = p_date) asc,
    -- 4. emptiest over the fortnight
    (select count(*) from held h where h.bay = b.id) asc,
    -- 5. stable pseudo-random tie-break (never simply the lowest bay number)
    md5(b.id::text || p_date::text || p_slot::text)
  limit 1;
$$;

comment on function public.pick_balanced_bay(text, date, smallint, uuid) is
  'The least-loaded free bay for a trip, preferring the route''s gate and '
  'avoiding bays with a trip within 30 minutes. See 202610291200 for the order.';

revoke all on function public.pick_balanced_bay(text, date, smallint, uuid) from public, anon;
grant execute on function public.pick_balanced_bay(text, date, smallint, uuid) to authenticated;

create or replace function public.assign_balanced_bay()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Operators don't choose bays. (Staff and server-side scripts may.)
  if tg_op = 'INSERT' and not public.is_staff() then
    new.assigned_bay_id := null;
  end if;

  if new.status in ('pending', 'approved') and new.assigned_bay_id is null then
    new.assigned_bay_id :=
      public.pick_balanced_bay(new.route, new.booking_date, new.slot, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_balanced_bay on public.bookings;
create trigger trg_assign_balanced_bay
  before insert or update on public.bookings
  for each row execute function public.assign_balanced_bay();

-- Staff overriding a bay (approving into a different one, or reassigning an
-- approved trip) can collide with a bay another PENDING request was proposed.
-- Clearing that proposal lets the trigger above re-pick it.
create or replace function public.repick_conflicting_bay_proposals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and new.assigned_bay_id is not null
     and (old.status is distinct from 'approved'
          or old.assigned_bay_id is distinct from new.assigned_bay_id) then
    update public.bookings
       set assigned_bay_id = null
     where status = 'pending'
       and assigned_bay_id = new.assigned_bay_id
       and booking_date = new.booking_date
       and slot = new.slot
       and id <> new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_repick_conflicting_bay_proposals on public.bookings;
create trigger trg_repick_conflicting_bay_proposals
  after update on public.bookings
  for each row execute function public.repick_conflicting_bay_proposals();

-- The trigger functions are not meant to be called through the API.
revoke execute on function public.assign_balanced_bay() from public, anon, authenticated;
revoke execute on function public.repick_conflicting_bay_proposals() from public, anon, authenticated;

-- Existing requests that were scheduled before this: give every upcoming
-- pending booking without a bay one, oldest first so each pick sees the
-- proposals made before it.
do $$
declare r record;
begin
  for r in
    select id, route, booking_date, slot
    from public.bookings
    where status = 'pending'
      and assigned_bay_id is null
      and booking_date >= (now() at time zone 'Asia/Manila')::date
    order by booking_date, slot, created_at
  loop
    update public.bookings
       set assigned_bay_id = public.pick_balanced_bay(r.route, r.booking_date, r.slot, r.id)
     where id = r.id;
  end loop;
end $$;

notify pgrst, 'reload schema';
