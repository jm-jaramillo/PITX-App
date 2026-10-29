# PITX App

Terminal Ops for the Parañaque Integrated Terminal Exchange (PITX). One site, one
login, one Supabase project, made of modules:

| Module | Folder | Owner | Status |
|---|---|---|---|
| Trip Scheduling | [`docs/modules/trip-scheduling/`](docs/modules/trip-scheduling/) | @jm-jaramillo | Live |
| Terminal Operating System | [`docs/modules/terminal-operating-system/`](docs/modules/terminal-operating-system/) | @Jcbllanto16 | Live, gate hardware not connected yet ([#1](https://github.com/jm-jaramillo/PITX-App/issues/1)) |
| Ticketing and Booking | `docs/modules/ticketing/` | TBD | Not started |

Live: <https://jm-jaramillo.github.io/PITX-App/>

- **Working on a module?** Read [CONTRIBUTING.md](CONTRIBUTING.md) first.
- **Trip Scheduling docs** (setup, how it works, project log):
  [README](docs/modules/trip-scheduling/README.md) ·
  [CHANGELOG](docs/modules/trip-scheduling/CHANGELOG.md)
- **Terminal Operating System docs:**
  [README](docs/modules/terminal-operating-system/README.md) ·
  [CHANGELOG](docs/modules/terminal-operating-system/CHANGELOG.md)

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
