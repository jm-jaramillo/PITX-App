import { addDemoSales } from "./demo-sales";
import { todayManila } from "./format";
import { baseCode, SAMPLE_OPERATORS } from "./operator-routes";
import { portalAccessToken, SUPABASE_ANON_KEY, SUPABASE_URL } from "./portal";
import { getLayout } from "./seat-layouts";
import { PLACEHOLDER_FARE, PLACEHOLDER_GATE_FARE } from "./seed";
import { codeOfTripNo, gateOf, routeOfTripNo, tripCode } from "./trip-routes";
import type { Bus, BusType, Company, Db, Route, SeatMark, Town, Trip } from "./types";

// Real PITX data for the demo on the site, read as the portal user through the
// functions the other modules expose (never their tables):
//   tos_trip_feed(date)       approved trips with plate and bay (PITX staff only)
//   tos_vehicle_masterfile()  approved vehicles per operator (PITX staff only)
//   list_seat_trips(date)     approved trips whose bus has a seat map (anyone)
//   get_trip_seats(booking)   seats passengers requested on a trip (anyone)
// Fares, PTU/TIN and seat maps for buses without one are not in those modules:
// they get placeholders the PITX Admin can fix in Master Data. Trips with no sales
// get made-up ones (demo-sales.ts). Sales stay in the browser, like the rest of the demo.

const DAYS = 3; // today and the next two days

interface FeedTrip {
  booking_id: string;
  booking_date: string;
  slot: number;
  route: string;
  operator_id: string | null;
  operator_name: string | null;
  trade_name: string | null;
  trip_number: string | null;
  plate_no: string | null;
  bay_name?: string | null;
  capacity?: number | null;
  seats_taken?: number | null;
}

interface FeedVehicle {
  plate_no: string;
  operator_id: string | null;
  operator_name: string | null;
  trade_name: string | null;
  body_number: string | null;
  bus_type: string | null;
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T[] | null> {
  const token = portalAccessToken() ?? SUPABASE_ANON_KEY;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    return res.ok ? ((await res.json()) as T[]) : null;
  } catch {
    return null;
  }
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Slots are 15 minutes from midnight, Manila time. */
function slotTime(slot: number): string {
  const minutes = slot * 15;
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const plateKey = (plate: string | null | undefined) => (plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const slug = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "ROUTE";

function placeholderFare(destination: string): number {
  const gate = gateOf(destination);
  return PLACEHOLDER_FARE[destination] ?? (gate ? PLACEHOLDER_GATE_FARE[gate] : undefined) ?? 500;
}

/** The demo company id for a Trip Scheduling operator (profiles.id). */
export function companyIdForOperator(operatorId: string): string {
  return `op-${operatorId.toLowerCase()}`;
}

export interface LiveResult {
  db: Db;
  trips: number;
  staffFeed: boolean;
}

/**
 * Builds the demo's data from real PITX trips and vehicles. Keeps the demo's own
 * counters, settings and session, and the tickets already sold on those same
 * trips. Returns null when nothing real could be read.
 */
export async function loadLive(base: Db): Promise<LiveResult | null> {
  const today = todayManila();
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));

  const [feeds, seatTrips, vehicles] = await Promise.all([
    Promise.all(dates.map((d) => rpc<FeedTrip>("tos_trip_feed", { p_date: d }))),
    Promise.all(dates.map((d) => rpc<FeedTrip>("list_seat_trips", { p_date: d }))),
    rpc<FeedVehicle>("tos_vehicle_masterfile"),
  ]);
  const staffFeed = feeds.some((f) => f && f.length > 0);
  const seatRows = seatTrips.flatMap((r) => r ?? []);
  const capacityOf = new Map(seatRows.map((r) => [r.booking_id, r.capacity ?? null]));
  // Staff see every approved trip; others only the ones with a seat map.
  const rows: FeedTrip[] = staffFeed ? feeds.flatMap((r) => r ?? []) : seatRows.map((r) => ({ ...r, operator_id: null }));
  if (rows.length === 0) return null;

  // Companies: one per operator. Keyed by operator id, or by name when the feed hides it.
  const companies = new Map<string, Company>();
  const usedCodes = new Set<string>();
  const companyFor = (operatorId: string | null, operatorName: string | null, tradeName: string | null): Company => {
    const name = (tradeName || operatorName || "Unknown operator").trim();
    const key = operatorId ?? name.toUpperCase();
    let company = companies.get(key);
    if (!company) {
      const sample = SAMPLE_OPERATORS.find((o) => o.name === name.toUpperCase() || o.name === (operatorName ?? "").toUpperCase());
      const base = sample?.code ?? baseCode(name.toUpperCase());
      let code = base;
      for (let n = 2; usedCodes.has(code); n++) code = `${base}${n}`;
      usedCodes.add(code);
      company = {
        id: operatorId ? companyIdForOperator(operatorId) : `op-${slug(key)}`,
        code,
        name,
        description: operatorName && operatorName !== name ? operatorName : undefined,
        logo: sample?.logo,
        registrationNo: "Not set",
        ptuNo: "Not set",
        tin: "Not set",
        ticketCode: code,
        advanceDays: 7,
        address: "Not set",
        contactPerson: "Not set",
        mobileNo: "Not set",
        status: "Active",
      };
      companies.set(key, company);
    }
    return company;
  };

  // Bus types: one per company and seat count, plus "seat map not set".
  const busTypes = new Map<string, BusType>();
  const busTypeFor = (company: Company, capacity: number | null | undefined): BusType => {
    const layoutId = capacity && getLayout(String(capacity)) ? String(capacity) : "";
    const id = `bt-${company.id}-${layoutId || "unset"}`;
    let type = busTypes.get(id);
    if (!type) {
      type = {
        id,
        companyId: company.id,
        code: layoutId ? `S${layoutId}` : "UNSET",
        description: layoutId ? `${layoutId} seater` : "Seat map not set",
        layoutId,
        remark: layoutId ? undefined : "Set the seating capacity in Trip Scheduling, or pick a layout here.",
        status: "Active",
      };
      busTypes.set(id, type);
    }
    return type;
  };

  const buses = new Map<string, Bus>();
  const busFor = (company: Company, plate: string, capacity: number | null | undefined, body?: string | null): Bus => {
    const key = plateKey(plate);
    const existing = buses.get(key);
    const type = busTypeFor(company, capacity);
    if (existing) {
      if (type.layoutId) existing.busTypeId = type.id; // a trip told us the seat count
      return existing;
    }
    const bus: Bus = {
      id: `bus-${key}`,
      companyId: company.id,
      plateNo: plate,
      description: body ? `Body no. ${body}` : "",
      busTypeId: type.id,
      aircon: true,
      charter: "Not Chartered",
      status: "Active",
    };
    buses.set(key, bus);
    return bus;
  };

  for (const v of vehicles ?? []) {
    if (v.plate_no) busFor(companyFor(v.operator_id, v.operator_name, v.trade_name), v.plate_no, null, v.body_number);
  }

  // One route per company and Trip Scheduling destination. The booking's route is the
  // destination ("NAGA CITY"); its trip number starts with the destination's code
  // ("NAG1530"), which becomes the route code. Each destination is also a town, so the
  // POS destination filter works.
  const routes = new Map<string, Route>();
  const towns = new Map<string, Town>();
  const routeFor = (company: Company, text: string, tripNo: string | null): Route => {
    const destination = (text.trim() || routeOfTripNo(tripNo) || "Route not set").toUpperCase();
    const code = codeOfTripNo(tripNo) ?? tripCode(destination) ?? slug(destination);
    const id = `rt-${company.id}-${code}`;
    let route = routes.get(id);
    if (!route) {
      const townId = `town-${code}`;
      if (!towns.has(townId)) {
        towns.set(townId, { id: townId, code, description: destination, provinceId: "prov-NS", status: "Active" });
      }
      const gate = gateOf(destination);
      route = {
        id,
        companyId: company.id,
        operatorRouteId: `${company.code}-${code}`,
        code,
        description: `PITX to ${destination}`,
        denomination: gate,
        provinceId: "prov-NS",
        townId,
        mileage: 0,
        price: placeholderFare(destination),
        message: "Placeholder fare: set the real fare in Master Data.",
        seatConfirm: true,
        status: "Active",
      };
      routes.set(id, route);
    }
    return route;
  };

  const now = Date.now();
  const trips: Trip[] = rows.map((r) => {
    const company = companyFor(r.operator_id, r.operator_name, r.trade_name);
    const capacity = r.capacity ?? capacityOf.get(r.booking_id);
    const bus = r.plate_no ? busFor(company, r.plate_no, capacity) : undefined;
    const time = slotTime(r.slot);
    const departs = Date.parse(`${r.booking_date}T${time}:00+08:00`);
    return {
      id: `live-${r.booking_id}`,
      tripNo: r.trip_number || `BK-${r.booking_id.slice(0, 8).toUpperCase()}`,
      date: r.booking_date,
      time,
      routeId: routeFor(company, r.route, r.trip_number).id,
      busId: bus?.id ?? "",
      bay: r.bay_name ?? "",
      status: departs < now ? "Departed" : "Scheduled",
    };
  });

  // Seats passengers requested through Trip Scheduling are held here too.
  await Promise.all(
    seatRows
      .filter((r) => (r.seats_taken ?? 0) > 0)
      .map(async (r) => {
        const held = (await rpc<{ seat_no: number; state: string }>("get_trip_seats", { p_booking_id: r.booking_id })) ?? [];
        const trip = trips.find((t) => t.id === `live-${r.booking_id}`);
        if (!trip) return;
        const until = new Date(Date.parse(`${trip.date}T${trip.time}:00+08:00`)).toISOString();
        trip.seatMarks = held.map(
          (h): SeatMark => ({ id: `req-${r.booking_id}-${h.seat_no}`, seatNo: h.seat_no, type: "Temporary Block", until }),
        );
      }),
  );

  const tripIds = new Set(trips.map((t) => t.id));
  const tickets = base.tickets.filter((t) => tripIds.has(t.tripId));
  const ticketIds = new Set(tickets.map((t) => t.id));
  const db: Db = addDemoSales({
    ...base,
    source: "pitx",
    loadedAt: new Date().toISOString(),
    provinces: [{ id: "prov-NS", code: "NS", description: "Not set", status: "Active" }],
    towns: [...towns.values()].sort((a, b) => a.description.localeCompare(b.description)),
    companies: [...companies.values()].sort((a, b) => a.name.localeCompare(b.name)),
    busTypes: [...busTypes.values()],
    buses: [...buses.values()],
    routes: [...routes.values()],
    trips: trips.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    tickets,
    requests: base.requests.filter((r) => ticketIds.has(r.ticketId)),
    audit: base.audit.filter((a) => !a.tripId || tripIds.has(a.tripId)),
  });
  return { db, trips: trips.length, staffFeed };
}
