import { todayManila } from "./format";
import { SAMPLE_OPERATORS } from "./operator-routes";
import { getLayout, parseBlockedSeats } from "./seat-layouts";
import type {
  ApprovalRequest,
  AuditEntry,
  Bus,
  BusType,
  Company,
  Db,
  FareType,
  PaymentMethod,
  Route,
  Ticket,
  Trip,
  TripStatus,
} from "./types";

// Operator names and logos are real. DLTB's denominations are from the supplied list.
// Everything else here, including the other operators' routes, fares, plates, units,
// trips and passengers, is dummy data for testing.
const SLUG = (denomination: string) => denomination.split(" ")[0];
export const PLACEHOLDER_FARE: Record<string, number> = {
  BAGUIO: 750,
  BATANGAS: 250,
  BICOL: 1200,
  MINDORO: 800,
  "NORTHERN ROUTES": 900,
  QUEZON: 450,
  VISMIN: 2500,
};

// [company code, bus type code, description, seat layout, blocked seats]
const BUS_TYPES: [string, string, string, string, string?][] = [
  ["DLTB", "REG45", "Regular aircon", "45"],
  ["DLTB", "HC61", "High capacity", "61"],
  ["KRS", "REG53", "Regular aircon", "53"],
  ["KRS", "CR49", "Aircon with CR", "49", "48, 49"],
  ["LOR", "REG45", "Regular aircon", "45"],
  ["LOR", "HC66", "High capacity", "66"],
  ["OGW", "DLX36", "Deluxe", "36"],
  ["OGW", "SUP26", "Super deluxe", "26"],
  ["SCE", "REG49", "Regular aircon", "49"],
  ["SCE", "HC63", "High capacity", "63"],
  ["GEN", "REG49", "Regular aircon", "49"],
  ["GEN", "DLX45", "Deluxe", "45"],
];

interface TripPlan {
  route: string;
  type?: string; // Bus type code. Blank means the Operator Admin hasn't set the unit.
  time: string;
  bay: string;
  sold: number;
  day?: number; // Days from today
  status?: TripStatus;
  stopSelling?: boolean;
  noVoids?: boolean;
}

const TRIP_PLANS: TripPlan[] = [
  { route: "DLTB-BICOL", type: "REG45", time: "05:30", bay: "B12", sold: 34, status: "Departed" },
  { route: "DLTB-BATANGAS", type: "HC61", time: "21:15", bay: "B07", sold: 18 },
  { route: "DLTB-BICOL", time: "23:00", bay: "B12", sold: 3 },
  { route: "KRS-BAGUIO", type: "REG53", time: "06:30", bay: "B15", sold: 28, status: "Departed" },
  { route: "KRS-BAGUIO", type: "CR49", time: "22:00", bay: "B03", sold: 43, status: "Boarding", noVoids: true },
  { route: "LOR-QUEZON", type: "REG45", time: "12:00", bay: "B08", sold: 6, status: "Cancelled" },
  { route: "LOR-QUEZON", type: "HC66", time: "21:30", bay: "B04", sold: 25, stopSelling: true },
  { route: "OGW-NORTHERN", type: "SUP26", time: "20:30", bay: "B18", sold: 26, noVoids: true },
  { route: "OGW-NORTHERN", type: "DLX36", time: "22:30", bay: "B18", sold: 10 },
  { route: "SCE-VISMIN", type: "REG49", time: "20:00", bay: "B21", sold: 12 },
  { route: "SCE-VISMIN", time: "23:30", bay: "B22", sold: 0 },
  { route: "DLTB-BICOL", type: "HC61", time: "08:00", bay: "B12", sold: 8, day: 1 },
  { route: "KRS-BAGUIO", type: "REG53", time: "07:00", bay: "B15", sold: 5, day: 1 },
  { route: "LOR-QUEZON", type: "REG45", time: "10:00", bay: "B08", sold: 4, day: 1 },
  { route: "OGW-NORTHERN", type: "DLX36", time: "09:00", bay: "B18", sold: 3, day: 1 },
  { route: "SCE-VISMIN", type: "HC63", time: "09:30", bay: "B22", sold: 6, day: 2 },
  // Genesis: a full day of trips in every state, so its Operator Admin account has something
  // to sell, board, refund and close.
  { route: "GEN-NORTHERN", type: "REG49", time: "04:30", bay: "B19", sold: 41, status: "Departed" },
  { route: "GEN-NORTHERN", type: "DLX45", time: "09:00", bay: "B19", sold: 30, status: "Departed" },
  { route: "GEN-NORTHERN", type: "REG49", time: "21:45", bay: "B20", sold: 38, status: "Boarding" },
  { route: "GEN-NORTHERN", type: "DLX45", time: "22:30", bay: "B19", sold: 14 },
  { route: "GEN-NORTHERN", type: "REG49", time: "23:15", bay: "B20", sold: 45, stopSelling: true },
  { route: "GEN-NORTHERN", time: "23:45", bay: "B20", sold: 2 },
  { route: "GEN-NORTHERN", type: "REG49", time: "05:30", bay: "B19", sold: 9, day: 1 },
  { route: "GEN-NORTHERN", type: "DLX45", time: "13:00", bay: "B20", sold: 4, day: 1 },
  { route: "GEN-NORTHERN", type: "REG49", time: "06:00", bay: "B19", sold: 2, day: 2 },
];

export const FIRST_NAMES = ["Ana", "Ben", "Carla", "Dino", "Ella", "Franco", "Gina", "Hector", "Ines", "Jomar", "Kim", "Leo"];
export const LAST_NAMES = ["Sample", "Tester", "Demo", "Placeholder", "Mockup", "Trial", "Example"];

// [province code, province name, town code, town name, denomination]. Placeholder destinations.
const PLACES: [string, string, string, string, string][] = [
  ["BAT", "Batangas", "BATC", "Batangas City", "BATANGAS"],
  ["ALB", "Albay", "LEG", "Legazpi", "BICOL"],
  ["BEN", "Benguet", "BAG", "Baguio", "BAGUIO"],
  ["QUE", "Quezon", "LUC", "Lucena", "QUEZON"],
  ["PAN", "Pangasinan", "DAG", "Dagupan", "NORTHERN ROUTES"],
  ["CEB", "Cebu", "CEBC", "Cebu City", "VISMIN"],
];

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}

export function seedDb(): Db {
  const today = todayManila();
  const operators = SAMPLE_OPERATORS;
  const companies: Company[] = operators.map((o, i) => ({
    id: `co-${o.code}`,
    code: o.code,
    name: o.name,
    logo: o.logo,
    description: `${o.name} (demo)`,
    serialNo: `DEMO-SN-${1001 + i}`,
    minNo: `DEMO-MIN-${1001 + i}`,
    registrationNo: `DEMO-REG-${1001 + i}`,
    ptuNo: `DEMO-PTU-${1001 + i}`,
    tin: "000-000-000-000",
    ticketCode: o.code,
    advanceDays: 7,
    address: "Demo address, Parañaque City",
    contactPerson: `${o.code} Demo Contact`,
    mobileNo: "0900 000 0000",
    status: "Active",
  }));
  const routes: Route[] = operators.flatMap((o) =>
    o.denominations.map((denomination) => ({
      id: `rt-${o.code}-${SLUG(denomination)}`,
      companyId: `co-${o.code}`,
      operatorRouteId: `${o.code}-${SLUG(denomination)}`,
      code: `${o.code}-${SLUG(denomination)}`,
      description: `PITX to ${denomination}`,
      denomination,
      provinceId: `prov-${PLACES.find((p) => p[4] === denomination)?.[0]}`,
      townId: `town-${PLACES.find((p) => p[4] === denomination)?.[2]}`,
      mileage: 0,
      price: PLACEHOLDER_FARE[denomination] ?? 500,
      message: "Be at the gate 30 minutes before departure.",
      authorizedAgent: `${o.code} Demo Agent`,
      seatConfirm: true,
      status: "Active" as const,
    })),
  );

  const busTypes: BusType[] = [];
  const buses: Bus[] = [];
  BUS_TYPES.forEach(([code, typeCode, description, layoutId, blockedSeats], i) => {
    const busTypeId = `bt-${code}-${typeCode}`;
    busTypes.push({ id: busTypeId, companyId: `co-${code}`, code: typeCode, description, layoutId, blockedSeats, status: "Active" });
    // Two units per type, so a replacement can be tested.
    for (const n of [1, 2]) {
      buses.push({
        id: `bus-${code}-${typeCode}-${n}`,
        companyId: `co-${code}`,
        plateNo: `DEMO ${1000 + i * 10 + n}`,
        description: `Unit ${i * 2 + n}`,
        busTypeId,
        aircon: true,
        charter: n === 2 && i % 3 === 0 ? "Monthly Chartered" : n === 2 && i % 3 === 1 ? "Special Chartered" : "Not Chartered",
        status: "Active",
      });
    }
  });

  const trips: Trip[] = [];
  const tickets: Ticket[] = [];
  const audit: AuditEntry[] = [];
  const saleStart = Date.parse(`${today}T05:00:00+08:00`);
  let sequence = 0;

  TRIP_PLANS.forEach((plan, tripIndex) => {
    const company = plan.route.split("-")[0];
    const busId = plan.type ? `bus-${company}-${plan.type}-1` : "";
    const status = plan.status ?? "Scheduled";
    const trip: Trip = {
      id: `trip-${tripIndex + 1}`,
      tripNo: `T-${String(tripIndex + 1).padStart(4, "0")}`,
      date: addDays(today, plan.day ?? 0),
      time: plan.time,
      routeId: `rt-${plan.route}`,
      busId,
      bay: plan.bay,
      status,
      stopSelling: plan.stopSelling,
    };
    trips.push(trip);

    const busType = busTypes.find((t) => t.id === `bt-${company}-${plan.type}`);
    const layout = getLayout(busType?.layoutId);
    const blocked = parseBlockedSeats(busType?.blockedSeats, layout);
    const price = routes.find((r) => r.id === trip.routeId)!.price;

    let seat = 0;
    for (let i = 0; i < plan.sold; i++) {
      do seat++;
      while (blocked.has(seat));
      sequence++;
      const online = i % 5 === 4 || !plan.type;
      const fareType: FareType = i % 11 === 3 ? "Student" : i % 11 === 6 ? "Senior" : i % 11 === 9 ? "PWD" : "Adult";
      const fare = fareType === "Adult" ? price : Math.round(price * 80) / 100;
      const paymentMethod: PaymentMethod = online ? "E-Wallet" : i % 4 === 2 ? "Card" : i % 4 === 3 ? "E-Wallet" : "Cash";
      const voided = !online && !plan.noVoids && status !== "Departed" && i % 13 === 8;
      const boarded = status === "Departed" || (status === "Boarding" && i < plan.sold / 2);
      const counterNo = (tripIndex + i) % 2;
      const ticket: Ticket = {
        id: `tk-${sequence}`,
        ticketNo: `${company}${online ? "W" : counterNo ? "B" : "A"}-${String(sequence).padStart(6, "0")}`,
        source: online ? "Online" : "Counter",
        bookingRef: online ? `BK-${String(sequence).padStart(5, "0")}` : undefined,
        tripId: trip.id,
        counterId: online ? undefined : counterNo ? "ctr-2" : "ctr-1",
        soldBy: online ? undefined : `${company} Teller ${counterNo + 1}`,
        seatNo: seat,
        passengerName: `${FIRST_NAMES[sequence % FIRST_NAMES.length]} ${LAST_NAMES[sequence % LAST_NAMES.length]}`,
        contactNo: "0900 000 0000",
        email: `passenger${sequence}@example.com`,
        fareType,
        fare,
        idNo: fareType === "Adult" ? undefined : `DEMO-ID-${sequence}`,
        paymentMethod,
        tendered: paymentMethod === "Cash" ? Math.ceil(fare / 100) * 100 : undefined,
        paymentRef: paymentMethod === "Cash" ? undefined : `DEMO-REF-${sequence}`,
        issuedAt: new Date(saleStart + sequence * 60_000).toISOString(),
        status: voided ? "Voided" : boarded ? "Boarded" : "Reserved",
        voidReason: voided ? "Passenger changed plans (demo)" : undefined,
        voidedBy: voided ? `${company} Teller ${counterNo + 1}` : undefined,
        refundAmount: voided ? fare : undefined,
        refundMethod: voided ? paymentMethod : undefined,
        refundRef: voided && paymentMethod !== "Cash" ? `DEMO-RFD-${sequence}` : undefined,
        refundCategory: voided ? "Passenger changed plans" : undefined,
        printed: !online,
      };
      tickets.push(ticket);
      audit.push({
        id: `log-${sequence}`,
        at: ticket.issuedAt,
        by: ticket.soldBy ?? "Online booking",
        action: online ? "Booked online" : "Ticket sold",
        ticketId: ticket.id,
        tripId: trip.id,
        detail: `${ticket.ticketNo}, ${trip.tripNo} seat ${seat}`,
      });
    }
  });

  // Genesis: two reprints waiting for the PITX Admin (tellers refund directly now), on tickets
  // still to depart, so Approvals has work to show.
  const genesisOpen = tickets.filter(
    (t) => t.ticketNo.startsWith("GEN") && t.source === "Counter" && t.status === "Reserved",
  );
  const requests: ApprovalRequest[] = genesisOpen.slice(0, 2).map((t, i) => ({
    id: `req-gen-${i + 1}`,
    type: "Reprint",
    ticketId: t.id,
    category: i === 0 ? "Damaged ticket" : "Lost ticket",
    remark: i === 0 ? "Pass got wet and the QR code won't scan (demo)." : "Passenger lost the printed pass (demo).",
    requestedBy: t.soldBy ?? "GEN Teller 1",
    counterId: t.counterId,
    requestedAt: new Date(Date.parse(t.issuedAt) + 30 * 60_000).toISOString(),
    status: "Pending",
  }));

  return {
    provinces: [
      { id: "prov-mm", code: "MM", description: "Metro Manila", status: "Active" },
      ...PLACES.map(([code, description]) => ({ id: `prov-${code}`, code, description, status: "Active" as const })),
    ],
    towns: [
      { id: "town-pque", code: "PQUE", description: "Parañaque", provinceId: "prov-mm", status: "Active" },
      ...PLACES.map(([province, , code, description]) => ({
        id: `town-${code}`,
        code,
        description,
        provinceId: `prov-${province}`,
        status: "Active" as const,
      })),
    ],
    companies,
    routes,
    counters: [
      { id: "ctr-1", code: "C01", description: "Booth 1", ticketCode: "A", kiosk: false, townId: "town-pque", allowInternet: false, counterDisplay: true, kioskDisplay: false, status: "Active" },
      { id: "ctr-2", code: "C02", description: "Booth 2", ticketCode: "B", kiosk: false, townId: "town-pque", allowInternet: false, counterDisplay: true, kioskDisplay: false, status: "Active" },
      { id: "ctr-k", code: "K01", description: "Kiosk 1", ticketCode: "K", kiosk: true, townId: "town-pque", allowInternet: true, counterDisplay: false, kioskDisplay: true, status: "Active" },
    ],
    busTypes,
    buses,
    trips,
    tickets,
    audit,
    session: null,
    settings: {
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
      approvalPassword: "demo1234",
    },
    requests,
    closeCodes: [],
    closings: [],
  };
}
