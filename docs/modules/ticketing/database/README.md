# Ticketing database

Ticketing and Booking has its **own Supabase project**, separate from the PITX Trip
Scheduling project (`nuezknlzwfkfxlicrgol`). The files in [migrations/](migrations/) run
only there. The team's `supabase/migrations/` folder is for the Trip Scheduling project
and must not get Ticketing files.

| File | What |
|---|---|
| `202611041000_ticketing_init.sql` | `ticketing` schema: 18 tables with RLS, `members` (Ticketing roles), `ticketing_snapshot`, `ticketing_clear_demo` |
| `202611041001_ticketing_demo_data.sql` | Prototype dummy data, every row `is_demo = true` |
| `202611041002_ticketing_passengers.sql` | Passenger accounts and online booking (holds paid at the counter) |
| `remove_from_trip_scheduling.sql` | One-off: removes the copy that was first applied to the Trip Scheduling project by mistake |

## Testing without a project

[test/test.mjs](test/test.mjs) runs all migrations on PGlite (Postgres in Node) with small
stand-ins for Supabase's `auth.users`, `auth.uid()` and the `anon`/`authenticated` roles,
then checks access and the passenger booking rules (38 checks). It needs
`@electric-sql/pglite`, which is not in the repo's package.json, so run it from a
separate folder:

```bash
npm install @electric-sql/pglite@0.2.17
node path/to/test.mjs path/to/docs/modules/ticketing/database/migrations
```

## Setting up the project

1. Create the project in the Megawide Construction Corporation org (needs the org owner
   or an admin), region Southeast Asia (Singapore), the closest to PH.
2. In its SQL Editor, run the migrations in order.
3. Sign up the first admin through the project's Auth, then add them:
   `insert into ticketing.members (user_id, full_name, role) select id, 'Name', 'admin' from auth.users where email = '...';`
4. Put the project URL and publishable key in the Ticketing pages' config (not
   `docs/shared/config.js`, which is the Trip Scheduling project).

Roles in `ticketing.members`: `teller` (one company and counter), `pub_admin` (one
company), `account` (Daily Sales Collection), `admin` (Ticketing Admin).

## Passengers

Passengers are a separate kind of user. They sign up through the project's Auth, register
with `ticketing_register_passenger(name, contact_no)`, and are kept in
`ticketing.passengers`, not `members`. They never read the tables; they only call:

| Function | Who | Does |
|---|---|---|
| `ticketing_online_trips(p_date)` | anyone, no sign-in | Bookable trips that day with fares and seats left |
| `ticketing_trip_seats(p_trip)` | anyone, no sign-in | Seat layout and the seat numbers already taken (no names) |
| `ticketing_register_passenger(name, contact_no)` | signed in | Creates or updates the passenger's details |
| `ticketing_book(p_trip, p_seats)` | passenger | Holds up to `online_max_seats` seats; returns the booking ref, total and hold end |
| `ticketing_my_bookings()` | passenger | Own bookings only |
| `ticketing_cancel_booking(p_group)` | passenger | Cancels own unpaid holds |

A booking is a **hold** (`Reserved`) until it's paid at a PITX counter, where the Teller
issues it. Unpaid holds are voided after `online_hold_min` (default 30 minutes, never past
the online cutoff). Online booking closes `online_cutoff_min` (default 60) before
departure and only opens within the company's advance-booking days. Discount fares need an
ID number, checked at the counter. There is no online payment yet.
