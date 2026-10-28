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
];

export function modulesFor(role) {
  return MODULES.filter((m) => role in m.roles);
}

export function moduleHome(module, role) {
  return module.roles[role];
}
