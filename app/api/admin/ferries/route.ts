import { NextResponse } from "next/server";
import { createFerrySchema, pickFreeFerryColor, updateFerrySchema } from "@freery/shared";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { fail, firstIssue, ok, readJson } from "@/lib/api";
import { logActivity } from "@/lib/audit";
import { canEditFleet } from "@/lib/mode";
import {
  getFerries,
  getFirstStation,
  getUsedFerryColors,
  type FerryHealthRow,
} from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The fleet list, with the health numbers the admin screens show. */
export async function GET() {
  const ferries = await getFerries();
  return ok({ ferries });
}

/**
 * Add a ferry to the fleet.
 *
 * Only the head administrator may do this. A new boat starts at the first
 * station on the route, so it is on the line in the live preview and on the
 * passenger website straight away instead of waiting in the list of boats
 * with no position. It has not sent a GPS packet yet, and the packet time
 * stays empty, so the hardware page still says that honestly.
 *
 * The boat is also given an identity colour: the first colour nobody else in
 * the fleet is using, so a passenger can tell the boats apart at a glance.
 *
 * There is no trip status to choose. The database works it out from the boat's
 * own packets, so the console cannot put a status on a boat that the boat has
 * not reported.
 */
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return fail("Not signed in", 401);

  if (!canEditFleet(user.role)) {
    return fail("Only the master administrator can add a ferry", 403);
  }

  const body = await readJson(request);
  const parsed = createFerrySchema.safeParse(body);
  if (!parsed.success) {
    return fail(firstIssue(parsed.error), 400);
  }

  const { name, capacity, seatsAvailable, inOperation } = parsed.data;
  const nextCapacity = capacity ?? 40;
  const nextSeats = seatsAvailable ?? nextCapacity;

  if (nextSeats > nextCapacity) {
    return fail("The free seats cannot be above the capacity", 400);
  }

  // The starting point is always the first station on the route.
  const startStation = await getFirstStation();

  // The identity colour is the first one nobody is using.
  const color = pickFreeFerryColor(await getUsedFerryColors());

  const created = await queryOne<FerryHealthRow>(
    `INSERT INTO "Ferry"
       (name, lat, lon, speed, "seatsAvailable", capacity, "inOperation", color)
     VALUES ($1, $2::double precision, $3::double precision, 0,
             $4::integer, $5::integer, COALESCE($6::boolean, TRUE), $7::text)
     RETURNING id, name, status, lat, lon, speed, "seatsAvailable", capacity,
               "inOperation", "receivedAt", "lastSeq", color`,
    [
      name.trim(),
      startStation?.lat ?? null,
      startStation?.lon ?? null,
      nextSeats,
      nextCapacity,
      inOperation ?? null,
      color,
    ],
  );

  await logActivity({
    userId: Number(user.id),
    userName: user.name ?? null,
    action: "FERRY_CREATED",
    entityType: "Ferry",
    entityId: created?.id ?? null,
    details: {
      changes: [
        `added ${name.trim()}`,
        `capacity ${nextCapacity}`,
        inOperation === false ? "out of service" : "in service",
        startStation ? `starting at ${startStation.name}` : "no station on the route yet",
        `colour ${color}`,
      ],
    },
  });

  return ok({ ferry: created });
}

/**
 * Remove a ferry from the fleet.
 *
 * Only the master administrator may do this. A ferry that has been in service
 * keeps its passenger counts and its GPS history, so it cannot be deleted: take
 * it out of service instead and it leaves the passenger site on its own.
 */
export async function DELETE(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return fail("Not signed in", 401);

  if (!canEditFleet(user.role)) {
    return fail("Only the master administrator can remove a ferry", 403);
  }

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return fail("Which ferry?", 400);

  const ferry = await queryOne<{ id: number; name: string }>(
    `SELECT id, name FROM "Ferry" WHERE id = $1`,
    [id],
  );
  if (!ferry) return fail("Unknown ferry", 404);

  const used = await queryOne<{ events: number; packets: number }>(
    `SELECT (SELECT count(*)::int FROM "PassengerEvent" WHERE "ferryId" = $1) AS events,
            (SELECT count(*)::int FROM "GpsLog" WHERE "ferryId" = $1) AS packets`,
    [id],
  );

  if ((used?.events ?? 0) > 0 || (used?.packets ?? 0) > 0) {
    return fail(
      "This ferry has already been in service, so it keeps its history. Take it out of service instead.",
      409,
    );
  }

  await query(`DELETE FROM "Ferry" WHERE id = $1`, [id]);

  await logActivity({
    userId: Number(user.id),
    userName: user.name ?? null,
    action: "FERRY_REMOVED",
    entityType: "Ferry",
    entityId: id,
    details: { changes: [`removed ${ferry.name}`], ferry: ferry.name },
  });

  return ok({ removed: id });
}

/**
 * Ferry control.
 *
 * The capacity and the in-operation flag can be changed freely. The trip
 * status cannot: the database works it out from the boat's own packets, so
 * there is nothing to set here.
 *
 * A manual seat correction is different: it overrides a number the system
 * worked out on its own, so it always needs a reason, and the reason is
 * written to the audit log with the account that made the change.
 */
export async function PATCH(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return fail("Not signed in", 401);

  // Editing a ferry is reserved for the master administrator. Station
  // accounts are refused here, in the middleware, and by the database role.
  if (!canEditFleet(user.role)) {
    return fail("Only the master administrator can change the ferries", 403);
  }

  const body = await readJson(request);
  const parsed = updateFerrySchema.safeParse(body);
  if (!parsed.success) {
    return fail(firstIssue(parsed.error), 400);
  }

  const { id, capacity, inOperation, seatsAvailable, reason } = parsed.data;

  if (
    capacity === undefined &&
    inOperation === undefined &&
    seatsAvailable === undefined
  ) {
    return fail("Nothing to change", 400);
  }

  if (seatsAvailable !== undefined && (!reason || reason.trim().length < 3)) {
    return fail("A reason is required for a manual seat correction", 400);
  }

  const ferry = await queryOne<{
    id: number;
    name: string;
    capacity: number;
    seatsAvailable: number;
    lat: number | null;
    lon: number | null;
    inOperation: boolean;
    color: string | null;
  }>(
    `SELECT id, name, capacity, "seatsAvailable", lat, lon, "inOperation", color
     FROM "Ferry" WHERE id = $1`,
    [id],
  );
  if (!ferry) return fail("Unknown ferry", 404);

  const nextCapacity = capacity ?? ferry.capacity;
  if (seatsAvailable !== undefined && seatsAvailable > nextCapacity) {
    return fail("The seat count cannot be above the capacity", 400);
  }

  // A boat that is in the fleet but has no position of its own is parked at
  // the first station, which is where a new boat starts from. This is the one
  // rule that keeps every boat in the fleet on the route line.
  const staysInService = inOperation ?? ferry.inOperation;
  const needsStartPosition = ferry.lat === null && ferry.lon === null && staysInService;
  const startStation = needsStartPosition ? await getFirstStation() : null;

  // A boat with no identity colour is given the first colour nobody else is
  // using, the same colour a new boat would be given.
  const needsColor = !ferry.color;
  const color = needsColor
    ? pickFreeFerryColor(await getUsedFerryColors())
    : null;

  const updated = await queryOne<FerryHealthRow>(
    `UPDATE "Ferry"
     SET capacity = COALESCE($2, capacity),
         "inOperation" = COALESCE($3, "inOperation"),
         "seatsAvailable" = COALESCE($4, "seatsAvailable"),
         lat = COALESCE($5, lat),
         lon = COALESCE($6, lon),
         speed = COALESCE($7, speed),
         color = COALESCE($8, color),
         "updatedAt" = now()
     WHERE id = $1
     RETURNING id, name, status, lat, lon, speed, "seatsAvailable", capacity,
               "inOperation", "receivedAt", "lastSeq", color`,
    [
      id,
      capacity ?? null,
      inOperation ?? null,
      seatsAvailable ?? null,
      startStation?.lat ?? null,
      startStation?.lon ?? null,
      startStation ? 0 : null,
      color,
    ],
  );

  const changes: string[] = [];
  if (capacity !== undefined) changes.push(`capacity to ${capacity}`);
  if (inOperation !== undefined) {
    changes.push(inOperation ? "back in service" : "out of service");
  }
  if (seatsAvailable !== undefined) {
    changes.push(`seats available from ${ferry.seatsAvailable} to ${seatsAvailable}`);
  }
  if (startStation) changes.push(`starting at ${startStation.name}`);
  if (color) changes.push(`colour ${color}`);

  await logActivity({
    userId: Number(user.id),
    userName: user.name ?? null,
    action: seatsAvailable !== undefined ? "SEAT_CORRECTION" : "FERRY_UPDATED",
    entityType: "Ferry",
    entityId: id,
    reason: reason ?? null,
    details: { changes, ferry: ferry.name },
  });

  return ok({ ferry: updated });
}
