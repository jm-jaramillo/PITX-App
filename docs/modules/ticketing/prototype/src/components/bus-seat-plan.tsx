"use client";

import type { SeatLayout } from "@/lib/seat-layouts";

// The passenger's seat plan, like a cinema's: the bus seen from above, front at the top.
// PH buses are left-hand drive, so the driver side (layout positions 3 to 5) is on the
// left and the door side (positions 0 and 1) on the right.

const LEGEND = [
  { label: "Available", className: "border-slate-300 bg-white" },
  { label: "Your pick", className: "border-brand bg-brand" },
  { label: "Taken", className: "border-slate-300 bg-slate-300" },
  { label: "Being booked", className: "border-sky-300 bg-sky-100" },
  { label: "Not for sale", className: "border-amber-300 bg-amber-100" },
];

export function BusSeatPlan({
  layout,
  taken,
  blocked,
  held,
  selected,
  onSelect,
}: {
  layout: SeatLayout;
  taken: Set<number>;
  blocked: Set<number>;
  held: Set<number>;
  selected: number[];
  onSelect: (seatNo: number) => void;
}) {
  const column = (position: number) => 5 - position; // driver side left
  const used = new Set(layout.cells.map((c) => column(c.position)));
  // Columns no seat uses are the aisle: narrow, so the plan stays compact on a phone.
  const columns = [0, 1, 2, 3, 4, 5].map((c) => (used.has(c) ? "2.6rem" : "1.25rem")).join(" ");
  const free = layout.cells.filter((c) => !taken.has(c.seatNo) && !blocked.has(c.seatNo) && !held.has(c.seatNo)).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600">
        {LEGEND.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-3.5 w-3.5 rounded-t-md rounded-b-sm border ${item.className}`} />
            {item.label}
          </span>
        ))}
      </div>
      <p className="text-center text-xs text-slate-500">
        {free} of {layout.seats} seats available
      </p>
      <div className="flex justify-center overflow-x-auto pb-2">
        <div className="w-max rounded-[2.5rem_2.5rem_1rem_1rem] border-2 border-slate-300 bg-slate-50 px-4 pt-3 pb-5">
          <div className="mb-4 flex items-center justify-between gap-6 border-b-2 border-dashed border-slate-300 pb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="2" />
                <path d="M12 3v7M4.5 15l5.5-2M19.5 15 14 13" />
              </svg>
              Driver
            </span>
            <span>Front</span>
            <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5">Door</span>
          </div>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: columns, gridTemplateRows: `repeat(${layout.benches}, 2.6rem)` }}
          >
            {layout.cells.map((cell) => {
              const isBlocked = blocked.has(cell.seatNo);
              const isTaken = taken.has(cell.seatNo);
              const isHeld = !isTaken && held.has(cell.seatNo);
              const isSelected = selected.includes(cell.seatNo);
              const note = isBlocked ? ", not for sale" : isTaken ? ", taken" : isHeld ? ", being booked by someone else" : "";
              return (
                <button
                  key={cell.seatNo}
                  type="button"
                  disabled={isBlocked || isTaken || isHeld}
                  aria-pressed={isSelected}
                  aria-label={`Seat ${cell.seatNo}${note}`}
                  title={`Seat ${cell.seatNo}${note}`}
                  onClick={() => onSelect(cell.seatNo)}
                  style={{ gridColumn: column(cell.position) + 1, gridRow: cell.bench + 1 }}
                  className={`relative rounded-t-xl rounded-b-md border-2 text-xs font-semibold transition ${
                    isBlocked
                      ? "cursor-not-allowed border-amber-300 bg-amber-100 text-amber-700"
                      : isTaken
                        ? "cursor-not-allowed border-slate-300 bg-slate-300 text-slate-500"
                        : isHeld
                          ? "cursor-not-allowed border-sky-300 bg-sky-100 text-sky-700"
                          : isSelected
                            ? "scale-105 border-brand bg-brand text-white shadow"
                            : "border-slate-300 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-brand"
                  }`}
                >
                  {isTaken ? "✕" : cell.seatNo}
                </button>
              );
            })}
          </div>
          <p className="mt-4 border-t-2 border-dashed border-slate-300 pt-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Back
          </p>
        </div>
      </div>
    </div>
  );
}
