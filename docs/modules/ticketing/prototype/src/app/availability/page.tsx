"use client";

import { useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { peso, todayManila } from "@/lib/format";
import {
  AVAILABILITY_STATUSES,
  computeFare,
  departurePassed,
  scopedTrips,
  ticketAvailability,
  tripCompanyId,
  useDb,
} from "@/lib/store";
import { PageTitle } from "@/components/page-title";

const STATUS_STYLE: Record<string, string> = {
  Available: "bg-green-100 text-green-900",
  "Last Few Seats": "bg-amber-100 text-amber-900",
  "Sold Out": "bg-accent text-white",
  "On-Hold": "bg-slate-200 text-slate-800",
};

export default function AvailabilityPage() {
  const db = useDb();
  const [date, setDate] = useState(todayManila());
  const [status, setStatus] = useState("All");

  const trips = scopedTrips(db)
    .filter((t) => t.date === date && t.status !== "Cancelled" && t.status !== "Departed" && !departurePassed(t))
    .sort((a, b) => a.time.localeCompare(b.time));
  const rows = trips
    .map((trip) => ({ trip, ...ticketAvailability(db, trip) }))
    .filter((row) => status === "All" || row.status === status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <PageTitle
          sub={
            <>Live seats left for upcoming trips. This is the data the PIDS screens need.</>
          }
        >
          Ticket Availability
        </PageTitle>
        </div>
        <label>
          Date
          <input type="date" min={todayManila()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["All", ...AVAILABILITY_STATUSES] as const).map((s) => (
          <button
            key={s}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              status === s ? "border-brand bg-brand font-semibold text-white" : "border-slate-300 bg-white"
            }`}
          >
            {s} · {s === "All" ? trips.length : trips.filter((t) => ticketAvailability(db, t).status === s).length}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-xs">
            <tr>
              <th className="px-3 py-2">Departure</th>
              <th className="px-3 py-2">Bus company</th>
              <th className="px-3 py-2">Trip No.</th>
              <th className="px-3 py-2">Aircon</th>
              <th className="px-3 py-2">Destination</th>
              <th className="px-3 py-2 text-right">Fare</th>
              <th className="px-3 py-2 text-right">Available tickets</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ trip, status: rowStatus, left }) => {
              const route = db.routes.find((r) => r.id === trip.routeId);
              const bus = db.buses.find((b) => b.id === trip.busId);
              return (
                <tr key={trip.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{trip.time}</td>
                  <td className="px-3 py-2">
                    <CompanyLogo
                      company={db.companies.find((c) => c.id === tripCompanyId(db, trip))}
                      className="h-6 w-28 object-left"
                    />
                  </td>
                  <td className="px-3 py-2">{trip.tripNo}</td>
                  <td className="px-3 py-2">{bus ? (bus.aircon ? "Y" : "N") : "-"}</td>
                  <td className="px-3 py-2">{route?.denomination ?? route?.description}</td>
                  <td className="px-3 py-2 text-right">{route ? peso(computeFare(route, "Adult")) : "-"}</td>
                  <td className="px-3 py-2 text-right font-semibold">{trip.busId ? left : "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[rowStatus]}`}>
                      {rowStatus}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  No upcoming trips here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
