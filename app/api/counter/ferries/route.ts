import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { fail, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the counter screen needs.
 *
 * The ferries with their capacity and seats left, the passenger count per
 * type for each ferry, and the short list of recent changes at the signed in
 * staff member's own station.
 */
export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user) return fail("Not signed in", 401);

  const stationId = user.stationId;
  if (stationId === null || stationId === undefined) {
    return fail("This account is not assigned to a station", 403);
  }

  const ferries = await query<{
    id: number;
    name: string;
    capacity: number;
    seatsAvailable: number;
  }>(
    `SELECT id, name, capacity, "seatsAvailable"
     FROM "Ferry"
     WHERE "inOperation" IS TRUE
     ORDER BY id`,
  );

  const counts = await query<{
    ferryId: number;
    passengerType: string;
    onBoard: number;
  }>(
    `SELECT "ferryId", "passengerType", "onBoard" FROM passenger_counts`,
  );

  const recent = await query<{
    id: number;
    ferryId: number;
    ferryName: string;
    passengerType: string;
    delta: number;
    createdAt: string;
  }>(
    `SELECT e.id, e."ferryId", f.name AS "ferryName", e."passengerType",
            e.delta, e."createdAt"
     FROM "PassengerEvent" e
     JOIN "Ferry" f ON f.id = e."ferryId"
     WHERE e."stationId" = $1
     ORDER BY e."createdAt" DESC, e.id DESC
     LIMIT 15`,
    [stationId],
  );

  const station = await query<{ id: number; name: string }>(
    `SELECT id, name FROM "Station" WHERE id = $1`,
    [stationId],
  );

  const byFerry = ferries.map((ferry) => {
    const ferryCounts = counts
      .filter((count) => count.ferryId === ferry.id)
      .map((count) => ({ passengerType: count.passengerType, onBoard: count.onBoard }));
    const onBoard = ferryCounts.reduce((sum, count) => sum + count.onBoard, 0);
    return {
      id: ferry.id,
      name: ferry.name,
      capacity: ferry.capacity,
      seatsAvailable: ferry.seatsAvailable,
      onBoard,
      counts: ferryCounts,
    };
  });

  return ok({
    station: station[0] ?? null,
    ferries: byFerry,
    recent,
  });
}
