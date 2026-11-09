"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { peso } from "@/lib/format";
import { ticketHref } from "@/lib/paths";
import { scopedTickets, tripCompanyId, useDb } from "@/lib/store";
import { FARE_TYPES, PAYMENT_METHODS, type Ticket } from "@/lib/types";
import { PageTitle } from "@/components/page-title";

const STATUSES = ["Reserved", "Boarded", "Voided"] as const;
const SOURCES = ["Counter", "Online"] as const;

/** One row of slicer buttons, like an Excel slicer: click to filter, click again to clear. */
function Slicer<T extends string>({
  label,
  options,
  value,
  onChange,
  count,
}: {
  label: string;
  options: readonly T[];
  value: T | "";
  onChange: (v: T | "") => void;
  count: (v: T) => number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      <span className="mr-1 w-20 text-xs font-semibold text-slate-600">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(value === o ? "" : o)}
          className={`rounded-full border px-2.5 py-1 text-xs ${value === o ? "border-brand bg-brand font-semibold text-white" : "border-slate-300 bg-white"}`}
        >
          {o} · {count(o)}
        </button>
      ))}
    </div>
  );
}

function Pick({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="min-w-40 flex-1">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {children}
      </select>
    </label>
  );
}

export default function TicketsPage() {
  const db = useDb();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [counterId, setCounterId] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "">("");
  const [source, setSource] = useState<(typeof SOURCES)[number] | "">("");
  const [payment, setPayment] = useState<(typeof PAYMENT_METHODS)[number] | "">("");
  const [fareType, setFareType] = useState<(typeof FARE_TYPES)[number] | "">("");

  const isAdmin = db.session?.role === "PITX Admin";
  const all = scopedTickets(db);
  const tripOf = (t: Ticket) => db.trips.find((x) => x.id === t.tripId);
  const term = search.trim().toLowerCase();

  // Every filter but the slicer being counted, so each slicer shows what clicking it would give.
  const matches = (t: Ticket, skip?: string) => {
    const trip = tripOf(t);
    return (
      (!term ||
        t.ticketNo.toLowerCase().includes(term) ||
        t.passengerName.toLowerCase().includes(term) ||
        Boolean(t.bookingRef?.toLowerCase().includes(term))) &&
      (!from || (trip?.date ?? "") >= from) &&
      (!to || (trip?.date ?? "") <= to) &&
      (!companyId || (trip && tripCompanyId(db, trip) === companyId)) &&
      (!routeId || trip?.routeId === routeId) &&
      (!counterId || t.counterId === counterId) &&
      (skip === "status" || !status || t.status === status) &&
      (skip === "source" || !source || t.source === source) &&
      (skip === "payment" || !payment || t.paymentMethod === payment) &&
      (skip === "fare" || !fareType || t.fareType === fareType)
    );
  };
  const filtered = all.filter((t) => matches(t));
  const rows = filtered.slice().reverse().slice(0, 200);
  const sales = filtered.filter((t) => t.status !== "Voided").reduce((sum, t) => sum + t.fare, 0);
  const routes = db.routes.filter((r) => !companyId || r.companyId === companyId);
  const anyFilter = [search, from, to, companyId, routeId, counterId, status, source, payment, fareType].some(Boolean);

  function clear() {
    [setSearch, setFrom, setTo, setCompanyId, setRouteId, setCounterId].forEach((set) => set(""));
    setStatus("");
    setSource("");
    setPayment("");
    setFareType("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <PageTitle className="mr-auto" sub="Search or scan a ticket. With a QR reader, scanning a pass opens it.">
          Tickets and Bookings
        </PageTitle>
        <label>
          Search or scan
          <input
            autoFocus
            placeholder="Name, ticket no. or booking ref"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // A QR reader types the ticket number and presses Enter: open that ticket.
              if (e.key !== "Enter") return;
              const hit = all.find((t) => t.ticketNo.toUpperCase() === search.trim().toUpperCase());
              if (hit) router.push(ticketHref(hit.id));
            }}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <label className="min-w-36">
            Trip date from
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="min-w-36">
            to
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {isAdmin && (
            <Pick
              label="Bus company"
              value={companyId}
              onChange={(v) => {
                setCompanyId(v);
                setRouteId("");
              }}
            >
              {db.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </Pick>
          )}
          <Pick label="Route" value={routeId} onChange={setRouteId}>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.description}
              </option>
            ))}
          </Pick>
          <Pick label="Counter" value={counterId} onChange={setCounterId}>
            {db.counters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.description}
              </option>
            ))}
          </Pick>
        </div>
        <Slicer label="Status" options={STATUSES} value={status} onChange={setStatus} count={(v) => all.filter((t) => matches(t, "status") && t.status === v).length} />
        <Slicer label="Source" options={SOURCES} value={source} onChange={setSource} count={(v) => all.filter((t) => matches(t, "source") && t.source === v).length} />
        <Slicer label="Payment" options={PAYMENT_METHODS} value={payment} onChange={setPayment} count={(v) => all.filter((t) => matches(t, "payment") && t.paymentMethod === v).length} />
        <Slicer label="Fare type" options={FARE_TYPES} value={fareType} onChange={setFareType} count={(v) => all.filter((t) => matches(t, "fare") && t.fareType === v).length} />
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-sm">
          <span>
            <strong>{filtered.length}</strong> tickets
          </span>
          {db.session?.role !== "Teller" && (
            <span>
              <strong>{peso(sales)}</strong> sales (not voided)
            </span>
          )}
          {anyFilter && (
            <button type="button" className="text-brand underline" onClick={clear}>
              Clear filters
            </button>
          )}
          {filtered.length > rows.length && <span className="text-slate-500">Showing the latest {rows.length}.</span>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Ticket No.</th>
              <th className="px-3 py-2">Booking ref</th>
              <th className="px-3 py-2">Passenger</th>
              {isAdmin && <th className="px-3 py-2">Company</th>}
              <th className="px-3 py-2">Trip</th>
              <th className="px-3 py-2">Seat</th>
              <th className="px-3 py-2">Fare</th>
              <th className="px-3 py-2">Payment</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const trip = tripOf(t);
              const company = db.companies.find((c) => c.id === (trip ? tripCompanyId(db, trip) : ""));
              return (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link className="text-brand underline" href={ticketHref(t.id)}>
                      {t.ticketNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{t.bookingRef ?? "-"}</td>
                  <td className="px-3 py-2">{t.passengerName}</td>
                  {isAdmin && <td className="px-3 py-2">{company?.code}</td>}
                  <td className="px-3 py-2">
                    {trip?.tripNo} · {trip?.date} {trip?.time}
                  </td>
                  <td className="px-3 py-2">{t.seatNo}</td>
                  <td className="px-3 py-2">
                    {peso(t.fare)}
                    {t.fareType !== "Adult" ? ` (${t.fareType})` : ""}
                  </td>
                  <td className="px-3 py-2">{t.paymentMethod}</td>
                  <td className="px-3 py-2">{t.source}</td>
                  <td className="px-3 py-2">
                    {t.status}
                    {t.reprints?.length ? ` · reprinted ${t.reprints.length}x` : ""}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                  No tickets match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
