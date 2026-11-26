"use client";

// A small "i" tag whose note shows on hover or focus (entry 43), in place of yellow info boxes.
export function InfoTip({ note, label = "Info" }: { note: string; label?: string }) {
  return (
    <span
      className="no-print inline-flex cursor-help normal-case tracking-normal items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-amber-800"
      title={note}
      tabIndex={0}
      aria-label={`${label}: ${note}`}
    >
      <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-700 text-[9px] text-white">
        i
      </span>
      {label}
    </span>
  );
}
