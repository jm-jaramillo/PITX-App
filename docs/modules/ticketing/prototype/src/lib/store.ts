"use client";

import { useSyncExternalStore } from "react";
import type { PlanLine } from "./import";
import { shiftRemittance } from "./reports";
import { sells, setsUnits } from "./roles";
import { getLayout, parseBlockedSeats } from "./seat-layouts";
import { seedDb } from "./seed";
import type {
  ApprovalMode,
  ApprovalRequest,
  AuditEntry,
  CounterFare,
  Db,
  FareType,
  PaymentMethod,
  Route,
  SalesClosing,
  SeatMark,
  SeatMarkType,
  Session,
  SystemParams,
  Ticket,
  TicketReprint,
  Trip,
  TripStatus,
} from "./types";

// Prototype data layer: browser localStorage. All reads and writes go through this
// file so it can be swapped for a real backend without touching the screens.
const KEY = "pitx-tms-db-v9";

let db: Db | null = null;
const listeners = new Set<() => void>();

function load(): Db {
  if (db) return db;
  try {
    const raw = localStorage.getItem(KEY);
    db = raw ? (JSON.parse(raw) as Db) : seedDb();
  } catch {
    db = seedDb();
  }
  return db;
}

function commit(next: Db) {
  db = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked or full: the session keeps working from memory.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // A sale in another tab must show here, or this tab could resell the same seat.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    db = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDb(): Db {
  return useSyncExternalStore(subscribe, load, load);
}

const noopSubscribe = () => () => {};

/** False during server render, true once running in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function resetDemoData() {
  commit({ ...seedDb(), session: load().session });
}

/** The current data, outside React (for live.ts). */
export function getDb(): Db {
  return load();
}

/** Swaps in data read from PITX (live.ts), keeping whoever is signed in. */
export function replaceData(next: Db) {
  commit({ ...next, session: load().session });
}

function entry(data: Db, action: string, detail: string, ids: { ticketId?: string; tripId?: string } = {}): AuditEntry {
  const by = data.session ? `${data.session.name} (${data.session.role})` : "System";
  return { id: crypto.randomUUID(), at: new Date().toISOString(), by, action, detail, ...ids };
}

export function signIn(session: Session) {
  const current = load();
  const next = { ...current, session };
  commit({ ...next, audit: [...current.audit, entry(next, "Sign in", session.role)] });
}

export function signOut() {
  const current = load();
  commit({ ...current, session: null, audit: [...current.audit, entry(current, "Sign out", "")] });
}

type Collection = "provinces" | "towns" | "companies" | "counters" | "busTypes" | "buses" | "routes";

export function saveRecord(collection: Collection, record: { id?: string } & Record<string, unknown>) {
  const current = load();
  const rows = current[collection] as unknown as { id: string }[];
  const id = record.id || crypto.randomUUID();
  const saved = { ...record, id };
  const next = rows.some((r) => r.id === id)
    ? rows.map((r) => (r.id === id ? saved : r))
    : [...rows, saved];
  commit({ ...current, [collection]: next });
}

export function tripCompanyId(data: Db, trip: Trip): string | undefined {
  return data.routes.find((r) => r.id === trip.routeId)?.companyId;
}

/** Operator staff only reach their own company's trips. PITX staff reach all of them. */
export function canReachTrip(data: Db, trip: Trip | undefined): boolean {
  if (!trip) return false;
  const company = data.session?.companyId;
  return !company || tripCompanyId(data, trip) === company;
}

export function scopedTrips(data: Db): Trip[] {
  return data.trips.filter((t) => canReachTrip(data, t));
}

export function scopedTickets(data: Db): Ticket[] {
  const ids = new Set(scopedTrips(data).map((t) => t.id));
  return data.tickets.filter((t) => ids.has(t.tripId));
}

/** Trip dates and times are Philippine time. */
export function departurePassed(trip: Trip): boolean {
  return Date.parse(`${trip.date}T${trip.time}:00+08:00`) <= Date.now();
}

export const AVAILABILITY_STATUSES = ["Available", "Selling Fast", "Sold Out", "On-Hold"] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

// Assumed cutoff: Selling Fast once 20% or fewer of the seats are left.
const SELLING_FAST_SHARE = 0.2;

/** Ticket availability as named in the OBTS and PIDS specs. */
export function ticketAvailability(data: Db, trip: Trip): { status: AvailabilityStatus; left: number } {
  const capacity = seatCapacity(data, trip);
  const left = trip.busId ? Math.max(0, capacity - takenSeats(data, trip.id).size) : 0;
  if (!trip.busId || trip.stopSelling) return { status: "On-Hold", left };
  if (left === 0) return { status: "Sold Out", left };
  return { status: left <= capacity * SELLING_FAST_SHARE ? "Selling Fast" : "Available", left };
}

export const TRIP_GROUPS = [
  ...AVAILABILITY_STATUSES,
  "Waiting for unit",
  "Past departure",
  "Successful",
  "Cancelled",
] as const;
export type TripGroup = (typeof TRIP_GROUPS)[number];

export function tripGroup(data: Db, trip: Trip): TripGroup {
  if (trip.status === "Departed") return "Successful";
  if (trip.status === "Cancelled") return "Cancelled";
  if (departurePassed(trip)) return "Past departure";
  if (!trip.busId) return "Waiting for unit";
  return ticketAvailability(data, trip).status;
}

/** The PUB Admin sets the vehicle for a trip, which decides its seat map. */
export function assignUnit(tripId: string, busId: string): string | null {
  const current = load();
  if (!setsUnits(current.session?.role)) return "Only the PUB Admin can set the unit.";
  const trip = current.trips.find((t) => t.id === tripId);
  if (!trip || !canReachTrip(current, trip)) return "This trip belongs to another company.";
  if (trip.status === "Departed" || trip.status === "Cancelled") return `This trip is ${trip.status.toLowerCase()}.`;
  const bus = current.buses.find((b) => b.id === busId);
  if (busId && (!bus || bus.companyId !== tripCompanyId(current, trip))) return "That unit belongs to another company.";
  if (bus && bus.status !== "Active") return `${bus.plateNo} is inactive.`;
  const clash = current.trips.find(
    (t) => t.id !== tripId && busId && t.busId === busId && t.date === trip.date && t.time === trip.time && t.status !== "Cancelled",
  );
  if (clash) return `${bus?.plateNo} already runs ${clash.tripNo} at ${trip.time}.`;
  const before = current.buses.find((b) => b.id === trip.busId)?.plateNo ?? "none";
  commit({
    ...current,
    trips: current.trips.map((t) => (t.id === tripId ? { ...t, busId } : t)),
    audit: [
      ...current.audit,
      entry(current, "Unit assigned", `${trip.tripNo}: ${before} to ${bus?.plateNo ?? "none"}`, { tripId }),
    ],
  });
  return null;
}

export function tripSeating(data: Db, trip: Trip) {
  const bus = data.buses.find((b) => b.id === trip.busId);
  const busType = data.busTypes.find((t) => t.id === bus?.busTypeId);
  const layout = getLayout(busType?.layoutId);
  const blocked = parseBlockedSeats(busType?.blockedSeats, layout);
  const now = Date.now();
  for (const mark of trip.seatMarks ?? []) {
    const active = !mark.until || Date.parse(mark.until) > now;
    if (!active || !layout || mark.seatNo > layout.seats) continue;
    if (mark.type === "Temporary Release") blocked.delete(mark.seatNo);
    else blocked.add(mark.seatNo);
  }
  return { layout, blocked };
}

export function addSeatMark(tripId: string, seatNos: number[], type: SeatMarkType, minutes: number): string | null {
  const current = load();
  const trip = current.trips.find((t) => t.id === tripId);
  if (!trip) return "Trip not found.";
  const { layout } = tripSeating(current, trip);
  if (!layout) return "Set the unit first.";
  if (seatNos.length === 0 || seatNos.some((n) => !Number.isInteger(n) || n < 1 || n > layout.seats)) {
    return `Enter seat numbers from 1 to ${layout.seats}.`;
  }
  const taken = takenSeats(current, tripId);
  const sold = seatNos.filter((n) => taken.has(n));
  if (type !== "Temporary Release" && sold.length) return `Seat ${sold.join(", ")} is already sold.`;
  if (type !== "Permanent Block" && !(minutes > 0)) return "Enter how many minutes the mark lasts.";
  const until = type === "Permanent Block" ? undefined : new Date(Date.now() + minutes * 60_000).toISOString();
  const marks: SeatMark[] = seatNos.map((seatNo) => ({ id: crypto.randomUUID(), seatNo, type, until }));
  commit({
    ...current,
    trips: current.trips.map((t) => (t.id === tripId ? { ...t, seatMarks: [...(t.seatMarks ?? []), ...marks] } : t)),
    audit: [
      ...current.audit,
      entry(current, "Seat mark added", `${trip.tripNo}: ${type}, seat ${seatNos.join(", ")}`, { tripId }),
    ],
  });
  return null;
}

export function removeSeatMark(tripId: string, markId: string) {
  const current = load();
  const trip = current.trips.find((t) => t.id === tripId);
  const mark = trip?.seatMarks?.find((m) => m.id === markId);
  if (!trip || !mark) return;
  commit({
    ...current,
    trips: current.trips.map((t) =>
      t.id === tripId ? { ...t, seatMarks: t.seatMarks?.filter((m) => m.id !== markId) } : t,
    ),
    audit: [...current.audit, entry(current, "Seat mark removed", `${trip.tripNo}: ${mark.type}, seat ${mark.seatNo}`, { tripId })],
  });
}

/** What a unit change does to sold seats: the same seat number carries over, or staff move the passenger. */
export function unitChangeImpact(data: Db, trip: Trip, busId: string): { kept: number; manual: number } {
  const { layout, blocked } = tripSeating(data, { ...trip, busId });
  const sold = data.tickets.filter((t) => t.tripId === trip.id && (t.status === "Issued" || t.status === "Booked"));
  const manual = layout ? sold.filter((t) => t.seatNo > layout.seats || blocked.has(t.seatNo)).length : 0;
  return { kept: sold.length - manual, manual };
}

/** Sellable seats: the layout's seats minus blocked ones such as CR seats. */
export function seatCapacity(data: Db, trip: Trip): number {
  const { layout, blocked } = tripSeating(data, trip);
  return (layout?.seats ?? 0) - blocked.size;
}

export function takenSeats(data: Db, tripId: string): Set<number> {
  return new Set(
    data.tickets.filter((t) => t.tripId === tripId && t.status !== "Voided").map((t) => t.seatNo),
  );
}

function nextTripNo(data: Db): string {
  let n = data.trips.length + 1;
  while (data.trips.some((t) => t.tripNo === `T-${String(n).padStart(4, "0")}`)) n++;
  return `T-${String(n).padStart(4, "0")}`;
}

export function saveTrip(input: Omit<Trip, "id" | "tripNo" | "status">): string | null {
  const current = load();
  const route = current.routes.find((r) => r.id === input.routeId);
  const bus = current.buses.find((b) => b.id === input.busId);
  if (!route) return "Select a route.";
  if (bus && route.companyId !== bus.companyId) return "The bus and route belong to different companies.";
  const clash = current.trips.some(
    (t) => bus && t.busId === input.busId && t.date === input.date && t.time === input.time && t.status !== "Cancelled",
  );
  if (clash) return `${bus?.plateNo} already has a trip at ${input.time}.`;
  const tripNo = nextTripNo(current);
  const trip: Trip = { ...input, id: crypto.randomUUID(), tripNo, status: "Scheduled" };
  commit({
    ...current,
    trips: [...current.trips, trip],
    audit: [...current.audit, entry(current, "Trip added", tripNo, { tripId: trip.id })],
  });
  return null;
}

/** Trip numbers are unique per bus operator per day. */
export function editTrip(id: string, changes: { time: string; tripNo: string }): string | null {
  const current = load();
  const trip = current.trips.find((t) => t.id === id);
  if (!trip) return "Trip not found.";
  if (trip.status === "Departed" || trip.status === "Cancelled") return `This trip is ${trip.status.toLowerCase()}.`;
  const tripNo = changes.tripNo.trim();
  if (!tripNo || !/^\d{2}:\d{2}$/.test(changes.time)) return "Enter the trip number and time.";
  const company = tripCompanyId(current, trip);
  const duplicate = current.trips.some(
    (t) => t.id !== id && t.date === trip.date && t.tripNo === tripNo && tripCompanyId(current, t) === company,
  );
  if (duplicate) return `${tripNo} is already used by this operator on ${trip.date}.`;
  commit({
    ...current,
    trips: current.trips.map((t) => (t.id === id ? { ...t, time: changes.time, tripNo } : t)),
    audit: [
      ...current.audit,
      entry(current, "Trip modified", `${trip.tripNo} ${trip.time} to ${tripNo} ${changes.time}`, { tripId: id }),
    ],
  });
  return null;
}

export function cancelTrip(id: string, remark: string): string | null {
  const current = load();
  const trip = current.trips.find((t) => t.id === id);
  if (!trip) return "Trip not found.";
  if (!remark.trim()) return "Enter the reason for cancelling.";
  commit({
    ...current,
    trips: current.trips.map((t) => (t.id === id ? { ...t, status: "Cancelled", cancelRemark: remark.trim() } : t)),
    audit: [...current.audit, entry(current, "Trip cancelled", `${trip.tripNo}: ${remark.trim()}`, { tripId: id })],
  });
  return null;
}

export function updateTrip(id: string, changes: { status?: TripStatus; stopSelling?: boolean; remark?: string }) {
  const current = load();
  const trip = current.trips.find((t) => t.id === id);
  if (!trip) return;
  const detail =
    changes.status !== undefined
      ? `${trip.tripNo}: status ${trip.status} to ${changes.status}`
      : changes.remark !== undefined
        ? `${trip.tripNo}: remark set to "${changes.remark}"`
        : `${trip.tripNo}: selling ${changes.stopSelling ? "stopped" : "resumed"}`;
  commit({
    ...current,
    trips: current.trips.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    audit: [...current.audit, entry(current, "Trip updated", detail, { tripId: id })],
  });
}

function isSet(value: number | undefined | null): value is number {
  return value !== undefined && value !== null && String(value) !== "";
}

/** The counter's fare if it has one, then the route's, then 20% off the Adult fare. */
export function computeFare(route: Route, fareType: FareType, counterId?: string): number {
  const own = route.counterFares?.find((f) => f.counterId === counterId);
  const adult = isSet(own?.adult) ? Number(own.adult) : route.price;
  if (fareType === "Adult") return adult;
  const forCounter = { Student: own?.student, Senior: own?.senior, PWD: own?.pwd }[fareType];
  if (isSet(forCounter)) return Number(forCounter);
  const forRoute = { Student: route.studentFare, Senior: route.seniorFare, PWD: route.pwdFare }[fareType];
  if (isSet(forRoute)) return Number(forRoute);
  // No category fare set: 20% off. Confirm against the fare matrix.
  return Math.round(adult * 80) / 100;
}

export function saveCounterFare(routeId: string, fare: CounterFare) {
  const current = load();
  const route = current.routes.find((r) => r.id === routeId);
  if (!route) return;
  const counterCode = current.counters.find((c) => c.id === fare.counterId)?.code;
  const others = (route.counterFares ?? []).filter((f) => f.counterId !== fare.counterId);
  commit({
    ...current,
    routes: current.routes.map((r) => (r.id === routeId ? { ...r, counterFares: [...others, fare] } : r)),
    audit: [
      ...current.audit,
      entry(current, "Counter fares saved", `${route.code} at ${counterCode}: ${fare.selling ? "selling" : "not selling"}`),
    ],
  });
}

function departureTime(trip: Trip): number {
  return Date.parse(`${trip.date}T${trip.time}:00+08:00`);
}

function cutoffMinutes(data: Db): number {
  const kiosk = data.counters.find((c) => c.id === data.session?.counterId)?.kiosk;
  return kiosk ? data.settings.kioskCutoffMinutes : data.settings.counterCutoffMinutes;
}

/** True once a trip is inside the counter or kiosk display cutoff, or has left. */
export function sellingClosed(data: Db, trip: Trip): boolean {
  return departureTime(trip) - cutoffMinutes(data) * 60_000 <= Date.now();
}

export function salesClosedToday(data: Db, today: string): boolean {
  const session = data.session;
  return data.closings.some(
    (c) => c.date === today && c.teller === session?.name && c.counterId === session.counterId,
  );
}

/** Why a trip can't be sold right now, or null when it can. */
export function sellingBlock(data: Db, trip: Trip, today: string): string | null {
  if (trip.status === "Departed" || trip.status === "Cancelled") return `This trip is ${trip.status.toLowerCase()}.`;
  if (!canReachTrip(data, trip)) return "This trip belongs to another company.";
  if (!trip.busId) return "The PUB Admin hasn't set the unit yet, so seats aren't available.";
  if (trip.stopSelling) return "Selling is stopped for this trip.";
  if (departurePassed(trip)) return "This trip's departure time has passed.";
  if (salesClosedToday(data, today)) return "Your sales for today are closed at this counter.";
  if (sellingClosed(data, trip)) {
    return `Selling closed ${cutoffMinutes(data)} minutes before departure.`;
  }
  const route = data.routes.find((r) => r.id === trip.routeId);
  const counterId = data.session?.counterId;
  if (route?.counterFares?.find((f) => f.counterId === counterId)?.selling === false) {
    return "Your counter doesn't sell this route.";
  }
  const company = data.companies.find((c) => c.id === route?.companyId);
  const days = Math.round((Date.parse(trip.date) - Date.parse(today)) / 86_400_000);
  if (company && days > company.advanceDays) {
    return `${company.code} only allows selling ${company.advanceDays} days in advance.`;
  }
  return null;
}

export interface PassengerInput {
  seatNo: number;
  passengerName: string;
  contactNo: string;
  email: string;
  fareType: FareType;
  idNo: string;
}

export interface IssueInput {
  tripId: string;
  passengers: PassengerInput[];
  paymentMethod: PaymentMethod;
  tendered: number;
  paymentRef: string;
}

/** Sells every seat in one payment, or none of them if anything is wrong. */
export function issueTickets(input: IssueInput, today: string): { tickets?: Ticket[]; error?: string } {
  const current = load();
  const trip = current.trips.find((t) => t.id === input.tripId);
  if (!trip) return { error: "Trip not found." };
  const blockedReason = sellingBlock(current, trip, today);
  if (blockedReason) return { error: blockedReason };
  if (input.passengers.length === 0) return { error: "Select at least one seat." };
  const { layout, blocked } = tripSeating(current, trip);
  const taken = takenSeats(current, trip.id);
  const route = current.routes.find((r) => r.id === trip.routeId);
  const company = current.companies.find((c) => c.id === route?.companyId);
  const counter = current.counters.find((c) => c.id === current.session?.counterId);
  if (!route || !company) return { error: "This trip's route is missing from Master Data." };
  if (!counter) return { error: "Sign in with a counter to sell tickets." };

  let total = 0;
  for (const p of input.passengers) {
    if (!p.passengerName.trim()) return { error: `Enter the passenger name for seat ${p.seatNo}.` };
    if (!layout || p.seatNo < 1 || p.seatNo > layout.seats) return { error: `Seat ${p.seatNo} isn't on this bus.` };
    if (blocked.has(p.seatNo)) return { error: `Seat ${p.seatNo} is blocked. Pick another seat.` };
    if (taken.has(p.seatNo)) return { error: `Seat ${p.seatNo} was just taken. Pick another seat.` };
    if (p.fareType !== "Adult" && !p.idNo.trim()) {
      return { error: `Enter the ${p.fareType} ID number for seat ${p.seatNo}.` };
    }
    if (p.email.trim() && !/^\S+@\S+\.\S+$/.test(p.email.trim())) {
      return { error: `Check the email address for seat ${p.seatNo}.` };
    }
    total += computeFare(route, p.fareType, counter.id) + current.settings.insurancePrice;
  }
  if (input.paymentMethod === "Cash" && !(input.tendered >= total)) {
    return { error: "Cash received is less than the total." };
  }
  if (input.paymentMethod !== "Cash" && !input.paymentRef.trim()) {
    return { error: `Enter the ${input.paymentMethod} reference number.` };
  }

  const groupId = crypto.randomUUID();
  const issuedAt = new Date().toISOString();
  const tickets: Ticket[] = input.passengers.map((p, index) => ({
    id: crypto.randomUUID(),
    ticketNo: `${company.ticketCode}${counter.ticketCode}-${String(current.tickets.length + index + 1).padStart(6, "0")}`,
    groupId,
    source: "Counter",
    tripId: trip.id,
    counterId: counter.id,
    soldBy: current.session?.name,
    seatNo: p.seatNo,
    passengerName: p.passengerName.trim(),
    contactNo: p.contactNo.trim() || undefined,
    email: p.email.trim() || undefined,
    fareType: p.fareType,
    fare: computeFare(route, p.fareType, counter.id),
    insurance: current.settings.insurancePrice || undefined,
    idNo: p.idNo.trim() || undefined,
    paymentMethod: input.paymentMethod,
    tendered: input.paymentMethod === "Cash" ? input.tendered : undefined,
    paymentRef: input.paymentRef.trim() || undefined,
    issuedAt,
    status: "Issued",
  }));
  commit({
    ...current,
    tickets: [...current.tickets, ...tickets],
    audit: [
      ...current.audit,
      ...tickets.map((t) =>
        entry(current, "Ticket sold", `${t.ticketNo}, ${trip.tripNo} seat ${t.seatNo}`, { ticketId: t.id, tripId: trip.id }),
      ),
    ],
  });
  return { tickets };
}

/** Issues the boarding pass for an online booking at the counter. */
export function checkInBooking(id: string): string | null {
  const current = load();
  const ticket = current.tickets.find((t) => t.id === id);
  if (!ticket || ticket.status !== "Booked") return "This booking is not waiting for a boarding pass.";
  if (!canReachTrip(current, current.trips.find((t) => t.id === ticket.tripId))) {
    return "This booking belongs to another company.";
  }
  const counter = current.session?.counterId;
  commit({
    ...current,
    tickets: current.tickets.map((t) =>
      t.id === id ? { ...t, status: "Issued", counterId: counter, soldBy: current.session?.name } : t,
    ),
    audit: [
      ...current.audit,
      entry(current, "Boarding pass issued", `${ticket.ticketNo}, booking ${ticket.bookingRef}`, { ticketId: id }),
    ],
  });
  return null;
}

/** How the signed-in user may complete a refund or reprint. */
export type ApprovalStep = "direct" | "password" | "request";

function stepForMode(mode: ApprovalMode): ApprovalStep {
  return mode === "None" ? "direct" : mode === "Password" ? "password" : "request";
}

/**
 * The Super Admin refunds directly. A Teller follows the refund setting up to the cutoff,
 * and inside the cutoff always needs the Super Admin's approval.
 */
export function refundPlan(data: Db, ticket: Ticket, now: number): { block?: string; step: ApprovalStep; note?: string } {
  const step: ApprovalStep = "direct";
  if (ticket.source === "Online") return { step, block: "Cancel online bookings in the booking system, then import again." };
  if (ticket.status !== "Issued") return { step, block: `A ${ticket.status.toLowerCase()} ticket can't be refunded.` };
  const session = data.session;
  if (session?.role === "Super Admin") return { step };
  if (!sells(session?.role)) return { step, block: "Only a Teller of this company or the Super Admin can refund this ticket." };
  const trip = data.trips.find((t) => t.id === ticket.tripId);
  if (!trip || !canReachTrip(data, trip)) return { step, block: "This ticket belongs to another company." };
  const hours = data.settings.refundCutoffHours;
  if (departureTime(trip) - now < hours * 3_600_000) {
    return { step: "request", note: `Less than ${hours} hours before departure, so this needs the Super Admin's approval.` };
  }
  return { step: stepForMode(data.settings.refundApproval) };
}

export function refundAmountFor(data: Db, ticket: Ticket): number {
  return Math.round(ticket.fare * data.settings.refundPercent) / 100;
}

function applyRefund(
  data: Db,
  ticket: Ticket,
  details: { category: string; remark: string; method: PaymentMethod; ref: string; by?: string },
): Db {
  const amount = refundAmountFor(data, ticket);
  const reason = [details.category, details.remark.trim()].filter(Boolean).join(": ");
  return {
    ...data,
    tickets: data.tickets.map((t) =>
      t.id === ticket.id
        ? {
            ...t,
            status: "Voided",
            voidReason: reason,
            voidedBy: details.by ?? data.session?.name,
            refundCategory: details.category,
            refundAmount: amount,
            refundMethod: details.method,
            refundRef: details.ref.trim() || undefined,
          }
        : t,
    ),
    audit: [
      ...data.audit,
      entry(data, "Ticket refunded", `${ticket.ticketNo}: ${reason}. ₱${amount} by ${details.method}`, { ticketId: ticket.id }),
    ],
  };
}

function checkPassword(data: Db, step: ApprovalStep, password: string): string | null {
  return step === "password" && password !== data.settings.approvalPassword ? "That approval password isn't correct." : null;
}

function newRequest(data: Db, request: Pick<ApprovalRequest, "type" | "ticketId" | "category" | "remark"> & Partial<ApprovalRequest>): ApprovalRequest {
  return {
    ...request,
    id: crypto.randomUUID(),
    requestedBy: data.session?.name ?? "Unknown",
    counterId: data.session?.counterId,
    requestedAt: new Date().toISOString(),
    status: "Pending",
  };
}

export function pendingRequest(data: Db, ticketId: string, type: ApprovalRequest["type"]): ApprovalRequest | undefined {
  return data.requests.find((r) => r.ticketId === ticketId && r.type === type && r.status === "Pending");
}

export interface RefundInput {
  category: string;
  remark: string;
  method: PaymentMethod;
  ref: string;
  password: string;
}

/** Refunds and voids the ticket, or sends it for approval. Returns an error, or null when done. */
export function refundTicket(id: string, input: RefundInput): { error?: string; pending?: boolean } {
  const current = load();
  const ticket = current.tickets.find((t) => t.id === id);
  if (!ticket) return { error: "Ticket not found." };
  const plan = refundPlan(current, ticket, Date.now());
  if (plan.block) return { error: plan.block };
  if (pendingRequest(current, id, "Refund")) return { error: "A refund request is already waiting for approval." };
  if (!input.category) return { error: "Choose a refund reason." };
  if (input.category === "Other" && !input.remark.trim()) return { error: "Enter a remark for this reason." };
  if (refundAmountFor(current, ticket) > 0 && input.method !== "Cash" && !input.ref.trim()) {
    return { error: `Enter the ${input.method} refund reference number.` };
  }
  const badPassword = checkPassword(current, plan.step, input.password);
  if (badPassword) return { error: badPassword };
  if (plan.step === "request") {
    const request = newRequest(current, {
      type: "Refund",
      ticketId: id,
      category: input.category,
      remark: input.remark.trim(),
      refundMethod: input.method,
      refundRef: input.ref,
    });
    commit({
      ...current,
      requests: [...current.requests, request],
      audit: [...current.audit, entry(current, "Refund requested", `${ticket.ticketNo}: ${input.category}`, { ticketId: id })],
    });
    return { pending: true };
  }
  commit(applyRefund(current, ticket, input));
  return {};
}

export function reprintPlan(data: Db, ticket: Ticket): { block?: string; step: ApprovalStep } {
  const step: ApprovalStep = "direct";
  if (!data.settings.reprintAllowed) return { step, block: "Ticket reprints are turned off in System Parameters." };
  if (ticket.status === "Voided") return { step, block: "A voided ticket can't be reprinted." };
  if (ticket.status === "Booked") return { step, block: "Issue the boarding pass first." };
  const trip = data.trips.find((t) => t.id === ticket.tripId);
  if (!canReachTrip(data, trip)) return { step, block: "This ticket belongs to another company." };
  if (data.session?.role === "Super Admin") return { step };
  if (!sells(data.session?.role)) return { step, block: "Only a Teller or the Super Admin can reprint tickets." };
  return { step: stepForMode(data.settings.reprintApproval) };
}

function applyReprint(
  data: Db,
  ticket: Ticket,
  details: { category: string; remark: string; passengerName?: string; contactNo?: string; by?: string; counterId?: string },
): Db {
  const by = details.by ?? data.session?.name ?? "Unknown";
  const counterId = details.counterId ?? data.session?.counterId;
  const charge = data.settings.reprintCharge;
  const reprint: TicketReprint = { at: new Date().toISOString(), by, counterId, category: details.category, remark: details.remark, charge };
  return {
    ...data,
    tickets: data.tickets.map((t) =>
      t.id === ticket.id
        ? {
            ...t,
            passengerName: details.passengerName?.trim() || t.passengerName,
            contactNo: details.contactNo?.trim() || t.contactNo,
            reprints: [...(t.reprints ?? []), reprint],
          }
        : t,
    ),
    audit: [
      ...data.audit,
      entry(data, "Ticket reprinted", `${ticket.ticketNo}: ${details.category}. Charge ₱${charge}`, { ticketId: ticket.id }),
    ],
  };
}

export interface ReprintInput {
  category: string;
  remark: string;
  passengerName: string;
  contactNo: string;
  password: string;
}

export function reprintTicket(id: string, input: ReprintInput): { error?: string; pending?: boolean } {
  const current = load();
  const ticket = current.tickets.find((t) => t.id === id);
  if (!ticket) return { error: "Ticket not found." };
  const plan = reprintPlan(current, ticket);
  if (plan.block) return { error: plan.block };
  if (pendingRequest(current, id, "Reprint")) return { error: "A reprint request is already waiting for approval." };
  if (!input.category) return { error: "Choose a reprint reason." };
  if (input.category === "Other" && !input.remark.trim()) return { error: "Enter a remark for this reason." };
  if (!input.passengerName.trim()) return { error: "Enter the passenger name." };
  const badPassword = checkPassword(current, plan.step, input.password);
  if (badPassword) return { error: badPassword };
  if (plan.step === "request") {
    const request = newRequest(current, {
      type: "Reprint",
      ticketId: id,
      category: input.category,
      remark: input.remark.trim(),
      passengerName: input.passengerName,
      contactNo: input.contactNo,
    });
    commit({
      ...current,
      requests: [...current.requests, request],
      audit: [...current.audit, entry(current, "Reprint requested", `${ticket.ticketNo}: ${input.category}`, { ticketId: id })],
    });
    return { pending: true };
  }
  commit(applyReprint(current, ticket, input));
  return {};
}

export function decideRequest(id: string, approve: boolean): string | null {
  const current = load();
  if (current.session?.role !== "Super Admin") return "Only the Super Admin can decide requests.";
  const request = current.requests.find((r) => r.id === id);
  const ticket = current.tickets.find((t) => t.id === request?.ticketId);
  if (!request || !ticket || request.status !== "Pending") return "This request is no longer open.";
  if (approve && request.type === "Refund" && ticket.status !== "Issued") {
    return `This ticket is now ${ticket.status.toLowerCase()}, so it can't be refunded.`;
  }
  let next = current;
  if (approve && request.type === "Refund") {
    next = applyRefund(current, ticket, {
      category: request.category,
      remark: request.remark,
      method: request.refundMethod ?? ticket.paymentMethod,
      ref: request.refundRef ?? "",
      by: `${request.requestedBy}, approved by ${current.session.name}`,
    });
  } else if (approve) {
    next = applyReprint(current, ticket, {
      category: request.category,
      remark: request.remark,
      passengerName: request.passengerName,
      contactNo: request.contactNo,
      by: request.requestedBy,
      counterId: request.counterId,
    });
  }
  commit({
    ...next,
    requests: next.requests.map((r) =>
      r.id === id ? { ...r, status: approve ? "Approved" : "Rejected", decidedBy: current.session?.name } : r,
    ),
    audit: [
      ...next.audit,
      entry(next, `${request.type} ${approve ? "approved" : "rejected"}`, `${ticket.ticketNo}, requested by ${request.requestedBy}`, {
        ticketId: ticket.id,
      }),
    ],
  });
  return null;
}

export function markPrinted(ids: string[]) {
  const current = load();
  commit({ ...current, tickets: current.tickets.map((t) => (ids.includes(t.id) ? { ...t, printed: true } : t)) });
}

export function saveSettings(settings: SystemParams) {
  const current = load();
  commit({
    ...current,
    settings,
    audit: [...current.audit, entry(current, "System parameters saved", "")],
  });
}

/** A one-use code the Super Admin gives a Teller so they can close sales. */
export function generateCloseCode(): string | null {
  const current = load();
  if (current.session?.role !== "Super Admin") return null;
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  commit({
    ...current,
    closeCodes: [...current.closeCodes, { code, issuedAt: new Date().toISOString(), issuedBy: current.session.name, used: false }],
    audit: [...current.audit, entry(current, "Close code issued", "")],
  });
  return code;
}

export function closeSales(code: string, tellerCount: number, today: string): string | null {
  const current = load();
  const session = current.session;
  if (!sells(session?.role) || !session?.counterId) return "Sign in as a Teller with a counter.";
  if (salesClosedToday(current, today)) return "Your sales for today are already closed.";
  const match = current.closeCodes.find((c) => c.code === code.trim() && !c.used);
  if (!match) return "That approval code isn't valid or was already used.";
  if (!(tellerCount >= 0)) return "Enter the cash you counted.";
  const closing: SalesClosing = {
    id: crypto.randomUUID(),
    date: today,
    teller: session.name,
    counterId: session.counterId,
    closedAt: new Date().toISOString(),
    tellerCount,
  };
  commit({
    ...current,
    closings: [...current.closings, closing],
    closeCodes: current.closeCodes.map((c) => (c === match ? { ...c, used: true } : c)),
    audit: [...current.audit, entry(current, "Sales closed", `${session.name} closed sales for ${today}`)],
  });
  return null;
}

/** Account's own blind count. Only after this do the counts and the system cash become visible. */
export function submitCollection(id: string, accountCount: number): string | null {
  const current = load();
  if (current.session?.role !== "Account") return "Only Account staff can enter the collection.";
  const closing = current.closings.find((c) => c.id === id);
  if (!closing || closing.reconciledAt) return "This closing is no longer open.";
  if (!(accountCount >= 0)) return "Enter the cash you counted.";
  const shift = shiftRemittance(current, closing.date, closing.date).find(
    (s) => s.teller === closing.teller && s.counterId === closing.counterId,
  );
  commit({
    ...current,
    closings: current.closings.map((c) =>
      c.id === id
        ? {
            ...c,
            accountCount,
            accountBy: current.session?.name,
            systemCash: shift?.Cash ?? 0,
            reconciledAt: new Date().toISOString(),
          }
        : c,
    ),
    audit: [...current.audit, entry(current, "Collection entered", `${closing.teller}, ${closing.date}`)],
  });
  return null;
}

/** Trips a passenger can be moved to, not yet gone. By default only on the same route. */
export function transferOptions(data: Db, ticket: Ticket): Trip[] {
  const from = data.trips.find((t) => t.id === ticket.tripId);
  return data.trips
    .filter(
      (t) =>
        (data.settings.seatTransferCheckRoute
          ? t.routeId === from?.routeId
          : from !== undefined && tripCompanyId(data, t) === tripCompanyId(data, from)) &&
        !departurePassed(t) &&
        (t.status === "Scheduled" || t.status === "Boarding"),
    )
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export function moveTicket(id: string, tripId: string, seatNo: number, reason: string): string | null {
  const current = load();
  const ticket = current.tickets.find((t) => t.id === id);
  const toTrip = current.trips.find((t) => t.id === tripId);
  const fromTrip = current.trips.find((t) => t.id === ticket?.tripId);
  if (!ticket || !toTrip || !fromTrip) return "Ticket or trip not found.";
  if (!canReachTrip(current, fromTrip)) return "This ticket belongs to another company.";
  if (ticket.status !== "Issued" && ticket.status !== "Booked") {
    return `A ${ticket.status.toLowerCase()} ticket can't be moved.`;
  }
  if (current.settings.seatTransferCheckRoute && toTrip.routeId !== fromTrip.routeId) {
    return "Tickets can only move to a trip on the same route.";
  }
  if (tripCompanyId(current, toTrip) !== tripCompanyId(current, fromTrip)) return "That trip belongs to another company.";
  if (toTrip.status === "Departed" || toTrip.status === "Cancelled") return `That trip is ${toTrip.status.toLowerCase()}.`;
  if (departurePassed(toTrip)) return "That trip's departure time has passed.";
  if (!reason.trim()) return "Enter the reason for the change.";
  const { layout, blocked } = tripSeating(current, toTrip);
  if (!layout || seatNo < 1 || seatNo > layout.seats) return "Select a seat.";
  if (blocked.has(seatNo)) return `Seat ${seatNo} is blocked.`;
  const holder = current.tickets.find(
    (t) => t.id !== id && t.tripId === tripId && t.seatNo === seatNo && t.status !== "Voided",
  );
  if (holder) return `Seat ${seatNo} is already taken.`;
  if (tripId === ticket.tripId && seatNo === ticket.seatNo) return "That is the ticket's current seat.";
  const action = tripId === ticket.tripId ? "Seat changed" : "Trip transferred";
  const detail = `${ticket.ticketNo}: ${fromTrip.tripNo} seat ${ticket.seatNo} to ${toTrip.tripNo} seat ${seatNo}. ${reason.trim()}`;
  commit({
    ...current,
    tickets: current.tickets.map((t) => (t.id === id ? { ...t, tripId, seatNo } : t)),
    audit: [...current.audit, entry(current, action, detail, { ticketId: id, tripId })],
  });
  return null;
}

export interface TicketProblem {
  ticket: Ticket;
  trip: Trip;
  reason: string;
}

/** Passengers affected by late trip changes: cancelled trips, or a replacement bus without their seat. */
export function ticketProblems(data: Db, today: string): TicketProblem[] {
  const problems: TicketProblem[] = [];
  for (const ticket of data.tickets) {
    if (ticket.status !== "Issued" && ticket.status !== "Booked") continue;
    const trip = data.trips.find((t) => t.id === ticket.tripId);
    if (!trip || trip.date < today || trip.status === "Departed") continue;
    if (!canReachTrip(data, trip)) continue;
    const { layout, blocked } = tripSeating(data, trip);
    // Online seats on a trip with no unit yet get checked once the PUB Admin sets it.
    if (!trip.busId && trip.status !== "Cancelled") continue;
    if (trip.status === "Cancelled") problems.push({ ticket, trip, reason: "Trip cancelled" });
    else if (!layout || ticket.seatNo > layout.seats) problems.push({ ticket, trip, reason: "Seat not on the assigned bus" });
    else if (blocked.has(ticket.seatNo)) problems.push({ ticket, trip, reason: "Seat is blocked on the assigned bus" });
  }
  return problems;
}

export interface ValidationResult {
  ok: boolean;
  message: string;
  ticket?: Ticket;
}

/** Checks a scanned ticket number or booking reference and marks it boarded when valid. */
export function validateTicket(code: string, today: string): ValidationResult {
  const current = load();
  const text = code.trim().toUpperCase();
  let ticket = current.tickets.find((t) => t.ticketNo.toUpperCase() === text);
  if (!ticket) {
    const matches = current.tickets.filter((t) => t.bookingRef?.toUpperCase() === text && t.status !== "Voided");
    if (matches.length > 1) {
      return { ok: false, message: `This booking covers ${matches.length} passengers. Scan each ticket number.` };
    }
    ticket = matches[0];
  }
  if (!ticket) return { ok: false, message: "Ticket not found." };
  if (ticket.status === "Voided") return { ok: false, message: "This ticket was voided.", ticket };
  if (ticket.status === "Boarded") return { ok: false, message: "Already boarded. This ticket was used.", ticket };
  const trip = current.trips.find((t) => t.id === ticket.tripId);
  if (!trip) return { ok: false, message: "Trip not found.", ticket };
  if (trip.date !== today) return { ok: false, message: `Wrong date. This ticket is for ${trip.date}.`, ticket };
  if (trip.status === "Departed" || trip.status === "Cancelled") {
    return { ok: false, message: `This trip is ${trip.status.toLowerCase()}.`, ticket };
  }
  const minutesToGo = (departureTime(trip) - Date.now()) / 60_000;
  if (minutesToGo > current.settings.checkInBeforeMinutes) return { ok: false, message: "Too early. Check-in isn't open yet.", ticket };
  if (-minutesToGo > current.settings.checkInAfterMinutes) return { ok: false, message: "Check-in has closed for this trip.", ticket };
  const boarded: Ticket = { ...ticket, status: "Boarded" };
  commit({
    ...current,
    tickets: current.tickets.map((t) => (t.id === boarded.id ? boarded : t)),
    audit: [
      ...current.audit,
      { ...entry(current, "Boarded", `${boarded.ticketNo}, ${trip.tripNo}`, { ticketId: boarded.id }), by: "Automated gate" },
    ],
  });
  return { ok: true, message: `Valid. Seat ${boarded.seatNo}, boarding at bay ${trip.bay || "-"}.`, ticket: boarded };
}

export function setBoarded(id: string, boarded: boolean) {
  const current = load();
  const ticket = current.tickets.find((t) => t.id === id);
  if (!ticket || ticket.status === "Voided") return;
  const status = boarded ? "Boarded" : ticket.source === "Online" ? "Booked" : "Issued";
  commit({
    ...current,
    tickets: current.tickets.map((t) => (t.id === id ? { ...t, status } : t)),
    audit: [
      ...current.audit,
      entry(current, boarded ? "Boarded" : "Boarding undone", `${ticket.ticketNo} (manifest)`, { ticketId: id }),
    ],
  });
}

export function applyTripPlan(lines: PlanLine<Trip>[]): number {
  const current = load();
  const records = lines.flatMap((l) => (l.record ? [l.record] : []));
  const ids = new Set(records.map((r) => r.id));
  commit({
    ...current,
    trips: [...current.trips.filter((t) => !ids.has(t.id)), ...records],
    audit: [...current.audit, entry(current, "Trips imported", `${records.length} rows`)],
  });
  return records.length;
}

export function applyBookingPlan(lines: PlanLine<Ticket>[]): number {
  const current = load();
  const records = lines.flatMap((l) => (l.record ? [l.record] : []));
  const ids = new Set(records.map((r) => r.id));
  const kept = current.tickets.filter((t) => !ids.has(t.id));
  let sequence = current.tickets.length;
  const numbered = records.map((record) => {
    if (record.ticketNo) return record;
    sequence++;
    const trip = current.trips.find((t) => t.id === record.tripId);
    const route = current.routes.find((r) => r.id === trip?.routeId);
    const code = current.companies.find((c) => c.id === route?.companyId)?.ticketCode ?? "ON";
    return { ...record, ticketNo: `${code}W-${String(sequence).padStart(6, "0")}` };
  });
  commit({
    ...current,
    tickets: [...kept, ...numbered],
    audit: [...current.audit, entry(current, "Bookings imported", `${records.length} rows`)],
  });
  return records.length;
}
