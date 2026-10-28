// Platform core shared by every PITX module (Trip Scheduling, Ticketing, ...).
//
// Owns the Supabase client, sign-in/session, role guard, the sidebar + topbar
// shell, notifications and small UI helpers. Module code lives under
// docs/modules/<module>/ and imports this file; this file must never import
// from a module. Row Level Security is the real access-control boundary -
// client-side role checks only decide what UI to show.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { modulesFor } from "./modules.js";

// docs/ root and the shared logo, resolved from this file so they work from
// any module depth.
const ROOT_URL = new URL("../", import.meta.url);
const LOGO_URL = new URL("./pitx-logo.webp", import.meta.url).href;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Supabase Auth needs an email; accounts here log in with a username. */
const USERNAME_DOMAIN = "pitx.local";

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
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

/** Everyone lands on the module portal (the site home, index.html); signed out goes to login. */
export function landingFor(profile) {
  return new URL(profile ? "index.html" : "login.html", ROOT_URL).href;
}

/**
 * Enforces that a signed-in user with the required role is viewing this
 * page. Redirects to login (or to the user's landing page) when not, and
 * resolves with the profile when the page may proceed.
 */
export async function guardPage(requiredRole) {
  const profile = await getProfile();

  if (!profile) {
    location.replace(new URL("login.html", ROOT_URL).href);
    return null;
  }
  if (profile.role !== requiredRole) {
    location.replace(landingFor(profile));
    return null;
  }
  return profile;
}

export async function signOut() {
  await supabase.auth.signOut();
  location.replace(new URL("login.html", ROOT_URL).href);
}

/* -------------------------------------------------------------------- nav */

export const ICONS = {
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

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

/**
 * Renders the sidebar + topbar into <aside id="nav">. A module passes its own
 * brand label and sidebar links ({ href, label, icon }); links are relative to
 * the current page.
 */
export function renderNav(profile, { brand = "PITX", links = [] } = {}) {
  const host = document.getElementById("nav");
  if (!host) return;

  const here = location.pathname.split("/").pop() || "index.html";
  const mods = modulesFor(profile.role);
  const allModules =
    mods.length > 1
      ? `<a href="${new URL("index.html", ROOT_URL).href}"><span class="icon">${ICONS.overview}</span>All modules</a>`
      : "";
  const displayName = profile.operator_name || profile.username;

  host.innerHTML = `
    <div class="sidebar-brand">
      <a href="${new URL("index.html", ROOT_URL).href}" class="brand-link" aria-label="PITX modules"><img src="${LOGO_URL}" alt="PITX" /></a>
      <span class="unit">${brand}</span>
    </div>
    <nav class="sidebar-links">
      ${allModules}
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
