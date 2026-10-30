-- Terminal Operating System: analytics for a date range.
--
-- One staff-only call returns the four sheets on analytics.html:
--   bays          bay utilization from approved trips booked on each bay
--   late          late arrivals (gate reads classed "Late")
--   early         early arrivals sent to staging (gate reads classed "Early", HOLD)
--   unregistered  plates not in the approved vehicle masterfile
-- plus per-day totals. Trips come from Trip Scheduling's tos_trip_feed(); a
-- booked trip occupies its bay for its 30-minute bay window. Test reads are
-- left out unless p_include_tests.

create or replace function public.tos_analytics(p_from date, p_to date, p_include_tests boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, tos
as $$
declare
  days   int;
  t0     timestamptz := p_from::timestamp at time zone 'Asia/Manila';
  t1     timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Manila';
  r      tos.rules;
  result jsonb;
begin
  if not public.is_staff() then
    raise exception 'Only terminal staff can see TOS analytics';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a date range: the end date must be on or after the start date';
  end if;
  days := p_to - p_from + 1;
  if days > 62 then
    raise exception 'Choose at most 62 days';
  end if;
  select * into r from tos.rules where id = 1;

  with trips as (
    select f.*
      from generate_series(p_from, p_to, interval '1 day') d
      cross join lateral public.tos_trip_feed(d::date) f
  ),
  ev as (
    select e.*, t.etd, t.operator_name, t.trade_name, t.bay_name, t.slot
      from tos.gate_events e
      left join trips t on t.booking_id = e.booking_id
     where e.created_at >= t0 and e.created_at < t1
       and (p_include_tests or not e.is_test)
  ),
  bay_use as (
    select b.id, b.name, b.gate, b.is_active,
           count(t.booking_id) as trips,
           count(distinct t.booking_date) filter (where t.booking_id is not null) as days_used,
           -- busiest 15-minute slot start for this bay across the range
           (select to_char(make_interval(mins => x.slot * 15), 'HH24:MI')
              from trips x where x.bay_id = b.id group by x.slot order by count(*) desc, x.slot limit 1) as busiest_slot
      from public.bays b
      left join trips t on t.bay_id = b.id
     where b.is_active or exists (select 1 from trips x where x.bay_id = b.id)
     group by b.id, b.name, b.gate, b.is_active
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'days', days,
    'include_tests', p_include_tests,
    'grace_min', r.grace_min,
    'early_min', r.early_min,
    'totals', jsonb_build_object(
      'trips', (select count(*) from trips),
      'trips_without_bay', (select count(*) from trips where bay_id is null),
      'trips_without_plate', (select count(*) from trips where plate_no is null),
      'late', (select count(*) from ev where category = 'Late'),
      'early', (select count(*) from ev where category = 'Early' and decision = 'HOLD'),
      'unregistered', (select count(*) from ev where category = 'Unregistered vehicle')
    ),
    'bays', (select coalesce(jsonb_agg(jsonb_build_object(
                'bay_id', id, 'bay', name, 'gate', gate, 'active', is_active,
                'trips', trips, 'days_used', days_used,
                'booked_minutes', trips * 30,
                'utilization', round(trips * 30 * 100.0 / (days * 1440), 1),
                'busiest_slot', busiest_slot) order by id), '[]') from bay_use),
    'late', (select coalesce(jsonb_agg(jsonb_build_object(
                'at', created_at, 'gate', gate_id, 'plate', plate, 'trip', trip_number, 'route', route,
                'operator', coalesce(trade_name, operator_name), 'bay', bay_name, 'etd', etd,
                'minutes_late', case when etd is not null then round(extract(epoch from (created_at - (etd - interval '30 minutes'))) / 60) end,
                'decision', decision, 'resolution', resolution, 'opened', barrier_opened,
                'is_test', is_test, 'reason', reason) order by created_at desc), '[]')
               from ev where category = 'Late'),
    'early', (select coalesce(jsonb_agg(jsonb_build_object(
                'at', created_at, 'gate', gate_id, 'plate', plate, 'trip', trip_number, 'route', route,
                'operator', coalesce(trade_name, operator_name), 'bay', bay_name, 'etd', etd,
                'minutes_early', case when etd is not null then round(extract(epoch from ((etd - interval '30 minutes') - created_at)) / 60) end,
                'released_at', (select min(x.created_at) from tos.gate_events x
                                 where x.booking_id = ev.booking_id and x.category = 'Early' and x.decision = 'ALLOW'),
                'is_test', is_test, 'reason', reason) order by created_at desc), '[]')
               from ev where category = 'Early' and decision = 'HOLD'),
    'unregistered', (select coalesce(jsonb_agg(jsonb_build_object(
                'at', created_at, 'gate', gate_id, 'camera_plate', plate, 'confirmed_plate', confirmed_plate,
                'confidence', confidence, 'decision', decision, 'resolution', resolution, 'pending', pending,
                'opened', barrier_opened, 'is_test', is_test, 'reason', reason) order by created_at desc), '[]')
               from ev where category = 'Unregistered vehicle'),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                'date', d::date,
                'trips', (select count(*) from trips t where t.booking_date = d::date),
                'late', (select count(*) from ev where category = 'Late' and (created_at at time zone 'Asia/Manila')::date = d::date),
                'early', (select count(*) from ev where category = 'Early' and decision = 'HOLD' and (created_at at time zone 'Asia/Manila')::date = d::date),
                'unregistered', (select count(*) from ev where category = 'Unregistered vehicle' and (created_at at time zone 'Asia/Manila')::date = d::date)
              ) order by d), '[]')
               from generate_series(p_from, p_to, interval '1 day') d)
  ) into result;

  return result;
end $$;

revoke all on function public.tos_analytics(date, date, boolean) from public, anon;
grant execute on function public.tos_analytics(date, date, boolean) to authenticated;
