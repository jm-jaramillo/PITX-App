// Shared helpers for the static PITX bus bay booking pages.
//
// Each page is a plain HTML document that imports this module, calls
// `guardPage()` to enforce auth/role, then renders itself by querying
// Supabase directly from the browser. Row Level Security is the real
// access-control boundary - these client-side role checks only decide what
// UI to show, and a tampered client still can't read or write anything RLS
// forbids.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Supabase Auth needs an email; accounts here log in with a username. */
const USERNAME_DOMAIN = "pitx.local";

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
}

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

/* ------------------------------------------------------------------ auth */

export async function getProfile() {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, role, operator_name, created_at")
    .eq("id", userData.user.id)
    .single();

  return profile ?? null;
}

/**
 * Enforces that a signed-in user with the required role is viewing this
 * page. Redirects to login (or to the other role's home) when not, and
 * resolves with the profile when the page may proceed.
 */
/** Where each role lands after login / when sent away from a page. */
export function homeFor(role) {
  if (role === "staff") return "overview.html";
  if (role === "ticketing") return "ticketing.html";
  return "operator-overview.html";
}

export async function guardPage(requiredRole) {
  const profile = await getProfile();

  if (!profile) {
    location.replace("index.html");
    return null;
  }
  if (profile.role !== requiredRole) {
    location.replace(homeFor(profile.role));
    return null;
  }
  return profile;
}

export async function signOut() {
  await supabase.auth.signOut();
  location.replace("index.html");
}

/* -------------------------------------------------------------------- nav */

// "My requests" and "History" (dashboard.html / request-history.html)
// used to be separate sidebar entries; they're now a toggle on My
// schedule (moved there 2 Sep, after living on operator-overview.html
// as tabs - #91 - and then a toggle under Overview), so they no longer
// get their own sidebar link. Both URLs still work - they're now thin
// redirects into the right My schedule tab - for old bookmarks and the
// notification links this app already writes.
const ICONS = {
  "overview": "<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/></svg>",
  "calendar": "<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M8 3v4M16 3v4M3 10h18\"/></svg>",
  "bus": "<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"4\" y=\"3\" width=\"16\" height=\"15\" rx=\"2\"/><path d=\"M4 11h16M8 21v-3M16 21v-3\"/><circle cx=\"8\" cy=\"14.5\" r=\".6\"/><circle cx=\"16\" cy=\"14.5\" r=\".6\"/></svg>",
  "building": "<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"5\" y=\"3\" width=\"14\" height=\"18\" rx=\"1.5\"/><path d=\"M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4\"/></svg>",
  "check": "<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8 12.5l2.7 2.7L16 9.5\"/></svg>",
  "chart": "<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 20V10M10 20V4M16 20v-8M22 20H2\"/></svg>",
  "bays": "<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M9 16V8h3.2a2.2 2.2 0 010 4.4H9\"/></svg>",
  "users": "<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"9\" cy=\"8\" r=\"3.2\"/><path d=\"M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.3a3.2 3.2 0 010 5.4M18 14.8c2 .6 3.5 2.3 3.5 5.2\"/></svg>",
  "user": "<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"8\" r=\"3.5\"/><path d=\"M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6\"/></svg>"
};

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

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export function renderNav(profile) {
  const host = document.getElementById("nav");
  if (!host) return;

  const links =
    profile.role === "staff"
      ? STAFF_LINKS
      : profile.role === "ticketing"
        ? TICKETING_LINKS
        : OPERATOR_LINKS;
  const here = location.pathname.split("/").pop() || "index.html";
  const displayName = profile.operator_name || profile.username;

  host.innerHTML = `
    <div class="sidebar-brand">
      <img src="assets/pitx-logo.webp" alt="PITX" />
      <span class="unit">Trip<br />Scheduling</span>
    </div>
    <nav class="sidebar-links">
      ${links
        .map(
          (l) =>
            `<a href="${l.href}"${
              l.href === here ? ' aria-current="page"' : ""
            }><span class="icon">${l.icon}</span>${escapeHtml(l.label)}</a>`
        )
        .join("")}
    </nav>
  `;

  // The topbar isn't part of any page's static markup - it's injected
  // here so every page picks it up for free the same way it already did
  // with the old single <header id="nav">.
  const content = host.nextElementSibling; // .app-content
  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button type="button" class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle menu">&#9776;</button>
    <div class="topbar-right">
      <div class="notif-wrap">
        <button type="button" class="notif-bell" id="notif-bell" aria-label="Notifications">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 17V11a6 6 0 1112 0v6l1.5 2h-15zM10 21h4"/></svg><span class="notif-badge hidden" id="notif-badge">0</span>
        </button>
        <div class="notif-panel hidden" id="notif-panel"></div>
      </div>
      <details class="row-menu account-menu">
        <summary class="avatar-btn" aria-label="Account">${escapeHtml(initials(displayName))}</summary>
        <div class="row-menu-pop account-pop">
          <p class="account-name">${escapeHtml(displayName)}</p>
          <p class="account-role">${escapeHtml(profile.role)}</p>
          <button type="button" class="btn-outline" id="sign-out">Sign out</button>
        </div>
      </details>
    </div>
  `;
  content?.insertBefore(topbar, content.firstChild);

  // Starts collapsed on a narrow viewport (phones/small tablets) so it
  // doesn't cover the page on load; the toggle button flips the same
  // class open from there. Desktop starts expanded.
  if (window.innerWidth < 860) host.classList.add("is-collapsed");

  tidyPageHead();
  document.getElementById("sign-out").addEventListener("click", signOut);
  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    host.classList.toggle("is-collapsed");
  });
  initNotifications(profile);
}

/* --------------------------------------------------------- notifications */

const NOTIF_LIMIT = 30;

// Relative "3h ago" / "2d ago" style timestamp - notifications are the
// one place in the app that benefits from this over a plain date/time,
// since "how long has this been waiting" is the actual question.
function relativeTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Wired into renderNav() so every page gets the bell for free. Not
// awaited by renderNav itself - the nav renders synchronously, this
// fills in the badge/panel once the query comes back.
async function initNotifications(profile) {
  const bell = document.getElementById("notif-bell");
  const panel = document.getElementById("notif-panel");
  const badge = document.getElementById("notif-badge");
  if (!bell || !panel || !badge) return;

  // Best-effort - if these fail (e.g. offline), the panel just shows
  // whatever notifications already exist rather than blocking on it.
  //
  // This app has no scheduled server-side execution, so anything that
  // becomes true with the passage of time rather than in response to an
  // event gets synced here, on nav render. All three are idempotent
  // (ON CONFLICT DO NOTHING / a WHERE that stops matching once applied),
  // so running them on every page load is cheap and never duplicates.
  try {
    await Promise.all([
      // Vehicle CPC / OR-CR approaching expiry (migration 0024).
      supabase.rpc("sync_expiry_notifications"),
      // Approved trip tomorrow-or-today with no vehicle assigned (0045).
      supabase.rpc("sync_plate_missing_notifications"),
      // Pending requests whose date has passed - staff-only, since it
      // writes to other operators' rows and only matters to the queue
      // it's clearing (0045).
      profile.role === "staff"
        ? supabase.rpc("expire_stale_pending_bookings")
        : Promise.resolve(),
    ]);
  } catch {
    /* ignore - see comment above */
  }

  let query = supabase
    .from("notifications")
    .select("id, type, title, body, link, related_table, related_id, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(NOTIF_LIMIT);
  query =
    profile.role === "staff" || profile.role === "ticketing"
      ? query.eq("recipient_role", profile.role).or(`recipient_id.is.null,recipient_id.eq.${profile.id}`)
      : query.eq("recipient_role", "operator").eq("recipient_id", profile.id);

  const { data } = await query;
  const notifications = data ?? [];
  renderNotifPanel(notifications);

  bell.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== bell) panel.classList.add("hidden");
  });

  function renderNotifPanel(items) {
    const unreadCount = items.filter((n) => !n.is_read).length;
    badge.textContent = String(unreadCount);
    badge.classList.toggle("hidden", unreadCount === 0);

    panel.innerHTML =
      items.length === 0
        ? `<p class="notif-empty">No notifications yet.</p>`
        : `
          <div class="notif-panel-head">
            <span>Notifications</span>
            ${unreadCount > 0 ? `<button type="button" class="btn-link" id="notif-mark-all">Mark all read</button>` : ""}
          </div>
          <div class="notif-list">
            ${items
              .map(
                (n) => `
                  <button type="button" class="notif-item${n.is_read ? "" : " is-unread"}" data-notif="${escapeHtml(n.id)}" data-link="${escapeHtml(n.link ?? "")}" data-related-table="${escapeHtml(n.related_table ?? "")}" data-related-id="${escapeHtml(n.related_id ?? "")}">
                    <span class="notif-title">${escapeHtml(n.title)}</span>
                    ${n.body ? `<span class="notif-body">${escapeHtml(n.body)}</span>` : ""}
                    <span class="notif-time">${relativeTime(n.created_at)}</span>
                  </button>
                `
              )
              .join("")}
          </div>
        `;

    document.getElementById("notif-mark-all")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
      await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
      items.forEach((n) => (n.is_read = true));
      renderNotifPanel(items);
    });

    panel.querySelectorAll("[data-notif]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.notif;
        const link = btn.dataset.link;
        const relatedTable = btn.dataset.relatedTable;
        const relatedId = btn.dataset.relatedId;
        await supabase.from("notifications").update({ is_read: true }).eq("id", id);
        if (!link) return;
        // vehicles.html / vehicles-database.html both know to read this
        // param on load: scroll that row into view, highlight it, and
        // open its details card - so a CPC/OR-CR expiry notification (or
        // any other vehicle notification) lands you on the exact vehicle
        // rather than just the page.
        const url =
          relatedTable === "vehicles" && relatedId
            ? `${link}?vehicle=${encodeURIComponent(relatedId)}`
            : link;
        location.href = url;
      });
    });
  }
}

/* ----------------------------------------------------------------- render */

/** Escapes text before it goes anywhere near innerHTML. */
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch]
  );
}

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

/**
 * Runs a Supabase select to completion, paging past PostgREST's default
 * 1,000-row response cap.
 *
 * That cap is silent - a query matching 3,000 rows returns 1,000 with no
 * error and no flag - which is exactly how the bay-conflict bug in #86
 * survived: staff.html fetched "every approved booking" and quietly got
 * only the oldest 1,000, so its taken-bay set was empty for every date
 * that mattered. Any list that grows with usage has to page rather than
 * assume one round trip is the whole answer.
 *
 * Pass a function that takes (from, to) and returns the ranged query, so
 * this can re-issue it per page:
 *
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from("bookings").select("id, slot").range(from, to)
 *   );
 *
 * Returns { data, error } like a normal Supabase call - `data` is every
 * row across all pages, or null if any page errored.
 */
export async function fetchAllRows(buildQuery, pageSize = 1000) {
  const all = [];
  let from = 0;

  for (;;) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) return { data: null, error };

    all.push(...(data ?? []));
    // A short page means this was the last one. An exactly-full page is
    // ambiguous, so it costs one more (empty) request to be sure.
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return { data: all, error: null };
}

export function showMessage(id, text, kind = "error") {
  const el = document.getElementById(id);
  if (!el) return;
  if (!text) {
    el.className = "hidden";
    el.textContent = "";
    return;
  }
  el.className = `msg msg-${kind === "ok" ? "ok" : "error"}`;
  el.textContent = text;
}

/* ---------------------------------------------------------------- export */

// One field, RFC-4180 quoted only when it needs to be (contains a comma,
// quote, or newline) - quoting everything unconditionally still works in
// every spreadsheet app but reads noisier than necessary for the common
// case of plain text/numbers.
function csvField(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Builds a CSV string from column headers + row arrays and triggers a
// browser download - used by every staff table page's "Export CSV"
// button. A leading UTF-8 BOM makes Excel (which otherwise guesses the
// system codepage) read accented characters like "Biñan" correctly
// instead of mangling them.
export function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map((row) =>
    row.map(csvField).join(",")
  );
  const csv = "﻿" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


/* ------------------------------------------------------- minimal chrome */

// Every page opened with a small-caps label, a title and a sentence of help.
// The label goes (CSS hides .eyebrow) and the static sentence hides behind a
// small "?" next to the title - still there, one tap away. Dynamic notes
// (those with an id, e.g. "N awaiting review") are left alone.
export function tidyPageHead() {
  const head = document.querySelector(".page-head");
  const h1 = head?.querySelector("h1");
  const help = head?.querySelector("p.subtle:not([id])");
  if (!h1 || !help || h1.querySelector(".help-dot")) return;
  help.classList.add("page-help", "hidden");
  const dot = document.createElement("button");
  dot.type = "button";
  dot.className = "help-dot";
  dot.textContent = "?";
  dot.setAttribute("aria-label", "About this page");
  dot.addEventListener("click", () => help.classList.toggle("hidden"));
  h1.append(" ", dot);
}

// One shared close-on-outside-click for every "..." menu (<details class="row-menu">).
document.addEventListener("click", (e) => {
  document.querySelectorAll("details.row-menu[open]").forEach((d) => {
    if (!d.contains(e.target)) d.removeAttribute("open");
  });
});
