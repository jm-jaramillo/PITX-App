-- Terminal Operating System: Overview shows arrival and departure punctuality only.
--
-- tos_overview_range(from, to, include_tests) now returns, per period, day and
-- hour, just four counts for approved Trip Scheduling trips:
--   on-time arrivals    bus entered by bay-window open (ETD - 30 min) + grace
--   late arrivals       bus entered after that
--   on-time departures  bus left by the exit gate by ETD + grace
--   late departures     bus left after that
-- Grace is the "Late grace period" rule on Devices & rules. Arrivals and
-- departures count on the trip's own day; the hourly split uses the hour the
-- bus entered or left. Test reads are left out unless p_include_tests.
-- Same signature as 202611111200, so nothing else changes.

create or replace function public.tos_overview_range(p_from date, p_to date, p_include_tests boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, tos
as $$
declare
  grace int := (select grace_min from tos.rules where id = 1);
begin
  if not public.is_staff() then raise exception 'Only terminal staff can open the Terminal Operating System'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Pick a start date on or before the end date'; end if;
  if p_to - p_from > 61 then raise exception 'Pick at most 62 days'; end if;

  return (
    with days as (
      select d::date as day from generate_series(p_from, p_to, interval '1 day') d
    ), trips as (
      select dd.day, f.etd,
             case when p_include_tests or not s.is_test then s.arrived_at end  as arrived_at,
             case when p_include_tests or not s.is_test then s.departed_at end as departed_at
        from days dd
        cross join lateral public.tos_trip_feed(dd.day) f
        left join tos.trip_state s on s.booking_id = f.booking_id
    ), t as (
      select day, arrived_at, departed_at,
             arrived_at is not null and arrived_at <= etd - interval '30 minutes' + make_interval(mins => grace) as arr_on_time,
             arrived_at is not null and arrived_at >  etd - interval '30 minutes' + make_interval(mins => grace) as arr_late,
             departed_at is not null and departed_at <= etd + make_interval(mins => grace) as dep_on_time,
             departed_at is not null and departed_at >  etd + make_interval(mins => grace) as dep_late,
             extract(hour from arrived_at at time zone 'Asia/Manila')::int  as arr_hr,
             extract(hour from departed_at at time zone 'Asia/Manila')::int as dep_hr
        from trips
    )
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'grace_min', grace,
      'include_tests', p_include_tests,
      'totals', (select jsonb_build_object(
                   'trips', count(*),
                   'on_time_arrivals', count(*) filter (where arr_on_time),
                   'late_arrivals', count(*) filter (where arr_late),
                   'on_time_departures', count(*) filter (where dep_on_time),
                   'late_departures', count(*) filter (where dep_late)) from t),
      'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                   'day', dd.day,
                   'trips', (select count(*) from t where t.day = dd.day),
                   'on_time_arrivals', (select count(*) from t where t.day = dd.day and arr_on_time),
                   'late_arrivals', (select count(*) from t where t.day = dd.day and arr_late),
                   'on_time_departures', (select count(*) from t where t.day = dd.day and dep_on_time),
                   'late_departures', (select count(*) from t where t.day = dd.day and dep_late)) order by dd.day), '[]')
                   from days dd),
      'hourly', (select coalesce(jsonb_agg(jsonb_build_object(
                   'hour', h,
                   'on_time_arrivals', (select count(*) from t where arr_hr = h and arr_on_time),
                   'late_arrivals', (select count(*) from t where arr_hr = h and arr_late),
                   'on_time_departures', (select count(*) from t where dep_hr = h and dep_on_time),
                   'late_departures', (select count(*) from t where dep_hr = h and dep_late)) order by h), '[]')
                   from generate_series(0, 23) h)
    )
  );
end $$;

revoke all on function public.tos_overview_range(date, date, boolean) from public, anon;
grant execute on function public.tos_overview_range(date, date, boolean) to authenticated;
