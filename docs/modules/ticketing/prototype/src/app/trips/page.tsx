"use client";

import { Fragment, useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { dateTimeManila, peso, todayManila } from "@/lib/format";
import {
  addSeatMark,
  AVAILABILITY_STATUSES,
  computeFare,
  departurePassed,
  removeSeatMark,
  scopedTrips,
  seatCapacity,
  takenSeats,
  ticketAvailability,
  tripCompanyId,
  updateTrip,
  useDb,
} from "@/lib/store";
import { SEAT_MARK_TYPES, type SeatMarkType, type Trip } from "@/lib/types";
import { PageTitle } from "@/components/page-title";

// Daily Trips, with Ticket Availability folded in (entry 31). Everyone sees the trips they
// can reach (bus company staff: their own company) and the seats left. Only the PITX Admin
// stops selling, blocks seats and reads the log.

const STATUS_STYLE: Record<string, string> = {
  Available: "bg-green-100 text-green-900",
  "Last Few Seats": "bg-amber-100 text-amber-900",
  "Sold Out": "bg-accent text-white",
  "On-Hold": "bg-slate-200 text-slate-800",
};

const FILTERS = ["All", "Still to leave", ...AVAILABILITY_STATUSES] as const;
type Filter = (typeof FILTERS)[number];

/** A trip still open: not cancelled, not departed, departure time not passed. */
const stillToLeave = (t: Trip) => t.status !== "Cancelled" && t.status !== "Departed" && !departurePassed(t);

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
  const [filter, setFilter] = useState<Filter>("All");
  const admin = db.session?.role === "PITX Admin";

  const reachable = scopedTrips(db);
  const routeOf = (t: Trip) => db.routes.find((r) => r.id === t.routeId);
  const destinations = [...new Set(reachable.map((t) => routeOf(t)?.description ?? ""))].filter(Boolean).sort();
  const dayTrips = reachable
    .filter((t) => t.date === date)
    .filter((t) => !destination || routeOf(t)?.description === destination)
    .sort((a, b) => a.time.localeCompare(b.time));
  // Availability only means something for trips still to leave.
  const availabilityOf = (t: Trip) => (stillToLeave(t) ? ticketAvailability(db, t) : null);
  const matches = (t: Trip, f: Filter) =>
    f === "All" ? true : f === "Still to leave" ? stillToLeave(t) : availabilityOf(t)?.status === f;
  const trips = dayTrips.filter((t) => matches(t, filter));
  const columns = admin ? 12 : 10;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <PageTitle
          className="mr-auto"
          sub={
            admin
              ? "Trips, times, bays and units come from Trip Scheduling, and the status (Boarding, Departed) from TOS. Seats left is what the PIDS screens show. Here you stop or resume selling, block seats and read the log."
              : "Your company's trips with the seats left, the same numbers the PIDS screens show. Times, bays and units come from Trip Scheduling."
          }
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

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              filter === f ? "border-brand bg-brand font-semibold text-white" : "border-slate-300 bg-white"
            }`}
          >
            {f} · {dayTrips.filter((t) => matches(t, f)).length}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-xs">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Trip</th>
              <th className="px-3 py-2">Bus company</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2">Bus</th>
              <th className="px-3 py-2">Bay</th>
              <th className="px-3 py-2 text-right">Fare</th>
              <th className="px-3 py-2 text-right">Sold</th>
              <th className="px-3 py-2">Seats left</th>
              <th className="px-3 py-2">Trip status</th>
              {admin && <th className="px-3 py-2">Selling</th>}
              {admin && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => {
              const log = db.audit.filter((a) => a.tripId === trip.id).slice().reverse();
              const route = routeOf(trip);
              const bus = db.buses.find((b) => b.id === trip.busId);
              const availability = availabilityOf(trip);
              const remark = trip.cancelRemark ?? trip.remark;
              return (
                <Fragment key={trip.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-2">{trip.time}</td>
                    <td className="px-3 py-2">{trip.tripNo}</td>
                    <td className="px-3 py-2">
                      <CompanyLogo company={db.companies.find((c) => c.id === tripCompanyId(db, trip))} className="h-6 w-24 object-left" />
                    </td>
                    <td className="px-3 py-2">{route?.description}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {bus ? `${bus.plateNo}${bus.aircon ? " · Aircon" : ""}` : "Not set"}
                    </td>
                    <td className="px-3 py-2">{trip.bay}</td>
                    <td className="px-3 py-2 text-right">{route ? peso(computeFare(route, "Adult")) : "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {takenSeats(db, trip.id).size} / {seatCapacity(db, trip)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {availability ? (
                        <>
                          <span className="mr-2 font-semibold tabular-nums">{trip.busId ? availability.left : "-"}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[availability.status]}`}>
                            {availability.status}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span title="From TOS">{trip.status}</span>
                      {remark && <span className="block text-xs text-slate-500">{remark}</span>}
                    </td>
                    {admin && (
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
                    )}
                    {admin && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button
                          aria-expanded={openLog === trip.id}
                          className="text-brand underline"
                          onClick={() => setOpenLog(openLog === trip.id ? "" : trip.id)}
                        >
                          Manage ({log.length} log)
                        </button>
                      </td>
                    )}
                  </tr>
                  {admin && openLog === trip.id && (
                    <tr>
                      <td colSpan={columns} className="bg-brand-tint px-3 py-3">
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
                <td colSpan={columns} className="px-3 py-6 text-center text-slate-500">
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
