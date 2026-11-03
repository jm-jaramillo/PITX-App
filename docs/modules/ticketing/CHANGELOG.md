# Project log

Build history of the Ticketing and Booking module of PITX App.
Owner: @victoriaronald
Repo: <https://github.com/jm-jaramillo/PITX-App>
Plan: [PLAN.md](PLAN.md)

Dates and times are Manila time. Every update is pushed to `main` and logged here,
newest first. Migrations are listed with the entry that added them.

---

## Decisions as agreed

| Decision | Choice |
|---|---|
| Where Ticketing lives | `docs/modules/ticketing/`, plain pages like the other modules, following CONTRIBUTING.md |
| Source of trips | Trip Scheduling's approved bookings, read only through functions it exposes (proposed in PLAN.md section 2) |
| Who sets the bus for a trip | The operator, through Trip Scheduling's existing plate field. Ticketing reads it |
| Teller scope | One Teller sells for one bus operator only |
| Boarding validation | The automated gate (TOS), not staff |
| Teller refund rule | A Teller can refund any ticket of their operator up to 4 hours before departure; closer than that needs the Ticketing Admin |
| Seat layouts | The 8 diagrams in "PTX. OPS. Seat Configuration" (2026-10-27), the same ones Trip Scheduling uses |

Still to agree with the other owners: the trip feed functions, the new `teller` and
`account` roles, and how passenger seat requests hand over to Ticketing (PLAN.md
sections 2 and 3).

---

## Before the repo: prototype (28 Oct to 3 Nov)

- The ticketing rules were built and tested as a separate prototype (Next.js, data kept
  in the browser only) on the owner's PC. It is not in this repo and is not used by
  PITX App; it is the reference for the screens and rules here.
- It covered POS with multi-seat sales and the 8 seat layouts, boarding passes with QR,
  refunds and reprints with approvals, Close Sales and blind Daily Collection,
  manifests, ticket availability, reports with Excel export, and System Parameters.

---

## 1 · Build plan (3 Nov)

- Added [PLAN.md](PLAN.md): scope, the trip data Ticketing needs from Trip Scheduling,
  proposed roles, the `ticketing` schema, pages and order of work, with open questions
  for @jm-jaramillo and @Jcbllanto16.
- Added this CHANGELOG.
- No pages, shared files or migrations changed.
