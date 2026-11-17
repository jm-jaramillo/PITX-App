import type { Role } from "./types";

// Five users (team review, 9 Nov):
//   PITX Admin     runs the module: approvals, reports, trips, master data, parameters
//   PITX Cashier   receives the tellers' remittance (Daily Collection)
//   Operator Admin the bus company's admin: sells, sets units, sees its own company only
//   Teller         sells at the company's counter
//   Passenger      buys online: holds seats, pays, gets the e-ticket
const OPS: Role[] = ["Operator Admin", "Teller"];

// Ticket Availability is the PIDS board plus the trip list (entry 33), and Boarding holds Queue Count and
// Gate Test as tabs (entry 31). The old /trips, /queue and /validate links redirect.
export const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/", label: "Overview", roles: [...OPS, "PITX Admin"] },
  { href: "/book", label: "Book a Trip", roles: ["Passenger"] },
  { href: "/pos", label: "POS Ticketing", roles: OPS },
  { href: "/tickets", label: "Tickets Sold", roles: [...OPS, "PITX Admin"] },
  { href: "/availability", label: "Ticket Availability", roles: [...OPS, "PITX Admin"] },
  { href: "/close", label: "Close Sales", roles: OPS },
  { href: "/collection", label: "Daily Collection", roles: ["PITX Cashier"] },
  { href: "/units", label: "Unit Assignment", roles: ["Operator Admin"] },
  { href: "/manifest", label: "Manifest", roles: [...OPS, "PITX Admin"] },
  { href: "/boarding", label: "Boarding", roles: ["PITX Admin"] },
  { href: "/approvals", label: "Approvals", roles: ["PITX Admin"] },
  { href: "/reports", label: "Reports", roles: ["PITX Admin"] },
  { href: "/master", label: "Master Data", roles: ["PITX Admin"] },
  { href: "/settings", label: "System Parameters", roles: ["PITX Admin"] },
];

/** Old pages merged into others, and where they open now. */
export const MOVED: Record<string, string> = { "/trips": "/availability", "/queue": "/boarding", "/validate": "/boarding#gate" };

/** Bus company staff only see their own company's data. */
export function isCompanyRole(role: Role): boolean {
  return role === "Operator Admin" || role === "Teller";
}

/** Sells, refunds and reprints at a counter. */
export function sells(role: Role | undefined): boolean {
  return role === "Teller" || role === "Operator Admin";
}

/** Sets the unit (bus) for a trip. */
export function setsUnits(role: Role | undefined): boolean {
  return role === "Operator Admin";
}

export function canAccess(role: Role, pathname: string): boolean {
  const trimmed = pathname.replace(/\/$/, "") || "/";
  // Passes are opened from POS, Tickets and Manifest, so they follow the Manifest roles.
  // A passenger opens their own e-tickets (the ticket page checks it is theirs).
  if ((trimmed === "/ticket" || trimmed === "/ticket-group") && role === "Passenger") return true;
  const path = trimmed === "/ticket" || trimmed === "/ticket-group" ? "/manifest" : trimmed;
  const item = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)));
  return item ? item.roles.includes(role) : true;
}

export function homeFor(role: Role): string {
  return NAV.find((n) => n.roles.includes(role))?.href ?? "/";
}
