# Project log

Build history of the Ticketing and Booking module of PITX App.
Owner: @victoriaronald
Repo: <https://github.com/jm-jaramillo/PITX-App>
Plan: [PLAN.md](PLAN.md)
Demo (prototype, dummy data): <https://jm-jaramillo.github.io/PITX-App/modules/ticketing/demo/>

Dates and times are Manila time. Every update is pushed to `main` and logged here,
newest first. Migrations are listed with the entry that added them.

---

## Decisions as agreed

| Decision | Choice |
|---|---|
| Where Ticketing lives | `docs/modules/ticketing/`, plain pages like the other modules, following CONTRIBUTING.md |
| Source of trips | Trip Scheduling's approved bookings, read only through functions it exposes (proposed in PLAN.md section 2) |
| Who sets the bus for a trip | The operator, through Trip Scheduling's existing plate field. Ticketing reads it |
| Teller scope | One Teller sells for one bus operator only |
| Boarding validation | The automated gate (TOS), not staff |
| Teller refund rule | A Teller can refund any ticket of their operator up to 4 hours before departure; closer than that needs the Ticketing Admin |
| Seat layouts | The 8 diagrams in "PTX. OPS. Seat Configuration" (2026-10-27), the same ones Trip Scheduling uses |

Still to agree with the other owners: the trip feed functions, the new `teller` and
`account` roles, and how passenger seat requests hand over to Ticketing (PLAN.md
sections 2 and 3).

---

## 5 · Ticketing database on Supabase (4 Nov)

- Applied to the shared Supabase project (`nuezknlzwfkfxlicrgol`) from the owner's
  dashboard login, at the owner's request. No dev project was used.
- [`202611041000_ticketing_init.sql`](../../../supabase/migrations/202611041000_ticketing_init.sql):
  new `ticketing` schema with 17 tables (settings, provinces, towns, companies, counters,
  bus types, buses, routes, counter fares, trips, seat marks, tickets, reprints, requests,
  close codes, closings, audit log). RLS is on for all of them; only `ticketing` and `staff`
  accounts can read. The schema is not exposed to the REST API; pages read it through
  `public.ticketing_snapshot(p_from, p_to)`. A unique index stops two counters selling
  the same seat.
- [`202611041001_ticketing_demo_data.sql`](../../../supabase/migrations/202611041001_ticketing_demo_data.sql):
  the prototype's dummy data. 5 operators, 3 counters, 10 bus types, 20 buses, 6 routes,
  16 trips (4 to 6 Nov) and 231 tickets. Every row has `is_demo = true`, and
  `public.ticketing_clear_demo()` removes them all (Ticketing Admin only).
- Checked after applying: row counts match the prototype, RLS is on for every table, and
  the public key gets 401 on `ticketing_snapshot` and 406 on the tables.
- Trips are Ticketing's own demo trips for now. Once Trip Scheduling's feed from
  [#3](https://github.com/jm-jaramillo/PITX-App/issues/3) exists, real trips come from it,
  with `trips.booking_id` pointing at the booking.
- Not changed: `profiles` (no `teller`/`account` roles yet), `bookings`, `vehicles`,
  `shared/`. The write functions (sell, refund, reprint, close sales) come with the pages.

---

## 4 · Asked for Supabase access (3 Nov)

- Opened [#3](https://github.com/jm-jaramillo/PITX-App/issues/3) for @jm-jaramillo (cc
  @Jcbllanto16): Supabase access or a dev project, OK on the `teller` and `account` roles
  and `profiles.operator_id`, OK on the `ticketing` schema, and the Trip Scheduling feed
  functions Ticketing needs.
- Checked the shared project with the public key: the seat layouts are readable, but no
  upcoming approved trip has a plate with a seat layout yet, and `tos_trip_feed` is staff
  only. So the demo stays on dummy data until #3 is settled.
- No pages, shared files or migrations changed.

---

## 3 · Prototype viewable on the site (3 Nov)

- The prototype now runs on the live site as a demo:
  <https://jm-jaramillo.github.io/PITX-App/modules/ticketing/demo/>
- [demo/](demo/) is the prototype built as static files (no build step on Pages). Data is
  still dummy data kept in each visitor's browser; no Supabase.
- Source changes so it can be built as static files: ticket and group pages take the id
  from the address (`ticket/?id=`) instead of the path, image paths follow the site
  sub-folder, and `STATIC_EXPORT_BASE_PATH` switches the build to static output.
- [prototype/README.md](prototype/README.md) explains how to rebuild the demo.
- Tested locally under the same sub-folder: sign in, sell a ticket, boarding pass, open a
  ticket, reload. Some background page preloads return 404 and fall back to normal page
  loads; nothing visible breaks.
- No shared files or migrations changed.

---

## 2 · Prototype added for reference (3 Nov)

- Added the Next.js prototype at [prototype/](prototype/), as committed on the
  owner's PC (`96310d6`). Only tracked files; no dependencies, build output or env files.
- It is reference only: not linked from the site, no Supabase, dummy browser data.
  Its draft SQL is not read by the team's migration runner.
- Added [prototype/README.md](prototype/README.md) on how to run it and where the rules are.
- No pages, shared files or migrations changed.

---

## 1 · Build plan (3 Nov)

- Added [PLAN.md](PLAN.md): scope, the trip data Ticketing needs from Trip Scheduling,
  proposed roles, the `ticketing` schema, pages and order of work, with open questions
  for @jm-jaramillo and @Jcbllanto16.
- Added this CHANGELOG.
- No pages, shared files or migrations changed.

---

## Before the repo: prototype (28 Oct to 3 Nov)

- The ticketing rules were built and tested as a separate prototype (Next.js, data kept
  in the browser only) on the owner's PC. It is the reference for the screens and rules
  here, and is now in [prototype/](prototype/).
- It covered POS with multi-seat sales and the 8 seat layouts, boarding passes with QR,
  refunds and reprints with approvals, Close Sales and blind Daily Collection,
  manifests, ticket availability, reports with Excel export, and System Parameters.
