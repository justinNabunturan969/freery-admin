import { passengerCorrectionSchema } from "@freery/shared";
import { auth } from "@/lib/auth";
import { query, queryOne, transaction } from "@/lib/db";
import { fail, firstIssue, ok, readJson } from "@/lib/api";
import { logActivity } from "@/lib/audit";
import { getManifest } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The passenger manifest, the counts the admin screens show and export. */
export async function GET() {
  const manifest = await getManifest();
  return ok({ manifest });
}

/**
 * Correct one line of the passenger manifest.
 *
 * The manifest is worked out from the passenger events, so a correction
 * cannot simply overwrite a number. The route works out the difference
 * between the count that is on record and the count the administrator says
 * is right, and writes that difference as a new event, so the history stays
 * complete. The reason is required and is kept in the audit log.
 */
export async function PATCH(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return fail("Not signed in", 401);

  const body = await readJson(request);
  const parsed = passengerCorrectionSchema.safeParse(body);
  if (!parsed.success) {
    return fail(firstIssue(parsed.error), 400);
  }

  const { ferryId, stationId, passengerType, onBoard, reason, occurredAt } = parsed.data;

  const ferry = await queryOne<{ id: number; name: string; capacity: number; seatsAvailable: number }>(
    `SELECT id, name, capacity, "seatsAvailable" FROM "Ferry" WHERE id = $1`,
    [ferryId],
  );
  if (!ferry) return fail("Unknown ferry", 404);

  const station = await queryOne<{ id: number; name: string }>(
    `SELECT id, name FROM "Station" WHERE id = $1`,
    [stationId],
  );
  if (!station) return fail("Unknown station", 404);

  const current = await queryOne<{ onBoard: number }>(
    `SELECT COALESCE(sum(delta), 0)::int AS "onBoard"
     FROM "PassengerEvent"
     WHERE "ferryId" = $1 AND "stationId" = $2 AND "passengerType" = $3`,
    [ferryId, stationId, passengerType],
  );
  const recorded = current?.onBoard ?? 0;
  const difference = onBoard - recorded;

  if (difference === 0) {
    return ok({ changed: false, onBoard: recorded });
  }

  // The corrected total must still fit on the ferry.
  const seatsAfter = ferry.seatsAvailable - difference;
  if (seatsAfter < 0) {
    return fail("The corrected count would put more passengers aboard than the ferry can carry", 409);
  }
  if (seatsAfter > ferry.capacity) {
    return fail("The corrected count cannot be above the capacity", 409);
  }

  await transaction(async (client) => {
    await client.query(
      `INSERT INTO "PassengerEvent"
         ("ferryId", "stationId", "userId", "passengerType", delta, "clientId", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))`,
      [
        ferryId,
        stationId,
        Number(user.id),
        passengerType,
        difference > 0 ? 1 : -1,
        `admin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        occurredAt ?? null,
      ],
    );

    // The event log only holds single steps, so a correction of more than one
    // passenger is written as several steps.
    const steps = Math.abs(difference);
    for (let step = 1; step < steps; step += 1) {
      await client.query(
        `INSERT INTO "PassengerEvent"
           ("ferryId", "stationId", "userId", "passengerType", delta, "clientId", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))`,
        [
          ferryId,
          stationId,
          Number(user.id),
          passengerType,
          difference > 0 ? 1 : -1,
          `admin-${Date.now()}-${step}-${Math.random().toString(36).slice(2, 10)}`,
          occurredAt ?? null,
        ],
      );
    }

    await client.query(
      `UPDATE "Ferry" SET "seatsAvailable" = $2, "updatedAt" = now() WHERE id = $1`,
      [ferryId, seatsAfter],
    );
  });

  await logActivity({
    userId: Number(user.id),
    userName: user.name ?? null,
    action: "PASSENGER_MANIFEST_CORRECTED",
    entityType: "PassengerEvent",
    entityId: ferryId,
    reason,
    details: {
      ferry: ferry.name,
      station: station.name,
      passengerType,
      from: recorded,
      to: onBoard,
      difference,
    },
  });

  const manifest = await getManifest();
  return ok({ changed: true, onBoard, manifest });
}
