"use client";

import type { SeatLayout } from "@/lib/seat-layouts";

const LEGEND = [
  { label: "Open", className: "border-slate-300 bg-white" },
  { label: "Selected", className: "border-accent bg-accent" },
  { label: "Sold", className: "border-slate-200 bg-slate-300" },
  { label: "Blocked (CR)", className: "border-amber-300 bg-amber-100" },
];

export function SeatMap({
  layout,
  taken,
  blocked,
  selected,
  onSelect,
}: {
  layout: SeatLayout;
  taken: Set<number>;
  blocked: Set<number>;
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
              const isSelected = selected.includes(cell.seatNo);
              const note = isBlocked ? ", blocked" : isTaken ? ", sold" : "";
              return (
                <button
                  key={cell.seatNo}
                  type="button"
                  disabled={isBlocked || isTaken}
                  aria-pressed={isSelected}
                  aria-label={`Seat ${cell.seatNo}${note}`}
                  onClick={() => onSelect(cell.seatNo)}
                  style={{ gridColumn: cell.bench + 1, gridRow: cell.position + 1 }}
                  className={`rounded border text-sm ${
                    isBlocked
                      ? "cursor-not-allowed border-amber-300 bg-amber-100 text-amber-800"
                      : isTaken
                        ? "cursor-not-allowed border-slate-200 bg-slate-300 text-slate-500"
                        : isSelected
                          ? "border-accent bg-accent font-semibold text-white"
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
        {LEGEND.map((item) => (
          <span key={item.label} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm border ${item.className}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
