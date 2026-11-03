import { getLayout, parseBlockedSeats } from "./seat-layouts";
import {
  FARE_TYPES,
  PAYMENT_METHODS,
  TRIP_STATUSES,
  type Db,
  type FareType,
  type PaymentMethod,
  type Ticket,
  type Trip,
  type TripStatus,
} from "./types";

// Reads schedule and booking exports from the separate scheduling/booking app.
// Column names are a placeholder until a real export is available.
export const TRIP_COLUMNS = ["trip_no", "date", "time", "route_code", "plate_no", "bay", "status"];
export const BOOKING_COLUMNS = [
  "booking_ref",
  "trip_no",
  "seat_no",
  "passenger_name",
  "fare_type",
  "fare",
  "payment_method",
  "payment_ref",
  "contact_no",
  "email",
];

export type CsvRow = Record<string, string>;

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const filled = rows.filter((r) => r.some((c) => c.trim()));
  if (filled.length === 0) return [];
  const headers = filled[0].map((h) => h.trim().toLowerCase());
  return filled.slice(1).map((r) => {
    const record: CsvRow = {};
    headers.forEach((h, i) => (record[h] = (r[i] ?? "").trim()));
    return record;
  });
}

export interface PlanLine<T> {
  line: number; // Spreadsheet row number, header is row 1
  label: string;
  note: string;
  record?: T;
  error?: string;
}

function sameText(a: string | undefined, b: string): boolean {
  return (a ?? "").toLowerCase() === b.toLowerCase();
}

export function planTrips(db: Db, rows: CsvRow[]): PlanLine<Trip>[] {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const line = index + 2;
    const tripNo = row.trip_no ?? "";
    const label = tripNo || "(no trip no.)";
    const fail = (error: string): PlanLine<Trip> => ({ line, label, note: "", error });

    if (!tripNo) return fail("trip_no is required.");
    if (seen.has(tripNo.toLowerCase())) return fail("Trip appears twice in this file.");
    seen.add(tripNo.toLowerCase());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date ?? "")) return fail("date must look like 2026-11-30.");
    if (!/^\d{2}:\d{2}$/.test(row.time ?? "")) return fail("time must look like 08:30.");
    const route = db.routes.find((r) => sameText(r.code, row.route_code ?? ""));
    if (!route) return fail(`Route "${row.route_code ?? ""}" is not in Master Data.`);
    // Plate is optional: the PUB Admin can set the unit after import.
    const bus = row.plate_no ? db.buses.find((b) => sameText(b.plateNo, row.plate_no)) : undefined;
    if (row.plate_no && !bus) return fail(`Plate "${row.plate_no}" is not in Master Data.`);
    if (bus && bus.companyId !== route.companyId) return fail("Bus and route belong to different companies.");
    const status = (row.status || "Scheduled") as TripStatus;
    if (!TRIP_STATUSES.includes(status)) return fail(`Unknown status "${row.status}".`);

    const existing = db.trips.find((t) => sameText(t.tripNo, tripNo));
    const busId = bus?.id ?? existing?.busId ?? "";
    const record: Trip = {
      ...existing,
      id: existing?.id ?? crypto.randomUUID(),
      tripNo: existing?.tripNo ?? tripNo,
      date: row.date,
      time: row.time,
      routeId: route.id,
      busId,
      bay: row.bay ?? "",
      status,
    };
    let note = busId ? "New trip" : "New trip, waiting for unit";
    if (existing) {
      note = bus && existing.busId !== bus.id ? `Updated: bus changed to ${bus.plateNo}` : "Updated";
    }
    return { line, label, note, record };
  });
}

export function planBookings(db: Db, rows: CsvRow[]): PlanLine<Ticket>[] {
  const claimed = new Set<string>();
  return rows.map((row, index) => {
    const line = index + 2;
    const ref = row.booking_ref ?? "";
    const label = `${ref || "(no ref)"} seat ${row.seat_no ?? "?"}`;
    const fail = (error: string): PlanLine<Ticket> => ({ line, label, note: "", error });

    if (!ref) return fail("booking_ref is required.");
    const trip = db.trips.find((t) => sameText(t.tripNo, row.trip_no ?? ""));
    if (!trip) return fail(`Trip "${row.trip_no ?? ""}" not found. Import trips first.`);
    if (!row.passenger_name) return fail("passenger_name is required.");
    const seatNo = Number(row.seat_no);
    const bus = db.buses.find((b) => b.id === trip.busId);
    const busType = db.busTypes.find((t) => t.id === bus?.busTypeId);
    const layout = getLayout(busType?.layoutId);
    if (!Number.isInteger(seatNo) || seatNo < 1 || (trip.busId && (!layout || seatNo > layout.seats))) {
      return fail(`Seat ${row.seat_no ?? ""} does not exist on this bus.`);
    }
    if (parseBlockedSeats(busType?.blockedSeats, layout).has(seatNo)) return fail(`Seat ${seatNo} is blocked.`);
    const seatKey = `${trip.id}:${seatNo}`;
    if (claimed.has(seatKey)) return fail("Seat appears twice in this file.");
    claimed.add(seatKey);

    // "Regular" is accepted because the other app may use it for the Adult fare.
    const fareText = !row.fare_type || sameText(row.fare_type, "Regular") ? "Adult" : row.fare_type;
    const fareType = FARE_TYPES.find((f) => sameText(f, fareText)) as FareType | undefined;
    if (!fareType) return fail(`Unknown fare type "${row.fare_type}".`);
    const fare = Number(row.fare);
    if (!row.fare || !Number.isFinite(fare) || fare < 0) return fail("fare must be a number.");
    const paymentMethod = PAYMENT_METHODS.find((p) => sameText(p, row.payment_method || "E-Wallet")) as
      | PaymentMethod
      | undefined;
    if (!paymentMethod) return fail(`Unknown payment method "${row.payment_method}".`);

    const existing = db.tickets.find((t) => t.source === "Online" && t.bookingRef === ref && t.tripId === trip.id && t.seatNo === seatNo);
    const holder = db.tickets.find((t) => t.tripId === trip.id && t.seatNo === seatNo && t.status !== "Voided");
    if (holder && holder.id !== existing?.id) return fail(`Seat ${seatNo} is already held by ${holder.ticketNo}.`);
    if (existing && existing.status !== "Booked") {
      return { line, label, note: `Skipped: already ${existing.status.toLowerCase()}` };
    }

    const record: Ticket = {
      id: existing?.id ?? crypto.randomUUID(),
      ticketNo: existing?.ticketNo ?? "",
      source: "Online",
      bookingRef: ref,
      tripId: trip.id,
      seatNo,
      passengerName: row.passenger_name,
      contactNo: row.contact_no || undefined,
      email: row.email || undefined,
      fareType,
      fare,
      paymentMethod,
      paymentRef: row.payment_ref || undefined,
      issuedAt: existing?.issuedAt ?? new Date().toISOString(),
      status: "Booked",
    };
    return { line, label, note: existing ? "Updated" : "New booking", record };
  });
}
