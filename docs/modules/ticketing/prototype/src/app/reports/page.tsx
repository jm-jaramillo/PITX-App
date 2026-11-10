"use client";

import { useState } from "react";
import { dateTimeManila, peso, todayManila } from "@/lib/format";
import { downloadTicketingReport, issueKpi, minSec, shiftRemittance } from "@/lib/reports";
import { routeDemand, TRIP_GROUPS, tripGroup, useDb } from "@/lib/store";
import type { Ticket } from "@/lib/types";
import { PageTitle } from "@/components/page-title";

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
  const target = db.settings.issueTargetSeconds;
  const kpi = issueKpi(db, date, date, target);
  const demand = routeDemand(db, date);
  const manilaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });
  const queues = db.queueCounts.filter((q) => manilaDate.format(new Date(q.at)) === date);
  const openings = db.openings.filter((o) => o.date === date);
  const th = "px-3 py-2";
  const thr = "px-3 py-2 text-right";
  const num = "px-3 py-2 text-right tabular-nums";

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
        <PageTitle className="mr-auto">Ticketing and Boarding Report · {date}</PageTitle>
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
          <div key={s.label} className="kpi">
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-value">
                <strong>{s.value}</strong>
              </div>
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
        <h2 className="text-lg font-semibold">Shift Remittance (Sales vs Issued Tickets) · sales made on {date}</h2>
        <p className="text-xs text-slate-500">
          The end-of-day booth report: counter sales by teller, based on the sale date rather than the trip date. Online
          payments are not included.
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

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">KPI 11 · Ticket issuance time · sales made on {date}</h2>
        <p className="text-xs text-slate-500">
          Per counter sale, from the first seat picked to payment. One payment counts once, whatever the number of seats.
          Target {minSec(target)} (System Parameters).
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className={th}>Teller</th>
                <th className={th}>Counter</th>
                <th className={thr}>Sales</th>
                <th className={thr}>Average time</th>
                <th className={thr}>Within target</th>
              </tr>
            </thead>
            <tbody>
              {kpi.map((r) => (
                <tr key={r.key} className="border-t border-slate-100">
                  <td className={th}>{r.teller}</td>
                  <td className={th}>{r.counter}</td>
                  <td className={num}>{r.sales}</td>
                  <td className={r.avgSeconds > target ? `${num} font-semibold text-red-700` : num}>{minSec(r.avgSeconds)}</td>
                  <td className={num}>{Math.round((r.withinTarget / r.sales) * 100)}%</td>
                </tr>
              ))}
              {kpi.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                    No timed counter sales on this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Passenger Demand Report · trips on {date}</h2>
        <p className="text-xs text-slate-500">
          Passengers served per route against trips dispatched and seats offered, then the queue counts at booths and gates.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className={th}>Route</th>
                <th className={th}>Company</th>
                <th className={thr}>Trips</th>
                <th className={thr}>Dispatched</th>
                <th className={thr}>Seats</th>
                <th className={thr}>Ticketed</th>
                <th className={thr}>Boarded</th>
                <th className={thr}>Load factor</th>
              </tr>
            </thead>
            <tbody>
              {demand.map((r) => (
                <tr key={r.routeId} className="border-t border-slate-100">
                  <td className={th}>{r.route}</td>
                  <td className={th}>{r.company}</td>
                  <td className={num}>{r.trips}</td>
                  <td className={num}>{r.dispatched}</td>
                  <td className={num}>{r.seats}</td>
                  <td className={num}>{r.ticketed}</td>
                  <td className={num}>{r.boarded}</td>
                  <td className={num}>{r.seats ? `${Math.round((r.ticketed / r.seats) * 100)}%` : "-"}</td>
                </tr>
              ))}
              {demand.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center text-slate-500">
                    No trips on this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className={th}>Queue count</th>
                  <th className={th}>Booth or gate</th>
                  <th className={thr}>In line</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => (
                  <tr key={q.id} className="border-t border-slate-100">
                    <td className={th}>{dateTimeManila(q.at)}</td>
                    <td className={th}>
                      {q.spot} · {q.place}
                    </td>
                    <td className={num}>{q.count}</td>
                  </tr>
                ))}
                {queues.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                      No queue counts on this date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className={th}>Counter opened</th>
                  <th className={th}>Teller</th>
                  <th className={th}>Counter</th>
                </tr>
              </thead>
              <tbody>
                {openings.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100">
                    <td className={th}>{dateTimeManila(o.openedAt)}</td>
                    <td className={th}>{o.teller}</td>
                    <td className={th}>{db.counters.find((c) => c.id === o.counterId)?.code ?? "-"}</td>
                  </tr>
                ))}
                {openings.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                      No counters opened on this date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
