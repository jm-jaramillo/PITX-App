// Terminal Operating System module helpers: the day snapshot, gate status
// rules, live refresh, formatting and the module's sidebar. Everything that is
// not specific to TOS lives in ../../../shared/platform.js and is re-exported
// here so pages keep a single import.
//
// Data comes only from the public.tos_* functions (see
// supabase/migrations/*_terminal-operating-system_init.sql). Trips and
// vehicles reach TOS through Trip Scheduling's feed functions; this module
// never queries Trip Scheduling's tables.

import { renderNav as renderShell, ICONS, supabase, escapeHtml } from "../../../shared/platform.js";
export * from "../../../shared/platform.js";

/* -------------------------------------------------------------------- nav */

const LINKS = [
  { href: "overview.html", label: "Overview", icon: ICONS.overview },
  { href: "gates.html", label: "Gate monitor", icon: ICONS.check },
  { href: "bays.html", label: "Bay timeline", icon: ICONS.bays },
  { href: "board.html", label: "Passenger board", icon: ICONS.calendar },
  { href: "feed.html", label: "Trip feed", icon: ICONS.bus },
  { href: "rules.html", label: "Devices & rules", icon: ICONS.building },
];

/** Sidebar for TOS pages (staff only). */
export function renderNav(profile) {
  renderShell(profile, { brand: "Terminal<br />Operations", links: LINKS });
}

/* ------------------------------------------------------------------- time */

// A trip's ETD is its Trip Scheduling slot start. Its bay window opens this
// many minutes earlier; the gate rules are measured from the window start.
export const BAY_WINDOW = 30;
// Boarding is announced this many minutes before ETD.
export const BOARDING = 15;

const pad = (n) => String(n).padStart(2, "0");

/** Minutes since the terminal day's midnight as "HH:MM" (24-hour, as on the gate screens). */
export function fmt(m) {
  if (m == null || Number.isNaN(m)) return "--:--";
  m = Math.floor(m);
  m = ((m % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** A stored timestamp in terminal (Manila) time, e.g. "Oct 28, 2026, 6:16 PM". */
export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/** Today's terminal (Manila) date as YYYY-MM-DD. */
export function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/* ---------------------------------------------------------------- snapshot */

/**
 * Turns a tos_snapshot() result into the model every page renders from.
 * Times become minutes since the day's Manila midnight; `now()` follows the
 * server clock.
 */
export function buildModel(s) {
  const dayStartMs = Date.parse(s.day_start);
  const offsetMs = Date.parse(s.now) - Date.now();
  const toMin = (t) => (t ? (Date.parse(t) - dayStartMs) / 60000 : null);
  const r = s.rules || {};

  const vehicles = {};
  (s.vehicles || []).forEach((v) => (vehicles[v.plate_no] = v));

  const trips = (s.trips || []).map((t) => ({
    id: t.booking_id,
    route: t.route,
    operatorId: t.operator_id,
    operator: t.operator_name,
    trade: t.trade_name,
    trip: t.trip_number,
    plate: t.plate_no,
    bay: t.bay_name || "—",
    bayId: t.bay_id,
    bayGate: t.bay_gate,
    dep: toMin(t.etd),
    slot: toMin(t.etd) - BAY_WINDOW,
    arrivedAt: toMin(t.arrived_at),
    departedAt: toMin(t.departed_at),
    held: !!t.held,
    denied: !!t.denied,
    isTest: !!t.is_test,
    // "commuter" or "provincial", from the TOS route list (Devices & rules).
    service: t.service === "commuter" ? "commuter" : "provincial",
  }));
  const byId = {};
  trips.forEach((t) => (byId[t.id] = t));

  const events = (s.events || []).map((e) => ({
    id: e.id,
    at: toMin(e.created_at),
    gate: e.gate_id,
    plate: e.plate,
    conf: Number(e.confidence),
    decision: e.decision,
    cat: e.category || "",
    reason: e.reason || "",
    bid: e.booking_id,
    trip: e.trip_number,
    route: e.route,
    pending: !!e.pending,
    resolution: e.resolution,
    resolvedAt: toMin(e.resolved_at),
    by: e.resolved_by_name,
    opened: !!e.barrier_opened,
    isTest: !!e.is_test,
    // Plate that was on the trip before staff swapped this bus onto it ("none" if it had none).
    swappedFrom: e.swapped_from,
    // Plate staff typed for the bus when swapping (may differ from the camera read).
    swappedTo: e.swapped_to,
    // Plate staff typed when deciding an unregistered or unclear read.
    confirmedPlate: e.confirmed_plate,
  }));

  const gates = {};
  (s.gates || []).forEach((g) => (gates[g.id] = { ...g, devices: [] }));
  const devices = (s.devices || []).map((d) => ({ ...d, hb: toMin(d.last_heartbeat) }));
  devices.forEach((d) => d.gate_id && gates[d.gate_id]?.devices.push(d));

  const date = s.date;
  return {
    date,
    isToday: date === manilaToday(),
    dayLabel: new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila", weekday: "short", day: "numeric", month: "short", year: "numeric",
    }),
    rules: {
      early: r.early_min, grace: r.grace_min, late: r.on_late, docs: r.on_expired,
      nobook: r.on_no_booking, unreg: r.on_unregistered, conf: r.min_confidence,
    },
    trips, byId, events, vehicles, gates, devices,
    bays: s.bays || [],
    now: () => (Date.now() + offsetMs - dayStartMs) / 60000,
    pending: () => events.filter((e) => e.pending),
  };
}

/* ------------------------------------------------------------- statuses */

export const STATUS_CLASS = {
  Booked: "s-sched",
  "No plate": "s-muted",
  Overdue: "s-warn",
  "In staging": "s-hold",
  "At gate · review": "s-hold",
  "Entered gate": "s-ok",
  "At bay": "s-ok",
  Boarding: "s-board",
  Departed: "s-done",
  "Denied entry": "s-bad",
  "No-show": "s-bad",
};

/** Where a trip stands, from what the gates have recorded. */
export function tripStatus(M, t, now = M.now()) {
  if (t.denied) return "Denied entry";
  if (t.departedAt != null) return "Departed";
  if (t.arrivedAt != null) {
    if (now >= t.dep - BOARDING) return "Boarding";
    return now - t.arrivedAt < 3 ? "Entered gate" : "At bay";
  }
  if (t.held) return "In staging";
  if (M.events.some((e) => e.pending && e.bid === t.id)) return "At gate · review";
  if (now > t.dep + 20) return "No-show";
  if (now > t.slot + M.rules.grace) return "Overdue";
  if (!t.plate) return "No plate";
  return "Booked";
}

export const pill = (text, cls) => `<span class="tos-pill ${cls}">${escapeHtml(text)}</span>`;
export const tripPill = (M, t) => {
  const s = tripStatus(M, t);
  return pill(s, STATUS_CLASS[s]);
};

const DECISION = {
  ALLOW: ["Allowed", "s-ok"],
  DENY: ["Denied", "s-bad"],
  HOLD: ["Held in staging", "s-hold"],
  REVIEW: ["Needs decision", "s-sched"],
  EXIT: ["Exited", "s-done"],
};

export function decisionLabel(e) {
  if (e.resolution === "ALLOWED" && e.swappedFrom) return `Plate swapped by ${e.by || "staff"}`;
  if (e.resolution) return `${e.resolution === "ALLOWED" ? "Allowed" : "Denied"} by ${e.by || "staff"}`;
  if (e.decision === "ALLOW" && e.cat === "Early") return "Released";
  return (DECISION[e.decision] || [e.decision])[0];
}

export function decisionPill(e) {
  const cls = e.resolution
    ? e.resolution === "ALLOWED" ? "s-ok" : "s-bad"
    : (DECISION[e.decision] || [null, "s-done"])[1];
  return pill(decisionLabel(e), cls) + (e.isTest ? ` ${pill("Test", "s-muted")}` : "");
}

export const plateChip = (M, plate) =>
  plate
    ? `<span class="tos-plate${M.vehicles[plate] ? "" : " is-unknown"}">${escapeHtml(plate)}</span>`
    : `<span class="tos-plate is-missing">No plate</span>`;

export function docsExpired(v, date) {
  return !!v && ((v.cpc_validity && v.cpc_validity < date) || (v.orcr_validity && v.orcr_validity < date));
}

/* ------------------------------------------------- substitute buses */

/**
 * Trips a bus held as "Substitute bus" could be swapped onto: same operator
 * and destination as the vehicle, not yet in, entry window open or overdue.
 * Mirrors tos.substitute_trips() in the database, which re-checks on swap.
 */
export function substituteTrips(M, e, now = M.now()) {
  const v = M.vehicles[e.plate];
  if (!v) return [];
  return M.trips
    .filter((t) => t.operatorId === v.operator_id && t.route === v.route && t.plate !== e.plate)
    .filter((t) => t.arrivedAt == null && !t.denied && t.dep >= now - 60 && t.slot - M.rules.early <= now)
    .sort((a, b) => Math.abs(a.slot - now) - Math.abs(b.slot - now));
}

/**
 * The swap form staff have open, kept here so a page refresh redraws it with
 * what they typed. Only one is open at a time.
 */
export const swapDraft = { event: null, trip: null, plate: "" };

/** True while staff are typing a plate, so pages hold off redrawing that card. */
export function swapFormActive() {
  return swapDraft.event != null && !!document.activeElement?.closest?.("[data-swap-form]");
}

/**
 * Buttons for a read waiting on staff. A substitute bus gets one "Swap onto"
 * button per candidate trip; choosing one asks for the plate number on the
 * bus before anything changes (Trip Scheduling's staff_set_booking_plate then
 * checks the swap). Anything else gets Open barrier.
 */
export function reviewActionsHtml(M, e, busy = false) {
  const off = busy ? " disabled" : "";
  const keep = `<button type="button" class="btn-danger-outline" data-act="deny" data-id="${e.id}" data-plate="${escapeHtml(e.plate)}"${off}>Keep closed</button>`;
  if (e.cat === "Unregistered vehicle" || e.cat === "Unclear plate read") {
    // Either way staff decide, they record the plate actually on the bus.
    const inputId = `confirm-plate-${e.id}`;
    const value = swapDraft.event === e.id && swapDraft.trip == null ? swapDraft.plate : "";
    return `<form class="tos-swap" data-swap-form data-mode="confirm" data-id="${e.id}">
        <label for="${inputId}">Plate number on the bus</label>
        <div class="tos-swap-row">
          <input id="${inputId}" name="plate" required autocomplete="off" spellcheck="false" maxlength="12"
            placeholder="Type the plate, e.g. ${escapeHtml(e.plate)}" value="${escapeHtml(value)}"${off} />
          <button type="submit" name="decision" value="allow" class="btn-primary"${off}>Let in</button>
          <button type="submit" name="decision" value="deny" class="btn-danger-outline"${off}>Keep closed</button>
        </div>
        <p class="subtle">Camera read <b>${escapeHtml(e.plate)}</b>. Required for the gate record either way. If the plate is a registered bus with a trip today, letting it in records the arrival on that trip.</p>
      </form>`;
  }
  if (e.cat !== "Substitute bus") {
    return `<button type="button" class="btn-primary" data-act="allow" data-id="${e.id}" data-plate="${escapeHtml(e.plate)}"${off}>Open barrier</button>${keep}`;
  }
  const trips = substituteTrips(M, e);
  if (!trips.length) {
    return `<span class="subtle" style="align-self:center">No trip of this operator is due any more.</span>${keep}`;
  }
  const label = (t) => `${t.trip || t.route} · ${fmt(t.dep)}`;
  const open = trips.find((t) => swapDraft.event === e.id && swapDraft.trip === t.id);
  if (open) {
    const inputId = `swap-plate-${e.id}`;
    return `<form class="tos-swap" data-swap-form data-id="${e.id}" data-trip="${escapeHtml(open.id)}" data-label="${escapeHtml(open.trip || open.route)}">
        <label for="${inputId}">Plate number on the bus for ${escapeHtml(label(open))}</label>
        <div class="tos-swap-row">
          <input id="${inputId}" name="plate" required autocomplete="off" spellcheck="false" maxlength="12"
            placeholder="Type the plate, e.g. ${escapeHtml(e.plate)}" value="${escapeHtml(swapDraft.plate)}"${off} />
          <button type="submit" class="btn-primary"${off}>Swap and open barrier</button>
          <button type="button" class="btn-outline" data-act="swap-cancel"${off}>Cancel</button>
        </div>
        <p class="subtle">Camera read <b>${escapeHtml(e.plate)}</b>. ${
          open.plate ? `The trip is booked with ${escapeHtml(open.plate)}.` : "The trip has no plate yet."
        } The plate you type replaces it in Trip Scheduling.</p>
      </form>`;
  }
  return (
    trips
      .map(
        (t) => `<button type="button" class="btn-primary" data-act="swap-open" data-id="${e.id}" data-trip="${escapeHtml(t.id)}"${off}>Swap onto ${escapeHtml(
          label(t)
        )}${t.plate ? ` (was ${escapeHtml(t.plate)})` : " (no plate)"}</button>`
      )
      .join("") + keep
  );
}

/**
 * Wires the plate forms on a page: the substitute-bus swap form (open, type,
 * cancel, submit) and the plate confirmation on unregistered / unclear reads.
 * `onSwap({ event, trip, plate, label })` performs a swap,
 * `onConfirm({ event, plate, allow })` a confirmation; both resolve truthy on
 * success. `rerender()` redraws the page.
 */
export function handleSwapForms({ onSwap, onConfirm, rerender }) {
  let swapping = false;
  document.addEventListener("click", (e) => {
    const open = e.target.closest('[data-act="swap-open"]');
    if (open && !open.disabled) {
      Object.assign(swapDraft, { event: Number(open.dataset.id), trip: open.dataset.trip, plate: "" });
      rerender();
      document.querySelector("[data-swap-form] input")?.focus();
    } else if (e.target.closest('[data-act="swap-cancel"]')) {
      Object.assign(swapDraft, { event: null, trip: null, plate: "" });
      rerender();
    }
  });
  document.addEventListener("input", (e) => {
    const form = e.target.closest("[data-swap-form]");
    if (!form) return;
    if (form.dataset.mode === "confirm") Object.assign(swapDraft, { event: Number(form.dataset.id), trip: null });
    swapDraft.plate = e.target.value.toUpperCase();
  });
  document.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-swap-form]");
    if (!form) return;
    e.preventDefault();
    if (swapping) return;
    const typed = form.querySelector("input")?.value ?? swapDraft.plate;
    const plate = typed.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (plate.length < 2) {
      toast("Type the plate number shown on the bus.");
      form.querySelector("input")?.focus();
      return;
    }
    swapping = true;
    const done = await (form.dataset.mode === "confirm"
      ? onConfirm({ event: Number(form.dataset.id), plate, allow: e.submitter?.value === "allow" })
      : onSwap({ event: Number(form.dataset.id), trip: form.dataset.trip, plate, label: form.dataset.label })
    ).finally(() => (swapping = false));
    if (done) Object.assign(swapDraft, { event: null, trip: null, plate: "" });
    rerender();
  });
}

/* --------------------------------------------------- expected at the gates */

/**
 * What the gate will make of a booked trip's bus when it arrives, judged
 * from Trip Scheduling's data before any camera read: [label, class, ready].
 */
export function gateReadiness(M, t) {
  if (!t.plate) return ["No plate assigned", "s-bad", false];
  const v = M.vehicles[t.plate];
  if (!v) return ["Plate not in masterfile", "s-bad", false];
  if (docsExpired(v, M.date)) return ["Documents expired", "s-bad", false];
  return ["Ready", "s-ok", true];
}

/**
 * Approved trips whose bus has not reached the gate yet: overdue ones first
 * (up to 20 minutes past ETD), then those whose bay window opens within
 * `horizon` minutes.
 */
export function expectedTrips(M, horizon = 120, now = M.now()) {
  return M.trips
    .filter((t) => t.arrivedAt == null && t.departedAt == null && !t.denied)
    .filter((t) => t.dep >= now - 20 && t.slot <= now + horizon)
    .sort((a, b) => a.slot - b.slot);
}

/** "Expected at the gates" panel body: a table, or an empty note. */
export function expectedHtml(M, { horizon = 120, limit = 12 } = {}) {
  const now = M.now();
  const rows = expectedTrips(M, horizon, now);
  if (!rows.length) {
    const next = M.trips.find((t) => t.arrivedAt == null && !t.denied && t.slot > now + horizon);
    return `<p class="tos-none">${
      M.trips.length === 0
        ? "No approved trips in Trip Scheduling for today."
        : next
          ? `No buses due in the next ${horizon / 60} hours. Next bay window opens ${fmt(next.slot)}.`
          : "No more buses due today."
    }</p>`;
  }
  const notReady = rows.filter((t) => !gateReadiness(M, t)[2]).length;
  return `
    ${notReady ? `<p class="tos-note" style="margin:12px 16px 0">${notReady} of ${rows.length} cannot be matched by the gate camera yet. Fix them in Trip Scheduling before the bus arrives.</p>` : ""}
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Bay window</th><th>Trip</th><th>Plate</th><th>Bay</th><th>Gate check</th><th>Status</th></tr></thead>
      <tbody>${rows
        .slice(0, limit)
        .map((t) => {
          const [label, cls] = gateReadiness(M, t);
          return `<tr class="row-clickable" data-act="trip" data-id="${escapeHtml(t.id)}">
            <td class="tos-num">${fmt(t.slot)}<span class="cell-sub">ETD ${fmt(t.dep)}</span></td>
            <td><span class="cell-strong">${escapeHtml(t.route)}</span><span class="cell-sub">${escapeHtml(t.trip ?? "")} · ${escapeHtml(t.trade || t.operator || "")}</span></td>
            <td>${plateChip(M, t.plate)}</td>
            <td>${t.bayId ? `<span class="bay-tag">${escapeHtml(t.bay)}</span>${t.bayGate ? `<span class="cell-sub">${escapeHtml(t.bayGate)}</span>` : ""}` : '<span class="muted">No bay</span>'}</td>
            <td>${pill(label, cls)}</td>
            <td>${tripPill(M, t)}</td>
          </tr>`;
        })
        .join("")}</tbody></table></div>
    ${rows.length > limit ? `<p class="tos-none" style="padding-top:8px">and ${rows.length - limit} more. See the Bay timeline.</p>` : ""}`;
}

/* ------------------------------------------------------------ live data */

/**
 * Loads the snapshot for `getDate()` now and every 20 seconds while the tab
 * is visible, calling onData(model) / onError(error). Returns { refresh }.
 */
export function startLive({ getDate = () => null, onData, onError, intervalMs = 20000 }) {
  let inflight = null;
  async function refresh() {
    if (inflight) return inflight;
    inflight = (async () => {
      const { data, error } = await supabase.rpc("tos_snapshot", { p_date: getDate() });
      if (error) onError?.(error);
      else onData(buildModel(data), new Date());
    })().finally(() => (inflight = null));
    return inflight;
  }
  setInterval(() => document.visibilityState === "visible" && refresh(), intervalMs);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());
  refresh();
  return { refresh };
}

/** "Live · updated 18:16:21" next to a page title. */
export function liveText(at, error) {
  const t = at
    ? at.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "";
  if (error) return `<span class="tos-live is-error"><i></i>${at ? `Not updating · last ${t}` : "Could not load"}</span>`;
  return `<span class="tos-live${at ? " is-on" : ""}"><i></i>${at ? `Live · updated ${t}` : "Loading"}</span>`;
}

/** Short-lived message at the bottom of the page. */
export function toast(text) {
  let el = document.getElementById("tos-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "tos-toast";
    el.className = "tos-toast hidden";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), 3200);
}

/** Calls a tos_* function, toasting the outcome. Resolves with data or null. */
export async function act(fn, args, okText) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    toast(error.message || "The change was not saved.");
    return null;
  }
  if (okText) toast(typeof okText === "function" ? okText(data) : okText);
  return data;
}
