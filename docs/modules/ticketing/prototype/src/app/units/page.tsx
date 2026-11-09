"use client";

import { useState } from "react";
import { todayManila } from "@/lib/format";
import { getLayout } from "@/lib/seat-layouts";
import { assignUnit, scopedTrips, takenSeats, tripCompanyId, unitChangeImpact, useDb } from "@/lib/store";
import { PageTitle } from "@/components/page-title";

export default function UnitAssignmentPage() {
  const db = useDb();
  const [date, setDate] = useState(todayManila());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const trips = scopedTrips(db)
    .filter((t) => t.date === date && t.status !== "Cancelled" && t.status !== "Departed")
    .sort((a, b) => a.time.localeCompare(b.time));
  const waiting = trips.filter((t) => !t.busId).length;

  function seatLabel(busId: string): string {
    const bus = db.buses.find((b) => b.id === busId);
    const busType = db.busTypes.find((t) => t.id === bus?.busTypeId);
    return getLayout(busType?.layoutId)?.label ?? "-";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <PageTitle
          sub={
            <>
            Set the vehicle for each trip. Its seat arrangement becomes the seat map at the counter.
            {waiting > 0 && <span className="font-semibold text-amber-800"> {waiting} waiting for a unit.</span>}
          </>
          }
        >
          Unit Assignment
        </PageTitle>
        </div>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Trip</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Seat arrangement</th>
              <th className="px-3 py-2">Seats sold</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => {
              const companyId = tripCompanyId(db, trip);
              const units = db.buses.filter((b) => b.companyId === companyId && b.status === "Active");
              return (
                <tr key={trip.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{trip.time}</td>
                  <td className="px-3 py-2">{trip.tripNo}</td>
                  <td className="px-3 py-2">{db.routes.find((r) => r.id === trip.routeId)?.description}</td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Unit for ${trip.tripNo}`}
                      className="!mt-0"
                      value={trip.busId}
                      onChange={(e) => {
                        const impact = unitChangeImpact(db, trip, e.target.value);
                        const problem = assignUnit(trip.id, e.target.value);
                        setErrors({ ...errors, [trip.id]: problem ?? "" });
                        setNotes({
                          ...notes,
                          [trip.id]:
                            problem || !e.target.value || impact.kept + impact.manual === 0
                              ? ""
                              : `${impact.kept} kept their seat number.${impact.manual ? ` ${impact.manual} need manual transfer by the Teller.` : ""}`,
                        });
                      }}
                    >
                      <option value="">Not set</option>
                      {units.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.plateNo} {b.description ? `· ${b.description}` : ""}
                        </option>
                      ))}
                    </select>
                    {errors[trip.id] && (
                      <p role="alert" className="mt-1 text-xs text-red-700">
                        {errors[trip.id]}
                      </p>
                    )}
                    {notes[trip.id] && (
                      <p role="status" className="mt-1 text-xs text-amber-800">
                        {notes[trip.id]}
                      </p>
                    )}
                    {units.length === 0 && (
                      <p className="mt-1 text-xs text-slate-500">No units in Bus Info for this company.</p>
                    )}
                  </td>
                  <td className="px-3 py-2">{seatLabel(trip.busId)}</td>
                  <td className="px-3 py-2">{takenSeats(db, trip.id).size}</td>
                </tr>
              );
            })}
            {trips.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No open trips on this date.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
