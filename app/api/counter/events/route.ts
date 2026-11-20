import { NextResponse } from "next/server";
import { counterEventSchema } from "@freery/shared";
import { auth } from "@/lib/auth";
import { queryOne, transaction } from "@/lib/db";
import { fail, firstIssue, readJson } from "@/lib/api";
import { canCountAtStation, seatsAfterDelta } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Add or remove one passenger.
 *
 * The server rules:
 *   - a station administrator counts at their own station, never at another
 *   - the master administrator can count at any station
 *   - the count cannot go below zero or above the capacity
 *   - every tap carries a client id, so a retried tap is counted once
 *   - the seat count is updated in the same step as the event
 *
 * The rules are checked before anything is written, and the ferry row is
 * locked while the check and the write happen, so two taps at the same time
 * cannot both pass the capacity check.
 */
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return fail("Not signed in", 401);

  const body = await readJson(request);
  const parsed = counterEventSchema.safeParse(body);
  if (!parsed.success) {
    return fail(firstIssue(parsed.error), 400);
  }

  const { ferryId, passengerType, delta, clientId, stationId: askedStationId } =
    parsed.data;

  const isAdmin = user.role === "ADMIN";
  const ownStationId = user.stationId;

  // The station to count at. The master administrator may choose any station.
  // A station administrator always counts at their own station.
  let stationId: number;
  if (isAdmin) {
    const chosen = askedStationId ?? ownStationId ?? null;
    if (chosen === null || chosen === undefined) {
      return fail("Choose a station to count at", 400);
    }
    stationId = chosen;
  } else {
    if (ownStationId === null || ownStationId === undefined) {
      return fail("This account is not assigned to a station", 403);
    }
    const stationCheck = canCountAtStation(
      ownStationId,
      askedStationId ?? ownStationId,
    );
    if (!stationCheck.ok) return fail(stationCheck.message, stationCheck.status);
    stationId = ownStationId;
  }

  const station = await queryOne<{ id: number; name: string }>(
    `SELECT id, name FROM "Station" WHERE id = $1`,
    [stationId],
  );
  if (!station) return fail("The station was not found", 404);

  const result = await transaction(
    async (
      client,
    ): Promise<{ status: number; body: Record<string, unknown> }> => {
      const ferryResult = await client.query<{
        id: number;
        name: string;
        capacity: number;
        seatsAvailable: number;
      }>(
        `SELECT id, name, capacity, "seatsAvailable" FROM "Ferry" WHERE id = $1 FOR UPDATE`,
        [ferryId],
      );
      const ferry = ferryResult.rows[0];
      if (!ferry) {
        return { status: 404, body: { error: "Unknown ferry" } };
      }

      // The rules first, so a refused tap never writes anything.
      const check = seatsAfterDelta(ferry.seatsAvailable, delta, ferry.capacity);
      if (!check.ok) {
        return { status: check.status, body: { error: check.message } };
      }

      // The same tap twice must count once. The client id is unique, so the
      // database refuses the second attempt and it is treated as a repeat.
      try {
        await client.query(
          `INSERT INTO "PassengerEvent"
             ("ferryId", "stationId", "userId", "passengerType", delta, "clientId")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [ferryId, stationId, Number(user.id), passengerType, delta, clientId],
        );
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") {
          const onBoard = ferry.capacity - ferry.seatsAvailable;
          return {
            status: 200,
            body: {
              counted: false,
              duplicate: true,
              ferryId,
              seatsAvailable: ferry.seatsAvailable,
              capacity: ferry.capacity,
              onBoard,
            },
          };
        }
        throw error;
      }

      await client.query(
        `UPDATE "Ferry" SET "seatsAvailable" = $2, "updatedAt" = now() WHERE id = $1`,
        [ferryId, check.seats],
      );

      const onBoard = ferry.capacity - (check.seats ?? ferry.seatsAvailable);
      return {
        status: 200,
        body: {
          counted: true,
          duplicate: false,
          ferryId,
          ferryName: ferry.name,
          stationId,
          passengerType,
          delta,
          seatsAvailable: check.seats,
          capacity: ferry.capacity,
          onBoard,
        },
      };
    },
  );

  return NextResponse.json(result.body, { status: result.status });
}
