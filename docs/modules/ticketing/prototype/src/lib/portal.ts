import { BASE_PATH } from "./paths";

// On the PITX App site the demo has no sign-in of its own: people sign in on the
// portal, and docs/modules/ticketing/index.html hands their name over in
// localStorage (same origin) before opening the demo. Run locally (no base path)
// the demo keeps its own sign-in form.
const HANDOFF_KEY = "pitx-ticketing-portal-user";
// Supabase keeps the portal's sign-in under this key (shared/config.js project).
const PORTAL_AUTH_KEY = "sb-nuezknlzwfkfxlicrgol-auth-token";

export interface PortalUser {
  name: string;
  role: string; // profiles.role on the portal
}

export function onPortalSite(): boolean {
  return BASE_PATH !== "";
}

/** The portal user, or null when nobody is signed in on the portal. */
export function portalUser(): PortalUser | null {
  try {
    if (!localStorage.getItem(PORTAL_AUTH_KEY)) return null;
    const raw = localStorage.getItem(HANDOFF_KEY);
    return raw ? (JSON.parse(raw) as PortalUser) : null;
  } catch {
    return null;
  }
}

/** The Ticketing module home on the site; it checks the portal sign-in. */
export function moduleHomeUrl(): string {
  return BASE_PATH.replace(/demo\/?$/, "");
}

/** The portal's module list. */
export function portalUrl(): string {
  return BASE_PATH.replace(/modules\/ticketing\/demo\/?$/, "");
}
