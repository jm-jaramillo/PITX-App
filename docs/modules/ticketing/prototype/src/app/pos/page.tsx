"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { SeatMap } from "@/components/seat-map";
import { peso, todayManila } from "@/lib/format";
import {
  computeFare,
  issueTickets,
  scopedTrips,
  seatCapacity,
  sellingBlock,
  sellingClosed,
  takenSeats,
  ticketAvailability,
  tripSeating,
  useDb,
  type PassengerInput,
} from "@/lib/store";
import { FARE_TYPES, PAYMENT_METHODS, type FareType, type PaymentMethod } from "@/lib/types";

const TIME_RANGES = {
  All: () => true,
  Morning: (hour: number) => hour < 12,
  Afternoon: (hour: number) => hour >= 12 && hour < 18,
  Evening: (hour: number) => hour >= 18,
};

function Pos() {
  const db = useDb();
  const router = useRouter();
  const params = useSearchParams();
  const today = todayManila();
  const reachable = scopedTrips(db);
  const [date, setDate] = useState(() => {
    const fromUrl = reachable.find((t) => t.id === params.get("trip"));
    return fromUrl && fromUrl.date > today ? fromUrl.date : today;
  });
  const [tripId, setTripId] = useState(params.get("trip") ?? "");
  const [passengers, setPassengers] = useState<PassengerInput[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [tendered, setTendered] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [provinceId, setProvinceId] = useState("");
  const [townId, setTownId] = useState("");
  const [letter, setLetter] = useState("");
  const [timeRange, setTimeRange] = useState<keyof typeof TIME_RANGES>("All");

  const openTrips = reachable
    .filter((t) => t.date === date && !sellingClosed(db, t) && (t.status === "Scheduled" || t.status === "Boarding"))
    .sort((a, b) => a.time.localeCompare(b.time));
  const routeOf = (routeId: string) => db.routes.find((r) => r.id === routeId);
  const destinationOf = (routeId: string) => {
    const route = routeOf(routeId);
    return db.towns.find((t) => t.id === route?.townId)?.description ?? route?.denomination ?? route?.description ?? "";
  };
  const openRoutes = [...new Set(openTrips.map((t) => t.routeId))];
  const provinceIds = new Set(openRoutes.map((id) => routeOf(id)?.provinceId));
  const townIds = new Set(openRoutes.filter((id) => !provinceId || routeOf(id)?.provinceId === provinceId).map((id) => routeOf(id)?.townId));
  const letters = [...new Set(openRoutes.map((id) => destinationOf(id).charAt(0).toUpperCase()))].sort();
  const trips = openTrips
    .filter((t) => !provinceId || routeOf(t.routeId)?.provinceId === provinceId)
    .filter((t) => !townId || routeOf(t.routeId)?.townId === townId)
    .filter((t) => !letter || destinationOf(t.routeId).toUpperCase().startsWith(letter))
    .filter((t) => TIME_RANGES[timeRange](Number(t.time.slice(0, 2))));
  const trip = trips.find((t) => t.id === tripId);
  const route = db.routes.find((r) => r.id === trip?.routeId);
  const seating = trip ? tripSeating(db, trip) : null;
  const capacity = trip ? seatCapacity(db, trip) : 0;
  const taken = trip ? takenSeats(db, trip.id) : new Set<number>();
  const block = trip ? sellingBlock(db, trip, today) : null;
  const counterId = db.session?.counterId;
  const insurance = db.settings.insurancePrice;
  const total = route ? passengers.reduce((sum, p) => sum + computeFare(route, p.fareType, counterId) + insurance, 0) : 0;
  const received = Number(tendered);
  const change = tendered && received >= total ? received - total : null;
  const canCharge = Boolean(db.session?.counterId);

  function toggleSeat(seatNo: number) {
    setError(null);
    setPassengers((current) =>
      current.some((p) => p.seatNo === seatNo)
        ? current.filter((p) => p.seatNo !== seatNo)
        : [...current, { seatNo, passengerName: "", contactNo: "", email: "", fareType: "Adult", idNo: "" }],
    );
  }

  function editPassenger(seatNo: number, changes: Partial<PassengerInput>) {
    setPassengers((current) => current.map((p) => (p.seatNo === seatNo ? { ...p, ...changes } : p)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = issueTickets({ tripId, passengers, paymentMethod, tendered: received, paymentRef }, today);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(`/tickets/group/${result.tickets![0].groupId}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">POS Ticketing</h1>
      {!canCharge && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Sign in with a counter to sell tickets.
        </p>
      )}
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <label>
              Date
              <input
                type="date"
                min={today}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setTripId("");
                  setPassengers([]);
                }}
              />
            </label>
            <label className="sm:col-span-2">
              Trip
              <select
                value={trip?.id ?? ""}
                onChange={(e) => {
                  setTripId(e.target.value);
                  setPassengers([]);
                  setError(null);
                }}
              >
                <option value="">{trips.length ? "Select one" : "No upcoming trips for your company on this date"}</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.time} · {db.routes.find((r) => r.id === t.routeId)?.description} · {t.tripNo} ·{" "}
                    {t.busId
                      ? `${ticketAvailability(db, t).left} left · ${ticketAvailability(db, t).status}`
                      : "unit not set"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Province
                <select
                  value={provinceId}
                  onChange={(e) => {
                    setProvinceId(e.target.value);
                    setTownId("");
                  }}
                >
                  <option value="">All</option>
                  {db.provinces
                    .filter((p) => provinceIds.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.description}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Town
                <select value={townId} onChange={(e) => setTownId(e.target.value)}>
                  <option value="">All</option>
                  {db.towns
                    .filter((t) => townIds.has(t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.description}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="First letter of destination">
              <span className="mr-1 text-xs font-semibold text-slate-600">Destination</span>
              {["", ...letters].map((l) => (
                <button
                  key={l || "all"}
                  type="button"
                  aria-pressed={letter === l}
                  onClick={() => setLetter(l)}
                  className={`rounded border px-2.5 py-1 text-sm ${letter === l ? "border-brand bg-brand font-semibold text-white" : "border-slate-300 bg-white"}`}
                >
                  {l || "All"}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Time of day">
              <span className="mr-1 text-xs font-semibold text-slate-600">Time</span>
              {(Object.keys(TIME_RANGES) as (keyof typeof TIME_RANGES)[]).map((range) => (
                <button
                  key={range}
                  type="button"
                  aria-pressed={timeRange === range}
                  onClick={() => setTimeRange(range)}
                  className={`rounded border px-2.5 py-1 text-sm ${timeRange === range ? "border-brand bg-brand font-semibold text-white" : "border-slate-300 bg-white"}`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {block && (
            <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {block}
            </p>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">
              Seat map {trip && trip.busId ? `· ${capacity - taken.size} of ${capacity} open` : ""} · pick one or more
              seats
            </h2>
            {seating?.layout ? (
              <SeatMap
                layout={seating.layout}
                taken={taken}
                blocked={seating.blocked}
                selected={passengers.map((p) => p.seatNo)}
                onSelect={toggleSeat}
              />
            ) : (
              <p className="text-sm text-slate-500">
                {trip ? "The seat map appears once the PUB Admin sets the unit." : "Select a trip to see its seats."}
              </p>
            )}
          </div>
        </div>

        <form noValidate onSubmit={submit} className="h-fit space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          {passengers.length === 0 && <p className="text-sm text-slate-500">Select a seat to start.</p>}
          {passengers.map((p) => (
            <fieldset key={p.seatNo} className="space-y-2 rounded border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold text-slate-600">
                Seat {p.seatNo}
                {route ? ` · ${peso(computeFare(route, p.fareType, counterId))}` : ""}
              </legend>
              <label>
                Passenger name
                <input
                  value={p.passengerName}
                  onChange={(e) => editPassenger(p.seatNo, { passengerName: e.target.value })}
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label>
                  Contact no. (optional)
                  <input
                    inputMode="tel"
                    value={p.contactNo}
                    onChange={(e) => editPassenger(p.seatNo, { contactNo: e.target.value })}
                  />
                </label>
                <label>
                  Email (optional)
                  <input
                    type="email"
                    value={p.email}
                    onChange={(e) => editPassenger(p.seatNo, { email: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Fare type
                <select
                  value={p.fareType}
                  onChange={(e) => editPassenger(p.seatNo, { fareType: e.target.value as FareType })}
                >
                  {FARE_TYPES.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              {p.fareType !== "Adult" && (
                <label>
                  {p.fareType} ID no.
                  <input value={p.idNo} onChange={(e) => editPassenger(p.seatNo, { idNo: e.target.value })} />
                </label>
              )}
            </fieldset>
          ))}
          <label>
            Payment
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          {paymentMethod === "Cash" ? (
            <label>
              Cash received
              <input type="number" min={0} step="any" value={tendered} onChange={(e) => setTendered(e.target.value)} />
            </label>
          ) : (
            <label>
              {paymentMethod} reference no.
              <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
            </label>
          )}
          <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between">
              <span>
                {passengers.length} ticket{passengers.length === 1 ? "" : "s"}
                {insurance > 0 && passengers.length > 0 ? `, including ${peso(insurance)} insurance each` : ""}
              </span>
              <span className="text-lg font-semibold">{peso(total)}</span>
            </div>
            {paymentMethod === "Cash" && change !== null && (
              <div className="flex justify-between font-semibold text-green-800">
                <span>Change</span>
                <span>{peso(change)}</span>
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={!trip || passengers.length === 0 || Boolean(block) || !canCharge}
            className="w-full rounded bg-accent py-2.5 font-semibold text-white hover:bg-accent-dark disabled:opacity-40"
          >
            Record payment and issue {passengers.length > 1 ? `${passengers.length} tickets` : "ticket"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PosPage() {
  return (
    <Suspense>
      <Pos />
    </Suspense>
  );
}
