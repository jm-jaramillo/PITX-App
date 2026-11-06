# Ticketing database

Ticketing runs on the **shared PITX project** (`nuezknlzwfkfxlicrgol`) in its own
`ticketing` schema, linked to the shared `core` layer that Trip Scheduling owns
([docs/MERGE_PROMPTS.md](../../../MERGE_PROMPTS.md)). Its migrations are in
`supabase/migrations/` with the team's.

| File | What |
|---|---|
| `supabase/migrations/202611041000_ticketing_init.sql` | `ticketing` schema: 18 tables with RLS, `members` (Ticketing roles), `ticketing_snapshot`, `ticketing_clear_demo` |
| `supabase/migrations/202611041002_ticketing_passengers.sql` | Passenger accounts and online booking (holds paid at the counter) |
| `supabase/migrations/202611061000_core_shared_master_data.sql` | JM's `core` layer; adds `operator_id`, `vehicle_id`, `destination_id` links (NOT VALID) |
| `supabase/migrations/202611061100_ticketing_core_links.sql` | Ticketing on core: link review, plates and operators from core, booking links, seat sync with Trip Scheduling, demo mode |
| [demo_data.sql](demo_data.sql) | Prototype dummy data, every row `is_demo = true`. **Dev only, not a migration.** Turns on `demo_mode` |
| [link_fix.sql](link_fix.sql) | Hand fixes for unlinked rows, then validating the foreign keys |
| [for-trip-scheduling.sql](for-trip-scheduling.sql) | Proposal for JM: `request_seats()` and `get_trip_seats()` using links and Ticketing's seats |
| [reset_old_copy.sql](reset_old_copy.sql) | One-off: drops the early copy applied on 4 Nov, before applying the migrations |

## Order on a project

1. `reset_old_copy.sql` if the early `ticketing` schema is still there.
2. `202611041000_ticketing_init.sql`, then `202611041002_ticketing_passengers.sql`.
3. JM applies `202611061000_core_shared_master_data.sql` (dev branch first).
4. `202611061100_ticketing_core_links.sql`.
5. `link_fix.sql`: read `ticketing.link_review`, fix by hand, validate the foreign keys.
6. Dev only: `demo_data.sql`.

## What links to core

| Ticketing | Links to | Who wins |
|---|---|---|
| `companies.operator_id` | `core.operators` (login with `role = 'operator'`) | Operator name from core. Ticketing keeps ticket code, PTU, TIN, MIN, serial |
| `buses.vehicle_id` | `core.vehicles` | Plate, capacity, status from core. Ticketing keeps bus type (seat layout), aircon, charter |
| `routes.destination_id` | `core.destinations` | Ticketing keeps fares |
| `trips.booking_id` | `public.bookings` | Seats sync both ways (below) |

Rules on the links:

- A bus can only link to a vehicle registered to its company's operator.
- A linked bus whose registered seating capacity differs from its seat layout is not
  sold online.
- Demo rows can never link to real operators, vehicles or bookings.
- `ticketing.link_review` (or `ticketing_link_review()`, admin only) lists what still
  needs a hand fix. It leaves out demo rows.

## Seats with Trip Scheduling

- Seats a passenger requested through Trip Scheduling's `request_seats()` are taken in
  Ticketing. Ticketing reads them through Trip Scheduling's `get_trip_seats()`.
- `ticketing_taken_seats(booking_id)` gives Trip Scheduling the seats Ticketing has sold,
  held or blocked.
- `ticketing_booking_vehicle(booking_id)` gives Trip Scheduling the vehicle Ticketing sells
  that booking on.
- Trip Scheduling using these in `request_seats()` is JM's change to make:
  [for-trip-scheduling.sql](for-trip-scheduling.sql).

## Demo data

`settings.demo_mode` is off by default. While it is off, demo rows are hidden from:

- the snapshot
- online trips
- bookings
- every report built on these functions

`demo_data.sql` turns it on, and it is for dev only. `ticketing_clear_demo()` removes the
demo rows.

## Testing without a project

[test/test.mjs](test/test.mjs) runs on PGlite, which is Postgres running in Node. It
builds small stand-ins for:

- Supabase auth
- the Trip Scheduling and TOS tables that core reads
- 0051's seat requests

Then it applies the migrations, the demo data and the proposal, and runs 74 checks. It
needs `@electric-sql/pglite`, which is not in the repo's package.json, so run it from a
separate folder:

```bash
npm install @electric-sql/pglite@0.2.17
node path/to/test.mjs path/to/PITX-App
```

## Roles

`ticketing.members` holds these roles:

| Role | Scope |
|---|---|
| `teller` | One company and one counter |
| `pub_admin` | One company |
| `account` | Daily Sales Collection |
| `admin` | Ticketing Admin |

Accounts with `profiles.role = 'ticketing'` (from 0051) are Ticketing Admins too.

## Passengers

Passengers are a separate kind of user. They sign up through Auth, register with
`ticketing_register_passenger(name, contact_no)`, and are kept in `ticketing.passengers`,
not `members`. They never read the tables; they only call:

| Function | Who | Does |
|---|---|---|
| `ticketing_online_trips(p_date)` | anyone, no sign-in | Bookable trips that day with fares and seats left |
| `ticketing_trip_seats(p_trip)` | anyone, no sign-in | Seat layout and the seat numbers already taken (no names) |
| `ticketing_register_passenger(name, contact_no)` | signed in | Creates or updates the passenger's details |
| `ticketing_book(p_trip, p_seats)` | passenger | Holds up to `online_max_seats` seats; returns the booking ref, total and hold end |
| `ticketing_my_bookings()` | passenger | Own bookings only |
| `ticketing_cancel_booking(p_group)` | passenger | Cancels own unpaid holds |

Booking rules:

- A booking is a **hold** (`Reserved`) until it's paid at a PITX counter, where the Teller
  issues it.
- An unpaid hold is voided after `online_hold_min` (default 30 minutes), and never lasts
  past the online cutoff.
- Online booking closes `online_cutoff_min` (default 60) minutes before departure.
- Online booking only opens within the company's advance-booking days.
- Discount fares need an ID number, which is checked at the counter.
- There is no online payment yet.

Trip Scheduling's `request_seats()` is a second way for passengers to hold seats. Which one
stays is still to settle with JM.
