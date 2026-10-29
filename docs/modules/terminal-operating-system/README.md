# Terminal Operating System (TOS)

Owner: @Jcbllanto16 · Issue #1

TOS decides what happens to a bus at the terminal gates. Each plate read is
checked against the bus's approved trip in Trip Scheduling and the approved
vehicle masterfile. TOS then opens the barrier, sends the bus to staging, asks
staff to decide, or keeps it out. It also shows the bays and the concourse
departure board from what the gates have recorded.

Staff accounts can open it from the module picker after signing in.

## Pages

| Page | What it shows |
| --- | --- |
| `gates.html` | Gate monitor (landing page): barrier state per gate, buses expected at the gates in the next 2 hours, every plate read today, vehicles waiting for a staff decision, and test reads |
| `overview.html` | Today's totals, entries per hour, why buses were stopped, and the buses expected next |

**Expected at the gates** lists approved trips whose bay window opens within
2 hours, plus overdue ones up to 20 minutes past ETD. Each trip is checked
before its bus arrives: no plate assigned, plate not in the masterfile, or
expired documents means the gate camera cannot let it in, so staff can fix
it in Trip Scheduling first.
| `bays.html` | Bay timeline for any day, with trip detail, documents and gate history |
| `board.html` | Concourse departures board in PITX blue and red, with All / Provincial / Commuter tabs |
| `feed.html` | What TOS receives from Trip Scheduling: approved trips for a day, the vehicle masterfile, and vehicles with expired documents |
| `rules.html` | Gate rules (saved to the database), devices, clearing test reads, and which destinations are commuter or provincial |

**Commuter or provincial:** Trip Scheduling stores no service type, so TOS
keeps its own destination list (`tos.route_service`), which staff edit on
Devices & rules. Any destination not marked commuter counts as provincial.
The first commuter list was ALABANG, PACITA COMPLEX, BIÑAN, LAGUNA and
STA. ROSA, LAGUNA.

`assets/tos.js` holds the module's helpers (snapshot model, trip status,
live refresh, sidebar) and re-exports `../../shared/platform.js`.

## How a gate read is decided

A trip's ETD is its Trip Scheduling slot start. Its **bay window** opens 30
minutes before ETD, and the gate rules are measured from that moment:

1. Plate read below the minimum confidence: ask staff.
2. Plate not in the approved masterfile: the "Unregistered plate" rule.
3. CPC or OR/CR expired: the "Expired CPC or OR/CR" rule.
4. No approved trip today for the plate: if the operator has a trip to the
   same destination due now, the "Substitute bus" rule (default: ask staff);
   otherwise the "No trip today" rule.
5. Earlier than the early entry window: staging; released automatically when the window opens.
6. Later than the grace period: the "Late beyond grace" rule.
7. Otherwise the barrier opens.

The exit gate marks the trip departed.

### Substitute buses (different plate from the booking)

Operators sometimes send a different bus than the one booked. The trip does
not need to be booked again. A registered bus with valid documents that is
not on any trip today is held for staff when its operator has a trip to the
same destination whose entry window is open (or that is overdue). The review
card offers **Swap onto <trip>** for each such trip, plus **Keep closed**.

Swapping calls Trip Scheduling's own `staff_set_booking_plate()`, so its
checks apply: same operator, registered for that destination, valid CPC, and
not booked in the adjacent slot. If it refuses, its message is shown and the
barrier stays closed. Otherwise the booking's plate changes in Trip
Scheduling, the bus is let in on that trip, and the gate event records the
plate the trip had before (`swapped_from`).

For test reads, the swap runs those checks and then rolls the change back,
so a test never changes a real booking.

Trips with no plate assigned in Trip Scheduling cannot be matched by a camera.
The bay timeline and trip feed flag them so they can be fixed before the bus
arrives.

## Database

Migrations:

- `supabase/migrations/202610281830_trip-scheduling_tos_feed.sql` (owned by
  Trip Scheduling): `tos_trip_feed(date)`, `tos_vehicle_masterfile()` and
  `tos_vehicle_lookup(plate)`. These are staff-only, read-only views of
  approved trips and vehicles. TOS never reads `bookings` or `vehicles`
  directly.
- `supabase/migrations/202610281831_terminal-operating-system_init.sql`: the
  `tos` schema (`rules`, `gates`, `devices`, `gate_events`, `trip_state`) with
  RLS, and the API functions:

| Function | Used by |
| --- | --- |
| `tos_snapshot(date)` | every page: rules, gates, devices, bays, the day's trips with their gate state, gate events, and the vehicles involved |
| `tos_gate_read(gate, plate, confidence, booking, test)` | the device adapter (and test reads) |
| `tos_resolve_review(event, allow)` | Open barrier / Keep closed |
| `tos_swap_plate(event, booking)` | Swap a substitute bus onto a trip (added in `202610291400_terminal-operating-system_plate_swap.sql`) |
| `tos_set_rules(jsonb)` | Devices & rules |
| `tos_simulate(kind)` / `tos_clear_tests()` | test reads until the hardware is connected |
| `tos_route_services()` / `tos_set_route_service(route, service)` | the commuter / provincial list (added in `202610291100_terminal-operating-system_route_service.sql`) |

Every function checks `public.is_staff()`. The `tos` schema is not exposed
through the REST API, so pages can only reach it through these functions.

Pages poll `tos_snapshot` every 20 seconds while visible, and right after
every action.

## Not done yet

- Gate hardware: devices are listed as "planned". Real cameras should call
  `tos_gate_read` from a device adapter, such as an Edge Function holding a
  device key.
- Entry gates are not tied to destinations yet. Test reads use Entry Gate 1.
