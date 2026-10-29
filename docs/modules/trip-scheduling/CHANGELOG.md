# Project log

Build history for the PITX Trip Scheduling app (formerly "PITX Bus Bay
Booking" - renamed in #78), now the Trip Scheduling module of PITX App (#112).
Repo: <https://github.com/jm-jaramillo/PITX-App>
Live: <https://jm-jaramillo.github.io/PITX-App/>

---

## Requirements as agreed

| Decision | Choice |
|---|---|
| Who requests | Provincial bus operators |
| Who approves | PITX staff |
| Request fields | Operator, Destination, Date, 15-minute slot (plate assigned later) |
| Route basis | The vehicle masterlist Destination column - a route IS a destination, and each operator only sees the destinations their own vehicles are franchised for (changed 1 Sep, #88) |
| Slot length | 30 minutes, 24/7 (48 slots/day; originally 1 hour, changed 13 Aug) |
| Bay selection | Operators do **not** pick a bay; staff assign one on approval |
| Capacity | Active bay count caps approvals per hour |
| Accounts | Staff-created only, no self-signup |
| Login | Username + password |
| Conflicts | A bay can't be double-booked for the same hour |
| Modifications | Operators may change a booking; every change needs staff re-approval |
| Vehicle registration | Operators scan or manually enter their LTO OR/CR; needs staff approval |
| Plate selection at booking | Operator books destination + time only; plate assigned later from a dropdown of their *approved* vehicles, any time up to the day of the trip (changed 20 Aug, #81) |
| Visual identity | Matches the PITX Terminal Ops design system (shared logo, palette, type) |
| Device support | Must be readable and usable on mobile, not just desktop |
| Request filtering | Operators can filter their own requests: All / Approved / Pending / Declined |
| Vehicle detail | Matches the official PITX/MWM Terminals paper form exactly (superseded 14 Aug; originally franchise no./body no./seat config, replaced not extended) |
| Operator profile | One-time company details (name, owner, TIN, OR serial no., booking system, 2 contacts), no approval needed |
| Booking lead time | New requests and material changes (route/date/time) both need at least 2 hours' notice before the scheduled slot (was 4 hours until 20 Aug, #81); setting the plate later is exempt |
| Booking transfer | An operator may hand off a booked slot to another operator (internal agreement); needs PITX staff approval; schedule shows the previous operator struck through next to the new one |
| Cancellation | A pending request cancels instantly; an approved booking needs PITX staff approval to cancel (changed 20 Aug, #81) |
| Same-time visibility | The request form shows other operators' trips at the chosen date/time, flagging a same-route/same-time clash with a different-timeslot suggestion (advisory only) (added 20 Aug, #82) |
| One vehicle, one slot at a time | A single vehicle can't be booked into two adjacent 15-minute slots on the same date (added 20 Aug, #82) |
| Request list scope | "My requests" shows today and future only, sortable by date; a separate History page shows past requests, one month at a time (added 20 Aug, #84) |

---

## Timeline

### 1. `53940bf` — Scaffold (12 Aug)

The machine had **no Node.js, Python, or Docker**, so nothing could be built
or run. Node.js LTS was installed, then Next.js 16 was scaffolded.

Next.js 16 ships a warning that its APIs differ from older versions, so its
bundled docs were read before writing code — this is why the app used
`proxy.ts` (Next 16's rename of `middleware.ts`) and async `cookies()`.

### 2. `86e9e73` — First working app (12 Aug)

Full booking app on Next.js + Supabase: login, operator dashboard, staff
approval queue, schedule grid, bay management, account creation.

Supabase setup along the way:

- Created `profiles`, `bays`, `bookings` with Row Level Security.
- **Direct DB connection failed** (`ENOTFOUND`): Supabase's direct host is
  IPv6-only and this network has no IPv6 route. Switched to the **pooler**
  connection, which is IPv4 — noted in the README so it isn't rediscovered.
- Seeded 20 bays, bootstrapped the first staff account.

Verified end-to-end in a browser against the real database: request →
approve with bay assigned → schedule updated → operator saw the result.
Rejection with a reason verified too.

### 3. `041214c` — Two UI fixes (12 Aug)

- **Bay sort order.** Bays sorted alphabetically, so Bay 10 came before
  Bay 2. Added a numeric-aware comparison.
- **Form text colour.** Inputs had no explicit colour, so in OS dark mode
  they rendered near-white on white. Set black explicitly on the booking
  form, login, Accounts, and the staff approve/reject fields.

### 4. `8cc5d3f` — Rewritten as a static site (12 Aug)

**Why:** the goal was hosting on GitHub Pages, which serves static files
only and cannot run a server. The Next.js app needed one for auth, queries,
and approvals — which is why the Pages URL only ever showed the README.

Rebuilt the UI as plain HTML/CSS/JS in `docs/`, calling Supabase directly
from the browser. No build step, no server.

Security consequence, worth understanding:

- The **anon key is now public** (in `docs/assets/config.js`). This is by
  design — it only grants what **Row Level Security allows**. RLS is now the
  *only* thing protecting the data, so policies matter more than before.
- The **service_role key can never ship to a public page**. Account creation
  needs it, so that moved into a Supabase **Edge Function**
  (`create-account`) which re-verifies the caller is staff before acting.

Added `scripts/serve-docs.mjs` to serve `docs/` locally the way Pages does.

### 5. `bb78c09` — Removed Next.js (12 Aug)

Deleted the parallel Next.js build (**−8,812 lines**) so the repo has one
implementation. `package.json` trimmed from 385 packages to 2 direct
dependencies, now only needed for the helper scripts — the site itself has
no dependencies and no build step.

### 6. `ab3faab` — Operator booking changes (13 Aug)

Operators can now change route, plate, date, or hour via a **Change**
button. Every change re-enters the staff queue:

| Booking was | After the change |
|---|---|
| Pending | stays pending, new details |
| **Approved** | **reverts to pending, bay released** |

The dialog warns before an approved bay is given up. Rejected and cancelled
bookings stay closed. Staff see a **"changed after approval"** badge so a
re-approval is distinguishable from a new request.

Two implementation notes:

- Edits run through a `request_booking_change()` database function, not a
  direct update. Postgres RLS is **row**-level, not **column**-level — any
  policy permissive enough to allow editing would also let an operator write
  `assigned_bay_id` and assign themselves a bay. The function limits changes
  to those four fields and owns the status transition.
- The migration ends with `NOTIFY pgrst, 'reload schema'`. Without it the
  API serves a cached catalogue and rejects the new function with
  *"permission denied"* despite a correct grant. Worth remembering for any
  future function added through the SQL Editor.

### 7. `aa860fa` — Restyled to match PITX Terminal Ops (13 Aug)

A design handoff bundle (`Terminal operator interface-handoff.zip`) showed
the full PITX Terminal Ops design system — six operational roles, a shared
logo, an oklch blue-slate palette, Manrope/Inter type. This app is one
slice of that system (provincial bay booking), so it was restyled to read
as part of the suite rather than a separate tool: the PITX mark in a dark
sticky control bar, the same palette and type pairing, page headers
following the source's eyebrow-plus-title pattern, and a KPI row on the
Schedule page mirroring the ops dashboard.

Deliberately *not* done: the handoff's fuller model (4 gates × 8 bays,
region-locked gate access, RFID/GPS automation, penalty fees) — this app
only builds the bay-booking slice it already had, restyled, not a rebuild
to match every detail of the reference.

### 8. `9156210` — Vehicle registration via on-device OCR (13 Aug)

Operators can register a vehicle by photographing its LTO OR/CR or typing
the details in by hand. Text extraction runs entirely in the browser via
Tesseract.js — no server, no API key, no per-scan cost — traded
deliberately against accuracy: it's raw OCR with no understanding of the
document's layout, so every extracted field is shown as an editable input
next to the raw scanned text, never auto-saved.

Two real bugs found by testing against a synthetic OR/CR image (not just
inspecting the code):

- The duplicate-plate index normalized case but not whitespace, so
  `"NGP 2481"` and `"ngp2481"` registered as different vehicles. Fixed with
  a follow-up migration comparing on letters+digits only.
- The CR-number heuristic matched the document's own title
  (*"CERTIFICATE OF REGISTRATION"*) before reaching the real `"CR NO:"`
  line. Restructured the label search to try specific abbreviations first,
  across every line, with descriptive phrases as a last resort.

### 9. `a186bfa` — Vehicle approval + plate-number dropdown (13 Aug)

Vehicle registrations now need staff approval, the same shape as bookings
(pending → approved/rejected; editing an approved vehicle reverts it to
pending). The booking form's Plate No. field changed from free text to a
dropdown sourced from the operator's *approved* vehicles only — closing
the gap where a request could reference a vehicle nobody had verified.

Verified with a real penetration attempt, not just a policy read-through:
ran a raw SQL `UPDATE ... SET status = 'approved'` as the operator's own
authenticated database role, bypassing the app entirely. **Zero rows
affected** — confirming RLS blocks self-approval at the database level,
not just in the UI.

### 10. `f6a9e4a` — Made tables usable on mobile (13 Aug)

Testing at 375px (not just resizing the window and eyeballing it) found
every data table had columns silently cut off past the first two — on the
Schedule page this meant staff couldn't see who was booked into a slot at
all without scrolling the table sideways in its own tiny viewport, and
rows with hidden multi-line content rendered with large blank gaps.

Below 640px, each table row now stacks into a card with the column header
as a label above its value. The 20-row Bays table is exempted
(`.table-plain`) since it already read fine as a compact table and
stacking it would've meant more scrolling for no benefit.

### 11. `430bad6` — Request filters + expanded vehicle fields (13 Aug)

Two additions:

- **Status filter on the operator's "My requests" list**: All / Approved /
  Pending / Declined tabs above the table. Client-side only - all of an
  operator's own bookings are already fetched (RLS-scoped to just their
  rows), so filtering re-renders from the cached list rather than
  re-querying per tab.
- **Five more fields on vehicle registration**: franchise number, route,
  body number, seat configuration, and number of seats. Entered the same
  way in either registration mode (scan or manual) - not extracted by OCR,
  since these generally aren't printed on an OR/CR the way plate/OR/CR
  numbers are. `request_vehicle_change()`'s signature changed to carry the
  new fields, which required dropping and recreating the function -
  Postgres won't let a function's parameter list change via `CREATE OR
  REPLACE`. Staff now see all five on the Vehicle approvals page too.

Verified end-to-end: registered a vehicle with all five fields, confirmed
they appear on the operator's list, staff's approval queue, prefill
correctly into the edit dialog, and round-trip through
`request_vehicle_change()` on an edit. Verified each status-filter tab
shows exactly the matching subset against a real mixed-status list (2
approved, 2 pending, 2 rejected).

### 12. `ab4466d` — 30-minute time slots (13 Aug)

Bookings switched from hourly slots (24/day) to 30-minute slots (48/day).
`bookings.hour` (0-23) became `bookings.slot` (0-47; slot N covers
`[N*30, N*30+30)` minutes past midnight) - not just a rename, a full
column swap: existing rows were backfilled (`slot = hour * 2`) before the
old `hour` column was dropped, so no booking data was lost in the cutover.

`request_booking_change()`'s signature changed (`p_hour` → `p_slot`),
which meant dropping and recreating the function - same reason 0006 and
0007's vehicle-side counterpart needed it: Postgres won't allow a
parameter-list change via `CREATE OR REPLACE`.

Every page referencing bookings by hour was updated: the request form and
edit dialog (now a 48-option time-slot dropdown), the staff pending queue
(bay-availability grouping key), and the Schedule page, which now renders
48 rows instead of 24 and relabels its KPI from "Hours at capacity" to
"Slots at capacity."

Verified end-to-end against the live database (not just visually): backfill
correctness confirmed directly in Postgres (a booking at 4:00 PM /
`hour = 16` came out as `slot = 32`, matching `16 * 2`); submitted a new
booking at slot 17 and confirmed it rendered as "8:30 AM – 9:00 AM"; edited
it to slot 18 through `request_booking_change()` and confirmed it moved to
"9:00 AM – 9:30 AM"; approved it as staff and confirmed the Schedule page
showed exactly 48 rows with the booking at the correct row, correct
capacity count, and the assigned bay.

### 13. `a801b48` — Vehicle fields match the official PITX/MWM form; operator profile page (14 Aug)

The user supplied a photo of the actual PITX/MWM Terminals paper
registration form. Vehicle registration's field set was **replaced**
(not extended) to match its per-vehicle table exactly: Case No., MV File
#, Route, Bus No., Seating capacity, Seat type (2x2/2x3), Aircon/
Non-aircon, Date granted, Date expiry. Make/model, body type, OR No., CR
No., franchise number, and free-text seat configuration - all added in
earlier sessions - are gone from the vehicle level; the paper form has
no per-vehicle OR/CR, just one operator-level "Serial Number (OR)".

That company-level top section of the form (company name/owner, TIN, OR
serial number, booking system, NAU, two contacts) became a new
**Operator profile** page and `operator_profiles` table - one row per
operator, editable any time with no approval step, since there's nothing
privileged to protect there (unlike a booking's bay or a vehicle's
approval status).

`request_vehicle_change()`'s signature changed completely (new
parameter list for the new fields), meaning drop-and-recreate again -
the fourth time a field-set change in this project has needed it, since
`CREATE OR REPLACE` can't alter a function's parameters.

**Two real problems hit and fixed, not just designed around:**

- **The migration runner itself broke.** `run-migration.mjs` always
  replayed every `.sql` file, including 0001, which still literally says
  `hour` - a column 0007 later renamed to `slot`. Even guarded by `IF
  NOT EXISTS`, Postgres resolves column references during parse/analyze
  *before* checking whether the index already exists, so replaying 0001
  against an already-migrated database failed outright on `column
  "hour" does not exist`. This wasn't a one-off: it's a structural gap
  that would recur on every future rename or drop. Fixed properly with
  a `public._schema_migrations` tracking table so already-applied files
  are skipped on replay, rather than patching around this one instance.
- **`dashboard.html`'s vehicle dropdown broke silently.** It still
  selected the now-dropped `make_model` column to show alongside each
  plate number, and the browser's own network-level error obscured
  which request was failing - `read_console_messages` reported a bare
  "400", and the network-inspection tool couldn't see the Supabase
  fetch call at all (cross-origin). Found by temporarily wrapping
  `window.fetch` in `app.js` to log failing requests' bodies, which
  surfaced the exact Postgres error
  (`column vehicles.make_model does not exist`); fixed by switching the
  dropdown to `bus_number`, then removed the diagnostic before
  committing.

Verified end-to-end against the live database: registered a vehicle
with all nine new fields, confirmed correct display on the operator
list and staff approval queue (with no dangling separators when a field
is blank), correct prefill into the edit dialog, and a correct
round-trip through `request_vehicle_change()` on an edit (seats
49→51, aircon→non-aircon). Saved an operator profile, reloaded the
page, and confirmed every field persisted. Confirmed a completely fresh
browser tab shows zero console errors on every page.

### 14. `1dd13e5` — Fixed vertical misalignment of row action buttons (14 Aug)

The user pointed out the "Change" link on My requests sat visibly
off-center in its row - closer to the row below than the row it
belonged to. Cause: the action `<td>` has `display: flex` (to lay out
Change/Cancel side by side), and `vertical-align: middle` - the rule
every other cell uses to center its content - has no effect on a flex
container; that property only applies to table-cell/inline boxes. Fixed
with `align-items: center` on `.row-actions` instead, which does the
equivalent job for a flex box. Verified visually: every status/bay/note/
action cell now lines up on the same row, both on My requests and (same
class, same fix) the Vehicles list.

**This fix was incomplete** - the user reported the misalignment was
still there. `align-items: center` was correct as far as it went, but it
was centering content *within* a box that itself wasn't full height:
setting `display: flex` directly on a `<td>` pulls it out of the normal
table-cell box model entirely, so that cell stops stretching to the
row's height and instead sizes to its own content - `align-items` had
nothing taller than its content to center within. Measuring instead of
eyeballing this time: every row's status badge sat exactly at the row's
vertical center, while the action link sat a consistent 5-6px above it
- a fixed offset, not noise, confirming a structural cause rather than a
one-off rendering quirk.

Real fix: keep the `<td>` itself a plain, unstyled table cell (so the
table's normal `vertical-align: middle` still applies to it as a whole)
and move `display: flex` onto a `<div>` wrapper *inside* the cell
instead. Verified by measuring badge-center vs link-center on every row
before and after: `0px` difference on every single row post-fix, not
just a visual check.

### 15. `a1ceaa9` — Actually fixed the row action button alignment (14 Aug)

Continuation of #14 above - see that entry for the full story of what
was wrong and why the first attempt didn't fix it.

### 16. `ec29fa0` — 4-hour lead time on booking creation and changes (14 Aug)

New requests and changes both now need at least 4 hours' notice before
the scheduled slot:

- A new request's slot must be at least 4 hours away at submission time.
- An existing booking can't be changed once its *current* slot is within
  4 hours (the **Change** button disappears from the operator's list -
  **Cancel** is untouched); and whatever new slot is being requested must
  itself be at least 4 hours out.

Enforced at the database level, the actual boundary: the 4-hour check on
new bookings lives in the `bookings_insert_own` RLS policy's `WITH CHECK`
(deliberately not a table-level `CHECK` constraint - that would apply to
*every* write, including staff's approve/reject `UPDATE`, which must stay
unrestricted regardless of how little time is left). The check on changes
lives inside `request_booking_change()`, checked against the booking's
*current* slot before applying anything, plus a second check against the
newly-requested slot. A shared `slot_start_at()` SQL function (the actual
UTC instant a `(booking_date, slot)` pair represents, computed via
Postgres's `timestamp ... AT TIME ZONE 'Asia/Manila'` idiom) backs both.
The client mirrors the same rule (a JS port of `slot_start_at`) purely for
an immediate answer instead of a raw RLS-violation error - the database
is what actually protects this, verified by attempting both a raw insert
and a raw `request_booking_change()` call as the operator's own
authenticated role, bypassing the app entirely, and confirming Postgres
itself rejects both with the same friendly messages the app shows.

Verified end-to-end: a slot ~52 minutes out was rejected client-side and
(via direct SQL, bypassing the app) rejected at the RLS layer too; a slot
~5h52m out succeeded. A booking moved (via direct SQL, simulating one
that aged into the window) to ~52 minutes out lost its **Change** button
while keeping **Cancel**, and a direct RPC call against it was rejected
with *"This booking starts within 4 hours and can no longer be
changed."* A separate RPC call requesting a too-soon *new* slot on an
otherwise-eligible booking was rejected with *"Please choose a time at
least 4 hours from now."*

### 17. `aeb5b37` — Time slot dropdown hides slots already too close (14 Aug)

The 4-hour rule from #16 was previously only enforced on submit - an
operator could still see and pick a too-soon slot, then get told no.
The **Time slot** dropdown on the request form now only lists slots that
are still at least 4 hours out for whatever date is selected, and
re-filters whenever the date changes (the valid set differs per date -
today usually has early slots already too close; any future date starts
from midnight). If every slot for the selected date is too close, the
dropdown shows "No times left today" and disables itself rather than
offering an empty-feeling list.

Verified: for "today" (with ~12:08 PM as current time), the first
listed slot was 4:30 PM (just past the 4-hour mark) through 11:30 PM -
15 valid slots, all earlier ones correctly excluded. Switching the date
to tomorrow immediately repopulated all 48 slots starting from
midnight.

### 18. `db723c2` — Operator-to-operator booking transfer, staff-approved (14 Aug)

Some routes have multiple operators plying them, and one may have an
internal arrangement with another to cover a slot it can't make. Added a
dedicated handoff flow rather than folding it into the existing "Change"
edit, since it crosses operator accounts and the existing edit function is
deliberately scoped to a single operator's own bookings:

- New `booking_transfers` table (migration `0010`) plus three SECURITY
  DEFINER functions: `request_booking_transfer()` (the current owner
  proposes handing off to another operator, identified by username -
  there's no operator directory in the UI, so the two companies already
  know each other from their own arrangement), and staff-only
  `approve_booking_transfer()` / `reject_booking_transfer()`. Approving
  swaps `operator_id`, `operator_name`, and `plate_no` on the booking to
  the receiving operator and stamps `previous_operator_name` with the old
  name; rejecting leaves the booking untouched.
- Reuses the same 4-hour lead time as edits (a handoff is still a change
  to an active booking) and blocks a second transfer request from
  stacking on a booking that already has one pending.
- New **Transfer approvals** staff page (mirrors Vehicle approvals):
  lists pending handoffs with both operators, the plate change, and an
  optional reason; Approve/Reject.
- Operator dashboard: a **Transfer** button next to Change/Cancel on
  eligible bookings, opening a small dialog (receiving operator's
  username, their plate, optional reason). While a transfer is awaiting
  review, Change/Cancel/Transfer are all hidden on that row (shows
  "transfer pending" instead) so it can't be edited out from under the
  review.
- **Schedule** and **My requests** both show `~~Old Operator~~ New
  Operator` once a transfer is approved - the previous operator's name
  struck through, immediately followed by the current one.
- The receiving operator has no in-app acceptance step; PITX staff
  approval is the only gate, matching what was asked for. Noted as a
  known gap below.

Verified against the live database with the same RLS-bypassing SQL
harness used throughout: a non-staff operator calling
`approve_booking_transfer()` directly is rejected ("Only PITX staff can
decide on transfers"); requesting a transfer to one's own username is
rejected ("You can't transfer a booking to yourself"); requesting a
transfer to a nonexistent username is rejected ("No operator account
found with that username"). The struck-through display was verified by
inserting a test booking with `previous_operator_name` set and confirming
the rendered markup and CSS (`<s class="transferred-from">`) render
correctly, then removing the test row.

### 19. `29f2731` — `create-operator` script; bootstrap Jac Liner operator account (14 Aug)

Needed a second operator account to test/demo the transfer feature
(#18) against, and there was no way to create one without the
still-undeployed `create-account` Edge Function. Added
`scripts/create-operator.mjs`, a direct copy of `create-staff.mjs`'s
approach (service-role `auth.admin.createUser` + a matching `profiles`
row) with `role: 'operator'` instead of `'staff'`.

Created a live `jacliner.ops` account (operator name "Jac Liner").
Verified against the database that it has an identical shape to the
existing `genesis.ops` account - both `role = 'operator'` in `profiles` -
confirming access is granted purely by role, so the new account has
every function (booking, vehicles, transfers) with no special-casing
needed.

### 20. `d7b666c` — Booking form drops the Operator field; transfer picks a real account (14 Aug)

Two related cleanups on the booking/transfer flow:

- The booking form had a free-text "Operator" input the operator typed
  their own company name into every time - redundant now that
  `profiles.operator_name` already is the account's identity. Removed
  the field entirely; `operator_name` on a new booking is always read
  from the signed-in account. Submitting is blocked (with a clear
  message) for the edge case of an account with no operator name set,
  rather than hitting a raw NOT NULL error.
- The transfer dialog's "receiving operator" was a free-text username -
  easy to typo, no feedback until the RPC call rejected it. Replaced
  with a `<select>` populated from a new `list_operator_accounts()`
  function (migration `0011_operator_directory.sql`), listing every
  *other* operator account by display name. A narrow SECURITY DEFINER
  lookup (just username + operator_name, self excluded) rather than
  opening the `profiles` table up via RLS, since operators still can't
  read each other's full profile row directly.

Verified live: the booking form has no Operator input and a submitted
booking still gets the account's operator_name; the transfer dropdown
lists only the *other* operator account (confirmed via a raw RLS test
that it excludes self, and that direct `profiles` access is still
restricted to one's own row); a transfer submitted through the dropdown
still goes through the same approval flow from #18.

### 21. `0d1bf94` — Transfer needs the receiving operator's confirmation before staff can approve (14 Aug)

Previously a transfer went straight from the sending operator's request
to the staff queue, taking the "internal agreement" on the sender's
word alone. Now the receiving operator has to actually confirm in-app
first:

- `booking_transfers.recipient_response` (`pending` / `accepted` /
  `declined`). `approve_booking_transfer()` now raises if it isn't
  `accepted` - enforced inside the function, not just hidden in the
  UI, so staff can't approve around a missing confirmation even
  calling the RPC directly.
- New `accept_booking_transfer()` / `decline_booking_transfer()`
  functions, callable only by the transfer's `to_operator_id`.
  Declining closes the request immediately - it never reaches staff.
- `dashboard.html` gained an **Incoming transfer requests** section:
  transfers awaiting this operator's own response, with Confirm/Decline.
- `transfer-approvals.html` only shows Approve/Reject once
  `recipient_response = 'accepted'`; otherwise it shows "Waiting on
  \<name\> to confirm".

Building this surfaced two real RLS bugs, not just missing features:
the recipient's dashboard tried to embed `bookings` (for date/route)
and `profiles` (for the sender's name) through `booking_transfers`, but
RLS blocks both - an operator can only read bookings they own and
profiles rows that are their own, and this booking/profile belongs to
someone else. Fixed by snapshotting `booking_date`/`slot`/`route`/
`previous_plate_no` (migration `0013`) and `from_operator_name`
(migration `0014`) onto `booking_transfers` itself at request time,
readable by both sides with no RLS widening needed.

Verified live end-to-end, including the negative case: submitted a
transfer -> staff queue correctly showed "waiting on Jac Liner to
confirm" with no Approve button -> a raw `approve_booking_transfer()`
RPC call as staff was rejected server-side ("The receiving operator has
not confirmed this transfer yet.") -> confirmed as the recipient, whose
dashboard now correctly showed the sender's name and booking details ->
staff queue then showed Approve/Reject -> approved -> Schedule showed
the struck-through handoff, same as #18.

### 22. `caff799` — Operator profile: TIN No. label drops "(Paranaque)" (14 Aug)

Label-only fix on `operator-profile.html` - "TIN No. (Paranaque)" is now
just "TIN No.". No schema/behavior change.

### 23. `2c16265` — Vehicle registration: OR No. and CR No. fields back (14 Aug)

Migration `0008` had replaced the vehicle field set to match the paper
form exactly, dropping the per-vehicle `or_number`/`cr_number` columns
along the way. Added them back:

- `vehicles.or_number` / `vehicles.cr_number` (migration
  `0015_vehicle_or_cr_numbers.sql`) - distinct from
  `operator_profiles.or_serial_number`, which is a company-level field
  from a different part of the paper form.
- `request_vehicle_change()` signature grows two parameters - dropped
  and recreated, same reason as every prior signature change here
  (Postgres can't alter a function's parameter list in place).
- `vehicles.html`: OR No./CR No. inputs in both the add and edit
  dialogs, and as columns in the vehicle list.
- `vehicle-approvals.html`: shows both in the staff review card when set.
- `orcr-parser.js`: now also guesses OR/CR numbers from the scanned
  photo (looks for an "OR NO."/"CR NO." label near a value) - looser
  than the existing plate/expiry heuristics, so more likely to need a
  manual fix; always shown as an editable field per the same
  never-auto-save rule as the rest of the OCR guesses.

Verified live: added a vehicle with OR No. `OR-0012345` / CR No.
`CR-0067890` filled in by hand, confirmed both values round-tripped
correctly in the database, then removed the test row.

### 24. Bootstrapped 21 operator accounts for the real bus line roster (14 Aug)

Data-only change, no code: created one operator account per bus
line/company on the operator's provided roster, via `create-operator.mjs`
(same mechanism as Jac Liner earlier), all sharing password
`TestPass123` - same as the rest of the test accounts. Usernames are a
lowercased/de-punctuated slug of the company name (e.g. `A&B LINER` ->
`abliner.ops`); `profiles.operator_name` keeps the name as given.

| Username | Operator name |
|---|---|
| `amihan.ops` | AMIHAN |
| `philtranco.ops` | PHILTRANCO |
| `alps.ops` | ALPS |
| `bicolisarog.ops` | BICOL ISAROG |
| `dltb.ops` | DLTB |
| `superlines.ops` | SUPERLINES |
| `raymond.ops` | RAYMOND |
| `tawtrasco.ops` | TAWTRASCO |
| `cagsawa.ops` | CAGSAWA |
| `omtranscoop.ops` | OMTRANSCOOP (Jariv Transport) |
| `rorobus.ops` | RORO BUS |
| `davaometroshuttle.ops` | DAVAO METRO SHUTTLE CORP |
| `ceresgoldstar.ops` | CERES-GOLDSTAR |
| `ndelarosaliner.ops` | N. DELA ROSA LINER |
| `jamliner.ops` | JAM LINER |
| `abliner.ops` | A&B LINER |
| `barneyautoline.ops` | BARNEY AUTO LINE |
| `potransport.ops` | P&O TRANSPORT |
| `jamlinerlli.ops` | JAM LINER/LLI |
| `pangasinansolidnorth.ops` | PANGASINAN SOLID NORTH |
| `delarosaexpress.ops` | DELA ROSA EXPRESS |

Verified against the database: all 21 rows created with
`role = 'operator'`, bringing the total operator account count to 23
(plus the pre-existing `genesis.ops` and `jacliner.ops`).

### 25. `55a6948` — Transfer's plate no. is a dropdown from the receiving operator's vehicles (14 Aug)

"Their plate no." on the transfer dialog was free text - easy to typo,
and nothing stopped naming a plate the receiving operator never
actually registered. Now it's a dropdown sourced from that operator's
own approved vehicles:

- New `list_operator_vehicles(p_username)` function (migration `0016`)
  - narrow SECURITY DEFINER lookup (plate_no + bus_number, approved
    only), same shape as `list_operator_accounts()` (#20). Needed
    because the sender can't query another operator's vehicles table
    directly - RLS only allows reading your own.
- `dashboard.html`: the plate field is a `<select>`, populated on the
  "Receiving operator" dropdown's change - starts disabled ("Pick an
  operator first"), shows "No approved vehicles for this operator" if
  they have none.
- `request_booking_transfer()` also validates the plate server-side
  against the receiving operator's approved vehicles, so a raw RPC
  call can't submit a plate the dropdown wouldn't have offered.

Verified live: picking an operator in the dropdown correctly populated
the plate dropdown with their actual approved vehicle
(`JAC-777 — Bus No. Bus 7` for Jac Liner), and the submission
round-tripped correctly in the database. Also verified server-side: a
raw RPC call with a plate not in the receiving operator's approved
list was rejected ("That plate isn't one of the receiving operator's
approved vehicles.").

### 26. `285f469` — My schedule: operator view of approved bookings + bay assignments (17 Aug)

New `docs/my-schedule.html`, added to the operator nav between My
requests and My vehicles. A read-only list of the operator's own
**approved** bookings only - "where do I actually need to show up" -
sorted chronologically with the bay assigned to each. Defaults to
**Upcoming** (`booking_date >= today`); an **All** tab includes past
slots, shown dimmed. Shows the same transferred-from strikethrough as
My requests/Schedule for handed-off bookings.

No new tables or functions - it's the existing `bookings` RLS
(`operator_id = auth.uid()`) filtered to `status = 'approved'`, just
presented as a simple chronological list rather than the
request-management table on My requests.

Found and fixed a real CSS bug while building this: `tr.muted` alone
didn't actually dim a row - `td`'s own explicit `color: var(--text)`
rule beats an *inherited* color from an ancestor regardless of
selector specificity (any explicit declaration always wins over
inheritance). Added `tr.muted td { color: var(--faint) }` to override
it directly; confirmed via `getComputedStyle` before (same color as
normal rows) and after (correctly the faint gray) the fix.

Verified live: page redirects to login when signed out; Upcoming
correctly showed only the one 2026-08-17-forward booking; All showed
all 5 approved bookings sorted by date, with the 4 past ones visibly
dimmed after the CSS fix; nav highlights "My schedule" as the active page.

### 27. `9e3a3ca` — My schedule: timeline instead of a table (17 Aug)

Rebuilt the page's rendering from a plain table to a chronological
**timeline**: grouped by calendar date, each day heading followed by a
vertical dot-and-line rail connecting that day's approved slots in
order (time, bay tag, route, plate). Today is tagged; past days render
visibly dimmed but stay in place under **All** rather than
disappearing, so the operator can still see what already happened.

New CSS: `.tl-day`/`.tl-day-heading`/`.tl-today-tag` for the day
grouping, `.timeline`/`.timeline-item`/`.timeline-rail`/`.timeline-dot`/
`.timeline-line`/`.timeline-card` for the rail - the connecting line is
hidden on each day's last item so the timeline doesn't dangle past the
final slot of the day.

Verified live: a single-slot day shows just a dot with no trailing
line; a two-slot day (Aug 14) shows the connecting line between dots;
today's slot renders full-color with a "Today" tag; earlier days stay
visible but dimmed under All.

### 28. `803e92c` — My schedule: most recent day first (17 Aug)

Day grouping now sorts descending (today, then backward) instead of
ascending (oldest first) - a one-line query change
(`order("booking_date", { ascending: false })`); each day's own slots
still sort ascending by time, so the rail still reads top-to-bottom
correctly within a day.

Verified live: **All** now lists Aug 17 (today), 15, 14, 12 in that
order, with Aug 14's two slots still 6:30 AM before 4:00 PM.

### 29. `12593fe` — PITX staff can delete accounts (17 Aug)

Added a "Delete" action per row on **Accounts** (hidden on staff's own
row - can't delete yourself, enforced server-side too, not just by
hiding the button):

- New `delete-account` Edge Function, same auth pattern as
  `create-account` (verifies the caller is signed-in staff before
  doing anything privileged).
- New `scripts/delete-account.mjs` CLI fallback (`npm run
  delete-account -- <username>`), same reasoning as
  `create-operator.mjs` - usable until the Edge Function is deployed.

Deleting an account cascades to that operator's own vehicles (existing
FK), but **not** to `bookings.operator_id` or any `decided_by` column -
those deliberately don't cascade, so deleting an account that still
has bookings or approval decisions on record fails with a clear error
instead of silently orphaning that history. Supabase's admin API wraps
the actual Postgres FK violation into a generic "Database error
deleting user" message rather than passing it through, so both the
Edge Function and the CLI script treat *any* `deleteUser` failure as
"still referenced elsewhere" rather than trying to pattern-match a
message they don't control.

Verified against the live database with the CLI script (identical
logic to the Edge Function, so this is a real functional test, not
just a code read): created a disposable test account and deleted it
successfully; then confirmed `genesis.ops` (has bookings) and
`pitx.admin` (has approval decisions) are both correctly blocked with
the friendly error message, and neither account was actually removed
from the database afterward.

### 30. `b8e8f6f` — Staff-only Operator profiles page (17 Aug)

New `docs/operator-profiles.html`, added to the staff nav between Bays
and Accounts - fills a real gap: staff previously had no way to see an
operator's company details (name, owner, TIN, OR serial number,
booking system, NAU, two contacts) without database access.

- Lists **every** operator account, not just ones with a saved
  profile - accounts that haven't submitted one yet are tagged "no
  profile yet" rather than omitted, since staff following up on who
  still needs to fill theirs in is as useful as seeing the ones who
  have.
- A summary line ("N of M operators have submitted a profile") gives
  the at-a-glance count.
- Client-side search over username, operator name, and company name.
- No new migration - `operator_profiles`' existing select policy
  (`operator_id = auth.uid() or is_staff()`, migration `0008`) already
  covers this; it's the first UI built on top of that access.

Verified live: page correctly listed all 23 operator accounts, showed
Genesis Transport's full saved profile with every field rendered
correctly, tagged every other account "no profile yet", the summary
line read "1 of 23 operators have submitted a profile", and the search
box correctly filtered down to a single match.

### 31. `af04f7b` — Route dropdown + real operator profile data, from the operator database (17 Aug)

The user shared "Operator Database.xlsx" (Operator List / Operator
Profile / Routes sheets) and asked for two things: a route dropdown
sourced from it, and the site's operator profiles updated from its real
data.

**Route dropdown.** Added `ROUTES` to `app.js` - the 8 fixed
PITX-served provincial routes from the spreadsheet's Routes sheet.
Both the booking form's Route field and the Change dialog's are now
`<select>`s instead of free text. The Change dialog still preserves a
booking's existing route even if it predates the fixed list (tagged
"(not in the current list)") - same pattern as the plate dropdown's
"no longer approved" fallback, so re-opening the dialog never silently
drops a value it can't otherwise represent.

**Real operator_profiles data.** Populated all 23 existing operator
accounts from the spreadsheet's Operator Profile sheet (company name +
up to 2 contacts: name/position/number/email). Added
`contact1_email`/`contact2_email` columns (migration `0017`) since the
spreadsheet has real emails the paper form's contact fields don't ask
for, and dropping them would lose real data.

Two account groupings needed a judgment call, since the spreadsheet
groups companies differently than this app's accounts do - asked the
user before writing anything, per their own instruction to flag
multiple entries:

- **Jac Liner / Jam Liner / Jam Liner-LLI** (3 separate accounts): the
  spreadsheet has one combined row ("JAC LINER INC/ LLI/ JAM LINER")
  plus two standalone JAM LINER rows. Per the user (kept all three
  genuinely separate): Jac Liner gets the combined row's manager
  (Catherine Flores); Jam Liner gets both standalone rows' contacts
  (Jose Aguilo, Catherine Flores); Jam Liner/LLI gets the combined
  row's dispatcher (Jordan Maligaya) - the only contact tied to "LLI"
  specifically ("Lucena Lines Inc.", per the user's clarification of
  the acronym).
- **Amihan / Philtranco** (2 separate accounts): the spreadsheet has
  standalone rows for each, plus a combined row with 5 more
  teller/dispatcher contacts. Per the user: each account keeps only
  its own standalone-row contacts; the combined row's 5 contacts go to
  neither.

No company owner/TIN/OR-serial/booking-system/NAU data exists in the
spreadsheet, so those fields are empty for all 23 - including clearing
Genesis Transport's previous *fictitious test* values in those fields,
since real source data now takes priority over placeholder test data.

Also checked the user's third ask directly: whether any existing
account had no match in the spreadsheet (in which case its blank
`operator_profiles` row, if any, should be deleted). Confirmed all 23
matched something, so nothing needed deleting.

Verified live: booking form and Change dialog both show the 8-route
dropdown; the Change dialog correctly preserved and labeled a legacy
non-matching route ("Makait (not in the current list)") after bumping
a test booking's date forward to make it editable, then reverted the
date afterward; Genesis Transport's own Operator profile page shows
the imported company name and contact (with email) and confirms the
owner/TIN fields are now empty; the staff Operator profiles page shows
A&B Liner's two contacts including the new email field, with the
summary line now reading "23 of 23 operators have submitted a
profile".

### 32. `7b84713` — Route dropdown: drop the redundant "PITX -" (17 Aug)

Every route is a PITX trip by definition, so showing "PITX" on every
option was redundant. Trimmed each `ROUTES` entry in `app.js` down to
just the other endpoint - `"Baguio via Inner Cities"` instead of
`"PITX - Baguio via Inner Cities"`, `"Tuguegarao City, Cagayan"`
instead of `"Tuguegarao City, Cagayan - PITX"`, etc. Existing bookings'
stored route strings are untouched - already covered by the Change
dialog's "not in the current list" fallback if they don't match.

Verified live: the dropdown now lists all 8 routes as plain endpoint
names with no PITX prefix/suffix.

### 33. `1c699a9` — Dashboard dialogs say "Cancel" instead of "Never mind" (17 Aug)

Wording-only fix on the Change and Transfer dialogs' dismiss button -
matches the wording already used everywhere else (`vehicles.html`'s
add/edit dialogs already said "Cancel"). No schema/behavior change.

### 34. `f8f0df2` — Create accounts for every remaining operator in the spreadsheet (17 Aug)

The earlier import (#31) only populated profiles for the 23 accounts
that already existed - the user pointed out the spreadsheet's Operator
Profile sheet has far more distinct companies than that, and asked for
accounts to be created for every one of them. Fixed properly rather than
patched:

- 37 unambiguous new operators (own standalone row(s) in the
  spreadsheet, no name/identity overlap with any other account), each
  with `company_name` + up to 2 contacts imported the same way as the
  original 23.
- 8 more accounts covering 4 groupings that needed a judgment call
  before creating anything - same category of decision as the earlier
  Jac/Jam/LLI and Amihan/Philtranco calls, asked up front rather than
  guessed: two identical-contact company pairs (Bataan Transit/First
  North Luzon Transit; Eastern Metropolitan Bus/Rizal Metrolink), one
  related-but-distinct pair (Elavil Tours/Elavil Transit), and a 3-way
  combined row overlapping an already-created standalone account (San
  Agustin/St. Anthony of Padua, split out from Batman Starexpress's
  combined row). All four resolved as "keep as separate accounts" - see
  README's "Real operator data import" section for the exact contact
  split used on each.

Every new account: `role = 'operator'`, password `TestPass123` (same
convention as every account in this project), `operator_profiles` row
with `company_name` + contacts - no owner/TIN/OR-serial/booking-system/
NAU, since none of that exists in the spreadsheet for any of them.

Total operator accounts: **68** (up from 23). Verified against the
live database (68 operator accounts, 68 matching `operator_profiles`
rows) and in the staff Operator profiles page, which now reads "68 of
68 operators have submitted a profile" - spot-checked A. Arandia
Line's imported contacts render correctly there too.

### 35. `7cbb6a5` — Vehicle registration: supporting document upload for staff (17 Aug)

Operators can now attach one supporting document per vehicle
(franchise/CPC, insurance, etc.) - any image or PDF, separate from the
existing OR/CR scan photo.

- Migration `0018`: `vehicles.supporting_doc_path` /
  `supporting_doc_name`. Reuses the existing `vehicle-docs` bucket and
  its per-operator-folder storage policies unchanged - new files land
  under `<operator_id>/supporting/<uuid>.<ext>`, still within the same
  folder prefix those policies already cover.
- Migration `0019`: `request_vehicle_change()` grows two parameters to
  carry the document through an edit. Operators can only edit a
  vehicle through this function - migration `0005` removed their
  direct UPDATE policy entirely - so this was the only way to let them
  replace it later. Dropped and recreated, same reasoning as every
  prior signature change in this project.
- `vehicles.html`: file input on both Add and Edit dialogs. Edit shows
  "Current: `<filename>` - choose a file below to replace it" when one
  is attached, and explicitly passes the existing path/name through
  when no new file is chosen, so an unrelated field edit can't wipe it
  out. New "Document" column in the list, linked via a signed URL.
- `vehicle-approvals.html`: staff see a "View supporting document
  (`<filename>`)" link next to the existing OR/CR photo link.

Verified live end-to-end, not just a code read: uploaded a real file
through a vehicle registration, confirmed the exact bytes round-tripped
through a live signed URL (curled it back and got the file's actual
content), saw the Document link and filename in both the operator's
own list and the staff Vehicle approvals queue, then edited the
vehicle without touching the document and confirmed via the database
that the path/name survived rather than being nulled out.

### 36. `5ea6e0d` — Staff-only Vehicles database page (17 Aug)

New `docs/vehicles-database.html`, added to the staff nav between
Vehicle approvals and Transfer approvals. Read-only list of **every**
registered vehicle across **every** operator, any status - Vehicle
approvals only ever showed the pending queue, so there was no way to
browse the whole fleet (an operator's already-approved vehicles, or
ones staff previously rejected).

- Status filter (All / Approved / Pending / Declined) and a search box
  over plate no., operator, and bus no.
- Each row resolves signed URLs for whatever documents that vehicle
  has on file (OR/CR scan photo, supporting document from #35), same
  pattern already used on `vehicles.html`/`vehicle-approvals.html`.
- No new migration - `vehicles`' existing select policy already lets
  staff read every row regardless of status (`operator_id = auth.uid()
  or is_staff()`, migration `0003`); this is the first UI built
  specifically for browsing the whole fleet rather than only the
  pending queue.

Verified live: page lists all registered vehicles with operator names
resolved via the FK embed, status filter tabs work, search correctly
narrowed down to a single plate, nav link renders and highlights
correctly as the active page.

### 37. `27880f9` — Vehicle approvals + Operator profiles: table view instead of cards (17 Aug)

Both pages rendered their list as `.request-card` divs (one per row) -
rewrote both to the same `<table>` + `data-label` pattern the other
list pages already use (`vehicles.html`, `vehicles-database.html`,
`schedule.html`), with the same responsive stacked-card fallback below
640px but a real scannable table at normal widths.

- `vehicle-approvals.html`: columns match `vehicles-database.html`'s
  field set, with Approve/Reject in a trailing action column (same
  `.row-actions` wrapper-div pattern as `dashboard.html`'s
  Change/Transfer/Cancel row).
- `operator-profiles.html`: one column per field, "no profile yet"
  badge now inline in the Operator cell instead of the card header.

No behavior change - same data, same actions, same signed-URL document
resolution; just a denser layout for pages that can have dozens of
rows (68 operators, and any number of pending vehicles).

Verified live: both render as real `<table>`s at desktop width -
inserted a temporary pending vehicle to confirm Approve/Reject render
correctly in the table's action column, then removed it; operator
profiles table correctly shows all 68 rows with contacts and the "no
profile yet" badge inline.

### 38. `a382cd9` — Staff can reassign an approved booking's bay; gate-based bay suggestions (17 Aug)

Two related changes, from the terminal's actual gate layout the user
provided:

```
Gate 2 (Bays 8-11)  - Laguna, Batangas, Quezon, Mindoro routes
Gate 4 (Bays 18-23) - Bicol, Visayas, Mindanao routes
Gate 5 (Bays 33-36) - North routes
```

- Migration `0020`: `bays.gate`, tagging Gate 2/4's existing bays and
  adding the bays that didn't exist yet (21-23, 33-36) - **raises
  active bay count from 20 to 27**, which directly raises the per-slot
  approval capacity ("How capacity works" in the README).
- `ROUTE_GATES` + `gateForRoute()` in `app.js` maps each `ROUTES` entry
  to its gate - every current route is a Northern Luzon destination,
  so all map to Gate 5 today; documented how to extend the map when a
  Laguna/Batangas/Quezon/Mindoro/Bicol/Visayas/Mindanao route is added.
- `staff.html`'s approval bay dropdown now groups options into
  **"Suggested (Gate N)"** first, then **"Other bays"** - a suggestion,
  not a hard restriction, since staff may need to override it (gate
  full, or route has no gate mapped).
- `schedule.html`: staff can now reassign an already-approved booking's
  bay directly - the bay tag on each approved row becomes a select
  (same Suggested/Other grouping) + **Save** button. Options exclude
  bays already taken by another approved booking in that slot, so a
  conflict can't even be picked; the existing unique index (migration
  `0001`) is still the real backstop. Plain table update on
  `bookings.assigned_bay_id` - staff already have unrestricted UPDATE
  rights there, no new RPC needed.

Verified live end-to-end: approved a test booking and confirmed the
dropdown listed Gate 5 bays (33-36) first; reassigned it from Bay 33
to Bay 35 on Schedule and confirmed via the database; inserted a
second approved booking in the same slot at Bay 34 and confirmed the
first booking's dropdown correctly excluded Bay 34 (and vice versa);
confirmed the unique constraint still rejects a double-assignment
attempted directly via SQL, bypassing the UI entirely.

### 39. `39dcd6d` — Route list expanded to all 83 destinations (18 Aug)

The operator database spreadsheet gained a new "Sheet5"
(destination/province/region, filtered to "Operational" status) - a far
more complete route list than the original 8-route "Routes" sheet,
which turned out to already be a subset of it (same 8 places, slightly
different phrasing).

- `ROUTES` in `app.js` replaced with all **83 destinations** from
  Sheet5. Existing bookings using the old phrasing (e.g. "Tuguegarao
  City, Cagayan") aren't renamed - the Change dialog's "not in the
  current list" fallback (#31) already covers a stored route that
  doesn't match an entry here.
- `ROUTE_GATES` now derived from Sheet5's REGION column rather than
  hand-picked per destination: CAR/I/II/III -> Gate 5, IV-A/IV-B ->
  Gate 2, V-VIII/X-XIII -> Gate 4. Every prior route was Northern Luzon
  (Gate 5); this is the first real exercise of the Gate 2/Gate 4
  mapping from #38.
- `dashboard.html`'s route dropdown now groups into 3 `<optgroup>`s
  (North/Gate 5, Cavite-Batangas-Laguna-Quezon-Mindoro/Gate 2, Bicol-
  Visayas-Mindanao/Gate 4) instead of one 83-item flat list - reuses
  `ROUTE_GATES` rather than a separate grouping scheme.

Found and fixed a real bug while verifying live: `GATE_GROUP_LABELS`
was declared with `const` *after* `initForm()` was already being
called at module top-level, so referencing it inside
`routeOptionsHtml()` threw "Cannot access before initialization" the
first time that function ran. Moved the declaration up with the other
module-level state - the file's own top comment already calls out this
exact ordering hazard from an earlier bug.

Verified live: route dropdown renders all 83 options across the 3
correct optgroups with no console errors (confirmed via a completely
fresh tab, since the buggy tab's console had a stale cached error from
before the fix); submitted a real booking with "Legazpi City, Albay"
and confirmed it saved correctly; on Pending requests, that booking
correctly showed "Legazpi City, Albay - Gate 4" with Bay 18-23
suggested first.

---

### 40. Auto-assign a bay on approval (18 Aug)

Staff previously had to manually pick a bay from the dropdown before
every approval, even though the gate-based suggestion (#38) already
narrowed it down to a good default. Now the bay `<select>` on Pending
requests comes **pre-selected** on load: the lowest-numbered available
bay in the route's suggested gate, or the lowest-numbered available bay
overall if the route has no gate or that gate is full. Staff can still
change the dropdown before clicking Approve; the pick is a default, not
forced. No schema or RLS change was needed - `approve()` already had
full staff UPDATE rights via the existing `bookings_staff_update`
policy, so this is a client-side selection-logic change only.

Verified live: inserted a real pending test booking for "Davao City,
Davao del Sur" (maps to Gate 4, bays 18-23), reloaded Pending requests,
and confirmed via the page's own DOM that the bay `<select>` was
pre-selected to "Bay 18" (the lowest bay in that gate) without any
manual interaction. Clicked Approve without touching the dropdown, then
queried the database directly and confirmed `status` became `approved`
with `assigned_bay_id` resolving to Bay 18. Test data cleaned up
afterward.

---

### 41. Suggest a different time slot when the route's gate is full (18 Aug)

Found while stress-testing #40: filling every bay in a route's gate for
a given slot doesn't block the operator from requesting it - staff just
fall back to an unrelated gate at approval time (by design, #38). That's
fine as a safety net, but an operator has no way to know their preferred
gate is already full until after they've submitted and waited on staff.

Added a live check on the booking form
([`docs/dashboard.html`](../../dashboard.html)): once route, date, and
slot are all picked, if every active bay in that route's gate is
already assigned to an *approved* booking for that slot, an amber hint
appears under the time slot field naming up to 3 nearby times (nearest
first) that still have room in the same gate, each a clickable button
that swaps the slot and re-runs the check. Advisory only - the Request
button stays enabled, since submitting anyway is still perfectly valid
(staff can assign a different gate). New `.hint` style in
`styles.css` (amber, not `.warn`'s red - this never blocks anything).

Verified live: created a throwaway operator with an approved vehicle,
inserted 4 synthetic approved bookings occupying all of Gate 5's bays
(33-36) for one date/slot, then loaded the booking form as that
operator and picked a Gate 5 route for that same date/slot - the hint
appeared naming the correct nearest open times. Clicking a suggested
time swapped the slot and the hint correctly disappeared (that time had
room). Submitted the booking on the suggested slot and confirmed it
saved as `pending` normally. Test data cleaned up afterward.

---

### 42. Import the LTFRB masterlist's PROVL sheet into vehicles (18 Aug)

Imported PITX's official "PROVL" (provincial) vehicle masterlist -
1,910 rows - into `vehicles`, after confirming scope with the user given
the size and irreversibility of the write:

- **Operator matching**: normalized each row's OPERATOR string (strip
  punctuation/case, common suffixes like "Inc."/"Transport"/"Corp.") and
  matched against the 68 existing operator accounts - 1,693 rows matched
  cleanly (plus a handful of hand-verified aliases for abbreviations/
  misspellings a plain match couldn't bridge, e.g. "DMS" -> Davao Metro
  Shuttle, "UNAH KLARRIZE" -> the existing Unahklarizze account).
- **New accounts**: the remaining 217 rows belonged to 12 real companies
  with no existing account (Penafrancia Tours & Travel, Metro Manila Bus
  Co., Bicol Magayon, Legaspi St. Jude, Saulog Transit, and 7 others) -
  created a new operator account for each (`TestPass123`, same convention
  as every other account) rather than dropping their vehicles; 2 rows
  with a blank operator field were skipped as unidentifiable.
- **LTFRB status handling**: added `ltfrb_status` to `vehicles` (migration
  `0021_vehicle_ltfrb_status.sql`) - `active`/`inactive`/`no_record`/
  `ltfrb_verified`, plus a new `masterlist_import` value for `source`.
  Every row imports as `status = 'approved'` regardless of LTFRB status
  (this masterlist *is* PITX's own vetting), but only `active`/
  `ltfrb_verified` vehicles are eligible for the booking form's plate
  list and the transfer dialog's plate list - `list_operator_vehicles()`
  got the same eligibility check (migration
  `0022_ltfrb_status_transfer_eligibility.sql`) so an inactive vehicle
  can't be transferred into either. **My vehicles** and **Vehicles**
  (staff) both show the new LTFRB badge; **My vehicles** adds a banner
  when an approved vehicle is excluded from booking, so it doesn't look
  like it silently vanished.
- **Field mapping**: plate_no, case_number, bus_number, and `route`
  (from the sheet's fuller "FRANCHISE" column, not the shorter "OPERATING
  ROUTE" one) map directly; `date_expiry` comes from "DATE OF VALIDITY
  CPC" (an Excel date serial, converted via `xlsx.SSF.parse_date_code`).
  Chassis no., sticker no., document type, and date-tagged have no
  corresponding column in `vehicles` and weren't imported - out of scope
  for now, not a data-loss bug.
- **Duplicate rows**: bulk inserts used
  `on conflict (operator_id, <normalized plate>) do nothing` against the
  existing per-operator plate unique index, both for resumability after a
  bad-date-value crash mid-import (see below) and because the sheet
  itself has 75 genuine duplicate (operator, plate) rows (re-tagging
  entries for the same unit) - confirmed by recomputing the expected
  unique count independently and matching it exactly against what
  actually inserted (1,833 of 1,908 resolved rows).

Found and fixed two bugs while running this:

- A handful of "DATE OF VALIDITY CPC" cells held invalid serials (e.g.
  one that decoded to "1900-01-00"), which crashed the whole batch
  insert containing them. Fixed the date converter to return null for
  anything that doesn't decode to a real date, and made batch failures
  fall back to inserting that batch's rows one at a time so a single bad
  row can't take out 199 good ones with it.
- **`vehicles-database.html` (staff fleet page) has no `.range()` on its
  query**, and Supabase/PostgREST caps a single request at 1000 rows by
  default - this import pushed the table past 1000 for the first time
  (1,836 total after import, previously 3), silently truncating the page
  to exactly 1000 rows with no error. Fixed by paging through with
  `.range()` until a page comes back short. Hit the same
  temporal-dead-zone bug as #37/#39 while fixing it - `PAGE_SIZE` was
  declared right above the function that uses it, but that function is
  *called* earlier in the module than that declaration executes; moved
  it up with the other early module-level state.

Verified live: reloaded **Vehicles** (staff) after the fix and confirmed
`summary-count` and the actual row count both read 1,836, not 1,000.
Logged in as a newly-created operator (`penafranciatours.ops`, which has
both active and inactive vehicles) and confirmed the booking form's plate
dropdown listed exactly 41 options (its active count) rather than all
63, and that **My vehicles** showed the exclusion banner plus an
`Inactive` badge on the right rows.

---

### 43. Merge two duplicate operator accounts from the masterlist import (18 Aug)

Flagged after #42 as worth a manual look, then confirmed by the user:
two of the 12 new accounts the import created were actually the same
real operator as an existing account, just spelled differently in the
source sheet.

- **Alan R. Arandia** (`alanarandia.ops`, 18 vehicles) merged into the
  existing **A. Arandia Line** (`arandialine.ops`, which had 0 vehicles
  of its own) - all 18 vehicles reassigned, no plate collisions.
- **JVH Tranpost Ltd Co.** (`jvhtranpost.ops`, 1 vehicle) merged into the
  existing **JVH Transport / R. Volante Line** (`jvhtransport.ops`, 36
  vehicles) - its one vehicle collided on plate + case number with a
  vehicle already in the target account (confirmed genuinely the same
  unit), so rather than move it, backfilled the one field it had that
  the kept row didn't (`bus_number`) onto the existing row and dropped
  the duplicate.

Both now-empty duplicate accounts (profile row + auth user) were
deleted. Verified live: `arandialine.ops` and `jvhtransport.ops` show the
correct combined vehicle counts (18 and 36), `alanarandia.ops` and
`jvhtranpost.ops` no longer exist, and total vehicle count dropped by
exactly 1 (the dropped JVH duplicate) to 1,835.

---

### 44. Five more vehicle fields, expiry warnings, and a notification panel for both roles (18 Aug)

Three asks bundled together since they touch the same tables:

**Five new vehicle fields** (migration `0023_vehicle_document_fields.sql`):
Chassis No., Franchise, CPC validity, OR/CR validity, Sticker No. Added to
the **My vehicles** add/edit dialogs and table, **Vehicle approvals**, and
**Vehicles** (staff fleet page); `request_vehicle_change()` grew five more
parameters (same drop-and-recreate as every prior signature change).
Backfilled all five for the 1,832 already-imported masterlist vehicles by
re-reading the source spreadsheet's Chassis No./Franchise/Sticker No./
"DATE OF VALIDITY CPC"/"OR/CR MONITORING" columns (the last two weren't
captured at all in #42 - no field existed for them yet).

**Expiry warnings**: a validity date within 30 days (or already past)
now renders in amber/red on every vehicle table (`expiryCell()` helper in
`app.js`), and feeds the new notification panel below. 100 real vehicles
currently have an OR/CR validity within the next 30 days, 0 have a CPC
validity in that window - confirmed directly against the live data before
calling this done.

**Notification panel, both roles** (migration `0024_notifications.sql`,
`0025_vehicle_pending_notify_on_edit.sql`): a bell icon in the nav, wired
into `renderNav()` so it's on every page for free. Staff get notified of
new booking/vehicle/transfer requests; operators get notified when their
own booking/vehicle/transfer is approved or declined; both get notified
of a CPC/OR-CR expiring within 30 days. Full behavior documented in the
new **Notifications** README section, including the two intentional
simplifications (shared read-state on staff broadcasts, no true
pagination yet).

Found and fixed one bug during verification: `notify_vehicle_pending()`
only had an INSERT trigger, unlike its bookings equivalent
(`notify_booking_pending()`) which also fires when an edit reverts an
already-decided row back to pending - so editing an approved vehicle
correctly reverted it to pending, but staff never got notified there was
something new to review. Migration 0025 adds the missing UPDATE trigger.

Verified live end-to-end with a throwaway operator + staff account: a
seeded vehicle with CPC/OR-CR validity inside the 30-day window produced
both expiry notifications with the correct amber highlighting; clicking a
notification marked it read (badge count dropped) and navigated to its
linked page; editing that vehicle's fields round-tripped correctly
through `request_vehicle_change()`, reverted it to pending, and (after
the fix above) correctly notified staff; approving/rejecting it, and
inserting/approving a test booking, each produced exactly one correctly-
targeted notification. Test accounts, vehicles, bookings, and their
notifications all cleaned up afterward - the 200 real expiry
notifications already generated for real operators/staff from the actual
100 near-expiry vehicles were left in place, since those are correct,
not test data.

Updates README per project convention.

---

### 45. Sortable columns and reordered Status/LTFRB on the fleet pages (18 Aug)

**Vehicles** (staff fleet database): Plate No., Operator, CPC validity,
and OR/CR validity are now sortable - click a header to sort, click
again to flip direction, with an arrow indicator. Nulls always sort
last regardless of direction. **Status** and **LTFRB** moved to sit
immediately right of **Operator**, ahead of every other column, since
those are what staff scan for first. Client-side only - the whole fleet
is already loaded into memory (see #42's pagination fix), so re-sorting
it doesn't touch the network.

**My vehicles** (the operator's own list) got the same sort on Plate
No., CPC validity, and OR/CR validity - no Operator column there, since
that list is already scoped to one operator, so no column reordering
either (nothing to move relative to).

Verified live: clicking Plate No. sorted ascending with an arrow shown,
clicking again flipped to descending; Operator and both validity-date
sorts worked correctly, including nulls sorting last on both directions
(tested with 3 seeded vehicles with a null CPC, a null OR/CR, and both
set, to see the null-handling directly rather than relying on the real
data's incidental gaps). Header order confirmed via the DOM: Plate No.,
Operator, Status, LTFRB, then the rest.

---

### 46. Click a vehicle row for a details card, both roles (18 Aug)

Clicking anywhere on a vehicle row (My vehicles, and the staff fleet
database) now opens a read-only dialog showing every field on that
vehicle at once, rather than scrolling a wide table sideways to see it
all. One shared builder (`vehicleDetailsHtml()` in `app.js`) so the
field list/order can't drift between the two pages - the staff version
passes an extra Operator row up top that the operator's own list
doesn't need, since that list is already scoped to one account.

Clicking the Edit button (My vehicles) or a Documents link (either
page) does its own thing instead of also popping the details card, even
though both sit inside the clickable row - the row's click handler
explicitly excludes clicks that land on a `button` or `a`.

Verified live: clicking a row opens the card with the correct title and
every field populated (confirmed the staff version's extra Operator/
Status/LTFRB fields render, and the operator version correctly omits
Operator); Close works; clicking Edit opens only the edit dialog, not
the details card; a synthetic Documents link inside a row does not open
the details card either. Test accounts and seeded data cleaned up
after.

Updates README per project convention.

---

### 47. Clicking a vehicle notification highlights that row and opens its card (18 Aug)

A CPC/OR-CR expiry notification (or a vehicle approved/declined one)
previously just navigated to My vehicles or the staff fleet page -
correct page, but the reader still had to find the right row themselves
in a table that can run over a thousand rows. Now it takes them straight
to it.

The notification click handler (`app.js`) appends `?vehicle=<id>` to the
link whenever the notification's `related_table` is `vehicles`. Both
`vehicles.html` and `vehicles-database.html` call a new shared function,
`applyVehicleHighlightFromQuery()`, right after their first render: it
reads that query param, scrolls the matching row into view, adds a
`.row-highlighted` amber background, and opens that row's details card
(#46) automatically.

Verified live: seeded a vehicle with a CPC expiring within 30 days,
confirmed both its operator-side and staff-side expiry notifications
carry the correct `related_table`/`related_id`, and clicking either one
landed on the right page with the URL carrying `?vehicle=<id>`, the
correct row highlighted, and its details card already open showing the
right plate number. Test accounts and data cleaned up after.

Updates README per project convention.

---

### 48. Group the booking form's vehicle list by route (18 Aug)

Once a route is picked, the Plate No. dropdown on the booking form (and
the Change dialog) now groups the operator's vehicles into **Registered
for this route** and **Other vehicles** - a suggestion, not a hard
filter, matching the same non-blocking philosophy as the gate/bay
suggestions elsewhere in the app (#38, #40). Matching compares
significant word overlap between the canonical booking route ("Tabaco
City, Albay") and the vehicle's own free-text `route` field, ignoring
generic filler words ("CITY", "VIA", etc.) that don't mean anything on
their own. If nothing matches, the dropdown falls back to one flat list
- exactly as if no route were picked - since a franchise description
and a canonical route name can be worded differently enough that no
overlap exists (e.g. "Ilo-Ilo" vs "Iloilo"), and a vehicle should never
become unselectable because of that.

Verified live with a throwaway operator and 3 vehicles (one with a
route matching the picked booking route, one with an unrelated route,
one with no route set): picking a matching route correctly grouped the
matching vehicle alone under "Registered for this route"; picking a
route nothing matched correctly fell back to the flat list; the Change
dialog grouped and re-grouped live the same way, preserving the already-
selected plate through the switch. Test data cleaned up after.

Updates README per project convention.

---

### 49. Link masterlist vehicles' `route` to a canonical route (18 Aug)

#48's route-based vehicle grouping is only as good as `vehicles.route`
actually corresponding to a real canonical route - and for every
masterlist-imported vehicle, it didn't: `route` was set to the same
franchise-description text as the new `franchise` field (#44), a full
sentence like "TABACO, ALBAY- PASAY CITY" that the live word-overlap
matcher could only catch by accident. Re-matched all 1,832 masterlist
vehicles' original "OPERATING ROUTE" column (captured in the source
spreadsheet but never stored anywhere - #42's import used the fuller
FRANCHISE column for both `route` and `franchise`) against the 83
canonical routes, and set `route` to the matched canonical string for
any confident match - `franchise` is untouched, so the original
full-sentence description isn't lost either way.

**Two real matching bugs found and fixed before writing anything**,
both from generic words that happen to double as a place name:

- A canonical place that reduces to a single word after stripping
  filler ("Batangas City" → just "BATANGAS" once "City" is stripped)
  coincidentally equals the *province* name mentioned in nearly every
  other same-province entry ("Nasugbu, Batangas", "Calatagan,
  Batangas", ...) - a naive word-overlap match kept assigning all of
  them to Batangas City. Fixed by matching the town and province
  segments of each string separately, never letting a stray province
  mention count as the town.
- The same failure mode one level up: "Camarines" alone is shared by
  both Camarines Sur and Camarines Norte, so "Naga, Camarines Norte"
  matched Naga City, Camarines *Sur* on that shared word alone - caught
  by the user pointing out there's no real "Naga, Camarines Norte" (Naga
  City is in Camarines Sur). Fixed by only trusting a province word
  that's unique to exactly one canonical province, with a strict
  (not lenient) fallback when no word is unique - and left that specific
  row's `route` untouched, since the source data's province is simply
  wrong and guessing which real place was meant isn't safe.

Matching **never guesses**: a route is only linked when unambiguous
(exactly one canonical route qualifies); anything ambiguous (e.g. bare
"Nasugbu" - two canonical Nasugbu routes exist) or not in the canonical
list at all (Palawan, Cebu City, Guimaras - real places PITX just
doesn't have a canonical route for) is left as-is with no data lost,
since `franchise` still holds the full original text either way.

**Result**: 1,443 of 1,908 resolved rows matched confidently and got
`route` updated; 1,379 of those actually changed value (some already
happened to equal their match). Verified directly against the database
after writing: the flagged Naga/Camarines Norte rows are confirmed
still unlinked (route == franchise, untouched), and a sample of newly-
linked rows shows the clean canonical route alongside the original
franchise description intact.

---

### 50. Only link routes at city/municipality level, and stop falling back to the franchise sentence (18 Aug)

Two corrections to #49, both from user review:

**Never link on a bare province/island-level mention.** A canonical
place name that reduces to a single word which *also* happens to be a
province name (Batangas City → "BATANGAS", also the province in every
other Batangas-area entry; likewise Sorsogon City, Masbate City, Iloilo
City, Davao City) let a bare province mention alone ("MASBATE",
"BATANGAS", no city qualifier) satisfy that lone place-token and count
as a specific city match - which is exactly the province-level linking
the user asked not to do. Fixed by requiring the literal word "CITY" in
the operating route text for these five specific canonical routes
before accepting a match; a bare province/island name with no "CITY"
now falls through instead.

**Stop falling back to the franchise sentence.** When no confident
city-level match exists, `route` was reverting to `franchise` - the
full descriptive sentence ("SORSOGON CITY-PASAY CITY"). The user
pointed out the sheet's own "OPERATING ROUTE" column (already read for
matching, but only ever used to *derive* a canonical match, never
stored on its own) is the better fallback - shorter, closer to a real
route name, and it's what the match attempt was already based on
anyway. Re-ran the whole linking pass for all 1,832 masterlist vehicles
with both fixes together: `route` is now either the matched canonical
value, or the raw OPERATING ROUTE text - never the franchise sentence.

Result: 1,409 rows matched at confirmed city/municipality level (down
from 1,443 - the difference is exactly the bare province/island
mentions the stricter rule now correctly declines to guess at); 473
fell back to their own OPERATING ROUTE text instead of franchise.

Verified directly against the database: a bare "MASBATE" operating
route no longer links to Masbate City (none remain); "SORSOGON CITY-
PASAY CITY" franchise rows whose OPERATING ROUTE cell is itself just
bare "SORSOGON" (no "CITY") correctly stayed unlinked, with `route` now
showing that short text instead of the long franchise sentence; the
Naga/Camarines Norte rows from #49 still correctly show their own
operating-route text, not franchise, and remain unlinked.

---

### 51. A vehicle must actually be registered for the route it books (18 Aug)

#48's route-based vehicle grouping was a suggestion, not a requirement -
an operator could still pick any of their vehicles for any route. Now
it's a hard requirement: the Plate No. dropdown only offers vehicles
whose own route matches the one picked (same word-overlap matching as
#48); with none, the dropdown and Request button both disable with an
explanatory note. Same rule in the Change dialog.

**Enforced server-side, not just in the dropdown** (migration
`0026_vehicle_route_required.sql`): ported the client-side matching
function to SQL (`vehicle_matches_route()`/`route_tokens()`, kept in
lockstep with the JS version) and added it to `bookings_insert_own`'s
RLS check and to `request_booking_change()` - the dropdown filter is UX
only, same as everywhere else in this app; RLS is the real gate.

**Found a real bug in the first version while verifying live**: inside
the RLS policy's correlated `EXISTS` subquery, the bare `plate_no`/
`route` references (meant to mean the row being inserted) got shadowed
by the subquery's own `vehicles.plate_no`/`vehicles.route` columns of
the same name - Postgres resolved them to the innermost scope, silently
turning the check into "does this vehicle's plate/route equal itself,"
which is always true. Caught by deliberately bypassing the UI and
inserting a mismatched booking directly through the Supabase client -
it went through with no error. Fixed in migration `0027` by qualifying
the outer row explicitly as `bookings.plate_no`/`bookings.route` (the
table name itself works as the row's own qualifier in a `WITH CHECK`
expression when no alias was given).

Verified live end-to-end: the Plate No. dropdown correctly showed only
the one matching vehicle out of two, and correctly disabled with the
explanatory note (and a disabled Request button) when neither vehicle
matched the picked route. Then, bypassing the UI entirely: the same
mismatched insert that had silently succeeded under the buggy `0026`
policy came back with a `42501` RLS violation after `0027`'s fix, while
a matching insert still succeeded normally; `request_booking_change()`
correctly rejected a mismatched edit with a friendly error message.
Test data cleaned up after.

Updates README per project convention.

---

### 52. Route dropdown narrowed to the operator's own registered routes (18 Aug)

The Route field on the booking form now only lists routes at least one
of the operator's own vehicles is registered for - e.g. Genesis
Transport (vehicles registered only for Balanga, Clark, and Mariveles,
confirmed against the live data before building this) only ever sees
those three, not the other 80. Falls back to the full list rather than
showing nothing if the operator has vehicles but none match any
canonical route at all, so this can never lock someone out entirely.
Same narrowing in the **Change** dialog, still preserving a booking's
current route as an option even if it's since fallen outside the
matched set. (`routesWithRegisteredVehicle()` in `docs/dashboard.html`.)

**Found and fixed two real bugs while verifying this live:**

- **A temporal-dead-zone bug**, the same class this codebase has hit
  before (#37/#39/#46): `initForm()` (called at module top-level) now
  calls the new function, which needs `ROUTE_STOPWORDS` - but that
  `const` was declared later in the file than where the call actually
  executes. Symptom: the Route dropdown rendered completely empty, with
  a `ReferenceError: Cannot access 'ROUTE_STOPWORDS' before
  initialization` in the console. Fixed by moving the declaration up
  into the file's existing early-module-state block, same fix pattern
  as every prior occurrence of this bug.
- **A real province-vs-city matching bug**, on both sides: comparing
  *full* route token sets let two different towns in the same province
  match each other purely on the shared province word - "Mariveles,
  Bataan" was incorrectly offered as a valid vehicle for a "Balanga,
  Bataan" booking, both client-side (the plate dropdown) and
  server-side (`bookings_insert_own`, `request_booking_change()`),
  since neither had been updated when the *data* got the equivalent fix
  in #50. Fixed both: `routeTownPart()`/`vehicleMatchesRoute()` in
  `docs/dashboard.html`, and `route_town_part()`/`vehicle_matches_route()`
  in migration `0028` - matching now compares only the town segment
  (before the first comma) of each route, never the full string.

Verified live with a test operator seeded with vehicles for Balanga,
Clark, and Mariveles (mirroring Genesis Transport's real registrations,
confirmed directly against the database first): the Route dropdown
showed exactly those three; after the TDZ fix, no console errors;
before the town-vs-province fix, the Mariveles vehicle wrongly appeared
as an option for a Balanga booking and a direct bypass insert with that
mismatch silently succeeded - after the fix, the dropdown correctly
excluded it and the same bypass insert correctly got a `42501` RLS
violation, while a legitimate matching insert still succeeded. Test
data cleaned up after.

Updates README per project convention.

---

### 53. Re-check every operator for missed route links (18 Aug)

User report: Jam Liner was missing routes it should have had (some of
its Lucena City vehicles weren't showing up under that route). Audited
every operator's vehicles for the same class of problem - vehicles
whose `route` never got linked to a canonical route during #49/#50/#52,
even though a link should have been possible - and fixed four real gaps
in the matching logic that were causing correctable cases to be missed
across many operators, not just Jam Liner:

- **Multiple parenthetical asides confused the town/province split**:
  "TABACO (ALBAY) - CUBAO (QUEZON CITY)" has two `(...)` groups: the
  old code anchored to the *last* one (`QUEZON CITY`, unrelated) instead
  of the first (`ALBAY`, the actual province), so the province check
  always failed. Now takes the first parenthetical group.
- **The risky-place "needs CITY" check didn't require adjacency**:
  "LIPA CITY BATANGAS" contains the word "CITY" *somewhere*, which was
  enough to let Batangas City wrongly tie with Lipa City for the match,
  making the whole row ambiguous and unmatched. Now requires "CITY"
  immediately next to the specific risky place name ("BATANGAS CITY",
  not just "CITY" anywhere in the string).
- **Bare province mentions couldn't disambiguate multi-way ties**: "SAN
  JOSE, MINDORO" (no Occidental/Oriental qualifier) was rejected because
  the distinctive-province-token check was computed against *all 83
  routes*, where "MINDORO" isn't unique enough - even though, among just
  the 5 "San Jose" candidates specifically, only one is in Mindoro at
  all. Now computes distinctiveness within the tied candidate set, not
  globally.
- **A new explicit-conflict rule replaces the old blanket province
  check**: directional/type qualifiers (NORTE/SUR, OCCIDENTAL/ORIENTAL,
  NORTHERN/EASTERN/SOUTHERN/WESTERN) now only reject a candidate when
  they *actively contradict* it (still correctly rejects "NAGA,
  CAMARINES NORTE" against the real Naga City, Camarines *Sur* -
  verified no regression), rather than requiring an exact word match
  that abbreviations or bare mentions couldn't satisfy.
- **One manual sub-locality alias**: "COTTA" is a district within Lucena
  City (confirmed by manual review, not an algorithmic guess) with no
  shared words with "Lucena" at all - added as an explicit alias so
  "COTTA( LUCENA QUEZON)" links to Lucena City, Quezon.

Re-ran the linking pass across every operator's masterlist vehicles
(only re-attempting rows not already linked - nothing already-canonical
was touched). Verified directly against the database: Lipa City
Batangas, San Jose Occidental Mindoro, Maasin City Southern Leyte,
Catarman Northern Samar, Tabaco City Albay, and Gubat Sorsogon cases
across several different operators are now all correctly linked; the
Naga/Camarines Norte rows are confirmed still correctly unlinked (no
regression on the fix from #49). Jam Liner specifically: its Lucena
City, Quezon vehicle count went from 29 to 36 once its Cotta-district
vehicles linked correctly.

**Separate finding, not fixed here**: Jam Liner (and several other
operators) also has vehicles for Bauan (Batangas), Biñan (Laguna), Boac
(Marinduque), Pacita Complex (Laguna), and Santa Rosa (Laguna) - real
destinations that simply aren't among PITX's 83 canonical routes at
all. No amount of matching-logic improvement links these, since there's
nothing to link to; adding a new canonical route is a bigger decision
(new gate assignment, etc.) than a data-linking fix, so these are left
as-is pending that decision rather than invented unilaterally.

No app code changed for this pass - only the one-off data-linking
script's matching logic, since the live runtime matcher (`dashboard.html`,
migration `0028`) already works correctly once `vehicles.route` holds an
exact canonical string; the improvements only mattered for this one-time
re-linking pass itself.

---

### 54. Re-link routes from the cleaned masterlist instead of fuzzy text matching (18 Aug)

User: "For the routes, use the cleaned data of the vehicle masterlist for
your reference as to reduce confusion" - handed over a cleaned version
of the vehicle masterlist workbook whose `PROVL` sheet has previously-empty
`City / Municipality` and `Province` columns now properly filled in per
vehicle (the original workbook had these columns present but 100% empty,
so #49/#50/#53 had no choice but to fuzzy-match the free-text "OPERATING
ROUTE"/"FRANCHISE" columns).

Replaced the one-off data-linking script's approach entirely: instead of
parsing free text with word-token matching, each row's `City /
Municipality, Province` pair is looked up directly against the 83
canonical routes (normalizing only "Sta./Sto." &#8594; "Santa/Santo" and an
optional "City" suffix - not fuzzy matching). Vehicles are matched to
their DB row by **plate number** (unique and already in both the
masterlist and the `vehicles` table), not by resolving operator names,
which sidesteps the operator-name-alias matching entirely for this pass.

Of 1,832 vehicles: 1,413 already had the correct canonical route; 117
were corrected, including several rows previously stuck with obviously
wrong text like `"SORSOGON"`, `"MASBATE"`, `"SABANG"`, and - notably -
confirms and fully resolves the `"NAGA, CAMARINES NORTE"` cases flagged
in #49/#53 as not a real place: the cleaned data independently confirms
those vehicles are actually Naga City, Camarines **Sur**, and all 47 are
now linked there. 87 "Nasugbu, Batangas" vehicles remain unresolved
because the cleaned data (and the operators' own route/franchise text)
doesn't say whether they run via Aguinaldo or via Kaybiang Tunnel - the
two canonical Nasugbu routes are only distinguished by that detail, so
these were left untouched rather than guessed. 63 vehicles had no
City/Municipality or Province in the cleaned sheet at all and were also
left untouched.

**Separate finding, expanded**: 152 vehicles (up from the partial list
noted in #53) have a clean, confidently-identified City/Municipality +
Province that simply isn't among PITX's 83 canonical routes - the fuller
list, now backed by clean data instead of guesses: Mabalacat City
(Pampanga), San Pedro (Laguna), Guiuan (Eastern Samar), Placer (Masbate),
Cebu City (Cebu), Caramoan (Camarines Sur), Biñan (Laguna), Maragondon
(Cavite), Pasacao (Camarines Sur), Boac (Marinduque), Presentacion
(Camarines Sur), Garchitorena (Camarines Sur), Donsol (Sorsogon), Santa
Rosa (Laguna), Prieto Diaz (Sorsogon), Bauan (Batangas), Muntinlupa City
(Metro Manila), Mandaon (Masbate). As before, adding a canonical route is
a bigger decision (new gate assignment, etc.) than a data-linking fix, so
these are left as-is pending that decision.

Verified directly against the database: `route ILIKE '%NAGA%CAMARINES
NORTE%'` now returns 0 rows (was silently wrong before); `route =
'Naga City, Camarines Sur'` returns 47; spot-checked plates NKK8480 -&gt;
Masbate City, Masbate, ARA5827 -&gt; Buhi, Camarines Sur, TYZ138 -&gt; Mendez
(Mendez-Nuñez), Cavite all confirmed correct post-update.

No app code changed - same as #53, this was purely a one-time data
correction; the live runtime matcher already works correctly once
`vehicles.route` holds an exact canonical string. `vehicles.franchise`
was left untouched throughout, as always.

---

### 55. Merge the Nasugbu routes, add the 18 missing destinations (18 Aug)

User: "Merge all Nasugbu, Batangas as one Nasugbu Batangas and add the
152 vehicles with real destination then update the canonical routes" -
direct follow-up to #54's two open items.

**`ROUTES` in `docs/assets/app.js` (and its `ROUTE_GATES` map) updated,
83 &#8594; 100 entries:**

- `"Nasugbu Via Aguinaldo, Batangas"` and `"Nasugbu Via Kaybiang Tunnel,
  Batangas"` merged into one `"Nasugbu, Batangas"` - the cleaned
  masterlist (and the operators' own route text) can't say which via a
  vehicle actually runs, so keeping two entries was manufacturing a
  distinction the data can't support.
- 18 new canonical routes added for the real destinations #54 found with
  registered vehicles but no matching canonical route: Mabalacat City
  (Pampanga, Gate 5), San Pedro, Biñan, Santa Rosa (Laguna, Gate 2),
  Maragondon (Cavite, Gate 2), Bauan (Batangas, Gate 2), Boac
  (Marinduque, Gate 2), Caramoan, Pasacao, Presentacion, Garchitorena
  (Camarines Sur, Gate 4), Donsol, Prieto Diaz (Sorsogon, Gate 4),
  Placer, Mandaon (Masbate, Gate 4), Cebu City (Cebu, Gate 4), Guiuan
  (Eastern Samar, Gate 4), and Muntinlupa City (Metro Manila).
- **Muntinlupa City, Metro Manila is flagged, not just added quietly**:
  every other route in this list is provincial (matching the app's whole
  premise of provincial operators booking a bay at PITX); Muntinlupa is
  in NCR, same as PITX itself, and only 1 of 1,832 vehicles maps there.
  It doesn't fit the Gate 2/4/5 scheme at all, so it's deliberately left
  out of `ROUTE_GATES` (falls back to "show every bay" per
  `gateForRoute()`'s existing null-handling) rather than assigning it a
  made-up gate. Worth a staff double-check on whether this one vehicle's
  data is real or a masterlist error - not corrected unilaterally, same
  standard applied to the Naga/Camarines Norte case in #49/#54.

**Data re-linked against the DB** using the same cleaned-masterlist
lookup as #54, re-run against the expanded 100-route list: 239 vehicles
updated (87 Nasugbu vehicles merged onto the single new entry, 152 onto
the 18 new routes), 1,530 already correct, 63 still without clean
City/Municipality/Province data left untouched. Zero ambiguous or
unmatched rows remained after the expansion - verified directly against
the database (`route ILIKE '%via aguinaldo%' or '%via kaybiang%'` now
returns 0 rows; each of the 18 new routes' vehicle counts confirmed
against the per-plate cleaned-data lookup).

No RLS/migration changes needed - `ROUTES` is a UI-only picklist (nothing
in the database enforces it against a fixed enum), so the live matching
functions (`vehicle_matches_route()`, `route_town_part()` from migration
`0028`) work unchanged against the new route strings.

---

### 56. Fix a live bug: accented town names could never match themselves (18 Aug)

User report: "Why is there no Biñan Laguna in Jam Liner". Jam Liner's
vehicles *were* correctly linked to `"Biñan, Laguna"` in the database
(#54/#55) - the bug was in the matching logic itself, both client-side
and, more seriously, in the RLS check that actually enforces #51's "must
have a matching vehicle" rule.

`routeTokens()` (`dashboard.html`) and its SQL port `route_tokens()`
(migration `0026`) strip every character outside `[A-Za-z0-9 ]` in one
blanket pass - including accented letters. `"BIÑAN"` has its `"Ñ"`
replaced with a bare space, becoming `"BI AN"`: two 2-letter fragments
that the `length >= 3` significant-word filter then throws away
entirely. `route_tokens('Biñan, Laguna')` returned zero tokens for the
town part, so `vehicle_matches_route('Biñan, Laguna', 'Biñan, Laguna')`
returned **false** - confirmed directly against the database. Any route
whose town name contains an accented letter can never match itself this
way; Biñan is the only one currently on the list, but the bug is generic
(not name-specific).

This isn't just a dropdown cosmetic gap - `vehicle_matches_route()` is
what `bookings_insert_own`'s RLS `WITH CHECK` and `request_booking_change()`
actually enforce (#51). A Jam Liner vehicle correctly registered for
Biñan, Laguna would be **rejected outright** trying to book that exact
route, with no way around it from the UI.

Fixed both sides the same way: map each accented letter to its base
letter (`Ñ`&#8594;`N`, `Á`&#8594;`A`, etc.) *before* the non-alphanumeric strip,
instead of letting that strip erase it as if it carried no letter at
all. JS fix in `routeTokens()`; SQL fix via `CREATE OR REPLACE` in new
migration `0029_route_tokens_diacritics.sql` (same signature, no `DROP`
needed).

Verified directly against the database post-migration:
`route_tokens('Biñan, Laguna')` now returns `{BINAN, LAGUNA}`;
`vehicle_matches_route('Biñan, Laguna', 'Biñan, Laguna')` now returns
`true`; all 7 of Jam Liner's Biñan vehicles now match; re-checked
`vehicle_matches_route('Mariveles, Bataan', 'Balanga, Bataan')` still
returns `false` - no regression on the town-vs-province fix from #51.

---

### 57. Search the fleet database by route (18 Aug)

User: "Allow searching of routes in the searchbar of the vehicle
database page of Staff" - `vehicles-database.html`'s search box already
matched plate no., bus no., operator name, and username, but not a
vehicle's `route`, even though Route is one of the visible table
columns. Added `v.route` to the filtered fields and updated the search
box's placeholder text ("Plate no., operator, bus no., or route…") to
match. No new UI, no schema change - `route` was already selected by the
page's existing query.

---

### 58. Rebuild the canonical route list from the masterlist, not Sheet5 (18 Aug)

User: "For the request bus bay slots, forget the initial canonical
routes delete that and don't recall that anymore. Use the Column J,K for
the routes for example 'Santa Rosa, Laguna'. Also update the vehicle
database operating route with 'Santa Rosa, Laguna' to avoid confusion" -
a deliberate pivot, not another patch: stop treating the operator
database's "Sheet5" as the source of truth for what routes exist at all,
and derive `ROUTES` purely from the cleaned vehicle masterlist's own
City/Municipality (column J) and Province (column K) columns instead.

**`ROUTES` and `ROUTE_GATES` in `docs/assets/app.js` fully replaced**,
83/100 entries &#8594; **91 entries** - every one of them exactly the
masterlist's own spelling, with only "Sta./Sto." abbreviations expanded
to "Santa/Santo" (matching the user's own example: the masterlist has
"Sta. Rosa, Laguna", expanded here to "Santa Rosa, Laguna"). Notable
consequences of switching sources entirely:

- **Some Sheet5 routes are gone** because zero vehicles in the
  masterlist are actually registered for them - there was nothing to
  link and no reason to keep offering them: "Tagaytay City, Cavite",
  "Amadeo, Cavite", "Naval, Biliran", "Pintuyan, Southern Leyte", "San
  Jose, Antique", "Clark, Pampanga", "Junction Luna (Abulug), Cagayan",
  "Roxas, Oriental Mindoro", "Nabua, Camarines Sur".
- **Several routes changed spelling** to match the masterlist exactly
  instead of Sheet5's phrasing: "Balanga, Bataan" &#8594; "Balanga City,
  Bataan", "Tuguegarao, Cagayan" &#8594; "Tuguegarao City, Cagayan", "San
  Jose, Nueva Ecija" &#8594; "San Jose City, Nueva Ecija", "San Carlos,
  Pangasinan" &#8594; "San Carlos City, Pangasinan", "Dagupan, Pangasinan"
  &#8594; "Dagupan City, Pangasinan", "Laoag, Ilocos Norte" &#8594; "Laoag City,
  Ilocos Norte", "General Santos, South Cotabato" &#8594; "General Santos
  City, South Cotabato", "Mendez (Mendez-Nuñez), Cavite" &#8594; "Mendez,
  Cavite", "Sta.Ana, Cagayan" &#8594; "Santa Ana, Cagayan".
- Gates re-derived from each route's own province using the same
  Gate 2/4/5 grouping as before (Cavite/Batangas/Laguna/Quezon/Mindoro,
  Bicol/Visayas/Mindanao, CAR/Regions I-III) - not carried over from the
  old map, since several routes' spelling changed.

**Vehicle data re-linked to match** ("update the vehicle database
operating route... to avoid confusion"): re-ran the plate-number lookup
against the masterlist one more time, this time writing the *exact*
`{City/Municipality}, {Province}` text (after the same Sta./Sto.
expansion) with no other normalization - 122 vehicles updated (mostly
the spelling changes above), 1,656 already matching, 54 still without
clean masterlist data left untouched as before. Verified directly:
`vehicles.route = 'Santa Rosa, Laguna'` now returns the 2 vehicles the
user's example was about; zero leftover "Sta. Rosa"-style abbreviations
remain in the vehicles table; confirmed only 4 pre-existing vehicles
still carry non-canonical raw text (`SAN JOSE`, `NEGROS OCCI.`,
`PALAWAN`, `GUIMARAS ISLAND` - real gaps in the masterlist's own data,
not something this pass can fix) and 13 pre-existing bookings use
free-text or now-dropped route names, both already covered by the
Change dialog's existing "not in the current list" fallback.

No RLS/migration changes needed, same as #55 - `ROUTES` is a UI-only
picklist.

---

### 59. Fix "Santa X" routes bleeding into each other via the shared honorific (18 Aug)

User report (screenshots): an operator whose vehicles are all "Santa
Cruz, Laguna" saw "Santa Rosa, Laguna" offered in the Route dropdown too,
despite having no vehicle registered for it - same bug class as #56,
same root cause: `routeTokens()`'s significant-word matching treats
`"SANTA"` as just another word, not a filler. `"Santa Cruz"` and `"Santa
Rosa"` tokenize to `{SANTA, CRUZ}` and `{SANTA, ROSA}`, which overlap on
`"SANTA"` - `vehicle_matches_route('Santa Cruz, Laguna', 'Santa Rosa,
Laguna')` returned **true**. Confirmed directly against the database.
This hit the RLS enforcement (#51), not just the dropdown - the actual
booking-time check would let a Santa Cruz vehicle through for a Santa
Rosa slot.

Fixed by adding `"SAN"`, `"SANTA"`, `"SANTO"` to the stopword list
already used to drop generic filler like `"CITY"`/`"VIA"` - the same
place other filler words are filtered, not a special case. Checked all
91 routes in the current list first: every "San "/"Santa "/"Santo "
route has a second, distinguishing word (Cruz, Rosa, Jose, Juan, Andres,
Pedro, Elena, Ana, Carlos...), so none collapse to zero tokens once the
honorific itself is dropped - same safety check done for the diacritics
fix in #56. JS fix in `routeTokens()`; SQL fix via migration
`0030_route_tokens_san_santa_stopwords.sql` (`CREATE OR REPLACE`, same
signature as before).

Verified directly against the database post-migration:
`vehicle_matches_route('Santa Cruz, Laguna', 'Santa Rosa, Laguna')` now
`false`; `vehicle_matches_route('Santa Rosa, Laguna', 'Santa Rosa,
Laguna')` still `true`; re-checked #56's Biñan fix and #51's Balanga/
Mariveles town-vs-province fix both still hold, no regressions.

**Noted but not fixed here** (pre-existing, unrelated to this bug): four
different routes are literally named "San Jose" in different provinces
(Nueva Ecija, Occidental Mindoro, Camarines Sur, Dinagat Islands) and
always collided with each other via the shared "JOSE" town-part token,
both before and after this fix - town-only matching can't distinguish
same-named towns in different provinces. Not introduced or resolved by
this change.

---

### 60. Restart vehicle-route matching as plain equality, not fuzzy word overlap (18 Aug)

User: "For the bus bay slot reservation, I need you to restart. The
operator should only see the routes where they have registered vehicles
in it then the vehicles plate number will be filtered based on the
route." Both halves of this were already built (#51/#52 for the route
narrowing, #48 for the plate filter) - but every refinement to the
underlying matching rule kept surfacing a new false-positive bug
(#56 diacritics, #59 SAN/SANTA/SANTO), because the rule itself - word-
overlap between a vehicle's free-text route and a canonical booking
route - was the wrong tool for data that's no longer free text.

Since #58 rebuilt `ROUTES` directly from the cleaned masterlist and
re-linked vehicles against it, `vehicles.route` holds the *exact*
canonical string for the overwhelming majority of vehicles (checked
directly: 1,778 of 1,832, and - the number that actually matters -
every operator with at least one approved vehicle has at least one
exact canonical match, so nobody falls through to the "no matches, show
everything" fallback). Fuzzy matching was solving a problem that no
longer exists.

Replaced `vehicleMatchesRoute()` with plain equality
(`vehicle.route === bookingRoute`), deleting `routeTokens()`,
`routeTownPart()`, and `ROUTE_STOPWORDS` entirely - three rounds of
increasingly-specific-case patches (#48, #51, #56, #59) collapse into
one line. Mirrored server-side: `vehicle_matches_route()` (the function
`bookings_insert_own`'s RLS `WITH CHECK` and `request_booking_change()`
actually enforce) is now `p_vehicle_route IS NOT DISTINCT FROM
p_booking_route AND p_vehicle_route IS NOT NULL` via migration
`0031_vehicle_matches_route_exact.sql`; `route_tokens()` and
`route_town_part()` are dropped outright rather than left as dead code,
since nothing else in the schema calls them.

The two operator-facing behaviors themselves are unchanged - Route
dropdown narrowed to the operator's own registered routes
(`routesWithRegisteredVehicle()`), Plate No. dropdown hard-filtered to
vehicles matching the selected route (`plateOptionsHtml()`) - only the
matching rule underneath changed.

Verified directly against the database post-migration:
`vehicle_matches_route('Santa Rosa, Laguna', 'Santa Rosa, Laguna')` true,
`vehicle_matches_route('Santa Cruz, Laguna', 'Santa Rosa, Laguna')` now
false, Biñan and Balanga/Mariveles cases from #56/#51 still correct,
`route_tokens`/`route_town_part` confirmed dropped, Jam Liner's 7 Biñan
vehicles still match.

---

### 61. Transfers now require the receiving operator to match the route too (18 Aug)

User: "For the transfer option, they may only select operators with the
same route and vehicles must also be filtered based on the route." The
transfer dialog (#10/#16) let a sender pick *any* other operator account
and *any* of that operator's approved vehicles, with no route check at
all - a "Batangas City, Batangas" booking could be handed to an operator
(and a specific vehicle) with nothing to do with that route. Applied the
same "must be registered for the route it books" rule #51/#60 already
enforce for the original operator, to the receiving side too.

- `list_operator_accounts()` now takes the booking's route and only
  returns operators with at least one approved, LTFRB-eligible vehicle
  registered for it - no point offering an operator who could never
  actually take the booking. Since which route applies depends on which
  specific booking is being transferred, this is no longer preloaded
  once at page load - it's loaded fresh each time the transfer dialog
  opens, for that booking's route.
- `list_operator_vehicles()` now also takes that route and only returns
  the chosen operator's vehicles registered for it - same narrowing the
  booking form already applies to the sender's own plate dropdown.
- `request_booking_transfer()` re-validates the route match server-side
  (migration `0032_transfer_recipient_route_match.sql`) - the dropdowns
  above are UX only, same as everywhere else in this app. Both `list_*`
  functions change their parameter list (route added), so they're
  `DROP FUNCTION` + `CREATE`, not `CREATE OR REPLACE`. All three reuse
  `vehicle_matches_route()` (#60's plain-equality rule) rather than a
  separate check - one source of truth for "is this vehicle registered
  for this route," used everywhere it's asked.

Verified with a full authenticated round-trip using three throwaway test
operators (cleaned up after): A and B each with an approved vehicle on
"Santa Rosa, Laguna", C with one on "Batangas City, Batangas" only, and
a real booking by A for "Santa Rosa, Laguna". Signed in as A:
`list_operator_accounts` correctly returned B (and any other Santa
Rosa-registered operator) but not C and not A itself;
`list_operator_vehicles` correctly returned B's matching vehicle and an
empty list for C; `request_booking_transfer` to B's vehicle succeeded;
a direct bypass attempt - calling `request_booking_transfer` straight at
C's wrong-route plate, skipping the dropdowns entirely - was correctly
rejected server-side with "That plate isn't one of the receiving
operator's approved vehicles registered for this booking's route."

---

### 62. Day and Week views for both schedule pages (19 Aug)

User: "For the schedule, I want to have a weekly view and a daily view.
Do this for all accounts." Added a **Day / Week** toggle to both
schedule pages - `schedule.html` (staff) and `my-schedule.html`
(operators) - so "all accounts" means both roles, not just one.

Added `startOfWeek()`/`weekDates()` to `docs/assets/app.js` (Monday-start
weeks) so both pages derive week boundaries the same way instead of each
re-implementing it.

**Staff (`schedule.html`)**: Day view is unchanged - the full per-slot
capacity grid for one date, with every booking listed and the
bay-reassignment control. Week view is a new 7-row summary table (one
row per day of the week containing the selected date: approved,
awaiting review, slots at capacity), not the full per-slot detail -
a 48-row-by-7-column grid would be unusably dense, so Week trades detail
for an at-a-glance view of the whole week, with a **View day** link on
each row that jumps straight into Day view already on that date. Prev/
Next step by a day or a week depending on which mode is active.

**Operators (`my-schedule.html`)**: replaced the old "Upcoming / All"
filter with the same Day/Week toggle - Week (the new default) shows all
7 days of the week, *including empty ones* (each showing "No approved
slots" so the week's shape stays visible, same reasoning as the old
"show every day" behavior just scoped to a week instead of everything at
once), Day shows a single date. Both reuse the existing per-booking
timeline card layout, just repeated once per date shown.

Verified with a full authenticated visual walkthrough (throwaway staff +
operator test accounts, cleaned up after): seeded bookings across
several days of one week, confirmed both pages' Week view correctly
showed empty days, today highlighted, and per-day figures matching the
seeded data; confirmed Day view unchanged for both roles; confirmed
staff's "View day" link switches into Day view on the exact date
clicked, with matching figures.

---

### 63. Week view restructured as a date-columns/time-slot-rows grid (19 Aug)

User: "For the week view I want the Date to be the column headers and
time slot to be row headers" - #62's staff Week view was one row per
day with summary counts; restructured into a proper grid instead, with
dates across the top and all 48 time slots down the side.

**Staff**: each cell shows that day/slot's approved count over total
capacity, colored red at capacity same as Day view, plus a small amber
"+N" badge if bookings are still awaiting review in that cell. The old
per-row "View day" button moved to the date column headers themselves,
which are now clickable links into Day view for that date - still one
click away, just relocated to match the new axis.

Asked whether the operator's Week view (`my-schedule.html`, a per-day
timeline list) should get the same grid treatment even though an
operator's bookings are sparse compared to 27 bays' worth of capacity
data - confirmed yes, for consistency. Same grid shape (dates as
columns, all 48 slots as rows), each cell showing bay/route/plate for
an approved booking or a dash - most cells are empty, which is expected
for a typical operator's booking volume.

Added `.week-grid`/`.pending-dot` styles (`docs/assets/styles.css`,
reusing the existing `--amber-ink`/`--amber-wash` tokens rather than
introducing new colors).

Verified with a full authenticated visual walkthrough (throwaway staff +
operator test accounts, cleaned up after): seeded approved and pending
bookings across specific date/slot combinations for both roles,
confirmed the grid correctly places each booking in its date column and
slot row, the pending badge appears only where expected, today's column
is highlighted, staff's date-header "View day" link jumps to the exact
date clicked with matching data, and Day view is unchanged for both
roles.

---

### 64. Staff's Week grid shows actual bookings, not occupancy counts (19 Aug)

User: "for the weekly schedule view, I want the bookings to show in the
grid rather than the slot occupancy" - #63 gave staff's Week grid the
right axes (dates as columns, time slots as rows) but each cell still
only showed an approved/capacity count plus a small "+N awaiting review"
badge. Replaced that with the actual bookings themselves.

Each cell now lists every booking for that date/slot - status badge,
operator (previous operator struck through if transferred), plate,
route, and assigned bay - the same information Day view's per-slot list
already shows, just without the bay-reassignment control (still only in
Day view, one click away via each date header's "View day" link). The
query backing Week view now selects the full booking columns instead of
just `booking_date, slot, status`. Cells still turn "at capacity" red
the same way as before once approved bookings reach total bay capacity
- that coloring didn't change, only what's displayed inside the cell.

Operators' Week grid (`my-schedule.html`) already showed actual bookings
(bay/route/plate) rather than a count, so it needed no change here -
this was specifically the staff occupancy-count regression from #63.

Removed the now-unused `.pending-dot` style; added `.week-cell`/
`.week-cell-bookings` (`docs/assets/styles.css`) sized for a cell that
needs to grow and wrap around a small list rather than stay single-line.

Verified with a full authenticated visual walkthrough (throwaway staff +
operator test accounts, cleaned up after): seeded one approved and one
pending booking in the same date/slot, confirmed both render fully in
that cell (status badge, operator, plate, route, bay) rather than a
count.

---

### 65. Auto-assigned trip numbers on approval (19 Aug)

User: "Similar with airlines, I want trip numbers to be assigned the
bookings. The naming convention may be the first 3 letters of the route
then the booking time... When a booking is approved a name should be
automatically assigned." Added `bookings.trip_number`, computed and set
by a new `trg_assign_trip_number` trigger the moment a booking's status
becomes `approved` - `Naga City, Camarines Sur` at 3:30 PM becomes
`NAG1530`, exactly the user's own example.

**Route codes**: added `route_trip_codes` (migration
`0033_trip_numbers.sql`), one fixed 3-letter code per canonical route -
usually the first 3 letters of the town's first word, but per the
user's own tie-break example ("Sta Rosa and Sta Cruz... use the 2nd
word instead"), any route that would collide on that uses its second
word instead (`Santa Rosa, Laguna` &#8594; `ROS`, `Santa Cruz, Laguna` &#8594;
`CRU` - the user's exact example, verified directly). Computed offline
across all 91 routes, checked for collisions after each pass: 10
residual collisions the word-based rule alone couldn't resolve (a
handful of single-word towns sharing the same first 3 letters, like
"Baguio"/"Bagamanoc" both `BAG`, and "San Jose" being the literal name
of 4 routes in different provinces) got a manual override, each
commented in the migration. A route not in the table (stale free-text
data) falls back to the first 3 letters of the route string itself, so
this never hard-fails on old data.

**Same-route, same-time collisions**: multiple bays can serve the same
route at the same time, so unlike a real flight number the base code
alone isn't always unique per day - the 2nd, 3rd... approved booking
sharing a date/route/slot gets a lettered suffix (`NAG1530`, `NAG1530A`,
`NAG1530B`...), the same way an airline runs extra sections of one
flight number.

**Assigned only on approval, cleared on leaving it**: a pending
request's route/plate/time can still change, so there's nothing stable
to name yet - the trigger only fires on the transition into `approved`.
It also clears `trip_number` on any transition *away* from `approved`
(e.g. editing an approved booking via **Change**, which sends it back to
`pending` for re-approval) so a stale trip number never survives a
route/time change - the next approval always computes a fresh one.
Reassigning an already-approved booking's bay doesn't touch status, so
it correctly leaves an existing trip number untouched.

Displayed next to the bay tag everywhere an approved booking shows: the
operator's **My requests** table (`dashboard.html`), and both roles'
Day and Week schedule views (`schedule.html`, `my-schedule.html`) - a
new `.trip-tag` style (green, distinct from `.bay-tag`'s blue so the two
short codes don't blend together).

Verified directly against the database (all three of the user's own
examples: `NAG1530`, `ROS1530`, `CRU1530`, plus the letter-suffix and
clear-on-un-approve behavior with real INSERT/UPDATE sequences) and with
a full authenticated visual walkthrough (throwaway staff + operator test
accounts, cleaned up after) confirming the trip number renders correctly
across all four surfaces once a booking is approved.

---

### 66. Command-center UX pass: staff dashboard, search/bulk actions, decision logs, CSV export, more (19 Aug)

User asked (as a hypothetical "PITX command center staff" UX review):
whether the app was user-friendly for that role, and what could be
added. Proposed a landing dashboard, search + bulk actions on the three
approval queues, a visible decision log per queue, proactive
lockout alerts, CSV export, column visibility on the wide tables, and a
handful of smaller gaps (bay rename, operator-profiles sorting, account
password reset) - then was asked to build all of it. Six pieces were
built in parallel (each independently verified before merging), plus
groundwork done directly:

- **`overview.html`** (new) - staff's landing page after sign-in
  (replacing `staff.html` as the redirect target in `index.html` and
  `guardPage()`'s own mismatched-role redirect, though `staff.html`
  itself is unchanged and still in the nav). KPI tiles for pending
  requests/vehicle approvals/transfers awaiting staff/transfers awaiting
  the operator/today's approved count, each linking straight to its
  queue; an "approaching lockout" alert listing pending requests within
  2 hours of hitting the 4-hour booking-lockout window; quick links to
  every staff page.
- **`staff.html`, `vehicle-approvals.html`, `transfer-approvals.html`** -
  each gained a search box (client-side filter over the loaded queue), a
  per-row checkbox with bulk actions, and a "Recently decided" tab (last
  50 decided items, read-only, for shift-handoff visibility). Bookings'
  bulk approve auto-assigns each selected request the first available
  *suggested* bay for its route's gate, skipping (with a reason shown)
  anything with no gate match or no suggested bay left rather than
  guessing; transfers' bulk actions only apply to transfers the
  receiving operator has already confirmed, matching the existing
  single-item gating.
- **`vehicles-database.html`, `vehicle-approvals.html`** - a "Columns"
  toggle (persisted in `localStorage`) to show/hide individual columns
  on these ~19-column tables, defaulting to a sensible ~7-8 column
  subset; an "Export CSV" button on both, plus `schedule.html` (Day and
  Week) and `operator-profiles.html`, all exporting exactly what's
  currently visible (search/filter/sort/column-toggle applied) via a new
  shared `downloadCsv()` helper (`docs/assets/app.js`) with a UTF-8 BOM
  so Excel reads accented characters correctly.
- **`operator-profiles.html`** - sortable Operator/Company columns and an
  "All / Missing profile" filter, alongside its existing search.
- **`bays.html`** - a Rename action (bays could previously only be
  activated/deactivated, never renamed after creation).
- **`accounts.html`** - a Reset password action per account, via a new
  `reset-password` Edge Function (`supabase/functions/reset-password/`,
  same privileged-service-role-key pattern as `create-account`/
  `delete-account`) - previously the only way to recover a lost password
  was deleting and recreating the account.

**Bugs found and fixed during verification** (this section exists
because live testing, not just syntax-checking, caught them):

- **TDZ bug in `staff.html`** (same recurring class as #37/#39/#46/#52):
  `let selectedIds` was declared *after* the top-level `await load()`
  that (via `renderRequests()`) reads it, throwing `ReferenceError:
  Cannot access 'selectedIds' before initialization` and leaving the
  entire pending queue blank. Fixed by moving the declaration up with
  the rest of the early module-level state.
- **Inverted lockout-alert condition in `overview.html`**: the original
  instructions (mine) conflated "time until the slot starts" with "time
  until the 4-hour lockout" - the implemented filter
  (`slotStartMillis(...) - now` between 0-2h) actually caught requests
  *already* past the point of no return, not ones approaching it, and a
  booking seeded exactly 50 minutes from lockout showed "nothing
  approaching lockout." Fixed by subtracting `BOOKING_LEAD_TIME_MS`
  before comparing against the 2-hour urgent window.
- **`NULLS FIRST` ordering bug in two "Recently decided" queries**:
  `vehicle-approvals.html` and `transfer-approvals.html` both used
  `.order("decided_at", { ascending: false })` without `nullsFirst:
  false` - Postgres defaults `DESC` to `NULLS FIRST`, so the ~1,800
  masterlist-imported vehicles with no `decided_at` at all sorted
  *before* every genuinely-decided row, burying a just-approved test
  vehicle completely off the visible list. `staff.html`'s equivalent
  query already had this right; the other two didn't. Fixed both to
  match.

Verified with a full authenticated live walkthrough (throwaway staff +
operator test accounts and data, cleaned up after) across all six
pieces: overview.html's KPI counts and (post-fix) lockout alert matched
seeded data exactly; staff.html's bulk-approve-with-suggested-bay
correctly assigned two different bays to two bookings sharing a
date/route/slot (and their trip numbers correctly got the `A` suffix per
#65); vehicle-approvals.html's bulk approve, columns toggle, and CSV
export (intercepted via `URL.createObjectURL` rather than relying on an
actual file download) all produced correct output; bays.html's rename
(via a stubbed `window.prompt`) round-tripped correctly and was reverted;
accounts.html's reset-password flow correctly fails gracefully pending
the Edge Function's deployment, same message pattern as the two existing
account Edge Functions. All three PostgREST FK-embed guesses used by the
"Recently decided" queries (`bookings_decided_by_fkey`,
`vehicles_decided_by_fkey`, `booking_transfers_decided_by_fkey`) were
confirmed to exist and resolve correctly against the live schema -
`transfer-approvals.html`'s decided tab additionally got a "Decided by"
column added after the fact once this was confirmed (the agent that
built it hadn't been able to verify the constraint existed, so it had
conservatively omitted the name rather than guess wrong).

---

### 67. Operator-side UX pass: overview page, cosmetic edits, self-service reset, exports (19 Aug)

User asked for the same treatment on the operator side as #66's
command-center review: an evaluation, then "build your suggestion
proposals." Six proposals from that evaluation, built the same way as
#66 - groundwork done directly, independent pieces built in parallel by
four agents, then verified live before merging.

- **`operator-overview.html`** (new) - operators' shift-start dashboard,
  now the default landing page after sign-in (`index.html`'s redirect
  and `guardPage()`'s mismatched-role redirect both updated;
  `dashboard.html` itself is unchanged, still reachable as "My
  requests"). KPI tiles (pending requests, approved-upcoming, registered
  vehicles, vehicles expiring within 30 days) each linking to the
  relevant page, plus an "approaching lockout" alert mirroring staff's
  `overview.html` exactly.
- **Cosmetic vs. material vehicle edits** (`request_vehicle_change()` -
  migration `0034_vehicle_change_cosmetic_fields.sql`): editing a
  vehicle - even fixing a typo in Sticker No. - always reverted it to
  pending before this. Now the function compares old vs. new values
  itself and only resets status/decided_by/decided_at/rejection_reason
  when a "material" field actually changed - plate, route, or anything
  on the LTO OR/CR paperwork staff verify (case/MV file/OR/CR/chassis
  numbers, franchise, CPC/OR-CR validity, dates granted/expiry). Purely
  descriptive fields (bus number, seating, seat type, aircon, sticker
  no., supporting document) leave an approved vehicle approved.
  `vehicles.html`'s Edit dialog warning text was rewritten to explain
  the split rather than blanket-warning every edit costs re-approval.
- **Self-service "Forgot password?"** (`index.html` + new
  `request-password-reset` Edge Function, unauthenticated by design -
  the one endpoint in the app meant to be reachable while signed out):
  these accounts log in with a username, not a real email inbox, so
  Supabase's built-in email-based reset can't work. Requesting one
  raises the same staff-broadcast notification every other
  "something needs staff's attention" event uses, linking straight to
  the requesting account on `accounts.html` (which also gained a search
  box and a `?user=<id>` scroll-and-highlight, matching the pattern
  `vehicles.html`/`vehicles-database.html` already use for notification
  deep-links) - staff reset the password from there via the existing
  Reset password action. Returns the same generic response whether or
  not the username exists, so it can't be used to enumerate accounts.
- **CSV export** on `dashboard.html` (My requests, respecting the active
  status filter) and `my-schedule.html` (Day or Week, whichever is
  active) - same `downloadCsv()` helper and pattern as #66's staff-side
  exports.
- **Search + column-visibility toggle + CSV export on `vehicles.html`** -
  direct parity with staff's equivalent fleet pages.
- **Mobile-friendly agenda view for My Schedule's Week grid** - below
  the app's existing 640px mobile breakpoint, the 48-row x 7-column grid
  swaps to a condensed per-day agenda list (empty days collapse to one
  line instead of 48), rendered from the exact same already-loaded
  booking data as the grid - CSS switches which is visible, no separate
  fetch.

**Caught during verification, not just syntax-checking:**

- The Edit dialog's warning text still unconditionally said every
  change costs re-approval, which became actively wrong once the
  material/cosmetic split shipped - would have scared operators away
  from harmless corrections. Rewritten to name which fields matter.
- The password-reset notification's `link` was set to a bare
  `"accounts.html"` - the generic notification click handler
  (`app.js`) only appends a query param automatically for
  `relatedTable === "vehicles"`, so the `?user=<id>` `accounts.html`
  needs to scroll/highlight the row never got attached. Fixed by baking
  the query param into the Edge Function's `link` value directly rather
  than changing the shared click handler.

Verified end-to-end with throwaway staff + operator test accounts and
seeded data (cleaned up after): `operator-overview.html`'s KPI tiles
matched seeded counts exactly; the cosmetic/material split confirmed
directly via RPC (a bus-number-only edit left an approved vehicle
approved; a route edit correctly reverted it to pending) and again
through the actual Edit-dialog UI in the browser; the forgot-password
flow's notification-insert logic confirmed correct (the Edge Function
itself isn't deployed in this environment, same documented caveat as
the other three account Edge Functions), and clicking the resulting
notification in the staff bell correctly landed on `accounts.html` with
the requesting account scrolled-to and highlighted after the link-param
fix; CSV exports on both operator pages checked for correct content via
`URL.createObjectURL` interception; the mobile agenda view confirmed at
a 375px viewport (booking shown correctly, empty days collapsed) with
the desktop grid confirmed unaffected on reload at full width.

---

### 68. Region/Province/City route picker replaces free-text vehicle routes (19 Aug)

User: "For new vehicle registration create a dropdown for Region,
Province, City, and Barangay then auto generate the route based on
those details to avoid dirty data in the future." Route on
`vehicles.html`'s Add/Edit forms was still a free-text input
("e.g. PITX - Batangas") - the single biggest source of the dirty-route
problems this app has repeatedly had to clean up (#49/#50/#53/#58).

Two scope questions resolved with the user before building: whether the
dropdowns should cover only PITX's 91 currently-served routes or the
full Philippines (chose **full Philippines** - any region/province/city,
not just ones PITX serves yet), and what Barangay should actually do,
given none of the 91 canonical routes track barangay-level detail and a
full Philippines barangay list runs to ~42,000 entries (chose to
**drop Barangay** - route generation only ever needs City + Province).

- **Data source**: fetched client-side at runtime from
  [isaacdarcilla/philippine-addresses](https://github.com/isaacdarcilla/select-philippines-address)
  (a public PSGC-based JSON API, the same data behind the well-known
  `select-philippines-address` npm package) - region.json/province.json/
  city.json together under 200KB, cached once per page load. Same
  pattern this app already uses to load Supabase/Tesseract.js from a CDN
  rather than bundling a dependency, since there's no build step to
  vendor one into.
- **Cascading Region → Province → City selects** replace the free-text
  input on both Add and Edit forms; the route is generated as
  `{City}, {Province}` the moment a city is chosen, never typed. If the
  generated route isn't one of PITX's 91 currently-served routes, a
  non-blocking note says so rather than rejecting the registration -
  same "separate finding, not fixed here" treatment new real
  destinations have gotten in the CHANGELOG before.
- **NCR special-cased**: PSGC has no real provinces for Metro Manila
  (cities sit under numbered "districts" instead, and Manila's own
  internal districts - Tondo, Binondo, Quiapo - appear in the source
  data as if they were independent cities). Choosing the NCR region
  skips the province step entirely, lists the real 16 cities + Pateros
  directly, and uses "Metro Manila" as the province name, matching the
  one NCR route already in `ROUTES` ("Muntinlupa City, Metro Manila").
- **Name normalization** so a generated route matches the style of every
  existing `ROUTES` entry: city names get a trailing "City" rather than
  a leading "City Of", and any trailing parenthetical alias is stripped
  - not just "(Capital)" specifically, but also things like
  "General Santos City **(Dadiangas)**" (the city's old name) and
  "Mendez **(Mendez-Nuñez)**", both found as real bugs during
  verification (initially only "(Capital)" was stripped, missing every
  other parenthetical alias in the source data). Province names get the
  same parenthetical strip plus "Del"→"del" casing
  ("Davao del Sur", not "Davao Del Sur").
- **Editing an existing vehicle** reverse-decomposes its current route
  back into region/province/city and pre-selects the dropdowns if it
  finds an exact match; older free-text routes that don't decompose
  cleanly (registered before this feature existed) leave the dropdowns
  blank - but the route itself is left completely untouched unless the
  operator actively picks a new one, so editing an unrelated field on an
  old vehicle never silently rewrites or loses its existing route data.

Verified directly: fetched the real dataset and ran the exact
normalization + reverse-lookup logic against a spot-check of 19 routes
from the current `ROUTES` list - caught and fixed the two parenthetical-
alias bugs above this way before ever opening a browser. Then verified
live with a throwaway operator account and seeded data (cleaned up
after): the Add form's Region→Province→City cascade populated correctly
end-to-end (including the NCR special case, confirmed to generate
exactly "Muntinlupa City, Metro Manila"), a non-served destination
correctly showed the non-blocking note, a new vehicle saved with the
generated route via the real form submission; the Edit form correctly
reverse-selected Region V/Camarines Sur/Naga City for an existing clean
"Naga City, Camarines Sur" vehicle, and correctly left the dropdowns
blank while preserving an existing dirty free-text route
("PITX - Batangas (via SLEX)") completely unchanged after a save.

---

### 69. Fix: Operator profiles page showed nothing for staff (19 Aug)

User report: "The operator profiles are not showing in the staff
account." Reproduced immediately - `operator-profiles.html` loaded to a
completely blank page for a staff account: no table, no "X of Y
operators have submitted a profile" summary, not even the empty state.

Another TDZ bug (same recurring class as #37/#39/#46/#52/#66's
staff.html): `let lastVisibleRows = []` - added when the sortable-
columns/CSV-export feature shipped on this page - was declared *after*
the top-level `await load()` a few lines up, which (via `render()` ->
`currentRows()`) reads it immediately. `ReferenceError: Cannot access
'lastVisibleRows' before initialization` on every load, silently
aborting the whole render with nothing shown - RLS and the underlying
data were both fine the entire time (confirmed directly: 78 operators,
68 with a submitted profile, all readable via a service-role query and
via the `operator_profiles_select` policy's `is_staff()` bypass).

Fixed by moving the declaration up to the page's existing early
module-state block, same fix pattern every prior instance of this bug
has used.

Verified live with a throwaway staff account: the page now renders the
full 78-row table, the summary count, and both the "All" and
"Missing profile" filters correctly (10 accounts with no profile,
matching 78 - 68).

---

### 70. Route column: sortable, moved next to LTFRB (19 Aug)

Request: "In the vehicle page of PITX staff make the route sortable
and rearrange it on the right side of LTFRB." Applies to
`vehicles-database.html`, staff's read-only fleet database (not the
operator-facing `vehicles.html`).

Route was plain text at the end of the table, after OR/CR validity.
Now it's a `sortTh()` column like Plate No./Operator/CPC validity/OR-CR
validity (click to sort, click again to flip direction, nulls always
sort last), and it sits immediately to the right of LTFRB in the
`<thead>`, every row's `<td>` sequence, the Columns-visibility popover,
and the CSV export column order - all four driven from the same
`COLUMNS` array, reordered once for consistency.

Verified live with a throwaway staff account against the real
1,832-row table: a single click sorts true ascending (Alfonso,
Cavite -> ... -> Baguio City, Benguet), a second click flips to
descending (Virac, Catanduanes first) with the arrow flipping
▲ -> ▼, the Columns popover lists Route right after LTFRB, and CSV
export inherits the same order since it reads from the same array.

---

### 71. Schedule Week view: occupancy heat grid replaces the booking wall, trip numbers shown (20 Aug)

Prompted by a live demo: simulating a realistic week of demand (52
operators, several slots at full 27-bay capacity) exposed that Week
view's cell rendering doesn't scale - every cell always rendered the
full list of that slot's bookings, so one busy row across all 7 days
already ran past a screen-height of scroll before a full slot even
showed up. Proposed six fixes, showed a static mockup for sign-off
first (occupancy heat grid + click-to-expand + hourly/half-hour
toggle + sticky headers + heatmap colour), then built the approved
subset into `schedule.html` for real:

- Every cell now shows just a fill count (`14`, `27`, `—`), colour-
  graded from empty to full across five steps plus a distinct "at
  capacity" red - the grid's colour shape alone shows the day's busy
  bands without reading a single number.
- Clicking a cell expands that slot's actual bookings into a detail
  row underneath (status, operator, plate, route, **trip number**,
  assigned bay) - the same information the old always-on list showed,
  now on demand instead of always rendered. Only one cell expands at a
  time; clicking it again collapses it.
- New Half-hour / Hourly density toggle (Week view only): Hourly
  collapses each pair of half-hour slots into one row (fill count
  summed, capacity doubled) for a coarser first look at a busy week;
  Half-hour keeps the original 48-row precision. Expanding an hourly
  row lists both half-hour slots' bookings together.
- Time-slot column and day-header row are both sticky, so scrolling a
  long grid never loses track of which row/column is in view.
- "View day" (per date header) still jumps into Day view for bay
  reassignment, unchanged - this grid stays a triage overview, Day
  view stays the workbench.

**Real bug found and fixed along the way**: `loadWeek()`'s booking
query had no `.range()`, so it silently hit Supabase's 1000-row cap
once a week's bookings exceeded that (this week's simulated data has
~2,400) - some slots that were actually full read a bus or two short
(e.g. a true 27/27 rendering as 26/27) with no visible sign anything
was cut off. This existed before this change too (the old
always-rendered list would just quietly drop a card or two per cell);
the heat grid's cell counts made the mismatch checkable against the
database and caught it. Fixed with the same page-through-with-.range()
pattern `vehicles-database.html` already uses for its fleet list.

Verified live against the real simulated week (2,386 approved buses,
4 slots at full 27/27 capacity per busy day): heat colours match true
occupancy, click-to-expand shows correct bookings with trip numbers
(e.g. `LEG0600`, `TGB0600`) for every row, Hourly toggle correctly sums
both half-hour slots (`54/54` at the combined peak), and the KPI strip
and CSV export (same underlying fetch) now agree with the database
instead of undercounting.

---

### 72. Vehicle registration redesign: batch upload, CPC-based eligibility, regrouped fields (20 Aug)

A full rework of the operator's vehicle registration record and form
(`vehicles.html`), migration `0035_vehicle_registration_redesign.sql`:

**Batch upload.** A new "Batch upload" button next to "+ Add vehicle"
opens a CSV import dialog - download a template, upload a filled-in
CSV, preview each row's validation result inline (plate required,
seating/seat-configuration/bus-type rules, CPC-EOV needing a date),
then submit only the valid rows. Each becomes a normal pending vehicle
(`source: 'batch_import'`) - documents and seat-layout files aren't
supported per-row in a CSV, added afterward via Edit like any other
vehicle.

**Removed:** OR No., CR No., Date granted, and Date expiry - dropped
from the table entirely (superseded by the CPC/franchise fields already
tracked separately: case/MV file/chassis/franchise/sticker numbers, CPC
validity, OR/CR validity). The LTFRB column is gone from both
`vehicles.html`'s own table and staff's `vehicles-database.html`
summary table - LTFRB eligibility is still tracked and enforced
exactly as before, just no longer a column on either summary table
(still shown on a vehicle's detail card).

**Renamed:** Bus No. -> Body Number, everywhere the column appears
(operator's table, staff's approval queue and fleet database, the
booking form's plate dropdown, the transfer dialog).

**Modified:** the old plain Aircon yes/no became a **Bus Type**
category - Ordinary, Aircon, Deluxe, or Luxury. Seat configuration
widened from 2x2/2x3 to also allow 1x1/1x3.

**Added:**
- **CPC Extension of Validity?** - a yes/no field; picking "yes" reveals
  a required EOV validity date.
- **A vehicle can no longer book a slot once its CPC (or, if it has
  one, its CPC-EOV) has expired** - enforced the same way the existing
  LTFRB-eligibility rule is: server-side in the `bookings_insert_own`
  RLS policy and `request_booking_change()`, mirrored client-side in
  dashboard.html's plate dropdown for immediate feedback, and
  RLS-verified by attempting a raw insert that bypasses the dropdown
  entirely (rejected with `42501` for an expired vehicle, accepted for
  a current one).
- **Seat configuration layout** upload (diagram/photo of the seating
  plan) - optional, cosmetic, stored the same way the existing
  supporting-document upload is.
- **Year and Make**, **Origin and Destination**, and a free-text
  **Remarks** field.

**Grouped fields that belong together**, in both the Add and Edit
dialogs: Registration & Paperwork (case/MV file/chassis/franchise/
sticker numbers) - CPC Validity (CPC/OR-CR validity dates, the new EOV
toggle) - Route (the existing Region/Province/City picker, plus Origin/
Destination) - Vehicle Details (Body Number, Year, Make, Bus Type,
Seating capacity, Seat configuration) - Remarks.

`request_vehicle_change()`'s material/cosmetic split (migration 0034)
carries over with the new field set: plate, route, and any
CPC/franchise-verified field (case/MV file/chassis numbers, franchise,
CPC or OR/CR validity, CPC-EOV) still sends an approved vehicle back to
pending; body number, seating, seat configuration, bus type, year/make,
origin/destination, remarks, sticker no., and the supporting doc/seat
layout don't.

Staff's `vehicle-approvals.html` and `vehicles-database.html` were
updated in lockstep (columns, CSV export, select queries) since they
read the same table - otherwise they'd have broken outright selecting
columns migration 0035 dropped.

**Bug caught during verification**: the new field list was first wired
up with `VEHICLE_SELECT_COLUMNS` declared *after* the module's
top-level `await loadVehicles()` call - the exact TDZ bug pattern this
codebase has hit repeatedly (#37/#39/#46/#52/#66/#69), caught
immediately via the browser console before it shipped and fixed by
moving the declaration into the existing early-state block.

Verified live end to end: manual registration through the full
regrouped dialog (region/province/city cascading correctly, CPC-EOV
toggle revealing its date field), a hand-rolled CSV parsed and
validated correctly (a deliberately malformed row was rejected with
specific per-field errors, a valid row inserted with `source:
'batch_import'`), an expired-CPC vehicle correctly excluded from the
booking dropdown *and* rejected by RLS on a direct insert attempt
bypassing the dropdown, a valid vehicle's booking accepted, a
cosmetic-only edit (body number/year/make/remarks) leaving an approved
vehicle approved, and a route change correctly reverting one to
pending. Staff's approval queue and fleet database both render
correctly against the new schema.

---

### 73. Vehicle registration: regroup into "LTFRB Franchise Details", fix Remarks (20 Aug)

Follow-up to #72's field regrouping - "Registration & paperwork," "CPC
validity," and "Route" were really all the same kind of thing (what
LTFRB's franchise paperwork covers), so they're now one **LTFRB
Franchise Details** group: Case No., Franchise, Sticker No., **Body
Number** (moved in from Vehicle details), CPC validity, OR/CR
validity, CPC Extension of Validity, and the Region/Province/City route
picker with Origin/Destination. MV File # and Chassis No. moved the
other way, into **Vehicle details**, alongside Year/Make/Bus
Type/Seating/Seat configuration - they describe the physical vehicle,
not its franchise paperwork.

Also fixed **Remarks** showing two "Remarks" labels stacked on top of
each other (the group heading and the field's own `<label>` said the
same thing) - dropped the redundant field label, kept just the section
heading, and left the textbox empty (no placeholder copy either).

Verified live: both dialogs now show exactly one heading per group
(`LTFRB Franchise Details`, `Vehicle details`, `Remarks`), Body Number
renders under LTFRB Franchise Details, MV File #/Chassis No. render
under Vehicle details, and the Remarks textbox has no label and no
placeholder text.

---

### 74. Vehicle registration: Vehicle details before LTFRB Franchise Details (20 Aug)

Swapped the two groups' order in both the Add and Edit dialogs - Vehicle
details now comes first, LTFRB Franchise Details second, Remarks last.
Purely a display-order change (no field moved between groups, no ids
changed); verified live that both dialogs render the groups in the new
order with the section-divider styling following whichever heading is
now first.

---

### 75. Per-vehicle trade names, shown wherever a booking lists its operator (20 Aug)

Some operators run more than one trade name (DBA) under a single
account - different vehicles registered to the same operator can
belong to different trades. Migration `0036_vehicle_trade_name.sql`
adds a `trade_name` field to `vehicles` (optional - a new "Trade Name"
input on `vehicles.html`, right next to Body Number in LTFRB Franchise
Details) and threads it through to every place a booking shows who it
belongs to:

- A booking now **snapshots** the trade name of whichever vehicle/plate
  it's for, the same way it already snapshots `operator_name` - so a
  booking's own display reflects what was true when it was made or
  last changed, not whatever the vehicle's trade name is today. A new
  trigger (`trg_assign_booking_trade_name`) keeps this in sync
  automatically on insert and on any plate change (a plain new
  booking, an edit via `request_booking_change()`, or a transfer's
  operator+plate swap via `approve_booking_transfer()`) - no caller
  computes or passes it themselves, so there's exactly one place this
  logic lives. A transfer also gets a `previous_trade_name` column,
  struck through next to the new one, mirroring `previous_operator_name`.
- A new shared `bookingOperatorHtml()` helper in `app.js` renders the
  "operator name (+ struck-through previous name after a transfer) +
  trade name tag" combination consistently - wired into every page
  that lists bookings: `dashboard.html` (My requests), `my-schedule.html`,
  `schedule.html` (both Day view's booking list and Week view's
  click-to-expand detail, plus its CSV export), `staff.html` (pending
  request cards, the search filter, and the Recently decided table),
  and `overview.html`'s approaching-lockout list. A vehicle's trade
  name (when it has one) also shows on its own detail card, and as an
  optional column on `vehicle-approvals.html` and
  `vehicles-database.html`.
- `request_vehicle_change()` gained a `p_trade_name` param (cosmetic -
  editing it never sends an approved vehicle back to pending, same
  treatment as Body Number).

Verified live end to end with an operator running two vehicles under
two different trade names: a booking made against one vehicle
correctly showed "Multi-Trade Holdings Inc Bicol Star Express · MTH001"
on both staff's Pending requests and the Schedule Day view; changing
the booking's plate to the second vehicle via `request_booking_change()`
correctly recomputed the trade name to the second trade with no
explicit update needed; editing a vehicle's trade name through
`vehicles.html`'s Edit dialog persisted correctly and left an approved
vehicle approved (cosmetic, not material); the new Trade Name column
appeared correctly on `vehicles-database.html` once toggled on via
Columns.

---

### 76. Operator profile redesign: logo, up to 5 contacts, trade name/code (20 Aug)

Prep work for a fresh database - the operator is setting up a clean
Supabase project and asked for this page's code to be ready ahead of
that cutover, so **this migration was written but deliberately not
applied to the current live database** (per the operator's own
instruction); everything below is verified as far as it can be without
touching the current schema - see the note at the end.

`supabase/migrations/0037_operator_profile_redesign.sql` reworks
`operator_profiles` (the company-details form on `operator-profile.html`):

**Removed:** TIN No., Serial Number (OR), and NAU - no longer collected.

**Added:**
- **Trade Name** and **Operator/Trade Code** - both optional text fields
  next to Operator in the "Operator identity" group. (This is a
  per-*account* trade name, distinct from #75's per-*vehicle*
  `vehicles.trade_name` for operators running more than one trade.)
- **Logo upload** - stored in a new private `operator-docs` bucket, same
  path/RLS convention as `vehicle-docs` (`<operator_id>/logo.<ext>`,
  staff can also read). Shows a live preview on the form and a "View
  logo" link on staff's `operator-profiles.html`.
- **Up to 5 contact persons** via an "+ Add contact person" button,
  replacing the old fixed Contact person 1/Contact person 2 sections.
  Stored as a `contacts` JSONB array (`{name, position, number, email}`
  each, `check`-constrained to at most 5 entries) instead of the old
  `contact1_*`/`contact2_*` column pairs - existing contact data is
  folded into the array by the migration itself before those columns
  are dropped, so nothing already on file is lost. Removing a contact
  card re-renders the rest with their typed values intact (each
  card's inputs are read back into the underlying array before every
  re-render, not just on save).

**Modified:** "Company name" is relabeled **"Operator"** on the form.
The underlying column stays `company_name` rather than being renamed -
an actual rename would collide in meaning with `profiles.operator_name`
on a different table, so this is a label-only change.

**Grouped fields** in the form: Operator identity (logo, Operator,
Trade Name, Operator/Trade Code, Company owner) - Booking system
(software name) - Contact persons (the dynamic list + Add button).

Staff's `operator-profiles.html` was updated in the same commit (new
Trade Name/Operator/Trade Code/Logo/Contacts columns, TIN/Serial/NAU
columns removed, CSV export matching) since it reads the same table -
left unfixed, it would have broken outright reading columns migration
0037 drops.

**Verification note:** since the migration isn't applied to the
current database yet, `operator-profile.html`'s actual save path
(`upsert` against the new columns) can't be exercised end-to-end right
now - confirmed live instead that both pages load and render correctly
against the *current* (old) schema with no crash (the page uses
`select("*")`, so new/removed fields just read as empty rather than
erroring), that adding/removing contact cards works correctly up to
the 5-contact cap with data preserved across re-renders, and that
attempting to save produces a clean, expected error naming the
not-yet-existing `contacts` column rather than a silent failure or
crash. Run `node scripts/run-migration.mjs` against the new database
once it's live, then re-verify the save path end to end.

---

### 77. Operator profile: drop the "Do you use one?" booking-system question (20 Aug)

The Booking system group asked a yes/no question before letting you
type the software name - collapsed into just the name field itself;
leaving it blank means no booking system, same meaning the "No" option
used to carry. `has_booking_system` (still read by
`operator-profiles.html`'s Yes/No column) is now derived from whether
a name was given, rather than asked as its own question.

Verified live: the select is gone from the form, the name field's
placeholder reads "Leave blank if you don't use one," and saving still
runs the (currently expected) schema-mismatch error from #76 rather
than a new JS error - confirming the derived-boolean logic itself
executes cleanly before the network call.

---

### 78. App renamed to "Trip Scheduling"; booking slots widened to 15 minutes (20 Aug)

**Rename.** "PITX Bus Bay Booking" is now **"PITX Trip Scheduling"**
everywhere the old name appeared: every page's `<title>`, the nav
bar's brand text (`renderNav()` in `app.js` - one shared spot, so
every page picked it up automatically), the sign-in page's hero and
subtitle, and page eyebrows/headings that referenced "slot" or "bay"
as part of describing the app rather than the physical-bay feature
itself: "Provincial Slot Booking" → "Provincial Trip Scheduling"
(`dashboard.html`, `my-schedule.html`, `operator-overview.html`,
`operator-profile.html`, `vehicles.html`), "Bay Monitor" → "Trip
Monitor" (`schedule.html`), "Slot Approvals" → "Trip Approvals"
(`staff.html`), and the request form's own `<h1>Request a bus bay
slot</h1>` → `<h1>Request a trip</h1>`. The **Bays** page/nav link and
the underlying bay-assignment feature are untouched - physical
terminal bays are a real, ongoing part of how approvals work, distinct
from what the app itself is called.

**15-minute slots.** Booking slots widened from 30-minute to
15-minute granularity - a day is now 96 slots (0-95) instead of 48
(0-47). `docs/assets/app.js`'s `SLOTS`/`formatSlot`/`slotStartMillis`
all updated in lockstep with a new migration,
`0038_fifteen_minute_slots.sql` (see its own note on why this one, like
#76's, is **not applied to the current database** - prepared ahead of
the same upcoming clean-slate database): `slot_start_at()` and
`compute_trip_number()`'s slot-to-clock math both move from a 30- to a
15-minute step, the `bookings_slot_range` check widens to 0-95, and
existing booking rows (should this run against a database that already
has some) get their `slot` doubled first so they keep meaning the same
wall-clock time under the new scheme rather than silently shifting.

**New: hourly mini-card time picker.** The request form's flat
96-option time dropdown became a grid of small hour cards (dashboard.html,
both the request form and its Edit dialog) - each card headed by its
hour ("9:00 PM") containing a 2x2 grid of clickable quarter-hour ticks
(9:00, 9:15, 9:30, 9:45), so scanning a day's worth of 15-minute slots
reads as 24 small groups instead of one long list. A shared
`renderSlotPicker()`/`syncSlotPickerSelection()` pair (used by both the
request form and the edit dialog) draws the cards and keeps a hidden
input as the actual selected value, so every existing piece of slot
logic (`checkGateFullness()`'s nearby-time suggestions,
`submitBooking()`, `saveEdit()`) reads/writes that hidden input exactly
as before and needed no changes itself.

`schedule.html`'s Week view "Hourly" density toggle - which collapses
groups of slots into one row for a coarser look at a busy week -
updates its grouping from pairs of 2 (half-hour slots) to groups of 4
(quarter-hour slots), and its capacity multiplier from `x2` to `x4`.
Fixed a real bug while doing this: the row-label builder took its end
time from `slots[1]` (correct only for a 2-slot group) - now takes it
from the *last* slot in the group (`slots[slots.length - 1]`), which
was silently already wrong for any group size other than exactly 2 and
would have mislabeled every hourly row as covering only its first half
hour.

**Verification note:** since neither #76's nor this migration is
applied to the current database yet, the actual booking-submission
path can't be fully exercised end-to-end (the live database's
`slot_start_at()` still does 30-minute math while the client now does
15-minute math - the two must be deployed together, never one without
the other). What's verified live instead: the sign-in page and nav
brand read "Trip Scheduling" throughout; the request form renders
hourly mini-cards with correct quarter-hour labels (12 AM-11 PM),
clicking a tick sets slot `84` for "9:00 PM" (84 × 15 = 1260 min,
correct) and highlights it; the Edit dialog's picker pre-highlights an
existing booking's slot correctly (slot `10` → "2:30 AM"); and
`schedule.html`'s Week Hourly view renders 24 correctly-labelled rows
("12:00 AM – 1:00 AM", ...) with `108`-per-row capacity (27 bays × 4)
and correctly buckets a slot-10 booking under its "2:00 AM – 3:00 AM"
row. Apply both migrations to the new database together with this
commit's `app.js`, then re-verify an actual end-to-end submission.

---

### 79. Schedule rebuilt as an airport-style PIDS board; Week view removed (20 Aug)

Staff's `schedule.html` no longer has a Week view at all - Day view is
now the only mode, redesigned from a slot-by-slot capacity table into
an airport departures-board look (a Public Information Display System,
the boards you see at PITX itself): a dark column-header bar (Company,
Trip No., Plate No., Destination, Gate, Bay, Status), with a light-blue
time divider row inserted before each group of trips that share a
slot - only slots with something scheduled get a divider, so the board
reads as a continuous list of real departures rather than 96 mostly-
empty rows. Built from a reference screenshot of a real airport-style
board, restyled to the app's own dark-nav-bar/oklch palette rather than
copied verbatim.

The board only shows **confirmed trips** - `approved` bookings, plus
`cancelled` ones that were genuinely approved at some point
(`previously_approved`) - not staff's internal approval queue (pending
requests still live on their own page) and not a request that was
cancelled before ever being approved, which never had a real slot to
show here.

**Status is derived only from data this app actually has** - no
fabricated real-time GPS/dispatch tracking, unlike the reference
image's ARRIVING/DEPARTED which implied live tracking this app doesn't
do:
- `cancelled` → **Cancelled**
- `approved`, slot's 15-minute window not yet passed → **Arriving**
- `approved`, slot's window has passed → **Departed** (the one thing
  honestly inferable from the clock without live tracking)

Each row: a colour-coded avatar (hashed from the operator's name, not
random - the same company always gets the same colour across reloads,
without needing real logo artwork on file) plus the operator/trade-name
tag from #75's `bookingOperatorHtml()`; Trip No. and Destination
(reading from the existing `route` field, just headed "Destination" to
match PIDS terminology - no schema change); Gate and Bay shown as bare
numbers ("4", not "Gate 4") the way a real board does, since the column
header already says what they are. Bay reassignment (still needed -
staff sometimes have to correct or free up a bay) is now an inline
auto-submit `<select>` in the Bay cell itself, offered only on trips
still "Arriving" - a departed trip's bay is history, not something to
reassign.

Removed along with Week view: the heat-grid rendering, the Half/Hourly
density toggle, `formatSlot`'s Week-only helpers, and the paginated
`WEEK_PAGE_SIZE` fetch loop (#71's fix for Week view specifically no
longer has anything to fix). The operator-facing `my-schedule.html`'s
own, separate Week view is untouched - this was a staff-only redesign.

**Bug caught during verification**: `AVATAR_PALETTE` and several helper
functions were first declared *after* the module's top-level `await
load()` call - the same TDZ pattern this codebase keeps hitting
(#37/#39/#46/#52/#66/#69/#75/#76's list keeps growing) - caught
immediately via the browser console and fixed by moving the whole
helper block above `await load()`.

Verified live against real seeded data (356 scheduled trips on one
date): the board renders grouped by time with no empty-slot rows, a
booking with a slot already in the past correctly shows "Departed", a
cancelled-after-approval booking correctly shows "Cancelled", and a
cancelled-but-never-approved booking is correctly absent from the
board entirely (confirmed by row count, not just visually).

---

### 80. Migrations 0037 and 0038 applied to the live database (20 Aug)

Both were prepared-but-not-applied while a clean-slate database was
expected soon (#76, #78). Applying them turned out to be needed sooner:
without them, today's real bookings (written under the old 30-minute
slot scheme) displayed on the new Schedule board compressed into a
2:00 AM-10:45 AM window instead of their real times, since the client
now reads `slot` as a 15-minute index while the database's own
`slot_start_at()` still did 30-minute math - exactly the mismatch #78
warned about, now actually hit in practice.

Applying `0038` live surfaced two real ordering bugs in the migration
itself, both fixed in place before it would run clean:
1. The `bookings_slot_range` check (0-47) has to be dropped *before*
   doubling existing `slot` values, not after - doubling anything past
   23 momentarily violates the still-active old constraint.
2. Doubling slot values in place can also transiently collide with the
   unique `(booking_date, slot, assigned_bay_id)` index on approved
   rows (row A's old slot 5 becomes 10 at the exact moment row B still
   holds its own not-yet-updated old value of 10, same date/bay) - the
   index is now dropped before the update and recreated after, same
   reasoning as the check constraint.

Both failures rolled back cleanly (no partial writes - confirmed by
re-checking `slot` values were untouched after each failed attempt
before retrying), so no data was ever at risk.

Verified live: `slot_start_at('2026-08-28', 86)` now returns
`21:30 Manila` (86 × 15 = 1290 min), matching the client's own math; a
booking's real `slot` doubled correctly (43 → 86, 10 → 20); and the
Schedule board for that date now spans its full real range (5:00 AM to
9:30 PM) instead of the compressed window. `operator_profiles`' new
columns (`0037`) are confirmed live and usable - operator-profile.html
and operator-profiles.html can now be re-verified end to end (their
earlier verification was necessarily UI-only, per #76's own note).

### 81. 2-hour lead time; plate assigned later; approval-gated cancellation; operator "All trips" board (20 Aug)

Five changes to how a trip request moves from creation to departure,
plus a generalized fullness check (migrations `0039`-`0042`):

1. **Booking lead time: 4 hours → 2 hours**, both client-side
   (`BOOKING_LEAD_TIME_MS`) and server-side (`bookings_insert_own`,
   `request_booking_change()`). Also fixed a stale bug noticed while
   touching that function: its slot-range check still said `> 47`
   (30-minute-era, superseded by #78's 15-minute slots) instead of `> 95`.
2. **Operators now book a destination and time only - no plate at
   creation.** `plate_no` is nullable; the operator fills it in later
   (any time up to the day of the trip) via the existing "Change" dialog,
   now offered as a separate "Set plate" action that isn't blocked by the
   2-hour lockout. `request_booking_change()` no longer treats a
   plate-only edit as a material change - only route/date/slot changes
   reset the booking to pending, re-run the lead-time check, and release
   the assigned bay; setting the plate close to (or during) the lockout
   window leaves status, approval, and bay untouched.
3. **Cancelling now needs staff approval - but only once a booking is
   approved.** A still-pending request never had a bay or approval to
   lose, so it keeps the original instant self-cancel (migration 0001's
   `bookings_cancel_own`, briefly and mistakenly dropped by `0039`,
   restored by `0041`). An *approved* booking instead goes through
   `request_booking_cancellation()` (operator, with an optional reason) →
   staff's new "Cancellation requests" tab on Pending requests (badge
   count, reason shown) → `approve_booking_cancellation()` (cancels,
   releases the bay) or `decline_booking_cancellation()` (leaves it
   approved). An operator can withdraw their own request while it's still
   pending review. Fixed a bug caught during verification:
   `approve_booking_cancellation()` cancelled the booking but never
   cleared `cancellation_requested_at`, so the now-closed request never
   left the queue or its badge count (`0042`).
4. **Gate-fullness check generalized to every route, not just gated
   ones.** `dashboard.html`'s "suggest a different timeslot" hint used to
   bail out entirely for a route with no mapped gate - now it falls back
   to checking against every active bay for those routes, so any fully
   booked slot gets a suggestion, not just ones at a named gate.
5. **Operators get a general "All trips" board, not just their own
   schedule.** `my-schedule.html`'s Week view is gone; "My trips" (default,
   this operator's own confirmed trips) and "All trips" (every operator's,
   read-only, own rows highlighted) are both the exact PIDS board built
   for staff in #79 - same grouped-by-time layout, avatar colors, and
   honest Arriving/Departed/Cancelled status, just without the
   bay-reassignment control that's staff-only. Needed a new RLS policy
   (`0040`): `bookings_select` only ever let an operator see their own
   rows: widened so any signed-in user can also see a booking once it's a
   real confirmed trip (approved, or cancelled after being approved) -
   still-pending requests stay private to their own operator and staff.

Verified live end to end with throwaway operator/staff accounts: booking
without a plate, setting it later without disturbing an approved
booking's status, an approved-booking cancellation request → staff
approve (bay released, badge cleared) and the request/decline/withdraw
paths, and both `my-schedule.html` views rendering real data with no
console errors.

---

### 82. Booking-time visibility of other operators' trips; no back-to-back slots for one vehicle (20 Aug)

Two more checks on `dashboard.html`'s request form (migrations `0043`,
`0044`), both informational-not-blocking except the last:

1. **Other operators' trips at the chosen time are now shown right on the
   request form.** Whenever a date and time are picked, a line lists every
   other live booking (pending or approved) at that exact slot -
   `Also scheduled at 9:00 PM: OperatorX → Route, OperatorY → Route`. If
   any of them share the currently selected route, that entry is bolded
   and a second, amber hint calls it out explicitly with nearby
   conflict-free times to pick instead - the same "suggest a different
   timeslot" pattern as the existing gate-fullness hint (#78), just keyed
   on route+time collision rather than bay capacity. Purely advisory:
   submitting anyway still works.

   This needed a new RPC, not a direct table query
   (`list_bookings_for_date()`, `0044`): a pending booking is otherwise
   private to its own operator (`bookings_select` RLS), so a naive
   `.from("bookings").select()` from one operator's page silently
   returned nothing for another operator's still-pending requests -
   caught live during verification (two test operators booking the same
   route/time; the second saw no hint at all until this was added). The
   RPC is `security definer` and returns only `slot`/`route`/
   `operator_name`/`trade_name` - not full booking rows - so it can't be
   used to browse other operators' bookings beyond what this feature
   needs.

2. **One vehicle can't be booked into two adjacent 15-minute slots on the
   same date.** Enforced in `request_booking_change()` and
   `bookings_insert_own` (`0043`): whenever a plate is being set (at
   creation, or via "Set plate"/"Change plate"), it's checked against
   that operator's own other pending/approved bookings for the same
   plate one slot before or after, same date - the same bus can't be
   scheduled to depart twice back to back. Scoped to the same calendar
   date only; a slot 95/slot 0 pair spanning midnight isn't checked
   against each other. Verified live: setting the same test vehicle on
   two bookings 15 minutes apart, second one rejected with a clear
   error; unaffected slots and different vehicles unaffected.

Also confirmed (no change needed): staff's bay-assignment dropdowns
(`staff.html`'s per-row and bulk approve, `schedule.html`'s inline
reassign) already excluded a bay entirely once it's taken for that slot,
rather than just deprioritizing it - `bayChoicesFor()`/`bayReassignHtml()`
filter taken bays out of the candidate list before splitting it into
Suggested/Other, so there was nothing to fix there.

---

### 83. Make a missing plate on an approved trip hard to miss (20 Aug)

Nothing on the dashboard previously called attention to an *approved*
booking with no plate set - "Not set yet" read the same as any other
muted placeholder text, easy to scan right past exactly when it matters
most (staff already assigned a bay; the trip won't be recognized at the
terminal without a plate on file). Three layers now, all in
`dashboard.html`, none needing a migration:

1. A red-tinted banner above **My requests**, independent of the current
   status filter, listing every approved-but-plateless booking with a
   direct link to its edit dialog - shows even if the table itself is
   currently filtered to "Pending" and would otherwise hide the row.
2. The row itself gets a `.row-alert` red tint, and its Plate No. cell
   reads **"⚠ Plate needed"** in bold red instead of the same muted "Not
   set yet" a still-pending request shows (a pending request isn't
   confirmed yet, so there's no urgency there - only "approved and no
   plate" gets this treatment).
3. Its action button is a solid red **"Set plate now"** (`.btn-alert`)
   in place of the plain text-link "Set plate" every other row gets.

Verified live: an approved test booking with no plate showed the banner,
the red row, and the CTA button; clicking either the banner's link or the
row's button opened the edit dialog on the right booking.

---

### 84. "My requests" scoped to today-and-future, sortable; new History page (20 Aug)

`dashboard.html`'s request list was every request ever made, newest
first, with no way to change the order - fine when the list was short,
increasingly not once an operator has months of past requests mixed in
with what they actually need to act on today. Two changes, no migration:

1. **"My requests" now only shows today and future** (`gte("booking_date",
   todayISO())` added to its query) - a past request there was never
   actionable anyway (can't be changed, can't be cancelled, its "Set
   plate" window has closed), so it was just noise once enough had piled
   up. The Date column header is now sortable (click to flip between
   soonest-first and furthest-first, matching the sortable-header pattern
   already used on `vehicles.html`) - applies to both the on-screen table
   and its CSV export, so what's exported always matches what's on screen.
2. **New `request-history.html`** - every past request, one calendar
   month at a time (prev/next month buttons, a native `<input
   type="month">`, deep-linkable via `?month=YYYY-MM`), with the same
   status filter tabs and sortable Date column as "My requests," plus its
   own CSV export. Read-only by design - nothing on a past request can
   still be changed, so there are no action buttons. Added to the
   operator nav as **History**, right after **My requests**.

Verified live: a booking dated in the past no longer appears on "My
requests" but does appear on History under its own month; switching
months on History shows the right rows; the sortable Date header flips
order correctly on both pages.

---

### 85. Time slots shown as a specific time everywhere, not a range (20 Aug)

`formatSlot()` had always rendered a slot as its full 15-minute range
("9:00 PM – 9:15 PM"). Every page still calling it directly - `dashboard.
html` (request form's "also scheduled at" hint, plate-needed banner, the
requests table, the transfer/edit dialogs' context lines), `request-
history.html`, `staff.html` (request cards, the decided-requests table),
`operator-overview.html`, `overview.html`, and `transfer-approvals.html`
- showed that range. (`my-schedule.html` and `schedule.html`'s PIDS
boards already only showed the start time, via a `.split(" – ")[0]` on
the same range string - simplified those two call sites to call
`formatSlotStart()` directly instead, same result, less indirection.)

Every one of those switched to `formatSlotStart()` (existing, previously
only used by the hourly mini-card slot picker) - a slot's departure is
its start time; the fact that it's a 15-minute-wide slot isn't a second
piece of information worth repeating on every row. `formatSlot()` itself
had no remaining callers anywhere in the app after this, so it was
removed rather than left as dead code.

Verified live across dashboard.html, request-history.html, staff.html,
and schedule.html with real data - every time slot now reads as a single
specific time ("11:00 AM"), never a range.

---

### 86. Full end-to-end test pass against real accounts; six fixes (1 Sep)

A full walkthrough using the real `ceresgoldstar.ops` and `pitx.admin`
accounts - booking a 7-day weekly schedule, then exercising every
operator and staff function against it - then removing every row the
test created (verified: 2,798 bookings before and after, zero
pre-existing rows modified). Six issues found and fixed:

1. **Taken bays were still offered in the approve dropdown** - the one
   thing the user had specifically asked for in #82, which I'd wrongly
   reported as already working. `staff.html`'s "which bays are taken"
   query fetched *every* approved booking ever with no date filter, so
   once the table passed PostgREST's default 1,000-row cap it silently
   returned only the oldest 1,000 rows (Aug 12-26 here) - meaning the
   taken-bay set was empty for every date staff actually approve.
   Already-assigned bays were offered *and auto-suggested*; the unique
   index still blocked the write, so it surfaced as a confusing "that
   bay was just taken" error. Now scoped to just the dates in the queue
   (`.in("booking_date", queueDates)`), which is both correct and far
   cheaper. Confirmed live: an already-taken Bay 8 dropped out of a
   competing same-slot request (27 options → 26) and the suggestion moved
   to Bay 9, and a bulk approve then correctly skipped a request with the
   real reason "no suggested bay left at Gate 5" (verified against the
   database - all four Gate 5 bays genuinely were taken).
2. **Both Overview pages still said "within 2 hours of their 4-hour
   booking-lockout window"** - stale copy from before #81 cut the lockout
   to 2 hours. The *logic* was already correct (derived from
   `BOOKING_LEAD_TIME_MS`); only the sentence was hardcoded. Both numbers
   are now derived from the same constant so they can't drift again.
3. **Cancelling a pending request had no confirmation** - a single
   misclick permanently cancelled it, with no undo and no way back to the
   slot. Every other destructive action in the app either collects a
   reason first or goes through staff. Now confirms, naming the specific
   trip.
4. **"Decided at" rendered as a raw UTC ISO string**
   (`2026-09-01T04:07:09.905+00:00`) on both `staff.html` and
   `vehicle-approvals.html`. Added a shared `formatDateTime()` that
   renders in Asia/Manila like the rest of the app ("Sep 1, 2026,
   12:07 PM") - the old value was both unreadable and in the wrong
   timezone.
5. **An approved trip with no plate showed as a blank cell on the
   Schedule board** - operationally the single most important thing for
   staff to spot there, since the trip can't be matched to a bus at the
   gate. Now an explicit red "No plate" marker.
6. **The operator Overview's Quick Links never got the History page**
   added in #84.

Everything else exercised came through clean: the 15-minute slot picker,
the 2-hour lockout, plate-set-later (including the adjacent-slot vehicle
block correctly rejecting a back-to-back assignment and allowing a
different vehicle), material vs. plate-only change detection, transfer
(route-narrowed operator/plate dropdowns, recipient-confirmation gate,
actions correctly locked while in review), instant pending-cancel,
approval-gated cancel for approved bookings (approve released the bay and
cleared the queue badge; decline left the booking approved), bulk
approve/reject, inline bay reassignment, Recently decided, History's
month navigation, and both My schedule views.

---

### 87. Every suggestion from the #86 test pass, applied (1 Sep)

Ten items, migration `0045` plus the client work. All the new
time-dependent behaviour follows this app's existing "no scheduled
server-side execution" pattern - idempotent sync RPCs called on nav
render, exactly like `sync_expiry_notifications()` (0024) - rather than
introducing cron.

**Booking**
1. **Repeat a trip across days.** Operators run fixed weekly schedules,
   and booking a week meant seven identical passes through the form (I
   did exactly that in #86 and it was the clearest friction in the app).
   The request form now has a "Repeat this trip on other days" block:
   weekday toggles (seeded from the start date, so "same day every week"
   needs no clicks), an end date (defaulting to +4 weeks), and a live
   preview of how many trips it will book. All dates go in one insert.
   Dates already booked at that route+time, or now inside the 2-hour
   lockout, are skipped and reported rather than failing the batch.
   Capped at 60 dates so a mistyped end date can't fan out unbounded.

**Correctness**
2. **Unbounded-query sweep**, closing the bug class behind #86's headline
   fix. New shared `fetchAllRows()` helper pages past PostgREST's silent
   1,000-row cap; applied to the pending queue, the approved-bookings
   conflict lookup, cancellation requests, staff Overview's pending list,
   and the accounts list. `operator-profiles.html` got explicit ranges.
   (`vehicles-database.html` already paged correctly - that was the
   model.)
3. **Bulk approve now matches single approve.** Bulk considered only
   gate bays and skipped when the gate was full, while the single-row
   dropdown falls back to any free bay - the two paths disagreed about
   the same request. Bulk now uses the same `suggested[0] ?? other[0]`
   pick and reports which ones landed outside their usual gate.

**Staff**
4. **Staff-side plate entry** (`staff_set_booking_plate()`). Since #81
   made the plate optional at booking, a trip could reach departure with
   no vehicle and nobody at the terminal could record one -
   `request_booking_change()` is operator-scoped. Same eligibility and
   back-to-back rules as the operator's own path, enforced in the RPC.
5. **Auto-expiry for past-dated pending requests**
   (`expire_stale_pending_bookings()`, run on staff nav render). They sat
   in the queue forever and were still approvable - staff could "approve"
   a trip that had already not happened. Closed as rejected with an
   explicit system reason; `decided_by` stays null, which no staff
   rejection ever has, so the two are distinguishable.
6. **Success confirmations on approve/reject.** The card vanishing was
   the only feedback, and it looked identical whether the action landed
   or the row was decided out from under you.
7. **New Utilization page** - trips and slot occupancy per gate over a
   date range, busiest hours, and CSV export. Aggregated server-side
   (`utilization_by_gate()`) rather than pulling every booking to count
   in the browser - the same trap #86 fixed. Against real data it
   immediately showed twin 6 AM / 5 PM peaks and that most trips land in
   bays with no gate mapping.
8. **Unlinked-route report**, on the same page
   (`vehicles_with_unlinked_route()`). 54 approved vehicles (~3%) carry a
   route that isn't one of the terminal's - free text left from the
   masterlist import (`PALAWAN`, `GUIMARAS ISLAND`, `NEGROS OCCI.`) or
   null - which makes them permanently unbookable with nothing in the
   operator's UI explaining why.

**Operator**
9. **Plate-missing reminders** (`sync_plate_missing_notifications()`).
   #83's red banner only helps an operator who opens the app; this pushes
   an approved-trip-with-no-vehicle into their notification panel, for
   today and tomorrow only (a reminder three weeks out is noise).
10. **Board filter** on both PIDS boards, and clearer History framing.
    A day runs to several hundred rows (366 on a real date) with no way
    to find one trip; the filter matches operator, destination, plate,
    trip no. or bay, and CSV export follows it. History's copy now says
    it's the complete archive including upcoming trips, rather than
    implying past-only while showing future rows.

Also fixed while in here: another temporal-dead-zone crash (the repeat
controls' `const`s were read by `initForm()` before their declaration -
same class as #37/#39/#46/#52/#66/#69/#75/#79), and stale hidden text
left in the booking form's message elements.

Verified live against `ceresgoldstar.ops` / `pitx.admin`: a 6-trip
Tue/Thu/Sat repeat booked in one submit and correctly skipped all 6 on a
re-submit; auto-expiry closed the one stale request and left zero behind;
the plate reminder fired with the right bay and stayed at exactly one row
across reloads; staff plate entry accepted the operator's own vehicle and
rejected another operator's; the board filter went 366 → 8 → no-match →
366. Every row the test created was removed afterwards (2,798 bookings
before and after, zero pre-existing rows left modified - the one
production request auto-expiry legitimately closed was restored to
pending).

---

### 88. Vehicle database reset from Masterlist v6; Destination is now the route (1 Sep)

The operator supplied a cleaned (still in-progress) `Vehicle Masterlist
Database - MERGED v6.xlsx` and asked for the app's vehicle database to be
reset to it, with the workbook's **Destination** column as the basis for
trip-scheduling routes - while keeping the existing rule that an operator
only sees the destinations they actually serve.

**Route model changed.** Until now `vehicles.route` held a curated
canonical route string and `destination` was a separate descriptive
field. They are now the same thing: every vehicle's `route` is set to its
own `Destination`. Nothing downstream needed rewriting for this - the
"a vehicle can only be booked on its own route" rule is plain equality
(`vehicle_matches_route()`, migration 0031), and the booking form's route
dropdown was already narrowed to routes the operator has a registered
vehicle for. Pointing both at Destination makes that filter mean
"destinations this operator is franchised to serve" automatically.

New `scripts/import-vehicle-masterlist.mjs` (`npm run import-vehicles`)
reads **only the Database sheet** - the workbook's other sheets
(Destination List, Bay, Operator and Trade) are working notes, not source
of truth - and rewrites the vehicles table, ROUTES, ROUTE_GATES and
`route_trip_codes` from one read, so those four can't drift apart. It
runs as a dry run by default and needs `--apply` to write.

**Operators are resolved by plate, not by name.** The workbook has 111
distinct operator names against the app's 78 accounts, with variants like
"BICOL ISAROG TRANSPORT SYSTEM INC" vs "...INC." (which is also what
produced 74 apparent duplicate plates). Name matching left 22 pairs
uncertain and several plainly wrong - "GOLDTRANS BTS" matched *Eastern*
Goldtrans. Matching each workbook plate against the account that already
owns it resolved 121 of 122 pairs and 1,908 of 1,910 rows exactly, with
name similarity kept only as a fallback for never-before-seen plates.

Result: **1,832 vehicles** (76 duplicate rows collapsed, 2 skipped - the
workbook's only rows with no operator at all), **103 destinations**, 88 of
them carrying a gate from the workbook's own "Gate Assignment" column
rather than inferred from province. 13 accounts gained vehicles and none
lost their fleet. 80 rows answer "CPC Extension of Validity? = Yes"
without a date; those are recorded as no extension rather than inventing
one (the column has a CHECK requiring the date), and the count is
reported by the script.

Two things worth knowing:

- **All 2,798 existing bookings reference old route names**, but every one
  of them is historical - zero are today or future - so nothing
  actionable was disrupted. They still display correctly; route is just
  stored text on a booking.
- **24 vehicles have no destination in the workbook** and so can't be
  booked. They're listed by operator and plate on the Utilization page's
  unlinked-route report (#87), which is exactly the working list for the
  next cleanup pass. This is down from 54 before the reset, and all 24
  are now genuinely blank rather than unmatched free text - the old
  `PALAWAN` / `GUIMARAS ISLAND` / `NEGROS OCCI.` vehicles are bookable
  now that Destination defines the routes.

Verified live end to end: CERES-GOLDSTAR's route dropdown showed exactly
its 10 destinations gate-grouped (ungated SAN JOSE under "Other"); a
booking to GUIMARAS ISLAND - previously unbookable - went through, its
plate dropdown offered only that destination's 9 vehicles, and staff saw
it as Gate 4 with Bay 18 pre-selected. Test booking removed afterwards
(2,798 bookings before and after).

---

### 89. Operator / Trade name / Destination filters on the Vehicles page (1 Sep)

The staff Vehicles page had a free-text search and status tabs, which is
fine for finding one plate but not for "show me every vehicle these two
operators run to Iloilo" - with 1,832 rows and 104 destinations that meant
scrolling. Three multi-select filters now sit under the toolbar:
**Operator**, **Trade name**, **Destination**.

Each is a checkbox popover, reusing the page's existing Columns control
rather than introducing a second dropdown idiom, plus a search box (there
are ~65 operators and ~104 destinations) and a per-value count. Values
picked within one filter are OR'd; the three filters are AND'd, and
combine with the status tabs and the search box.

The lists **cross-filter**: each one's counts reflect every *other*
selection, so picking two operators immediately shows how many vehicles
each destination has across just those two. A filter deliberately skips
its own selections when computing its list - otherwise ticking one
operator would hide the rest and you could never pick a second. Values
excluded by the other filters stay listed but dim to 0 rather than
disappearing, so the list doesn't reshuffle under the cursor as you tick.

Details worth noting:

- The button carries the state, since the popover is normally shut -
  "Operator", then "Operator: CERES-GOLDSTAR", then "Operator: 2
  selected" once naming them would be too long.
- Vehicles with no destination group under **(not set)**, sorted last -
  which makes the 24 currently-unbookable vehicles (#88) reachable in one
  click here as well as on the Utilization report.
- The header count now reads "131 of 1832 vehicles shown" whenever
  anything is narrowing the list; the bare fleet total would have been
  misleading next to a filtered table.
- CSV export already routed through `currentRows()`, so it follows the
  filters with no extra work.
- The popover is width-capped (`min(92vw, 420px)`): the longest
  destination - "BATANGAS CITY PIER (BATANGAS) - PLAZA LAWTON (MANILA)" -
  otherwise stretched it past a phone viewport. Labels ellipsis with the
  full text on the row's `title`.

Verified live: two operators selected gave 131 + 52 = 183 rows and
narrowed Destination to just their 13 combined destinations (91 others
dimmed to 0); adding two of those destinations gave 50 + 35 = 85; the
in-popover search, per-filter Clear, Clear all, and mutual exclusion with
the Columns popover all behave; no console errors; no horizontal overflow
at 375px.

---

### 90. Multi-operator end-to-end test for a week of trips; two fixes (2 Sep)

Booked a week of next-week trips (Mon 7 - Fri 11 Sep) across five real
operator accounts spanning all three gates - PANGASINAN SOLID NORTH and
GENESIS (Gate 5), ALPS and JAM LINER (Gate 2), BICOL ISAROG and DLTB
(Gate 4) - then ran the full approve → assign plate → cancel cycle
against them. 20 test bookings created and removed afterwards; the
operator's own 17 bookings were left untouched.

**Two bugs found and fixed.**

1. **Cancelling an approved trip made it vanish from the Utilization
   report** (`0046`). `approve_booking_cancellation()` nulled
   `assigned_bay_id` to "release the bay", but that was never what
   released it - the uniqueness constraint is a *partial* index scoped to
   `status = 'approved'`, so the bay frees the moment the status flips
   regardless. Nulling only destroyed the record of which gate the trip
   had belonged to, and the Utilization page groups by bay to get the
   gate - so a cancelled-after-approval trip disappeared from the report
   entirely and its "Cancelled after approval" column could never be
   anything but zero. The bay is now kept. Verified after the fix: the
   column reads 1, attributed to the right gate, and the bay is still
   assignable to another trip at the same slot. (The Schedule board was
   never affected - it keys off `previously_approved`, not the bay.)

2. **`expire_stale_pending_bookings()` had no staff guard** (`0047`).
   It's SECURITY DEFINER and granted to `authenticated`, so any signed-in
   operator could invoke it directly and mass-reject *every* operator's
   past-dated pending requests - writing to rows RLS otherwise never lets
   them touch. Small blast radius (it only touches bookings whose date
   has already passed, setting the status staff would have set anyway),
   which is why nothing surfaced in use, but it's still an operator
   writing to other operators' rows. Now guarded like every other
   staff-only routine. `app.js` already only called it for staff, so
   nothing in the client changed. Found while chasing console 400s -
   which turned out to be the deliberate failure cases below.

**What the test exercised, all behaving correctly:**

- Weekly repeat booking across several operators (Mon/Wed/Fri, Tue/Thu,
  Mon-Fri), and its duplicate-skip refusing to re-book dates already held.
- The same-route/same-time hint, firing when a second operator picked
  TABACO CITY at a slot DLTB already had, with nearest-first alternatives
  that moved the slot when clicked.
- Gate contention: six Gate 4 routes approved into slot 32 took **six
  distinct bays** with no double-booking, trip numbers collided correctly
  (`LEG0800` / `LEG0800A`), and Gate 4 then reported zero free bays.
- With Gate 4 full, the operator form showed the gate-full hint, and
  staff's approve dropdown **excluded all six Gate 4 bays** and fell back
  to the other 21 - the #86 fix under real contention.
- Bulk approve's #87 fallback: *"Approved 13 request(s). Assigned outside
  the usual gate: DLTB → Bay 1 (Gate 4 full)."* Previously that request
  would have been silently skipped.
- Plate-assigned-later: the red banner and per-row alerts flagged all six
  plateless approved trips; the back-to-back rule rejected the same
  vehicle in an adjacent slot and accepted a different one.
- Approved-booking cancellation end to end, including staff being
  correctly refused when calling `request_booking_cancellation` on an
  operator's behalf (it filters on `operator_id = auth.uid()`).
- Schedule board, My schedule (both views, no bay-reassign control for
  operators), the board filter, Utilization, and History with its sort
  toggle.

**Also worth recording:** the auto-expiry from #87 fired during the test
and closed eight of the operator's own past-dated (1 Sep) pending
requests, with `decided_by` null marking them system-closed. That's the
feature working as designed - it would have fired on the next staff page
load regardless - but it is a real state change to real bookings, so it's
noted here rather than buried.

**Not a code bug, but operationally significant:** 400 of 1,832 vehicles
(22%) have an expired CPC or CPC-EOV, which makes **37 of 217
operator-route pairs completely unbookable** - DLTB, for instance, can
only book 5 of its 9 destinations. The destination simply doesn't appear
in that operator's dropdown, with nothing explaining why. The
unlinked-route report on the Utilization page covers *missing*
destinations but not expired ones; extending it to cover expiry would
turn this into a fixable worklist.

---

### 91. Left sidebar navigation, replacing the top bar (2 Sep)

First phase of a UI refresh modelled on the Megawide Stakeholder app:
every page's dark top navigation bar is now a fixed left sidebar
instead, with a slim white top bar left behind for context (a
menu-collapse toggle, the notification bell, the who-am-I chip, and
Sign out). Same PITX colour tokens throughout - `--bar` now paints a
sidebar instead of a bar, nothing else changed.

- `renderNav()` in `app.js` is the single place this is built - it
  already ran on every page (17 of them share it), so no page template
  needed page-specific nav changes. It now renders the sidebar's
  contents into `#nav` (brand mark, the same per-role link list as
  before but with an icon per link, and a footer card with the
  signed-in user's initials/name/role) and *also* injects a new
  `.topbar` element as the first child of `.app-content`, since no
  page's static markup had one to fill.
- Every `docs/*.html` page except `index.html` (the login screen, which
  never had nav) had its `<header class="nav" id="nav"></header>` /
  `<main class="wrap">` pair rewritten to
  `<div class="app-shell"><aside class="sidebar" id="nav"></aside><div class="app-content"><main class="wrap">`,
  mechanically, so the structure is identical across all 16 files.
- Collapse state is one class, `.sidebar.is-collapsed` (slides off
  canvas via `margin-left`, doesn't resize/reflow the sidebar's own
  contents) - the toggle button flips it on any viewport, and
  `renderNav()` additionally starts it collapsed when the page first
  loads narrower than 860px so the sidebar doesn't cover the page on a
  phone.
- Link set, role gating and destinations are unchanged - this only
  changed the container the same links render into. "My requests" and
  "History" are still their own pages for now (see below).
- Verified for both roles at desktop and phone widths (login, sidebar
  render, active-link highlighting, expand/collapse, the request-a-trip
  form, and My requests all checked live) - no console errors.

This was step one of four requested changes (sidebar shell everywhere,
kept the existing colours, done first because the other three all sit
inside it): merging My requests/History into Overview as tabs, the
request-slot form as a modal instead of its own page, and staff's
Operators page as a card grid with a detail popup are still pending.

---

### 92. The other three: merged Overview tabs, a request-slot dialog, and Operators as cards (2 Sep)

The rest of the UI refresh started in #91, all built on top of the
sidebar shell.

**Operator side - My requests and History are now tabs on Overview.**
`operator-overview.html` gained a tab bar (Overview / My requests /
History); dashboard.html's full request form and requests table, and
request-history.html's month browser, moved onto that one page as the
other two tabs, each wrapped in its own `requestsTab()`/`historyTab()`
function so neither's identically-named internals (`load`, `render*`,
`export-csv`, `status-filter`, `requests`) collide - the History tab's
handful of colliding IDs got a `hist-` prefix, everything else moved
unchanged. `dashboard.html` and `request-history.html` themselves are
now thin `location.replace` redirects into `operator-overview.html?tab=`
rather than deleted - a few things still point at their names by URL
(bookmarks, and the `link` column a couple of server-side notification
functions write verbatim, migrations 0024/0045), and a redirect means
none of those needed to change. `request-history.html?month=` deep
links still work too - the stub forwards `month` onto the query string,
and the History tab reads it same as before.

**The request form is a dialog now, not an inline card.** "My
requests" opens with a "+ New request" button instead of the form
sitting open above the table; clicking it calls `showModal()` on what
used to be an inline `.card`. A successful submit closes the dialog and
shows the confirmation as a page-level message instead of inline inside
it (the old `#form-ok` location isn't visible once the dialog closes);
a failed one leaves the dialog open with the error shown inline as
before, unchanged.

**Staff's Operator profiles page is a card grid with a detail popup.**
Replaced the operator-profiles.html table with `.record-card` tiles
(initials avatar, company name, a "no profile yet" badge where that's
missing) in a `.card-grid`, styled to read like the Megawide
Stakeholder app's own card grid. Clicking a card opens a
`.details-dialog` (the same read-only detail-dialog pattern
vehicles.html already uses for a vehicle row) with the operator's full
company profile, contacts, and signed logo link. Sorting by column
doesn't carry over to a card grid, so that dropped in favour of a plain
alphabetical order; search and the "Missing profile" filter are
unchanged, and Export CSV still exports the same columns as before.

Verified live for both roles: tab switching and its `?tab=`/redirect
deep links, the request dialog opening/cancelling, an operator card
opening its detail dialog with the right data - no console errors
beyond one pre-login race already present before this change (a page
loaded a beat before the session restored, caught and redirected by
`guardPage()` the same as always).

---

### 93. Pending requests, Vehicle approvals, and Transfer approvals consolidated into Approvals (2 Sep)

Same tabs-on-one-page pattern as #92, this time for staff's three
approval queues. `approvals.html` is new: a type filter (All / Trip
requests / Vehicle approvals / Transfer approvals, each pill showing a
live pending count) above three stacked sections, each carrying its own
colour-coded label badge ("Trip request" / "Vehicle" / "Transfer") so
what's what stays obvious with the filter left on All. Every section
keeps its full original behaviour untouched - staff.html's Pending/
Cancellation requests/Recently decided sub-tabs, bulk approve/reject,
bay auto-suggestion; vehicle-approvals.html's Columns picker and CSV
export; transfer-approvals.html's actionable-vs-waiting-on-operator
distinction - each just wrapped in its own function
(`requestsApprovals()`/`vehicleApprovals()`/`transferApprovals()`) with
its colliding element ids (`search`, `requests`, `decided`, `message`,
`view-tabs`, etc. - all three pages used the same names) prefixed
`veh-`/`xfer-` for the latter two, trip requests kept unprefixed as the
primary section.

`staff.html`, `vehicle-approvals.html`, and `transfer-approvals.html`
are now thin redirects into `approvals.html?type=...` rather than
deleted - migrations 0024/0025 write a `link` column pointing at all
three by name from several server-side notification functions, and
those keep working with no DB change. `overview.html`'s own KPI tiles,
lockout "Review →" link, and quick-links all repoint at
`approvals.html?type=...` directly (plain page links, not tab-switch,
since Overview and Approvals are different pages); the sidebar's three
approval entries collapse into one "Approvals" link.

Verified live: the type filter (all four states), each section's own
sub-tabs and Columns panel independently, and all three redirects
landing on the right filter - no new console errors.

---

### 94. Approvals: dropped "All", added a red notification pin per type (2 Sep)

Two follow-up tweaks to #93, both requested after using it:

- **Removed the "All" filter pill.** With three sections all visible
  at once, "All" mostly meant scrolling past two you didn't come for -
  dropping it makes the page a plain three-way switch (Trip requests /
  Vehicle approvals / Transfer approvals) with exactly one section on
  screen at a time, defaulting to Trip requests. The three redirects
  from staff.html/vehicle-approvals.html/transfer-approvals.html still
  land on the matching tab via `?type=`.
- **Each tab now carries an iOS-style notification pin** - a small red
  circle on its upper-right corner with that type's pending count,
  hidden entirely once the queue is clear rather than showing "0". Same
  number each section's own "N awaiting review" line already showed,
  just surfaced on the tab itself so what needs attention is visible
  without opening it.

Verified live: default landing tab, exactly one section visible at a
time, and the pin rendering/hiding correctly (checked both with real
zero-queue data and by forcing counts to confirm the visual).

---

### 95. "Recently decided" renamed to History; every page's KPI strip moved into Overview (2 Sep)

Two more requested tweaks:

- **"Recently decided" → "History"** on all three Approvals sections
  (Trip requests, Vehicle approvals, Transfer approvals) - same sub-tab,
  same data, just a clearer label.
- **Dashboards now live only on Overview.** Three pages had their own
  small KPI strip bolted onto an otherwise working/report page -
  `schedule.html` ("Scheduled today"/"Cancelled"/"Active bays" for
  whatever date is being browsed), `my-schedule.html` (the operator
  equivalent), and `utilization.html` ("Approved trips"/"Cancelled
  after approval"/"Days with activity"/"Slot occupancy" for whatever
  date range is picked). All three strips are removed; each page is now
  just its working view - date/range picker, filter, board, or table -
  with nothing to glance at, only something to do.

  What they showed didn't disappear, it moved to the two Overview
  pages as fixed **today** (or **trailing-30-days**, for utilization)
  snapshots, since a dashboard tile needs one fixed answer, not
  "whatever date happens to be selected elsewhere right now":

  - `overview.html` (staff) gained **Cancelled today** and **Active
    bays** alongside its existing tiles, plus a new "Utilization · last
    30 days" row (**Approved trips**, **Cancelled after approval**,
    **Slot occupancy**) computed with the same `utilization_by_gate`
    RPC the Utilization page itself calls - each tile links through to
    the full page (Schedule or Utilization) for anyone who wants to
    change the date/range and see the rest.
  - `operator-overview.html` gained **Scheduled today** and **Cancelled
    today**, the operator-scoped equivalent, linking through to My
    schedule.

  Schedule and My schedule's own "Trips scheduled for DATE, across N
  active bays" sentence in the page header is untouched - that's plain
  narrative text, not a tile dashboard, and still says exactly which
  date is on screen.

Verified live for both roles: Schedule, My schedule, and Utilization
all render cleanly with no KPI row; both Overview pages show the new
tiles with correct live counts (today's date confirmed against the
system clock so the utilization window's absence of data made sense -
this session's earlier #90 test data is dated a few days in the
future, outside the trailing-30-day window by design). No console
errors introduced.

---

### 96. Operator Overview: no longer a tab - always on screen above My requests/History (2 Sep)

#91 made Overview one of three tabs (Overview / My requests / History)
on operator-overview.html. Requested back out one level: Overview (the
KPI row, Approaching lockout, and Quick links) is no longer a tab at
all - it's always visible at the top of the page - with My requests and
History as the only toggle underneath it, under a new "Trips" heading.

- Removed the "Overview" button from the tab bar and the `.tab-panel`
  wrapper around the KPIs/lockout/quick-links block entirely - it's
  now plain content on the page, not something that can be switched
  away from.
- My requests' own now-redundant "My requests" heading (sitting right
  under a tab pill that already says the same thing) was dropped along
  with its "History has every request..." inline link, replaced by one
  plain sentence pointing at the toggle above.
- `switchTab()`/`initTabs()` needed no logic change - both were already
  driven entirely by `data-view`/`data-panel` attributes, so dropping
  one option was just deleting its button and panel wrapper.
- `dashboard.html`'s and `request-history.html`'s `?tab=requests`/
  `?tab=history` redirects (#91) still land correctly, now arriving on
  a page where Overview is always visible above whichever one they
  asked for.

Verified live: Overview content stays on screen while toggling between
My requests and History, both redirects still land on the right
toggle, no console errors.

---

### 97. Quick links dropped from Overview; My requests/History moved to My schedule (2 Sep)

> **Partly superseded by #100:** the Quick links removal stands; the move of
> My requests/History to My schedule was reversed on 8 Oct.

Two more requested changes to the operator side, both about not
repeating the sidebar:

- **Quick links removed from operator-overview.html.** Every link it
  offered (My schedule, My vehicles, Operator profile, plus My
  requests/History before they moved) is already one click away in the
  sidebar - the section was pointing at links that were already always
  on screen.
- **My requests and History moved from Overview to My schedule.**
  `my-schedule.html` gained the same three-way pattern Overview used to
  have: a **Schedule / My requests / History** tab bar, with the
  existing board (date nav, My trips/All trips, filter, Export CSV)
  now living inside the "Schedule" tab and the My requests/History
  content moved over wholesale from operator-overview.html - same
  markup, same `requestsTab()`/`historyTab()` functions, just relocated
  and re-wired to My schedule's own tab bar instead. Schedule is the
  default tab, matching the page's existing purpose.

  The one id collision from the move (`export-csv` - My schedule's own
  board export button and My requests' export button used the same
  id) was resolved by renaming My requests' button to `req-export-csv`;
  everything else moved without needing a rename.

  Overview is now just the KPI row and Approaching lockout - nothing to
  toggle, nothing to link to that isn't already in the sidebar. Its
  "Pending requests" tile and the lockout list's "View →" link now
  point at `my-schedule.html?tab=requests` (plain hrefs, since the
  target moved to a different page) instead of the in-page tab-switch
  they used before.

  `dashboard.html` and `request-history.html` - already thin redirects
  from #91 - now point at `my-schedule.html?tab=requests`/`?tab=history`
  instead of operator-overview.html; the `month` deep-link
  request-history.html forwards still works.

Verified live: My schedule's three tabs all render with real data
(Schedule board, My requests with the plate-needed banner and new
request dialog, History with month navigation), Overview shows just
the KPIs/lockout with correct links, and both old-page redirects land
on the right My schedule tab. No new console errors.

---

### 98. Fixed: long company names spilling out of their card on Operator profiles (2 Sep)

`.record-card-title`/`.record-card-sub` (the card grid built for #90's
"staff Operators page as a card grid" ask) were `<span>`s given
`overflow: hidden; text-overflow: ellipsis; white-space: nowrap` -
which only ever clips a block/inline-block box. On a plain inline
`<span>` those three rules are silent no-ops, so `white-space: nowrap`
still forced the text onto one line but nothing clipped it - a long
company name ("Erjohn and Almark Transit Corporation", "Cavite
Batangas Transport Multipurpose Cooperative", "Tabaco Women's
Transport Service Cooperative Inc" - several of the real 78 operators
are this long) ran straight past the card's right edge instead of
truncating with `…`.

Fix is one property: `display: block` on both, so the box the other
three rules were already written for actually exists. Verified live -
scripted a full sweep of all 78 cards checking each title's right edge
against its card's, zero still spill; the previously-worst offenders
now truncate cleanly to one line.

### 99. Demo week seeded: 12-18 Oct, 11 operators, 102 bookings (8 Oct)

For presenting the app, `scripts/seed-demo-week.mjs` (new, re-runnable -
skips anything already booked; optional Monday date argument, defaults to
next Monday) loaded a full week of trips for **Mon 12 - Sun 18 Oct 2026**
across 11 operators (Jam Liner, Jam Liner/LLI, Genesis, Bicol Isarog,
Ceres-Goldstar, DLTB, ALPS, Elavil Tours, Batman Starexpress, Cagsawa,
Davao Metro Shuttle) on routes each actually has eligible vehicles for,
spread over Gates 2, 4 and 5. It inserts as pending then applies a staff
decision, so trip numbers, trade names and notifications come from the
real triggers; bays come from each route's own gate with no double-booking
(0 conflicts verified).

Deliberately left in a mixed state so every screen has something to show:
91 approved (Mon-Wed with plates, Thu-Sun without - the plate-needed
banners and "No plate" board marker), 9 pending (all of JAM LINER/LLI,
plus Davao Fri-Sun - for a live approval demo), 1 rejected with a reason
(Elavil Matnog Fri), 1 approved trip with a cancellation request awaiting
staff (Genesis Mariveles Wed), 1 cancelled after approval (DLTB Daet Fri).
**This data is intentionally kept** - same as the 7-13 Sep set from #90.

---

### 99b. Demo week extended: 25 operators, 200 bookings, all 27 bays in use (8 Oct)

`scripts/seed-demo-week.mjs` gained a second batch of 14 operators (a
Bicol/Batangas/Luzon mix including AB Liner, Arandia, Baliwag, Barney, Bicol Magayon,
C.U.L., Daet Express, DMMC, Eastern Goldtrans, First North Luzon, GV Florida,
Jac Liner, JVH, Goldtrans) and now deals bays by **least-used within the
route's gate** (falling back to any free bay) rather than the first free one,
which had piled trips onto a few bays. Every run also re-deals the bays of all
approved trips in the week the same way, in one transaction, so the first
batch's clustering was fixed too. Re-running is now idempotent: the duplicate
check covers rejected/cancelled rows too (my first re-run duplicated the two
override rows - Elavil Matnog rejected and DLTB Daet cancelled, Fri 16 Oct -
and those two copies were deleted).

Week of 12-18 Oct now: 200 bookings, 25 operators - 181 approved, 17 pending
(for live approval), 1 rejected, 1 cancelled after approval, 1 approved with a
cancellation request. All 27 active bays used, 0 bay/slot conflicts, 0 approved
trips without a bay. Still intentionally kept.

---

### 100. Operator: My requests + History back on Overview; "My requests" renamed "Schedule Request" (8 Oct)

Reverses the move in #97. Overview (operator-overview.html) again holds the
KPIs and Approaching lockout, with the request toggle underneath - now
labelled **Schedule Request** / **History** - and My schedule is back to just
the live board. Quick links stays removed (the sidebar already has them).
Done by restoring the #96 versions of operator-overview.html and
my-schedule.html and re-applying the Quick links removal, so the Pending
requests tile and lockout "View" link switch the toggle in-page again.
dashboard.html/request-history.html redirect stubs point back at
operator-overview.html?tab=requests/history. The tab id stays `requests`
in code; only the visible label changed.

Verified live as an operator: toggle shows Schedule Request / History, no
quick links, 6 KPI tiles, sidebar unchanged.

---

### 101. Operator Overview tiles open the list they count (8 Oct)

Clicking "Approved upcoming" (12) used to open My schedule, a board for a
single date - nowhere near 12 rows. Now each count tile lands on a list with
the same number of rows:

- **Approved upcoming** and **Pending requests** switch to Schedule Request
  with the status filter preset to Approved / Pending (same today-and-future
  rows the tile counts).
- **Vehicles expiring soon** opens `vehicles.html?filter=expiring`: approved
  vehicles with a CPC or OR/CR validity within 30 days or already past - the
  exact rule the tile uses - with a banner stating the count and a "Show all
  vehicles" link.

Verified live (genesis.ops): Approved tile 12 -> 12 rows; expiring tile 1 -> 1
row, Show all -> 52.

---

---

### 102. Changelog catch-up: security-advisor migration 0048 is in the repo but NOT applied (8 Oct)

`supabase/migrations/0048_security_advisor_rls_fixes.sql` was already sitting
untracked in the working tree (not written in this stretch of work) and got
committed along with #99. It targets the two "RLS Disabled in Public" errors
from Supabase's Security Advisor: it enables row level security on
`route_trip_codes` (with a read policy for signed-in users only) and on
`_schema_migrations` (RLS on, no policies, privileges revoked from `anon` and
`authenticated` - the migration script connects as the owner, which bypasses
RLS).

**Status: not applied.** `_schema_migrations` ends at 0047, and a live check
shows `relrowsecurity = false` on both tables. Apply it with
`node scripts/run-migration.mjs` when ready. Worth testing afterwards that
trip-number assignment still works for operators, since
`route_trip_codes` is read by the trip-number trigger and gains RLS.

Also listed here so the history is complete: #99's script is
`scripts/seed-demo-week.mjs`; the demo data it created is intentionally kept.

---

### 103. Restyled to the Megawide design system, still PITX (8 Oct)

Adopted the look and feel of "MWIDE Design System.md" across all pages, after
checking scope with the owner: **PITX blue stays the accent** (the design
system's one saturated colour, Megawide red, is not used - red only ever means
danger), the PITX name and logo are untouched, **look and feel only** (no
mobile bottom-nav, bottom sheets or full motion spec), and Manrope is dropped
for **Inter only**.

Mostly one file, `docs/assets/styles.css`:
- Rewrote the token block (grounds, borders, ink, callout triads, radii,
  shadows, easings) and re-pointed the legacy variable names at it, so every
  page's local style block picks the change up without edits.
- Added a final "MWIDE design-system layer": Inter 600 body / 800 titles,
  uppercase muted labels, white cards on #e6e7ea hairlines with the 1px shadow,
  11px-radius fields with a blue focus ring, 40px buttons with downscale-only
  tactility (idle .985, hover exactly 1 with ease-out, press .95 + inset
  shadow; row-level buttons hold still), ghost and danger-ghost buttons, pill
  chips and callouts that take background + border + text from one matched
  row, a dark #26282d rail with a #231f20 active pill outlined in blue, a solid
  (unblurred) dialog scrim, 18px dialog radius, slim scrollbars, and the
  prefers-reduced-motion contract.
- Google Fonts link on all 12 real pages trimmed to Inter 500-800.

Not done (outside the agreed scope): mobile shell, sheet-style modals, exit
animations, folder tabs, skeletons.

Verified in the browser as operator and staff: Overview, Approvals and
Schedule render in the new skin, no new console errors.

---

### 104. Weekly schedule view for staff and operators (8 Oct)

Schedule (staff) and My schedule (operator) each gained a **Day / Week**
toggle. Week shows Monday to Sunday as seven day columns; each trip is one
compact chip with just the **bus operator and its trip code**, in departure
order. Everything else (time, destination, plate, gate/bay, status) is in the
chip's tooltip and on the day view.

- Shared renderer `docs/assets/week-view.js`, used by both pages so they stay
  identical. Each day header shows the date and trip count and opens that day
  in the Day view when clicked; today's column is outlined in the accent.
- Prev/Next step by a week in Week mode (button labels change), and picking
  any date shows the week containing it. `?view=week` deep-links to it.
- Operator side keeps the My trips / All trips switch: All trips highlights the
  operator's own chips. Cancelled-after-approval trips show struck through.
- The page filter box applies to the week too; Export CSV exports the whole
  week with a leading Date column, ordered by date then time.
- Day mode is unchanged: both modes share one query (date range) so there is no
  second code path to drift.

**Follow-up (same day): grouped by time.** Inside each day column the chips are
now grouped under a small blue time heading (e.g. "4:00 AM"), like the Day
view's time dividers; trips departing together sit under one heading. Chips
still show only operator + trip code.

**Follow-up 2 (same day): one matrix.** The week is now a single table instead
of seven separate columns of stacked headings: a row per departure time (only
times that have a trip that week), a column per day Mon-Sun, the time column
and day headers sticky while scrolling. Trips departing together on a day
stack within their cell. Verified: operator "All trips" week renders 18 time
rows and 92 chips, the 4:00 AM row showing Genesis on all seven days, own
trips highlighted. (Supersedes the time-grouped columns of the previous
follow-up.)

**Follow-up 3 (same day): destination added.** Each chip now has a third line
with the destination (small, muted, truncated with an ellipsis; struck through
when cancelled). Plate, gate/bay and status stay in the tooltip.

Verified in the browser: staff week of 12-18 Oct shows 15/14/15/14/14/11/9
trips, matching the database; a day header opens the Day view; as genesis.ops,
My trips shows its 12 trips and All trips highlights exactly those 12 among
the week's 92.

---

### 105. Minimal pass: less chrome, fewer tiles, actions tucked into menus (9 Oct)

The app felt cluttered, so everything below removes or hides something; no
feature was dropped (each item says where it went).

- **Overview, operator:** 7 tiles -> 5, each opening what it counts: Pending,
  Approved upcoming, **Needs plate** (new), Vehicles expiring soon, and Today
  (scheduled, with cancellations folded in as "· N cancelled"). Registered
  vehicles left the tiles (it's the Vehicles page). A new **Needs plate**
  filter chip sits on the request list.
- **Overview, staff:** 7 tiles + a 3-tile utilization row + a Quick links grid
  -> 4 tiles (Pending requests, Vehicle approvals, Transfers awaiting you,
  Today), one muted "Last 30 days" line linking to Utilization, and no Quick
  links (the sidebar has every one). "Transfers awaiting operator" and "Active
  bays" tiles removed.
- **"Approaching lockout"** (both): the heading and box now appear only when
  something is actually near lockout; the empty "Nothing approaching lockout"
  card is gone.
- **Plate banner:** was a three-line list of every trip; now one line -
  "6 approved trips still need a plate number. Review" - and Review opens the
  Needs plate filter.
- **Page intros:** the small-caps label above every title is gone; each page's
  help sentence is behind a small "?" next to the title (`tidyPageHead()` in
  app.js, so every page picked it up). Approvals' per-section blurbs and
  section label rows were removed, their guidance folded into that page's "?".
- **Tables:** Schedule Request and History drop the Operator column (it's the
  operator's own name) and merge Assigned bay under Trip No. and the note under
  Status: Date, Time, Route, Plate, Status, Trip / Bay. Row actions (Set plate,
  Change, Transfer, Cancel, Request/Withdraw cancellation) moved into a "..."
  menu; a trip that needs a plate keeps a visible red **Set plate** button. A
  status cell shows at most one extra chip (cancellation pending > transfer
  pending > changed).
- **Approvals:** each card/row now shows the bay dropdown and Approve; Reject
  (with its optional reason) and Set plate are in the "..." menu.
- **Toolbars:** Export CSV moved under a "..." menu everywhere it appeared; the
  Schedule filter box lost its label.
- **Top bar / sidebar:** the name-and-role chip, Sign out button and the
  sidebar's duplicate user card became one avatar menu (name, role, Sign out).
  Emoji icons (sidebar and the bell) replaced by line SVGs per the design
  system.
- **Duplicate labels:** the operator name's trade-name pill is now a tooltip
  (it still shows, struck-through-previous and all, on a transferred booking).
- **Spacing:** card, tile, row and page padding tightened.

Not changed: the Vehicles pages already default to 7 columns (the Columns
picker has the rest), so there was nothing to trim.

Bug caught while verifying: the new bell icon rendered at zero width because
every `button` carries 18px side padding and the bell is 36px wide; fixed with
`padding: 0`.

Verified in the browser as operator and staff: tile contents and counts, Needs
plate filter (6 rows), "..." menu items and the Change dialog opening from it,
sign-out from the avatar menu, Approvals card actions, week view and the export
menu, no console errors from the change.

---

### 106. Utilization moved into the staff Overview, which is now the dashboard (9 Oct)

The whole Utilization page now lives on the staff Overview, below the queue
tiles and the lockout list, so Overview is the one place for dashboard-style
content:

- A date range (default last 30 days) with Apply and Export CSV (under "...").
- Headline tiles for the range: Approved trips, Slot occupancy, Cancelled
  after approval, Days with activity.
- By gate table with a slot-occupancy bar per gate; Busiest times by hour.
- **Vehicles blocked by an unlinked route** worklist, shown only when there is
  something to fix (the "Every approved vehicle has a bookable route" empty
  state is no longer a card).

The code was lifted from utilization.html unchanged apart from element ids
that stayed distinct and the added tile row; it replaces the one-line "Last 30
days" summary from #105. `utilization.html` is now a redirect to
`overview.html#utilization` (old bookmarks keep working) and the Utilization
sidebar entry is gone.

Verified in the browser as staff: the redirect lands on the section; default
range shows 44 trips / 5 active days with 24 vehicles on the unlinked-route
list; applying 12-18 Oct shows 181 approved, 1 cancelled after approval, 7
days, and Gate 4: 104 trips on 6 bays - matching the demo data.

---

### 107. Operator profiles: five columns when it fits, four when not (9 Oct)

The staff Operator profiles card grid now sizes its columns from the row width:
the column floor is the larger of 190px and a fifth of the row, so about 1000px
of content or more gives **5 across**, about 800-1000px gives **4**, and below
that it steps down to 3, 2, 1 by itself (no media queries). Cards are slightly
tighter to fit, and each card has the full operator name as a tooltip since
narrow cards truncate long names with an ellipsis.

Verified by resizing the grid's container: 1000-1250px -> 5 columns, 800-950px
-> 4, 600-780px -> 3, 400px -> 2; at the narrowest 4-column width none of the 78
cards spill (53 titles truncate with an ellipsis).

---

### 108. Fixed: every page's content column was collapsing to its content width (9 Oct)

Reported on Operator profiles ("it shows 2 columns only", #107): the whole page
content sat in a ~550px strip in the middle of a 1700px screen, so the card grid
could only fit two across. Root cause was the sidebar shell from #91:
`.app-content` is a column flexbox, and a flex item with `margin: 0 auto` (which
`.wrap` has) does not stretch - it shrinks to its content. So `.wrap`'s 1300px
max-width never came into play; every page was only as wide as whatever it held.
The #107 breakpoints were correct but had nothing to work with.

Fix: `.app-content > .wrap { width: 100% }` - fill the column, still capped by
`.wrap`'s max-width (and the narrow pages' 860px). This widens every page that
had been shrinking: tables, Approvals, Schedule, Overview.

Verified with the viewport emulated: 2000px wide -> content column 1300px, 5 card
columns; 1440px wide -> grid 1131px, 5 columns; Bays stays at its 860px cap;
Approvals now fills 1191px.

---

### 109. Demo week: several operators per departure time, 47 destinations (9 Oct)

Third batch added to `scripts/seed-demo-week.mjs` (still re-runnable and
idempotent): 35 more route entries timed so operators leave **together** - e.g.
6:00 AM is Alps to Sorsogon City, JVH to Tabaco City and Antonina Line to Tiwi
(plus Bicol Isarog to Legazpi on alternate days); 8:30 AM is Jam Liner to Biñan,
Barney to Guinayangan and Batman to Balayan; 4:00 PM, 8:00 PM and 9:00 PM
similarly - spread across Gates 2/4/5. Every operator/route pair is checked
against its eligible vehicles at run time.

The week of 12-18 Oct now has 346 bookings from 27 operators to 47 distinct
destinations: 322 approved, 22 pending, 1 rejected, 1 cancelled, 1 cancellation
request. On a typical day many times carry 3-4 trips to different places (e.g.
Wed 14 Oct: 6:00, 8:30, 10:30, 14:00, 16:00 and 20:00 each have 3 operators /
3 destinations; 6:00 PM has 4 trips). All 27 bays in use, 0 bay/slot conflicts,
no approved trip without a bay. Kept intentionally, like the other demo sets.

---

### 110. Unlinked-route vehicles: summary on the dashboard, the list on the Vehicles page (9 Oct)

On the staff Overview the yellow "Vehicles blocked by an unlinked route" section
(a note plus a 24-row table) is now just the note, as a one-line summary link
under the lockout list: "**24 approved vehicles** can't be booked - their routes
aren't one of the terminal's routes. Review on Vehicles ->". Still hidden when
there is nothing to fix.

Clicking it opens `vehicles-database.html?filter=unlinked`: the normal Vehicles
table narrowed to exactly those vehicles (ids from the same
`vehicles_with_unlinked_route()` RPC the note counts), with a banner stating the
count and how to fix it and a "Show all vehicles" link. All the page's own
columns, search, filters, edit/details work on that list, so the fix (set the
vehicle's route) happens where the vehicle lives.

Verified as staff: note shows 24; the click lands on a "24 of 1832 vehicles
shown" table; Show all returns the full 1,832.

---

### 111. Booking transfers by gate, not by route (migration 0050, 20 Oct)

A transfer was limited to operators with an approved vehicle on the booking's
exact route (0032). The terminal assigns bays by gate, so the receiving operator
and the plate they pick now only need to be registered for **a route on the same
gate** as the booking's route (the same route still qualifies).

- **`route_gates`** (new table, 88 routes, read-only for signed-in users): the
  route -> gate map, which until now existed only in the browser (`ROUTE_GATES`
  in app.js). Seeded from that list; `scripts/import-vehicle-masterlist.mjs`
  now rewrites it next to `route_trip_codes`. A route with no gate falls back to
  exact-route matching.
- **`vehicle_fits_transfer(vehicle_route, booking_route)`**: the one rule behind
  the lists and the enforcement.
- **`list_operator_accounts` / `list_operator_vehicles`** widened to the gate;
  the vehicle list also returns each vehicle's route, and the dialog shows it
  ("NBB5496 · SAN JOSE CITY, NUEVA ECIJA") when it isn't the booking's own.
- **`request_booking_transfer`** re-validates with the same rule (the real gate;
  the dropdowns are UX). Error text now says "route or gate".
- **`request_booking_change`**: a plate that arrived via a gate-wide transfer
  stays valid while the booking's route is unchanged. Without this the new
  owner could not even change the booking's time afterwards, because the
  existing check demanded an exact-route vehicle. Picking a *different* plate
  still has to match the route exactly - the booking form is unchanged.
- Dialog copy: the context line shows the booking's gate, the intro says any
  operator on that gate can receive it, empty states say "on this route's gate".

**Applied to the live database by hand**, only 0050, in one transaction with a
`_schema_migrations` row. Migrations 0048 and 0049 (security advisor fixes, not
mine) are still **unapplied**, so a plain `run-migration.mjs` run would apply
them too.

Verified against the live database as `genesis.ops` (rolled-back scratch
booking, JWT claims set in SQL): a Clark Airport (Gate 5) booking now offers 7
receiving operators versus 0 under the old exact-route rule; a Baliwag Transit
bus registered to San Jose City, Nueva Ecija was accepted; a Bicol Isarog
(Gate 4) operator is absent from the list and its plate is refused by the server
with the new "route or gate" message. Nothing left behind. The operator
dialog's new copy loads in the browser; I could not open the dialog itself
because every demo booking is now in the past (today is 20 Oct).

### 112. PITX App: the site becomes modules; this app is the Trip Scheduling module (28 Oct)

The site is now **PITX App**, a set of modules behind one login and one Supabase
project. Trip Scheduling is the first; Terminal Operating System (owner
Jcbllanto16, issue #1) and Ticketing and Booking are next. No database change -
no migration, nothing applied to the live database.

- **Layout.** The site moved from a flat `docs/` to:
  - `docs/shared/` - `config.js`, `styles.css`, the logo, `platform.js` and
    `modules.js`.
  - `docs/modules/trip-scheduling/` - every existing page.
  - Root `index.html`, `login.html`, `404.html`.
- **`app.js` split.** `shared/platform.js` takes the module-agnostic half: the
  Supabase client, `getProfile` / `guardPage` / `signOut`, the sidebar + topbar
  shell (`renderNav(profile, { brand, links })`), notifications, `escapeHtml`,
  `fetchAllRows`, CSV export. `modules/trip-scheduling/assets/app.js` keeps the
  trip-only parts (`ROUTES`, `ROUTE_GATES`, slots and dates, booking and vehicle
  rendering, the three sidebar link sets) and re-exports the platform, so no
  page's imports changed - only asset paths did.
- **`shared/modules.js`** is the registry: id, name, folder, and which
  `profiles.role` values may enter, each with a landing page. It only decides
  what UI to show; RLS is still the access control.
- **Homepage = module portal.** `index.html` lists the modules the signed-in role
  can open (signed out goes to `login.html`). Everyone lands there after sign-in;
  the sidebar logo goes back to it. `portal.html` remains as a redirect. Terminal
  Operating System shows as a disabled "Coming soon" card for staff (it is not
  counted as a real module, so the sidebar "All modules" link stays hidden until
  a second one ships).
- **Old URLs.** `404.html` forwards root-level page URLs (bookmarks, links already
  stored in notification rows) to `modules/trip-scheduling/`. `serve-docs.mjs`
  serves `404.html` for a missing path, like Pages does.
- **Repo renamed** PITX-Trip-Scheduling -> **PITX-App**; the live site is now
  <https://jm-jaramillo.github.io/PITX-App/>. The old Pages address returns 404
  and cannot forward. Package name `pitx-app`.
- **Docs and scripts.** This file and the README moved into the module folder
  (links rewritten); the root README now describes PITX App.
  `import-vehicle-masterlist`, `seed-demo-week` and the operator one-offs moved to
  `scripts/trip-scheduling/` (`npm run import-vehicles` updated). `CONTRIBUTING.md`
  covers module rules, one Postgres schema per module, `YYYYMMDDHHMM_<module>_<what>.sql`
  migration names for new work, and committing straight to `main`.
  `.github/CODEOWNERS` records module owners (advisory without branch protection).

Verified in the browser against a local server: the sign-in page loads styled,
signed-out visits to `/` and `portal.html` go to `login.html`, an old URL
(`my-schedule.html?x=1`) forwards into the module, and - with a faked session in a
throwaway copy - the sidebar logo opens the portal and the Coming-soon card
renders. **Not tested signed in on the live site** (no test credentials); sign in
as an operator and as staff and click through before relying on it. Migration
`0049` is still untracked and unapplied.

---

### 113. Automatic, balanced bay assignment (migration 202610291200, 29 Oct)

The bay used to be chosen only at approval, and the default (single approve and
bulk approve alike) was "the first free bay in the gate" - so Bay 18 got
everything and the higher-numbered bays sat idle. Every booking now gets its bay
**the moment it is scheduled**, picked to keep the bays evenly loaded, and staff
keep full manual control.

**The algorithm - `pick_balanced_bay(route, date, slot)`**, a database function.
Candidates are active bays free at that date + slot (approved trips *and* other
requests' proposed bays count as taken, so two requests never get the same bay).
The first bay by this order wins:

1. **In the route's gate** before any other gate (`route_gates`, 0050); a route
   with no gate treats all bays alike. Falls back to other gates only when the
   gate is full at that time.
2. **No trip in that bay within +/-2 slots (30 min)** - a bus that arrived just
   before may still be standing there.
3. **Fewest trips that day** in the bay - the main balancing term.
4. **Fewest trips over +/-14 days** - keeps the spread fair across the fortnight,
   so days with only a trip or two still rotate through every bay.
5. **Stable pseudo-random tie-break** (md5 of bay + date + slot) - deliberately
   *not* the lowest bay number, which with everything else equal is exactly the
   old "always Bay 18" behaviour. Same inputs always give the same answer.

Each new trip lands on the emptiest eligible bay, so loads stay within one trip
of each other.

**When it runs** (triggers on `bookings`): on insert, and on any update that
leaves a pending/approved booking without a bay - which is what happens when an
operator changes a trip's route/date/time (`request_booking_change` clears the
bay). Operators still cannot pick a bay: a bay supplied on insert by a non-staff
user is discarded. A bay staff set explicitly is never touched. If staff approve
a booking into a bay another *pending* request had been proposed (an override),
that request is re-picked automatically. Existing upcoming pending requests were
given bays by the migration (36, none left without one).

**Staff still decide.**
- *Approvals:* the bay dropdown is preselected with the booking's bay (marked
  "(auto)") and any vacant bay, in any gate, can be chosen instead; bulk
  "Approve selected" now confirms each booking's own proposed bay instead of
  piling onto the lowest-numbered one. The old first-free rule is only a
  fallback if a proposed bay has since been taken.
- *Overstay:* unchanged and still there - on the Schedule board an approved trip
  that hasn't departed has a bay selector listing only vacant bays for that slot,
  so a trip whose bus overstayed can be moved to a vacant bay by hand.

**Verified against the live database in rolled-back transactions:** five trips in
one slot -> Bays 33, 34, 35, 36 then a non-gate bay; eight spaced trips ->
2 each across the four Gate 5 bays; adjacent slots -> different bays; an operator
asking for Bay 36 is overridden; staff approving B into A's bay re-picks A;
a cleared bay is reassigned; no double bookings. Long-run: 30 single-trip days on
the six Gate 4 bays -> 4/5/5/5/5/6 (earlier tie-break would have been Bay 18 every
time); 24 trips in one day -> exactly 4 on each. Same-slot clusters no longer
always start at the lowest bay (35,34,36,33 | 34,33,36,35 | ...).

Applied to the live database by hand (one transaction, with a
`_schema_migrations` row), as with 0050.

---

## What the app does now




**Operators** — fill in a one-time company profile (Operator, trade name/
code, logo, owner, booking system, up to 5 contact persons); register
vehicles one at a time (scan or manual entry) or several at once via CSV
batch upload, with fields grouped by what they describe (LTFRB Franchise
Details - Case No., Franchise, Sticker No., Body Number, trade name, CPC/
OR-CR validity, CPC Extension of Validity, Route, Origin, Destination;
Vehicle Details - MV File #, Chassis No., Year, Make, Bus Type, Seating
capacity, Seat configuration; Remarks); request a 15-minute trip slot by
picking a destination and time (no plate yet), optionally repeating it
across chosen weekdays in one go; assign the plate later,
any time up to the day of the trip, from a dropdown of their *approved*,
CPC-current vehicles; see status, assigned bay, and any rejection note;
filter today-and-future requests by status (Schedule Request) with past
requests under History, browsable by month - both on the Overview page,
whose count tiles (Approved upcoming, Pending, Vehicles expiring soon) open
the matching filtered list;
change a booking or a vehicle (back to staff for approval either way,
except a plate-only change, which isn't); cancel a still-pending request
instantly, or request cancellation of an already-approved one (needs
staff approval); view their own schedule or every operator's, both as an
airport-style PIDS board. Navigation is a left sidebar (#91); every
dashboard-style summary lives on Overview only (#95).

**PITX staff** — work every approval from one Approvals page (Trip requests,
Vehicle approvals, Transfer approvals, each with a red pin showing how many
are waiting and a History tab): approve or reject vehicle registrations,
booking requests (assigning an available bay on approval), and cancellation
requests for already-approved bookings; browse operators as cards with a
detail popup; record a plate on an operator's
behalf; view an airport-style departures board of the day's confirmed
trips (Arriving/Departed/Cancelled), grouped by time, filterable, with
inline bay reassignment; review gate utilization and busiest hours over a
date range; add/deactivate bays; create operator and staff logins.

**Enforced by the database, not just the UI**

- Operators can only ever see and act on their own vehicles, and their own
  bookings while still pending; once a booking is a confirmed trip
  (approved, or cancelled after being approved), any signed-in operator
  can read it too - that's the "All trips" board (#81) - but only staff or
  the owning operator can act on it (RLS).
- Only staff can approve, reject, manage bays, or read all profiles.
- A unique index prevents two staff from approving the same bay for the
  same hour.
- Operators cannot assign themselves a bay, or approve their own vehicle,
  even by crafting a request directly against the database — verified with
  a live penetration attempt, not just a policy read-through (see `a186bfa`
  below).

---

## Verified by testing

Each of these was exercised in a browser against the live Supabase project:

- Login for both roles, and redirect to the correct home page
- Signed-out visitors bounced to login; operators blocked from staff pages
- Submitting a booking request
- Approving with a bay assigned; rejecting with a reason
- Operator seeing approved status, assigned bay, and rejection note
- Cancelling a pending request
- Changing an approved booking → reverts to pending, bay released
- Staff seeing the "changed after approval" badge, then re-approving
- Schedule reflecting the moved booking and correct capacity counts
- Bays listing in ascending order; Accounts listing existing users
- Form text rendering black; no console errors on any page
- Registering a vehicle by scan (real OCR pipeline, synthetic OR/CR image)
  and by manual entry; duplicate-plate rejection
- Vehicle approve/reject; edited-after-approval reverting to pending and
  disappearing from the booking dropdown, then reappearing once
  re-approved
- RLS penetration test: an authenticated operator's raw SQL attempt to
  self-approve a vehicle affects zero rows
- Every page's tables and forms at 375px width: no hidden columns, no
  page-level horizontal scroll, desktop layout unchanged
- Booking without a plate; setting it later via "Set plate" without
  disturbing an already-approved booking's status or bay (#81)
- Requesting cancellation of an approved booking → staff's Cancellation
  requests tab (badge count, reason shown) → approve (booking cancelled,
  bay released, request cleared from the queue) (#81)
- A still-pending request's "Cancel" stays instant, no staff step (#81)
- `my-schedule.html`'s "My trips" and "All trips" views, both rendering
  real live data with no console errors (#81)

**Not yet verifiable:** creating accounts from the Accounts page, which
needs the Edge Function deployed (see below). It currently shows a clear
error rather than failing silently.

---

## Outstanding — needs your account access

1. ~~Point GitHub Pages at `/docs`.~~ **Done** — live at
   <https://jm-jaramillo.github.io/PITX-App/>.

2. **Deploy the four Edge Functions** so staff can create, delete, and
   reset passwords for accounts in-app, and so operators can request a
   password reset from the sign-in page. **Still not done** - re-checked
   1 Sep and all four endpoints 404:

   ```bash
   npx supabase login
   npx supabase link --project-ref nuezknlzwfkfxlicrgol
   npx supabase functions deploy create-account
   npx supabase functions deploy delete-account
   npx supabase functions deploy reset-password
   npx supabase functions deploy request-password-reset
   ```

   Until then, use `npm run create-staff` / `npm run create-operator` /
   `npm run delete-account` locally. Note this is the only item on this
   list that needs *your* Supabase credentials - it can't be done from
   the database connection string alone.

---

## Known gaps

- **No forced password change** on first login; staff-set temporary
  passwords stay valid indefinitely and are visible on-screen when created.
- **Shared credentials.** `pitx.admin` and the operator accounts use
  passwords that have been typed into this chat (`TestPass123` and
  variants). Change them before real use. The *data* is no longer test
  data - bookings were wiped clean on 1 Sep (#88's note) and every
  vehicle now comes from the real masterlist - but the logins are still
  the ones from development.
- **No audit trail** beyond `decided_by` / `decided_at` and a revision
  counter — there's no history of what a booking's or vehicle's previous
  values were.
- **Notifications are in-app only** — there's a bell in the nav (migration
  `0024`), but nothing reaches an operator by email or SMS, so they still
  have to open the app to find out a decision was made.
- **A booking's plate number is plain text, not linked to a vehicle
  record.** If the vehicle it came from is later edited or rejected, the
  booking itself is untouched — there's no way to see which bookings used
  which vehicle registration.
- **No limit on vehicles per operator**, and no per-operator cap on
  concurrent pending vehicle submissions.
- **A transfer only remembers one hop back.** If a booking is transferred
  twice, the schedule/dashboard strikethrough shows only the immediately
  preceding operator, not the full chain.
- **OCR accuracy depends entirely on photo quality.** It was verified
  against a clean, straight-on synthetic image; real photos — glare, skew,
  worn print — will do meaningfully worse. That's inherent to running OCR
  client-side for free, not a bug to fix later.
- **Fonts load from Google Fonts at runtime** (Manrope/Inter) — an external
  dependency GitHub Pages doesn't control. Fine unless the terminal network
  blocks it, in which case pages fall back to the system font.
- **None of the four Edge Functions are deployed** (see "Outstanding"
  above; re-confirmed 1 Sep - all four 404), so creating, deleting, and
  resetting accounts from the in-app Accounts page doesn't work, and
  neither does the sign-in page's "Forgot password?" link. Use
  `npm run create-staff` / `create-operator` / `delete-account` locally
  in the meantime.
- **Vehicle fields changed twice in one day** (0006 added franchise
  number/body number/seat configuration; 0008 replaced them). Anyone who
  registered a vehicle under the old field set lost that data on the 0008
  cutover — there was no real data to preserve at the time, but worth
  knowing if this pattern recurs: an additive migration followed by a
  replacing one, both against a live database, is a data-loss risk on
  the second migration if real records exist by then.
- **The 2-hour lead time (was 4 hours until #81) only restricts
  operators.** Staff can still approve or reject a request with any
  amount of time left (by design - otherwise a request submitted with
  2h01m of notice could become unapprovable the moment staff get to it),
  and operators can still cancel a pending booking inside the lead-time
  window (also by design - only asked to restrict creation and
  modification, not cancellation). #81 added staff approval for
  cancelling an *approved* booking, closing the other half of this
  question; worth deciding whether cancellation should eventually have its own
  cutoff too.
### 114. Demo of the balanced bay assignment (29 Oct)

Demo week **2-8 Nov 2026**: 157 trips from 20+ operators, inserted with **no bay**
so the new trigger chose every one (nothing assigned by hand); ~80% approved
keeping their bay, 31 left pending so Approvals shows the preselected "(auto)" bay.
Heavy same-time clusters on Gate 4 (e.g. four operators at 18:00) would have been
Bays 18, 19, 20... every day under the old rule.

- **Overview -> Utilization -> new "By bay" table**: approved trips per bay,
  grouped by gate, with a bar and the spread (max - min) per gate. Opens with
  `overview.html?from=2026-11-02&to=2026-11-08` (new `from`/`to` query params).
- `scripts/trip-scheduling/seed-demo-week` sibling `seed-balanced-bay-demo.mjs`
  holds the same trip list (needs `DATABASE_URL`); the live data was seeded with
  the equivalent SQL.
- Result (approved, 2-8 Nov): Gate 4 bays 12-19 trips each, Gate 5 bays 5-6,
  Gate 2 bays 2 each; no trip without a bay.

---

### 115. Fix: pages blank after the module restructure (29 Oct)

`assets/app.js` calls `escapeHtml` (25 places: booking/vehicle renderers) but after
the move to modules it only imported `renderNav`/`ICONS` from the shared platform
- `export *` re-exports a name, it does not bring it into scope. Result: staff
**Approvals** and **Vehicles** (and anything using those renderers) failed with
`escapeHtml is not defined` and showed an empty list. Added the import.

Full sweep after the fix, signed in as staff (pitx.admin) and as an operator:
every Trip Scheduling and Terminal Operating System page loads with no script
errors; all 38 scripts parse; every link/import/redirect target exists; legacy
redirects (staff, dashboard, utilization, transfer/vehicle-approvals,
request-history) land correctly.

---

