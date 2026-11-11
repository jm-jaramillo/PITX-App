-- Trip Scheduling owns moving a booking's bay and slot.
--
-- 202611111300 (Terminal Operating System, late-bus bay finder) made
-- tos_move_late_trip() update public.bookings (assigned_bay_id, slot) directly
-- and asked Trip Scheduling whether it wanted to own that write. It does:
-- staff_move_booking() is that one function, and tos_move_late_trip() now calls
-- it instead of updating the table itself.
--
-- staff_move_booking(booking, bay, slot)
--   * staff only; the booking must be pending or approved; slot 0-95; the bay
--     must be active;
--   * the bay must be free at that slot: the bookings_unique_approved_bay_slot
--     index rejects a clash with an approved trip (reported as a plain message),
--     and the existing trigger re-picks any PENDING request that had been
--     proposed that bay;
--   * the same back-to-back rule as every plate path: a bus can't hold two
--     adjacent slots on one date;
--   * status, operator, plate and route are never touched; the operator is
--     notified when the time or bay changed.
-- TOS keeps its own search (which bay/slot to offer) and its audit log
-- (tos.trip_moves); only the write to bookings moved here.

create or replace function public.staff_move_booking(
  p_booking_id uuid,
  p_bay        bigint,
  p_slot       smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_bay     public.bays%rowtype;
begin
  if not public.is_staff() then
    raise exception 'Only staff can move a trip to another bay or time.';
  end if;
  if p_slot is null or p_slot < 0 or p_slot > 95 then
    raise exception 'Pick a time slot between 00:00 and 23:45.';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'Booking not found.';
  end if;
  if v_booking.status not in ('pending', 'approved') then
    raise exception 'Only a pending or approved trip can be moved.';
  end if;

  select * into v_bay from public.bays where id = p_bay;
  if v_bay.id is null or not v_bay.is_active then
    raise exception 'That bay is not in service.';
  end if;

  if v_booking.assigned_bay_id is not distinct from p_bay and v_booking.slot = p_slot then
    return;                                   -- nothing to do
  end if;

  if v_booking.plate_no is not null and exists (
    select 1 from public.bookings b2
    where b2.id <> p_booking_id
      and b2.status in ('pending', 'approved')
      and b2.booking_date = v_booking.booking_date
      and abs(b2.slot - p_slot) = 1
      and regexp_replace(upper(b2.plate_no), '[^A-Z0-9]', '', 'g')
        = regexp_replace(upper(v_booking.plate_no), '[^A-Z0-9]', '', 'g')
  ) then
    raise exception 'That vehicle already has a booking in the adjacent time slot on this date.';
  end if;

  begin
    update public.bookings
       set assigned_bay_id = p_bay,
           slot            = p_slot
     where id = p_booking_id;
  exception when unique_violation then
    raise exception 'That bay is already taken at that time. Pick a different one.';
  end;

  insert into public.notifications (recipient_role, recipient_id, type, title, body, link, related_table, related_id)
  values ('operator', v_booking.operator_id, 'trip_moved',
          'Your trip was moved by PITX staff',
          coalesce(v_booking.route, '') || ' on ' || v_booking.booking_date
            || ' is now at ' || to_char(public.slot_start_at(v_booking.booking_date, p_slot)
                                         at time zone 'Asia/Manila', 'HH24:MI')
            || ', ' || v_bay.name || '.',
          'my-schedule.html', 'bookings', v_booking.id)
  on conflict do nothing;
end;
$$;

revoke all on function public.staff_move_booking(uuid, bigint, smallint) from public, anon;
grant execute on function public.staff_move_booking(uuid, bigint, smallint) to authenticated;

-- tos_move_late_trip(): swap its two direct UPDATEs for the call above. Done by
-- rewriting the live definition so nothing else in the function can drift;
-- it fails loudly if the text isn't what 202611111300 shipped, and is a no-op
-- when already applied.
do $$
declare
  v_def text := pg_get_functiondef('public.tos_move_late_trip(bigint, bigint, smallint)'::regprocedure);
  v_old constant text := 'update public.bookings set assigned_bay_id = p_bay, slot = p_slot where id = k.id;';
  v_new constant text := 'perform public.staff_move_booking(k.id, p_bay, p_slot);';
begin
  if position(v_old in v_def) = 0 then
    if position(v_new in v_def) > 0 then
      raise notice 'tos_move_late_trip already calls staff_move_booking';
      return;
    end if;
    raise exception 'tos_move_late_trip changed shape; update this migration by hand';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

notify pgrst, 'reload schema';
