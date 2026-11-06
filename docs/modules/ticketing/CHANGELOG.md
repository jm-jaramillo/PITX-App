# Project log

Build history of the Ticketing and Booking module of PITX App.
Owner: @victoriaronald
Repo: <https://github.com/jm-jaramillo/PITX-App>
Plan: [PLAN.md](PLAN.md)
Demo (prototype, dummy data): <https://jm-jaramillo.github.io/PITX-App/modules/ticketing/demo/>

Dates and times are Manila time. Every update is pushed to `main` and logged here,
newest first. Migrations are listed with the entry that added them.

---

## 2026-11-06 - Build plan approved
- PLAN.md is approved by @jm-jaramillo; the Ticketing pages can now be built. The portal card stays "Coming soon" until `docs/modules/ticketing/index.html` exists.

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
| Database | The shared PITX project, `ticketing` schema linked to JM's `core` layer (entry 9, replacing entry 6's separate project). See [database/](database/) |
| Source of truth for operators, plates, destinations | `core`. Ticketing keeps only ticket code, PTU/TIN, bus type and fares |
| Demo data | Dev only, and hidden everywhere unless `settings.demo_mode` is on |

Still to agree with the other owners: the trip feed functions, the new `teller` and
`account` roles, and how passenger seat requests hand over to Ticketing (PLAN.md
sections 2 and 3).

---

## 12 · Real PITX data in the demo, and a Bus Company role for operators (6 Nov)

**Real data from the other modules** (`prototype/src/lib/live.ts`)

The demo reads real data on open, then again on "Refresh from PITX". It reads as the portal
user, through the other modules' functions only:

| Function | Gives | Who can read it |
|---|---|---|
| `tos_trip_feed(date)` | Approved trips for today and the next 2 days, with plate and bay | PITX staff |
| `tos_vehicle_masterfile()` | Approved vehicles per operator | PITX staff |
| `list_seat_trips(date)` | Seat count of a trip's bus | Anyone |
| `get_trip_seats(booking)` | Seats passengers requested, held in the demo | Anyone |

How the real data becomes demo data:
- Operators become companies (DLTB, KRS and the others keep their logo and code).
- Each route is labelled the way Trip Scheduling names it.
- Trip times come from the 15-minute slots.
- Trips whose slot has passed show as Departed.
- Not in the other modules, so set as placeholders:
  - fares, by destination keyword (they can be changed in Master Data)
  - PTU/TIN ("Not set")
  - seat maps for buses with no known seat count. Those trips show no seat map until one
    is set.
- Tickets sold on the same real trips are kept on refresh.
- The banner says which data is showing. With nothing readable (no trips, or not staff),
  the sample data stays.

**Bus Company role** (from your message of 6 Nov)
- An operator account on the portal (`profiles.role = 'operator'`, e.g. `genesis-ops`) now
  opens Ticketing as **Bus Company**: Teller and PUB Admin in one role, for its own company only.
- The Bus Company role covers POS, Tickets, Availability, Close Sales, Unit Assignment and
  Manifest. It has no "View as" switch.
- An operator not yet in the data gets its own empty company, so it never sees another
  company's trips.
- PITX staff and Ticketing Admins keep "View as". When a different portal user signs in,
  the role starts again at Super Admin.
- `docs/shared/modules.js`: the Ticketing card now also shows for `operator`. Operators now
  land on the module list (2 modules) instead of going straight to Trip Scheduling.
- Per-user roles come later.

**For JM** ([database/for-trip-scheduling.sql](database/for-trip-scheduling.sql), section 2)
- Proposal: let `tos_trip_feed` and `tos_vehicle_masterfile` also return an operator's own
  rows, not only staff's, with the same signatures.
- Until that's in, an operator sees only real trips whose bus has a seat map. There are
  none today, so operators see their own sample company or an empty one.

**Tested**
- Live loader against a fake PITX feed: 21/21. Covers staff feed, seat maps, held seats,
  placeholders, keeping tickets on refresh, non-staff, and nothing real.
- Locally in the browser:
  - an operator matching a sample company sees only its trips
  - a new operator (Genesis) gets its own empty company
  - a staff user after an operator starts at Super Admin
- Database test: 74/74, now also checking that JM's proposed functions compile.
- Real data not seen: no staff account was used, and `list_seat_trips` returns no trips
  for the next 4 days.

---

## 11 · One sign-in: the portal (6 Nov)

- The demo's own sign-in form is gone on the site. You sign in once on the PITX App portal,
  and clicking Ticketing and Booking opens the demo already signed in with your name.
- [index.html](index.html) checks the portal sign-in:
  - not signed in: goes to the portal login
  - signed in, but not `staff` or `ticketing`: goes to the module list
  - signed in with either role: passes your name to the demo
- In the demo:
  - "View as" in the sidebar switches the role (Teller, PUB Admin, Account, Super Admin).
    It starts as Super Admin, and Teller and PUB Admin get the first active counter and
    company.
  - "All modules" replaces "Sign out" and goes back to the portal.
  - Signed out of the portal, any demo page sends you to the portal login.
- Source: new `prototype/src/lib/portal.ts`, changes in `prototype/src/components/app-shell.tsx`.
  The demo was rebuilt from it. Run locally, the prototype keeps its own sign-in form.
- Tested locally under `/PITX-App/` with a stand-in portal session: signed out goes to login,
  signed in opens the dashboard with no form, "View as" Teller shows the Teller pages,
  deep links (POS) work, and signing out of the portal sends you back to login.
- Not tested with a real portal account: the handoff from `index.html` needs a real sign-in.
- Still the prototype: sample data in each browser, not Supabase.

---

## 10 · Ticketing and Booking card live on the portal (6 Nov)

- Added [index.html](index.html), the module home, so the card can leave "Coming soon" (the
  condition in the plan approval above). For now it opens the demo,
  <https://jm-jaramillo.github.io/PITX-App/modules/ticketing/demo/>.
- Removed "Coming soon" from the Ticketing and Booking card (`docs/shared/modules.js`, logged
  in `docs/shared/CHANGELOG.md`). PITX `staff` and the Ticketing Admin role (`ticketing`)
  see the card.
- It is still the prototype: sample data kept in each browser, not Supabase. The Supabase
  pages replace it as they are built.

---

## 9 · Back in the shared project, linked to core (6 Nov)

- Decision: follow JM's merge plan ([docs/MERGE_PROMPTS.md](../../MERGE_PROMPTS.md),
  `e2b512b`). Ticketing goes back in the shared project and links to the `core` layer.
  This reverses entry 6; no separate project is needed.
- Moved `202611041000_ticketing_init.sql` and `202611041002_ticketing_passengers.sql` into
  `supabase/migrations/`. They run before JM's `202611061000_core_shared_master_data.sql`.
- Demo data is no longer a migration. It is now [database/demo_data.sql](database/demo_data.sql),
  run by hand on dev only.
- Added [`202611061100_ticketing_core_links.sql`](../../../supabase/migrations/202611061100_ticketing_core_links.sql),
  covering the 4 items in JM's prompt:
  1. **Link review.** `ticketing.link_review` lists unlinked or wrong real rows:
     - companies with no operator
     - buses with no vehicle, with a note when no vehicle or several vehicles share the plate
     - buses whose vehicle belongs to another operator
     - buses whose capacity doesn't match the seat layout
     - routes with no destination
     - real trips with no booking

     [database/link_fix.sql](database/link_fix.sql) has the hand fixes, then validates
     `companies_operator_fk`, `buses_vehicle_fk`, `routes_destination_fk` and the new
     `trips_booking_fk`.
  2. **Core is the source of truth.**
     - Pages get plate, capacity and status from `core.vehicles`, through
       `ticketing.bus_units`.
     - Operator names come from `core.operators`.
     - A bus can only link to its company operator's vehicle.
     - A linked bus whose capacity doesn't match its seat layout isn't sold online.
  3. **Booking links.**
     - `trips.booking_id` now references `public.bookings`.
     - Ticketing treats seats requested through `request_seats()` as taken.
     - New `ticketing_taken_seats(booking_id)` and `ticketing_booking_vehicle(booking_id)`
       let Trip Scheduling do the same in reverse.
     - The `request_seats()` and `get_trip_seats()` change itself is JM's:
       [database/for-trip-scheduling.sql](database/for-trip-scheduling.sql) is a proposal.
       No Trip Scheduling or TOS table or function was changed.
  4. **Demo data separate.**
     - New `settings.demo_mode`, off by default.
     - With it off, demo rows are hidden from the snapshot, online trips, bookings and
       reports.
     - Demo rows can't link to real operators, vehicles or bookings.
- Accounts with `profiles.role = 'ticketing'` (from 0051) count as Ticketing Admin.
- `remove_from_trip_scheduling.sql` is now [database/reset_old_copy.sql](database/reset_old_copy.sql).
  It drops the 4 Nov copy before the migrations are applied fresh.
- Tested on PGlite with stand-ins for the Trip Scheduling and TOS tables: **74/74 pass**.
  This includes core's own migration and the `request_seats()` proposal.
- **Nothing applied to any project.** The order is:
  1. JM reviews and applies core on a dev branch.
  2. Then the reset, the ticketing migrations and `link_fix.sql`.

  The production data still has to be reviewed: what `link_review` shows there can't be
  known until core is applied.

---

## 8 · Database tested on PGlite (4 Nov)

- Added [database/test/test.mjs](database/test/test.mjs): runs the three migrations on
  PGlite (Postgres 16 in Node) with Supabase stand-ins and checks 38 things. All pass:
  - demo data loads (231 tickets, 16 trips)
  - not signed in: can list bookable trips and taken seats, without names; can't read
    tables or book
  - passengers: must register first; discount fares need an ID; can't take a held seat,
    pick a seat twice, pick a seat not on the bus, book more than 5, or book a departed
    trip
  - passengers see and cancel only their own bookings, and never see ID numbers
  - expired holds are voided and free the seat; cancelled seats free up
  - passengers can't open the staff snapshot; the admin can
  - clear-demo removes everything demo
- Fixed: online bookings on demo trips are now marked demo. Before, they blocked
  `ticketing_clear_demo()` with a foreign-key error.
- Not covered: two passengers booking the same seat at the exact same moment. The row lock
  plus the unique seat index should stop it, but PGlite runs one connection only.

---

## 7 · Passenger accounts and online booking (4 Nov)

- Added [`202611041002_ticketing_passengers.sql`](database/migrations/202611041002_ticketing_passengers.sql)
  for the Ticketing project (not applied yet: the project doesn't exist).
- Passengers sign up through the project's Auth and register with a name and contact
  number (`ticketing.passengers`). They are not staff `members` and can't read any table.
- Anyone can list bookable trips and see a trip's taken seats. A signed-in passenger can
  book up to 5 seats per trip, see their own bookings and cancel unpaid ones. Functions
  are listed in [database/README.md](database/README.md#passengers).
- A booking is a 30-minute hold (`Reserved`), paid and issued at a PITX counter. Holds that
  run out free their seats. Online booking closes 60 minutes before departure. All three
  limits are in System Parameters (`online_hold_min`, `online_cutoff_min`,
  `online_max_seats`), plus an `online_booking` on/off switch.
- Tickets gain `booked_by`, `hold_until` and the `Reserved` status. Payment method is now
  required only once a ticket is paid.
- Not done: the passenger pages, the Teller step that turns a hold into a paid ticket,
  and online payment. (Tested in entry 8.)
- Overlap to settle with @jm-jaramillo: Trip Scheduling already has passenger seat
  requests (0051). Both should not stay.

---

## 6 · Own database, off the Trip Scheduling project (4 Nov)

> Replaced by entry 9: Ticketing is back in the shared project, linked to core.

- Decision: Ticketing and Booking gets its **own Supabase project** in the Megawide
  Construction Corporation org. It does not use the PITX Trip Scheduling project.
- Moved the two migrations from `supabase/migrations/` (the Trip Scheduling project's
  runner) to [database/migrations/](database/migrations/). See
  [database/README.md](database/README.md) for setup.
- `202611041000_ticketing_init.sql` no longer uses Trip Scheduling's `profiles`,
  `is_ticketing()` or `is_staff()`. It adds `ticketing.members` with the four Ticketing
  roles (`teller`, `pub_admin`, `account`, `admin`) and `ticketing.is_member()` /
  `my_role()`. `ticketing_snapshot` also returns the caller's membership.
- [database/remove_from_trip_scheduling.sql](database/remove_from_trip_scheduling.sql)
  drops the copy applied to the Trip Scheduling project in entry 5. Checked first: only
  the 17 Ticketing tables, demo rows only, nothing outside depends on them.
- Not done yet: the new project. Creating it in the Megawide org needs the org owner or
  an admin; the owner's account doesn't have that permission.

---

## 5 · Ticketing database on Supabase (4 Nov)

> Replaced by entry 6: this went to the Trip Scheduling project by mistake.

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
