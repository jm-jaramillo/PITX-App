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

## Open items

- **Gate hardware:** not connected. Devices are listed as *planned*. Real
  cameras should call `tos_gate_read` through a device adapter (e.g. an Edge
  Function with its own key).
- **Trip data quality:**
  - Many approved trips have no plate assigned, so the camera can't match them.
  - About half of the approved vehicles show expired OR/CR or CPC dates. Worth
    checking against real documents before relying on the "Expired" rule.
- **Entry gates aren't tied to destinations yet.** Test reads use Entry Gate 1.
- **Commuter list:** review it on Devices & rules. Only four destinations are
  marked commuter.
