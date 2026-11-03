// Where the app is served from. Empty when run locally; set at build time for the
// static copy on the PITX App site, which lives in a sub-folder.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefixes a site-absolute file path (e.g. "/brand/logo.png") with the base path. */
export function asset(path: string): string {
  return path.startsWith("/") ? `${BASE_PATH}${path}` : path;
}

export function ticketHref(id: string): string {
  return `/ticket?id=${encodeURIComponent(id)}`;
}

export function groupHref(id: string): string {
  return `/ticket-group?id=${encodeURIComponent(id)}`;
}
