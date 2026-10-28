// Seat layouts for the bus types in "PTX. OPS. Seat Configuration"
// (2026-10-27), keyed by seating capacity.
//
// Each layout is a grid read straight off the diagram: `top` and
// `bottom` are the two sides of the aisle, listed in diagram order, one
// array per seat row, one entry per seat position from the front of the
// bus to the back. A number is that seat; null is no seat (door, stairs,
// or the unused third position of a 2x3 bus outside its back bench).
// Seats are numbered front-to-back, a column at a time, exactly as on
// the paper diagram - so seat 1 here is seat 1 in the ticketing system.
//
// The capacities listed here must match the seat_layouts table seeded in
// supabase/migrations/0051_passenger_seat_selection.sql.
export const SEAT_LAYOUTS = {"26":{"config":"2x1","top":[[1,4,7,null,null,14,17,20,23],[null,null,null,null,null,null,null,null,24]],"bottom":[[2,5,8,10,12,15,18,21,25],[3,6,9,11,13,16,19,22,26]]},"36":{"config":"2x1","top":[[1,4,7,10,13,16,19,22,25,28,31,34]],"bottom":[[2,5,8,11,14,17,20,23,26,29,32,35],[3,6,9,12,15,18,21,24,27,30,33,36]]},"45":{"config":"2x2","top":[[1,5,9,13,17,21,25,29,33,37,41],[2,6,10,14,18,22,26,30,34,38,42],[null,null,null,null,null,null,null,null,null,null,43]],"bottom":[[3,7,11,15,19,23,27,31,35,39,44],[4,8,12,16,20,24,28,32,36,40,45]]},"49":{"config":"2x2","top":[[1,5,9,13,17,21,25,29,33,37,41,45],[2,6,10,14,18,22,26,30,34,38,42,46],[null,null,null,null,null,null,null,null,null,null,null,47]],"bottom":[[3,7,11,15,19,23,27,31,35,39,43,48],[4,8,12,16,20,24,28,32,36,40,44,49]]},"53":{"config":"2x2","top":[[1,5,9,13,17,21,25,29,33,37,41,45,49],[2,6,10,14,18,22,26,30,34,38,42,46,50],[null,null,null,null,null,null,null,null,null,null,null,null,51]],"bottom":[[3,7,11,15,19,23,27,31,35,39,43,47,52],[4,8,12,16,20,24,28,32,36,40,44,48,53]]},"61":{"config":"2x3","top":[[1,6,11,16,21,26,31,36,41,46,51,56],[2,7,12,17,22,27,32,37,42,47,52,57],[null,null,null,null,null,null,null,null,null,null,null,58]],"bottom":[[3,8,13,18,23,28,33,38,43,48,53,59],[4,9,14,19,24,29,34,39,44,49,54,60],[5,10,15,20,25,30,35,40,45,50,55,61]]},"63":{"config":"2x3","top":[[1,3,8,13,18,23,28,33,38,43,48,53,58],[2,4,9,14,19,24,29,34,39,44,49,54,59],[null,null,null,null,null,null,null,null,null,null,null,null,60]],"bottom":[[null,5,10,15,20,25,30,35,40,45,50,55,61],[null,6,11,16,21,26,31,36,41,46,51,56,62],[null,7,12,17,22,27,32,37,42,47,52,57,63]]},"66":{"config":"2x3","top":[[1,6,11,16,21,26,31,36,41,46,51,56,61],[2,7,12,17,22,27,32,37,42,47,52,57,62],[null,null,null,null,null,null,null,null,null,null,null,null,63]],"bottom":[[3,8,13,18,23,28,33,38,43,48,53,58,64],[4,9,14,19,24,29,34,39,44,49,54,59,65],[5,10,15,20,25,30,35,40,45,50,55,60,66]]}};

export const SEAT_LAYOUT_CAPACITIES = Object.keys(SEAT_LAYOUTS).map(Number);

export function hasSeatLayout(capacity) {
  return Object.hasOwn(SEAT_LAYOUTS, String(capacity));
}

const STEERING =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M3.5 10.5L10 12M20.5 10.5L14 12M12 14v7"/></svg>';

/**
 * Draws a seat map into `host`, front of the bus at the top (the diagrams
 * are drawn sideways; this is the same layout turned to read down a
 * phone screen, driver at top-left).
 *
 * `states` maps seat number -> { state, title } where state is one of
 * "available" | "selected" | "held" | "blocked". Anything but "available"
 * and "selected" is not clickable for a passenger; pass
 * `interactive: false` for a read-only view (the ticketing admin's).
 * `onToggle(seatNo)` fires when an available/selected seat is tapped.
 */
export function renderSeatMap(host, capacity, { states = new Map(), onToggle, interactive = true } = {}) {
  const layout = SEAT_LAYOUTS[String(capacity)];
  if (!layout) {
    host.innerHTML = '<p class="fineprint">No seat map is configured for this bus.</p>';
    return;
  }
  const cols = layout.top[0].length;
  // Turned a quarter-turn clockwise the diagram's bottom rows land on the
  // left (outermost seat first), then the aisle, then the top rows.
  const left = [...layout.bottom].reverse();
  const right = [...layout.top].reverse();
  const gridCols = `repeat(${left.length}, var(--seat)) var(--aisle) repeat(${right.length}, var(--seat))`;

  const cell = (n) => {
    if (n == null) return '<span class="seat seat-none" aria-hidden="true"></span>';
    const s = states.get(n) ?? { state: "available" };
    const clickable = interactive && (s.state === "available" || s.state === "selected");
    const label = `Seat ${n}, ${s.state === "held" ? "reserved, awaiting ticketing" : s.state}`;
    return `<button type="button" class="seat seat-${s.state}" data-seat="${n}" ${clickable ? "" : "disabled"} aria-pressed="${s.state === "selected"}" aria-label="${label}"${s.title ? ` title="${s.title.replace(/"/g, "&quot;")}"` : ""}><span>${n}</span></button>`;
  };

  let rows = "";
  for (let c = 0; c < cols; c++) {
    rows +=
      left.map((r) => cell(r[c])).join("") +
      '<span class="seat-aisle" aria-hidden="true"></span>' +
      right.map((r) => cell(r[c])).join("");
  }

  host.innerHTML = `
    <div class="seatmap" style="--seat-cols: ${gridCols}">
      <div class="seatmap-front"><span class="seatmap-wheel" title="Driver">${STEERING}</span><span>Front</span></div>
      <div class="seatmap-grid" style="grid-template-columns: ${gridCols}">${rows}</div>
      <div class="seatmap-back">Back</div>
    </div>`;

  if (interactive && onToggle) {
    host.querySelector(".seatmap-grid").addEventListener("click", (e) => {
      const btn = e.target.closest("button.seat");
      if (btn && !btn.disabled) onToggle(Number(btn.dataset.seat));
    });
  }
}
