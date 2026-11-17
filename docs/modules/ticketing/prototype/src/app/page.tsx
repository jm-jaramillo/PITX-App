"use client";

import Link from "next/link";
import { peso, todayManila } from "@/lib/format";
import { ticketHref } from "@/lib/paths";
import { averageTicketTime, minSec } from "@/lib/reports";
import { routeDemand, scopedTickets, scopedTrips, ticketProblems, tripCompanyId, useDb } from "@/lib/store";
import { RouteDemandTable } from "@/components/route-demand";
import { PageTitle } from "@/components/page-title";
import { BarList, HourBars } from "@/components/charts";
import { PAYMENT_METHODS } from "@/lib/types";

export default function OverviewPage() {
  const db = useDb();
  const today = todayManila();
  const trips = scopedTrips(db)
    .filter((t) => t.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));
  const tripIds = new Set(trips.map((t) => t.id));
  const tickets = scopedTickets(db).filter((t) => tripIds.has(t.tripId));
  const sold = tickets.filter((t) => t.status !== "Voided");
  const problems = ticketProblems(db, today);
  const company = db.companies.find((c) => c.id === db.session?.companyId);

  const ticketGroups = [
    { label: "Tickets sold", value: String(sold.length), unit: "tickets" },
    { label: "Online", value: String(sold.filter((t) => t.source === "Online").length), unit: "tickets" },
    { label: "Boarded", value: String(tickets.filter((t) => t.status === "Boarded").length), unit: "passengers" },
    { label: "Refunded / voided", value: String(tickets.length - sold.length), unit: "tickets" },
    // Tellers count their cash blind at Close Sales, so they don't see the sales total.
    ...(db.session?.role === "Teller" ? [] : [{ label: "Farebox revenue", value: peso(sold.reduce((sum, t) => sum + t.fare, 0)), unit: "" }]),
  ];
  const isTeller = db.session?.role === "Teller";
  const isAdmin = db.session?.role === "PITX Admin";

  // KPI 11: average ticket time, on-site (first seat picked to payment) and online (first
  // seat held to payment). Tellers see their own on-site time.
  const target = db.settings.issueTargetSeconds;
  const scope = { companyId: db.session?.companyId ?? "", teller: isTeller ? db.session?.name : "" };
  const onSite = averageTicketTime(db, today, today, "Counter", scope);
  const online = averageTicketTime(db, today, today, "Online", scope);
  const times = isTeller ? [{ label: "Your average ticket time · On-site", t: onSite }] : [
    { label: "Average ticket time · On-site", t: onSite },
    { label: "Average ticket time · Online", t: online },
  ];
  const demand = isTeller ? [] : routeDemand(db, today);

  // Graphs: tickets sold by departure hour, how people paid, and (PITX Admin) by company.
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
      <PageTitle sub={`${company ? `${company.name} · ` : ""}Today, ${today}. Other days and the details are in Reports.`}>
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

      <section className="space-y-2">
        <p className="section-head">Ticketing and Boarding KPIs</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {times.map(({ label, t }) => (
            <div key={label} className="kpi" title="KPI 11: on-site from the first seat picked to payment, online from the first seat held to payment">
              <div className="kpi-label">{label}</div>
              <div className="kpi-value">
                <strong>{t.payments ? minSec(t.avgSeconds) : "-"}</strong>
                <span>{t.payments ? `${t.payments} payments · target ${minSec(target)}` : `target ${minSec(target)}`}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <p className="section-head mb-3">Tickets sold by departure hour</p>
          <HourBars data={hours} unit="tickets" />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="section-head mb-3">{isTeller ? "Tickets by payment mode" : "Farebox revenue by payment mode"}</p>
          <BarList data={byPayment} format={isTeller ? (v) => `${v} tickets` : peso} />
        </div>
        {isAdmin && topCompanies.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3">
            <p className="section-head mb-3">Tickets sold by bus company</p>
            <BarList data={topCompanies} format={(v) => `${v} tickets`} />
          </div>
        )}
      </section>

      {demand.length > 0 && (
        <section className="space-y-2">
          <p className="section-head">Passengers served by route</p>
          <RouteDemandTable rows={demand} top={5} showCompany={isAdmin} />
          <p className="text-xs text-slate-500">Click a group to see its top 5 routes. Load factor is boarded over seats available.</p>
        </section>
      )}

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

    </div>
  );
}
