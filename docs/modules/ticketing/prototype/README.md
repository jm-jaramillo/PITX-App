# Ticketing prototype (reference only)

A stand-alone Next.js prototype of the Ticketing module, built before the module moved
into PITX App. **It is not part of the live site and does not use Supabase.** All data
is dummy data kept in the browser. It is here as the reference for the screens and
rules being rebuilt in `docs/modules/ticketing/` (see [../PLAN.md](../PLAN.md) and
[../CHANGELOG.md](../CHANGELOG.md)).

- The SQL in `supabase/migrations/` here is a draft for the prototype only. The team's
  migration runner reads the top-level `supabase/migrations/` and never these files.
- Bus company names come from the operator list; fares, plates, trips and passengers
  are made up.

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
