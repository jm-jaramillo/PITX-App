# Shared platform and core database log

Changes to `docs/shared/`, `supabase/functions/` and `core` migrations.
Newest first. Owners: @jm-jaramillo @Jcbllanto16 @victoriaronald

## 2026-11-10 - Ticketing card renamed Ticketing and Boarding (@victoriaronald)
- `modules.js`: the Ticketing card's name is now "Ticketing and Boarding" (was Ticketing and
  Booking). Same id, path and roles (Ticketing CHANGELOG entry 20).

## 2026-11-06 - Operators can open Ticketing and Booking (@victoriaronald)
- `modules.js`: the Ticketing card now also shows for `operator`, which opens as that operator's
  bus company only (Ticketing CHANGELOG entry 12). Operators now land on the module list with two
  modules instead of going straight to Trip Scheduling, and get the "All modules" link.

## 2026-11-06 - Ticketing and Booking card opens (@victoriaronald)
- `modules.js`: removed `comingSoon` from Ticketing and Booking now that
  `docs/modules/ticketing/index.html` exists. It opens the demo (the prototype on sample data in
  the browser) until the Supabase pages are built.
- The card is shown to `staff` and, new, `ticketing` (Ticketing Admin). Ticketing Admins now land
  on the portal with two modules instead of going straight to Trip Scheduling, and get the
  "All modules" link.

## 2026-11-06 - Ticketing build plan approved
- Updated the note in `modules.js` (plan approved). `comingSoon` stays until Ticketing has pages.

## 2026-11-06 - Core shared master-data layer (applied)
- Added and applied `supabase/migrations/202611061000_core_shared_master_data.sql`: `core` schema with
  operators (78), vehicles (1,832), destinations (104) and gates, plus links from `tos.route_service` and the
  ticketing tables. Recorded in `public._schema_migrations`.
- Link report after applying: `tos.route_service` 4/4 and all bookings linked to destinations. Ticketing is
  still unlinked: 5 companies without operator, 20 buses without vehicle, 6 routes without destination
  (demo data does not match real plates or names). The new foreign keys are `NOT VALID` until those are fixed
  (owner: @victoriaronald).
