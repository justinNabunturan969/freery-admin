import { createStationSchema, updateStationSchema } from "@freery/shared";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { fail, firstIssue, ok, readJson } from "@/lib/api";
import { logActivity } from "@/lib/audit";
import { canEditFleet } from "@/lib/mode";
import { getStations, type StationRow } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The station list, with the passenger totals per station. */
export async function GET() {
  const stations = await getStations();
  return ok({ stations });
}

/**
 * Add a station to the route.
 *
 * Only the master administrator may do this. The new station goes to the end
 * of the route and is shown on the passenger site straight away, so the
 * position has to be a real point on the line: the route diagram projects the
 * ferries onto the line between the stations.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user) return fail("Not signed in", 401);

    if (!canEditFleet(user.role)) {
      return fail("Only the master administrator can add a station", 403);
    }

    const body = await readJson(request);
    const parsed = createStationSchema.safeParse(body);
    if (!parsed.success) {
      return fail(firstIssue(parsed.error), 400);
    }

    const { name, lat, lon, operatingHours, boardingInfo, isOpen } =
      parsed.data;

    // The new station is the last stop on the route.
    const next = await queryOne<{ order: number }>(
      `SELECT COALESCE(MAX("order"), 0) + 1 AS "order" FROM "Station"`,
    );
    const order = Number(next?.order ?? 1);

    const created = await queryOne<StationRow>(
      `INSERT INTO "Station"
         (name, lat, lon, "order", "isOpen", "operatingHours", "boardingInfo")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, lat, lon, "order", "isOpen", notice, "operatingHours",
                 "boardingInfo", "mapsUrl", "updatedAt"`,
      [
        name.trim(),
        lat,
        lon,
        order,
        isOpen ?? true,
        operatingHours?.trim() || null,
        boardingInfo?.trim() || null,
      ],
    );

    await logActivity({
      userId: Number(user.id),
      userName: user.name ?? null,
      action: "STATION_CREATED",
      entityType: "Station",
      entityId: created?.id ?? null,
      details: {
        changes: [
          `added ${name.trim()}`,
          `stop ${order} on the route`,
          `position ${lat}, ${lon}`,
        ],
      },
    });

    return ok({ station: created }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The station could not be added";
    return fail(message, 500);
  }
}

/**
 * Remove a station from the route.
 *
 * Only the master administrator may do this. A station that has counted
 * passengers keeps its counts, so it cannot be deleted: close it instead and it
 * leaves the passenger site on its own.
 */
export async function DELETE(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return fail("Not signed in", 401);

  if (!canEditFleet(user.role)) {
    return fail("Only the master administrator can remove a station", 403);
  }

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return fail("Which station?", 400);

  const station = await queryOne<{ id: number; name: string }>(
    `SELECT id, name FROM "Station" WHERE id = $1`,
    [id],
  );
  if (!station) return fail("Unknown station", 404);

  const used = await queryOne<{ events: number }>(
    `SELECT count(*)::int AS events FROM "PassengerEvent" WHERE "stationId" = $1`,
    [id],
  );
  if ((used?.events ?? 0) > 0) {
    return fail(
      "This station has already counted passengers, so it keeps its counts. Close it instead.",
      409,
    );
  }

  await query(`DELETE FROM "Station" WHERE id = $1`, [id]);

  await logActivity({
    userId: Number(user.id),
    userName: user.name ?? null,
    action: "STATION_REMOVED",
    entityType: "Station",
    entityId: id,
    details: { changes: [`removed ${station.name}`], station: station.name },
  });

  return ok({ removed: id });
}

/**
 * Station control.
 *
 * The master administrator can close a station and put a short notice on it.
 * The notice is what the public website shows, so it should read like a
 * sentence to a passenger.
 */
export async function PATCH(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return fail("Not signed in", 401);

  // Opening, closing and putting a notice on a station is reserved for the
  // master administrator.
  if (!canEditFleet(user.role)) {
    return fail("Only the master administrator can change the stations", 403);
  }

  const body = await readJson(request);
  const parsed = updateStationSchema.safeParse(body);
  if (!parsed.success) {
    return fail(firstIssue(parsed.error), 400);
  }

  const { id, name, isOpen, notice, operatingHours, boardingInfo } = parsed.data;

  if (
    name === undefined &&
    isOpen === undefined &&
    notice === undefined &&
    operatingHours === undefined &&
    boardingInfo === undefined
  ) {
    return fail("Nothing to change", 400);
  }

  const before = await queryOne<StationRow>(
    `SELECT id, name, "isOpen", notice, "operatingHours", "boardingInfo"
     FROM "Station" WHERE id = $1`,
    [id],
  );
  if (!before) return fail("Unknown station", 404);

  const updated = await queryOne<StationRow>(
    `UPDATE "Station"
     SET name = COALESCE($2, name),
         "isOpen" = COALESCE($3, "isOpen"),
         notice = CASE WHEN $4::boolean THEN $5 ELSE notice END,
         "operatingHours" = COALESCE($6, "operatingHours"),
         "boardingInfo" = COALESCE($7, "boardingInfo"),
         "updatedAt" = now()
     WHERE id = $1
     RETURNING id, name, lat, lon, "order", "isOpen", notice, "operatingHours",
               "boardingInfo", "mapsUrl", "updatedAt"`,
    [
      id,
      name ?? null,
      isOpen ?? null,
      notice !== undefined,
      notice ?? null,
      operatingHours ?? null,
      boardingInfo ?? null,
    ],
  );

  const changes: string[] = [];
  if (name !== undefined) changes.push(`name to ${name}`);
  if (isOpen !== undefined) changes.push(isOpen ? "reopened" : "closed");
  if (notice !== undefined) changes.push(`notice set`);
  if (operatingHours !== undefined) changes.push(`operating hours updated`);
  if (boardingInfo !== undefined) changes.push(`boarding info updated`);

  await logActivity({
    userId: Number(user.id),
    userName: user.name ?? null,
    action: isOpen !== undefined ? "STATION_OPENED" : "STATION_UPDATED",
    entityType: "Station",
    entityId: id,
    reason: notice !== undefined ? notice : null,
    details: { changes, station: before.name },
  });

  return ok({ station: updated });
}
