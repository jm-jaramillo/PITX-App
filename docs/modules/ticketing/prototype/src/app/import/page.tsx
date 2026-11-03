"use client";

import { useState, type ChangeEvent } from "react";
import {
  BOOKING_COLUMNS,
  parseCsv,
  planBookings,
  planTrips,
  TRIP_COLUMNS,
  type PlanLine,
} from "@/lib/import";
import { applyBookingPlan, applyTripPlan, useDb } from "@/lib/store";

type Kind = "trips" | "bookings";

const TABS: { key: Kind; label: string; columns: string[] }[] = [
  { key: "trips", label: "1. Trips", columns: TRIP_COLUMNS },
  { key: "bookings", label: "2. Bookings", columns: BOOKING_COLUMNS },
];

export default function ImportPage() {
  const db = useDb();
  const [kind, setKind] = useState<Kind>("trips");
  const [text, setText] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const current = TABS.find((t) => t.key === kind)!;
  const rows = parseCsv(text);
  const missing = rows.length ? current.columns.filter((c) => !(c in rows[0])) : [];
  const requiredMissing = missing.filter((c) => !["plate_no", "bay", "status", "payment_ref", "fare_type", "payment_method", "contact_no", "email"].includes(c));
  const lines: PlanLine<unknown>[] =
    rows.length && requiredMissing.length === 0
      ? kind === "trips"
        ? planTrips(db, rows)
        : planBookings(db, rows)
      : [];
  const good = lines.filter((l) => l.record).length;
  const bad = lines.filter((l) => l.error).length;

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setText(await file.text());
      setDone(null);
    }
    event.target.value = "";
  }

  function apply() {
    const count =
      kind === "trips"
        ? applyTripPlan(planTrips(db, rows))
        : applyBookingPlan(planBookings(db, rows));
    setText("");
    setDone(`Imported ${count} ${kind}. Rows with errors were left out.`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Import from scheduling and booking app</h1>
      <p className="text-sm text-slate-600">
        Import trips first, then bookings. Re-importing updates matching trips, so a changed plate or cancelled trip
        shows on the Dashboard with the passengers affected.
      </p>
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setKind(t.key);
              setText("");
              setDone(null);
            }}
            className={`px-3 py-2 text-sm ${kind === t.key ? "border-b-2 border-brand font-semibold text-brand" : "text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-600">
          CSV columns: <code className="font-mono">{current.columns.join(",")}</code>
        </p>
        <label>
          CSV file
          <input type="file" accept=".csv,text/csv" onChange={pickFile} />
        </label>
        <label>
          Or paste CSV
          <textarea
            aria-label="CSV text"
            rows={6}
            className="mt-1 w-full rounded-md border border-slate-300 p-2 font-mono text-xs font-normal"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDone(null);
            }}
          />
        </label>
        {done && <p className="text-sm font-medium text-green-800">{done}</p>}
        {requiredMissing.length > 0 && (
          <p role="alert" className="text-sm text-red-700">
            Missing columns: {requiredMissing.join(", ")}
          </p>
        )}
      </div>

      {lines.length > 0 && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm font-semibold">
              Preview: {good} ready, {bad} with errors
            </p>
            <button
              disabled={good === 0}
              onClick={apply}
              className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Import {good} rows
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.line} className="border-t border-slate-100">
                    <td className="px-3 py-2">{l.line}</td>
                    <td className="px-3 py-2">{l.label}</td>
                    <td className={`px-3 py-2 ${l.error ? "text-red-700" : ""}`}>{l.error ?? l.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
