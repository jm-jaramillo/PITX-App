"use client";

import { useState } from "react";
import { peso } from "@/lib/format";
import { submitCollection, useDb } from "@/lib/store";
import { PageTitle } from "@/components/page-title";

export default function DailyCollectionPage() {
  const db = useDb();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const counterCode = (id: string) => db.counters.find((c) => c.id === id)?.code ?? "-";
  const waiting = db.closings.filter((c) => !c.reconciledAt);
  const done = db.closings.filter((c) => c.reconciledAt).slice().reverse();

  function submit(id: string) {
    const value = counts[id] ?? "";
    setError(value === "" ? "Enter the cash you counted." : submitCollection(id, Number(value)));
  }

  return (
    <div className="space-y-6">
      <div>
        <PageTitle>Daily Sales Collection</PageTitle>
        <p className="subtle">
          Count each Teller&apos;s cash and enter it. The Teller&apos;s count and the system total only appear after you submit.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">To count · {waiting.length}</h2>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Teller</th>
                <th className="px-3 py-2">Counter</th>
                <th className="px-3 py-2">Cash you counted (PHP)</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{c.date}</td>
                  <td className="px-3 py-2">{c.teller}</td>
                  <td className="px-3 py-2">{counterCode(c.counterId)}</td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Cash counted for ${c.teller}`}
                      className="!mt-0 max-w-40"
                      type="number"
                      min={0}
                      step="any"
                      value={counts[c.id] ?? ""}
                      onChange={(e) => setCounts({ ...counts, [c.id]: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white" onClick={() => submit(c.id)}>
                      Submit count
                    </button>
                  </td>
                </tr>
              ))}
              {waiting.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    No closed sales waiting for a count.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">Reconciled · {done.length}</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Teller</th>
                <th className="px-3 py-2">Counter</th>
                <th className="px-3 py-2 text-right">Teller count</th>
                <th className="px-3 py-2 text-right">Account count</th>
                <th className="px-3 py-2 text-right">System cash</th>
                <th className="px-3 py-2 text-right">Over / short</th>
                <th className="px-3 py-2">Counted by</th>
              </tr>
            </thead>
            <tbody>
              {done.map((c) => {
                const variance = (c.accountCount ?? 0) - (c.systemCash ?? 0);
                return (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{c.date}</td>
                    <td className="px-3 py-2">{c.teller}</td>
                    <td className="px-3 py-2">{counterCode(c.counterId)}</td>
                    <td className="px-3 py-2 text-right">{peso(c.tellerCount)}</td>
                    <td className="px-3 py-2 text-right">{peso(c.accountCount ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{peso(c.systemCash ?? 0)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${variance === 0 ? "text-green-800" : "text-red-700"}`}>
                      {peso(variance)}
                    </td>
                    <td className="px-3 py-2">{c.accountBy}</td>
                  </tr>
                );
              })}
              {done.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Nothing reconciled yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
