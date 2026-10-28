// Registry of PITX modules. Add an entry here when a new module is created;
// the login redirect, the portal page and the sidebar "All modules" link all
// read this list.
//
//   id       folder name under docs/modules/
//   name     shown on the portal card
//   path     folder relative to docs/ (trailing slash)
//   roles    profiles.role values allowed in; the key is the role, the value
//            is that role's landing page inside the module
//
// This list only decides what UI to show. Real access control is Row Level
// Security in the module's database schema (see docs/CONTRIBUTING.md).

export const MODULES = [
  {
    id: "trip-scheduling",
    name: "Trip Scheduling",
    description: "Request, approve and display 15-minute bay trip slots.",
    path: "modules/trip-scheduling/",
    roles: {
      operator: "operator-overview.html",
      staff: "overview.html",
      ticketing: "ticketing.html",
    },
  },
  {
    id: "terminal-operating-system",
    name: "Terminal Operating System",
    description: "Terminal-wide operations.",
    path: "modules/terminal-operating-system/",
    comingSoon: true, // shown on the portal as a disabled card until the module ships
    roles: { staff: "index.html" },
  },
];

/** Modules this role can open. Pass { includeComingSoon: true } to list placeholders too. */
export function modulesFor(role, { includeComingSoon = false } = {}) {
  return MODULES.filter((m) => role in m.roles && (includeComingSoon || !m.comingSoon));
}

export function moduleHome(module, role) {
  return module.roles[role];
}
