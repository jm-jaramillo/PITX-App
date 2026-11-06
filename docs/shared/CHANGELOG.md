# Shared platform and core database log

Changes to `docs/shared/`, `supabase/functions/` and `core` migrations.
Newest first. Owners: @jm-jaramillo @Jcbllanto16 @victoriaronald

## 2026-11-06 - Core shared master-data layer (draft)
- Added `supabase/migrations/202611061000_core_shared_master_data.sql` (not applied yet): `core` schema with
  operators, vehicles, destinations and gates, plus links from `tos.route_service` and the ticketing tables.
