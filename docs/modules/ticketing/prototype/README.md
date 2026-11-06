# Ticketing prototype (reference only)

A stand-alone Next.js prototype of the Ticketing module, built before the module moved
into PITX App. **It is not part of the live site and does not use Supabase.** All data
is dummy data kept in the browser. It is here as the reference for the screens and
rules being rebuilt in `docs/modules/ticketing/` (see [../PLAN.md](../PLAN.md) and
[../CHANGELOG.md](../CHANGELOG.md)).

- The SQL in `supabase/migrations/` here is a draft for the prototype only. The real
  Ticketing database is in [../database/](../database/).
- Bus company names come from the operator list; fares, plates, trips and passengers
  are made up.

## Try it on the site

Live demo: <https://jm-jaramillo.github.io/PITX-App/modules/ticketing/demo/>

`../demo/` is this app built as static files. Rebuild it after changing the source:

```bash
cd docs/modules/ticketing/prototype
npm install
STATIC_EXPORT_BASE_PATH=/PITX-App/modules/ticketing/demo npm run build
```

Then replace `../demo/` with the new `out/` folder. On Windows PowerShell, set the
variable first with `$env:STATIC_EXPORT_BASE_PATH='/PITX-App/modules/ticketing/demo'`.

On the site the demo has no sign-in of its own: you sign in on the PITX App portal, and
`../index.html` hands your name to the demo (`src/lib/portal.ts`). Signed out of the portal,
the demo sends you to the portal login.

- Operator accounts (e.g. `genesis-ops`) get one role, **Bus Company** (Teller and PUB Admin
  together), for their own company only.
- PITX staff and Ticketing Admins pick the demo role with "View as" in the sidebar.
- The demo reads real PITX trips, operators and plates through the other modules' functions
  (`src/lib/live.ts`). Fares, PTU/TIN and missing seat maps are placeholders. With nothing
  readable it keeps the sample data.

## Run it locally

Needs Node.js 20 or later.

```bash
cd docs/modules/ticketing/prototype
npm install
npm run dev
```

Open <http://localhost:3000> and sign in with any name. Roles: Teller, PUB Admin,
Account, Super Admin. The demo approval password is `demo1234` (demo only).

## Where things are

| Path | What |
|---|---|
| `src/lib/store.ts` | All ticketing rules: selling, refunds, reprints, approvals, close sales, seat marks |
| `src/lib/seat-layouts.ts` | The 8 seat layouts from the Seat Configuration sheet |
| `src/lib/seed.ts` | Dummy data |
| `src/app/` | One folder per screen (POS, tickets, close, collection, approvals, settings, ...) |
