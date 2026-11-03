"use client";

import Link from "next/link";
import { useState } from "react";
import { peso } from "@/lib/format";
import { ticketHref } from "@/lib/paths";
import { scopedTickets, useDb } from "@/lib/store";

const STATUSES = ["All", "Booked", "Issued", "Boarded", "Voided"];

export default function TicketsPage() {
  const db = useDb();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");

  const all = scopedTickets(db);
  const term = search.trim().toLowerCase();
  const rows = all
    .filter((t) => status === "All" || t.status === status)
    .filter(
      (t) =>
        !term ||
        t.ticketNo.toLowerCase().includes(term) ||
        t.passengerName.toLowerCase().includes(term) ||
        t.bookingRef?.toLowerCase().includes(term),
    )
    .slice()
    .reverse()
    .slice(0, 100);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold">Tickets and Bookings</h1>
        <label>
          Search name, ticket no. or booking ref
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              status === s ? "border-brand bg-brand font-semibold text-white" : "border-slate-300 bg-white"
            }`}
          >
            {s} · {s === "All" ? all.length : all.filter((t) => t.status === s).length}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Ticket No.</th>
              <th className="px-3 py-2">Booking ref</th>
              <th className="px-3 py-2">Passenger</th>
              <th className="px-3 py-2">Trip</th>
              <th className="px-3 py-2">Seat</th>
              <th className="px-3 py-2">Fare</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const trip = db.trips.find((x) => x.id === t.tripId);
              return (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link className="text-brand underline" href={ticketHref(t.id)}>
                      {t.ticketNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{t.bookingRef ?? "-"}</td>
                  <td className="px-3 py-2">{t.passengerName}</td>
                  <td className="px-3 py-2">
                    {trip?.tripNo} · {trip?.date} {trip?.time}
                  </td>
                  <td className="px-3 py-2">{t.seatNo}</td>
                  <td className="px-3 py-2">{peso(t.fare)}</td>
                  <td className="px-3 py-2">{t.source}</td>
                  <td className="px-3 py-2">{t.status}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  No tickets found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
