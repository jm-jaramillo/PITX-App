-- One-off: run on the PITX Trip Scheduling project (nuezknlzwfkfxlicrgol) only.
-- Removes the ticketing schema and its two functions that were applied there on
-- 4 Nov 2026 by mistake. They hold only demo data. Nothing else is touched.

begin;
drop function if exists public.ticketing_snapshot(date, date);
drop function if exists public.ticketing_clear_demo();
drop schema if exists ticketing cascade;
commit;
