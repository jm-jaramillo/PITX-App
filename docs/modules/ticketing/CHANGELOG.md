# Project log

Build history of the Ticketing and Boarding module of PITX App.
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
| Teller refund rule | A Teller refunds any ticket of their operator directly, no approval, until the bus leaves (9 Nov review, entry 18) |
| Users | PITX Admin, PITX Cashier, Operator Admin, Teller, Passenger (9 Nov review, entry 18) |
| Ticket status | Reserved (paid), Boarded, Voided. Picked but unpaid seats are held, not sold (entry 18) |
| Seat layouts | The 8 diagrams in "PTX. OPS. Seat Configuration" (2026-10-27), the same ones Trip Scheduling uses |
| Database | The shared PITX project, `ticketing` schema linked to JM's `core` layer (entry 9, replacing entry 6's separate project). See [database/](database/) |
| Source of truth for operators, plates, destinations | `core`. Ticketing keeps only ticket code, PTU/TIN, bus type and fares |
| Demo data | Dev only, and hidden everywhere unless `settings.demo_mode` is on |

Still to agree with the other owners: the trip feed functions, the new `teller` and
`account` roles, and how passenger seat requests hand over to Ticketing (PLAN.md
sections 2 and 3).

---

## 23 · Sample data from Trip Scheduling's trips, for every user (11 Nov)

The demo's sample data is now cross-checked with Trip Scheduling. Its demo week (`scripts/trip-scheduling/seed-demo-week.mjs`) lists which operator runs which destination, at what time and on which weekdays. Ticketing's sample trips are those same trips, and every kind of user gets bookings and passengers to work with.

| Where | Before | Now |
|---|---|---|
| Companies | 6 made-up pairings (Kersteen, Lorna, Ogawa, South City, DLTB, Genesis) | The 27 operator accounts in Trip Scheduling's demo week |
| Trips | 25 hand-made trips | The trips Trip Scheduling approves for today and the next two days (about 50 a day): same operator, destination, time and trip number. Pending and rejected requests are left out, and its cancelled trip (DLTB to Daet on Fridays) is Cancelled here too. |
| Trip status | Fixed | From the time the data is made: past departures are Departed, the next 45 minutes Boarding |
| Units | Set per trip by hand | Today's trips have units, most of tomorrow's do, and the day after still needs the Operator Admin (Unit Assignment) |
| Bookings and passengers | About 460 tickets | About 1,900: counter sales at 8 booths, online bookings, discounts, refunds, boarded passengers on departed trips, and refunds on the cancelled trip |
| Counter work | None | Opening checks for every teller with sales, 4 closed shifts (2 for the PITX Cashier to count, 2 counted, one ₱100 short), 3 reprints waiting for approval, and queue counts every 2 hours |
| Fares | 7 destinations | A placeholder fare for each of the 47 destinations the demo week uses |

**Every user gets their own sample data at sign-in**

| User | What they get when they have none |
|---|---|
| Teller, Operator Admin | Up to 8 of their company's counter sales today, under their name and counter, so Tickets and Close Sales show their own |
| Company with no approved trips (LLI, whose week is all pending in Trip Scheduling) or a portal operator not in the sample | Units, routes on its Trip Scheduling destinations, and 4 sample trips with sales, marked as sample in the remark |
| Passenger | 3 online bookings: one today, one later, one already boarded |
| PITX Admin, PITX Cashier | The shared data above |

Only sample tickets (ids starting `demo-`) are ever reassigned. Portal operator accounts now also match their company by Trip Scheduling username (`dltb.ops` is DLTB) and by the distinctive words in the name.

- `scripts/sync-shared.mjs` copies the demo week into `src/lib/ts-demo-week.json` on every build. New: `ts-week.ts`, `user-samples.ts`.
- Real PITX data (live.ts) works as before: real trips still get made-up sales, now spread over the same booths.
- Not checked against the live database: the demo week is the script Trip Scheduling uses to seed it, but which week was loaded there needs a staff sign-in to see.
- Demo data resets once (storage key v14).

## 22 · Routes and trip numbers from Trip Scheduling (10 Nov)

Ticketing routes are now the specific Trip Scheduling destinations, keyed by the trip number. A Trip Scheduling trip number is the destination's 3-letter code plus the departure time (NAG1530 = NAGA CITY at 15:30), so the code tells Ticketing exactly which route a trip is.

| Where | Before | Now |
|---|---|---|
| Real trips (`live.ts`) | One route per company and route text, coded like `DLTB-NAGA-CITY` | One route per company and destination. Code = the trip number's code (`NAG`), name "PITX to NAGA CITY". A trip without a number gets its code from the destination list |
| Route group (denomination) | Region (BICOL, NORTHERN ROUTES) | The destination's Trip Scheduling gate (Gate 2, 4, 5). Labelled "Gate" in Master Data and Reports |
| Destination filter | Real data had no towns, so the POS town filter was empty | Each destination is a town, so POS can filter by it. Daily Trips filters by the specific route |
| Sample data | "PITX to BICOL", trip numbers T-0001 | Real destinations (NAGA CITY, BATANGAS CITY, BAGUIO CITY, LUCENA CITY, DAGUPAN CITY, TACLOBAN CITY, BALANGA, BATAAN) and Trip Scheduling style trip numbers (NAG0530, BA20630). Which operator runs which destination is still made up |
| Placeholder fares | By region word | By destination, then by gate (Gate 2 PHP 250, Gate 4 PHP 1,200, Gate 5 PHP 800), else PHP 500 |

How the list stays the same as Trip Scheduling's:

- `scripts/sync-shared.mjs` now also copies `ROUTES` and `ROUTE_GATES` from `docs/modules/trip-scheduling/assets/app.js` into `src/lib/trip-routes.json` before every build (committed, so the demo still builds outside the repo).
- `src/lib/trip-routes.ts` makes the codes with the same rule as Trip Scheduling's `import-vehicle-masterlist.mjs` (first 3 letters, a digit when two clash), e.g. BAGUIO CITY is BA2 because BAGAMANOC took BAG.

Checks: lint and build clean. Live-data test 36 of 36, with 8 new checks (route code from the trip number, specific destination, gate, town, no-number fallback, trip number back to destination, sample trip numbers and routes). In the browser, Daily Trips lists the 7 destinations and trip numbers like NAG0530 and BAL2145.

Not checked: real trips, since that needs a PITX staff sign-in. If Trip Scheduling's `route_trip_codes` table ever differs from the rule, the trip number still wins for real trips.

Storage key is now `pitx-tms-db-v13`, so the demo loads fresh sample data once in every browser.

---

## 21 · Steps from the Ops process map (10 Nov)

Checked the demo against the Ticketing and Boarding parts of the Terminal Ops process map ("PTX. EXE. Process Map. 2026 05 22": OPS, OPS v1 and v2 sheets, and Annex A functions 2.3.1.2 to 2.3.1.4). Added the steps that were missing.

| Process map step | What the demo now does |
|---|---|
| Ticket Booth and Counter Assignment (operator-counter designation record) | New **Counter Assignment** tab in Master Data: tick which bus companies sell at each counter (none ticked = open to all). Tellers only get their company's counters at sign-in, and selling at another company's counter is refused. Changes are in the log |
| Ticket / Boarding Pass Issuance: login, equipment, printer, QR scanner and network checks | **Open counter** checklist in POS before a Teller's first sale of the day at that counter. Selling stays blocked until every check is ticked. The checks are editable in System Parameters. Each opening is saved with name and time |
| KPI 11: boarding passes issued within the average booking time | Each counter sale is timed from the first seat picked to payment. Target in System Parameters (default 2 minutes). Overview shows the average time and % within target (a Teller sees their own), and Reports has KPI 11 by teller and counter |
| Passenger Demand Data Gathering: passengers served per route, people in line at booths and gates | New **Queue Count** page (PITX Admin) to record people in line at a booth or gate. Overview and Reports show **passengers served by route**: trips, dispatched, seats, ticketed, boarded, load factor |
| Booth Deactivation: "Sales vs Issued Tickets" report | Already there as Shift Remittance, now labelled so. Close Sales tells the Teller to hand the cash to the PITX Cashier, then sign out and lock the booth |
| Daily Operations Dashboard: passengers served vs dispatches | Overview tile "Trips dispatched" next to the route table |

Also fixed the old "Account" wording on Close Sales and Daily Collection (now PITX Cashier).

Roles: the process map's Ticketing and Boarding Supervisor, Specialist and Agents are PITX staff, which is the **PITX Admin** role in the demo. Booth tellers are the operators' employees (**Teller**).

Not done (outside Ticketing or needs other modules):

- Ticketed vs non-ticketed ridership and the Transport Engineering analytics: Trip Scheduling and TOS data.
- Manual boarding check when CTS or TOS is down (process 4.1): needs an offline mode, to plan with JM.
- Booth personnel training records (process 1.4): not a ticketing screen.

Checks: lint and build clean, live-data test 28 of 28. Tested in the browser: the counter opens only after all 5 checks, a sale was timed (3 seconds), a counter assigned to GEN moved the DLTB Teller to C02 (which asked for its own opening), queue counts save and a negative count is refused, and Reports shows the new sections.

Storage key is now `pitx-tms-db-v12`, so the demo loads fresh sample data once in every browser.

---

## 20 · Module renamed Ticketing and Boarding (10 Nov)

The module is now called **Ticketing and Boarding** (was Ticketing and Booking). Older entries below keep the old name.

| Where | Change |
|---|---|
| Demo | Sidebar label and the grey header line on every page ("Ticketing & Boarding · Overview") |
| Portal | Module card name (`docs/shared/modules.js`, logged in the shared changelog) |
| Docs | README, CONTRIBUTING, PLAN.md title, `index.html` title, this log's header, the comment at the top of `202611041000_ticketing_init.sql` |

No change to the folder (`docs/modules/ticketing/`), the `ticketing` schema, roles or links.

---

## 19 · Reserved status in the database (9 Nov)

The database now uses the same ticket statuses as the demo: **Reserved**, **Boarded**, **Voided**. Booked and Issued are gone. The migrations were not applied yet, so they were edited in place.

| File | What changed |
|---|---|
| `202611041000_ticketing_init.sql` | Tickets default to Reserved. Status check is Reserved, Boarded, Voided |
| `202611041002_ticketing_passengers.sql` | An online hold is a Reserved ticket with `hold_until` and no payment yet. When the Teller records the payment it stays Reserved. Only **unpaid** holds expire or can be cancelled by the passenger. The two checks became one: a ticket needs a payment or a hold time, unless voided |
| `202611061100_ticketing_core_links.sql` | Seats taken: an expired hold frees the seat only if it was never paid |
| `database/demo_data.sql` | Sample tickets are Reserved instead of Booked or Issued |
| `prototype/supabase/migrations/0001_cts.sql` (old draft) | Same status list |
| `database/test/test.mjs` | 4 new checks: a paid hold keeps its seat after the hold time, stays Reserved, can't be cancelled online, and Issued is refused. 78 of 78 pass |

Still different from the demo: online bookings in the database are pay-at-counter holds (no online payment yet). In the demo the passenger pays online at once.

---

## 18 · Team review changes (9 Nov)

Changes from the team's review of the demo.

| Review note | What changed |
|---|---|
| Booked with pay, booked without pay (block seats) | Picking a seat in POS or Book a Trip **holds** it. Nobody else (other tellers, counters, online buyers) can pick it until it is paid or the hold runs out. The hold time is in System Parameters (default 10 minutes). Held seats show in light blue on the seat map |
| Issued vs Booked | Merged into one status, **Reserved** (paid). The "Issue boarding pass" step for online bookings is gone |
| Refund by tellers | Tellers and Operator Admins refund directly, counter and online tickets alike, with no approval, until the bus leaves. After that only the PITX Admin can. Approvals now only has reprints |
| Reprint note | A reprinted pass has a red "REPRINT · COPY n" box saying when, by whom and why |
| Slicers in Tickets | Filters by trip date range, bus company (PITX Admin), route and counter, plus slicer buttons for status, source, payment and fare type, with counts and the sales total |
| Daily Trips | Trips come from Trip Scheduling and the status from TOS: no Add trip, no edit or cancel, no status dropdown. Stop selling, seat blocks and the log stay |
| "Selling fast" | Renamed **Last Few Seats** |
| Overlapping trip groups | Down from 9 to 6 groups, one per trip: Selling, Last Few Seats, Sold Out, Not Selling (with the reason: no unit, stopped or past departure), Departed, Cancelled |
| Graphs on the dashboard | Overview has seats sold by departure hour, sales by payment, and (PITX Admin) seats sold by bus company |
| Import tab | Removed. Trips come from Trip Scheduling |
| Users | Roles are now **PITX Admin** (was Super Admin), **PITX Cashier** (was Account), **Operator Admin** (was Bus Company and PUB Admin), **Teller**, and the new **Passenger**. Portal operator accounts can view as Operator Admin or Teller of their own company |
| Passenger, hold before payment | New **Book a Trip** page for passengers: pick a trip and seats (held while paying), pay by e-wallet or card, get the e-ticket, see "My tickets" |
| QR reader | Gate Test and the Tickets search take a USB or Bluetooth QR reader as is (it types the ticket number and presses Enter). Scanning in Tickets opens that ticket |
| BIR invoice | The boarding pass now carries the invoice part: operator name, address, TIN, MIN, serial no., PTU no., invoice no., regular fare, discount, VAT-exempt sale, "This document serves as your invoice". Finance to confirm the wording |

Not changed yet:

- **Bus size (2x2, 3x2) defined in Trip Scheduling:** for JM. Ticketing already takes the seat map from Trip Scheduling's capacity when on real data.
- **Database:** the `ticketing` migrations still used Booked and Issued. Renamed to Reserved in entry 19.

Storage key is now `pitx-tms-db-v11`, so the demo loads fresh sample data once in every browser.

## 17 · Sample data for Genesis Transport (9 Nov)

- Genesis Transport Service Inc. is now a sample company in the demo, so the team can
  explore ticketing as a real operator account (`genesis-ops`). It's on the Northern Routes
  list from Terminal Ops. Its routes, fares, plates and passengers are made up, like the
  other sample companies.
- What it has:
  - code GEN; no logo yet, so its code shows instead
  - 2 bus types (49-seat regular, 45-seat deluxe), 2 units each
  - one route, PITX to Northern Routes
  - **9 trips**: 6 today (2 departed, 1 boarding, 1 selling, 1 stopped selling, 1 waiting
    for a unit), 2 tomorrow, 1 the day after
  - **185 tickets** with cash, card and e-wallet sales, online bookings, refunds and
    boarded passengers
  - **2 requests waiting for the Ticketing Admin**: one refund, one reprint
- Signing in as `genesis-ops` opens the Bus Company role for Genesis only. Operator accounts
  now also match their company when the company's first word is in the account name
  ("genesis-ops" is GENESIS), not only on an exact name.
- The browser storage version went from v9 to v10, so every browser loads the new sample
  data once. Sales anyone made in the demo before this are cleared.
- Fixed: the avatar initials and the new name match split names on the letter "s" instead
  of on spaces, because a regex lost its backslash. "Ronald Victoria" now shows "RV".
- Checked in the browser as `genesis-ops`: Genesis only, 6 trips today, 165 tickets sold,
  ₱140,580 sales, and the Bus Company menu.

---

## 16 · Page headers, tiles and logo exactly as on TS (9 Nov)

Compared with a Trip Scheduling Overview screenshot. The differences were:
- **Page header:** TS hides the small grey label above the title. It puts a "?" next to the
  title, and the page description shows only when you click it (`tidyPageHead()` in
  `platform.js`). `PageTitle` now builds the same `.page-head`, `.help-dot` and
  `.page-help` markup.
- **Title size:** the demo forced a 28px title; it now uses the shared h1 as is.
- **Section heads:** grey sub-heads (Tickets, Trips, Waiting for you, Recently decided, To
  count, Reconciled) now use the shared `.section-head`, the small grey caps TS uses for
  "Utilization" and "By gate".
- **Tiles:** Overview tiles show a unit after the number, like TS's "20 requests": "200
  tickets", "25 passes", "84 passengers", "5 tickets".
- **Notice:** the yellow demo-data notice moved from above the title to under it, where TS
  puts its own callouts.
- **Sidebar logo:** it keeps its full size like on TS. Before, it shrank to make room for
  "Ticketing & Booking".
- A browser that still shows "Dashboard" has the old copy cached. GitHub Pages caches for
  10 minutes, and Ctrl+F5 reloads it.

---

## 15 · Overview, Inter and page headers like the other modules (9 Nov)

- "Dashboard" is now **Overview**, like Trip Scheduling and TOS. The page is titled Overview,
  with the date (and company, for operators) in the line under it.
- **Font:** the demo now loads Inter from Google Fonts, the same link and weights (500 to
  800) as the other modules' pages. Before this it fell back to the system font, because the
  shared stylesheet names Inter but doesn't load it.
- **Page headers:** every page now opens with the same block as Trip Scheduling and TOS:
  - a small grey eyebrow, "Ticketing & Booking · <page>"
  - the large title
  - the grey one-line description where the page has one

  It's done by a new `PageTitle` component (`prototype/src/components/page-title.tsx`) used
  by all 14 pages.
- Checked in the browser: Inter is loaded and used for the titles, and the sidebar, eyebrow
  and Overview page look right.

---

## 14 · Made-up sales on the real PITX trips (9 Nov)

- When the demo shows real PITX trips, each trip with no tickets yet now gets made-up sales,
  so the screens aren't empty: POS, Tickets, Manifest, Availability, Reports and Close Sales
  ([prototype/src/lib/demo-sales.ts](prototype/src/lib/demo-sales.ts)).
- Where they come from:
  - Passengers come from the sample name list (Sample, Tester, Demo and the like).
  - Ids start with `demo-`, and booking, payment and ID refs with `DEMO-`.
  - The fare comes from the route's placeholder fare. Student, Senior and PWD are 20% off.
- How the sales are spread:
  - Departed trips are 55 to 95% sold and marked Boarded. Later trips are 10 to 70% sold.
  - Mostly cash at the counter, about one in five sold online, and a few refunds.
- Seats that are blocked, or that passengers requested through Trip Scheduling, are never
  used.
- A bus with no known seat count gets sales for 45 seats. Its trip still shows no seat map
  in POS.
- The same trip always gets the same sales. A refresh doesn't double them, and a trip
  someone already sold on gets none.
- The banner says passengers and sales are made up.
- Tested: the live loader test, now 28/28, adds checks for the made-up sales, no doubles on
  refresh, and seat rules. Not seen with a real staff account.

---

## 13 · Same look as Trip Scheduling and TOS (9 Nov)

- The demo now uses the PITX App design: the shared stylesheet (`docs/shared/styles.css`)
  and the same sidebar and topbar markup as `renderNav`. That means the dark rail with the
  same icons, Inter, grey background, white cards, PITX blue, and the avatar menu top right.
- Kept as a single source: `prototype/scripts/sync-shared.mjs` copies `styles.css` and the
  `ICONS` from `platform.js` into the demo before every dev run and build. The copies
  (`src/app/pitx-shared.css`, `src/lib/pitx-icons.json`) are committed so the demo also
  builds outside the repo; don't edit them by hand.
- The shared styles sit in their own CSS layer, between Tailwind's reset and its utilities.
  Tailwind's colours, corners and font now point at the shared tokens (slate greys, brand
  and accent are PITX blue, 10px buttons, 16px cards). So the 16 screens follow the same
  palette without being rewritten one by one.
- Page titles, section headings and table headers follow the shared h1, h2 and th styles.
  The summary tiles on the Dashboard and Reports now use the shared `.kpi` tiles.
- The account menu (avatar, top right) holds the name, role, company and counter, plus:
  - "View as"
  - "Refresh from PITX" and "Reset demo data" (Super Admin)
  - "All modules"

  The bus company's logo shows in the topbar.
- Checked in the browser against a Trip Scheduling page, at 1366 px wide: Dashboard,
  Master Data, POS (seat map) and Tickets, plus the account menu. Not checked: every
  screen at phone width.

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
