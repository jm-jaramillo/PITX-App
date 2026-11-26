"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BusSeatPlan, seatSide } from "@/components/bus-seat-plan";
import { CompanyLogo } from "@/components/company-logo";
import { PageTitle } from "@/components/page-title";
import { InfoTip } from "@/components/info-tip";
import { peso, properCase, todayManila } from "@/lib/format";
import { groupHref, ticketHref } from "@/lib/paths";
import { provinceOf, regionOf, REGIONS, type Region } from "@/lib/places";
import { prioritySeats } from "@/lib/seat-layouts";
import {
  bookOnline,
  cancelBooking,
  computeFare,
  heldByOthers,
  holdSeat,
  myHolds,
  passengerCancelPlan,
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
import { FARE_TYPES, type Db, type FareType, type Trip } from "@/lib/types";

// The passenger's own booking, laid out like buying a cinema ticket:
//   1 Route: where to and when      2 Trip: the departure (like a screening time)
//   3 Seats: on the bus seat plan   4 Passengers: names and discounts
//   5 Payment: GCash, Maya, card or cash, then the e-ticket.
// Entry 43: a month calendar for the date, passenger types picked first (rows 1 and 2 are
// for senior citizens and PWDs only), no "from" prices or cheapest sort (fares are the same
// across operators), names in proper case, and cash payment.
// Seats picked in step 3 are held for the passenger until they pay (System Parameters,
// seat hold minutes), so nobody else can take them meanwhile.

const STEPS = ["Route", "Trip", "Seats", "Passengers", "Payment"] as const;
const DAYS_AHEAD = 31; // book up to a month ahead
// How many seats one booking can take (demo cap, like the bus lines' online booking limits).
const MAX_SEATS = 10;
const SORTS = ["Earliest", "Most seats"] as const;
type Sort = (typeof SORTS)[number];

type Wallet = "GCash" | "Maya" | "Card" | "Cash";
const WALLETS: { id: Wallet; label: string; note: string }[] = [
  { id: "GCash", label: "GCash", note: "E-wallet" },
  { id: "Maya", label: "Maya", note: "E-wallet" },
  { id: "Card", label: "Credit or debit card", note: "Visa, Mastercard" },
  { id: "Cash", label: "Cash", note: "Pay at 7-Eleven, Cebuana or M Lhuillier" },
];

const FARE_INFO: Record<FareType, { label: string; idLabel?: string; law?: string }> = {
  Adult: { label: "Regular" },
  Student: { label: "Student", idLabel: "School ID no.", law: "RA 11314" },
  Senior: { label: "Senior citizen", idLabel: "Senior citizen or OSCA ID no.", law: "RA 9994" },
  PWD: { label: "PWD", idLabel: "PWD ID no.", law: "RA 10754" },
};

const TIMES = ["Any time", "Morning", "Afternoon", "Evening"] as const;
type TimeOfDay = (typeof TIMES)[number];
const timeOfDay = (time: string): TimeOfDay => {
  const hour = Number(time.slice(0, 2));
  return hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
};

const placeOf = (description = "") => properCase(description.replace(/^PITX to /, ""));

/** Senior citizens and PWDs can sit in rows 1 and 2. */
const PRIORITY_TYPES: FareType[] = ["Senior", "PWD"];
/** Order seats are given out to passenger types: priority rows first to seniors, then PWDs. */
const ORDER: FareType[] = ["Adult", "Student", "Senior", "PWD"];

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
}

function dayLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", ...options }).format(new Date(`${date}T12:00:00+08:00`));
}

function time12(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Trips a passenger can still book on a date: a unit is set and selling hasn't closed. */
function openTrips(db: Db, date: string): Trip[] {
  return db.trips
    .filter((t) => t.date === date && t.busId && !t.stopSelling && !sellingClosed(db, t) && (t.status === "Scheduled" || t.status === "Boarding"))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export default function BookPage() {
  const db = useDb();
  const router = useRouter();
  const today = todayManila();
  const [tab, setTab] = useState<"book" | "mine">("book");
  const [step, setStep] = useState(0);
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState("");
  const [destination, setDestination] = useState("");
  const [province, setProvince] = useState("");
  const [region, setRegion] = useState<Region | "All">("All");
  const [when, setWhen] = useState<TimeOfDay>("Any time");
  const [operator, setOperator] = useState("");
  const [busClass, setBusClass] = useState("");
  const [sort, setSort] = useState<Sort>("Earliest");
  // Passenger types first (entry 43), so seats in rows 1 and 2 go to seniors and PWDs.
  const [counts, setCounts] = useState<Record<FareType, number>>({ Adult: 1, Student: 0, Senior: 0, PWD: 0 });
  const count = FARE_TYPES.reduce((sum, f) => sum + counts[f], 0);
  const [tripId, setTripId] = useState("");
  const [passengers, setPassengers] = useState<PassengerInput[]>([]);
  // Contact details from the passenger's last booking, like a saved profile.
  const [contact, setContact] = useState(() => {
    const last = db.tickets.filter((t) => t.bookedBy === db.session?.name && t.contactNo).at(-1);
    return { mobile: last?.contactNo ?? "", email: last?.email ?? "" };
  });
  const [wallet, setWallet] = useState<Wallet>("GCash");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The hold countdown ticks every second.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Leaving the page lets go of seats picked but not paid for.
  const heldTrip = useRef("");
  useEffect(() => {
    heldTrip.current = tripId;
  }, [tripId]);
  useEffect(() => () => {
    if (heldTrip.current) releaseSeats(heldTrip.current);
  }, []);

  const routeOf = (id: string) => db.routes.find((r) => r.id === id);
  const companyOf = (t: Trip) => db.companies.find((c) => c.id === tripCompanyId(db, t));
  const busOf = (t: Trip) => db.buses.find((b) => b.id === t.busId);
  const busTypeOf = (t: Trip) => db.busTypes.find((b) => b.id === busOf(t)?.busTypeId);
  // The operator's own class name (entry 39), else the bus type.
  const classOf = (t: Trip) => busOf(t)?.busClass ?? busTypeOf(t)?.description ?? "";

  const dayTrips = openTrips(db, date);

  // Step 1: destinations open on the date. No "from" fare: fares are the same across operators.
  const places = [...new Set(dayTrips.map((t) => placeOf(routeOf(t.routeId)?.description)))]
    .filter(Boolean)
    .map((place) => {
      const trips = dayTrips.filter((t) => placeOf(routeOf(t.routeId)?.description) === place);
      return {
        place,
        trips: trips.length,
        operators: new Set(trips.map((t) => tripCompanyId(db, t))).size,
        first: trips[0].time,
        province: provinceOf(place),
      };
    })
    .sort((a, b) => a.place.localeCompare(b.place));
  // Provinces first, grouped by region, so the passenger isn't faced with every town at once.
  const provinces = [...new Set(places.map((p) => p.province))]
    .map((name) => {
      const inside = places.filter((p) => p.province === name);
      return {
        name,
        region: regionOf(name),
        places: inside,
        trips: inside.reduce((sum, p) => sum + p.trips, 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const regions = REGIONS.filter((r) => provinces.some((p) => p.region === r));
  const query = search.trim().toLowerCase();
  const found = query
    ? places.filter((p) => p.place.toLowerCase().includes(query) || p.province.toLowerCase().includes(query))
    : [];
  const openProvince = provinces.find((p) => p.name === province);
  // Shortcuts above the provinces: where this passenger went before, then the busiest routes.
  const recent = [
    ...new Set(
      db.tickets
        .filter((t) => t.bookedBy === db.session?.name && t.source === "Online")
        .reverse()
        .map((t) => placeOf(routeOf(db.trips.find((x) => x.id === t.tripId)?.routeId ?? "")?.description)),
    ),
  ]
    .map((name) => places.find((p) => p.place === name))
    .filter((p): p is PlaceCard => Boolean(p))
    .slice(0, 4);
  const popular = places
    .filter((p) => !recent.includes(p))
    .sort((a, b) => b.trips - a.trips)
    .slice(0, 6);

  // Step 2: departures to the destination.
  const toPlace = dayTrips.filter((t) => placeOf(routeOf(t.routeId)?.description) === destination);
  const operators = [...new Set(toPlace.map((t) => tripCompanyId(db, t) ?? ""))];
  const classes = [...new Set(toPlace.map(classOf))].filter(Boolean).sort();
  const departures = toPlace
    .filter(
      (t) =>
        (when === "Any time" || timeOfDay(t.time) === when) &&
        (!operator || tripCompanyId(db, t) === operator) &&
        (!busClass || classOf(t) === busClass),
    )
    .sort((a, b) =>
      sort === "Most seats"
          ? ticketAvailability(db, b).left - ticketAvailability(db, a).left || a.time.localeCompare(b.time)
          : a.time.localeCompare(b.time),
    );

  const trip = db.trips.find((t) => t.id === tripId);
  const route = trip ? routeOf(trip.routeId) : undefined;
  const seating = trip ? tripSeating(db, trip) : null;
  const block = trip ? sellingBlock(db, trip, today) : null;
  const holdUntil = trip ? myHolds(db, trip).at(0)?.until : undefined;
  const secondsLeft = holdUntil ? Math.max(0, Math.floor((Date.parse(holdUntil) - now) / 1000)) : 0;
  const holdExpired = passengers.length > 0 && step >= 2 && !holdUntil;

  const insurance = db.settings.insurancePrice;
  const regular = route ? computeFare(route, "Adult") : 0;
  const fareOf = (p: PassengerInput) => (route ? computeFare(route, p.fareType) : 0);
  const fares = passengers.reduce((sum, p) => sum + fareOf(p), 0);
  const savings = passengers.length * regular - fares;
  const total = fares + passengers.length * insurance;
  const seatList = passengers.map((p) => p.seatNo).sort((a, b) => a - b);
  // Rows 1 and 2 are for seniors and PWDs (entry 43). Types still without a seat:
  const priority = prioritySeats(seating?.layout ?? undefined);
  const leftOf = (f: FareType) => counts[f] - passengers.filter((p) => p.fareType === f).length;
  const priorityLeft = PRIORITY_TYPES.reduce((n, f) => n + Math.max(0, leftOf(f)), 0);

  function go(next: number) {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function pickPlace(place: string) {
    setDestination(place);
    setWhen("Any time");
    setOperator("");
    setBusClass("");
    go(1);
  }

  function pickDate(next: string) {
    setDate(next);
    setDestination("");
    changeTrip("");
    go(0);
  }

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
    if (passengers.length >= count) {
      return setError(
        `You're booking for ${count} passenger${count === 1 ? "" : "s"}. Tap a picked seat to let it go, or go back to Route to add a passenger.`,
      );
    }
    // A front-row seat goes to a senior or PWD; others to the next type still without a seat.
    const fareType = priority.has(seatNo) ? PRIORITY_TYPES.find((f) => leftOf(f) > 0) : ORDER.find((f) => leftOf(f) > 0);
    if (!fareType) {
      return setError("Rows 1 and 2 are for senior citizens and PWDs only. Pick a seat further back, or add a senior or PWD passenger in step 1.");
    }
    const problem = holdSeat(tripId, seatNo);
    if (problem) return setError(problem);
    const first = passengers.length === 0 ? (db.session?.name ?? "") : "";
    setPassengers((current) => [...current, { seatNo, passengerName: first, contactNo: "", email: "", fareType, idNo: "" }]);
  }

  /** Changes a passenger's type, keeping the counts in step 1 in line. Front rows stay senior or PWD. */
  function changeType(p: PassengerInput, f: FareType) {
    if (priority.has(p.seatNo) && !PRIORITY_TYPES.includes(f)) return;
    setCounts((c) => ({ ...c, [p.fareType]: Math.max(0, c[p.fareType] - 1), [f]: c[f] + 1 }));
    edit(p.seatNo, { fareType: f, idNo: f === "Adult" ? "" : p.idNo });
  }

  function edit(seatNo: number, changes: Partial<PassengerInput>) {
    setPassengers((current) => current.map((p) => (p.seatNo === seatNo ? { ...p, ...changes } : p)));
  }

  function checkPassengers(): string | null {
    for (const p of passengers) {
      if (!p.passengerName.trim()) return `Enter the passenger name for seat ${p.seatNo}.`;
      if (p.fareType !== "Adult" && !p.idNo.trim()) return `Enter the ${FARE_INFO[p.fareType].idLabel} for seat ${p.seatNo}.`;
    }
    if (!/^(09|\+639)\d{9}$/.test(contact.mobile.replace(/[\s-]/g, ""))) return "Enter a mobile number like 0917 123 4567, for trip updates.";
    if (contact.email && !/^\S+@\S+\.\S+$/.test(contact.email)) return "That email address doesn't look right.";
    return null;
  }

  function pay() {
    const problem = checkPassengers();
    if (problem) return setError(problem);
    setPaying(true);
    setError(null);
    // Demo: stands in for the GCash, Maya or card page. No real money moves.
    setTimeout(() => {
      const ref = `DEMO-${wallet.toUpperCase()}-${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
      const result = bookOnline(
        {
          tripId,
          passengers: passengers
            .slice()
            .sort((a, b) => a.seatNo - b.seatNo)
            .map((p) => ({ ...p, contactNo: contact.mobile, email: contact.email })),
          paymentMethod: wallet === "Card" ? "Card" : wallet === "Cash" ? "Cash" : "E-Wallet",
          paymentRef: ref,
        },
        today,
      );
      setPaying(false);
      if (result.error) return setError(result.error);
      heldTrip.current = "";
      router.push(groupHref(result.tickets![0].groupId!));
    }, 1200);
  }

  const mine = db.tickets
    .filter((t) => t.bookedBy === db.session?.name && t.source === "Online")
    .map((t) => ({ ticket: t, trip: db.trips.find((x) => x.id === t.tripId) }))
    .sort((a, b) => `${a.trip?.date}${a.trip?.time}`.localeCompare(`${b.trip?.date}${b.trip?.time}`));
  const upcoming = mine.filter((m) => m.ticket.status === "Ticketed" && m.trip && m.trip.status !== "Departed" && m.trip.status !== "Cancelled");
  const past = mine.filter((m) => !upcoming.includes(m)).reverse();

  return (
    <div className="min-w-0 space-y-4">
      <PageTitle sub="Pick where you're going, choose your departure and seats, then pay online. Your e-ticket's QR code is your boarding pass.">
        Book a Trip
      </PageTitle>

      <div role="tablist" className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-semibold sm:w-fit">
        {(
          [
            ["book", "Book a trip"],
            ["mine", `My trips (${upcoming.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-md px-4 py-2 sm:flex-none ${tab === id ? "bg-white text-brand shadow-sm" : "text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "mine" ? (
        <MyTrips db={db} upcoming={upcoming} past={past} now={now} onBook={() => setTab("book")} />
      ) : (
        <>
          <Stepper
            step={step}
            onGo={(i) => {
              if (i < 2) changeTrip("");
              go(i);
            }}
          />

          {/* Step 1: route */}
          {step === 0 && (
            <section className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="section-head normal-case mb-2">When are you leaving?</p>
                <MonthCalendar today={today} last={addDays(today, DAYS_AHEAD - 1)} value={date} tripsOn={(d) => openTrips(db, d).length} onPick={pickDate} />
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                  <p className="section-head normal-case">
                    Who&apos;s travelling?{" "}
                    <InfoTip
                      label="Rows 1 and 2"
                      note="The first two rows are for senior citizens and PWDs only. Bring the ID for every student, senior or PWD passenger: it is checked at boarding."
                    />
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {FARE_TYPES.map((f) => (
                      <div key={f} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                        <span className="text-sm font-semibold">{FARE_INFO[f].label}</span>
                        <span className="flex items-center rounded-lg border border-slate-300">
                          <button
                            type="button"
                            aria-label={`One ${FARE_INFO[f].label} passenger less`}
                            disabled={counts[f] <= 0 || count <= 1}
                            onClick={() => setCounts((c) => ({ ...c, [f]: c[f] - 1 }))}
                            className="px-2 py-0.5 text-lg font-bold text-brand disabled:text-slate-300"
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-bold" aria-live="polite">
                            {counts[f]}
                          </span>
                          <button
                            type="button"
                            aria-label={`One ${FARE_INFO[f].label} passenger more`}
                            disabled={count >= MAX_SEATS}
                            onClick={() => setCounts((c) => ({ ...c, [f]: c[f] + 1 }))}
                            className="px-2 py-0.5 text-lg font-bold text-brand disabled:text-slate-300"
                          >
                            +
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    {count} passenger{count === 1 ? "" : "s"}, up to {MAX_SEATS} per booking.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="section-head normal-case">Where to?</p>
                    <p className="text-sm text-slate-600">From PITX, Parañaque · {dayLabel(date, { weekday: "long", month: "long", day: "numeric" })}</p>
                  </div>
                  <label className="w-full sm:w-64">
                    <span className="sr-only">Search destination</span>
                    <input placeholder="Search a town, city or province" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </label>
                </div>

                {query ? (
                  // Searching skips the provinces and lists the matching towns.
                  <>
                    <PlaceGrid places={found} showProvince onPick={pickPlace} />
                    {found.length === 0 && <p className="text-sm text-slate-500">No destination matches &quot;{search}&quot; on this date.</p>}
                  </>
                ) : province ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setProvince("")}
                        className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold hover:border-brand"
                      >
                        <span aria-hidden>←</span> All provinces
                      </button>
                      <p className="font-semibold">
                        {province}
                        <span className="ml-2 text-sm font-normal text-slate-500">{regionOf(province)}</span>
                      </p>
                    </div>
                    {openProvince ? (
                      <PlaceGrid places={openProvince.places} onPick={pickPlace} />
                    ) : (
                      <p className="text-sm text-slate-500">No trips to {province} open on this date. Try another day or province.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(recent.length > 0 || popular.length > 0) && (
                      <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                        {recent.length > 0 && <QuickRow label="Book again" places={recent} onPick={pickPlace} />}
                        {popular.length > 0 && <QuickRow label="Popular from PITX" places={popular} onPick={pickPlace} />}
                      </div>
                    )}
                    {regions.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        {(["All", ...regions] as const).map((r) => (
                          <Chip key={r} on={region === r} onClick={() => setRegion(r)}>
                            {r}
                          </Chip>
                        ))}
                      </div>
                    )}
                    {regions
                      .filter((r) => region === "All" || region === r)
                      .map((r) => (
                        <div key={r} className="space-y-2">
                          <p className="text-xs font-semibold tracking-wide text-slate-500">{r}</p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                            {provinces
                              .filter((p) => p.region === r)
                              .map((p) => (
                                <button
                                  key={p.name}
                                  type="button"
                                  onClick={() => (p.places.length === 1 ? pickPlace(p.places[0].place) : setProvince(p.name))}
                                  className="flex min-w-0 flex-col rounded-lg border border-slate-200 p-3 text-left hover:border-brand hover:bg-brand-tint"
                                >
                                  <span className="truncate font-semibold text-slate-900">{p.name}</span>
                                  <span className="truncate text-xs text-slate-600">
                                    {p.places.length === 1
                                      ? p.places[0].place
                                      : `${p.places.length} destinations`}{" "}
                                    · {p.trips} trip{p.trips === 1 ? "" : "s"}
                                  </span>
                                </button>
                              ))}
                          </div>
                        </div>
                      ))}
                    {provinces.length === 0 && <p className="text-sm text-slate-500">No trips open for booking on this date. Try another day.</p>}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Step 2: trip */}
          {step === 1 && (
            <section className="space-y-3">
              <TripHeader destination={destination} date={date} count={count} onChange={() => go(0)} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold tracking-wide text-slate-500">Sort</span>
                {SORTS.map((s) => (
                  <Chip key={s} on={sort === s} onClick={() => setSort(s)}>
                    {s}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {TIMES.map((t) => (
                  <Chip key={t} on={when === t} onClick={() => setWhen(t)}>
                    {t}
                  </Chip>
                ))}
                {operators.length > 1 && (
                  <select
                    aria-label="Bus operator"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className="!mt-0 !w-auto rounded-full text-sm"
                  >
                    <option value="">All operators</option>
                    {operators.map((id) => (
                      <option key={id} value={id}>
                        {properCase(db.companies.find((c) => c.id === id)?.name)}
                      </option>
                    ))}
                  </select>
                )}
                {classes.length > 1 && (
                  <select
                    aria-label="Bus class"
                    value={busClass}
                    onChange={(e) => setBusClass(e.target.value)}
                    className="!mt-0 !w-auto rounded-full text-sm"
                  >
                    <option value="">All bus classes</option>
                    {classes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {departures.map((t) => {
                  const a = ticketAvailability(db, t);
                  const r = routeOf(t.routeId);
                  const c = companyOf(t);
                  const capacity = tripSeating(db, t).layout?.seats ?? 0;
                  const soldOut = a.status !== "Available" && a.status !== "Last Few Seats";
                  const short = !soldOut && a.left < count;
                  const fill = capacity ? Math.round(((capacity - a.left) / capacity) * 100) : 100;
                  const arrangement = tripSeating(db, t).layout?.label.match(/\d+x\d+/)?.[0];
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={soldOut || short}
                      onClick={() => {
                        changeTrip(t.id);
                        go(2);
                      }}
                      className="flex w-full min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="w-20 shrink-0 border-r border-slate-100 pr-3">
                        <span className="block text-lg font-bold leading-tight text-slate-900">{time12(t.time)}</span>
                        <span className="block font-mono text-[11px] text-slate-500">{t.tripNo}</span>
                        {t.status === "Boarding" && <span className="mt-1 inline-block rounded bg-green-100 px-1.5 text-[11px] font-semibold text-green-800">Boarding</span>}
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex items-center gap-2">
                          <CompanyLogo company={c} className="h-6 max-w-[3rem] text-xs font-bold text-slate-500" />
                          <span className="truncate text-sm font-semibold">{properCase(c?.name)}</span>
                        </span>
                        <span className="block text-xs text-slate-600">
                          {classOf(t)}
                          {arrangement ? ` (${arrangement} seats)` : ""} · {t.bay || "Bay to follow"}
                        </span>
                        <span className="flex items-center gap-2 text-xs">
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                            <span className={`block h-full ${a.status === "Last Few Seats" ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${fill}%` }} />
                          </span>
                          <span className={short ? "font-semibold text-red-700" : a.status === "Last Few Seats" ? "font-semibold text-amber-700" : "text-slate-600"}>
                            {soldOut
                              ? a.status
                              : short
                                ? `Only ${a.left} left, you need ${count}`
                                : a.status === "Last Few Seats"
                                  ? `Only ${a.left} left`
                                  : `${a.left} seats left`}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-bold text-brand">{r ? peso(computeFare(r, "Adult")) : ""}</span>
                        <span className="block text-[11px] text-slate-500">per seat</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {departures.length === 0 && <p className="text-sm text-slate-500">No departures match. Try another time of day, operator or bus class.</p>}
            </section>
          )}

          {/* Step 3: seats */}
          {step === 2 && trip && (
            <section className="space-y-3">
              <TripSummary db={db} trip={trip} onChange={() => { changeTrip(""); go(1); }} />
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="section-head normal-case mb-1 text-center">
                  Pick {count} seat{count === 1 ? "" : "s"}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${passengers.length === count ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                    {passengers.length} of {count} picked
                  </span>
                </p>
                <p className="mb-3 text-center text-xs text-slate-500">
                  Tap a seat to pick it, tap again to let it go. Rows 1 and 2 are for senior citizens and PWDs.
                </p>
                {block && <p className="mb-3 text-center text-sm text-red-700">{block}</p>}
                {seating?.layout ? (
                  <BusSeatPlan
                    layout={seating.layout}
                    taken={takenSeats(db, trip.id)}
                    blocked={seating.blocked}
                    held={heldByOthers(db, trip)}
                    selected={passengers.map((p) => p.seatNo)}
                    priority={priority}
                    priorityOpen={priorityLeft > 0}
                    onSelect={toggleSeat}
                  />
                ) : (
                  <p className="text-sm text-slate-500">This bus&apos;s seat plan isn&apos;t set up yet.</p>
                )}
              </div>
            </section>
          )}

          {/* Step 4: passengers and discounts */}
          {step === 3 && trip && route && (
            <section className="space-y-3">
              <TripSummary db={db} trip={trip} />
              <p className="rounded-lg bg-brand-tint px-3 py-2 text-sm text-brand">
                Students, senior citizens and PWDs get a discounted fare. Bring the ID you enter here: it&apos;s checked at boarding,
                and without it you pay the regular fare.
              </p>
              {passengers
                .slice()
                .sort((a, b) => a.seatNo - b.seatNo)
                .map((p, index) => (
                  <fieldset key={p.seatNo} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                    <legend className="rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-white">
                      Passenger {index + 1} · Seat {p.seatNo}
                      {seatSide(seating?.layout, p.seatNo) ? ` (${seatSide(seating?.layout, p.seatNo)})` : ""}
                    </legend>
                    <label>
                      Full name (as on the ID)
                      <input value={p.passengerName} onChange={(e) => edit(p.seatNo, { passengerName: e.target.value })} />
                    </label>
                    <div>
                      <p className="mb-1.5 text-sm">Fare</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {FARE_TYPES.map((f) => {
                          const amount = computeFare(route, f);
                          const off = regular - amount;
                          return (
                            <button
                              key={f}
                              type="button"
                              aria-pressed={p.fareType === f}
                              disabled={priority.has(p.seatNo) && !PRIORITY_TYPES.includes(f)}
                              title={priority.has(p.seatNo) && !PRIORITY_TYPES.includes(f) ? "Rows 1 and 2 are for senior citizens and PWDs only" : undefined}
                              onClick={() => changeType(p, f)}
                              className={`rounded-lg border p-2 text-left disabled:cursor-not-allowed disabled:opacity-40 ${p.fareType === f ? "border-brand bg-brand-tint ring-1 ring-brand" : "border-slate-200 hover:border-brand"}`}
                            >
                              <span className="block text-sm font-semibold">{FARE_INFO[f].label}</span>
                              <span className="block text-sm">{peso(amount)}</span>
                              <span className={`block text-[11px] ${off > 0 ? "font-semibold text-green-700" : "text-slate-500"}`}>
                                {off > 0 ? `Save ${peso(off)}` : "Full fare"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {p.fareType !== "Adult" && (
                      <label>
                        {FARE_INFO[p.fareType].idLabel}{" "}
                        <span className="text-xs text-slate-500">({FARE_INFO[p.fareType].law})</span>
                        <input value={p.idNo} onChange={(e) => edit(p.seatNo, { idNo: e.target.value })} />
                      </label>
                    )}
                  </fieldset>
                ))}
              <fieldset className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
                <legend className="px-1 text-sm font-semibold">Contact details</legend>
                <label>
                  Mobile number
                  <input
                    inputMode="tel"
                    placeholder="0917 123 4567"
                    value={contact.mobile}
                    onChange={(e) => setContact((c) => ({ ...c, mobile: e.target.value }))}
                  />
                </label>
                <label>
                  Email (optional, for the e-ticket)
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={contact.email}
                    onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                  />
                </label>
                <p className="text-xs text-slate-500 sm:col-span-2">We text you if your trip changes bay, time or is cancelled.</p>
              </fieldset>
            </section>
          )}

          {/* Step 5: payment */}
          {step === 4 && trip && route && (
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="section-head normal-case mb-3">Pay with</p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {WALLETS.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        aria-pressed={wallet === w.id}
                        onClick={() => setWallet(w.id)}
                        className={`rounded-lg border p-3 text-left ${wallet === w.id ? "border-brand bg-brand-tint ring-1 ring-brand" : "border-slate-200 hover:border-brand"}`}
                      >
                        <span className="block font-semibold">{w.label}</span>
                        <span className="block text-xs text-slate-500">{w.note}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3">
                    <InfoTip
                      label="Demo payment"
                      note={
                        wallet === "Cash"
                          ? `Demo: no real payment. In the live system you get a reference number to pay ${peso(total)} in cash at 7-Eleven, Cebuana or M Lhuillier, and your e-ticket comes once it is paid.`
                          : `Demo: no real payment. In the live system you are sent to ${wallet === "Card" ? "your bank's secure page" : wallet} to approve ${peso(total)}, then come back here for your e-ticket.`
                      }
                    />
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="section-head normal-case mb-2">Before you travel</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                    <li>Your e-ticket&apos;s QR code is your boarding pass. No need to swap it at a ticket counter.</li>
                    <li>Check your bay on the e-ticket or the PITX departure screens. We text you if the bay or time changes.</li>
                    {passengers.some((p) => p.fareType !== "Adult") && (
                      <li>Bring the ID of every student, senior or PWD passenger. Without it, the regular fare applies.</li>
                    )}
                    <li>For refunds or changes, go to the operator&apos;s ticket counter at PITX with your e-ticket.</li>
                  </ul>
                </div>
                <p className="text-xs text-slate-500">By paying you agree to the operator&apos;s terms of carriage.</p>
              </div>
              <OrderSummary
                db={db}
                trip={trip}
                passengers={passengers}
                fareOf={fareOf}
                regular={regular}
                insurance={insurance}
                savings={savings}
                total={total}
              />
            </section>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          {holdExpired && (
            <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Your seat hold ran out, so the seats went back on sale.{" "}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => {
                  setPassengers([]);
                  go(2);
                }}
              >
                Pick seats again
              </button>
            </div>
          )}

          {/* Basket bar, like a cinema's: picked seats, total, time left and the next step. */}
          {step >= 2 && trip && (
            <div className="sticky bottom-0 z-20 rounded-t-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 basis-full text-sm sm:basis-auto sm:flex-1">
                  <p className="flex justify-between gap-2 font-semibold">
                    <span className="truncate">
                      {passengers.length === 0 ? "No seats picked yet" : `Seat${seatList.length === 1 ? "" : "s"} ${seatList.join(", ")}`}
                    </span>
                    {passengers.length > 0 && <span className="shrink-0 text-brand">{peso(total)}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {holdUntil && passengers.length > 0 ? (
                      <span className={secondsLeft < 120 ? "font-semibold text-red-700" : ""}>
                        Seats held for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                      </span>
                    ) : (
                      `${placeOf(route?.description)} · ${time12(trip.time)}, ${dayLabel(trip.date, { month: "short", day: "numeric" })}`
                    )}
                    {savings > 0 && <span className="ml-2 font-semibold text-green-700">You save {peso(savings)}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (step === 2) changeTrip("");
                    go(step - 1);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">
                  Back
                </button>
                {step < 4 ? (
                  <button
                    type="button"
                    disabled={passengers.length === 0 || (step === 2 && passengers.length < count) || Boolean(block) || holdExpired}
                    onClick={() => {
                      if (step === 3) {
                        const problem = checkPassengers();
                        if (problem) return setError(problem);
                      }
                      go(step + 1);
                    }}
                    className="flex-1 rounded-lg bg-brand px-5 py-2.5 sm:flex-none text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
                  >
                    {step === 2
                      ? passengers.length < count
                        ? `Pick ${count - passengers.length} more seat${count - passengers.length === 1 ? "" : "s"}`
                        : "Continue"
                      : "Go to payment"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={paying || passengers.length === 0 || Boolean(block) || holdExpired}
                    onClick={pay}
                    className="flex-1 rounded-lg bg-brand px-5 py-2.5 sm:flex-none text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
                  >
                    {paying ? `Paying with ${wallet}…` : wallet === "Cash" ? `Pay ${peso(total)} in cash` : `Pay ${peso(total)}`}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stepper({ step, onGo }: { step: number; onGo: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto text-xs sm:text-sm">
      {STEPS.map((label, i) => (
        <li key={label} className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={i >= step}
            onClick={() => onGo(i)}
            aria-current={i === step ? "step" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
              i === step ? "bg-brand text-white" : i < step ? "text-brand hover:bg-brand-tint" : "text-slate-400"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                i === step ? "bg-white text-brand" : i < step ? "bg-brand text-white" : "bg-slate-200 text-slate-500"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </span>
            {label}
          </button>
          {i < STEPS.length - 1 && <span className="h-px w-3 bg-slate-300 sm:w-6" />}
        </li>
      ))}
    </ol>
  );
}

type PlaceCard = { place: string; province: string; trips: number; operators: number; first: string };

function PlaceGrid({ places, showProvince = false, onPick }: { places: PlaceCard[]; showProvince?: boolean; onPick: (place: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {places.map((p) => (
        <button
          key={p.place}
          type="button"
          onClick={() => onPick(p.place)}
          className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-brand hover:bg-brand-tint"
        >
          <span className="min-w-0">
            <span className="block truncate font-semibold text-slate-900">{p.place}</span>
            {showProvince && <span className="block text-xs text-slate-500">{p.province}</span>}
            <span className="block text-xs text-slate-600">
              {p.trips} trip{p.trips === 1 ? "" : "s"} · {p.operators} operator{p.operators === 1 ? "" : "s"} · first {time12(p.first)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function QuickRow({ label, places, onPick }: { label: string; places: PlaceCard[]; onPick: (place: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-full text-xs font-semibold tracking-wide text-slate-500 sm:w-32">{label}</span>
      {places.map((p) => (
        <button
          key={p.place}
          type="button"
          onClick={() => onPick(p.place)}
          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm hover:border-brand hover:bg-brand-tint"
        >
          <span className="font-semibold">{p.place}</span>
        </button>
      ))}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-brand bg-brand text-white" : "border-slate-300 bg-white hover:border-brand"}`}
    >
      {children}
    </button>
  );
}

function TripHeader({ destination, date, count, onChange }: { destination: string; date: string; count: number; onChange: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand px-4 py-3 text-white">
      <p className="font-semibold">
        PITX <span aria-hidden>→</span> {destination}
        <span className="ml-2 font-normal opacity-80">
          {dayLabel(date, { weekday: "short", month: "short", day: "numeric" })} · {count} passenger{count === 1 ? "" : "s"}
        </span>
      </p>
      <button type="button" onClick={onChange} className="rounded border border-white/40 px-2 py-0.5 text-xs font-semibold hover:bg-white/10">
        Change
      </button>
    </div>
  );
}

function TripSummary({ db, trip, onChange }: { db: Db; trip: Trip; onChange?: () => void }) {
  const route = db.routes.find((r) => r.id === trip.routeId);
  const company = db.companies.find((c) => c.id === route?.companyId);
  const bus = db.buses.find((b) => b.id === trip.busId);
  const busType = db.busTypes.find((b) => b.id === bus?.busTypeId);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand px-4 py-3 text-white">
      <span className="rounded bg-white p-1">
        <CompanyLogo company={company} className="h-7 max-w-[3.5rem] text-xs font-bold text-brand" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          PITX <span aria-hidden>→</span> {placeOf(route?.description)} · {time12(trip.time)}
        </p>
        <p className="text-xs opacity-80">
          {dayLabel(trip.date, { weekday: "short", month: "short", day: "numeric" })} · {properCase(company?.name)} · {trip.tripNo} ·{" "}
          {bus?.busClass ?? busType?.description ?? ""} · {trip.bay || "Bay to follow"}
        </p>
      </div>
      {onChange && (
        <button type="button" onClick={onChange} className="rounded border border-white/40 px-2 py-0.5 text-xs font-semibold hover:bg-white/10">
          Change trip
        </button>
      )}
    </div>
  );
}

function OrderSummary({
  db,
  trip,
  passengers,
  fareOf,
  regular,
  insurance,
  savings,
  total,
}: {
  db: Db;
  trip: Trip;
  passengers: PassengerInput[];
  fareOf: (p: PassengerInput) => number;
  regular: number;
  insurance: number;
  savings: number;
  total: number;
}) {
  return (
    <aside className="h-fit space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <p className="section-head normal-case">Your booking</p>
      <TripSummary db={db} trip={trip} />
      <ul className="divide-y divide-slate-100 text-sm">
        {passengers
          .slice()
          .sort((a, b) => a.seatNo - b.seatNo)
          .map((p) => (
            <li key={p.seatNo} className="py-2">
              <div className="flex justify-between">
                <span className="font-semibold">
                  Seat {p.seatNo} · {p.passengerName || "No name yet"}
                </span>
                <span>{peso(regular)}</span>
              </div>
              {fareOf(p) < regular && (
                <div className="flex justify-between text-xs text-green-700">
                  <span>{FARE_INFO[p.fareType].label} discount</span>
                  <span>−{peso(regular - fareOf(p))}</span>
                </div>
              )}
              {insurance > 0 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Passenger insurance</span>
                  <span>{peso(insurance)}</span>
                </div>
              )}
            </li>
          ))}
      </ul>
      <div className="flex justify-between text-xs text-slate-500">
        <span>Seat selection</span>
        <span className="font-semibold text-green-700">Free</span>
      </div>
      {savings > 0 && (
        <div className="flex justify-between text-sm font-semibold text-green-700">
          <span>Total discount</span>
          <span>−{peso(savings)}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between border-t border-slate-200 pt-3">
        <span className="text-sm">Total to pay</span>
        <span className="text-2xl font-bold text-brand">{peso(total)}</span>
      </div>
    </aside>
  );
}

type Booked = { ticket: Db["tickets"][number]; trip?: Trip };

function MyTrips({ db, upcoming, past, onBook, now }: { db: Db; upcoming: Booked[]; past: Booked[]; onBook: () => void; now: number }) {
  if (upcoming.length + past.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="font-semibold">No trips yet</p>
        <p className="mb-3 text-sm text-slate-500">Your e-tickets show up here once you book.</p>
        <button type="button" onClick={onBook} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
          Book a trip
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {[
        ["Upcoming", upcoming],
        ["Past and cancelled", past],
      ].map(([label, list]) =>
        (list as Booked[]).length === 0 ? null : (
          <section key={label as string} className="space-y-2">
            <p className="section-head normal-case">{label as string}</p>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {(list as Booked[]).map(({ ticket, trip }) => {
                const route = db.routes.find((r) => r.id === trip?.routeId);
                const company = db.companies.find((c) => c.id === route?.companyId);
                const tone =
                  ticket.status === "Ticketed"
                    ? "bg-green-100 text-green-800"
                    : ticket.status === "Boarded"
                      ? "bg-slate-200 text-slate-700"
                      : "bg-red-100 text-red-800";
                // Cancel from My trips (entry 43), before the refund cutoff.
                const cancel = label === "Upcoming" ? passengerCancelPlan(db, ticket, now) : null;
                return (
                  <div key={ticket.id} className="rounded-xl border border-slate-200 bg-white hover:border-brand">
                  <Link href={ticketHref(ticket.id)} className="flex gap-3 p-3">
                    <span className="w-16 shrink-0 border-r border-dashed border-slate-300 pr-3 text-center">
                      <span className="block text-[11px] font-semibold text-slate-500">{trip ? dayLabel(trip.date, { month: "short" }) : ""}</span>
                      <span className="block text-2xl font-bold leading-none">{trip ? dayLabel(trip.date, { day: "numeric" }) : ""}</span>
                      <span className="block text-[11px] text-slate-500">{trip ? time12(trip.time) : ""}</span>
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">PITX → {placeOf(route?.description)}</span>
                        <span className={`shrink-0 rounded px-1.5 text-[11px] font-semibold ${tone}`}>{ticket.status === "Voided" ? "Refunded" : ticket.status}</span>
                      </span>
                      <span className="block truncate text-xs text-slate-600">
                        {properCase(company?.name)} · Seat {ticket.seatNo} · {ticket.passengerName}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {ticket.bookingRef ?? ticket.ticketNo} · {trip?.bay || "Bay to follow"} · {peso(ticket.fare)}{" "}
                        {ticket.fareType !== "Adult" ? `(${ticket.fareType})` : ""}
                      </span>
                      {ticket.status === "Voided" && (
                        <span className="block text-xs text-red-700">
                          {ticket.refundCategory ?? "Refunded"}: {peso(ticket.refundAmount ?? ticket.fare)} back to your{" "}
                          {ticket.refundMethod ?? ticket.paymentMethod}
                        </span>
                      )}
                      <span className="mt-1 block text-xs font-semibold text-brand">View e-ticket</span>
                    </span>
                  </Link>
                  {cancel && (
                    <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs">
                      {cancel.block ? (
                        <span className="text-slate-500">{cancel.block}</span>
                      ) : (
                        <>
                          <span className="text-slate-600">
                            Refund {peso(cancel.amount)} to your {ticket.paymentMethod === "Cash" ? "cash payment center" : ticket.paymentMethod}
                          </span>
                          <button
                            type="button"
                            className="rounded border border-red-300 px-2.5 py-1 font-semibold text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (!window.confirm(`Cancel seat ${ticket.seatNo} for ${ticket.passengerName}? You get ${peso(cancel.amount)} back and the seat is released.`)) return;
                              const problem = cancelBooking(ticket.id);
                              if (problem) window.alert(problem);
                            }}
                          >
                            Cancel trip
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          </section>
        ),
      )}
    </div>
  );
}

/**
 * "When are you leaving?": a month calendar from today up to a month ahead (entry 43). Days
 * before today, past the last day or with no trips open for booking can't be picked.
 */
function MonthCalendar({
  today,
  last,
  value,
  tripsOn,
  onPick,
}: {
  today: string;
  last: string;
  value: string;
  tripsOn: (date: string) => number;
  onPick: (date: string) => void;
}) {
  // Every month from today's to the last day's (31 days can touch three months).
  const months: string[] = [];
  for (let d = today; d <= last; d = addDays(d, 1)) if (!months.includes(d.slice(0, 7))) months.push(d.slice(0, 7));
  const [shown, setShown] = useState(() => (months.includes(value.slice(0, 7)) ? value.slice(0, 7) : months[0]));
  const [year, month] = shown.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = first.getUTCDay(); // Sunday first
  const cells = [
    ...Array.from({ length: lead }, () => ""),
    ...Array.from({ length: daysInMonth }, (_, i) => `${shown}-${String(i + 1).padStart(2, "0")}`),
  ];
  const index = months.indexOf(shown);
  const title = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  return (
    <div className="max-w-md">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          disabled={index <= 0}
          onClick={() => setShown(months[index - 1])}
          className="rounded px-2 py-1 text-lg font-bold text-brand disabled:text-slate-300"
        >
          ‹
        </button>
        <p className="font-semibold">{title}</p>
        <button
          type="button"
          aria-label="Next month"
          disabled={index >= months.length - 1}
          onClick={() => setShown(months[index + 1])}
          className="rounded px-2 py-1 text-lg font-bold text-brand disabled:text-slate-300"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d} className="py-1 font-semibold">
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`blank-${i}`} />;
          const inRange = d >= today && d <= last;
          const trips = inRange ? tripsOn(d) : 0;
          const on = d === value;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={`${dayLabel(d, { weekday: "long", month: "long", day: "numeric" })}${inRange ? `, ${trips} trips` : ""}`}
              disabled={!inRange || trips === 0}
              onClick={() => onPick(d)}
              className={`flex h-10 flex-col items-center justify-center rounded-lg border text-sm disabled:border-transparent disabled:text-slate-300 ${
                on ? "border-brand bg-brand font-bold text-white" : "border-slate-200 bg-white hover:border-brand"
              }`}
            >
              <span className="leading-none">{Number(d.slice(8))}</span>
              {d === today && <span className={`text-[9px] leading-none ${on ? "text-white" : "text-brand"}`}>Today</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">Up to a month ahead. Days with no trips open for booking are greyed out.</p>
    </div>
  );
}
