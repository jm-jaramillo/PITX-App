"use client";

import { assignCounter, useDb } from "@/lib/store";

/**
 * Booth and counter assignment sheet (process map: Ticket Booth and Counter Assignment).
 * Ticks which bus companies sell at each counter. A counter with nothing ticked is open
 * to every company. Route-by-route selling per counter is in Counter Fares.
 */
export function CounterAssignment() {
  const db = useDb();
  const counters = db.counters.filter((c) => c.status === "Active");
  const companies = db.companies.filter((c) => c.status === "Active");

  function toggle(counterId: string, companyId: string, on: boolean) {
    const current = db.counters.find((c) => c.id === counterId)?.companyIds ?? [];
    assignCounter(counterId, on ? [...current, companyId] : current.filter((id) => id !== companyId));
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Counter Assignment</h2>
        <p className="text-sm text-slate-600">
          Tick the bus companies that sell at each counter. A counter with none ticked is open to all. Tellers only get
          the counters of their company at sign-in. Every change is in the log.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-3 py-2">Bus company</th>
              {counters.map((c) => (
                <th key={c.id} className="px-3 py-2 text-center whitespace-nowrap" title={c.description}>
                  {c.code}
                  <div className="font-normal">{c.companyIds?.length ? `${c.companyIds.length} assigned` : "open to all"}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id} className="border-t border-slate-100">
                <td className="sticky left-0 bg-white px-3 py-2 whitespace-nowrap">
                  {company.code} · {company.name}
                </td>
                {counters.map((counter) => (
                  <td key={counter.id} className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${company.code} sells at ${counter.code}`}
                      checked={Boolean(counter.companyIds?.includes(company.id))}
                      onChange={(e) => toggle(counter.id, company.id, e.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
