# Project log

Build history of the Terminal Operating System (TOS) module of PITX App.
Owner: @Jcbllanto16 · Issue [#1](https://github.com/jm-jaramillo/PITX-App/issues/1)
Repo: <https://github.com/jm-jaramillo/PITX-App>
Live: <https://jm-jaramillo.github.io/PITX-App/modules/terminal-operating-system/gates.html> (staff sign-in)

Dates and times are Manila time. Commits are on `main`, and migrations are
listed with the entry that added them. Every migration was applied to the
Supabase project at the time and recorded in `public._schema_migrations`.

---

## Decisions as agreed

| Decision | Choice |
|---|---|
| Who uses TOS | Existing `staff` accounts. Staff now get the module picker after login (Trip Scheduling and TOS) |
| Source of trips and vehicles | Real Trip Scheduling data: approved bookings and the approved vehicle masterfile, read only through Trip Scheduling feed functions, never its tables |
| Trip times | A trip's ETD is its Trip Scheduling slot. The bay window opens 30 min before ETD, and gate rules are measured from it |
| Test traffic | No automatic simulation on live data. Staff send marked test reads by hand and can clear them |
| Commuter vs provincial | Trip Scheduling has no such field, so TOS keeps its own destination list, edited by staff |
| Different plate from the booking | No rebooking. Staff swap the plate on the existing trip through Trip Scheduling's own staff function |
| Unregistered / unclear plates | Held for staff, who must type the plate on the bus before letting it in or keeping it out |
| Database | jm-jaramillo's Supabase project (the one in `docs/shared/config.js`). Changes are additive: a `tos` schema plus `public.tos_*` functions |

---

## Before the repo: prototype (28 Oct, afternoon)

- A stand-alone prototype, "PITX Terminal Ops", was built as a single page
  with simulated gates, bookings and devices.
- It was then backed by its own Supabase project ("PITX TOS") with a schema,
  demo seed, gate decision function and staff-only access.
- That project and page were superseded by this module. Nothing from them is
  used by PITX App.

---

## 1 · Module created (28 Oct, 18:48–18:51)

Commits `1f0f405`, `ff1a493`, `789e576`, `75cb2d8`, `1b0007e`

- **New module** `docs/modules/terminal-operating-system/` on the shared
  platform (login, sidebar, styles). It has six pages:
  - **Gate monitor** (landing): barrier state per gate, every plate read today, vehicles waiting for staff, and test reads.
  - **Overview**: today's totals, entries per hour, why buses were stopped.
  - **Bay timeline**: trips on their bays for any day, plus trip detail with documents and gate history.
  - **Passenger board**: concourse departures.
  - **Trip feed**: the day's approved trips, the vehicle masterfile, and expired documents.
  - **Devices & rules**: gate rules saved to the database, devices, and clearing test reads.
- **Gate decision** for every plate read, in order:
  1. Unclear read: ask staff.
  2. Unregistered plate: the "Unregistered plate" rule.
  3. Expired CPC or OR/CR: the "Expired" rule.
  4. No trip today: the "No trip today" rule.
  5. Too early: sent to staging, released automatically when the window opens.
  6. Too late: the "Late" rule.
  7. Otherwise the barrier opens.

  The exit gate marks the trip departed.
- **Migrations**
  - `202610281830_trip-scheduling_tos_feed.sql` (Trip Scheduling-owned):
    `tos_trip_feed(date)`, `tos_vehicle_masterfile()` and
    `tos_vehicle_lookup(plate)`. These are staff-only and read-only.
  - `202610281831_terminal-operating-system_init.sql`: the `tos` schema
    (`rules`, `gates`, `devices`, `gate_events`, `trip_state`) with RLS on
    `is_staff()`. Also `tos_snapshot`, `tos_gate_read`, `tos_resolve_review`,
    `tos_set_rules`, `tos_simulate` and `tos_clear_tests`.
- **`docs/shared/modules.js`**: the "Coming soon" TOS card became the live
  module for `staff`.
- **Root README**: module status row.
- Summary posted on issue #1 for @jm-jaramillo.

## 2 · Trip Scheduling links to TOS (28 Oct, 19:21)

Commit `fc4edd6` (edits Trip Scheduling's `schedule.html`)

- On the staff Schedule board, an approved trip's **Trip No.** links to the
  TOS Bay timeline for that day with the trip selected. Cancelled rows stay
  plain.

## 3 · Expected at the gates (29 Oct, 10:20)

Commits `97daf12`, `5b6d97d`

- **Gate monitor and Overview** list approved trips whose bay window opens in
  the next 2 hours, plus overdue ones up to 20 min past ETD.
- **Gate check per trip**: *Ready*, *No plate assigned*, *Plate not in
  masterfile* or *Documents expired*, so staff can fix it in Trip Scheduling
  before the bus arrives.
- **Overview** gets an "Expected next 2 hours" tile.

## 4 · Passenger board: PITX blue and red, commuter / provincial (29 Oct, 13:42–13:43)

Commits `3d5e199`, `dcbdbcf`, `e8963b8`

- **New look:** the board drops the dark concourse style for the app palette.
  - A PITX-blue header band with a red rule beneath it, and white rows.
  - Remarks in blue while on track; solid blue for *Bus at bay* and *Boarding*.
  - Red for *Final call* (blinking), *Delayed* and *Cancelled*.
- **Tabs:** *All departures / Provincial / Commuter*, with counts. The tab is
  kept in the link (`board.html?tab=commuter`) so a screen can show one group.
- **Devices & rules → Commuter and provincial routes:** every destination from
  the vehicle masterfile, with a Commuter / Provincial choice that saves
  immediately. Destinations not marked count as provincial. The seeded
  commuter list is ALABANG, PACITA COMPLEX, BIÑAN, LAGUNA and
  STA. ROSA, LAGUNA.
- **Migration** `202610291100_terminal-operating-system_route_service.sql`:
  `tos.route_service`, `tos_route_services()` and `tos_set_route_service()`.
  `tos_snapshot` adds `service` to each trip.

## 5 · Trip numbers on the passenger board (29 Oct, 13:46)

Commits `4ee3eaa`, `9ba8999`

- New **Trip** column (e.g. `TAB0800`) between ETD and Destination, from Trip
  Scheduling.

## 6 · Substitute buses: swap the plate at the gate (29 Oct, 14:06–14:07)

Commits `604e4ef`, `07e3da3`, `0f36f10`

- **The problem:** an operator sends a different bus than the one booked, and
  the gate refused it as "No trip today".
- **Now:** a registered bus with valid documents that isn't on any trip,
  while its operator has a trip to the same destination due now, is **held
  for staff**. This is the new rule *Substitute bus*, default *Ask staff*.
- **Swap onto <trip>** on Gate monitor and on the trip's Bay timeline detail
  changes the booking's plate through Trip Scheduling's
  `staff_set_booking_plate()`. Its checks apply: same operator, registered for
  that destination, valid CPC, and not booked in the adjacent slot. The bus is
  then let in on that trip.
- **Opening the barrier without a swap** doesn't mark any trip arrived. Test
  reads run the swap checks and roll the booking change back.
- New **Substitute bus** test button.
- **Migration** `202610291400_terminal-operating-system_plate_swap.sql`:
  `tos_swap_plate()`, `on_substitute` rule, `gate_events.swapped_from`.

## 7 · Staff type the plate when swapping (29 Oct, 14:31–14:32)

Commits `c78f2a3`, `d2de9bd`, `59406a4`

- **Swap onto <trip>** opens a form, and staff must type the plate on the bus.
  The camera read is only shown for reference, so a misread can be corrected.
- **The typed plate is checked:** it must be in the approved masterfile with a
  valid OR/CR and CPC, and not already on that trip. Trip Scheduling's checks
  then apply as before.
- **The event records** the camera read, the typed plate (`swapped_to`) and
  the trip's previous plate (`swapped_from`).
- **The page doesn't redraw** while staff are typing.
- **Migration** `202610291600_terminal-operating-system_swap_plate_entry.sql`:
  `tos_swap_plate(event, booking, plate)` replaces the two-argument version.

## 8 · Fix: blank Gate monitor after an update (29 Oct, 14:39)

Commit `50790ac`

- **Cause:** GitHub Pages lets browsers cache files for 10 minutes. A browser
  loaded the new `gates.html` with an old cached `tos.js`, the page script
  failed on a missing export, and the page stayed blank with no sidebar.
- **Fix:** every page now loads `assets/tos.js?v=…` and `assets/tos.css?v=…`.
  **Bump the version on every page whenever either file changes** (see
  README).

## 9 · Unregistered and unclear reads: staff record the plate (29 Oct, 14:53)

Commits `cc8b40c`, `7dd16ea`, `e6b2986`

- **The "Unregistered plate" rule now defaults to *Ask staff*.** The live rule
  was switched from *Keep barrier closed*.
- **Plate box on the card:** an unregistered or unclear read shows
  **Let in / Keep closed** with a plate box. Staff must type the plate on the
  bus for either choice, for tracking.
- **The event says what the typed plate is**, e.g. "Staff entered NKC1637:
  registered to CERES-GOLDSTAR, trip CEB1600 at 16:00 (camera read CDF2443)".
- **Misreads:** if the typed plate is a registered bus with a trip due today,
  letting it in records the arrival on that trip. Keeping it out never cancels
  a trip.
- **Migration** `202610291800_terminal-operating-system_confirm_plate.sql`:
  `tos_confirm_plate()`, `gate_events.confirmed_plate`, `on_unregistered`
  default *REVIEW*.
- Pages bumped to `?v=20261029-2`.

## 10 · Analytics (30 Oct)

- **New Analytics page** (`analytics.html`, sidebar link *Analytics*). Pick a
  date range of up to 62 days; by default it shows the last 7 days. Test reads
  are left out unless *Include test reads* is ticked.
- **Totals:** trips booked, average bay utilization, late arrivals, early
  arrivals and unregistered plates.
- **Four sheets**, each with **Export CSV**:
  - **Bay utilization**: per bay, the approved trips booked on it, hours
    booked (30 min per trip), days used, busiest 15-minute slot, and
    utilization as booked time over 24 h per day.
  - **Late arrivals**: gate reads more than the grace period after the bay
    window opened, with trip, operator, plate, minutes late and outcome.
  - **Early arrivals**: buses sent to staging, with minutes early and when
    they were released.
  - **Unregistered**: camera read, read confidence, the plate staff entered,
    and the outcome.
- **Migration** `202610301000_terminal-operating-system_analytics.sql`:
  `tos_analytics(from, to, include_tests)`.
- Pages bumped to `?v=20261030-1`.

## 11 · Device API for gate hardware (3 Nov)

- **Why:** IT asked for the code that sits between the camera/barrier SDK and
  the app. TOS now has a device endpoint and a written contract, so the vendor
  or IT only writes the small gate controller (SDK → endpoint → barrier).
- **[DEVICE-API.md](DEVICE-API.md):** the interface agreement for IT and the
  vendor. Covers endpoints, JSON, the barrier actions (`open`, `keep_closed`,
  `staging`, `wait_for_staff`), safe retries, offline mode and replay, errors,
  testing, and questions for the vendor.
- **Edge Function `tos-device`** (`supabase/functions/tos-device/index.ts`):
  `/read`, `/reads` (batch after an outage), `/event` (wait for staff),
  `/heartbeat`, `/bundle` (rules, trips and masterfile for offline use) and
  `/ping`. It authenticates with a per-device key, not a staff login.
- **Devices & rules → Device keys:** staff create a key per camera or
  controller (limited to one gate or any gate). The key is shown once and
  stored only as a hash. Staff can revoke keys and see when each was last used.
- **Same gate rules for every read:** the decision logic moved into
  `tos.gate_read_core()`. Staff test reads and device reads both use it.
  Device reads are judged at the camera's own read time, so reads queued
  offline still count as on time or late correctly.
- **`tools/device-simulator.ps1`:** acts as a gate controller from any Windows
  PC. It covers a demo run, single reads, waiting for staff, an offline queue
  with retry, heartbeats and the bundle. It sends test reads unless `-Live` is
  passed.
- **Tested live** with a temporary key and test reads:
  - registered bus, unknown plate and unclear read
  - staff decision reaching the waiting device
  - offline queue, where the retry came back as duplicates
  - wrong-gate and revoked-key errors
  - the bundle

  The key was then revoked and the test reads cleared.
- **Migrations**
  - `202611031000_trip-scheduling_tos_feed_service_role.sql`
    (**Trip Scheduling-owned, for @jm-jaramillo to review**):
    `tos_trip_feed` and `tos_vehicle_masterfile` also answer the service role
    used by the endpoint. They are still read-only, approved rows only, and
    give nothing to anon or operators.
  - `202611031001_terminal-operating-system_device_api.sql`:
    - `tos.device_keys`
    - `gate_events.source` / `device_key_id` / `device_read_id`
    - `tos.gate_read_core`
    - `tos_device_read` / `_event` / `_heartbeat` / `_bundle`, which only the
      service role can call
    - `tos_create_device_key`, `tos_revoke_device_key` and `tos_device_keys`
      for staff

## 12 · Bays are switched on and off in TOS only (11 Nov)

> Applied on 11 Nov after @Jcbllanto16 approved it. The trigger is on Trip
> Scheduling's `public.bays`: logged as Trip Scheduling entry 121 for
> @jm-jaramillo to review.

- **Devices & rules → Bays in service** is now the only place staff put a bay
  in or out of service. For each bay, grouped by gate, it shows:
  - the approved trips on it in the next 14 days, and the next one
  - who last changed it, and when
- **Taking a bay out of service** asks for a second click. If trips are
  already booked on that bay, it says how many: they keep the bay, and staff
  move them in Trip Scheduling if needed. The last bay in service can't be
  switched off.
- **Trip Scheduling → Bays** keeps *Add bay* and *Rename*. Its
  *Activate/Deactivate* button is gone, and the page links to TOS instead.
  Trip Scheduling still uses the setting exactly as before: bay picking and
  trips per slot.
- **The rule is enforced in the database.** A guard on `public.bays` refuses
  any change to `is_active` made straight from a page. Only TOS's function
  can change it.
- **Bay timeline** still shows a bay that is out of service when trips are
  already booked on it that day, marked "·off".
- **Migration** `202611111000_terminal-operating-system_bay_activation.sql`:
  - `tos.bay_changes` (log)
  - `tos_bays()`
  - `tos_set_bay_active(bay, active, note)`
  - the `tos_guard_bay_activation` trigger on `public.bays`
    (**Trip Scheduling's table, for @jm-jaramillo to review**)
  - `tos_snapshot` now returns every bay, each with an `active` flag

## 13 · Driver directions at the gate: "Proceed to Bay X" (11 Nov)

- **Every device answer now includes `bay` and `display`.** That covers
  reads, batch reads and staff decisions picked up by polling. `display` is
  ready-made text for the gate's LED board:
  - *PROCEED TO BAY 20 / NA20400 NAGA, CAMARINES NORTE 04:00* (green)
  - *PROCEED TO STAGING / ENTRY FROM 03:00* (amber)
  - *PLEASE WAIT / STAFF ARE CHECKING* (amber)
  - *ENTRY NOT ALLOWED / PLEASE SEE TERMINAL OFFICE* (red)
  - *THANK YOU / SAFE TRIP* at the exit (green)
- **When staff let a waiting bus in,** the gate's next poll turns *PLEASE WAIT*
  into *PROCEED TO BAY nn*.
- **[DEVICE-API.md](DEVICE-API.md) v1.1** documents this in §2.1a, and asks the
  vendor about the gate board (question 9). The simulator prints the board
  text in colour.
- **Tested** against the live endpoint with a temporary key and test reads. A
  late bus was shown *PLEASE WAIT*; after staff let it in, the sign changed to
  *PROCEED TO BAY 36*. The key was then revoked and the reads deleted.
- **Fixed while testing:** a read with no trip (an unknown plate) briefly made
  the answer fail. It was fixed live within minutes, and no hardware was
  connected at the time.
- **Migration** `202611111100_terminal-operating-system_device_bay_directions.sql`:
  `tos.device_answer`.

## 14 · Overview for any day or month (11 Nov)

- **Overview has a period picker: *Today / Day / Month*.**
  - **Today** is the live view, unchanged.
  - **Day** shows any date, with ‹ › to step one day.
  - **Month** shows any month, with ‹ › to step one month.
  - The choice is kept in the link, e.g. `overview.html?month=2026-11` or
    `?day=2026-11-03`, so a view can be bookmarked or shared.
- **Day and Month show:**
  - Totals: trips booked (and how many have no plate), buses let in, on-time
    arrivals, turned away (and unregistered), and no-shows
  - Gate entries, per hour for a day or per day for a month. Click a day's
    bars to open that day.
  - "Why buses were stopped" for the period
- **Test reads** are left out unless *Include test reads* is ticked. When a
  period has trips but no gate reads, a note explains that every past trip
  counts as a no-show until the cameras are connected.
- **Migration** `202611111200_terminal-operating-system_overview_range.sql`:
  `tos_overview_range(from, to, include_tests)`, up to 62 days. It uses the
  same definitions as the live Overview.

## 15 · Late bus: TOS finds a vacant bay. Devices & rules in tabs (11 Nov)

- **When a bus arrives past the grace period** (a *Late* read waiting for
  staff), Gate monitor and the Bay timeline trip detail now list where it can
  go, searched in this order:
  1. **Same bay:** at its own time if there is still room, otherwise the next
     free 15-minute slots on that bay.
  2. **Same gate:** another bay in service at that gate.
  3. **Same floor:** another bay on the same floor.

  Within a step, the earliest departure wins. The best option is the main
  button, e.g. *Bay 20 · departs 04:30 (same bay)*, with up to two
  alternatives beside it. If nothing is free, staff can still *Open barrier
  anyway* or *Keep closed*.
- **What counts as free for a departure slot:**
  - the bay is in service;
  - no other pending or approved trip that hasn't left yet is booked on it
    from now through that slot;
  - the bus gets at least 15 minutes to board;
  - the same vehicle isn't booked in an adjacent slot (Trip Scheduling's
    rule).

  The search looks 2 hours ahead, on the same day.
- **One click moves the trip and opens the barrier.** The trip's bay and
  departure slot change in Trip Scheduling, and its own checks (one approved
  trip per bay and slot, pending proposals re-picked) still apply. The move is
  logged in `tos.trip_moves`, the gate log says where the bus went, and the
  gate sign shows *PROCEED TO BAY nn* with the new time. A test read runs the
  move and rolls it back.
- **Floors:** Trip Scheduling has no floors, so each bay now has a **Floor**
  box on Devices & rules › Bays. It suggests floor names already used. Bays
  with no floor count as one floor.
- **Devices & rules is split into tabs:** *Gate rules* (with test reads),
  *Bays*, *Devices & keys* (connection overview, devices, device keys) and
  *Routes*. The tab is kept in the link: `rules.html#bays`, which is also
  where Trip Scheduling's Bays page now points.
- **Tested** in a rolled-back transaction on live data. A bus booked on Bay 20
  at 04:00 arrives at 04:05:
  - normally, it gets **Bay 20 at 04:30** (same bay);
  - with Bay 20 out of service, **Bay 18 at 04:30** (same gate);
  - with all of Gate 4 out of service, **Bay 1 at 04:30** (same floor);
  - with Gate 4 on its own floor and all of it off, **no bay**, so staff decide.

  The pages were checked locally with fake data.
- **Migration** `202611111300_terminal-operating-system_late_bay_finder.sql`:
  - `tos.bay_floor`, `tos.trip_moves`
  - `tos_set_bay_floor`, `tos_late_bay_options`, `tos_move_late_trip`
  - `tos_bays` now returns the floor

  The move writes `public.bookings` (bay and slot), so it is logged as Trip
  Scheduling entry 122 for @jm-jaramillo.
- Pages bumped to `?v=20261111-1`.

---

## Migrations (in order)

| File | Entry |
|---|---|
| `202610281830_trip-scheduling_tos_feed.sql` | 1 |
| `202610281831_terminal-operating-system_init.sql` | 1 |
| `202610291100_terminal-operating-system_route_service.sql` | 4 |
| `202610291400_terminal-operating-system_plate_swap.sql` | 6 |
| `202610291600_terminal-operating-system_swap_plate_entry.sql` | 7 |
| `202610291800_terminal-operating-system_confirm_plate.sql` | 9 |
| `202610301000_terminal-operating-system_analytics.sql` | 10 |
| `202611031000_trip-scheduling_tos_feed_service_role.sql` | 11 |
| `202611031001_terminal-operating-system_device_api.sql` | 11 |
| `202611111000_terminal-operating-system_bay_activation.sql` | 12 |
| `202611111100_terminal-operating-system_device_bay_directions.sql` | 13 |
| `202611111200_terminal-operating-system_overview_range.sql` | 14 |
| `202611111300_terminal-operating-system_late_bay_finder.sql` | 15 |
| `202611121100_terminal-operating-system_bay_add_rename.sql` | 16 |
| `202611121000_terminal-operating-system_bay_service.sql` | 17 |

## Open items

- **Gate hardware:** the device endpoint is ready ([DEVICE-API.md](DEVICE-API.md)).
  Still needed:
  - the vendor's answers to the questions in DEVICE-API.md §7
  - the gate controller program from IT or the vendor
  - a device key for each gate
  - acceptance tests on the real hardware

  Until then, devices are listed as *planned*.
- **Trip data quality:**
  - Many approved trips have no plate assigned, so the camera can't match them.
  - About half of the approved vehicles show expired OR/CR or CPC dates. Worth
    checking against real documents before relying on the "Expired" rule.
- **Entry gates aren't tied to destinations yet.** Test reads use Entry Gate 1.
- **Commuter list:** review it on Devices & rules. Only four destinations are
  marked commuter.

## 16 · Add and rename bays here (12 Nov)

> Logged as Trip Scheduling entry 128. Requested by @jm-jaramillo; edits
> `rules.html` and adds migration `202611121100_terminal-operating-system_bay_add_rename.sql`.
> **@Jcbllanto16: please review.**

- **Devices & rules → Bays** now also has **Add bay** and a **Rename** link per
  bay (`tos_add_bay`, `tos_rename_bay`, staff only, names must be unique). Together
  with in/out of service and floors, the whole bay list is managed here.
- Trip Scheduling's Bays page is now a redirect to this tab.

---

## 17 · Bays labelled commuter or provincial, with their routes (12 Nov)

- **Devices & rules › Bays** has a *Service & routes* cell for each bay:
  - **Provincial / Commuter.** Provincial bays are booked through Trip
    Scheduling. Blank counts as provincial.
  - **Routes:** free text for what the bay serves, e.g. "Alabang, Pacita P2P".

  Both save as soon as they change. Each gate heading shows its provincial and
  commuter counts.
- **Late-bus search:** it only offers bays of the same service as the trip's
  own bay, so a provincial bus is never sent to a commuter bay.
- **Not changed:** Trip Scheduling's bay picking still uses every bay in
  service. Whether it should skip commuter bays is for @jm-jaramillo to decide.
- **Tested** in a rolled-back transaction. With a Gate 4 bus's own bay out of
  service, the search offered Bays 18, 19, 21, 22 and 23. With Bays 18 and 19
  marked commuter, it offered only 21, 22 and 23. Clearing a bay's labels
  removes its settings row, and an unknown service is refused. The page was
  checked locally with fake data.
- **Migration** `202611121000_terminal-operating-system_bay_service.sql`:
  - `tos.bay_floor` gains `service` and `route_label`, and `floor` becomes
    optional
  - new `tos_set_bay_service`
  - `tos_bays` returns the service and route label
  - `tos_set_bay_floor` keeps the other settings when the floor is cleared
  - `tos.late_bay_options` matches the service

---
