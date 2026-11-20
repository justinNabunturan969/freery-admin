import { NextResponse } from "next/server";
import { ingestSchema } from "@freery/shared";
import { deviceKeyMatches } from "@/lib/deviceKey";
import { transaction } from "@/lib/db";
import { firstIssue } from "@/lib/api";
import { isCounterMode } from "@/lib/mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The GPS ingest route.
 *
 * The port station posts a packet here over the local network. The device
 * key in the header proves the request comes from the port station, and it
 * lives in an environment variable, never in the browser code.
 *
 * Rules:
 *   401  the key is missing or wrong
 *   400  the body is not a valid packet
 *   200  the packet was stored, or it was a repeat and was ignored
 *
 * A packet may carry the receiver's own quality numbers, the HDOP and the
 * satellite count. They are optional, because the first version of the radio
 * packet had five fields only, and a packet without them is still stored.
 *
 * A packet names a boat, a receiver, or both. A packet with only a receiver is
 * a receiver on the bench: it has no boat anywhere near it, and it still gets
 * a record of its own.
 */
export async function POST(request: Request) {
  // The counter process never serves the ingest route.
  if (isCounterMode()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const key = request.headers.get("x-device-key");
  if (!deviceKeyMatches(key)) {
    return NextResponse.json(
      { error: "The device key is missing or wrong" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The body is not valid JSON" }, { status: 400 });
  }

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error), issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const packet = parsed.data;

  const result = await transaction(async (client) => {
    /*
     * The boat, when the packet came from one.
     *
     * The boat keeps its own packet counter, the one the port station reads
     * back from this answer to correct its numbers.
     */
    let ferry: { id: number; lastSeq: number } | null = null;

    if (packet.ferryId !== undefined) {
      const ferryResult = await client.query<{ id: number; lastSeq: number }>(
        `SELECT id, "lastSeq" FROM "Ferry" WHERE id = $1 FOR UPDATE`,
        [packet.ferryId],
      );
      ferry = ferryResult.rows[0] ?? null;
      if (!ferry) {
        return { status: 400 as const, body: { error: "Unknown ferry id" } };
      }
    }

    /*
     * The receiver, when the packet names one.
     *
     * A receiver on the bench has no boat, so the packet number is counted on
     * the receiver's own counter.
     */
    let device: { deviceId: string; lastSeq: number } | null = null;

    if (packet.deviceId !== undefined) {
      await client.query(
        `INSERT INTO "GpsDevice" ("deviceId", "lastSeq")
         VALUES ($1, 0)
         ON CONFLICT ("deviceId") DO NOTHING`,
        [packet.deviceId],
      );
      const deviceResult = await client.query<{ deviceId: string; lastSeq: number }>(
        `SELECT "deviceId", "lastSeq" FROM "GpsDevice" WHERE "deviceId" = $1 FOR UPDATE`,
        [packet.deviceId],
      );
      device = deviceResult.rows[0] ?? null;
    }

    // A repeated or out of order sequence number is ignored, not stored.
    const lastSeq = ferry ? ferry.lastSeq : (device?.lastSeq ?? 0);
    if (packet.seq <= lastSeq) {
      return {
        status: 200 as const,
        body: {
          stored: false,
          reason: "duplicate or out of order sequence number",
          ...(ferry ? { ferryId: ferry.id } : {}),
          ...(device ? { deviceId: device.deviceId } : {}),
          seq: packet.seq,
          lastSeq,
        },
      };
    }

    await client.query(
      `INSERT INTO "GpsLog"
         ("ferryId", "deviceId", lat, lon, speed, seq, rssi, snr, hdop, sats, "receivedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
      [
        packet.ferryId ?? null,
        packet.deviceId ?? null,
        packet.lat,
        packet.lon,
        packet.speed,
        packet.seq,
        packet.rssi ?? null,
        packet.snr ?? null,
        packet.hdop ?? null,
        packet.sats ?? null,
      ],
    );

    if (ferry) {
      await client.query(
        `UPDATE "Ferry"
         SET lat = $2, lon = $3, speed = $4, "receivedAt" = now(),
             "lastSeq" = $5, "updatedAt" = now()
         WHERE id = $1`,
        [ferry.id, packet.lat, packet.lon, packet.speed, packet.seq],
      );
    }

    if (device) {
      await client.query(
        `UPDATE "GpsDevice"
         SET lat = $2, lon = $3, speed = $4, hdop = $5, sats = $6,
             rssi = $7, snr = $8, "lastSeq" = $9, "lastSeenAt" = now(),
             "updatedAt" = now()
         WHERE "deviceId" = $1`,
        [
          device.deviceId,
          packet.lat,
          packet.lon,
          packet.speed,
          packet.hdop ?? null,
          packet.sats ?? null,
          packet.rssi ?? null,
          packet.snr ?? null,
          packet.seq,
        ],
      );
    }

    return {
      status: 200 as const,
      body: {
        stored: true,
        ...(ferry ? { ferryId: ferry.id } : {}),
        ...(device ? { deviceId: device.deviceId } : {}),
        seq: packet.seq,
        receivedAt: new Date().toISOString(),
      },
    };
  });

  return NextResponse.json(result.body, { status: result.status });
}
