# PITX App

Terminal Ops for the Parañaque Integrated Terminal Exchange (PITX). One site, one
login, one Supabase project, made of modules:

| Module | Folder | Owner | Status |
|---|---|---|---|
| Trip Scheduling | [`docs/modules/trip-scheduling/`](docs/modules/trip-scheduling/) | @jm-jaramillo | Live |
| Terminal Operating System | [`docs/modules/terminal-operating-system/`](docs/modules/terminal-operating-system/) | @Jcbllanto16 | Live, gate hardware not connected yet ([#1](https://github.com/jm-jaramillo/PITX-App/issues/1)) |
| Ticketing and Boarding | [`docs/modules/ticketing/`](docs/modules/ticketing/) | @victoriaronald | Demo live on the portal (sample sales on real PITX trips); database not live yet ([#2](https://github.com/jm-jaramillo/PITX-App/issues/2), [#3](https://github.com/jm-jaramillo/PITX-App/issues/3)) |

Live: <https://jm-jaramillo.github.io/PITX-App/>

- **Working on a module?** Read [CONTRIBUTING.md](CONTRIBUTING.md) first.
- **Trip Scheduling docs** (setup, how it works, project log):
  [README](docs/modules/trip-scheduling/README.md) ·
  [CHANGELOG](docs/modules/trip-scheduling/CHANGELOG.md)
- **Terminal Operating System docs:**
  [README](docs/modules/terminal-operating-system/README.md) ·
  [CHANGELOG](docs/modules/terminal-operating-system/CHANGELOG.md)
- **Ticketing and Boarding docs:**
  [PLAN](docs/modules/ticketing/PLAN.md) ·
  [CHANGELOG](docs/modules/ticketing/CHANGELOG.md) ·
  [database notes](docs/modules/ticketing/database/README.md)

## Ticketing and Boarding: where it stands (23 Nov)

- **Built:** a demo of the whole flow (counter sales, boarding, availability board,
  reports, passenger booking, close and collection), reachable from the portal for
  `staff`, `ticketing` and `operator` roles. It runs in the browser on sample sales
  placed on real PITX trips, routes and company codes read from Supabase.
- **Not live:** the real `ticketing` database. The migrations
  (`202611041000_ticketing_init`, `202611041002_ticketing_passengers`,
  `202611061100_ticketing_core_links`) are written and tested on PGlite but are not in
  production's migration history. Production still holds the early 4 Nov copy (17
  tables, 231 tickets) that `database/reset_old_copy.sql` is meant to drop first. Core
  master data (`202611061000`) is applied.
- **Waiting on Trip Scheduling (@jm-jaramillo), see [#3](https://github.com/jm-jaramillo/PITX-App/issues/3):**
  operator access to `tos_trip_feed` / `tos_vehicle_masterfile`, and the
  `request_seats()` / `get_trip_seats()` proposal in `docs/modules/ticketing/database/for-trip-scheduling.sql`.
  Three questions on that issue (seat requests, fares, plate-change events) are still
  unanswered.
- **Full history:** [CHANGELOG](docs/modules/ticketing/CHANGELOG.md) (entries 1-37).

## Layout

```
docs/                        the site, served as-is by GitHub Pages (no build step)
  index.html                 home: module portal (sends signed-out users to login.html)
  login.html                 sign in
  404.html                   forwards old root-level page URLs
  shared/                    platform used by every module (auth, nav, notifications, styles, config)
  modules/<module>/          one folder per module
supabase/
  migrations/                database migrations (one flat folder; see CONTRIBUTING.md for naming)
  functions/                 Edge Functions
scripts/                     shared tooling: serve-docs, run-migration, create-staff/operator, delete-account
  trip-scheduling/           Trip Scheduling one-offs: masterlist import, demo seed, operator imports
```

## Run locally

```bash
npm install
npm run serve        # http://localhost:3100
```

Database setup, accounts and migrations are covered in the
[Trip Scheduling README](docs/modules/trip-scheduling/README.md#setup); the
steps there apply to the whole Supabase project.
