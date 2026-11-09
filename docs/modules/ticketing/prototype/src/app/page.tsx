"use client";

import Link from "next/link";
import { useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { peso, todayManila } from "@/lib/format";
import { ticketHref } from "@/lib/paths";
import { canAccess } from "@/lib/roles";
import {
  scopedTickets,
  scopedTrips,
  seatCapacity,
  takenSeats,
  ticketProblems,
  tripCompanyId,
  TRIP_GROUPS,
  tripGroup,
  useDb,
  type TripGroup,
} from "@/lib/store";
import { PageTitle } from "@/components/page-title";
import { BarList, HourBars } from "@/components/charts";
import { PAYMENT_METHODS } from "@/lib/types";

export default function OverviewPage() {
  const db = useDb();
  const [filter, setFilter] = useState<TripGroup | "All">("All");
  const today = todayManila();
  const trips = scopedTrips(db)
    .filter((t) => t.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));
  const tripIds = new Set(trips.map((t) => t.id));
  const tickets = scopedTickets(db).filter((t) => tripIds.has(t.tripId));
  const sold = tickets.filter((t) => t.status !== "Voided");
  const problems = ticketProblems(db, today);
  const canSell = db.session ? canAccess(db.session.role, "/pos") : false;
  const company = db.companies.find((c) => c.id === db.session?.companyId);

  const ticketGroups = [
    { label: "Tickets sold", value: String(sold.length), unit: "tickets" },
    { label: "Online", value: String(sold.filter((t) => t.source === "Online").length), unit: "tickets" },
    { label: "Boarded", value: String(tickets.filter((t) => t.status === "Boarded").length), unit: "passengers" },
    { label: "Refunded / voided", value: String(tickets.length - sold.length), unit: "tickets" },
    // Tellers count their cash blind at Close Sales, so they don't see the sales total.
    ...(db.session?.role === "Teller" ? [] : [{ label: "Sales", value: peso(sold.reduce((sum, t) => sum + t.fare, 0)), unit: "" }]),
  ];
  const visible = filter === "All" ? trips : trips.filter((t) => tripGroup(db, t) === filter);
  const isTeller = db.session?.role === "Teller";
  const isAdmin = db.session?.role === "PITX Admin";

  // Graphs: seats sold by departure hour, how people paid, and (PITX Admin) by company.
  const hours = new Map<number, number>();
  for (const trip of trips) {
    const hour = Number(trip.time.slice(0, 2));
    hours.set(hour, (hours.get(hour) ?? 0) + sold.filter((t) => t.tripId === trip.id).length);
  }
  const byPayment = PAYMENT_METHODS.map((m) => {
    const rows = sold.filter((t) => t.paymentMethod === m);
    // Tellers count their cash blind at Close Sales, so they see ticket counts, not pesos.
    return { label: m, value: isTeller ? rows.length : rows.reduce((sum, t) => sum + t.fare, 0) };
  });
  const companyTotals = db.companies
    .map((c) => ({
      label: c.code,
      title: c.name,
      value: sold.filter((t) => tripCompanyId(db, trips.find((x) => x.id === t.tripId)!) === c.id).length,
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  const topCompanies = companyTotals.length > 8
    ? [...companyTotals.slice(0, 7), { label: "Other", title: "Other companies", value: companyTotals.slice(7).reduce((s2, c) => s2 + c.value, 0) }]
    : companyTotals;

  return (
    <div className="space-y-6">
      <PageTitle sub={`${company ? `${company.name} · ` : ""}${today}: ticket sales, passengers who need attention, and every trip on the board.`}>
        Overview
      </PageTitle>

      <section className="space-y-2">
        <p className="section-head">Tickets</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {ticketGroups.map((s) => (
            <div key={s.label} className="kpi">
              <div className="kpi-label">{s.label}</div>
              <div className="kpi-value">
                <strong>{s.value}</strong>
                {s.unit && <span>{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <p className="section-head mb-3">Seats sold by departure hour</p>
          <HourBars data={hours} unit="seats" />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="section-head mb-3">{isTeller ? "Tickets by payment" : "Sales by payment"}</p>
          <BarList data={byPayment} format={isTeller ? (v) => `${v} tickets` : peso} />
        </div>
        {isAdmin && topCompanies.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3">
            <p className="section-head mb-3">Seats sold by bus company</p>
            <BarList data={topCompanies} format={(v) => `${v} seats`} />
          </div>
        )}
      </section>

      {problems.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <h2 className="text-sm font-semibold text-red-900">
            {problems.length} passenger{problems.length > 1 ? "s" : ""} need attention
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-red-900">
            {problems.map(({ ticket, trip, reason }) => (
              <li key={ticket.id}>
                <Link className="underline" href={ticketHref(ticket.id)}>
                  {ticket.ticketNo}
                </Link>{" "}
                · {ticket.passengerName} · {trip.tripNo} seat {ticket.seatNo} · {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="space-y-2">
        <p className="section-head">Trips</p>
        <div className="flex flex-wrap gap-2">
          {(["All", ...TRIP_GROUPS] as const).map((group) => {
            const count = group === "All" ? trips.length : trips.filter((t) => tripGroup(db, t) === group).length;
            return (
              <button
                key={group}
                aria-pressed={filter === group}
                onClick={() => setFilter(group)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  filter === group ? "border-brand bg-brand font-semibold text-white" : "border-slate-300 bg-white"
                }`}
              >
                {group} · {count}
              </button>
            );
          })}
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Trip</th>
                <th className="px-3 py-2">Bus company</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Bay</th>
                <th className="px-3 py-2">Seats sold</th>
                <th className="px-3 py-2">Group</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((trip) => {
                const group = tripGroup(db, trip);
                return (
                  <tr key={trip.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{trip.time}</td>
                    <td className="px-3 py-2">{trip.tripNo}</td>
                    <td className="px-3 py-2">
                      <CompanyLogo
                        company={db.companies.find((c) => c.id === tripCompanyId(db, trip))}
                        className="h-6 w-28 object-left"
                      />
                    </td>
                    <td className="px-3 py-2">{db.routes.find((r) => r.id === trip.routeId)?.description}</td>
                    <td className="px-3 py-2">{trip.bay}</td>
                    <td className="px-3 py-2">
                      {takenSeats(db, trip.id).size} / {trip.busId ? seatCapacity(db, trip) : "-"}
                    </td>
                    <td className="px-3 py-2">
                      {group}
                      {group === "Not Selling" && (
                        <span className="text-xs text-slate-500">
                          {" "}
                          · {!trip.busId ? "no unit yet" : trip.stopSelling ? "stopped" : "past departure"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canSell && (group === "Selling" || group === "Last Few Seats") && (
                        <Link className="text-brand underline" href={`/pos?trip=${trip.id}`}>
                          Sell
                        </Link>
                      )}
                      {!trip.busId && group === "Not Selling" && db.session && canAccess(db.session.role, "/units") && (
                        <Link className="text-brand underline" href="/units">
                          Set unit
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    No trips in this group today.
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
