# PITX Trip Scheduling

Provincial bus operators request a 15-minute trip slot; PITX staff review
and approve/reject each request, assigning a specific bay on approval.

- **Operators** submit a request: Destination (picked from the list of
  destinations their own registered vehicles are franchised for - see
  "Routes come from the vehicle masterlist"), Date, and a 15-minute time slot
  (12:00-12:15 AM, 12:15-12:30 AM, ... 96 slots a day, the terminal runs
  24/7) - no plate at booking time; that's picked from their approved
  vehicles later, any time up to the day of the trip. The Operator name
  isn't a form field, it's whatever's on the account
  (`profiles.operator_name`). A trip can also be repeated across chosen
  weekdays in one submission. They can filter their own request list by
  status (All / Approved / Pending / Declined) - which shows today and
  future, with everything older browsable by month on **History** -
  cancel a pending request instantly or request cancellation of an
  already-approved one (needs staff approval), hand an already-booked
  slot to another operator (see "Transferring a booking"), and see their
  own confirmed trips - or every operator's - as an airport-style board
  on **My schedule**.
- **PITX staff** see every pending request, approve it (picking one of the
  bays not already taken for that slot) or reject it with an optional
  note, review and approve/decline cancellation requests for approved
  bookings, record a plate on an operator's behalf, view the day's
  confirmed trips as an airport-style departures board, review gate
  **Utilization** over a date range (plus the vehicles a missing route is
  keeping unbookable), browse the full vehicle database filtered by
  operator / trade name / destination, manage the bay list, browse every
  operator's company profile, and create or delete login accounts (there
  is no self-signup).

## How it's built

The app is plain HTML/CSS/JS in [`docs/`](docs/) that calls Supabase
directly from the browser. There is **no build step and no server** - GitHub
Pages serves the folder as-is.

Security model: the Supabase **anon key is public by
design** (it's in [`docs/shared/config.js`](docs/shared/config.js)) and only
grants what **Row Level Security** allows - see
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). RLS
is the real access-control boundary; the client-side role checks only decide
which UI to render. The one privileged operation (creating accounts, which
needs the secret service_role key) runs in a Supabase **Edge Function**, so
that key never reaches the browser.

---

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. In the dashboard, open **Project Settings -> API** and note:
   - **Project URL**
   - **anon / publishable** key (public - safe to commit)
   - **service_role / secret** key (**never** commit or expose to a browser)

### 2. Set up the database

**Use the migration runner** (further down this section) rather than
pasting files by hand - there are **45 migrations** now, and it applies
them in order and records what it's already run.

The numbered list below covers the first 20, which is where the schema
takes its shape; everything after that is incremental and documented per
change in [`CHANGELOG.md`](CHANGELOG.md). It's deliberately not kept as a
running index of all 45 - `supabase/migrations/` in filename order is
the authoritative list, and the runner reads it directly.

1. [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) -
   creates the `profiles`, `bays`, and `bookings` tables plus RLS policies.
2. [`supabase/migrations/0002_booking_changes.sql`](supabase/migrations/0002_booking_changes.sql) -
   adds operator-initiated booking changes (see "Modifying a booking").
3. [`supabase/migrations/0003_vehicles.sql`](supabase/migrations/0003_vehicles.sql) -
   adds vehicle registration and the private `vehicle-docs` storage bucket.
4. [`supabase/migrations/0004_vehicle_plate_normalization.sql`](supabase/migrations/0004_vehicle_plate_normalization.sql) -
   fixes the duplicate-plate check to ignore case and spacing.
5. [`supabase/migrations/0005_vehicle_approvals.sql`](supabase/migrations/0005_vehicle_approvals.sql) -
   adds staff approval for vehicle registrations.
6. [`supabase/migrations/0006_vehicle_fields.sql`](supabase/migrations/0006_vehicle_fields.sql) -
   adds franchise number, route, body number, seat configuration, and seat
   count to vehicle registration.
7. [`supabase/migrations/0007_thirty_minute_slots.sql`](supabase/migrations/0007_thirty_minute_slots.sql) -
   switches booking time slots from hourly to 30-minute (backfills existing
   rows, no data lost).
8. [`supabase/migrations/0008_official_form_fields.sql`](supabase/migrations/0008_official_form_fields.sql) -
   replaces vehicle registration's field set to match the PITX/MWM
   Terminals paper form exactly, and adds the `operator_profiles` table for
   that form's company-level fields.
9. [`supabase/migrations/0009_four_hour_lockout.sql`](supabase/migrations/0009_four_hour_lockout.sql) -
   requires new/changed bookings to be at least 4 hours ahead of their slot.
10. [`supabase/migrations/0010_booking_transfers.sql`](supabase/migrations/0010_booking_transfers.sql) -
   lets an operator hand off a booking to another operator, subject to
   PITX staff approval (see "Transferring a booking").
11. [`supabase/migrations/0011_operator_directory.sql`](supabase/migrations/0011_operator_directory.sql) -
   adds `list_operator_accounts()`, a narrow read-only lookup so the
   transfer dialog can offer a dropdown of real operator accounts instead
   of a free-text username.
12. [`supabase/migrations/0012_transfer_recipient_confirmation.sql`](supabase/migrations/0012_transfer_recipient_confirmation.sql) -
   requires the receiving operator to confirm a transfer before staff can
   approve it.
13. [`supabase/migrations/0013_transfer_booking_snapshot.sql`](supabase/migrations/0013_transfer_booking_snapshot.sql) -
   snapshots the booking's date/slot/route/plate onto `booking_transfers`
   so the recipient's dashboard can display them without needing RLS
   access to a booking they don't own yet.
14. [`supabase/migrations/0014_transfer_sender_snapshot.sql`](supabase/migrations/0014_transfer_sender_snapshot.sql) -
   same idea for the sender's display name, for the same RLS reason.
15. [`supabase/migrations/0015_vehicle_or_cr_numbers.sql`](supabase/migrations/0015_vehicle_or_cr_numbers.sql) -
   re-adds per-vehicle OR No. and CR No. fields to vehicle registration.
16. [`supabase/migrations/0016_transfer_recipient_vehicles.sql`](supabase/migrations/0016_transfer_recipient_vehicles.sql) -
   adds `list_operator_vehicles()`, and validates a transfer's plate
   against the receiving operator's approved vehicles server-side.
17. [`supabase/migrations/0017_operator_profile_contact_email.sql`](supabase/migrations/0017_operator_profile_contact_email.sql) -
   adds `contact1_email`/`contact2_email` to `operator_profiles`.
18. [`supabase/migrations/0018_vehicle_supporting_document.sql`](supabase/migrations/0018_vehicle_supporting_document.sql) -
   adds `supporting_doc_path`/`supporting_doc_name` to `vehicles`.
19. [`supabase/migrations/0019_vehicle_change_supporting_document.sql`](supabase/migrations/0019_vehicle_change_supporting_document.sql) -
   lets `request_vehicle_change()` update the supporting document too.
20. [`supabase/migrations/0020_bay_gates.sql`](supabase/migrations/0020_bay_gates.sql) -
   adds `bays.gate`, tags Gates 2/4's existing bays, and adds the bays
   (21-23, 33-36) the gate guide references that didn't exist yet.
21. `0021` onwards - LTFRB status, notifications, trip numbers, the
   vehicle-registration redesign, 15-minute slots, the 2-hour booking
   lockout, plate-assigned-later, approval-gated cancellation, and the
   reporting RPCs. See [`CHANGELOG.md`](CHANGELOG.md) for what each one
   changed and why.
22. [`supabase/seed.sql`](supabase/seed.sql) - optional starter data:
   20 bays named "Bay 1".."Bay 20". Skip it and add bays from the app's
   **Bays** page instead if you prefer.

With the Postgres connection string from **Project Settings -> Database
-> Connection string** (use the **pooler** string unless your network has
IPv6 egress), apply everything in one command:

```bash
DATABASE_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:6543/postgres" \
  node scripts/run-migration.mjs --seed
```

`run-migration.mjs` tracks which files it's already applied (in a
`public._schema_migrations` table) and skips them on repeat runs - safe to
re-run any time you add a new migration, even against a database that's
already been migrated partway.

### 3. Point the static site at your project

Edit [`docs/shared/config.js`](docs/shared/config.js) with your Project URL
and anon key.

### 4. Create the first staff account

The **Accounts** page needs a staff login to reach it, so bootstrap the
first one from the command line. This needs `.env.local` (copy
`.env.local.example` and fill it in - it is gitignored) plus `npm install`:

```bash
npm run create-staff -- pitx.admin ChangeMe123 "PITX Terminal Ops"
```

### 4b. Create operator accounts

Same chicken-and-egg situation as staff accounts until the Edge Function
below is deployed - operators can't self-signup, so bootstrap each one
from the command line:

```bash
npm run create-operator -- jacliner.ops ChangeMe123 "Jac Liner"
```

Every operator account has identical functionality - access is granted by
`role = 'operator'` in `profiles`, not per-account, so a new operator can
book, register vehicles, and transfer bookings exactly like any other the
moment its account exists.

### 5. Deploy the account-creation, account-deletion, password-reset, and reset-request Edge Functions

Staff create accounts from the **Accounts** page, which calls the
[`create-account`](supabase/functions/create-account/index.ts) Edge
Function, delete them with the
[`delete-account`](supabase/functions/delete-account/index.ts) Edge
Function, and reset a forgotten password with the
[`reset-password`](supabase/functions/reset-password/index.ts) Edge
Function. An operator or staff member who forgot their password
requests that reset themselves from the sign-in page's "Forgot
password?" link, which calls the unauthenticated
[`request-password-reset`](supabase/functions/request-password-reset/index.ts)
Edge Function - the only endpoint in the app meant to be reachable while
signed out, since that's exactly the situation where nothing else works.
Until each is deployed, its action shows "Could not reach the ... service"
and every other feature still works.

> **Status (1 Sep 2026): none of the four are deployed yet** - all four
> endpoints return 404. This is the one outstanding setup step in the
> whole project, and the only one that needs your own Supabase login
> rather than the database connection string. Account management works
> from the command line in the meantime (see the scripts above).

```bash
npm install -g supabase          # or: npx supabase
supabase login                   # opens your browser
supabase link --project-ref <your-project-ref>
supabase functions deploy create-account
supabase functions deploy delete-account
supabase functions deploy reset-password
supabase functions deploy request-password-reset
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected into deployed functions automatically - no secrets to set by hand.

Until `delete-account` is deployed, delete an account from the command
line instead (same underlying logic):

```bash
npm run delete-account -- jacliner.ops
```

Deleting an account cascades to that operator's own vehicles, but
**not** to any bookings it made or any approve/reject decisions it made
as staff (`bookings.operator_id`/`decided_by` deliberately don't
cascade) - deleting an account that's still referenced there fails with
a clear "still has bookings ... on record" error rather than silently
orphaning that history. Staff also can't delete their own account (no
"Delete" button next to their own row on **Accounts**, and the Edge
Function rejects it server-side too).

### 6. Publish to GitHub Pages

In the repo: **Settings -> Pages -> Build and deployment**, set
**Source** = `Deploy from a branch`, **Branch** = `main`, **Folder** =
`/docs`, then Save. The site appears at
`https://<user>.github.io/<repo>/` within a minute or two.

---

## Running locally

```bash
npm run serve
```

Then open <http://localhost:3100>. (Opening the HTML files directly via
`file://` will **not** work - ES module imports need a real HTTP origin.)

> On Windows PowerShell, if `npm` is blocked by an execution-policy error,
> use `npm.cmd run serve` or run it from Command Prompt instead.

`npm install` is only needed for the `create-staff` / `migrate` helper
scripts - the site itself has no dependencies to install.

---

## Routes come from the vehicle masterlist

A route **is** a destination. The list of bookable destinations, each
destination's gate, and every operator's fleet all come from one file -
the PITX *Vehicle Masterlist Database* workbook - and specifically from
its **Database** sheet only. The workbook's other sheets (Destination
List, Bay, Operator and Trade) are working notes and are deliberately
ignored.

| Workbook column | Where it lands |
|---|---|
| `Destination` | `vehicles.destination` **and** `vehicles.route`, and the `ROUTES` list in [`docs/modules/trip-scheduling/assets/app.js`](docs/modules/trip-scheduling/assets/app.js) |
| `Gate Assignment` | `ROUTE_GATES` - the gate staff are offered first when approving |
| `Operator Name` / `Trade Name` | matched to an existing operator account (see below); `Trade Name` is also stored on the vehicle |
| `Plate No.`, `Chassis No.`, `Body No.`, `Sticker No.`, `Case No.`, `Franchise` | the matching `vehicles` columns |
| `CPC Validity`, `OR/CR Validity`, `CPC Extension of Validity?`, `CPC EOV Validity` | eligibility dates - an expired CPC makes a vehicle unbookable |
| `Remarks` | `vehicles.remarks` |

Because `route` and `destination` are the same value, the two filters
that were already in place do the work with no extra machinery:

- the booking form's destination dropdown is built from
  `routesWithRegisteredVehicle()`, so an operator only ever sees
  destinations **their own** vehicles are franchised for; and
- once a destination is picked, the plate dropdown offers only vehicles
  registered for that destination - enforced server-side too, by
  `vehicle_matches_route()` in `bookings_insert_own` and
  `request_booking_change()`.

### Re-importing

```bash
DATABASE_URL="postgresql://..." npm run import-vehicles -- "path/to/Vehicle Masterlist Database.xlsx"
```

Dry run by default: it reports what it would do and writes
`_routes.generated.json` for inspection. Add `--apply` to actually reset
the table. One run rewrites the `vehicles` table, `ROUTES`, `ROUTE_GATES`
and `route_trip_codes` from the same read, so those four can't drift
apart.

**Operators are matched by plate number, not by name.** The workbook's
operator names don't line up with the app's account names (111 distinct
names against 78 accounts, plus variants like `BICOL ISAROG TRANSPORT
SYSTEM INC` vs `...INC.`), and name matching produced wrong answers -
`GOLDTRANS BTS` matched *Eastern* Goldtrans. Instead each workbook plate
is looked up against the account that already owns it, and the whole
Operator+Trade group goes wherever the majority of its plates already
live. Name similarity is only a fallback for plates never seen before.
A consequence worth knowing: **the first import into an empty database
has no plates to match against**, so it falls back to names entirely and
should be spot-checked.

### Rows the import can't use

The workbook is a live working document, so some rows can't be imported
cleanly. The script counts each case rather than failing:

- **No destination** - the vehicle is imported but has no route, so it
  can't be booked. These are listed by operator and plate on the staff
  **Utilization** page's unlinked-route report, which is the working
  list for the next cleanup pass.
- **Duplicate plate for the same operator** - usually the operator-name
  variants above. Collapsed to one row, keeping whichever carries more
  data.
- **No operator at all** - skipped.
- **`CPC Extension of Validity? = Yes` with no date** - recorded as *no*
  extension, since the database requires a date whenever the flag is set
  and inventing one would misstate the vehicle's eligibility.

---

## Modifying a booking

Operators can change a booking's route, plate number, date, or time slot
with the **Change** button on their dashboard (a plate-only change is also
offered as its own **Set plate**/**Change plate** action - see below).
A route/date/time change goes back through PITX staff:

| Booking was | After the operator saves a route/date/time change |
|---|---|
| **Pending** | stays pending, with the new details |
| **Approved** | **reverts to pending and the bay is released** |

The warning about losing the bay is shown in the dialog before saving.
Rejected and cancelled bookings can't be edited - the operator submits a new
request instead. A booking with a cancellation request pending can't be
edited either - the operator withdraws the request first.

Staff see a **"changed after approval"** badge on any pending request that
had previously been approved, so they know they're re-confirming a slot the
operator already held rather than granting a new one.

**Plate assigned separately, not at booking time.** A request only ever
asks for a route, date, and time; the plate is filled in later via
**Set plate** (or **Change plate**, once one's already set) - any time up
to and including the day of the trip, even inside the 2-hour lockout
below, since it doesn't touch the booking's approval, bay, or status.
Only a route/date/time change is treated as material by
`request_booking_change()`; a plate-only save skips the lead-time check
and the reset-to-pending entirely.

**2-hour lead time** (was 4 hours before 20 Aug). New requests and
route/date/time changes both need at least 2 hours' notice before the
scheduled slot:

- A new request's slot must be at least 2 hours away at submission time.
- An existing booking's route/date/time can't be changed once its
  *current* slot is within 2 hours (the **Change** button disappears -
  **Set/Change plate** and **Cancel**/**Request cancellation** still
  show); and whatever new slot is being requested must itself be at
  least 2 hours out.

Enforced in the database (an RLS check on insert, and inside
`request_booking_change()`), not just hidden in the UI - the app just
mirrors the same rule client-side so operators get an immediate answer
instead of a raw database error. Staff approve/reject, setting the plate,
and cancellation are unaffected by this rule.

The new-request **Time slot** picker only ever lists slots that are
still at least 2 hours out for the selected date, so there's nothing to
reject in the first place - picking a date shows "No times left today"
once every remaining slot is too close, and re-picks the list whenever
the date changes.

Edits go through the `request_booking_change()` database function rather
than a direct update. Postgres RLS is row-level, not column-level, so a
policy loose enough to permit editing would also let an operator write
`assigned_bay_id` and assign themselves a bay; the function constrains the
change to those four fields and decides the status/bay transition
server-side.

## Cancelling a booking

- **Pending** - cancels instantly (`bookings_cancel_own` RLS policy), no
  staff review. It never had a bay or an approval to lose.
- **Approved** - needs PITX staff approval. **Request cancellation** on
  the dashboard calls `request_booking_cancellation(booking_id, reason)`
  (reason optional), which just flags the booking
  (`cancellation_requested_at`/`cancellation_reason`) without touching its
  status or bay yet. The operator can **Withdraw cancellation** while it's
  still awaiting review. Staff see it on Pending requests' **Cancellation
  requests** tab (badge count on the tab) and either
  **Approve cancellation** (`approve_booking_cancellation()` - sets
  `status = 'cancelled'`, releases the bay, clears the request flag) or
  **Decline** (`decline_booking_cancellation()` - clears the request flag,
  leaves the booking approved).

A booking with a cancellation request pending can't be changed or have its
plate set until the request is withdrawn or decided.

## Transferring a booking

When one operator can't make a slot and has an internal arrangement for
another operator to cover it, the current owner opens **Transfer** next to
**Change**/**Cancel** on their dashboard and picks the receiving operator
from a dropdown, then picks **their plate no.** from a second dropdown -
not free text, so a transfer can't name a plate the receiving operator
hasn't actually registered and had approved. Plus an optional reason.
Same eligibility as **Change** (pending/approved, at least 2 hours out,
and no other transfer already awaiting review on that booking).

**Both dropdowns are narrowed to the booking's own route** (migration
`0032`, same "must be registered for the route it books" rule #51/#60
already enforce for the original operator): the operator dropdown
(`list_operator_accounts(p_route)`) only lists operators with at least
one approved vehicle registered for that exact route - not "every other
operator account" - and the plate dropdown
(`list_operator_vehicles(p_username, p_route)`) only lists that
operator's vehicles registered for it. Since the applicable route
depends on which specific booking is being transferred, both are loaded
fresh each time the dialog opens for that booking, not preloaded once at
page load. `request_booking_transfer()` re-validates the route match
server-side - the real gate, confirmed with a direct bypass attempt
(calling it straight at a route-mismatched plate, skipping both
dropdowns) that was correctly rejected.

The receiving operator sees it under **Incoming transfer requests** on
their own dashboard and must **Confirm** or **Decline** before anything
else happens - this is the actual "internal agreement" check, not just a
formality:

| Recipient response | Effect |
|---|---|
| **Confirm** | Moves to the **Transfer approvals** staff queue for a decision. |
| **Decline** | Request closed immediately; the booking is untouched and never reaches staff. |

Only once the recipient has confirmed can staff decide:

| Staff decision | Effect |
|---|---|
| **Approve** | Booking's operator, operator name, and plate are swapped to the receiving operator immediately - no further re-approval needed. The bay assignment and slot are untouched. |
| **Reject** | Booking is untouched; the request is closed. |

`approve_booking_transfer()` re-checks the recipient's confirmation
server-side (`recipient_response = 'accepted'`) - staff can't approve
around a missing confirmation even by calling the function directly.

Once approved, the **Schedule** and the receiving operator's **My
requests** both show the previous operator's name struck through, right
before the new one, e.g. ~~Genesis Trans~~ Batangas Star Lines. The
original operator will no longer see the booking in their own list - it
now belongs to the receiving operator's account.

Goes through the `request_booking_transfer()` / `accept_booking_transfer()`
/ `decline_booking_transfer()` / `approve_booking_transfer()` /
`reject_booking_transfer()` database functions (migrations `0010`, `0012`),
since crossing operator accounts needs its own authorization checks that
plain RLS can't express. The recipient's dashboard reads the booking's
date/slot/route and the sender's name off snapshot columns on
`booking_transfers` itself (migrations `0013`, `0014`) rather than joining
to `bookings`/`profiles` - RLS blocks both joins for an operator who isn't
the booking's owner or the profile's own account. `request_booking_transfer()`
also re-validates the chosen plate server-side against the receiving
operator's approved vehicles, so a raw RPC call can't submit a plate the
dropdown wouldn't have offered.

## Vehicles database (staff)

A read-only staff page listing **every** registered vehicle across
**every** operator, any status - not just the pending queue on **Vehicle
approvals**. Filterable by status (All / Approved / Pending / Declined)
and searchable by plate no., operator, or bus no. Each row links to
whatever documents that vehicle has on file (OR/CR scan photo,
supporting document), resolved as signed URLs the same way the other
pages that touch the `vehicle-docs` bucket already do. No new RLS
needed - `vehicles`' existing `select` policy already lets staff read
every row regardless of status (`operator_id = auth.uid() or is_staff()`,
migration `0003`); this is simply the first UI built specifically for
browsing the whole fleet rather than only the pending queue.

**Plate No., Operator, CPC validity, and OR/CR validity are sortable** -
click a column header to sort by it, click again to flip direction
(ascending shows a &#9650;, descending &#9660;). A null validity date
always sorts last regardless of direction, so an empty CPC/OR-CR column
doesn't jump to the top on descending sort. **Status** sits immediately
to the right of **Operator**, ahead of the rest of the fields, since
that's what staff scan for first. (LTFRB is no longer a column on this
table - migration 0035 dropped it from both this page and **My
vehicles**' own table; it's still shown on a vehicle's detail card.)
Client-side only
- no query changes, since the whole fleet is already loaded into memory
(see the pagination note above) and re-sorting it is instant either way.

**My vehicles** (the operator's own list) has the same sort on Plate No.,
CPC validity, and OR/CR validity - no Operator column there, since that
list is already scoped to one operator.

**Click a row on either page to open a read-only details card** - a
dialog showing every field on that vehicle at once (`vehicleDetailsHtml()`
in `app.js`, shared by both pages so the field list/order can't drift
between them), rather than scrolling a wide table sideways. The staff
version includes an Operator row up top the operator's own list doesn't
need. Clicking the Edit button (My vehicles) or a Documents link
(either page) does its own thing instead of also popping the details
card - both are inside the row but explicitly excluded from the
row-click handler.

## Operator profiles (staff)

A read-only staff page listing every operator account's company details
(the same fields the operator fills in on their own **Operator profile**),
plus a search box (username, operator name, or company name). Accounts
that haven't submitted a profile yet still show up in the list - tagged
"no profile yet" rather than being omitted - since knowing *who hasn't*
filled theirs in is as useful to staff as seeing the ones who have. No
new RLS needed: `operator_profiles`' existing `select` policy already
lets staff read every row (`operator_id = auth.uid() or is_staff()`,
migration `0008`), this is just the first UI built on top of it.

Contact person 1/2 also have an **Email** field (migration
`0017_operator_profile_contact_email.sql`) alongside the existing
name/number/position - added when importing the company's real operator
database, which has emails but the paper form's contact fields don't ask
for one.

As of migration `0037_operator_profile_redesign.sql` (applied - see
CHANGELOG #80), "Contact person 1/2" becomes an **up to 5** contact list stored as a
single `contacts` JSONB array instead of fixed column pairs, and TIN
No./Serial Number (OR)/NAU are dropped in favor of a **Trade Name**,
**Operator/Trade Code**, and a **logo upload**. "Company name" is
relabeled "Operator" on the form (the column itself stays
`company_name`).

### Route dropdown

A booking's **Route** is picked from `ROUTES` in
[`docs/modules/trip-scheduling/assets/app.js`](docs/modules/trip-scheduling/assets/app.js) rather than typed freehand, so
it can't drift into near-duplicate variants of the same route
(`"PITX - Batangas"` vs `"Batangas"` vs `"pitx batangas"`). This list went
through three sources over time: originally the operator database
spreadsheet's "Sheet5" (83 hand-picked routes), expanded to 100 once the
cleaned vehicle masterlist surfaced real destinations that weren't on it
yet (#55) - then **rebuilt entirely (#58)** directly from the cleaned
masterlist's City/Municipality + Province columns, dropping Sheet5 as a
source altogether: **91 routes**, each one exactly the masterlist's own
spelling (only "Sta./Sto." abbreviations are expanded to "Santa/Santo"),
since that's what `vehicles.route` is actually linked against. Some
Sheet5-only destinations with zero vehicles ever registered for them
(e.g. "Tagaytay City, Cavite", "Naval, Biliran") are gone as a result -
if it's not in the masterlist, it's not a route here. The dropdown
groups entries into three `<optgroup>`s matching the gate groups below
("North (Gate 5)", "Cavite/Batangas/Laguna/Quezon/Mindoro (Gate 2)",
"Bicol/Visayas/Mindanao (Gate 4)") rather than one flat list.

The **Change** dialog preserves a booking's existing route even if it
predates the current list (tagged "(not in the current list)"), same
reasoning as the plate dropdown's "no longer approved" fallback -
re-opening the dialog never silently loses a value it can't otherwise
represent. This covers both stale free-text bookings and routes dropped
in the #58 rebuild - existing bookings using an old route name aren't
renamed, they just show under that fallback if edited.

### Real operator data import (17 Aug)

The operator accounts' company profiles were populated from a
company-provided "Operator Database" spreadsheet (Operator List / Operator
Profile / Routes sheets). This ran in two passes: first the 23 accounts
that already existed, then - once the user pointed out the spreadsheet had
many more operators than that - **45 more accounts created from scratch**
for every remaining distinct company in the Operator Profile sheet
(bringing the total to 68), same password convention as every other
account here (`TestPass123`).

Several account groupings needed a judgment call, since the spreadsheet
groups companies differently than the app's accounts do - each resolved
with the user before writing anything:

- **Jac Liner / Jam Liner / Jam Liner-LLI** (3 separate accounts) - the
  spreadsheet has one combined row ("JAC LINER INC/ LLI/ JAM LINER") plus
  two standalone JAM LINER rows. Split per the user's direction: Jac Liner
  gets the combined row's manager; Jam Liner gets both standalone rows'
  contacts; Jam Liner/LLI gets the combined row's dispatcher (the only
  contact tied to "LLI" specifically).
- **Amihan / Philtranco** (2 separate accounts) - the spreadsheet has
  standalone rows for each, plus a combined row with 5 more teller/
  dispatcher contacts. Per the user: each account keeps only its own
  standalone-row contacts; the combined row's 5 contacts aren't assigned
  to either.
- **Bataan Transit Co., Inc / First North Luzon Transit, Inc.** and
  **Eastern Metropolitan Bus Corp / Rizal Metrolink Inc** - each pair
  shares identical (or near-identical) contact info in the spreadsheet,
  suggesting the same people running two legally-distinct companies. Per
  the user: kept as separate accounts, each with its own copy of the
  shared contact(s).
- **Elavil Tours Phils Inc / Elavil Transit** - related by name and
  family (Villamonte), but different contacts/regions. Per the user: kept
  as two separate accounts, matching how the spreadsheet already lists
  them as separate rows.
- **San Agustin Trans Service Corp / St. Anthony of Padua Transport
  System, Inc.** - split out from a 3-way combined row that also included
  Batman Starexpress Corporation (already created separately from its own
  standalone row). Per the user: created as their own accounts too, with
  the combined row's 5 contacts split across San Agustin and St. Anthony
  (2 each), leaving Batman Starexpress's already-assigned contacts
  untouched.

No company owner / TIN / OR-serial-number / booking-system / NAU data
exists in the spreadsheet, so those fields are empty for every account -
including clearing Genesis Transport's previous *fictitious test* values
in those fields, since real source data now takes priority over
placeholder test data. Verified afterward that all pre-existing accounts
matched something in the spreadsheet, so no account was left with a
"blank" profile to delete.

## Vehicle registration

Operators register vehicles from **My vehicles**, one at a time (scanning
a photo of the LTO OR/CR, or entering the details by hand) or several at
once via **Batch upload** (a CSV template, previewed and validated row by
row before submitting). Every field stays editable afterward regardless of
how it was first entered.

As of migration `0035_vehicle_registration_redesign.sql` (fields) and a
follow-up regroup (CHANGELOG #73, UI-only - no schema change), the
fields are grouped by what they describe rather than laid out as one
long list:

| Group | Fields |
|---|---|
| (top-level) | Plate No. |
| Vehicle Details | MV File #, Chassis No., Year, Make, Bus Type (Ordinary/Aircon/Deluxe/Luxury), Seating capacity, Seat configuration (1x1/2x2/2x3/1x3) |
| LTFRB Franchise Details | Case No., Franchise, Sticker No., Body Number, Trade Name (optional), CPC validity, OR/CR validity, CPC Extension of Validity? (if yes, its own validity date), the Region/Province/City route picker (see below), Origin, Destination |
| Remarks | free text |

Case No., Franchise, Sticker No., CPC/OR-CR validity, and the route
itself are all LTFRB franchise paperwork - grouped together for that
reason, with Body Number alongside them since it's how staff cross-
reference a vehicle against that paperwork. MV File # and Chassis No.
sit under Vehicle Details instead - they describe the physical vehicle,
not its franchise record.

**Trade Name** (migration `0036_vehicle_trade_name.sql`) is for
operators who run more than one trade (DBA) under a single account -
left blank, a vehicle just goes by the operator's own name everywhere.
When set, it appears in a small tag wherever that vehicle's bookings
show who they belong to: **My requests**, **My schedule**, staff's
**Pending requests** and **Schedule**, and the approaching-lockout list
on staff's **Overview**. A booking snapshots the trade name of
whichever vehicle it's for at the time the plate is set or changed -
kept in sync automatically by a database trigger, not something any
page computes itself - so it stays accurate even after an edit or a
transfer to a different vehicle/operator.

Earlier revisions of this form also had OR No., CR No., Date granted, and
Date expiry (added in `0015_vehicle_or_cr_numbers.sql`/
`0008_official_form_fields.sql`) and a plain Aircon yes/no in place of Bus
Type - migration 0035 dropped the first four (superseded by the CPC/
franchise fields above) and replaced Aircon with the Bus Type category. A
supporting document (franchise/CPC, insurance, etc.) and a seat
configuration layout diagram/photo can both be attached, optionally.
(The form's company-level fields - name, owner, TIN, OR serial number,
booking system, NAU, two contacts - live separately on **Operator
profile**, one row per operator account, editable any time with no
approval step.)

`Franchise` is the franchise's own number/description (e.g. "Batangas
City - Pasay City, SLEX") - distinct from `Route`, which is the short
operating-route text, and from `Origin`/`Destination`, which describe the
trip in plain terms. `CPC validity`, `OR/CR validity`, and (when the
vehicle has one) `CPC Extension of Validity` are what
`sync_expiry_notifications()` watches for the 30-day expiry warning, see
**Notifications** below. A validity date within 30 days (or already past)
renders in amber/red on every vehicle table (**My vehicles**, **Vehicle
approvals**, **Vehicles**) via the shared `expiryCell()` helper in
`app.js`. Once a vehicle's CPC (or its CPC-EOV) has actually expired, it
can no longer be used to book a slot - enforced the same way as the
existing LTFRB-eligibility rule, in the `bookings_insert_own` RLS policy
and `request_booking_change()`, not just the UI.

Registrations need PITX staff approval (**Vehicle approvals**), the same
shape as bookings:

| Vehicle was | After the operator edits it |
|---|---|
| Pending | stays pending, new details |
| **Approved**, only a cosmetic field changed (body number, seating, seat configuration, bus type, year/make, origin/destination, remarks, sticker no., supporting doc) | **stays approved** |
| **Approved**, a material field changed (plate, route, case/MV file/chassis numbers, franchise, CPC or OR/CR validity, CPC-EOV) | **reverts to pending** - and stops appearing in the booking form until re-approved |

The booking form's Plate No. field is a dropdown sourced from the
operator's *approved*, CPC-current vehicles only - there's no free-text
plate entry at booking time. An operator with no eligible vehicle sees a
message pointing them to **My vehicles** instead, with the request button
disabled.

The plate number is extracted from a scanned photo; the rest of the form
isn't printed on an OR/CR, so it's always typed in (or filled via batch
CSV). Text extraction runs
entirely in the browser via
[Tesseract.js](https://github.com/naptha/tesseract.js) - no server, no API
key, no per-scan cost. The trade-off: it's raw OCR with no understanding of
the document's layout, so every extracted field is a **best-effort
guess**, always shown as an editable input (never auto-saved) alongside the
raw scanned text, so a wrong guess can be corrected by eye instead of by
re-scanning. The OR/CR guesses are the least reliable of the bunch - they
depend on finding a label like "OR NO." near the value, which varies more
across documents than the plate/expiry patterns do.

A private Supabase Storage bucket (`vehicle-docs`) holds the uploaded
photos, one folder per operator, with the same RLS-style access rule as
everything else: an operator can only reach their own folder, staff can
read all of them.

### Supporting document

Separate from the OR/CR scan photo, an operator can attach one
**supporting document** per vehicle (franchise/CPC, insurance, etc.) -
any image or PDF (migration `0018_vehicle_supporting_document.sql`),
uploaded to the same `vehicle-docs` bucket under
`<operator_id>/supporting/<uuid>.<ext>`, so it's covered by the bucket's
existing per-operator-folder storage policies with no changes needed
there.

Available when registering a new vehicle, and editable afterward -
re-opening **Edit vehicle** shows "Current: `<filename>` - choose a file
below to replace it" if one's already attached, and keeps it unchanged if
no new file is chosen (`request_vehicle_change()`'s signature grew two
parameters for this - migration `0019`, same drop-and-recreate reasoning
as every prior signature change, since operators can only edit a vehicle
through this function, not a direct UPDATE - migration 0005 removed their
direct UPDATE policy entirely). Staff see a **"View supporting document
(`<filename>`)"** link on **Vehicle approvals** alongside the existing
OR/CR photo link, when one was uploaded.

### LTFRB masterlist import

Vehicles can also arrive in bulk from PITX's own official masterlist
rather than being registered one at a time by an operator - `vehicles`
gained an `ltfrb_status` column for this (migration
`0021_vehicle_ltfrb_status.sql`): `active`, `inactive`, `no_record`, or
`ltfrb_verified`, plus a `source = 'masterlist_import'` value alongside
the existing `manual`/`scanned` ones. It's **null** for every vehicle an
operator registers themselves through **My vehicles** - that column only
applies to the bulk import, and a null value is always treated as
eligible.

Imported vehicles insert straight in as `status = 'approved'` (skipping
the normal Vehicle approvals queue, since this masterlist *is* PITX's own
vetting), but only `active`/`ltfrb_verified` ones are eligible for the
booking form's plate dropdown - `inactive`/`no_record` units are excluded
even though `status` says approved. This is enforced in two places that
both need it (migration `0022_ltfrb_status_transfer_eligibility.sql`):
`dashboard.html`'s own vehicle query, and `list_operator_vehicles()` (the
function the transfer dialog's plate dropdown and
`request_booking_transfer()`'s server-side validation both call) - an
inactive/no_record vehicle can't be booked *or* accepted into via a
transfer. **My vehicles** shows each vehicle's LTFRB status as a badge and
a banner explaining why an approved-but-inactive vehicle isn't in the
booking form, so it doesn't look like it silently vanished; **Vehicles**
(the staff fleet database, `vehicles-database.html`) shows the same badge
across every operator.

An import run matches each masterlist row's operator name against
existing operator accounts (normalizing punctuation/case and stripping
common suffixes like "Inc."/"Transport"/"Corp.", plus a short manual
alias list for abbreviations and misspellings a plain string match can't
bridge), creates a new operator account for any real company with no
existing match, and skips rows with no identifiable operator at all. Bulk
inserts use `on conflict (operator_id, <normalized plate>) do nothing`
against the existing per-operator plate unique index, so re-running an
import (or a batch that partially failed) is safe - already-imported
rows are silently skipped rather than duplicated or erroring the whole
batch.

**Fleet database pagination:** `vehicles-database.html`'s query has no
`.range()`, and Supabase/PostgREST caps a single request at 1000 rows by
default - past that, the query silently truncates rather than erroring.
The masterlist import pushed the table past 1000 rows for the first
time, surfacing this; the page now pages through with `.range()` until a
page comes back short, so the count keeps growing correctly.

That assumption - that no other page queried an unbounded table - turned
out to be wrong. The #86 test pass found the staff approvals page
fetching *every* approved booking with no date filter, so once the table
passed 1000 rows its bay-conflict check silently saw only the oldest
1000 and offered bays that were already taken. #87 swept the rest and
added a shared `fetchAllRows()` helper (in `docs/modules/trip-scheduling/assets/app.js`) that
pages with `.range()` until a short page comes back. Any list that grows
with usage should go through it rather than assume one round trip is the
whole answer.

## Notifications

A bell icon in the top nav (migration `0024_notifications.sql`), on every
page for both roles - `renderNav()` in `app.js` wires it up for free,
nothing extra needed per-page. Clicking it opens a dropdown of up to the
30 most recent notifications; clicking one marks it read and navigates to
the relevant page.

For a notification about a specific vehicle (CPC/OR-CR expiring, a
vehicle approved/declined), the link carries `?vehicle=<id>`
(`app.js`'s click handler adds it whenever `related_table = 'vehicles'`).
**My vehicles** and **Vehicles** (staff) both read that query param on
load (`applyVehicleHighlightFromQuery()` in `app.js`), scroll straight to
that row, highlight it amber, and open its details card automatically -
so clicking a "CPC expiring soon" notification lands you looking at the
exact vehicle, not just the right page.

**Staff** get notified of:
- a new booking request (**Pending requests**)
- a new vehicle registration (**Vehicle approvals**)
- a transfer request the receiving operator has confirmed and is ready
  for staff review (**Transfer approvals**) - not before, since there's
  nothing to approve until then

**Operators** get notified when their own:
- booking is approved or declined
- vehicle is approved or declined
- transfer request is approved or declined (and the *receiving* operator
  also gets notified when a transfer is approved, since the booking is
  now theirs)

Both roles get notified when a vehicle's **CPC validity** or **OR/CR
validity** is within 30 days (or already past) - see below.

Every notification but the expiry ones is written by a Postgres trigger
(`notify_booking_pending`, `notify_booking_decided`,
`notify_vehicle_pending`, `notify_vehicle_decided`,
`notify_transfer_pending`, `notify_transfer_decided`) the moment the
underlying row's status changes - including an *edited* booking or
vehicle that reverts from approved back to pending, which is just as much
"something new for staff to review" as the first submission.

**Expiry notifications work differently**, since a date getting closer
isn't an event anything happens to trigger on. `sync_expiry_notifications()`
scans every approved vehicle for a CPC/OR-CR validity date within the next
30 days and inserts a notification for both the vehicle's own operator and
a broadcast one for all staff - called from the client (`app.js`,
`initNotifications()`) every time the nav renders, since this app has no
scheduled server-side job to call it on a timer instead. It's idempotent
(a partial unique index keyed on type/vehicle/recipient/validity-date, `on
conflict do nothing`), so calling it on every page load never creates a
duplicate - the same vehicle's same validity date only ever produces one
notification per recipient, until the date changes (e.g. renewed) or it's
a fresh 30-day window after last time.

**Two known simplifications**, both intentional given the size of the ask
relative to the rest of the app:
- A staff **broadcast** notification (`recipient_id` null - "any staff
  member can act on this") has no per-staff-member read-state - marking
  it read marks it read for every staff account, not just whoever clicked
  first. A fully correct per-recipient read state would need a separate
  join table; not worth it yet for a small ops team.
- The panel always shows the 30 most recent notifications for that
  recipient, not a true unread-only inbox with pagination - fine at
  current volume, would need real pagination if that changes.

A read-only **timeline** of the operator's own **approved** bookings -
grouped by day, most recent day first, each day's own slots connected
top-to-bottom by a dot-and-line rail in time order, showing the assigned
bay, route, and plate per slot. "Where do I actually need to show up,"
not a data-entry table. Today is tagged and highlighted; past days
render dimmed but stay in place rather than disappearing. Pending and
declined requests don't
appear here (see **My requests** for the full picture, including
revision/transfer status). Defaults to **Upcoming** (today onward);
switch to **All** to include past days. No new tables or functions -
it's the same `bookings` row RLS already scopes to `operator_id = auth.uid()`,
just filtered to `status = 'approved'` and presented as a timeline rather
than the request-management table on **My requests**.

## How capacity works

Operators don't pick a specific bay - just a date and a 15-minute slot.
When staff approve a request they assign one of the bays not already taken
for that slot, so the number of **active bays is the cap** on approvals per
slot. A unique index enforces this in the database, so two staff approving
at once can't double-book a bay. The **Bays** page controls the active
count; the **Schedule** page (staff - see CHANGELOG #79) shows one day
at a time as an airport-style departures board, grouped by time, of
that day's confirmed trips (Arriving/Departed/Cancelled, derived from
the slot's clock time and status - no live GPS/dispatch tracking) with
inline bay reassignment. There is no Week view here anymore (UI-only
change, no schema involved); the operator-facing **My schedule** still
has one, unchanged.

Slots were 30 minutes (48/day) before migration
`0038_fifteen_minute_slots.sql` (applied - see CHANGELOG #80). Deployed
together with the matching `docs/modules/trip-scheduling/assets/app.js` change, never one
without the other - the client and server's slot-to-clock-time math
must always agree, or existing bookings display at the wrong time
(hit live once, see #80's own note on what that looked like and how
the migration itself had to be fixed to apply cleanly).

### Gates and route-based bay suggestions

Bays are grouped into gates, matching the terminal's actual layout
(migration `0020_bay_gates.sql`):

| Gate | Bays | Routes |
|---|---|---|
| Gate 2 | 8-11 | Cavite, Batangas, Laguna, Quezon, Mindoro (Regions IV-A/IV-B) |
| Gate 4 | 18-23 | Bicol, Visayas, Mindanao (Regions V-XIII) |
| Gate 5 | 33-36 | North (CAR, Regions I-III) |

`ROUTE_GATES` in [`docs/modules/trip-scheduling/assets/app.js`](docs/modules/trip-scheduling/assets/app.js) maps each of
the 91 entries in `ROUTES` to its gate, derived from each route's own
province rather than hand-picked per destination (one exception:
"Muntinlupa City, Metro Manila" has no gate entry, since it's NCR rather
than provincial and doesn't fit this scheme - `gateForRoute()` falls back
to showing every bay for it) - add a route to `ROUTES`
and this map together to keep them in sync. Both **Pending requests**'
approval dropdown and **Schedule**'s bay
reassignment control group bay options into a **Suggested (Gate N)**
group first, then **Other bays** - a suggestion, not a hard restriction,
since staff may need to override it (the suggested gate is full, or the
route has no gate mapped). Bays outside a named gate (1-7, 12-17, 24-32)
are general-purpose and always appear under "Other bays".

On **Pending requests**, the bay dropdown comes **pre-selected** with the
lowest-numbered bay in the suggested gate (or the lowest-numbered
available bay if the route has no gate) - approving is a single click,
no bay has to be picked by hand. Staff can still change the dropdown
first to assign a different bay; the pick is a default, not forced.

Adding these gates' bays (21-23, 33-36 didn't exist before) raised active
bay count from 20 to 27, which directly raises the per-slot approval cap
described above.

On the operator's own booking form ([`dashboard.html`](docs/modules/trip-scheduling/dashboard.html)),
if the chosen route/date/time combination has no bay left (every relevant
bay is already assigned to an *approved* booking for that slot), an amber
hint appears under the time slot field naming the nearest open times that
still have room, each a clickable button that swaps the slot in place.
This is advisory only, not a hard block - submitting anyway still works,
since staff can fall back to a different bay exactly as described above;
the hint just saves the operator a round trip through a request that
would otherwise get bumped to an unrelated bay. If the route maps to a
gate, the check (and the hint's wording) is scoped to that gate's bays;
otherwise it falls back to checking every active bay, so a route with no
mapped gate still gets a real fullness check rather than none at all
(changed 20 Aug, #81 - `checkGateFullness()` used to `return` immediately
for those routes). It only fires once both a date and slot are already
picked; picking a suggested slot re-runs the check immediately, in case
that slot fills up too.

### Seeing other operators' trips at the same time (20 Aug, #82)

Once a date and time are picked, the request form also shows a line
listing every *other* live booking (pending or approved) at that exact
slot - operator and destination, e.g. `Also scheduled at 9:00 PM:
OperatorX → Route A, OperatorY → Route B`. If any of them share the
currently selected route, that entry is bolded and a second, amber hint
calls it out explicitly with nearby conflict-free times, same pattern as
the gate-fullness hint above. Also advisory only - two operators can
still both be approved to the same destination at the same time; this
just surfaces it before either request is even submitted.

This is backed by a dedicated RPC, `list_bookings_for_date(p_date)`, not
a direct table query - a still-pending booking is otherwise private to
its own operator (`bookings_select` RLS only opens up once a booking is
approved, or cancelled after being approved - see "Enforced by the
database" above), so a plain `.from("bookings").select()` from a
different operator's page would silently return nothing for it. The RPC
is `security definer` and returns only `slot`/`route`/`operator_name`/
`trade_name` for bookings on that date belonging to *other* operators -
never the caller's own, and never anything beyond those four columns.

### One vehicle can't be booked into two adjacent slots (20 Aug, #82)

Whenever a plate is set or changed - at booking creation (rare now, see
above) or via **Set plate**/**Change plate**/**Change** - it's checked
against that operator's own other pending/approved bookings for the same
plate one 15-minute slot before or after, on the same date. The same bus
can't be scheduled to depart twice back to back, so the second attempt is
rejected with a clear error naming the conflict; this is a hard block,
enforced in `request_booking_change()` and `bookings_insert_own`
(migration `0043`), not just a hint. Scoped to the same calendar date -
a slot 95/slot 0 pair spanning midnight isn't checked against each other.

### A vehicle must be registered for the route it books

A route no longer needs a matching vehicle at booking time - that check
now runs when the plate is actually set, via **Set plate**/**Change
plate** or the **Change** dialog (whichever route is selected there).
Once a route is picked in that dialog, the Plate No. dropdown **only**
offers vehicles whose own `route` matches it - not a suggestion, a hard
requirement. With none, the dropdown disables with an explanatory note.
Matching is **plain equality** (`vehicleMatchesRoute()` in
`docs/modules/trip-scheduling/dashboard.html`): `vehicles.route` is set by the one-time
masterlist data-linking pass to the exact canonical string from `ROUTES`
(see "Real operator data import" below), so a vehicle matches a route
only when its own `route` is that exact string.

**This is enforced server-side, not just in the UI** (migration
`0026_vehicle_route_required.sql`, restarted as plain equality in
`0031_vehicle_matches_route_exact.sql`, made conditional on a plate
actually being set in `0039_two_hour_lockout_plate_later_cancellation.sql`
- see below): whenever `plate_no` isn't null, `bookings_insert_own`'s RLS
policy and `request_booking_change()` both require an `exists` match
against the operator's own approved, LTFRB-eligible vehicles via a SQL
port of the same matching function (`vehicle_matches_route()`), kept in
lockstep with the client-side version. The dropdown filter is UX only,
same as everywhere else in this app - RLS is the real gate, confirmed by
bypassing the UI entirely and inserting a mismatched booking directly.

**History - three rounds of fuzzy matching, then a restart:** this
requirement went through several iterations before landing on plain
equality. `0026`'s first version compared *significant word overlap*
between the canonical booking route and the vehicle's own free-text
`route` (still an unlinked franchise description like "TABACO,
ALBAY-PASAY CITY" at the time), filtering generic words like `"CITY"`.
That version also had a real bug: inside the correlated `EXISTS`
subquery, the bare `plate_no`/`route` references (meant to mean the row
being inserted) got shadowed by the subquery's own `vehicles.plate_no`/
`vehicles.route` columns of the same name, so the check silently became
"does this vehicle's plate/route equal itself" - always true. Caught via
a live bypass test (inserting a mismatched booking directly, skipping
the dropdown) and fixed in `0027` by qualifying the outer row explicitly
as `bookings.plate_no`/`bookings.route`. `0028` narrowed matching to
just the *town* segment (text before the first comma), since two
different towns in the same province ("Balanga, Bataan" vs "Mariveles,
Bataan") otherwise matched on the shared province word. Word-overlap
matching kept surfacing new false positives even after that - `0029`
found accented town names (`"Biñan"`) tokenizing to nothing at all, and
`0030` found `"SAN"`/`"SANTA"`/`"SANTO"` bleeding unrelated towns
together ("Santa Cruz, Laguna" matching "Santa Rosa, Laguna"). Once the
#58 masterlist rebuild made `vehicles.route` hold the exact canonical
string for the overwhelming majority of vehicles, word-overlap matching
was solving a problem that no longer existed - `0031` replaced it with
plain equality, deleting the token/stopword machinery entirely.

### The Route dropdown only shows routes the operator has a vehicle for

The Route field itself is narrowed to routes at least one of the
operator's own vehicles is registered for - e.g. an operator with
vehicles registered only for Balanga City, Clark, and Mariveles only
ever sees those three routes, never the rest. This follows directly from
the requirement above: there'd be no point offering a route with no way
to actually fulfill it. Never locks an operator out entirely, though -
with no vehicles yet, or with vehicles whose route doesn't exactly match
any canonical route at all, this falls back to the full list rather
than showing nothing (`routesWithRegisteredVehicle()` in
`docs/modules/trip-scheduling/dashboard.html`). Same narrowing applies to the **Change**
dialog's route field, while still preserving a booking's current route
as a selectable option even if it's since fallen outside that operator's
matched set (e.g. a vehicle's registered route changed after the
booking was made) - same "never silently lose the current value"
reasoning as the plate fallback.

### Day and Week schedule views (staff + operators)

Both schedule pages - `schedule.html` (staff) and `my-schedule.html`
(operators) - have a **Day / Week** toggle plus Prev/Next navigation that
steps by a day or a week depending on which mode is active. Both share
`startOfWeek()`/`weekDates()` (`docs/modules/trip-scheduling/assets/app.js`) so the two pages
agree on where a week starts (Monday) without each re-deriving it.

- **Day** is unchanged from before: staff get the full per-slot capacity
  grid with every booking listed and the bay-reassignment control;
  operators get that single date's approved bookings as a timeline.
- **Week** shows the 7 days of the week containing the selected date as
  a grid - **dates across the top as column headers, time slots down the
  side as row headers** - so the layout matches how staff and operators
  actually scan a week: by date, then by time. Each cell lists the
  **actual bookings** for that date and slot (operator, plate, route,
  status, and bay if approved) rather than just an occupancy count -
  cells still turn "at capacity" red the same way Day view's do, once
  approved bookings there reach total bay capacity, but the booking
  detail itself is what a cell shows, not a number standing in for it.
  Each date header doubles as a **View day** link into the full Day grid
  for that date, for the bay-reassignment control this grid doesn't
  have. For operators, most cells are empty (a handful of bookings
  across a week's 336 slots is typical) - expected, not a rendering
  issue. Week replaces the old "Upcoming / All" filter, which its own
  date navigation now supersedes.

### Trip numbers

Like an airline flight number, an approved booking gets a **trip
number**: the route's 3-letter code plus the booking's time as 24-hour
`HHMM` - Naga City, Camarines Sur at 3:30 PM becomes `NAG1530`. Assigned
automatically the instant a booking is approved (a `trg_assign_trip_number`
trigger on `bookings`, migration `0033_trip_numbers.sql`), not before -
a pending request's route/plate/time can still change, so there's
nothing stable to name until it's approved. Shown next to the bay tag
everywhere an approved booking appears: the operator's **My requests**
table, both roles' Day and Week schedule views.

Each of the 91 routes has a fixed 3-letter code in `route_trip_codes`
(usually the first 3 letters of the town's first word, e.g. "Naga
City" &#8594; `NAG`) - except where two routes would otherwise collide on
that (`"Santa Rosa, Laguna"` and `"Santa Cruz, Laguna"` both start
`"SAN"/"STA"`), where the *second* word is used instead (`ROS` / `CRU`).
A handful of single-word towns that still collide even so (e.g.
"Baguio" and "Bagamanoc" both `"BAG"`), and "San Jose" being the
literal name of 4 routes in different provinces, needed a manual
override - each is commented in the migration. A route not in the
table (stale free-text data predating the canonical list) falls back to
the first 3 letters of the route string itself, so trip numbering never
hard-fails on old data.

Multiple bays can serve the same route at the same time, so the base
code alone isn't always unique per day - the 2nd, 3rd, etc. approved
booking sharing a date/route/slot gets a lettered suffix (`NAG1530`,
`NAG1530A`, `NAG1530B`...), the same way an airline runs extra sections
of one flight number rather than reusing it.

A trip number is cleared the moment a booking leaves approved status
(the same trigger, on any non-approved transition) - editing an
approved booking via **Change** sends it back to `pending` for
re-approval, which would otherwise leave a stale trip number describing
a route/time the booking may no longer have; clearing it means the next
approval always computes a fresh one against whatever's current.
Reassigning an already-approved booking's bay (`schedule.html`) doesn't
touch status, so it leaves an existing trip number untouched - a trip
number describes the route/time, not the bay.

### Operator-side UX pass: overview page, cosmetic edits, self-service reset, exports

A parallel round of improvements, this time for operators rather than
staff - same idea as the command-center pass above, applied to the
other side of the app.

- **`operator-overview.html`** - operators' own shift-start dashboard,
  now the default landing page after sign-in (`dashboard.html` is
  unchanged and still reachable as "My requests"). KPI tiles for pending
  requests, approved-upcoming bookings, registered vehicles, and
  vehicles expiring within 30 days (same threshold `expiryCell()`/the
  expiry-notification sync already use), each linking to the relevant
  page; an "approaching lockout" alert for the operator's own pending
  requests, same logic and 2-hour urgent window as staff's `overview.html`.
- **Cosmetic vs. material vehicle edits** (`vehicles.html`,
  `request_vehicle_change()` - migration `0034`): editing a vehicle used
  to *always* revert it to pending, even for a typo fix in Sticker No.
  Now only changing a "material" field - plate, route, or anything on
  the LTO OR/CR paperwork staff actually verify (case/MV file/OR/CR/
  chassis numbers, franchise, CPC/OR-CR validity, date granted/expiry) -
  sends it back for re-approval. Purely descriptive fields (bus number,
  seating, seat type, aircon, sticker no., the supporting document) can
  be corrected on an approved vehicle without touching its approval
  status. The Edit dialog's warning text spells out which is which.
- **Self-service "Forgot password?"** (`index.html` + new
  `request-password-reset` Edge Function): these accounts log in with a
  username, not a real email inbox, so Supabase's built-in email reset
  can't work here. Instead, requesting a reset raises the same
  staff-broadcast notification every other "something needs staff's
  attention" event already uses, deep-linking straight to the requesting
  account on `accounts.html` (now with its own search box, to actually
  find that account quickly among 80+ operators) - staff reset the
  password from there via the existing Reset password action. Returns
  the same generic message whether or not the username exists, so the
  endpoint can't be used to probe which usernames are registered.
- **CSV export** on `dashboard.html` ("My requests," respecting the
  active status filter) and `my-schedule.html` (Day or Week, whichever
  is active) - the same `downloadCsv()` helper and pattern staff's pages
  already use.
- **Search + column-visibility toggle + CSV export on `vehicles.html`** -
  direct parity with what staff's equivalent fleet pages already have.
- **Mobile-friendly agenda view for My Schedule's Week grid** - the
  48-row x 7-column grid is fine on desktop but unwieldy on a phone;
  below the app's existing `640px` mobile breakpoint, Week view swaps to
  a condensed per-day agenda list instead (empty days collapse to one
  "No approved slots" line rather than 48 empty rows), reusing the exact
  same already-loaded booking data - both views render from one fetch,
  CSS just switches which is visible.

### Region/Province/City route picker for new vehicles

A vehicle's `route` used to be a free-text field ("e.g. PITX - Batangas")
- the single biggest source of the dirty-route-data problems this app has
repeatedly had to clean up (see #49/#50/#53/#58 above). `vehicles.html`'s
Add and Edit forms now generate the route from three cascading dropdowns
- **Region**, **Province**, **City/Municipality** - instead of accepting
typed text at all.

Data comes from a public PSGC-based JSON API
([isaacdarcilla/philippine-addresses](https://github.com/isaacdarcilla/select-philippines-address),
the same data behind the well-known `select-philippines-address` npm
package), fetched client-side at runtime and cached for the session -
the same pattern this app already uses to load Supabase and Tesseract.js
from a CDN rather than bundling a dependency, since there's no build step
to vendor one into. Region/Province/City cover every region in the
Philippines, not just PITX's 91 currently-served routes - if the
generated route isn't one of them yet, a non-blocking note says so
("not currently one of PITX's served routes... staff will review it")
rather than blocking registration; this mirrors the same "separate
finding, not fixed here" treatment new real destinations have gotten in
the CHANGELOG rather than silently rejecting them.

City/province names from the source data are normalized to this app's
own convention before becoming part of a route - a trailing "City" not
a leading "City Of", no "(Capital)"/parenthetical-alias markers, and
"del"/"Del" cased to match ("Davao del Sur", not "Davao Del Sur") - so a
generated route matches the style of every existing entry in `ROUTES`.
**NCR is special-cased**: PSGC has no real provinces for Metro Manila
(its cities sit under numbered "districts" instead, and Manila's own
internal districts like Tondo/Binondo appear in the source data as if
they were independent cities) - unfamiliar and inconsistent with how
every other region works here, so choosing the NCR region skips the
province step entirely, lists the real 16 cities + Pateros directly, and
uses "Metro Manila" as the province name, matching the one NCR route
already in `ROUTES` ("Muntinlupa City, Metro Manila").

**Editing an existing vehicle** tries to reverse the process: given its
current `route` string, it looks for a region/province/city combination
that would generate that exact string, and pre-selects the dropdowns if
found. Older free-text routes that don't decompose cleanly (registered
before this feature existed) leave the dropdowns blank rather than
guessing - but the route itself is left completely untouched unless the
operator actively picks a new one, so editing an unrelated field on an
old vehicle never silently rewrites or loses its existing route data.

### Reassigning an approved booking's bay (staff)

Staff can move an already-approved booking to a different bay from
**Schedule** - e.g. correcting a mistaken assignment, or freeing a bay up
for an operational reason. Each approved booking's bay tag is replaced
with a small select (grouped the same Suggested/Other way as approval)
plus a **Save** button; picking a bay already taken by another approved
booking in that same slot is impossible from the dropdown itself (it's
excluded from the options), and the same unique-index constraint that
protects approval also protects this as a defense-in-depth backstop.
This is a direct table update (`bookings.assigned_bay_id`), not a new
RPC - staff already have unrestricted UPDATE rights on `bookings`
(migration `0001`).

## Project structure

```
docs/                        THE SITE ITSELF (served by GitHub Pages)
  index.html                 Sign in (+ "Forgot password?" request-to-staff flow); redirects to the module (or portal)
  portal.html                Module picker, shown when a role can open more than one module
  404.html                   Forwards old root-level page URLs to modules/trip-scheduling/
  shared/                    Platform used by every module - see CONTRIBUTING.md
    config.js                Supabase URL + public anon key
    platform.js              Supabase client, auth guard, nav shell, notifications, UI helpers
    modules.js               Module registry (name, folder, roles -> landing page)
    styles.css               Styles (light-theme only, explicit colors)
    pitx-logo.webp           PITX mark
  modules/
    trip-scheduling/         THE TRIP SCHEDULING MODULE
      operator-overview.html     Operator: shift-start dashboard - counts, lockout alerts, quick links
      dashboard.html             Operator: request form + own requests, today and future only (CSV export)
      request-history.html       Operator: own past requests, one month at a time (CSV export)
      my-schedule.html           Operator: airport-style PIDS board - own confirmed trips or every operator's, one day at a time (CSV export)
      vehicles.html              Operator: register/edit vehicles (scan or manual, Region/Province/City route picker, search, column toggle, CSV export)
      operator-profile.html     Operator: one-time company details (no approval)
      overview.html              Staff: shift-start dashboard - queue counts, lockout alerts, quick links
      staff.html                 Staff: pending booking queue (search, bulk actions, decided log)
      vehicle-approvals.html     Staff: pending vehicle queue (search, bulk actions, columns, CSV, decided log)
      vehicles-database.html     Staff: every registered vehicle, any status, searchable, Operator/Trade/Destination filters, column toggle, CSV export
      transfer-approvals.html    Staff: pending booking-transfer queue (search, bulk actions, decided log)
      schedule.html              Staff: airport-style departures board, one day at a time (CSV export)
      utilization.html           Staff: gate occupancy + busiest hours over a date range, plus vehicles blocked by an unlinked route (CSV export)
      bays.html                  Staff: manage the bay list (add, rename, activate/deactivate)
      operator-profiles.html     Staff: read-only view of every operator's company profile (sortable, CSV export)
      accounts.html              Staff: create/delete/reset-password logins (via Edge Functions)
      assets/
        app.js               Module helpers (routes, slots, vehicle/booking rendering, sidebar); re-exports platform.js
        orcr-parser.js       Client-side OCR + OR/CR field-extraction heuristics
        week-view.js         Week view used by the schedule pages
        seat-map.js          Seat map for passenger seat requests

CONTRIBUTING.md              How modules are structured and how to add one

supabase/
  migrations/                Schema, RLS policies, booking-change function
  seed.sql                   Optional starter bays
  functions/create-account/  Edge Function for privileged account creation
  functions/delete-account/  Edge Function for privileged account deletion
  functions/reset-password/  Edge Function for privileged password reset
  functions/request-password-reset/  Unauthenticated Edge Function: operator/staff requests a reset

scripts/
  create-staff.mjs           Bootstrap the first staff account
  create-operator.mjs        Create an operator account (until the Edge Function is deployed)
  delete-account.mjs         Delete an account (until the Edge Function is deployed)
  run-migration.mjs          Apply migrations over a Postgres connection
  import-vehicle-masterlist.mjs  Reset vehicles + routes from the masterlist workbook (dry run unless --apply)
  serve-docs.mjs             Serve docs/ locally, like GitHub Pages does
```
