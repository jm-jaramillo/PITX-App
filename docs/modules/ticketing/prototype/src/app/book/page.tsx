"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PageTitle } from "@/components/page-title";
import { SeatMap } from "@/components/seat-map";
import { peso, todayManila } from "@/lib/format";
import { groupHref, ticketHref } from "@/lib/paths";
import {
  bookOnline,
  computeFare,
  heldByOthers,
  holdSeat,
  myHolds,
  releaseSeats,
  sellingBlock,
  sellingClosed,
  takenSeats,
  ticketAvailability,
  tripCompanyId,
  tripSeating,
  useDb,
  type PassengerInput,
} from "@/lib/store";
import { FARE_TYPES, type FareType } from "@/lib/types";

type OnlineMethod = "E-Wallet" | "Card";

/** The passenger's own online booking: pick a trip, hold seats, pay, get the e-ticket. */
export default function BookPage() {
  const db = useDb();
  const router = useRouter();
  const today = todayManila();
  const [date, setDate] = useState(today);
  const [destination, setDestination] = useState("");
  const [tripId, setTripId] = useState("");
  const [passengers, setPassengers] = useState<PassengerInput[]>([]);
  const [method, setMethod] = useState<OnlineMethod>("E-Wallet");
  const [paymentRef, setPaymentRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  const routeOf = (id: string) => db.routes.find((r) => r.id === id);
  const open = db.trips
    .filter((t) => t.date === date && t.busId && !sellingClosed(db, t) && (t.status === "Scheduled" || t.status === "Boarding"))
    .sort((a, b) => a.time.localeCompare(b.time));
  const destinations = [...new Set(open.map((t) => routeOf(t.routeId)?.description ?? ""))].sort();
  const trips = open.filter((t) => !destination || routeOf(t.routeId)?.description === destination);
  const trip = trips.find((t) => t.id === tripId);
  const route = trip ? routeOf(trip.routeId) : undefined;
  const seating = trip ? tripSeating(db, trip) : null;
  const block = trip ? sellingBlock(db, trip, today) : null;
  const holdUntil = trip ? myHolds(db, trip).at(0)?.until : undefined;
  const insurance = db.settings.insurancePrice;
  const total = route ? passengers.reduce((sum, p) => sum + computeFare(route, p.fareType) + insurance, 0) : 0;
  const mine = db.tickets
    .filter((t) => t.bookedBy === db.session?.name && t.source === "Online")
    .slice()
    .reverse();

  function changeTrip(next: string) {
    if (tripId) releaseSeats(tripId);
    setTripId(next);
    setPassengers([]);
    setError(null);
  }

  function toggleSeat(seatNo: number) {
    setError(null);
    if (passengers.some((p) => p.seatNo === seatNo)) {
      releaseSeats(tripId, [seatNo]);
      setPassengers((current) => current.filter((p) => p.seatNo !== seatNo));
      return;
    }
    const problem = holdSeat(tripId, seatNo);
    if (problem) return setError(problem);
    const first = passengers.length === 0 ? db.session?.name ?? "" : "";
    setPassengers((current) => [...current, { seatNo, passengerName: first, contactNo: "", email: "", fareType: "Adult", idNo: "" }]);
  }

  function edit(seatNo: number, changes: Partial<PassengerInput>) {
    setPassengers((current) => current.map((p) => (p.seatNo === seatNo ? { ...p, ...changes } : p)));
  }

  function pay(event: FormEvent) {
    event.preventDefault();
    const result = bookOnline({ tripId, passengers, paymentMethod: method, paymentRef }, today);
    if (result.error) return setError(result.error);
    router.push(groupHref(result.tickets![0].groupId!));
  }

  return (
    <div className="space-y-4">
      <PageTitle sub="Pick a trip and your seats. Seats you pick are held for you while you pay, so nobody else can take them.">
        Book a Trip
      </PageTitle>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label>
          Travel date
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              changeTrip("");
            }}
          />
        </label>
        <label>
          Going to
          <select
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value);
              changeTrip("");
            }}
          >
            <option value="">Anywhere</option>
            {destinations.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {trips.map((t) => {
          const a = ticketAvailability(db, t);
          const company = db.companies.find((c) => c.id === tripCompanyId(db, t));
          const r = routeOf(t.routeId);
          const soldOut = a.status === "Sold Out" || a.status === "On-Hold";
          return (
            <button
              key={t.id}
              type="button"
              disabled={soldOut}
              aria-pressed={t.id === tripId}
              onClick={() => changeTrip(t.id)}
              className={`rounded-lg border p-3 text-left text-sm disabled:opacity-50 ${t.id === tripId ? "border-brand bg-brand-tint" : "border-slate-200 bg-white"}`}
            >
              <div className="flex justify-between font-semibold">
                <span>
                  {t.time} · {r?.description}
                </span>
                <span>{r ? peso(r.price) : ""}</span>
              </div>
              <div className="text-slate-600">
                {company?.name} · {a.status === "Available" ? `${a.left} seats left` : a.status}
              </div>
            </button>
          );
        })}
        {trips.length === 0 && <p className="text-sm text-slate-500">No trips open for booking on this date.</p>}
      </div>

      {trip && (
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="section-head mb-3">Pick your seats</p>
            {block && <p className="mb-3 text-sm text-red-700">{block}</p>}
            {seating?.layout && (
              <SeatMap
                layout={seating.layout}
                taken={takenSeats(db, trip.id)}
                blocked={seating.blocked}
                held={heldByOthers(db, trip)}
                selected={passengers.map((p) => p.seatNo)}
                onSelect={toggleSeat}
              />
            )}
          </div>
          <form noValidate onSubmit={pay} className="h-fit space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            {passengers.length === 0 && <p className="text-sm text-slate-500">Pick a seat to start.</p>}
            {passengers.length > 0 && holdUntil && (
              <p className="rounded bg-brand-tint p-2 text-xs">
                Held for you until{" "}
                {new Date(holdUntil).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" })}. Pay
                before then or the seats go back on sale.
              </p>
            )}
            {passengers.map((p) => (
              <fieldset key={p.seatNo} className="space-y-2 rounded border border-slate-200 p-3">
                <legend className="px-1 text-xs font-semibold text-slate-600">
                  Seat {p.seatNo}
                  {route ? ` · ${peso(computeFare(route, p.fareType))}` : ""}
                </legend>
                <label>
                  Passenger name
                  <input value={p.passengerName} onChange={(e) => edit(p.seatNo, { passengerName: e.target.value })} />
                </label>
                <label>
                  Fare type
                  <select value={p.fareType} onChange={(e) => edit(p.seatNo, { fareType: e.target.value as FareType })}>
                    {FARE_TYPES.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                {p.fareType !== "Adult" && (
                  <label>
                    {p.fareType} ID no. (show it at boarding)
                    <input value={p.idNo} onChange={(e) => edit(p.seatNo, { idNo: e.target.value })} />
                  </label>
                )}
              </fieldset>
            ))}
            <label>
              Pay with
              <select value={method} onChange={(e) => setMethod(e.target.value as OnlineMethod)}>
                <option>E-Wallet</option>
                <option>Card</option>
              </select>
            </label>
            <label>
              {method} reference no. (demo: type anything)
              <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
            </label>
            <div className="flex justify-between border-t border-slate-100 pt-3 text-sm">
              <span>
                {passengers.length} seat{passengers.length === 1 ? "" : "s"}
              </span>
              <span className="text-lg font-semibold">{peso(total)}</span>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={passengers.length === 0 || Boolean(block)}
              className="w-full rounded bg-accent py-2.5 font-semibold text-white hover:bg-accent-dark disabled:opacity-40"
            >
              Pay and reserve
            </button>
          </form>
        </div>
      )}

      <section className="space-y-2">
        <p className="section-head">My tickets</p>
        {mine.length === 0 ? (
          <p className="text-sm text-slate-500">No bookings yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {mine.map((t) => {
              const tr = db.trips.find((x) => x.id === t.tripId);
              return (
                <li key={t.id}>
                  <Link className="text-brand underline" href={ticketHref(t.id)}>
                    {t.ticketNo}
                  </Link>{" "}
                  · {t.passengerName} · {tr?.date} {tr?.time} · {routeOf(tr?.routeId ?? "")?.description} · seat {t.seatNo} ·{" "}
                  {t.status}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
