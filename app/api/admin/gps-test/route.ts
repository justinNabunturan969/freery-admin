import { auth } from "@/lib/auth";
import { fail, ok } from "@/lib/api";
import { getGpsDevices, getReceiverAnalysis, removeReceiver } from "@/lib/queries";
import type { ReceiverAnalysis } from "@/lib/accuracy";
import { formatDateTime } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The receiver bench.
 *
 * This is the measurement the researchers take: how accurate is the GPS inside
 * the receiver that is connected right now.
 *
 * The same numbers come back here as on the bench page, and the two downloads
 * are the same data:
 *
 *   ?format=csv   one row per recorded position, with its error
 *   ?format=gpx   the trace, for a mapping program
 *
 * The filters are the ones on the page:
 *
 *   ?deviceId=RX-1   only this receiver
 *   ?hours=24        only the last 24 hours
 *   ?maxHdop=5       leave out the fixes the receiver was unsure of
 *   ?minSats=4       leave out the fixes with too few satellites
 */
/**
 * Forget a receiver.
 *
 * It takes the receiver, the place it was marked and the positions it recorded
 * off the bench. It is how a test run is cleared before the next one, and how
 * the test suite leaves the database the way it found it.
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return fail("Not signed in", 401);

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId");
  if (!deviceId) return fail("Which receiver?", 400);

  await removeReceiver(deviceId);

  return ok({ removed: deviceId });
}

export async function GET(request: Request) {  const session = await auth();
  if (!session?.user) return fail("Not signed in", 401);

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "json";

  const hours = searchParams.get("hours")
    ? Number(searchParams.get("hours"))
    : null;
  const maxHdop = searchParams.get("maxHdop")
    ? Number(searchParams.get("maxHdop"))
    : null;
  const minSats = searchParams.get("minSats")
    ? Number(searchParams.get("minSats"))
    : null;

  const receivers = await getGpsDevices();

  /*
   * The receiver on show.
   *
   * The receiver the reader connected is the one on show, even when it has
   * not reported yet: the answer then holds no positions, which is the honest
   * answer. With nothing connected, the receiver that reported most recently
   * is the one on show, so a receiver that is plugged in appears by itself.
   */
  const asked = searchParams.get("deviceId");
  const deviceId = asked || (receivers[0]?.deviceId ?? null);

  if (!deviceId) {
    return ok({
      servedAt: new Date().toISOString(),
      receivers,
      deviceId: null,
      analysis: null,
    });
  }

  const analysis = await getReceiverAnalysis({
    deviceId,
    hours: Number.isFinite(hours) ? hours : null,
    maxHdop: Number.isFinite(maxHdop) ? maxHdop : null,
    minSats: Number.isFinite(minSats) ? minSats : null,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const state = receivers.find((receiver) => receiver.deviceId === deviceId) ?? null;

  if (format === "csv") {
    return download(
      toCsv(analysis),
      `freery-receiver-${deviceId}-${stamp}.csv`,
      "text/csv",
    );
  }

  if (format === "gpx") {
    return download(
      toGpx(analysis, deviceId),
      `freery-receiver-${deviceId}-${stamp}.gpx`,
      "application/gpx+xml",
    );
  }

  return ok({
    servedAt: new Date().toISOString(),
    receivers,
    deviceId,
    state,
    analysis,
  });
}

function download(body: string, filename: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": `${contentType}; charset=utf-8`,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * One row per recorded position.
 *
 * The error is in metres, measured against the marked true position. The quality
 * columns are the receiver's own words about the fix, and they are empty when
 * the unit did not send them.
 */
function toCsv(analysis: ReceiverAnalysis): string {
  const header = [
    "Receiver",
    "Received at",
    "Latitude",
    "Longitude",
    "Speed (km/h)",
    "Sequence",
    "Error from the true position (m)",
    "HDOP",
    "Satellites",
    "RSSI (dBm)",
    "SNR (dB)",
  ];

  const rows = analysis.fixes.map((fix) =>
    [
      cell(fix.deviceId),
      cell(new Date(fix.receivedAt).toISOString()),
      cell(fix.lat),
      cell(fix.lon),
      cell(fix.speed),
      cell(fix.seq),
      cell(fix.errorM === null ? "" : fix.errorM.toFixed(2)),
      cell(fix.hdop),
      cell(fix.sats),
      cell(fix.rssi),
      cell(fix.snr),
    ].join(","),
  );

  return [header.join(","), ...rows].join("\r\n");
}

/**
 * The trace as a GPX file.
 *
 * A mapping program or a phone can open it. The trace is one track, with the
 * positions in the order they were recorded.
 */
function toGpx(analysis: ReceiverAnalysis, deviceId: string): string {
  const fixes = analysis.fixes;
  const first = fixes[0];

  const segment = fixes
    .map(
      (fix) =>
        `        <trkpt lat="${fix.lat.toFixed(7)}" lon="${fix.lon.toFixed(7)}">` +
        `<time>${new Date(fix.receivedAt).toISOString()}</time>` +
        `</trkpt>`,
    )
    .join("\n");

  const name = first
    ? `${deviceId} — ${formatDateTime(first.receivedAt)}`
    : deviceId;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="Freery admin console" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata>`,
    `    <name>Freery receiver trace</name>`,
    `    <time>${new Date().toISOString()}</time>`,
    `  </metadata>`,
    `  <trk>`,
    `    <name>${name}</name>`,
    `    <desc>Freery receiver ${deviceId}</desc>`,
    `    <trkseg>`,
    segment,
    `    </trkseg>`,
    `  </trk>`,
    `</gpx>`,
    ``,
  ].join("\n");
}
