import type { Role } from "./types";

export const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/", label: "Dashboard", roles: ["Bus Company", "Teller", "PUB Admin", "Super Admin"] },
  { href: "/pos", label: "POS Ticketing", roles: ["Bus Company", "Teller"] },
  { href: "/tickets", label: "Tickets", roles: ["Bus Company", "Teller", "Super Admin"] },
  { href: "/availability", label: "Ticket Availability", roles: ["Bus Company", "Teller", "PUB Admin", "Super Admin"] },
  { href: "/close", label: "Close Sales", roles: ["Bus Company", "Teller"] },
  { href: "/collection", label: "Daily Collection", roles: ["Account"] },
  { href: "/units", label: "Unit Assignment", roles: ["Bus Company", "PUB Admin"] },
  { href: "/manifest", label: "Manifest", roles: ["Bus Company", "Teller", "PUB Admin", "Super Admin"] },
  { href: "/approvals", label: "Approvals", roles: ["Super Admin"] },
  { href: "/validate", label: "Gate Test", roles: ["Super Admin"] },
  { href: "/trips", label: "Daily Trips", roles: ["Super Admin"] },
  { href: "/reports", label: "Reports", roles: ["Super Admin"] },
  { href: "/import", label: "Import", roles: ["Super Admin"] },
  { href: "/master", label: "Master Data", roles: ["Super Admin"] },
  { href: "/settings", label: "System Parameters", roles: ["Super Admin"] },
];

/** Bus company staff only see their own company's data. */
export function isCompanyRole(role: Role): boolean {
  return role === "Bus Company" || role === "Teller" || role === "PUB Admin";
}

/** Sells, refunds and reprints at a counter. */
export function sells(role: Role | undefined): boolean {
  return role === "Teller" || role === "Bus Company";
}

/** Sets the unit (bus) for a trip. */
export function setsUnits(role: Role | undefined): boolean {
  return role === "PUB Admin" || role === "Bus Company";
}

export function canAccess(role: Role, pathname: string): boolean {
  // Passes are opened from POS, Tickets and Manifest, so they follow the Manifest roles.
  const trimmed = pathname.replace(/\/$/, "") || "/";
  const path = trimmed === "/ticket" || trimmed === "/ticket-group" ? "/manifest" : trimmed;
  const item = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)));
  return item ? item.roles.includes(role) : true;
}

export function homeFor(role: Role): string {
  return NAV.find((n) => n.roles.includes(role))?.href ?? "/";
}
