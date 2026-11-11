import { addDemoSales, seeded } from "./demo-sales";
import { todayManila } from "./format";
import { SAMPLE_OPERATORS } from "./operator-routes";
import { addDays, routeIdOf, sampleFleet, sampleRoute, sampleTown, statusAt } from "./seed";
import { computeFare } from "./store";
import { TS_ROUTES, tripNumber } from "./trip-routes";
import type { Db, Session, Ticket, Trip } from "./types";

// Sample data for whoever signs in, so every user has something to work with:
//   a bus company with no trips gets a few (on its Trip Scheduling destinations if it has any)
//   a Teller or Operator Admin with no sales of their own takes over some of the company's
//     sample sales today, so Tickets and Close Sales show their own
//   a Passenger with no bookings takes over a few sample online bookings
// Only sample data is touched: tickets with "demo-" ids, never anything a user sold.

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Minutes since midnight, Manila time. */
function manilaMinutes(now: number): number {
  const d = new Date(now + 8 * 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** A few trips today and tomorrow for a company that has none, with sample sales. */
export function addCompanyTrips(db: Db, companyId: string): Db {
  const company = db.companies.find((c) => c.id === companyId);
  if (!company) return db;
  const ownRoutes = db.routes.filter((r) => r.companyId === companyId && r.status === "Active");
  if (db.trips.some((t) => ownRoutes.some((r) => r.id === t.routeId))) return db;

  const rand = seeded(company.id);
  const fromWeek = SAMPLE_OPERATORS.find((o) => o.code === company.code)?.destinations ?? [];
  const destinations = ownRoutes.length
    ? ownRoutes.map((r) => r.description.replace(/^PITX to /, ""))
    : fromWeek.length
      ? fromWeek
      : [0, 1].map(() => TS_ROUTES[Math.floor(rand() * TS_ROUTES.length)]);
  const routes = [...db.routes];
  const towns = [...db.towns];
  for (const d of destinations) {
    if (!routes.some((r) => r.id === routeIdOf(company.code, d))) routes.push(sampleRoute(company, d));
    const town = sampleTown(d);
    if (!towns.some((t) => t.id === town.id)) towns.push(town);
  }

  let busTypes = db.busTypes;
  let buses = db.buses;
  if (!buses.some((b) => b.companyId === companyId && b.status === "Active")) {
    const fleet = sampleFleet(company, db.companies.indexOf(company) + 7);
    busTypes = [...busTypes, ...fleet.busTypes];
    buses = [...buses, ...fleet.buses];
  }
  const units = buses.filter((b) => b.companyId === companyId && b.status === "Active");

  // One that left this morning, two later today, and one tomorrow.
  const now = Date.now();
  const today = todayManila();
  const at = manilaMinutes(now);
  const later = (offset: number) => Math.min(23 * 60 + 45, Math.ceil((at + offset) / 15) * 15);
  const slots: [string, number][] = [
    ...(at > 3 * 60 ? ([[today, Math.floor((at - 150) / 15) * 15]] as [string, number][]) : []),
    ...(at < 22 * 60 ? ([[today, later(90)], [today, later(240)]] as [string, number][]) : []),
    [addDays(today, 1), 6 * 60 + 30],
  ];
  const trips: Trip[] = slots.map(([date, minutes], i) => {
    const destination = destinations[i % destinations.length];
    const time = hhmm(minutes);
    return {
      id: `trip-${company.code}-${date}-${time}`.replace(/:/g, ""),
      tripNo: tripNumber(destination, time),
      date,
      time,
      routeId: routeIdOf(company.code, destination),
      busId: units[i % units.length]?.id ?? "",
      bay: `Bay ${1 + Math.floor(rand() * 20)}`,
      status: statusAt(date, time, now),
      remark: "Sample trip for this company (demo). Its real trips come from Trip Scheduling once approved.",
    };
  });

  const withTrips: Db = { ...db, routes, towns, busTypes, buses, trips: [...db.trips, ...trips] };
  return addDemoSales(withTrips);
}

/** Gives the signed-in user sample data of their own when they have none. */
export function withUserSamples(db: Db, session: Session): Db {
  let next = db;
  const today = todayManila();
  if (session.companyId) next = addCompanyTrips(next, session.companyId);

  const tripOf = (id: string) => next.trips.find((t) => t.id === id);
  const companyOf = (trip?: Trip) => next.routes.find((r) => r.id === trip?.routeId)?.companyId;
  const isSample = (id: string) => id.startsWith("demo-");

  if ((session.role === "Teller" || session.role === "Operator Admin") && session.companyId && session.counterId) {
    const mine = next.tickets.some((t) => t.soldBy === session.name && t.source === "Counter");
    const closed = new Set(next.closings.filter((c) => c.date === today).map((c) => c.teller));
    if (!mine) {
      const take = new Set(
        next.tickets
          .filter((t) => {
            const trip = tripOf(t.tripId);
            return (
              isSample(t.id) &&
              t.source === "Counter" &&
              t.status !== "Voided" &&
              trip?.date === today &&
              companyOf(trip) === session.companyId &&
              !closed.has(t.soldBy ?? "")
            );
          })
          .slice(-8)
          .map((t) => t.id),
      );
      if (take.size) {
        next = {
          ...next,
          tickets: next.tickets.map((t) => (take.has(t.id) ? { ...t, soldBy: session.name, counterId: session.counterId } : t)),
          requests: next.requests.map((r) => (take.has(r.ticketId) ? { ...r, requestedBy: session.name, counterId: session.counterId } : r)),
        };
      }
    }
  }

  if (session.role === "Passenger" && !next.tickets.some((t) => t.bookedBy === session.name)) {
    next = passengerHistory(next, session.name, today);
  }

  return next;
}

/** The passenger's contact details on their sample bookings (made up, never a real number). */
export function sampleContact(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "passenger";
  return { contactNo: "0917 000 0000", email: `${slug}@example.com` };
}

/**
 * A passenger's booking history, taken over from sample online bookings so the seats stay
 * consistent with the seat plans everyone else sees:
 *   a trip today, still to board            a trip tomorrow for 2: them and a senior companion
 *   a trip today they already boarded       a trip the operator cancelled, refunded
 * Their own seats are regular fare. The contact details are made up (sampleContact).
 */
function passengerHistory(db: Db, name: string, today: string): Db {
  const tripOf = (id: string) => db.trips.find((t) => t.id === id);
  const routeOf = (tripId: string) => db.routes.find((r) => r.id === tripOf(tripId)?.routeId);
  const online = db.tickets.filter((t) => t.id.startsWith("demo-") && t.source === "Online");
  const usedTrips = new Set<string>();
  const first = (list: typeof online) => {
    const found = list.find((t) => !usedTrips.has(t.tripId));
    if (found) usedTrips.add(found.tripId);
    return found;
  };
  const upcoming = (t: (typeof online)[number]) => {
    const trip = tripOf(t.tripId);
    return t.status === "Reserved" && trip?.status === "Scheduled" && !!trip.busId;
  };

  const todayTrip = first(online.filter((t) => upcoming(t) && tripOf(t.tripId)?.date === today));
  const boarded = first(online.filter((t) => t.status === "Boarded"));
  const refunded = first(online.filter((t) => t.status === "Voided" && t.refundCategory === "Trip cancelled"));
  // Tomorrow, two seats on one booking.
  const tomorrow = addDays(today, 1);
  const pairTrip = db.trips.find(
    (trip) =>
      trip.date === tomorrow &&
      !usedTrips.has(trip.id) &&
      online.filter((t) => t.tripId === trip.id && upcoming(t)).length >= 2,
  );
  const pair = pairTrip ? online.filter((t) => t.tripId === pairTrip.id && upcoming(t)).slice(0, 2) : [];

  const contact = sampleContact(name);
  const changes = new Map<string, Partial<Ticket>>();
  // Their own seats are regular fare.
  const regular = (t: Ticket): Partial<Ticket> => {
    const fare = routeOf(t.tripId)?.price ?? t.fare;
    return { fareType: "Adult", fare, idNo: undefined, ...(t.status === "Voided" ? { refundAmount: fare } : {}) };
  };
  for (const t of [todayTrip, boarded, refunded].flatMap((x) => x ?? [])) {
    changes.set(t.id, { bookedBy: name, passengerName: name, ...contact, groupId: `demo-group-${t.id}`, ...regular(t) });
  }
  if (pair.length === 2) {
    const [mine, companion] = pair;
    const route = routeOf(companion.tripId);
    const groupId = `demo-group-${mine.id}`;
    changes.set(mine.id, { bookedBy: name, passengerName: name, ...contact, groupId, ...regular(mine) });
    changes.set(companion.id, {
      bookedBy: name,
      ...contact,
      groupId,
      bookingRef: mine.bookingRef,
      paymentRef: mine.paymentRef,
      paymentMethod: mine.paymentMethod,
      issuedAt: mine.issuedAt,
      fareType: "Senior",
      fare: route ? computeFare(route, "Senior") : companion.fare,
      idNo: "DEMO-OSCA-0001",
    });
  }
  if (!changes.size) return db;
  return { ...db, tickets: db.tickets.map((t) => (changes.has(t.id) ? { ...t, ...changes.get(t.id) } : t)) };
}
