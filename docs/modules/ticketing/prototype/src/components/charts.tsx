"use client";

// Small single-series charts in the PITX blue. One series each, so the title names it
// and no legend is needed. Hover shows the exact value; values are also printed.

const BAR = "var(--color-brand)";

/** Horizontal bars, one per label, longest first as given. */
export function BarList({
  data,
  format,
}: {
  data: { label: string; value: number; title?: string }[];
  format: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.every((d) => d.value === 0)) return <p className="text-sm text-slate-500">No sales yet today.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {data.map((d) => (
        <li key={d.label} className="group grid grid-cols-[5rem_minmax(0,1fr)_6.5rem] items-center gap-2" title={`${d.title ?? d.label}: ${format(d.value)}`}>
          <span className="truncate text-slate-600">{d.label}</span>
          <span className="h-3 rounded-r bg-slate-100">
            <span
              className="block h-3 rounded-r opacity-90 group-hover:opacity-100"
              style={{ width: `${(d.value / max) * 100}%`, background: BAR }}
            />
          </span>
          <span className="text-right tabular-nums text-slate-800">{format(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Vertical bars for each hour from the first to the last hour that has trips. */
export function HourBars({ data, unit }: { data: Map<number, number>; unit: string }) {
  const hours = [...data.keys()];
  if (hours.length === 0) return <p className="text-sm text-slate-500">No trips today.</p>;
  const first = Math.min(...hours);
  const last = Math.max(...hours);
  const span = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const max = Math.max(1, ...data.values());
  const peak = span.reduce((best, h) => ((data.get(h) ?? 0) > (data.get(best) ?? 0) ? h : best), span[0]);
  const label = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return (
    <div>
      <div className="flex h-36 items-end gap-0.5 border-b border-slate-200" role="img" aria-label={`Seats sold by departure hour, busiest ${label(peak)}`}>
        {span.map((h) => {
          const v = data.get(h) ?? 0;
          return (
            <div key={h} className="group flex h-full flex-1 flex-col items-center justify-end" title={`${label(h)}: ${v} ${unit}`}>
              {h === peak && v > 0 && <span className="mb-0.5 text-[10px] tabular-nums text-slate-700">{v}</span>}
              <div
                className="w-full max-w-6 rounded-t opacity-90 group-hover:opacity-100"
                style={{ height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0, background: BAR }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{label(first)}</span>
        <span>
          Busiest {label(peak)}, {data.get(peak) ?? 0} {unit}
        </span>
        <span>{label(last)}</span>
      </div>
    </div>
  );
}
