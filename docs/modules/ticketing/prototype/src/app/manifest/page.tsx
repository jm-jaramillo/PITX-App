"use client";

import Link from "next/link";
import { useState } from "react";
import { peso, todayManila } from "@/lib/format";
import { ticketHref } from "@/lib/paths";
import { scopedTrips, setBoarded, useDb } from "@/lib/store";

export default function ManifestPage() {
  const db = useDb();
  const [date, setDate] = useState(todayManila());
  const [tripId, setTripId] = useState("");

  const trips = scopedTrips(db).filter((t) => t.date === date).sort((a, b) => a.time.localeCompare(b.time));
  const trip = trips.find((t) => t.id === tripId);
  const route = db.routes.find((r) => r.id === trip?.routeId);
  const bus = db.buses.find((b) => b.id === trip?.busId);
  const tickets = db.tickets
    .filter((t) => t.tripId === tripId && t.status !== "Voided")
    .sort((a, b) => a.seatNo - b.seatNo);
  const boarded = tickets.filter((t) => t.status === "Boarded").length;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Passenger Manifest and Boarding Report</h1>
      <div className="no-print grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setTripId("");
            }}
          />
        </label>
        <label className="sm:col-span-2">
          Trip
          <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
            <option value="">Select one</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.time} · {db.routes.find((r) => r.id === t.routeId)?.description} · {t.tripNo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {trip && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="text-sm">
              <div className="font-semibold">
                {trip.tripNo} · {route?.description}
              </div>
              <div className="text-slate-600">
                {trip.date} {trip.time} · {bus?.plateNo} · Bay {trip.bay || "-"} · {trip.status}
              </div>
              <div className="text-slate-600">
                Passengers: {tickets.length} · Boarded: {boarded}
              </div>
            </div>
            <button
              className="no-print rounded bg-brand px-4 py-2 text-sm font-semibold text-white"
              onClick={() => window.print()}
            >
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
                  <th className="px-3 py-2">Fare type</th>
                  <th className="px-3 py-2">Fare</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="no-print px-3 py-2"></th>
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
                    <td className="px-3 py-2">{peso(t.fare)}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="no-print px-3 py-2 text-right">
                      {/* Boarding comes from the gate. This is the manual exception when the gate fails. */}
                      {db.session?.role === "Super Admin" && (
                        <button
                          className="text-brand underline"
                          onClick={() => setBoarded(t.id, t.status !== "Boarded")}
                        >
                          {t.status === "Boarded" ? "Undo" : "Mark boarded"}
                        </button>
                      )}
                    </td>
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
