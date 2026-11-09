"use client";

import { Fragment, useState, type FormEvent } from "react";
import { dateTimeManila, todayManila } from "@/lib/format";
import {
  addSeatMark,
  cancelTrip,
  editTrip,
  removeSeatMark,
  saveTrip,
  seatCapacity,
  takenSeats,
  updateTrip,
  useDb,
} from "@/lib/store";
import { SEAT_MARK_TYPES, TRIP_STATUSES, type SeatMarkType, type Trip, type TripStatus } from "@/lib/types";
import { PageTitle } from "@/components/page-title";

const EMPTY_FORM = { time: "", routeId: "", busId: "", bay: "", remark: "" };

function TripTools({ trip }: { trip: Trip }) {
  const [time, setTime] = useState(trip.time);
  const [tripNo, setTripNo] = useState(trip.tripNo);
  const [cancelRemark, setCancelRemark] = useState("");
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
        <div className="grid gap-3 lg:grid-cols-2">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setMessage(editTrip(trip.id, { time, tripNo }));
            }}
          >
            <label>
              Trip no.
              <input value={tripNo} onChange={(e) => setTripNo(e.target.value)} />
            </label>
            <label>
              Time
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <button className="rounded bg-brand px-3 py-2 text-xs font-semibold text-white">Save trip</button>
          </form>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setMessage(cancelTrip(trip.id, cancelRemark));
            }}
          >
            <label className="flex-1">
              Cancel remark
              <input value={cancelRemark} onChange={(e) => setCancelRemark(e.target.value)} />
            </label>
            <button className="rounded bg-accent px-3 py-2 text-xs font-semibold text-white">Cancel trip</button>
          </form>
        </div>
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
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [openLog, setOpenLog] = useState("");

  const destinations = [...new Set(db.routes.map((r) => r.denomination).filter(Boolean))] as string[];
  const trips = db.trips
    .filter((t) => t.date === date)
    .filter((t) => !destination || db.routes.find((r) => r.id === t.routeId)?.denomination === destination)
    .sort((a, b) => a.time.localeCompare(b.time));

  function submit(event: FormEvent) {
    event.preventDefault();
    const problem = saveTrip({ ...form, date });
    setError(problem);
    if (!problem) setForm(EMPTY_FORM);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <PageTitle className="mr-auto">Daily Trip Management</PageTitle>
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

      <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Add trip for {date}</h2>
        <p className="mb-3 text-xs text-slate-600">The PUB Admin sets the unit after the trip is added.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label>
            Route
            <select
              required
              value={form.routeId}
              onChange={(e) => setForm({ ...form, routeId: e.target.value, busId: "" })}
            >
              <option value="">Select one</option>
              {db.routes
                .filter((r) => r.status === "Active")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Departure time
            <input required type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </label>
          <label>
            Bay
            <input value={form.bay} onChange={(e) => setForm({ ...form, bay: e.target.value })} />
          </label>
          <label>
            Remark
            <input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </label>
          <button className="self-end rounded bg-brand px-4 py-2 text-sm font-semibold text-white">Add trip</button>
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </form>

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
                      <select
                        aria-label={`Status of ${trip.tripNo}`}
                        className="!mt-0"
                        value={trip.status}
                        onChange={(e) => updateTrip(trip.id, { status: e.target.value as TripStatus })}
                      >
                        {TRIP_STATUSES.filter((s) => s !== "Cancelled" || trip.status === "Cancelled").map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
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
