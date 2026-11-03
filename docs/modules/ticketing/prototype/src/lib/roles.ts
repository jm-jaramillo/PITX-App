import type { Role } from "./types";

export const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/", label: "Dashboard", roles: ["Teller", "PUB Admin", "Super Admin"] },
  { href: "/pos", label: "POS Ticketing", roles: ["Teller"] },
  { href: "/tickets", label: "Tickets", roles: ["Teller", "Super Admin"] },
  { href: "/availability", label: "Ticket Availability", roles: ["Teller", "PUB Admin", "Super Admin"] },
  { href: "/close", label: "Close Sales", roles: ["Teller"] },
  { href: "/collection", label: "Daily Collection", roles: ["Account"] },
  { href: "/units", label: "Unit Assignment", roles: ["PUB Admin"] },
  { href: "/manifest", label: "Manifest", roles: ["Teller", "PUB Admin", "Super Admin"] },
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
  return role === "Teller" || role === "PUB Admin";
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
