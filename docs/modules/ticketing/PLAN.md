# Ticketing and Booking: build plan

Owner: @victoriaronald. Status: **draft for review by @jm-jaramillo and @Jcbllanto16.**
Nothing here is built or migrated yet.

The ticketing rules were worked out in a separate prototype (Next.js, browser storage
only, not in this repo). This plan moves them into this repo the way CONTRIBUTING.md
asks: plain pages in `docs/modules/ticketing/`, a `ticketing` schema with RLS, and trip
data only through functions Trip Scheduling exposes.

## 1. What Ticketing does

Counter selling and everything after it, per the CTS requirements and the PITX App Work
Program (CTS-TB):

- POS: pick a trip, pick one or more seats on the real seat map, passenger details,
  fare type (Adult, Student, Senior, PWD with ID), cash with change or card/e-wallet
  reference, boarding pass with QR. Search by province, town, first letter, time of day.
- Passes: first print, then reprint only with a reason, charge and approval.
- Refunds: reason categories, set refund percentage, Teller cutoff (default 4 hours
  before departure), Ticketing Admin approval inside the cutoff or by setting.
- Seat change and transfer to another trip, with a reason.
- Close Sales (Teller, blind count, one-use approval code) and Daily Sales Collection
  (Account, blind count, totals shown only after both counts).
- Manifest, ticket availability (Available, Selling Fast, Sold Out, On-Hold),
  reports and Excel export, ticket history.
- System Parameters: cutoffs, check-in window, insurance, refund and reprint rules.

Out of scope (owned elsewhere): trip scheduling, bays, gates, vehicles, gate validation
hardware (TOS issue #1).

## 2. What Ticketing needs from Trip Scheduling

Ticketing never reads `public.bookings`, `public.vehicles` or `public.seat_reservations`
directly. Proposed functions, owned by Trip Scheduling, same pattern as `tos_trip_feed`:

| Function | Returns | Why |
|---|---|---|
| `ticketing_trip_feed(p_date)` | approved trips: booking_id, trip_number, route, ETD, operator_id, operator_name, trade_name, plate_no, seating capacity, bay name, gate | Trips to sell and their seat map |
| `ticketing_seat_holds(p_booking_id)` | seats held or blocked by passenger seat requests | So the POS never sells a seat a passenger already holds |
| `ticketing_vehicle_capacity(p_plate)` (optional) | seating capacity for a replacement plate | Seat carry-over when a plate changes |

Questions for @jm-jaramillo:

1. **Passenger seat requests (0051).** Today the Ticketing Admin "blocks the same seats
   in the ticketing system". Ticketing is that system now. Proposal: a request's seats
   show as held in the POS, and selling them converts the request (Trip Scheduling marks
   it `blocked` via a function Ticketing calls). OK, or keep them fully separate?
2. **Plate and route changes.** When an operator or staff changes a booking's plate, tickets
   keep their seat number if it exists on the new bus; otherwise Ticketing flags the
   passenger for a manual move. Is there an event or `updated_at` Ticketing can rely on,
   or should it just compare on each load?
3. **Route text.** `bookings.route` is free text. Fares need a stable key. Is there a route
   master, or should Ticketing key fares on operator + normalized route text?

## 3. Roles (change to shared `profiles`, needs all owners)

| Prototype role | Proposed `profiles.role` | Scope |
|---|---|---|
| Teller | `teller` (new) | One operator: sells only that operator's trips. Needs `profiles.operator_id` (new column) |
| PUB Admin | existing `operator` | Already sets the plate (unit) in Trip Scheduling; in Ticketing sees its own trips, manifests and availability |
| Account | `account` (new) | Daily Sales Collection only |
| Super Admin | existing `ticketing` (Ticketing Admin) | Approvals, refunds inside cutoff, close codes, reports, parameters, fares |

PITX `staff` keeps read access to manifests and availability. This adds two values to
`profiles_role_check` and one column, in a migration named
`YYYYMMDDHHMM_ticketing_roles.sql`, plus the module entry in `shared/modules.js`.
Accounts are created with the existing `create-account` function (it needs to accept the
new roles and `operator_id`).

## 4. `ticketing` schema (all tables RLS-enabled)

- `fares` (operator_id, route_key, adult, student, senior, pwd, active)
- `counters` (code, name, kiosk, allow_internet, active) and `counter_fares`
  (counter, route_key, selling, fare overrides)
- `settings` (one row: the System Parameters)
- `tickets` (booking_id, seat_no, ticket_no, group_id, passenger_name, contact_no,
  email, fare_type, fare, insurance, id_no, payment_method, tendered, payment_ref,
  sold_by, counter, issued_at, status, printed, refund fields)
  with a **unique index on (booking_id, seat_no) for live tickets**, so two counters
  can never sell the same seat
- `reprints`, `requests` (refund/reprint approvals), `close_codes`, `closings`,
  `seat_marks` (temporary/permanent block and release per booking), `audit_log`

All writes go through `security definer` functions (`ticketing_sell`,
`ticketing_refund`, `ticketing_reprint`, `ticketing_decide_request`,
`ticketing_close_sales`, `ticketing_submit_collection`, ...) that re-check role, operator
scope, cutoffs and seat availability on the server. The browser only renders.

Discount ID numbers, contact numbers and emails stay out of manifests, passes and exports
(Data Privacy Act).

## 5. Pages in `docs/modules/ticketing/`

`pos.html`, `ticket.html` (pass, reprint, refund, change seat), `tickets.html`,
`availability.html`, `manifest.html`, `close.html`, `collection.html`, `approvals.html`,
`reports.html`, `fares.html`, `settings.html`, plus `assets/ticketing.js` and
`assets/ticketing.css`. Seat maps: Ticketing gets its own copy of the seat layouts
(modules don't import each other), or `seat-map.js` moves to `shared/` if both owners
agree.

## 6. Order of work

1. Agree on sections 2 and 3 with both owners.
2. Get a **dev Supabase project** (CONTRIBUTING: never test on production). Apply all
   existing migrations there.
3. Migrations: roles, then `ticketing` schema; Trip Scheduling adds the feed functions.
4. Pages in the order POS > pass > manifest > refunds/reprints > close and collection >
   reports > settings. Each step pushed to `main` only when it works on dev.
5. Production migration once both owners sign off.

## 7. Open business questions

- Ticket types: keep Adult, Student, Senior, PWD, or add Children (the CTS list says
  Adult, Children, Senior, OKU)?
- What "Price Schedule" (CTS Admin item 3) should do.
- Online booking: owned here (Work Program row 2.1.3) or elsewhere?
- Data residency: the TOR requires PH-only hosting; confirm where this Supabase project is.
