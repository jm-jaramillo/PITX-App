-- `duplicate` as a fifth LTFRB unit status.
--
-- The masterlist's "LTFRB UNIT STATUS" column uses five vocabularies, not
-- the four migration 0021 allowed: ACTIVE, INACTIVE, NO RECORD, LTFRB
-- VERIFIED and DUPLICATE - the last meaning LTFRB holds the same unit
-- twice. #132 loaded the first four; DUPLICATE had nowhere to go and
-- would have failed vehicles_ltfrb_status_check, so those rows were left
-- null, which reads as *bookable* - the opposite of what a duplicate
-- record should be.
--
-- Widening the CHECK is all the database needs. Every rule that decides
-- whether a vehicle can take a booking is an allow-list of
-- null / 'active' / 'ltfrb_verified' (24 of them across the migrations,
-- verified: there is no deny-list anywhere), so `duplicate` is refused
-- everywhere the moment it is a legal value - no RPC or policy changes.
--
-- Nothing is set to 'duplicate' here. The only two rows the masterlist
-- flags that way are CITY-cluster commuter units that this module does
-- not carry (#129); this makes the status legal so the operator-facing
-- Vehicles page can show it, and so a future load of the commuter fleet
-- has somewhere to put it.
--
-- Run after 202611131000_trip-scheduling_vehicle_masterlist_columns.sql.

alter table public.vehicles drop constraint if exists vehicles_ltfrb_status_check;
alter table public.vehicles
  add constraint vehicles_ltfrb_status_check
  check (ltfrb_status in ('active', 'inactive', 'no_record', 'ltfrb_verified', 'duplicate'));

comment on column public.vehicles.ltfrb_status is
  'LTFRB record for this unit, from the masterlist. Bookable only when '
  'null, ''active'' or ''ltfrb_verified''; ''inactive'', ''no_record'' '
  'and ''duplicate'' are refused by every booking rule.';

notify pgrst, 'reload schema';
