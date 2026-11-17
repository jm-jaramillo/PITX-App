"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { dateTimeManila, peso, todayManila } from "@/lib/format";
import { ticketHref } from "@/lib/paths";
import { ROUTE_GROUPS, routeGroupOf } from "@/lib/places";
import {
  averageTicketTime,
  downloadTicketingReport,
  issueKpi,
  minSec,
  routeName,
  saleDate,
  saleTime,
  shiftRemittance,
} from "@/lib/reports";
import { routeDemand, scopedTickets, tripCompanyId, useDb } from "@/lib/store";
import { FARE_TYPES, PAYMENT_METHODS, type Ticket, type Trip } from "@/lib/types";
import { PageTitle } from "@/components/page-title";
import { RouteDemandTable } from "@/components/route-demand";
import { TripList } from "@/components/trip-list";

// Reports (entry 35): Tickets Sold and Daily Trips merged in. One set of filters drives the
// ticket list, passengers by route and the breakdowns. Farebox revenue = fares of tickets
// not voided. Tellers count their cash blind at Close Sales, so they see no peso totals.

const TABS = ["Tickets sold", "Passengers by route", "Breakdowns", "Daily trips", "Remittance and KPI"] as const;
type Tab = (typeof TABS)[number];
const PAGE = 50;
const SOURCES = ["On-site", "Online"] as const;
const STATUSES = ["Ticketed", "Boarded", "Voided"] as const;
const sourceLabel = (t: Ticket) => (t.source === "Counter" ? "On-site" : "Online");
const username = (t: Ticket) => t.soldBy ?? t.bookedBy ?? "-";

function Pick({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="min-w-36 flex-1">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {children}
      </select>
    </label>
  );
}

function Breakdown({
  title,
  tickets,
  groupBy,
  money,
}: {
  title: string;
  tickets: Ticket[];
  groupBy: (t: Ticket) => string;
  money: boolean;
}) {
  const groups = new Map<string, { count: number; total: number }>();
  for (const ticket of tickets) {
    const key = groupBy(ticket);
    const group = groups.get(key) ?? { count: 0, total: 0 };
    groups.set(key, { count: group.count + 1, total: group.total + ticket.fare });
  }
  const rows = [...groups.entries()].sort((a, b) => b[1].count - a[1].count);
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2">{title}</th>
            <th className="px-3 py-2 text-right">Tickets sold</th>
            {money && <th className="px-3 py-2 text-right">Farebox revenue</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, group]) => (
            <tr key={key} className="border-t border-slate-100">
              <td className="px-3 py-2">{key}</td>
              <td className="px-3 py-2 text-right tabular-nums">{group.count}</td>
              {money && <td className="px-3 py-2 text-right tabular-nums">{peso(group.total)}</td>}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                No tickets.
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
  const router = useRouter();
  const today = todayManila();
  const [tab, setTab] = useState<Tab>("Tickets sold");
  const [page, setPage] = useState(0);
  const [f, setF] = useState({
    from: today,
    to: today,
    timeFrom: "",
    timeTo: "",
    companyId: "",
    routeId: "",
    group: "",
    gate: "",
    payment: "",
    fareType: "",
    source: "",
    counterId: "",
    user: "",
    status: "",
    search: "",
  });
  const [exportNote, setExportNote] = useState("");
  const set = (key: keyof typeof f) => (value: string) => {
    setF({ ...f, [key]: value, ...(key === "companyId" ? { routeId: "" } : {}) });
    setPage(0);
  };

  const role = db.session?.role;
  const isAdmin = role === "PITX Admin";
  const isTeller = role === "Teller";
  const money = !isTeller;

  const routeOf = (trip: Trip | undefined) => db.routes.find((r) => r.id === trip?.routeId);
  const tripOf = (t: Ticket) => db.trips.find((x) => x.id === t.tripId);
  const nameOf = (trip: Trip | undefined) => routeName(routeOf(trip)?.description ?? "");
  const groupOf = (trip: Trip | undefined) => routeGroupOf(nameOf(trip)) ?? "Not provincial";

  // Trip-level filters: shared by tickets and passengers by route.
  const tripMatches = (trip: Trip | undefined) =>
    Boolean(trip) &&
    trip!.date >= f.from &&
    trip!.date <= f.to &&
    (!f.timeFrom || trip!.time >= f.timeFrom) &&
    (!f.timeTo || trip!.time <= f.timeTo) &&
    (!f.companyId || tripCompanyId(db, trip!) === f.companyId) &&
    (!f.routeId || trip!.routeId === f.routeId) &&
    (!f.group || groupOf(trip) === f.group) &&
    (!f.gate || routeOf(trip)?.denomination === f.gate);
  const term = f.search.trim().toLowerCase();
  const ticketMatches = (t: Ticket) =>
    tripMatches(tripOf(t)) &&
    (!f.payment || t.paymentMethod === f.payment) &&
    (!f.fareType || t.fareType === f.fareType) &&
    (!f.source || sourceLabel(t) === f.source) &&
    (!f.counterId || t.counterId === f.counterId) &&
    (!f.user || username(t) === f.user) &&
    (!f.status || t.status === f.status) &&
    (!term ||
      t.ticketNo.toLowerCase().includes(term) ||
      t.passengerName.toLowerCase().includes(term) ||
      Boolean(t.bookingRef?.toLowerCase().includes(term)));

  const all = scopedTickets(db);
  const tickets = all.filter(ticketMatches).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const sold = tickets.filter((t) => t.status !== "Voided");
  const pages = Math.max(1, Math.ceil(tickets.length / PAGE));
  const current = Math.min(page, pages - 1);
  const rows = tickets.slice(current * PAGE, current * PAGE + PAGE);

  const routes = db.routes.filter((r) => !f.companyId || r.companyId === f.companyId).sort((a, b) => routeName(a.description).localeCompare(routeName(b.description)));
  const gates = [...new Set(db.routes.map((r) => r.denomination).filter((g): g is string => Boolean(g)))].sort();
  const users = [...new Set(all.map(username).filter((u) => u !== "-"))].sort();
  const demand = routeDemand(db, f.from, f.to, (trip) => tripMatches(trip));
  const companyId = isAdmin ? f.companyId : (db.session?.companyId ?? "");
  const onSite = averageTicketTime(db, f.from, f.to, "Counter", { companyId, teller: isTeller ? db.session?.name : "" });
  const online = averageTicketTime(db, f.from, f.to, "Online", { companyId });
  const target = db.settings.issueTargetSeconds;

  const stats = [
    { label: "Tickets sold", value: String(sold.length) },
    ...(money ? [{ label: "Farebox revenue", value: peso(sold.reduce((sum, t) => sum + t.fare, 0)) }] : []),
    { label: "Boarded", value: String(sold.filter((t) => t.status === "Boarded").length) },
    { label: "Voided / refunded", value: String(tickets.length - sold.length) },
    { label: "Avg ticket time · On-site", value: onSite.payments ? minSec(onSite.avgSeconds) : "-" },
    ...(isTeller ? [] : [{ label: "Avg ticket time · Online", value: online.payments ? minSec(online.avgSeconds) : "-" }]),
  ];

  async function exportExcel() {
    setExportNote("Preparing the file…");
    try {
      const count = await downloadTicketingReport(db, { from: f.from, to: f.to, companyId }, tickets);
      setExportNote(`Downloaded ${count} tickets.`);
    } catch {
      setExportNote("The Excel file couldn't be created. Try again.");
    }
  }

  const range = f.from === f.to ? f.from : `${f.from} to ${f.to}`;
  const th = "px-3 py-2";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <PageTitle className="mr-auto" sub="Tickets sold, passengers by route, daily trips and the booth reports. The filters below apply to every tab except Daily trips.">
          Reports · {range}
        </PageTitle>
        <label className="no-print">
          Search or scan
          <input
            placeholder="Name, ticket no. or booking ref"
            value={f.search}
            onChange={(e) => set("search")(e.target.value)}
            onKeyDown={(e) => {
              // A QR reader types the ticket number and presses Enter: open that ticket.
              if (e.key !== "Enter") return;
              const hit = all.find((t) => t.ticketNo.toUpperCase() === f.search.trim().toUpperCase());
              if (hit) router.push(ticketHref(hit.id));
            }}
          />
        </label>
        <button className="no-print rounded bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="no-print space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <label className="min-w-36">
            Trip date from
            <input type="date" value={f.from} onChange={(e) => set("from")(e.target.value)} />
          </label>
          <label className="min-w-36">
            to
            <input type="date" min={f.from} value={f.to} onChange={(e) => set("to")(e.target.value)} />
          </label>
          <label className="min-w-28">
            Time from
            <input type="time" value={f.timeFrom} onChange={(e) => set("timeFrom")(e.target.value)} />
          </label>
          <label className="min-w-28">
            to
            <input type="time" value={f.timeTo} onChange={(e) => set("timeTo")(e.target.value)} />
          </label>
          {isAdmin && (
            <Pick label="Operator" value={f.companyId} onChange={set("companyId")}>
              {db.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </Pick>
          )}
          <Pick label="Route" value={f.routeId} onChange={set("routeId")}>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {routeName(r.description)}
                {isAdmin ? ` · ${db.companies.find((c) => c.id === r.companyId)?.code ?? ""}` : ""}
              </option>
            ))}
          </Pick>
          <Pick label="Region / group" value={f.group} onChange={set("group")}>
            {[...ROUTE_GROUPS, "Not provincial"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Pick>
          <Pick label="Boarding gate" value={f.gate} onChange={set("gate")}>
            {gates.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Pick>
        </div>
        <div className="flex flex-wrap gap-3">
          <Pick label="Mode of payment" value={f.payment} onChange={set("payment")}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Pick>
          <Pick label="Passenger type" value={f.fareType} onChange={set("fareType")}>
            {FARE_TYPES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Pick>
          <Pick label="Source" value={f.source} onChange={set("source")}>
            {SOURCES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Pick>
          <Pick label="Counter" value={f.counterId} onChange={set("counterId")}>
            {db.counters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.description}
              </option>
            ))}
          </Pick>
          <Pick label="Username" value={f.user} onChange={set("user")}>
            {users.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Pick>
          <Pick label="Status" value={f.status} onChange={set("status")}>
            {STATUSES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Pick>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="kpi">
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-value">
              <strong>{s.value}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="no-print flex flex-wrap gap-2" role="tablist" aria-label="Report">
        {TABS.filter((t) => t !== "Remittance and KPI" || !isTeller).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1.5 text-sm ${tab === t ? "border-brand bg-brand font-semibold text-white" : "border-slate-300 bg-white"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Tickets sold" && (
        <section className="space-y-2">
          <div className="no-print flex flex-wrap items-center gap-3 text-sm">
            <span>
              <strong>{tickets.length}</strong> tickets
            </span>
            <button
              disabled={tickets.length === 0}
              className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-40"
              onClick={exportExcel}
            >
              Download Excel
            </button>
            {exportNote && (
              <span role="status" className="text-xs text-slate-600">
                {exportNote}
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className={th}>Transaction</th>
                  <th className={th}>Ticket No.</th>
                  <th className={th}>Passenger</th>
                  {isAdmin && <th className={th}>Operator</th>}
                  <th className={th}>Route</th>
                  <th className={th}>Trip</th>
                  <th className={th}>Seat</th>
                  <th className={th}>Passenger type</th>
                  <th className={th}>Fare</th>
                  <th className={th}>Payment mode</th>
                  <th className={th}>Source</th>
                  <th className={th}>Counter</th>
                  <th className={th}>Username</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const trip = tripOf(t);
                  const company = db.companies.find((c) => c.id === (trip ? tripCompanyId(db, trip) : ""));
                  return (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className={`${th} whitespace-nowrap tabular-nums`}>
                        {saleDate(t)} {saleTime(t)}
                      </td>
                      <td className={`${th} font-mono text-xs`}>
                        <Link className="text-brand underline" href={ticketHref(t.id)}>
                          {t.ticketNo}
                        </Link>
                      </td>
                      <td className={th}>{t.passengerName}</td>
                      {isAdmin && <td className={th}>{company?.code}</td>}
                      <td className={th}>{nameOf(trip)}</td>
                      <td className={`${th} whitespace-nowrap`}>
                        {trip?.tripNo} · {trip?.date} {trip?.time}
                      </td>
                      <td className={th}>{t.seatNo}</td>
                      <td className={th}>{t.fareType}</td>
                      <td className={`${th} text-right tabular-nums`}>{peso(t.fare)}</td>
                      <td className={th}>{t.paymentMethod}</td>
                      <td className={th}>{sourceLabel(t)}</td>
                      <td className={th}>{db.counters.find((c) => c.id === t.counterId)?.code ?? "-"}</td>
                      <td className={th}>{username(t)}</td>
                      <td className={th}>
                        {t.status}
                        {t.reprints?.length ? ` · reprinted ${t.reprints.length}x` : ""}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-3 py-6 text-center text-slate-500">
                      No tickets match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="no-print flex items-center justify-end gap-2 text-sm">
              <button type="button" disabled={current === 0} className="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-40" onClick={() => setPage(current - 1)}>
                Previous
              </button>
              <span className="tabular-nums">
                {current * PAGE + 1}-{Math.min(tickets.length, (current + 1) * PAGE)} of {tickets.length} · page {current + 1} of {pages}
              </span>
              <button type="button" disabled={current >= pages - 1} className="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-40" onClick={() => setPage(current + 1)}>
                Next
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "Passengers by route" && (
        <section className="space-y-2">
          <p className="text-xs text-slate-500">
            Passenger Demand Report: every route, by group. Click a group to see its routes. Load factor is boarded over seats
            available, and vacant seats are seats available less tickets sold.
          </p>
          <RouteDemandTable rows={demand} showCompany={isAdmin} />
        </section>
      )}

      {tab === "Breakdowns" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Breakdown title="Region / group" tickets={sold} groupBy={(t) => groupOf(tripOf(t))} money={money} />
          <Breakdown title="Boarding gate" tickets={sold} groupBy={(t) => routeOf(tripOf(t))?.denomination ?? "Not set"} money={money} />
          {isAdmin && (
            <Breakdown
              title="Operator"
              tickets={sold}
              groupBy={(t) => db.companies.find((c) => c.id === routeOf(tripOf(t))?.companyId)?.code ?? "Unknown"}
              money={money}
            />
          )}
          <Breakdown title="Route" tickets={sold} groupBy={(t) => nameOf(tripOf(t))} money={money} />
          <Breakdown title="Mode of payment" tickets={sold} groupBy={(t) => t.paymentMethod} money={money} />
          <Breakdown title="Passenger type" tickets={sold} groupBy={(t) => t.fareType} money={money} />
          <Breakdown title="Source" tickets={sold} groupBy={sourceLabel} money={money} />
          <Breakdown title="Counter" tickets={sold} groupBy={(t) => db.counters.find((c) => c.id === t.counterId)?.code ?? "Online"} money={money} />
        </div>
      )}

      {tab === "Daily trips" && <TripList />}

      {tab === "Remittance and KPI" && !isTeller && <BoothReports from={f.from} to={f.to} companyId={companyId} target={target} />}
    </div>
  );
}

/** Shift remittance, KPI 11 by teller and counter openings, by transaction date. */
function BoothReports({ from, to, companyId, target }: { from: string; to: string; companyId: string; target: number }) {
  const db = useDb();
  const remittance = shiftRemittance(db, from, to, companyId);
  const kpi = issueKpi(db, from, to, target, companyId);
  const online = averageTicketTime(db, from, to, "Online", { companyId });
  const openings = db.openings.filter((o) => o.date >= from && o.date <= to);
  const th = "px-3 py-2";
  const thr = "px-3 py-2 text-right";
  const num = "px-3 py-2 text-right tabular-nums";
  const range = from === to ? from : `${from} to ${to}`;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Shift Remittance (Farebox Revenue vs Tickets Sold) · transactions on {range}</h2>
        <p className="text-xs text-slate-500">On-site sales by teller, by transaction date. Online payments are not included.</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className={th}>Teller</th>
                <th className={th}>Counter</th>
                <th className={thr}>Tickets sold</th>
                <th className={thr}>Voided</th>
                <th className={thr}>Refunds</th>
                <th className={thr}>Reprint fees</th>
                <th className={thr}>Cash to remit</th>
                <th className={thr}>Card</th>
                <th className={thr}>E-Wallet</th>
              </tr>
            </thead>
            <tbody>
              {remittance.map((r) => (
                <tr key={r.key} className="border-t border-slate-100">
                  <td className={th}>{r.teller}</td>
                  <td className={th}>{r.counter}</td>
                  <td className={num}>{r.count}</td>
                  <td className={num}>{r.voided}</td>
                  <td className={num}>{peso(r.refunds)}</td>
                  <td className={num}>{peso(r.reprintFees)}</td>
                  <td className={`${num} font-semibold`}>{peso(r.Cash)}</td>
                  <td className={num}>{peso(r.Card)}</td>
                  <td className={num}>{peso(r["E-Wallet"])}</td>
                </tr>
              ))}
              {remittance.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-slate-500">
                    No on-site sales on these dates.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">KPI 11 · Average ticket time · transactions on {range}</h2>
        <p className="text-xs text-slate-500">
          On-site: first seat picked to payment. Online: first seat held to payment. One payment counts once, whatever the
          number of seats. Target {minSec(target)}.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className={th}>Teller</th>
                <th className={th}>Counter</th>
                <th className={thr}>Payments</th>
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
              <tr className="border-t border-slate-200 bg-slate-50/60">
                <td className={th}>Online (all passengers)</td>
                <td className={th}>-</td>
                <td className={num}>{online.payments}</td>
                <td className={num}>{online.payments ? minSec(online.avgSeconds) : "-"}</td>
                <td className={num}>-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Counters opened · {range}</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className={th}>Opened</th>
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
                    No counters opened on these dates.
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
