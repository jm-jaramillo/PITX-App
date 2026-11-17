"use client";

import Link from "next/link";
import { useState } from "react";
import { todayManila } from "@/lib/format";
import { ticketHref } from "@/lib/paths";
import { routeName } from "@/lib/reports";
import { scopedTrips, setBoarded, tripCompanyId, useDb } from "@/lib/store";
import { PageTitle } from "@/components/page-title";

// Passenger Manifest (entry 35): every ticket buyer on a trip, Boarded or Not boarded. Pick
// the route, date and departure time. Refunded or voided tickets drop off the list on their
// own. Boarding can be marked by hand when the gate fails, and is not undone here.

export default function ManifestPage() {
  const db = useDb();
  const [date, setDate] = useState(todayManila());
  const [routeId, setRouteId] = useState("");
  const [time, setTime] = useState("");

  const dayTrips = scopedTrips(db).filter((t) => t.date === date && t.status !== "Cancelled");
  const routeIds = [...new Set(dayTrips.map((t) => t.routeId))];
  const routes = db.routes
    .filter((r) => routeIds.includes(r.id))
    .sort((a, b) => routeName(a.description).localeCompare(routeName(b.description)));
  const times = [...new Set(dayTrips.filter((t) => t.routeId === routeId).map((t) => t.time))].sort();
  const trip = dayTrips.find((t) => t.routeId === routeId && t.time === time);
  const route = db.routes.find((r) => r.id === trip?.routeId);
  const company = db.companies.find((c) => c.id === (trip ? tripCompanyId(db, trip) : ""));
  const bus = db.buses.find((b) => b.id === trip?.busId);
  const tickets = db.tickets
    .filter((t) => t.tripId === trip?.id && t.status !== "Voided")
    .sort((a, b) => a.seatNo - b.seatNo);
  const boarded = tickets.filter((t) => t.status === "Boarded").length;
  const isAdmin = db.session?.role === "PITX Admin";

  return (
    <div className="space-y-4">
      <PageTitle sub="All ticket buyers on a trip, boarded and not boarded. Refunded tickets drop off on their own.">
        Passenger Manifest
      </PageTitle>
      <div className="no-print grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <label>
          Route
          <select
            value={routeId}
            onChange={(e) => {
              setRouteId(e.target.value);
              setTime("");
            }}
          >
            <option value="">Select one</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {routeName(r.description)}
                {isAdmin ? ` · ${db.companies.find((c) => c.id === r.companyId)?.code ?? ""}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setRouteId("");
              setTime("");
            }}
          />
        </label>
        <label>
          Departure time
          <select value={time} disabled={!routeId} onChange={(e) => setTime(e.target.value)}>
            <option value="">Select one</option>
            {times.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      {trip && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="text-sm">
              <div className="font-semibold">
                {routeName(route?.description ?? "")} · {trip.date} {trip.time}
              </div>
              <div className="text-slate-600">
                {company?.code} · {trip.tripNo} · {bus?.plateNo ?? "No unit yet"} · Bay {trip.bay || "-"} · {trip.status}
              </div>
              <div className="text-slate-600">
                Ticket buyers: {tickets.length} · Boarded: {boarded} · Not boarded: {tickets.length - boarded}
              </div>
            </div>
            <button className="no-print rounded bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={() => window.print()}>
              Print manifest
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Seat</th>
                  <th className="px-3 py-2">Passenger</th>
                  <th className="px-3 py-2">Ticket No.</th>
                  <th className="px-3 py-2">Passenger type</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Status</th>
                  {isAdmin && <th className="no-print px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{t.seatNo}</td>
                    <td className="px-3 py-2">{t.passengerName}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link className="text-brand underline" href={ticketHref(t.id)}>
                        {t.ticketNo}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{t.fareType}</td>
                    <td className="px-3 py-2">{t.source === "Counter" ? "On-site" : "Online"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          t.status === "Boarded" ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {t.status === "Boarded" ? "Boarded" : "Not boarded"}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="no-print px-3 py-2 text-right">
                        {/* Boarding comes from the gate. This is the manual exception when the gate fails. */}
                        {t.status !== "Boarded" && (
                          <button className="text-brand underline" onClick={() => setBoarded(t.id, true)}>
                            Mark boarded
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {tickets.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                      No tickets sold for this trip yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
