// Trip Scheduling module helpers: destinations/routes, 15-minute slots,
// booking and vehicle rendering, and the module's sidebar. Everything that is
// not specific to trip scheduling lives in ../../../shared/platform.js and is
// re-exported here so pages keep a single import.

import { renderNav as renderShell, ICONS } from "../../../shared/platform.js";
export * from "../../../shared/platform.js";

/* ---------------------------------------------------------------- routes */

// The fixed set of PITX-served destinations - a booking's route is
// picked from this list rather than typed freehand, so it can't drift
// into near-duplicate variants of the same destination. Existing
// bookings using an old phrasing aren't renamed; the Change dialog's
// "not in the current list" fallback (see dashboard.html) already
// handles a stored route that doesn't match an entry here.
//
// Rebuilt (#88) from the **Destination** column of the Vehicle
// Masterlist workbook's Database sheet - the destination an operator's
// vehicle is franchised to serve is now what a trip is booked against,
// so route and destination are the same thing and no translation layer
// sits between them. Every entry is the workbook's own text, verbatim
// and unnormalized: the workbook is the source of truth and is still
// being cleaned, so "correcting" a spelling here would just break the
// verbatim match against `vehicles.route`. Regenerate with
// scripts/import-vehicle-masterlist.mjs rather than editing by hand -
// it rewrites this list, ROUTE_GATES, and route_trip_codes together
// from the same workbook read.
export const ROUTES = [
  "ALABANG",
  "ALFONSO",
  "BAGAMANOC",
  "BAGUIO CITY",
  "BALANGA, BATAAN",
  "BALATAN",
  "BALAYAN",
  "BANAUE, IFUGAO",
  "BARAS, CATANDUANES",
  "BATANGAS CITY",
  "BATANGAS CITY (PIER)",
  "BATANGAS CITY PIER (BATANGAS) - PLAZA LAWTON (MANILA)",
  "BAUAN, BATANGAS",
  "BIÑAN, LAGUNA",
  "BOAC, MARINDUQUE",
  "BORONGAN, E. SAMAR",
  "BUHI",
  "BUHI NABUA",
  "BULAN",
  "BUTUAN CITY",
  "CAGAYAN DE ORO",
  "CALATAGAN",
  "CALAUAG",
  "CALBAYOG CITY",
  "CARAMOAN",
  "CATANDUANES",
  "CATARMAN, N. SAMAR",
  "CEBU CITY",
  "CLARK INTERNATIONAL AIRPORT",
  "COTTA( LUCENA QUEZON)",
  "DAET",
  "DAGUPAN CITY",
  "DAVAO CITY",
  "DONSOL, SORSOGON",
  "GARCHITORENA",
  "GENERAL SANTOS CITY",
  "GUBAT",
  "GUIMARAS ISLAND",
  "GUINAYANGAN",
  "GUIUAN, E. SAMAR",
  "ILO-ILO CITY",
  "IRIGA CITY",
  "JOSE PANGANIBAN",
  "LAGANGILANG",
  "LAGONOY",
  "LAOAG CITY",
  "LEGAZPI CITY",
  "LEMERY, BATANGAS",
  "LILOAN",
  "LIPA CITY",
  "LUCENA CITY",
  "MAASIN CITY",
  "MAGALLANES",
  "MANDAON, MASBATE",
  "MARAGONDON, CAVITE",
  "MARIVELES, BATAAN",
  "MASBATE",
  "MASBATE CITY",
  "MATNOG",
  "MENDEZ",
  "NAGA CITY",
  "NAGA, CAMARINES NORTE",
  "NASUGBU",
  "NEGROS OCCI.",
  "OLONGAPO CITY",
  "ORAS, E. SAMAR",
  "ORMOC CITY",
  "PACITA COMPLEX",
  "PALAWAN",
  "PALOMPON, LEYTE",
  "PARACALE, CAMARINES NORTE",
  "PASACAO",
  "PILAR, SORSOGON",
  "PIO DURAN",
  "PLACER, MASBATE",
  "PRESENTACION",
  "PRIETO DIAZ, SORSOGON",
  "RAWIS, LAOANG",
  "SABANG",
  "SAN ANDRES",
  "SAN CARLOS CITY",
  "SAN JOSE",
  "SAN JOSE CITY, NUEVA ECIJA",
  "SAN JOSE, DINAGAT ISLANDS",
  "SAN JOSE, OCC. MINDORO",
  "SAN JUAN, BATANGAS",
  "SILAGO",
  "SORSOGON CITY",
  "STA. ANA",
  "STA. CRUZ",
  "STA. CRUZ, LAGUNA",
  "STA. ELENA",
  "STA. ROSA, LAGUNA",
  "TABACO CITY",
  "TACLOBAN CITY",
  "TAGBILARAN, BOHOL",
  "TAGKAWAYAN",
  "TAGUM CITY, DAVAO DEL NORTE",
  "TERNATE",
  "TIWI",
  "TUGUEGARAO CITY",
  "VIGA, CATANDUANES",
  "VIRAC",
];

/** Each destination's gate, taken straight from the workbook's
 * "Gate Assignment" column (Database sheet) rather than derived from
 * the destination's province - the terminal assigns these, and the
 * workbook is where that decision is recorded. Destinations the
 * workbook leaves unassigned are simply absent here; routeOptionsHtml()
 * groups those under "Other", and checkGateFullness() falls back to
 * checking every active bay for them (#81). Regenerated alongside
 * ROUTES by scripts/import-vehicle-masterlist.mjs. */
export const ROUTE_GATES = {
  "BAGAMANOC": "Gate 4",
  "BAGUIO CITY": "Gate 5",
  "BALANGA, BATAAN": "Gate 5",
  "BALATAN": "Gate 4",
  "BALAYAN": "Gate 2",
  "BANAUE, IFUGAO": "Gate 5",
  "BARAS, CATANDUANES": "Gate 4",
  "BATANGAS CITY": "Gate 2",
  "BATANGAS CITY (PIER)": "Gate 2",
  "BATANGAS CITY PIER (BATANGAS) - PLAZA LAWTON (MANILA)": "Gate 2",
  "BAUAN, BATANGAS": "Gate 2",
  "BIÑAN, LAGUNA": "Gate 2",
  "BORONGAN, E. SAMAR": "Gate 4",
  "BUHI": "Gate 4",
  "BUHI NABUA": "Gate 4",
  "BULAN": "Gate 4",
  "BUTUAN CITY": "Gate 4",
  "CAGAYAN DE ORO": "Gate 4",
  "CALATAGAN": "Gate 2",
  "CALBAYOG CITY": "Gate 4",
  "CARAMOAN": "Gate 4",
  "CATANDUANES": "Gate 4",
  "CATARMAN, N. SAMAR": "Gate 4",
  "CEBU CITY": "Gate 4",
  "CLARK INTERNATIONAL AIRPORT": "Gate 5",
  "DAET": "Gate 4",
  "DAGUPAN CITY": "Gate 5",
  "DAVAO CITY": "Gate 4",
  "DONSOL, SORSOGON": "Gate 4",
  "GARCHITORENA": "Gate 4",
  "GENERAL SANTOS CITY": "Gate 4",
  "GUBAT": "Gate 4",
  "GUIMARAS ISLAND": "Gate 4",
  "GUIUAN, E. SAMAR": "Gate 4",
  "ILO-ILO CITY": "Gate 4",
  "IRIGA CITY": "Gate 4",
  "JOSE PANGANIBAN": "Gate 4",
  "LAGANGILANG": "Gate 5",
  "LAGONOY": "Gate 4",
  "LAOAG CITY": "Gate 5",
  "LEGAZPI CITY": "Gate 4",
  "LEMERY, BATANGAS": "Gate 2",
  "LILOAN": "Gate 4",
  "LIPA CITY": "Gate 2",
  "MAASIN CITY": "Gate 4",
  "MAGALLANES": "Gate 4",
  "MANDAON, MASBATE": "Gate 4",
  "MARIVELES, BATAAN": "Gate 5",
  "MASBATE": "Gate 4",
  "MASBATE CITY": "Gate 4",
  "MATNOG": "Gate 4",
  "NAGA CITY": "Gate 4",
  "NAGA, CAMARINES NORTE": "Gate 4",
  "NASUGBU": "Gate 2",
  "NEGROS OCCI.": "Gate 4",
  "OLONGAPO CITY": "Gate 5",
  "ORAS, E. SAMAR": "Gate 4",
  "ORMOC CITY": "Gate 4",
  "PACITA COMPLEX": "Gate 2",
  "PALOMPON, LEYTE": "Gate 4",
  "PARACALE, CAMARINES NORTE": "Gate 4",
  "PASACAO": "Gate 4",
  "PILAR, SORSOGON": "Gate 4",
  "PIO DURAN": "Gate 4",
  "PLACER, MASBATE": "Gate 4",
  "PRESENTACION": "Gate 4",
  "PRIETO DIAZ, SORSOGON": "Gate 4",
  "RAWIS, LAOANG": "Gate 4",
  "SABANG": "Gate 4",
  "SAN CARLOS CITY": "Gate 5",
  "SAN JOSE CITY, NUEVA ECIJA": "Gate 5",
  "SAN JOSE, DINAGAT ISLANDS": "Gate 4",
  "SAN JOSE, OCC. MINDORO": "Gate 2",
  "SAN JUAN, BATANGAS": "Gate 2",
  "SILAGO": "Gate 4",
  "SORSOGON CITY": "Gate 4",
  "STA. ANA": "Gate 5",
  "STA. CRUZ, LAGUNA": "Gate 2",
  "STA. ELENA": "Gate 4",
  "STA. ROSA, LAGUNA": "Gate 2",
  "TABACO CITY": "Gate 4",
  "TACLOBAN CITY": "Gate 4",
  "TAGBILARAN, BOHOL": "Gate 4",
  "TAGUM CITY, DAVAO DEL NORTE": "Gate 4",
  "TIWI": "Gate 4",
  "TUGUEGARAO CITY": "Gate 5",
  "VIGA, CATANDUANES": "Gate 4",
  "VIRAC": "Gate 4",
};

/** The gate a booking's route should be assigned into, or null if the
 * route has no configured gate (falls back to showing every bay). */
export function gateForRoute(route) {
  return ROUTE_GATES[route] ?? null;
}

/* ------------------------------------------------------------------ time */

// 96 quarter-hour slots per day. Slot N covers [N*15, N*15+15) minutes
// past midnight - slot 0 is 12:00-12:15 AM, slot 95 is 11:45 PM-12:00 AM.
// (Was 48 half-hour slots before #78 - see that entry for the
// migration that widened the database side of this to match.)
export const SLOTS = Array.from({ length: 96 }, (_, i) => i);

function formatClock(totalMinutes) {
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const period = hour24 < 12 ? "AM" : "PM";
  const displayHour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

// A slot's start time only ("9:00 AM"), never a range - every page that
// displays a time slot shows the specific departure time, not a "9:00 -
// 9:15" span (a booking's actual scheduled moment is its start; the
// trailing 15 minutes isn't a separate fact worth repeating on every
// row). formatSlot() used to return that range and has been retired -
// see #85.
export function formatSlotStart(slot) {
  return formatClock(slot * 15);
}

/** A stored timestamptz rendered in terminal-local (Manila) time.
 * Everything else in this app is already Manila-relative - a booking's
 * slot, the lead-time cutoff, `slot_start_at()` - so a decision
 * timestamp shown in the viewer's own zone (or worse, raw UTC ISO)
 * reads as a different moment than the rest of the row. Returns "—" for
 * null so callers don't each repeat that. */
export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Bookings must be made/changed at least this far ahead of their slot -
 * mirrors the same rule enforced server-side (see migration 0009, reduced
 * to 2 hours in migration 0039). This copy is for immediate UI feedback
 * only; the database is still the real boundary, since a client can
 * always be bypassed. */
export const BOOKING_LEAD_TIME_MS = 2 * 60 * 60 * 1000;

/**
 * The real UTC instant a (bookingDate, slot) pair represents. PITX runs on
 * Philippine time (UTC+8, no DST), so this treats bookingDate/slot as
 * local Manila time and converts to a plain UTC epoch millis for
 * comparison against Date.now() - mirrors public.slot_start_at() in
 * migration 0009.
 */
export function slotStartMillis(bookingDate, slot) {
  const [y, m, d] = bookingDate.split("-").map(Number);
  const totalMinutes = slot * 15;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return Date.UTC(y, m - 1, d, hour, minute) - 8 * 60 * 60 * 1000;
}

export function todayISO() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

// Marks a CPC/OR-CR validity date (or any date) that's already past, or
// within 30 days - same window sync_expiry_notifications() (migration
// 0024) uses for the notification panel, so a highlighted cell always
// matches what triggered a notification. Plain string comparison works
// since both sides are "YYYY-MM-DD".
export function expiryCell(dateStr, escapeHtmlFn) {
  if (!dateStr) return "—";
  const today = todayISO();
  const soon = addDays(today, 30);
  const label = escapeHtmlFn(dateStr);
  if (dateStr < today) return `<span class="expiry-overdue">${label}</span>`;
  if (dateStr <= soon) return `<span class="expiry-soon">${label}</span>`;
  return label;
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Monday of the week containing `iso` - shared by the staff and operator
// schedule pages' week view, so both agree on where a week starts/ends
// without each re-deriving it. `getUTCDay()` is 0 (Sun) - 6 (Sat); this
// rolls Sunday back 6 days and every other day back (day - 1), landing on
// the preceding (or same) Monday.
export function startOfWeek(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(iso, diffToMonday);
}

// The 7 ISO dates (Mon-Sun) of the week containing `iso`.
export function weekDates(iso) {
  const start = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * Sorts bay names numerically ascending (Bay 1, Bay 2, ... Bay 20) rather
 * than alphabetically (Bay 1, Bay 10, ... Bay 2, Bay 20).
 */
export function compareBayNames(a, b) {
  const numA = Number(a.match(/\d+/)?.[0]);
  const numB = Number(b.match(/\d+/)?.[0]);
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
    return numA - numB;
  }
  return a.localeCompare(b, undefined, { numeric: true });
}

/* ------------------------------------------------------------------ nav */

// "My requests" and "History" (dashboard.html / request-history.html)
// used to be separate sidebar entries; they're now a toggle on My
// schedule (moved there 2 Sep, after living on operator-overview.html
// as tabs - #91 - and then a toggle under Overview), so they no longer
// get their own sidebar link. Both URLs still work - they're now thin
// redirects into the right My schedule tab - for old bookmarks and the
// notification links this app already writes.
const OPERATOR_LINKS = [
  { href: "operator-overview.html", label: "Overview", icon: ICONS.overview },
  { href: "my-schedule.html", label: "My schedule", icon: ICONS.calendar },
  { href: "vehicles.html", label: "My vehicles", icon: ICONS.bus },
  { href: "operator-profile.html", label: "Operator profile", icon: ICONS.building },
];

// Pending requests, Vehicle approvals, and Transfer approvals
// (staff.html / vehicle-approvals.html / transfer-approvals.html) used
// to be three separate sidebar entries; they're now filterable sections
// of one Approvals page (approvals.html) instead, so they collapse to a
// single link here. All three old URLs still work - they're now thin
// redirects into the right filter - for old bookmarks and the
// notification links this app already writes.
const STAFF_LINKS = [
  { href: "overview.html", label: "Overview", icon: ICONS.overview },
  { href: "approvals.html", label: "Approvals", icon: ICONS.check },
  { href: "vehicles-database.html", label: "Vehicles", icon: ICONS.bus },
  { href: "schedule.html", label: "Schedule", icon: ICONS.calendar },
  { href: "bays.html", label: "Bays", icon: ICONS.bays },
  { href: "operator-profiles.html", label: "Operator profiles", icon: ICONS.users },
  { href: "accounts.html", label: "Accounts", icon: ICONS.user },
];

// The Ticketing Admin only handles passenger seat requests: it sees no
// bookings, vehicles or approvals (RLS enforces that, not just this list).
const TICKETING_LINKS = [
  { href: "ticketing.html", label: "Seat requests", icon: ICONS.check },
];

/** Sidebar for the signed-in role (operator, staff or ticketing). */
export function renderNav(profile) {
  const links =
    profile.role === "staff"
      ? STAFF_LINKS
      : profile.role === "ticketing"
        ? TICKETING_LINKS
        : OPERATOR_LINKS;
  renderShell(profile, { brand: "Trip<br />Scheduling", links });
}

/* ----------------------------------------------------------------- render */

// Renders a booking's "Operator" cell: the operator name (with a
// struck-through previous name after a transfer, same as before), plus
// - only when the booked vehicle has one - its trade name in a small
// tag, since some operators run more than one trade under a single
// account and a booking's own vehicle may belong to any of them (see
// migration 0036). Shared by every page that lists bookings
// (dashboard.html, my-schedule.html, schedule.html, staff.html,
// overview.html) so the "operator + trade" rendering can't drift
// between them.
export function bookingOperatorHtml(b) {
  const nameHtml = `${
    b.previous_operator_name
      ? `<s class="transferred-from">${escapeHtml(b.previous_operator_name)}</s> `
      : ""
  }${escapeHtml(b.operator_name)}`;

  if (!b.trade_name) return nameHtml;
  // Only a transferred booking still earns the visible tag (it carries the
  // struck-through previous name); otherwise the trade name is a tooltip.
  if (!b.previous_trade_name && !b.previous_operator_name) {
    return `<span title="${escapeHtml(b.trade_name)}">${nameHtml}</span>`;
  }

  const tradeHtml = `${
    b.previous_trade_name && b.previous_trade_name !== b.trade_name
      ? `<s class="transferred-from">${escapeHtml(b.previous_trade_name)}</s> `
      : ""
  }${escapeHtml(b.trade_name)}`;
  return `${nameHtml} <span class="trade-tag">${tradeHtml}</span>`;
}

export function statusBadge(status) {
  return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(
    status
  )}</span>`;
}

const LTFRB_STATUS_LABELS = {
  active: "Active",
  inactive: "Inactive",
  no_record: "No Record",
  ltfrb_verified: "LTFRB Verified",
};

// Only set on vehicles that came from the masterlist import (migration
// 0021) - null for anything an operator registered directly, which this
// returns as "—" rather than a badge, since it's simply not applicable.
export function ltfrbBadge(ltfrbStatus) {
  if (!ltfrbStatus) return "—";
  const label = LTFRB_STATUS_LABELS[ltfrbStatus] ?? ltfrbStatus;
  return `<span class="badge badge-${escapeHtml(ltfrbStatus)}">${escapeHtml(
    label
  )}</span>`;
}

// Bus type replaced the old plain aircon boolean (migration 0035) -
// shared here rather than duplicated per page, unlike the old
// airconLabel() it replaces (that one was copy-pasted identically into
// three separate files).
const BUS_TYPE_LABELS = {
  ordinary: "Ordinary",
  aircon: "Aircon",
  deluxe: "Deluxe",
  luxury: "Luxury",
};

export function busTypeLabel(busType) {
  return BUS_TYPE_LABELS[busType] ?? "—";
}

// True once a vehicle's CPC (or, if it has one, its CPC Extension of
// Validity) has passed - same "past today" rule bookings_insert_own and
// request_booking_change() enforce server-side (migration 0035); this
// copy is for UI display only; see also the version of it duplicated
// (with the same intent) client-side in dashboard.html's booking form.
export function vehicleCpcExpired(v, todayIso) {
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  const cpcExpired = v.cpc_validity && v.cpc_validity < today;
  const eovExpired = v.cpc_eov && v.cpc_eov_validity && v.cpc_eov_validity < today;
  return Boolean(cpcExpired || eovExpired);
}

// Shared by vehicles.html (operator) and vehicles-database.html (staff)
// for the "click a row to see the full card" detail dialog - one builder
// so the field list/order can't drift between the two. `operatorLabel`
// is only passed by the staff page (its own list is already scoped to
// one operator, so there's nothing to show there). Documents are filled
// in afterward by the caller - resolving their signed URLs is async and
// each page already has its own storage-bucket helper for that.
export function vehicleDetailsHtml(v, operatorLabel) {
  const rows = [
    operatorLabel != null ? ["Operator", escapeHtml(operatorLabel)] : null,
    ["Status", statusBadge(v.status)],
    ["LTFRB", ltfrbBadge(v.ltfrb_status)],
    ["Case No.", escapeHtml(v.case_number ?? "—")],
    ["MV File #", escapeHtml(v.mv_file_number ?? "—")],
    ["Chassis No.", escapeHtml(v.chassis_no ?? "—")],
    ["Franchise", escapeHtml(v.franchise ?? "—")],
    ["Sticker No.", escapeHtml(v.sticker_no ?? "—")],
    ["CPC validity", expiryCell(v.cpc_validity, escapeHtml)],
    [
      "CPC Extension of Validity",
      v.cpc_eov ? expiryCell(v.cpc_eov_validity, escapeHtml) : "No",
    ],
    ["OR/CR validity", expiryCell(v.orcr_validity, escapeHtml)],
    ["Route", escapeHtml(v.route ?? "—")],
    ["Origin", escapeHtml(v.origin ?? "—")],
    ["Destination", escapeHtml(v.destination ?? "—")],
    ["Body Number", escapeHtml(v.body_number ?? "—")],
    v.trade_name ? ["Trade Name", escapeHtml(v.trade_name)] : null,
    ["Year", escapeHtml(v.vehicle_year ?? "—")],
    ["Make", escapeHtml(v.vehicle_make ?? "—")],
    ["Bus type", busTypeLabel(v.bus_type)],
    ["Seating capacity", escapeHtml(v.seating_capacity ?? "—")],
    ["Seat configuration", escapeHtml(v.seat_type ?? "—")],
    ["Remarks", escapeHtml(v.remarks ?? "—")],
    v.rejection_reason ? ["Note", escapeHtml(v.rejection_reason)] : null,
  ].filter(Boolean);

  return `
    <div class="details-grid">
      ${rows
        .map(
          ([label, value]) =>
            `<div class="detail-item"><span class="detail-label">${escapeHtml(
              label
            )}</span><span class="detail-value">${value}</span></div>`
        )
        .join("")}
      <div class="detail-item detail-documents">
        <span class="detail-label">Documents</span>
        <span class="detail-value" id="details-documents">&hellip;</span>
      </div>
    </div>
  `;
}

// Shared by vehicles.html and vehicles-database.html - a notification
// (e.g. a CPC/OR-CR expiry alert) links here with ?vehicle=<id>
// (app.js's own notification click handler adds it). Call this after
// each render(), since the row it's looking for only exists once the
// table has actually painted. `openDetails` is page-specific (the
// operator and staff pages each have their own), so it's passed in
// rather than owned here.
export function applyVehicleHighlightFromQuery(openDetails) {
  const vehicleId = new URLSearchParams(location.search).get("vehicle");
  if (!vehicleId) return;
  const row = document.querySelector(`tr[data-vehicle-id="${CSS.escape(vehicleId)}"]`);
  if (!row) return;

  document
    .querySelectorAll("tr.row-highlighted")
    .forEach((r) => r.classList.remove("row-highlighted"));
  row.classList.add("row-highlighted");
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  openDetails(vehicleId);
}

