import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import type { PreviewFerry, PreviewStation } from "@/lib/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The live fleet snapshot for the preview.
 *
 * One request returns the ferries and the stations that are on the route
 * right now, so the picture and the numbers under it always come from the
 * same read. The route is deliberately outside `/api/admin`, because the
 * station app reads it too: the master administrator and the station
 * administrators see the same route.
 *
 * Nothing is written here, and nothing is cached, so a ferry or a station the
 * master administrator adds shows up on the next poll.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const ferries = await query<PreviewFerry>(
    `SELECT id, name, status, lat, lon, speed,
            "seatsAvailable", capacity, "inOperation", "receivedAt", color
     FROM "Ferry"
     ORDER BY id`,
  );

  const stations = await query<PreviewStation>(
    `SELECT id, name, lat, lon, "order", "isOpen"
     FROM "Station"
     ORDER BY "order"`,
  );

  return NextResponse.json(
    {
      servedAt: new Date().toISOString(),
      ferries,
      stations,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
