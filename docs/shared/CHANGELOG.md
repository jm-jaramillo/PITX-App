# Shared platform and core database log

Changes to `docs/shared/`, `supabase/functions/` and `core` migrations.
Newest first. Owners: @jm-jaramillo @Jcbllanto16 @victoriaronald

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
