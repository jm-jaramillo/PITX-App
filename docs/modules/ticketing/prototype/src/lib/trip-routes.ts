import data from "./trip-routes.json";

// Trip Scheduling's destinations (ROUTES) and gates (ROUTE_GATES), copied from its
// assets/app.js by scripts/sync-shared.mjs. A Trip Scheduling trip number is the
// destination's 3-letter code plus the departure time, e.g. NAG1530 = NAGA CITY at 15:30.
// The codes below follow the same rule as scripts/trip-scheduling/import-vehicle-masterlist.mjs
// (first 3 letters, a digit for the 3rd when two destinations clash, in sorted order),
// which is what fills Trip Scheduling's route_trip_codes table.

export const TS_ROUTES: string[] = data.routes;
const GATES: Record<string, string> = data.gates;

const CODES = new Map<string, string>();
const BY_CODE = new Map<string, string>();
{
  const used = new Set<string>();
  for (const route of [...new Set(TS_ROUTES)].sort()) {
    const letters = route.toUpperCase().replace(/[^A-Z]/g, "");
    let code = (letters.slice(0, 3) || "XXX").padEnd(3, "X");
    if (used.has(code)) {
      for (let i = 2; i <= 9; i++) {
        const alt = code.slice(0, 2) + i;
        if (!used.has(alt)) {
          code = alt;
          break;
        }
      }
    }
    used.add(code);
    CODES.set(route, code);
    BY_CODE.set(code, route);
  }
}

/** The 3-letter trip-number code of a Trip Scheduling destination. */
export function tripCode(route: string): string | undefined {
  return CODES.get(route.trim());
}

/** The code part of a trip number: everything before the 4-digit time. "NAG1530" -> "NAG". */
export function codeOfTripNo(tripNo: string | null | undefined): string | undefined {
  return tripNo?.trim().toUpperCase().match(/^([A-Z0-9]{3})\d{4}$/)?.[1];
}

/** The destination a trip number is for, or undefined when the code isn't on the list. */
export function routeOfTripNo(tripNo: string | null | undefined): string | undefined {
  const code = codeOfTripNo(tripNo);
  return code ? BY_CODE.get(code) : undefined;
}

/** The terminal gate Trip Scheduling assigns to a destination, if any. */
export function gateOf(route: string): string | undefined {
  return GATES[route.trim()];
}

/** A Trip Scheduling style trip number: code + HHMM. */
export function tripNumber(route: string, time: string): string {
  return `${tripCode(route) ?? "XXX"}${time.replace(":", "")}`;
}
