import type { Role } from "./types";

// Five users (team review, 9 Nov):
//   PITX Admin     runs the module: approvals, reports, trips, master data, parameters
//   PITX Cashier   receives the tellers' remittance (Daily Collection)
//   Operator Admin the bus company's admin: sells, sets units, sees its own company only
//   Teller         sells at the company's counter
//   Passenger      buys online: holds seats, pays, gets the e-ticket
const OPS: Role[] = ["Operator Admin", "Teller"];

// The sidebar groups pages by what the user is doing, so the PITX Admin's dozen links
// read as four short lists. A link with no group sits on top.
export const NAV_GROUPS = ["Selling", "Trips", "Boarding", "Admin"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export const NAV: { href: string; label: string; roles: Role[]; group?: NavGroup }[] = [
  { href: "/", label: "Overview", roles: [...OPS, "PITX Admin"] },
  { href: "/book", label: "Book a Trip", roles: ["Passenger"] },
  { href: "/pos", label: "POS Ticketing", roles: OPS, group: "Selling" },
  { href: "/tickets", label: "Tickets Sold", roles: [...OPS, "PITX Admin"], group: "Selling" },
  { href: "/close", label: "Close Sales", roles: OPS, group: "Selling" },
  { href: "/collection", label: "Daily Collection", roles: ["PITX Cashier"], group: "Selling" },
  { href: "/approvals", label: "Approvals", roles: ["PITX Admin"], group: "Selling" },
  { href: "/trips", label: "Daily Trips", roles: ["PITX Admin"], group: "Trips" },
  { href: "/units", label: "Unit Assignment", roles: ["Operator Admin"], group: "Trips" },
  { href: "/availability", label: "Ticket Availability", roles: [...OPS, "PITX Admin"], group: "Trips" },
  { href: "/manifest", label: "Manifest", roles: [...OPS, "PITX Admin"], group: "Boarding" },
  { href: "/queue", label: "Queue Count", roles: ["PITX Admin"], group: "Boarding" },
  { href: "/validate", label: "Gate Test", roles: ["PITX Admin"], group: "Boarding" },
  { href: "/reports", label: "Reports", roles: ["PITX Admin"], group: "Admin" },
  { href: "/master", label: "Master Data", roles: ["PITX Admin"], group: "Admin" },
  { href: "/settings", label: "System Parameters", roles: ["PITX Admin"], group: "Admin" },
];

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
