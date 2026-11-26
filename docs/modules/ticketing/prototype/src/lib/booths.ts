import { provinceOf, routeGroupOf } from "./places";
import type { BoothServe, Bus, Counter } from "./types";

// PITX ticket booths (entry 42), from the floor plan: TB1 to TB4 on the second floor, TB6 on
// the ground floor. "Current" is what each booth sells now and is used to filter the Ticket
// Availability board. "Proposed" is kept for reference only.

export interface PitxBooth {
  code: string;
  floor: string;
  windows: number;
  serves: BoothServe[];
  proposed: BoothServe[];
}

export const PITX_BOOTHS: PitxBooth[] = [
  {
    code: "TB1",
    floor: "Second floor",
    windows: 20,
    serves: [{ label: "Bicol (Aircon, Deluxe, Luxury)", group: "Bicol", aircon: true }],
    proposed: [],
  },
  {
    code: "TB2",
    floor: "Second floor",
    windows: 10,
    serves: [{ label: "Bicol (non-AC / Ordinary)", group: "Bicol", aircon: false }],
    proposed: [
      { label: "Laguna", provinces: ["Laguna"] },
      { label: "Batangas", provinces: ["Batangas"] },
      { label: "Quezon", provinces: ["Quezon"] },
      { label: "Mindoro", group: "Mindoro" },
    ],
  },
  {
    code: "TB3",
    floor: "Second floor",
    windows: 12,
    serves: [
      { label: "Mindoro", group: "Mindoro" },
      { label: "Visayas", group: "Visayas" },
      { label: "Mindanao", group: "Mindanao" },
    ],
    proposed: [
      { label: "Visayas", group: "Visayas" },
      { label: "Mindanao", group: "Mindanao" },
    ],
  },
  {
    code: "TB4",
    floor: "Second floor",
    windows: 13,
    serves: [
      { label: "Bicol", group: "Bicol" },
      { label: "Batangas", provinces: ["Batangas"] },
      { label: "Olongapo", provinces: ["Zambales"] },
      { label: "Nueva Ecija", provinces: ["Nueva Ecija"] },
    ],
    proposed: [{ label: "Bicol", group: "Bicol" }],
  },
  {
    code: "TB6",
    floor: "Ground floor",
    windows: 10,
    serves: [
      { label: "Laguna", provinces: ["Laguna"] },
      { label: "Quezon", provinces: ["Quezon"] },
      { label: "Baguio City", provinces: ["Benguet"] },
    ],
    proposed: [{ label: "Northern Routes", group: "Northern Routes" }],
  },
];

/** The booths as counters (ids ctr-1 to ctr-5), plus the self-service kiosk. */
export function pitxCounters(): Counter[] {
  return [
    ...PITX_BOOTHS.map(
      (b, i): Counter => ({
        id: `ctr-${i + 1}`,
        code: b.code,
        description: `Ticket Booth ${b.code.slice(2)}`,
        ticketCode: b.code,
        kiosk: false,
        townId: "town-pque",
        allowInternet: false,
        counterDisplay: true,
        kioskDisplay: false,
        floor: b.floor,
        windows: b.windows,
        serves: b.serves,
        proposed: b.proposed,
        status: "Active",
      }),
    ),
    { id: "ctr-k", code: "K01", description: "Kiosk 1", ticketCode: "K", kiosk: true, townId: "town-pque", allowInternet: true, counterDisplay: false, kioskDisplay: true, status: "Active" },
  ];
}

/** Saved data from before entry 42 has the old sample booths (C01 to C08): swap in TB1 to TB6. */
export function withPitxBooths<T extends { counters: Counter[]; session?: { counterId?: string } | null }>(stored: T): T {
  if (!stored.counters || stored.counters.some((c) => c.code === "TB1")) return stored;
  const counters = pitxCounters();
  const session = stored.session;
  const keep = session?.counterId && counters.some((c) => c.id === session.counterId);
  return {
    ...stored,
    counters,
    session: session?.counterId && !keep ? { ...session, counterId: counters[0].id } : session,
  };
}

/** Non-aircon by its class name ("Ordinary", "Non-AC"), else by the aircon flag. */
export function isAircon(bus: Bus | undefined): boolean | undefined {
  if (!bus) return undefined;
  if (bus.busClass && /ordinary|non[\s-]?a\.?\/?c|non[\s-]?aircon/i.test(bus.busClass)) return false;
  return bus.aircon;
}

/** Does the booth sell this destination (and bus)? A booth with no list sells everything. */
export function boothServes(counter: Counter | undefined, destination: string, bus: Bus | undefined): boolean {
  if (!counter?.serves?.length) return true;
  const group = routeGroupOf(destination);
  const province = provinceOf(destination);
  return counter.serves.some((s) => {
    const place = (s.group !== undefined && s.group === group) || (s.provinces?.includes(province) ?? false);
    if (!place) return false;
    if (s.aircon === undefined) return true;
    const ac = isAircon(bus);
    return ac === undefined ? s.aircon : ac === s.aircon; // no unit yet: show under the aircon booth
  });
}
