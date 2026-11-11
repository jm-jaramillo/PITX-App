-- Terminal Operating System: Overview for any day or month.
--
-- tos_overview_range(from, to) gives the Overview page its numbers for a
-- chosen day or month (Today stays live on tos_snapshot). Same definitions as
-- the live Overview:
--   let in       entry-gate read that opened the barrier
--   turned away  entry-gate read denied by the rules or by staff
--   on time      bus entered within the grace period after its bay window
--                opened (ETD - 30 min + grace)
--   no-show      approved trip whose bus was never let in, 20 min after ETD
-- Test reads (and arrivals recorded by them) are left out unless p_include_tests. Trips come from
-- Trip Scheduling through tos_trip_feed, one call per day.

drop function if exists public.tos_overview_range(date, date);
create or replace function public.tos_overview_range(p_from date, p_to date, p_include_tests boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, tos
as $$
declare
  t0    timestamptz := p_from::timestamp at time zone 'Asia/Manila';
  t1    timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Manila';
  grace int := (select grace_min from tos.rules where id = 1);
begin
  if not public.is_staff() then raise exception 'Only terminal staff can open the Terminal Operating System'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Pick a start date on or before the end date'; end if;
  if p_to - p_from > 61 then raise exception 'Pick at most 62 days'; end if;

  return (
    with days as (
      select d::date as day from generate_series(p_from, p_to, interval '1 day') d
    ), trips as (
      select dd.day, f.booking_id, f.etd, f.plate_no,
             case when p_include_tests or not s.is_test then s.arrived_at end   as arrived_at,
             case when p_include_tests or not s.is_test then s.departed_at end  as departed_at,
             case when p_include_tests or not s.is_test then s.held end         as held,
             case when p_include_tests or not s.is_test then s.denied end       as denied
        from days dd
        cross join lateral public.tos_trip_feed(dd.day) f
        left join tos.trip_state s on s.booking_id = f.booking_id
    ), ev as (
      select e.*, (e.created_at at time zone 'Asia/Manila')::date as day,
             extract(hour from coalesce(e.resolved_at, e.created_at) at time zone 'Asia/Manila')::int as hr,
             e.barrier_opened as let_in,
             (e.decision = 'DENY' or e.resolution = 'DENIED') as turned_away
        from tos.gate_events e
        join tos.gates g on g.id = e.gate_id and g.direction = 'entry'
       where (p_include_tests or not e.is_test) and e.created_at >= t0 and e.created_at < t1
    ), per_day as (
      select dd.day,
             (select count(*) from trips t where t.day = dd.day)                                    as trips,
             (select count(*) from trips t where t.day = dd.day and t.plate_no is null)             as no_plate,
             (select count(*) from trips t where t.day = dd.day and t.arrived_at is not null)       as arrived,
             (select count(*) from trips t where t.day = dd.day and t.arrived_at is not null
                 and t.arrived_at <= t.etd - interval '30 minutes' + make_interval(mins => grace))  as on_time,
             (select count(*) from trips t where t.day = dd.day and t.arrived_at is null
                 and t.departed_at is null and not coalesce(t.denied, false) and not coalesce(t.held, false)
                 and t.etd + interval '20 minutes' < now())                                          as no_shows,
             (select count(*) from ev where ev.day = dd.day and ev.let_in)                           as let_in,
             (select count(*) from ev where ev.day = dd.day and ev.turned_away)                      as turned_away,
             (select count(*) from ev where ev.day = dd.day and ev.category = 'Unregistered vehicle') as unregistered
        from days dd
    )
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'grace_min', grace,
      'include_tests', p_include_tests,
      'totals', (select jsonb_build_object(
                   'trips', coalesce(sum(trips), 0), 'no_plate', coalesce(sum(no_plate), 0),
                   'arrived', coalesce(sum(arrived), 0), 'on_time', coalesce(sum(on_time), 0),
                   'no_shows', coalesce(sum(no_shows), 0), 'let_in', coalesce(sum(let_in), 0),
                   'turned_away', coalesce(sum(turned_away), 0), 'unregistered', coalesce(sum(unregistered), 0))
                   from per_day),
      'daily', (select coalesce(jsonb_agg(to_jsonb(p) order by p.day), '[]') from per_day p),
      'hourly', (select coalesce(jsonb_agg(jsonb_build_object(
                   'hour', h,
                   'let_in', (select count(*) from ev where ev.hr = h and ev.let_in),
                   'turned_away', (select count(*) from ev where ev.hr = h and ev.turned_away)) order by h), '[]')
                   from generate_series(0, 23) h),
      'reasons', (select coalesce(jsonb_agg(jsonb_build_object(
                    'category', r.cat, 'stops', r.stops, 'let_in_after', r.after, 'denied', r.denied) order by r.stops desc), '[]')
                    from (select coalesce(nullif(ev.category, ''), 'Other') as cat, count(*) as stops,
                                 count(*) filter (where ev.resolution = 'ALLOWED'
                                   or (ev.decision = 'HOLD' and exists (select 1 from trips t
                                         where t.booking_id = ev.booking_id and t.arrived_at is not null))) as after,
                                 count(*) filter (where ev.turned_away) as denied
                            from ev
                           where not (ev.decision = 'ALLOW' and ev.resolution is null)
                           group by 1) r)
    )
  );
end $$;

revoke all on function public.tos_overview_range(date, date, boolean) from public, anon;
grant execute on function public.tos_overview_range(date, date, boolean) to authenticated;
