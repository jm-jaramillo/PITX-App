import { addDemoSales } from "./demo-sales";
import { todayManila } from "./format";
import { SAMPLE_OPERATORS } from "./operator-routes";
import { shiftRemittance } from "./reports";
import { gateOf, tripCode, tripNumber } from "./trip-routes";
import { approvedTrips, type ApprovedTrip } from "./ts-week";
import type {
  ApprovalRequest,
  Bus,
  BusType,
  Company,
  CounterOpening,
  Db,
  QueueCount,
  Route,
  SalesClosing,
  Trip,
  TripStatus,
} from "./types";

export { FIRST_NAMES, LAST_NAMES, sampleName } from "./demo-sales";

// Sample data, cross-checked with Trip Scheduling: the companies are the operator accounts in
// its demo week (scripts/trip-scheduling/seed-demo-week.mjs, via ts-week.ts), and the trips are
// the ones it approves on today's and the next two days' weekdays, with the same destination,
// time and trip number (NAG0530). Pending and rejected requests are left out, the cancelled
// one is Cancelled here too. Fares, plates, units, bays, passengers and sales are dummy data.
export const PLACEHOLDER_FARE: Record<string, number> = {
  "BATANGAS CITY": 250,
  "BATANGAS CITY (PIER)": 260,
  "LUCENA CITY": 450,
  "NASUGBU": 280,
  "CALATAGAN": 300,
  "BALAYAN": 260,
  "SAN JUAN, BATANGAS": 300,
  "STA. CRUZ, LAGUNA": 220,
  "STA. CRUZ": 220,
  "BIÑAN, LAGUNA": 120,
  "PACITA COMPLEX": 90,
  "COTTA( LUCENA QUEZON)": 460,
  "CLARK INTERNATIONAL AIRPORT": 450,
  "MARIVELES, BATAAN": 380,
  "SAN JOSE CITY, NUEVA ECIJA": 520,
  "TUGUEGARAO CITY": 1250,
  "NAGA CITY": 1100,
  "IRIGA CITY": 1150,
  "DAET": 900,
  "LEGAZPI CITY": 1300,
  "TABACO CITY": 1350,
  "SORSOGON CITY": 1450,
  "MATNOG": 1550,
  "MASBATE CITY": 1700,
  "CATANDUANES": 1650,
  "TACLOBAN CITY": 2500,
  "ORMOC CITY": 2600,
  "CALBAYOG CITY": 2300,
  "MAASIN CITY": 2700,
  "ILO-ILO CITY": 2900,
  "CEBU CITY": 3200,
  "DAVAO CITY": 4200,
  "GENERAL SANTOS CITY": 4300,
  "SAN JOSE, OCC. MINDORO": 1200,
};
// Fallback by Trip Scheduling gate for destinations without a sample fare.
export const PLACEHOLDER_GATE_FARE: Record<string, number> = { "Gate 2": 300, "Gate 4": 1300, "Gate 5": 800 };

export function fareFor(destination: string): number {
  const gate = gateOf(destination);
  return PLACEHOLDER_FARE[destination] ?? (gate ? PLACEHOLDER_GATE_FARE[gate] : undefined) ?? 500;
}

// Each company gets a regular and a bigger or deluxe bus type, two units each.
const REGULAR = ["45", "49", "53"];
const SECOND = ["61", "36", "63", "26", "66"];
const SECOND_NAME: Record<string, string> = { "61": "High capacity", "63": "High capacity", "66": "High capacity", "36": "Deluxe", "26": "Super deluxe" };

const codeOf = (destination: string) => tripCode(destination) ?? destination.replace(/[^A-Z]/g, "").slice(0, 3);
export const routeIdOf = (companyCode: string, destination: string) => `rt-${companyCode}-${destination}`;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** A sample company. Its registration numbers are dummy values. */
export function sampleCompany(code: string, name: string, n: number, logo?: string): Company {
  return {
    id: `co-${code}`,
    code,
    name,
    logo,
    description: `${name} (demo)`,
    serialNo: `DEMO-SN-${1001 + n}`,
    minNo: `DEMO-MIN-${1001 + n}`,
    registrationNo: `DEMO-REG-${1001 + n}`,
    ptuNo: `DEMO-PTU-${1001 + n}`,
    tin: "000-000-000-000",
    ticketCode: code,
    advanceDays: 7,
    address: "Demo address, Parañaque City",
    contactPerson: `${code} Demo Contact`,
    mobileNo: "0900 000 0000",
    status: "Active",
  };
}

export function sampleRoute(company: Company, destination: string): Route {
  return {
    id: routeIdOf(company.code, destination),
    companyId: company.id,
    operatorRouteId: `${company.code}-${codeOf(destination)}`,
    code: codeOf(destination),
    description: `PITX to ${destination}`,
    denomination: gateOf(destination),
    provinceId: "prov-ts",
    townId: `town-${codeOf(destination)}`,
    mileage: 0,
    price: fareFor(destination),
    message: "Be at the gate 30 minutes before departure.",
    authorizedAgent: `${company.code} Demo Agent`,
    seatConfirm: true,
    status: "Active",
  };
}

export function sampleTown(destination: string): Db["towns"][number] {
  return { id: `town-${codeOf(destination)}`, code: codeOf(destination), description: destination, provinceId: "prov-ts", status: "Active" };
}

/** Two bus types and four units for a company. n spreads the seat layouts and plates. */
export function sampleFleet(company: Company, n: number): { busTypes: BusType[]; buses: Bus[] } {
  const busTypes: BusType[] = [];
  const buses: Bus[] = [];
  const layouts = [REGULAR[n % REGULAR.length], SECOND[n % SECOND.length]];
  layouts.forEach((layoutId, k) => {
    const typeCode = `${k === 0 ? "REG" : SECOND_NAME[layoutId] === "High capacity" ? "HC" : "DLX"}${layoutId}`;
    const busTypeId = `bt-${company.code}-${typeCode}`;
    busTypes.push({
      id: busTypeId,
      companyId: company.id,
      code: typeCode,
      description: k === 0 ? "Regular aircon" : SECOND_NAME[layoutId],
      layoutId,
      blockedSeats: k === 0 && layoutId === "49" && n % 2 === 1 ? "48, 49" : undefined, // seats taken by the CR
      status: "Active",
    });
    for (const u of [1, 2]) {
      buses.push({
        id: `bus-${company.code}-${typeCode}-${u}`,
        companyId: company.id,
        plateNo: `DEMO ${1000 + n * 10 + k * 2 + u}`,
        description: `Unit ${n * 4 + k * 2 + u}`,
        busTypeId,
        aircon: true,
        charter: u === 2 && n % 3 === 0 ? "Monthly Chartered" : u === 2 && n % 3 === 1 ? "Special Chartered" : "Not Chartered",
        status: "Active",
      });
    }
  });
  return { busTypes, buses };
}

/** Next free bay (Bay 1 to Bay 20) at that date and time, starting from one per destination. */
function bayPicker() {
  const taken = new Set<string>();
  return (date: string, time: string, destination: string) => {
    let n = [...destination].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 20;
    for (let tries = 0; tries < 20 && taken.has(`${date}|${time}|${n}`); tries++) n = (n + 1) % 20;
    taken.add(`${date}|${time}|${n}`);
    return `Bay ${n + 1}`;
  };
}

export function statusAt(date: string, time: string, now: number, cancelled = false): TripStatus {
  if (cancelled) return "Cancelled";
  const departs = Date.parse(`${date}T${time}:00+08:00`);
  if (departs <= now) return "Departed";
  if (departs - now <= 45 * 60_000) return "Boarding";
  return "Scheduled";
}

/** Days of sample trips: today and the next six, the companies' advance selling window. */
export const SAMPLE_DAYS = 7;

export function seedDb(): Db {
  const today = todayManila();
  const now = Date.now();
  const companies: Company[] = SAMPLE_OPERATORS.map((o, n) => sampleCompany(o.code, o.name, n, o.logo));
  const codeByUser = new Map(SAMPLE_OPERATORS.map((o) => [o.username, o.code]));

  const busTypes: BusType[] = [];
  const buses: Bus[] = [];
  companies.forEach((c, n) => {
    const fleet = sampleFleet(c, n);
    busTypes.push(...fleet.busTypes);
    buses.push(...fleet.buses);
  });
  const routes: Route[] = SAMPLE_OPERATORS.flatMap((o, n) => o.destinations.map((d) => sampleRoute(companies[n], d)));

  // The approved Trip Scheduling trips for today and the next six days, so a passenger can
  // book any day of the week ahead (companies sell 7 days in advance).
  const trips: Trip[] = [];
  const pickBay = bayPicker();
  const unitTurn = new Map<string, number>();
  const days = Array.from({ length: SAMPLE_DAYS }, (_, day) => day);
  const plan: { date: string; day: number; trip: ApprovedTrip }[] = days.flatMap((day) => {
    const date = addDays(today, day);
    return approvedTrips(date).map((trip) => ({ date, day, trip }));
  });
  plan.forEach(({ date, day, trip: t }, i) => {
    const code = codeByUser.get(t.username)!;
    // Every trip has its unit, so it has a seat plan and can be sold, except every fourth trip
    // on the last two days: the Operator Admin still has to set those (Unit Assignment), like
    // Trip Scheduling's trips without a plate.
    const turn = unitTurn.get(code) ?? 0;
    unitTurn.set(code, turn + 1);
    const types = busTypes.filter((b) => b.companyId === `co-${code}`);
    const unset = day >= SAMPLE_DAYS - 2 && i % 4 === 3;
    const unit = unset ? "" : `bus-${code}-${types[turn % types.length].code}-1`;
    trips.push({
      id: `trip-${i + 1}`,
      tripNo: tripNumber(t.destination, t.time),
      date,
      time: t.time,
      routeId: routeIdOf(code, t.destination),
      busId: unit,
      bay: pickBay(date, t.time, t.destination),
      status: statusAt(date, t.time, now, t.cancelled),
      remark: t.cancelRequest ? `Cancellation requested in Trip Scheduling: ${t.cancelRequest}` : undefined,
      cancelRemark: t.cancelled ? "Cancelled in Trip Scheduling (demo)." : undefined,
    });
  });
  // One trip with selling stopped by the PITX Admin.
  const stop = trips.filter((t) => t.date === today && t.status === "Scheduled" && t.busId)[3];
  if (stop) {
    stop.stopSelling = true;
    stop.remark = "Selling stopped by the PITX Admin (demo).";
  }

  const counters: Db["counters"] = [
    ...["A", "B", "C", "D", "E", "F", "G", "H"].map((letter, i) => ({
      id: `ctr-${i + 1}`,
      code: `C0${i + 1}`,
      description: `Booth ${i + 1}`,
      ticketCode: letter,
      kiosk: false,
      townId: "town-pque",
      allowInternet: false,
      counterDisplay: true,
      kioskDisplay: false,
      status: "Active" as const,
    })),
    { id: "ctr-k", code: "K01", description: "Kiosk 1", ticketCode: "K", kiosk: true, townId: "town-pque", allowInternet: true, counterDisplay: false, kioskDisplay: true, status: "Active" },
  ];

  const settings: Db["settings"] = {
    defaultCounterId: "ctr-1",
    counterCutoffMinutes: 0,
    kioskCutoffMinutes: 15,
    checkInBeforeMinutes: 1440,
    checkInAfterMinutes: 60,
    insurancePrice: 0,
    seatTransferCheckRoute: true,
    refundCutoffHours: 4,
    refundPercent: 100,
    refundApproval: "None",
    refundReasons: ["Passenger changed plans", "Trip cancelled", "Wrong ticket issued", "Other"],
    reprintAllowed: true,
    reprintCharge: 5,
    reprintApproval: "Password",
    reprintReasons: ["Lost ticket", "Damaged ticket", "Wrong passenger details", "Printer error", "Other"],
    seatHoldMinutes: 10,
    issueTargetSeconds: 120,
    openingChecks: [
      "Signed in with my own account",
      "Ticket printer prints a test page",
      "QR scanner reads a test code",
      "Network is up (no offline warning)",
      "Change fund counted",
    ],
    approvalPassword: "demo1234",
  };

  const destinations = [...new Set(routes.map((r) => r.description.replace("PITX to ", "")))].sort();
  const base: Db = {
    provinces: [
      { id: "prov-mm", code: "MM", description: "Metro Manila", status: "Active" },
      { id: "prov-ts", code: "TS", description: "Trip Scheduling destinations", status: "Active" },
    ],
    towns: [
      { id: "town-pque", code: "PQUE", description: "Parañaque", provinceId: "prov-mm", status: "Active" },
      ...destinations.map(sampleTown),
    ],
    companies,
    routes,
    counters,
    busTypes,
    buses,
    trips,
    tickets: [],
    audit: [],
    session: null,
    settings,
    requests: [],
    closeCodes: [],
    closings: [],
    openings: [],
    queueCounts: [],
    source: "sample",
  };

  // Passengers, payments and refunds (demo-sales.ts), then the day's counter work around them.
  const db = addDemoSales(base);
  return { ...db, ...counterDay(db, today, now) };
}

/** Openings, closings, queue counts and approvals that go with the sample sales. */
function counterDay(db: Db, today: string, now: number): Pick<Db, "openings" | "closings" | "requests" | "queueCounts"> {
  const sameDay = (iso: string) => new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 10) === today;
  const shifts = new Map<string, { teller: string; counterId: string; first: number; last: number }>();
  for (const t of db.tickets) {
    if (t.source !== "Counter" || !t.soldBy || !t.counterId || !sameDay(t.issuedAt)) continue;
    const key = `${t.soldBy}|${t.counterId}`;
    const at = Date.parse(t.issuedAt);
    const s = shifts.get(key) ?? { teller: t.soldBy, counterId: t.counterId, first: at, last: at };
    s.first = Math.min(s.first, at);
    s.last = Math.max(s.last, at);
    shifts.set(key, s);
  }
  const list = [...shifts.values()].sort((a, b) => a.teller.localeCompare(b.teller));

  // Every teller with sales today ran the opening checks first.
  const openings: CounterOpening[] = list.map((s, i) => ({
    id: `open-${i + 1}`,
    date: today,
    teller: s.teller,
    counterId: s.counterId,
    openedAt: new Date(s.first - 10 * 60_000).toISOString(),
    checks: db.settings.openingChecks,
  }));

  // Four tellers already closed: two wait for the PITX Cashier, two are counted (one is short).
  const remit = shiftRemittance(db, today, today);
  const cashOf = (teller: string, counterId: string) =>
    remit.find((r) => r.teller === teller && r.counterId === counterId)?.Cash ?? 0;
  const closed = list.filter((s) => !/^(DLTB|GEN|JAM) /.test(s.teller)).filter((_, i) => i % 9 === 4).slice(0, 4);
  const closings: SalesClosing[] = closed.map((s, i) => {
    const cash = cashOf(s.teller, s.counterId);
    const closedAt = new Date(Math.min(now, s.last + 5 * 60_000)).toISOString();
    return {
      id: `close-${i + 1}`,
      date: today,
      teller: s.teller,
      counterId: s.counterId,
      closedAt,
      tellerCount: i === 1 ? cash - 100 : cash,
      ...(i >= 2
        ? {
            accountCount: i === 3 ? cash - 100 : cash,
            accountBy: "PITX Cashier (demo)",
            systemCash: cash,
            reconciledAt: new Date(Math.min(now, Date.parse(closedAt) + 20 * 60_000)).toISOString(),
          }
        : {}),
    };
  });

  // Reprints waiting for the PITX Admin, on counter tickets still to depart.
  const open = db.tickets.filter((t) => {
    const trip = db.trips.find((x) => x.id === t.tripId);
    return t.source === "Counter" && t.status === "Reserved" && trip?.status === "Scheduled" && !trip.stopSelling;
  });
  const picks = ["GEN", "DLTB", "JAM"].flatMap((code) => open.find((t) => t.ticketNo.startsWith(code)) ?? []);
  const reasons: [string, string][] = [
    ["Damaged ticket", "Pass got wet and the QR code won't scan (demo)."],
    ["Lost ticket", "Passenger lost the printed pass (demo)."],
    ["Wrong passenger details", "Name misspelled on the pass (demo)."],
  ];
  const requests: ApprovalRequest[] = picks.map((t, i) => ({
    id: `req-${i + 1}`,
    type: "Reprint",
    ticketId: t.id,
    category: reasons[i][0],
    remark: reasons[i][1],
    requestedBy: t.soldBy ?? "Teller",
    counterId: t.counterId,
    requestedAt: new Date(Math.min(now, Date.parse(t.issuedAt) + 30 * 60_000)).toISOString(),
    status: "Pending",
  }));

  // Lines counted every two hours from 6 AM, at four booths and the three gates.
  const queueCounts: QueueCount[] = [];
  const spots: [QueueCount["place"], string][] = [
    ["Ticket booth", "C01"],
    ["Ticket booth", "C02"],
    ["Ticket booth", "C03"],
    ["Ticket booth", "C04"],
    ["Boarding gate", "Gate 2"],
    ["Boarding gate", "Gate 4"],
    ["Boarding gate", "Gate 5"],
  ];
  for (let hour = 6; hour <= 22; hour += 2) {
    const at = Date.parse(`${today}T${String(hour).padStart(2, "0")}:00:00+08:00`);
    if (at > now) break;
    spots.forEach(([place, spot], k) => {
      queueCounts.push({
        id: `queue-${hour}-${k}`,
        at: new Date(at + k * 60_000).toISOString(),
        by: "PITX Admin (demo)",
        place,
        spot,
        count: 3 + ((hour * 7 + k * 5) % (place === "Boarding gate" ? 40 : 18)),
      });
    });
  }

  return { openings, closings, requests, queueCounts };
}
