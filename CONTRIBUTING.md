# Modules and contributing

PITX Terminal Ops is one site made of modules. **Trip Scheduling** is the first;
**Ticketing and Booking** is next. All modules share one repo, one Supabase
project and one login.

```
docs/
  index.html, login.html, 404.html    home (module portal), sign in, old-URL forwarding
  shared/                             platform - used by every module
    platform.js                       Supabase client, auth guard, nav shell, notifications, helpers
    modules.js                        module registry
    config.js, styles.css, pitx-logo.webp
  modules/
    trip-scheduling/                  owner: Trip Scheduling
    ticketing/                        owner: Ticketing and Booking
supabase/
  migrations/                         see "Database" below
  functions/                          shared functions, plus <module>-prefixed ones
```

## Rules

1. **Stay in your folder.** Module code lives in `docs/modules/<module>/` and imports
   `../../shared/platform.js` (the Trip Scheduling `assets/app.js` re-exports it, so its
   pages import from one place). A module never imports from another module.
2. **Changes to `shared/` need both owners' review** - they affect every module.
   `shared/platform.js` must never import from a module.
3. **Register your module** in `shared/modules.js`: id, name, folder, and which
   `profiles.role` values may enter, each with a landing page. Login and the portal
   read this list; a role with one module goes straight to it.
4. **Nav:** call `renderNav(profile, { brand, links })` from `platform.js` with your own
   sidebar links (see `trip-scheduling/assets/app.js` for an example). The "All modules"
   link appears automatically for roles with more than one module.
5. **Hiding a link is not security.** Enforce access with Row Level Security.

## Database (one Supabase project, one schema per module)

- Put a module's tables in its own Postgres schema (`ticketing`, ...). Shared things -
  `profiles`, operators, bays - stay in `public`. Existing Trip Scheduling tables are
  still in `public`; that is fine for now.
- **Do not query another module's tables.** If Ticketing needs trip data, Trip
  Scheduling exposes a view or RPC and Ticketing calls that.
- A new schema must be exposed in the Supabase API settings and have RLS enabled on
  every table, with policies checked against `profiles.role`.
- **Migrations:** the existing `0001`-`0051` series belongs to Trip Scheduling and is
  frozen. New migrations are named `YYYYMMDDHHMM_<module>_<what>.sql` so two people
  never collide.
- Work against a separate dev/staging Supabase project or branch, not production.

## Git

- Everyone commits straight to `main`; there is no dev branch. `main` deploys to
  GitHub Pages within a minute, so only push what works.
- Before pushing: `git pull --rebase origin main`. Push small, frequent commits.
- Stay in your module folder so pushes rarely touch the same files. A change to
  `docs/shared/` or `supabase/migrations/` affects every module: tell the other owner
  first.
- `.github/CODEOWNERS` records who owns what. Without branch protection it is
  advisory only (it is not enforced on direct pushes).
- Test against the dev Supabase project, never production.

## Adding a module

1. Create `docs/modules/<id>/` with its pages (`../../shared/styles.css` for styles).
2. Add it to `shared/modules.js`.
3. Create its schema and migrations, with RLS.
4. Page template: import `guardPage`/`renderNav` from your module's helper, call
   `guardPage("<role>")`, then `renderNav(profile)`.
