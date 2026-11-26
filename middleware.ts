import { NextResponse } from "next/server";
import NextAuth, { type NextAuthRequest } from "next-auth";
import { authConfig } from "@/lib/auth.config";
import {
  MODE,
  DEVICE_PREFIXES,
  canEditFleet,
  isAdminPath,
  isCounterPath,
  requestHostIsAllowed,
} from "@/lib/mode";

/**
 * Mode check, session check and role check for every route.
 *
 * This file only uses the edge safe half of the auth setup, because the
 * middleware runs on the edge runtime and cannot open a database connection.
 *
 * The rules, in order:
 *   1. A route that belongs to the other mode answers "not found". It is not
 *      a redirect and it is not a login page, so the other mode has nothing
 *      to probe.
 *   2. The device routes are public, they carry their own device key.
 *   3. Everything else needs a session.
 *   4. The admin process is for the head administrator and the researcher.
 *      The station process is for the staff accounts.
 *   5. In the admin process, only the head station PC may open a page.
 */

const { auth } = NextAuth(authConfig);

/** A plain "not found" answer for the routes of the other mode. */
function notFound() {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export default auth((request: NextAuthRequest) => {
  const { pathname } = request.nextUrl;
  const session = request.auth?.user;
  const role = session?.role;

  // 1. Mode separation.
  if (MODE === "counter" && isAdminPath(pathname)) return notFound();
  if (MODE === "admin" && isCounterPath(pathname)) return notFound();

  // 2. The device routes carry their own key, so they have no session.
  if (
    DEVICE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return NextResponse.next();
  }

  const isPublic =
    pathname === "/login" ||
    pathname === "/not-found" ||
    pathname.startsWith("/api/auth");

  // 3. Session check.
  if (!session) {
    if (isPublic) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const url = new URL("/login", request.nextUrl);
    if (pathname !== "/") url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // 4. Role checks on the server, for every protected route.
  //
  // The admin console is for the master administrator only. The station
  // process is for the station administrators, and the master administrator
  // may open it as well.
  //
  // Changing a ferry or a station is the master administrator's job only. The
  // station accounts may read everything and write everything else, but the
  // two fleet write routes are refused here, again in the route handler, and
  // by the database role.
  const isManager = role === "ADMIN";
  const isWrite = request.method !== "GET" && request.method !== "HEAD";

  if (MODE === "admin") {
    if (pathname.startsWith("/api/admin") && !isManager) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    if (pathname.startsWith("/api/counter") && role !== "STAFF" && role !== "ADMIN") {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  } else {
    if (pathname.startsWith("/api/counter") && role !== "STAFF" && role !== "ADMIN") {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  if (
    isWrite &&
    !canEditFleet(role) &&
    (pathname === "/api/admin/ferries" || pathname === "/api/admin/stations")
  ) {
    return NextResponse.json(
      { error: "Only the head administrator can change the ferries and the stations" },
      { status: 403 },
    );
  }

  // Station accounts use the station process, not the admin console.
  if (
    MODE === "admin" &&
    !pathname.startsWith("/api/") &&
    role !== "ADMIN"
  ) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  // 5. In the admin process, only the head station PC may open a page.
  //    The station process is reached from the stations themselves, so it has
  //    no host restriction. It is protected by the login and by the tunnel.
  if (
    MODE === "admin" &&
    !pathname.startsWith("/api/ingest") &&
    !requestHostIsAllowed(request)
  ) {
    return NextResponse.json(
      { error: "The admin console only opens on the head station PC" },
      { status: 403 },
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|logo/|icons/|sw.js).*)",
  ],
};
