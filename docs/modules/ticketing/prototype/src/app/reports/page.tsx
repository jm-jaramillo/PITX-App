"use client";

import { useState } from "react";
import { peso, todayManila } from "@/lib/format";
import { downloadTicketingReport, shiftRemittance } from "@/lib/reports";
import { TRIP_GROUPS, tripGroup, useDb } from "@/lib/store";
import type { Ticket } from "@/lib/types";

function Breakdown({ title, tickets, groupBy }: { title: string; tickets: Ticket[]; groupBy: (t: Ticket) => string }) {
  const groups = new Map<string, { count: number; total: number }>();
  for (const ticket of tickets) {
    const key = groupBy(ticket);
    const group = groups.get(key) ?? { count: 0, total: 0 };
    groups.set(key, { count: group.count + 1, total: group.total + ticket.fare });
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2">{title}</th>
            <th className="px-3 py-2 text-right">Tickets</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {[...groups.entries()].map(([key, group]) => (
            <tr key={key} className="border-t border-slate-100">
              <td className="px-3 py-2">{key}</td>
              <td className="px-3 py-2 text-right">{group.count}</td>
              <td className="px-3 py-2 text-right">{peso(group.total)}</td>
            </tr>
          ))}
          {groups.size === 0 && (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                No sales.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const db = useDb();
  const [date, setDate] = useState(todayManila());
  const [from, setFrom] = useState(todayManila());
  const [to, setTo] = useState(todayManila());
  const [companyId, setCompanyId] = useState("");
  const [exportNote, setExportNote] = useState("");

  const tripIds = new Set(db.trips.filter((t) => t.date === date).map((t) => t.id));
  const forDate = db.tickets.filter((t) => tripIds.has(t.tripId));
  const sold = forDate.filter((t) => t.status !== "Voided");
  const routeOf = (t: Ticket) => {
    const trip = db.trips.find((x) => x.id === t.tripId);
    return db.routes.find((r) => r.id === trip?.routeId)?.description ?? "Unknown";
  };
  const ticketRoute = (t: Ticket) => {
    const trip = db.trips.find((x) => x.id === t.tripId);
    return db.routes.find((r) => r.id === trip?.routeId);
  };
  const denominationOf = (t: Ticket) => ticketRoute(t)?.denomination ?? "Unknown";
  const companyOf = (t: Ticket) =>
    db.companies.find((c) => c.id === ticketRoute(t)?.companyId)?.code ?? "Unknown";
  const remittance = shiftRemittance(db, date, date);

  async function exportExcel() {
    setExportNote("Preparing the file…");
    try {
      const count = await downloadTicketingReport(db, { from, to, companyId });
      setExportNote(`Downloaded ${count} tickets.`);
    } catch {
      setExportNote("The Excel file couldn't be created. Try again.");
    }
  }

  const stats = [
    { label: "Tickets sold", value: String(sold.length) },
    { label: "Sales", value: peso(sold.reduce((sum, t) => sum + t.fare, 0)) },
    { label: "Boarded", value: String(sold.filter((t) => t.status === "Boarded").length) },
    { label: "Voided", value: String(forDate.length - sold.length) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold">Ticketing and Boarding Report · {date}</h1>
        <label className="no-print">
          Trip date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button
          className="no-print rounded bg-brand px-4 py-2 text-sm font-semibold text-white"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>
      <div className="no-print flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mr-auto self-center text-sm font-semibold">Excel report</h2>
        <label>
          Date from
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Date to
          <input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Operator
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">All</option>
            {db.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={to < from}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-40"
          onClick={exportExcel}
        >
          Download Excel
        </button>
        {exportNote && (
          <p role="status" className="w-full text-xs text-slate-600">
            {exportNote}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-200 border-t-4 border-t-brand bg-white p-4">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white md:col-span-2">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Trip group</th>
                <th className="px-3 py-2 text-right">Trips</th>
                <th className="px-3 py-2 text-right">Tickets</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {TRIP_GROUPS.map((group) => {
                const trips = db.trips.filter((t) => t.date === date && tripGroup(db, t) === group);
                const ids = new Set(trips.map((t) => t.id));
                const inGroup = sold.filter((t) => ids.has(t.tripId));
                return (
                  <tr key={group} className="border-t border-slate-100">
                    <td className="px-3 py-2">{group}</td>
                    <td className="px-3 py-2 text-right">{trips.length}</td>
                    <td className="px-3 py-2 text-right">{inGroup.length}</td>
                    <td className="px-3 py-2 text-right">{peso(inGroup.reduce((sum, t) => sum + t.fare, 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Breakdown title="Denomination" tickets={sold} groupBy={denominationOf} />
        <Breakdown title="Bus company" tickets={sold} groupBy={companyOf} />
        <Breakdown title="Route" tickets={sold} groupBy={routeOf} />
        <Breakdown
          title="Counter"
          tickets={sold}
          groupBy={(t) => db.counters.find((c) => c.id === t.counterId)?.code ?? "Unknown"}
        />
        <Breakdown title="Payment" tickets={sold} groupBy={(t) => t.paymentMethod} />
        <Breakdown title="Fare type" tickets={sold} groupBy={(t) => t.fareType} />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Shift Remittance · sales made on {date}</h2>
        <p className="text-xs text-slate-500">
          Counter sales by teller, based on the sale date rather than the trip date. Online payments are not included.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Teller</th>
                <th className="px-3 py-2">Counter</th>
                <th className="px-3 py-2 text-right">Tickets</th>
                <th className="px-3 py-2 text-right">Voided</th>
                <th className="px-3 py-2 text-right">Refunds</th>
                <th className="px-3 py-2 text-right">Reprint fees</th>
                <th className="px-3 py-2 text-right">Cash to remit</th>
                <th className="px-3 py-2 text-right">Card</th>
                <th className="px-3 py-2 text-right">E-Wallet</th>
              </tr>
            </thead>
            <tbody>
              {remittance.map((r) => (
                <tr key={r.key} className="border-t border-slate-100">
                  <td className="px-3 py-2">{r.teller}</td>
                  <td className="px-3 py-2">{r.counter}</td>
                  <td className="px-3 py-2 text-right">{r.count}</td>
                  <td className="px-3 py-2 text-right">{r.voided}</td>
                  <td className="px-3 py-2 text-right">{peso(r.refunds)}</td>
                  <td className="px-3 py-2 text-right">{peso(r.reprintFees)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{peso(r.Cash)}</td>
                  <td className="px-3 py-2 text-right">{peso(r.Card)}</td>
                  <td className="px-3 py-2 text-right">{peso(r["E-Wallet"])}</td>
                </tr>
              ))}
              {remittance.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-slate-500">
                    No counter sales on this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
