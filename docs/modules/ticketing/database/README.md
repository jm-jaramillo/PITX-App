# Ticketing database

Ticketing and Booking has its **own Supabase project**, separate from the PITX Trip
Scheduling project (`nuezknlzwfkfxlicrgol`). The files in [migrations/](migrations/) run
only there. The team's `supabase/migrations/` folder is for the Trip Scheduling project
and must not get Ticketing files.

| File | What |
|---|---|
| `202611041000_ticketing_init.sql` | `ticketing` schema: 18 tables with RLS, `members` (Ticketing roles), `ticketing_snapshot`, `ticketing_clear_demo` |
| `202611041001_ticketing_demo_data.sql` | Prototype dummy data, every row `is_demo = true` |
| `remove_from_trip_scheduling.sql` | One-off: removes the copy that was first applied to the Trip Scheduling project by mistake |

## Setting up the project

1. Create the project in the Megawide Construction Corporation org (needs the org owner
   or an admin), region Southeast Asia (Singapore), the closest to PH.
2. In its SQL Editor, run the two migrations in order.
3. Sign up the first admin through the project's Auth, then add them:
   `insert into ticketing.members (user_id, full_name, role) select id, 'Name', 'admin' from auth.users where email = '...';`
4. Put the project URL and publishable key in the Ticketing pages' config (not
   `docs/shared/config.js`, which is the Trip Scheduling project).

Roles in `ticketing.members`: `teller` (one company and counter), `pub_admin` (one
company), `account` (Daily Sales Collection), `admin` (Ticketing Admin).
