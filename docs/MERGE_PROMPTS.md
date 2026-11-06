# Module merge prompts

One Supabase project (`nuezknlzwfkfxlicrgol`), schemas `public` (Trip Scheduling), `tos`, `ticketing`,
plus the new shared `core` layer drafted in `supabase/migrations/202611061000_core_shared_master_data.sql`
(NOT applied yet). Paste the prompt for your module into Claude Code. Order: JM reviews and applies the
migration first, then the other two.

Shared context for all three prompts: read CONTRIBUTING.md, the draft core migration, and the
module README. Never query another module's tables; go through core views or RPCs. Do not run SQL
against production only with additive, reversible migrations (there is no dev branch; do not create one). Migrations are named
`YYYYMMDDHHMM_<module>_<what>.sql`. Pull with rebase before pushing.

## JM (Trip Scheduling, `public`, owner of core)

> You own Trip Scheduling and the shared `core` layer. Review `supabase/migrations/202611061000_core_shared_master_data.sql`
> against the live `public` schema (profiles, operator_profiles, vehicles, route_gates, bookings). Check: plate_norm
> collisions in public.vehicles, whether role='operator' is the only operator role, and that every route string in
> bookings/vehicles maps to a core.destinations row. It is already applied; read core.link_report, fix the
> mapping gaps, then tell Jcbllanto16 and victoriaronald it is ready. After that: add public RPC wrappers
> (core_operators(), core_vehicle_by_plate(plate), core_destinations()) so the other modules never touch core directly,
> make tos_trip_feed/tos_vehicle_masterfile/tos_vehicle_lookup read via core.vehicles, and add FKs from bookings.route
> and vehicles.route to core.destinations only after the report is clean. Keep every existing RPC signature unchanged.

## Jcbllanto16 (Terminal Operating System, `tos`)

> You own the `tos` schema and docs/modules/terminal-operating-system/. Once JM confirms the core migration is applied,
> link TOS to core: (1) validate tos.route_service_destination_fk and make route_service.destination_id the key
> instead of the route text; (2) replace the direct reads of public.bays and public.profiles in the TOS init and
> analytics functions with core views or JM's wrappers; (3) resolve plates with core.plate_norm in tos.gate_read_core
> so camera reads match vehicles regardless of spacing/dashes; (4) decide what to do with the standalone PITX TOS
> project (bekjgnqtazbfoejoldxw): its 505 gate_events and 350 bookings look like simulated data. Confirm that with
> the team before importing anything into tos.gate_events. Keep function signatures the TOS pages call unchanged,
> and test with tos_simulate (clear the test reads afterwards with tos_clear_tests).

## victoriaronald (Ticketing, `ticketing`)

> You own the `ticketing` schema and docs/modules/ticketing/. Once JM confirms the core migration is applied:
> (1) review ticketing.link_report results: companies without operator_id, buses without vehicle_id, routes without
> destination_id; fix the data by hand where the automatic plate/name match missed, then validate
> companies_operator_fk, buses_vehicle_fk and routes_destination_fk; (2) stop treating ticketing.buses and
> ticketing.companies as the source of truth for plates and operators: read them through JM's core wrappers and keep
> only ticketing-specific fields (ticket_code, PTU/TIN, fares); (3) make request_seats() and public.seat_reservations
> use buses.vehicle_id/booking links rather than free-text plates; (4) keep is_demo rows separate so demo data never
> reaches production reports. Do not change Trip Scheduling or TOS tables; ask JM or Jcbllanto16 to expose what you need.
