-- One-off, on the shared PITX project (nuezknlzwfkfxlicrgol), BEFORE the
-- ticketing and core migrations are applied there.
--
-- On 4 Nov 2026 an early version of the ticketing schema (CHANGELOG entry 5)
-- was applied to this project. It holds only demo data and has a different
-- role model, so drop it and apply the current migrations fresh. Skip this
-- if the ticketing schema isn't there any more. Nothing else is touched.

begin;
drop function if exists public.ticketing_snapshot(date, date);
drop function if exists public.ticketing_clear_demo();
drop schema if exists ticketing cascade;
commit;
