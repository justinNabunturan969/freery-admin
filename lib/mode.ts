/**
 * Which mode is this process running in.
 *
 * The same codebase runs as the admin app on the head station PC and as the
 * station app at the counter. The mode decides which routes exist at all, so
 * the station process can never serve the GPS ingest route and the head
 * station process can never serve the counting API.
 *
 * The two are the same app. They differ in the sections they show and in the
 * rights of the account, never in the way they are laid out.
 */

export type AdminMode = "admin" | "counter";

export const MODE: AdminMode =
  process.env.ADMIN_MODE === "counter" ? "counter" : "admin";

export function isAdminMode(): boolean {
  return MODE === "admin";
}

export function isCounterMode(): boolean {
  return MODE === "counter";
}

/**
 * Route prefixes that only exist in admin mode.
 *
 * The GPS ingest route belongs to the head station PC only. The port station
 * posts to it over the local network with the device key.
 */
export const ADMIN_ONLY_PREFIXES = ["/api/ingest"];

/**
 * Route prefixes that only exist in the station mode.
 *
 * The counting API and the two station only pages, the counter screen and the
 * hub that links to the rest of the station pages.
 */
export const COUNTER_ONLY_PREFIXES = ["/api/counter", "/counter", "/more"];

/**
 * The routes a device calls for itself.
 *
 * A board at the head station talks to this PC with the device key in a
 * header, and it has no session to send because it is not a person. These
 * routes carry their own key instead, and the route itself checks it.
 */
export const DEVICE_PREFIXES = ["/api/ingest", "/api/device"];

/**
 * True when the path belongs to the admin side of the system.
 */
export function isAdminPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * True when the path belongs to the station side of the system.
 */
export function isCounterPath(pathname: string): boolean {
  return COUNTER_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The roles that may change a ferry or a station.
 *
 * Only the head administrator may do that. The researcher account and the
 * station staff accounts can do everything else the head administrator can
 * do, but the fleet and the stations stay read only for them.
 */
export function canEditFleet(role: string | undefined | null): boolean {
  return role === "ADMIN";
}

/**
 * The roles that may create and change accounts.
 *
 * The master administrator manages the station administrators. A station
 * staff account can manage the staff accounts of its own station, but it
 * can never create an administrator, change a role, or touch an account
 * that belongs to the master administrator.
 */
export function canManageAllAccounts(role: string | undefined | null): boolean {
  return role === "ADMIN";
}

/**
 * Admin pages are served from the head station PC only. In production this
 * list holds the PC address; on a laptop it is localhost.
 */
export function allowedAdminHosts(): string[] {
  return (process.env.ADMIN_ALLOWED_HOSTS ?? "127.0.0.1,localhost,::1")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True when the request comes from an allowed host. The host header is used
 * because it is available in middleware, where the client address is not.
 */
export function requestHostIsAllowed(
  request: { headers: Headers },
  allowed = allowedAdminHosts(),
): boolean {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const hostname = host.split(":")[0] ?? "";
  const forwarded = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();

  return allowed.includes(hostname) || (forwarded ? allowed.includes(forwarded) : false);
}
