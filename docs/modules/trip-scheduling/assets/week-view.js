// Compact weekly view of confirmed trips, shared by the staff Schedule page
// and the operator My schedule page so the two can't drift apart.
//
// One matrix for the whole week: a row per departure time (only times that
// have a trip somewhere in the week), a column per day, Monday to Sunday.
// Each trip is a small chip: bus operator, trip code and destination; the
// rest (plate, gate/bay, status) is in the chip's tooltip and on the day view, one click away from any day's header.

import { addDays, escapeHtml, formatSlotStart } from "./app.js";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The Monday on or before an ISO date (weeks run Mon-Sun). */
export function weekStartISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d, 12).getDay(); // 0 = Sun
  return addDays(iso, -((dow + 6) % 7));
}

export function weekRangeLabel(startISO) {
  const fmt = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d, 12).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    });
  };
  const end = addDays(startISO, 6);
  return `${fmt(startISO)} - ${fmt(end)}, ${end.slice(0, 4)}`;
}

function chipHtml(b, mineId) {
  const cancelled = b.status === "cancelled";
  const tip = [
    b.operator_name, // chips truncate long names, so the full one lives here too
    formatSlotStart(b.slot),
    b.route,
    b.plate_no ? `Plate ${b.plate_no}` : "No plate yet",
    b.bays?.name,
    cancelled ? "Cancelled" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `<div class="week-trip${cancelled ? " is-cancelled" : ""}${
    mineId && b.operator_id === mineId ? " is-mine" : ""
  }" title="${escapeHtml(tip)}">
      <span class="week-trip-op">${escapeHtml(b.operator_name ?? "Operator")}</span>
      <span class="week-trip-code">${escapeHtml(b.trip_number ?? "—")}</span>
      <span class="week-trip-dest">${escapeHtml(b.route ?? "—")}</span>
    </div>`;
}

/**
 * @param host        element to render into
 * @param weekStart   ISO date of the Monday
 * @param bookings    rows with booking_date, slot, operator_name, trip_number,
 *                    status, and optionally route/plate_no/bays/operator_id
 * @param today       ISO date, to mark today's column
 * @param mineId      operator id to highlight (operator "All trips" view)
 * @param onOpenDay   called with an ISO date when a day header is clicked
 */
export function renderWeek(host, { weekStart, bookings, today, mineId, onOpenDay }) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // cell[slot][date] -> bookings
  const cells = new Map();
  const perDay = new Map(dates.map((d) => [d, 0]));
  for (const b of bookings) {
    if (!perDay.has(b.booking_date)) continue;
    if (!cells.has(b.slot)) cells.set(b.slot, new Map());
    const row = cells.get(b.slot);
    if (!row.has(b.booking_date)) row.set(b.booking_date, []);
    row.get(b.booking_date).push(b);
    if (b.status !== "cancelled") perDay.set(b.booking_date, perDay.get(b.booking_date) + 1);
  }
  const slots = [...cells.keys()].sort((a, b) => a - b);

  const head = dates
    .map((date, i) => {
      const n = perDay.get(date);
      return `<th class="week-col-head${date === today ? " is-today" : ""}">
        <button type="button" class="week-day-head" data-open-day="${date}"
          title="Open ${date} in the day view">
          <span class="week-day-name">${DAY_NAMES[i]}</span>
          <span class="week-day-num">${Number(date.slice(8))}</span>
          <span class="week-day-count">${n} trip${n === 1 ? "" : "s"}</span>
        </button>
      </th>`;
    })
    .join("");

  const body =
    slots.length === 0
      ? `<tr><td colspan="8" class="week-empty">No trips this week.</td></tr>`
      : slots
          .map((slot) => {
            const row = cells.get(slot);
            return `<tr>
        <th class="week-time" scope="row">${escapeHtml(formatSlotStart(slot))}</th>
        ${dates
          .map(
            (date) =>
              `<td class="week-cell${date === today ? " is-today" : ""}">${(row.get(date) ?? [])
                .map((b) => chipHtml(b, mineId))
                .join("")}</td>`
          )
          .join("")}
      </tr>`;
          })
          .join("");

  host.innerHTML = `
    <div class="week-scroll">
      <table class="week-matrix">
        <thead><tr><th class="week-corner">Time</th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  host.querySelectorAll("[data-open-day]").forEach((btn) => {
    btn.addEventListener("click", () => onOpenDay?.(btn.dataset.openDay));
  });
}
