import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { fail, ok } from "@/lib/api";
import { toCsv, type CsvColumn } from "@/lib/csv";
import {
  getActivity,
  getGpsLogs,
  getPassengerEvents,
  type ActivityRow,
  type GpsLogRow,
  type PassengerEventRow,
} from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The logs and the exports.
 *
 * Three kinds of log: the GPS packets, the passenger events and the audit
 * trail. The CSV and the Excel download are the same data with a
 * spreadsheet header, so the field tests can be analysed in a spreadsheet.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return fail("Not signed in", 401);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "activity";
  const format = searchParams.get("format") ?? "json";
  const limit = Math.min(
    5000,
    Math.max(1, Number(searchParams.get("limit") ?? 500) || 500),
  );

  const filters = {
    date: searchParams.get("date"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    stationId: searchParams.get("stationId")
      ? Number(searchParams.get("stationId"))
      : null,
  };

  const stamp = new Date().toISOString().slice(0, 10);

  if (type === "gps") {
    const rows = await getGpsLogs(limit);
    if (format === "csv") {
      const columns: CsvColumn<GpsLogRow>[] = [
        { key: "receivedAt", label: "Received at" },
        { key: "ferryName", label: "Ferry" },
        { key: "seq", label: "Sequence" },
        { key: "lat", label: "Latitude" },
        { key: "lon", label: "Longitude" },
        { key: "speed", label: "Speed (km/h)" },
        { key: "rssi", label: "RSSI (dBm)" },
        { key: "snr", label: "SNR (dB)" },
        { key: "hdop", label: "HDOP" },
        { key: "sats", label: "Satellites" },
      ];
      return csv(toCsv(rows, columns), `freery-gps-logs-${stamp}.csv`);
    }
    return ok({ type: "gps", rows });
  }

  if (type === "passenger") {
    const rows = await getPassengerEvents(limit, filters);
    if (format === "csv") {
      const columns: CsvColumn<PassengerEventRow>[] = [
        { key: "createdAt", label: "Recorded at" },
        { key: "stationName", label: "Station" },
        { key: "ferryName", label: "Ferry" },
        { key: "passengerType", label: "Passenger type" },
        { key: "delta", label: "Change" },
        { key: "userName", label: "Counted by" },
        { key: "clientId", label: "Client id" },
      ];
      return csv(toCsv(rows, columns), `freery-passenger-events-${stamp}.csv`);
    }
    if (format === "xlsx") {
      return spreadsheet(
        rows.map((row) => ({
          "Recorded at": row.createdAt,
          Station: row.stationName,
          Ferry: row.ferryName,
          "Passenger type": row.passengerType,
          Change: row.delta,
          "Counted by": row.userName ?? "",
        })),
        `freery-passenger-events-${stamp}.xlsx`,
      );
    }
    return ok({ type: "passenger", rows });
  }

  const rows = await getActivity(limit);
  if (format === "csv") {
    const columns: CsvColumn<ActivityRow>[] = [
      { key: "createdAt", label: "Recorded at" },
      { key: "userName", label: "Account" },
      { key: "action", label: "Action" },
      { key: "entityType", label: "Record type" },
      { key: "entityId", label: "Record id" },
      { key: "reason", label: "Reason" },
    ];
    return csv(toCsv(rows, columns), `freery-activity-log-${stamp}.csv`);
  }
  if (format === "xlsx") {
    return spreadsheet(
      rows.map((row) => ({
        "Recorded at": row.createdAt,
        Account: row.userName ?? "",
        Action: row.action,
        "Record type": row.entityType,
        "Record id": row.entityId ?? "",
        Reason: row.reason ?? "",
      })),
      `freery-activity-log-${stamp}.xlsx`,
    );
  }
  return ok({ type: "activity", rows });
}

function csv(body: string, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

/** A real spreadsheet, not a renamed CSV. */
async function spreadsheet(
  rows: Record<string, unknown>[],
  filename: string,
): Promise<Response> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Freery admin console";
  const sheet = workbook.addWorksheet("Freery export");

  const columns = Object.keys(rows[0] ?? { Data: "" });
  sheet.columns = columns.map((column) => ({
    header: column,
    key: column,
    width: Math.max(14, column.length + 4),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEF6F6" },
  };
  for (const row of rows) {
    sheet.addRow(
      Object.fromEntries(columns.map((column) => [column, row[column] ?? ""])),
    );
  }
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(1, columns.length) },
  };

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
