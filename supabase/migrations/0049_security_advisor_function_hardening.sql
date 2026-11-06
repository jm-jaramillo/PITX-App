-- Security Advisor follow-ups: pin search_path on the remaining helper /
-- trigger functions, and stop trigger-only notify_* functions from being
-- callable through /rest/v1/rpc.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'mark_vehicle_previously_approved','mark_previously_approved',
      'touch_updated_at','slot_start_at','vehicle_matches_route',
      'assign_trip_number','compute_trip_number','assign_booking_trade_name')
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;

  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'notify_booking_decided','notify_booking_pending','notify_transfer_decided',
      'notify_transfer_pending','notify_vehicle_decided','notify_vehicle_pending')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
