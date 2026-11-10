"use client";

import { Fragment, useState } from "react";
import { dateTimeManila, todayManila } from "@/lib/format";
import {
  addSeatMark,
  removeSeatMark,
  seatCapacity,
  takenSeats,
  updateTrip,
  useDb,
} from "@/lib/store";
import { SEAT_MARK_TYPES, type SeatMarkType, type Trip } from "@/lib/types";
import { PageTitle } from "@/components/page-title";

function TripTools({ trip }: { trip: Trip }) {
  const [seats, setSeats] = useState("");
  const [markType, setMarkType] = useState<SeatMarkType>("Temporary Block");
  const [minutes, setMinutes] = useState("30");
  const [message, setMessage] = useState<string | null>(null);
  const open = trip.status !== "Cancelled" && trip.status !== "Departed";

  return (
    <div className="mb-3 space-y-3">
      {message && (
        <p role="alert" className="text-sm text-red-700">
          {message}
        </p>
      )}
      {open && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const seatNos = seats.split(/[\s,]+/).filter(Boolean).map(Number);
            const problem = addSeatMark(trip.id, seatNos, markType, Number(minutes));
            setMessage(problem);
            if (!problem) setSeats("");
          }}
        >
          <label>
            Seats (e.g. 3, 4)
            <input value={seats} onChange={(e) => setSeats(e.target.value)} />
          </label>
          <label>
            Seat marking
            <select value={markType} onChange={(e) => setMarkType(e.target.value as SeatMarkType)}>
              {SEAT_MARK_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {markType !== "Permanent Block" && (
            <label>
              Minutes
              <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </label>
          )}
          <button className="rounded bg-brand px-3 py-2 text-xs font-semibold text-white">Mark seats</button>
        </form>
      )}
      {Boolean(trip.seatMarks?.length) && (
        <ul className="space-y-1 text-xs">
          {trip.seatMarks?.map((m) => (
            <li key={m.id}>
              Seat {m.seatNo} · {m.type}
              {m.until ? ` until ${dateTimeManila(m.until)}` : ""}{" "}
              <button type="button" className="text-brand underline" onClick={() => removeSeatMark(trip.id, m.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TripsPage() {
  const db = useDb();
  const [date, setDate] = useState(todayManila());
  const [destination, setDestination] = useState("");
  const [openLog, setOpenLog] = useState("");

  const destinations = [...new Set(db.routes.map((r) => r.description))].sort();
  const trips = db.trips
    .filter((t) => t.date === date)
    .filter((t) => !destination || db.routes.find((r) => r.id === t.routeId)?.description === destination)
    .sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <PageTitle
          className="mr-auto"
          sub="Trips, times, bays and units come from Trip Scheduling, and the status (Boarding, Departed) from TOS. Here you only stop or resume selling, block seats and read the log."
        >
          Daily Trips
        </PageTitle>
        <label>
          Destination
          <select value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="">All</option>
            {destinations.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-xs">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Trip</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2">Bus</th>
              <th className="px-3 py-2">Bay</th>
              <th className="px-3 py-2">Seats sold</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Selling</th>
              <th className="px-3 py-2">Remark</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => {
              const log = db.audit.filter((a) => a.tripId === trip.id).slice().reverse();
              return (
                <Fragment key={trip.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-2">{trip.time}</td>
                    <td className="px-3 py-2">{trip.tripNo}</td>
                    <td className="px-3 py-2">{db.routes.find((r) => r.id === trip.routeId)?.description}</td>
                    <td className="px-3 py-2">{db.buses.find((b) => b.id === trip.busId)?.plateNo ?? "Not set"}</td>
                    <td className="px-3 py-2">{trip.bay}</td>
                    <td className="px-3 py-2">
                      {takenSeats(db, trip.id).size} / {seatCapacity(db, trip)}
                    </td>
                    <td className="px-3 py-2">
                      <span title="From TOS">{trip.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <label className="!font-normal whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={Boolean(trip.stopSelling)}
                          onChange={(e) => updateTrip(trip.id, { stopSelling: e.target.checked })}
                        />
                        Stop selling
                      </label>
                    </td>
                    <td className="px-3 py-2">{trip.cancelRemark ?? trip.remark}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        aria-expanded={openLog === trip.id}
                        className="text-brand underline"
                        onClick={() => setOpenLog(openLog === trip.id ? "" : trip.id)}
                      >
                        Manage ({log.length} log)
                      </button>
                    </td>
                  </tr>
                  {openLog === trip.id && (
                    <tr>
                      <td colSpan={10} className="bg-brand-tint px-3 py-3">
                        <TripTools key={trip.id} trip={trip} />
                        {log.length === 0 && <p className="text-xs text-slate-600">No log entries yet.</p>}
                        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-slate-700">
                          {log.map((a) => (
                            <li key={a.id}>
                              {dateTimeManila(a.at)} · {a.by} · <span className="font-medium">{a.action}</span> · {a.detail}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {trips.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                  No trips here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
