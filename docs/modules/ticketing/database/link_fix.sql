-- Hand fixes for Ticketing's links to core, then validating the foreign keys.
-- Not a migration: run step by step in the SQL Editor (dev branch first),
-- after 202611061000_core_shared_master_data.sql and
-- 202611061100_ticketing_core_links.sql. Demo rows are never linked and
-- never show in the review.

-- 1. What is left to fix
select * from ticketing.link_review order by kind, code;

-- 2. Fix by hand. Look up the right ids in core first:
--      select operator_id, username, name, trade_name from core.operators order by name;
--      select vehicle_id, plate_no, operator_id, seating_capacity from core.vehicles where plate_key = core.plate_norm('ABC 1234');
--      select id, name from core.destinations order by name;
--    Then link, one row at a time. Companies first: a bus can only link to a
--    vehicle of its company's operator.
--
-- update ticketing.companies set operator_id = '<operator_id>' where code = '<company code>';
-- update ticketing.buses     set vehicle_id  = '<vehicle_id>'  where plate_no = '<plate in ticketing>';
-- update ticketing.routes    set destination_id = <destination id> where code = '<route code>';
-- update ticketing.trips     set booking_id  = '<booking id>'  where trip_no = '<trip no>';
--
--    A destination missing from core is added by Trip Scheduling (core owner),
--    not here.

-- 3. When step 1 shows nothing (or only rows you accept as unlinked):
alter table ticketing.companies validate constraint companies_operator_fk;
alter table ticketing.buses     validate constraint buses_vehicle_fk;
alter table ticketing.routes    validate constraint routes_destination_fk;
alter table ticketing.trips     validate constraint trips_booking_fk;
