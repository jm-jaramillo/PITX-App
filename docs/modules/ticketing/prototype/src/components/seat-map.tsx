"use client";

import type { SeatLayout } from "@/lib/seat-layouts";

const LEGEND = [
  { label: "Open", className: "border-slate-300 bg-white" },
  { label: "Held for you", className: "border-accent bg-accent" },
  { label: "Held by someone else", className: "border-sky-300 bg-sky-100" },
  { label: "Sold", className: "border-slate-200 bg-slate-300" },
  { label: "Blocked (CR)", className: "border-amber-300 bg-amber-100" },
];
const PRIORITY_LEGEND = { label: "Senior / PWD only", className: "border-violet-400 bg-violet-50" };

export function SeatMap({
  layout,
  taken,
  blocked,
  held = new Set<number>(),
  priority = new Set<number>(),
  selected,
  onSelect,
}: {
  layout: SeatLayout;
  taken: Set<number>;
  blocked: Set<number>;
  held?: Set<number>; // Picked by another teller or an online buyer, not yet paid
  priority?: Set<number>; // Rows 1 and 2, for senior citizens and PWDs (entry 44)

  selected: number[];
  onSelect: (seatNo: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-2">
        <div className="flex w-max items-stretch gap-2">
          <div className="flex w-14 items-end justify-center rounded border border-slate-300 bg-slate-100 p-1 text-center text-xs text-slate-600">
            Driver (front)
          </div>
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${layout.benches}, 2.75rem)`,
              gridTemplateRows: "repeat(6, 2.25rem)",
            }}
          >
            {layout.cells.map((cell) => {
              const isBlocked = blocked.has(cell.seatNo);
              const isTaken = taken.has(cell.seatNo);
              const isHeld = !isTaken && held.has(cell.seatNo);
              const isSelected = selected.includes(cell.seatNo);
              const isPriority = priority.has(cell.seatNo);
              const note = isBlocked
                ? ", blocked"
                : isTaken
                  ? ", sold"
                  : isHeld
                    ? ", held by someone else"
                    : isPriority
                      ? ", senior or PWD only"
                      : "";
              return (
                <button
                  key={cell.seatNo}
                  type="button"
                  disabled={isBlocked || isTaken || isHeld}
                  aria-pressed={isSelected}
                  aria-label={`Seat ${cell.seatNo}${note}`}
                  onClick={() => onSelect(cell.seatNo)}
                  style={{ gridColumn: cell.bench + 1, gridRow: cell.position + 1 }}
                  className={`rounded border text-sm ${
                    isBlocked
                      ? "cursor-not-allowed border-amber-300 bg-amber-100 text-amber-800"
                      : isTaken
                        ? "cursor-not-allowed border-slate-200 bg-slate-300 text-slate-500"
                        : isHeld
                          ? "cursor-not-allowed border-sky-300 bg-sky-100 text-sky-800"
                          : isSelected
                          ? "border-accent bg-accent font-semibold text-white"
                          : isPriority
                            ? "border-violet-400 bg-violet-50 text-violet-800 hover:border-brand"
                            : "border-slate-300 bg-white hover:border-brand"
                  }`}
                >
                  {cell.seatNo}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {[...LEGEND, ...(priority.size ? [PRIORITY_LEGEND] : [])].map((item) => (
          <span key={item.label} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm border ${item.className}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
