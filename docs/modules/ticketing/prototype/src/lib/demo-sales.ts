import { todayManila } from "./format";
import { getLayout, parseBlockedSeats } from "./seat-layouts";
import type { AuditEntry, Db, FareType, PaymentMethod, Ticket } from "./types";

// Made-up sales, for the sample trips (seed.ts) and the real PITX trips the demo reads
// (live.ts), so POS, Tickets, Manifest, Reports, Close Sales and the passenger's bookings have
// something to show. Passengers, fares paid and references are fake: names come from the
// sample list, every id starts with "demo-", and refs with "DEMO-". Only trips with no tickets
// yet get them, so a refresh never doubles them and nothing a user sold is touched. The same
// trip always gets the same sales (seeded from its id).

export const FIRST_NAMES = ["Ana", "Ben", "Carla", "Dino", "Ella", "Franco", "Gina", "Hector", "Ines", "Jomar", "Kim", "Leo"];
export const LAST_NAMES = ["Sample", "Tester", "Demo", "Placeholder", "Mockup", "Trial", "Example"];

/** The same sample name for the same number, spread over every first and last name. */
export function sampleName(n: number): string {
  return `${FIRST_NAMES[n % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(n / FIRST_NAMES.length) % LAST_NAMES.length]}`;
}

const SEAT_FALLBACK = 45; // buses whose seat count isn't known yet

/** Small deterministic generator, so a trip's sales don't change on every refresh. */
export function seeded(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function addDemoSales(db: Db): Db {
  const sold = new Set(db.tickets.map((t) => t.tripId));
  const now = Date.now();
  const today = Date.parse(`${todayManila()}T00:00:00+08:00`);
  const booths = db.counters.filter((c) => !c.kiosk && c.status === "Active");
  const tickets: Ticket[] = [];
  const audit: AuditEntry[] = [];
  let sequence = db.tickets.length;

  for (const trip of db.trips) {
    if (sold.has(trip.id)) continue;
    const route = db.routes.find((r) => r.id === trip.routeId);
    const companyIndex = db.companies.findIndex((c) => c.id === route?.companyId);
    const company = db.companies[companyIndex];
    if (!route || !company) continue;
    const bus = db.buses.find((b) => b.id === trip.busId);
    const busType = db.busTypes.find((t) => t.id === bus?.busTypeId);
    const layout = getLayout(busType?.layoutId);
    const blocked = parseBlockedSeats(busType?.blockedSeats, layout);
    for (const mark of trip.seatMarks ?? []) blocked.add(mark.seatNo); // seats passengers requested
    const capacity = layout?.seats ?? SEAT_FALLBACK;

    const rand = seeded(trip.id);
    const departs = Date.parse(`${trip.date}T${trip.time}:00+08:00`);
    const departed = trip.status === "Departed";
    const cancelled = trip.status === "Cancelled";
    // Departed trips sold well; later trips are still filling up, and trips days away have
    // only advance bookings. A cancelled trip's few sales were all refunded.
    const daysAway = Math.max(0, Math.floor((departs - today) / 86_400_000));
    const advance = [1, 0.35, 0.2, 0.15][daysAway] ?? 0.1;
    const share = cancelled ? 0.1 : departed ? 0.55 + rand() * 0.4 : (0.1 + rand() * 0.6) * advance;
    const count = Math.min(Math.round(capacity * share), capacity - blocked.size);
    const saleStart = departs - 3 * 86_400_000;
    const saleEnd = Math.min(now, departs) - 60_000;

    let seat = 0;
    for (let i = 0; i < count; i++) {
      do seat++;
      while (blocked.has(seat));
      if (seat > capacity) break;
      sequence++;
      // No unit yet means no seat map at the counter, so only online bookings.
      const online = !layout || rand() < 0.2;
      const pick = rand();
      const fareType: FareType = pick < 0.08 ? "Student" : pick < 0.16 ? "Senior" : pick < 0.2 ? "PWD" : "Adult";
      const fare = fareType === "Adult" ? route.price : Math.round(route.price * 80) / 100;
      const payPick = rand();
      const paymentMethod: PaymentMethod = online ? "E-Wallet" : payPick < 0.7 ? "Cash" : payPick < 0.85 ? "Card" : "E-Wallet";
      const voided = cancelled || (!online && !departed && rand() < 0.05);
      const boarded = !voided && (departed || (trip.status === "Boarding" && i < count / 2));
      const teller = rand() < 0.5 ? 1 : 0;
      const counter = online ? undefined : booths[(Math.max(companyIndex, 0) * 2 + teller) % booths.length];
      const issuedAt = new Date(saleStart + ((saleEnd - saleStart) * (i + 1)) / (count + 1)).toISOString();
      const soldBy = online ? undefined : `${company.code} Teller ${teller + 1}`;
      const passengerName = sampleName(sequence);
      const refundCategory = cancelled ? "Trip cancelled" : "Passenger changed plans";
      const ticket: Ticket = {
        id: `demo-${trip.id}-${seat}`,
        ticketNo: `${company.ticketCode}${online ? "W" : (counter?.ticketCode ?? "A")}-${String(sequence).padStart(6, "0")}`,
        source: online ? "Online" : "Counter",
        bookingRef: online ? `DEMO-BK-${String(sequence).padStart(5, "0")}` : undefined,
        bookedBy: online ? passengerName : undefined,
        tripId: trip.id,
        counterId: counter?.id,
        soldBy,
        seatNo: seat,
        passengerName,
        contactNo: "0900 000 0000",
        email: `passenger${sequence}@example.com`,
        fareType,
        fare,
        idNo: fareType === "Adult" ? undefined : `DEMO-ID-${sequence}`,
        paymentMethod,
        tendered: paymentMethod === "Cash" ? Math.ceil(fare / 100) * 100 : undefined,
        paymentRef: paymentMethod === "Cash" ? undefined : `DEMO-REF-${sequence}`,
        issuedAt,
        serviceSeconds: online ? undefined : Math.round(40 + rand() * 160),
        status: voided ? "Voided" : boarded ? "Boarded" : "Reserved",
        voidReason: voided ? `${refundCategory} (demo)` : undefined,
        voidedBy: voided ? (soldBy ?? "PITX Admin (demo)") : undefined,
        refundAmount: voided ? fare : undefined,
        refundMethod: voided ? paymentMethod : undefined,
        refundRef: voided && paymentMethod !== "Cash" ? `DEMO-RFD-${sequence}` : undefined,
        refundCategory: voided ? refundCategory : undefined,
        printed: !online,
      };
      tickets.push(ticket);
      audit.push({
        id: `demo-log-${ticket.id}`,
        at: issuedAt,
        by: soldBy ?? "Online booking",
        action: online ? "Booked online" : "Ticket sold",
        ticketId: ticket.id,
        tripId: trip.id,
        detail: `${ticket.ticketNo}, ${trip.tripNo} seat ${seat} (demo sale)`,
      });
    }
  }

  return { ...db, tickets: [...db.tickets, ...tickets], audit: [...db.audit, ...audit] };
}
