import { query, queryOne } from "@/lib/db";
import {
  analyseReceiver,
  type ReceiverAnalysis,
  type ReceiverFix,
  type ReceiverState,
  type ReferencePoint,
} from "@/lib/accuracy";

/**
 * Every read the admin app does.
 *
 * Keeping the SQL in one file means the server pages and the API routes
 * always show the same numbers, and it keeps the role permissions easy to
 * check: the counter role only ever runs the queries in the counter section.
 */

/* --- Rows ---------------------------------------------------------------- */

export interface FerryHealthRow {
  id: number;
  name: string;
  status: string;
  lat: number | null;
  lon: number | null;
  speed: number | null;
  seatsAvailable: number;
  capacity: number;
  inOperation: boolean;
  receivedAt: string | null;
  lastSeq: number;
  /** The identity colour of the boat, a name from the palette. */
  color: string | null;
  packetCount: number;
  firstSeq: number | null;
  maxSeq: number | null;
  lastRssi: number | null;
  lastSnr: number | null;
  avgRssi: number | null;
}

export interface StationRow {
  id: number;
  name: string;
  lat: number;
  lon: number;
  order: number;
  isOpen: boolean;
  notice: string | null;
  operatingHours: string | null;
  boardingInfo: string | null;
  mapsUrl: string | null;
  updatedAt: string | null;
  onBoard: number;
  lastBoarding: string | null;
}

export interface ManifestRow {
  ferryId: number;
  ferryName: string;
  stationId: number;
  stationName: string;
  passengerType: string;
  onBoard: number;
  lastBoarding: string | null;
}

export interface ActivityRow {
  id: number;
  userId: number | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  reason: string | null;
  details: unknown;
  createdAt: string;
}

export interface UserRow {
  id: number;
  username: string;
  name: string;
  role: string;
  stationId: number | null;
  stationName: string | null;
  isActive: boolean;
  failedLogins: number;
  lockedUntil: string | null;
  createdAt: string;
  lastLogin: string | null;
}

export interface GpsLogRow {
  id: number;
  /** The boat, when the position came from a boat. */
  ferryId: number | null;
  ferryName: string | null;
  /** The receiver that produced the position. */
  deviceId: string | null;
  lat: number;
  lon: number;
  speed: number;
  seq: number;
  rssi: number | null;
  snr: number | null;
  /** The receiver's own horizontal dilution of precision, when it sent one. */
  hdop: number | null;
  /** The number of satellites the fix was made from, when it sent one. */
  sats: number | null;
  receivedAt: string;
}

/**
 * One point of a recorded track.
 *
 * The same row as the log, with the boat's colour, and in the order the
 * points were recorded rather than the order they arrived at the screen.
 */
export interface GpsTrackPoint extends GpsLogRow {
  ferryColor: string | null;
}

export interface PassengerEventRow {
  id: number;
  ferryId: number;
  ferryName: string;
  stationId: number;
  stationName: string;
  userId: number | null;
  userName: string | null;
  passengerType: string;
  delta: number;
  clientId: string;
  createdAt: string;
}

/* --- Ferries -------------------------------------------------------------- */

const FERRY_SELECT = `
  SELECT
    f.id, f.name, f.status, f.lat, f.lon, f.speed,
    f."seatsAvailable", f.capacity, f."inOperation", f."receivedAt", f."lastSeq",
    f.color,
    COALESCE(g."packetCount", 0)::int AS "packetCount",
    g."firstSeq", g."maxSeq",
    g."lastRssi", g."lastSnr", g."avgRssi"
  FROM "Ferry" f
  LEFT JOIN LATERAL (
    SELECT
      count(*)::int AS "packetCount",
      min(seq) AS "firstSeq",
      max(seq) AS "maxSeq",
      (array_agg(rssi ORDER BY "receivedAt" DESC))[1] AS "lastRssi",
      (array_agg(snr ORDER BY "receivedAt" DESC))[1] AS "lastSnr",
      avg(rssi)::float AS "avgRssi"
    FROM "GpsLog" WHERE "GpsLog"."ferryId" = f.id
  ) g ON TRUE`;

export async function getFerries(): Promise<FerryHealthRow[]> {
  return query<FerryHealthRow>(`${FERRY_SELECT} ORDER BY f.id`);
}

export async function getFerry(id: number): Promise<FerryHealthRow | null> {
  return queryOne<FerryHealthRow>(`${FERRY_SELECT} WHERE f.id = $1`, [id]);
}

/**
 * Packet success rate from the sequence numbers.
 *
 * The expected count is the distance between the first and the last
 * sequence number plus one. Anything missing in between was a packet that
 * never arrived.
 */
export function successRate(ferry: FerryHealthRow): number | null {
  if (ferry.firstSeq === null || ferry.maxSeq === null) return null;
  const expected = ferry.maxSeq - ferry.firstSeq + 1;
  if (expected <= 0) return null;
  return Math.min(1, ferry.packetCount / expected);
}

/* --- Stations ------------------------------------------------------------- */

export async function getStations(): Promise<StationRow[]> {
  return query<StationRow>(
    `SELECT
       s.id, s.name, s.lat, s.lon, s."order", s."isOpen", s.notice,
       s."operatingHours", s."boardingInfo", s."mapsUrl", s."updatedAt",
       COALESCE(m."onBoard", 0)::int AS "onBoard",
       m."lastBoarding"
     FROM "Station" s
     LEFT JOIN LATERAL (
       SELECT sum(e.delta)::int AS "onBoard", max(e."createdAt") AS "lastBoarding"
       FROM "PassengerEvent" e WHERE e."stationId" = s.id
     ) m ON TRUE
     ORDER BY s."order"`,
  );
}

export async function getStation(id: number): Promise<StationRow | null> {
  const rows = await getStations();
  return rows.find((station) => station.id === id) ?? null;
}

/**
 * The first station on the route.
 *
 * This is where a boat starts from, so it is also where a ferry that has no
 * position of its own is parked. The order column decides, not the name, so
 * renaming "Station 1" does not move the starting point.
 */
export async function getFirstStation(): Promise<{
  id: number;
  name: string;
  lat: number;
  lon: number;
} | null> {
  return queryOne<{ id: number; name: string; lat: number; lon: number }>(
    `SELECT id, name, lat, lon
     FROM "Station"
     ORDER BY "order" ASC, id ASC
     LIMIT 1`,
  );
}

/**
 * The identity colours the fleet is already using.
 *
 * A new boat takes the first colour nobody is using, so the colours of the
 * boats that are already in the fleet are read before a boat is added.
 */
export async function getUsedFerryColors(): Promise<string[]> {
  const rows = await query<{ color: string | null }>(
    `SELECT DISTINCT color FROM "Ferry" WHERE color IS NOT NULL`,
  );
  return rows
    .map((row) => row.color)
    .filter((color): color is string => Boolean(color));
}

/* --- Passenger manifest --------------------------------------------------- */

export interface ManifestRow {
  ferryId: number;
  ferryName: string;
  stationId: number;
  stationName: string;
  passengerType: string;
  onBoard: number;
  lastBoarding: string | null;
}

export async function getManifest(): Promise<ManifestRow[]> {
  return query<ManifestRow>(
    `SELECT
       e."ferryId", f.name AS "ferryName",
       e."stationId", s.name AS "stationName",
       e."passengerType",
       sum(e.delta)::int AS "onBoard",
       max(e."createdAt") AS "lastBoarding"
     FROM "PassengerEvent" e
     JOIN "Ferry" f ON f.id = e."ferryId"
     JOIN "Station" s ON s.id = e."stationId"
     GROUP BY e."ferryId", f.name, e."stationId", s.name, e."passengerType"
     ORDER BY e."ferryId", e."stationId", e."passengerType"`,
  );
}

/**
 * Every passenger event with the station and the type.
 *
 * The manifest card filters these on the browser, so the boarding date,
 * the time range and the station can be changed without a round trip.
 */
export interface ManifestEventRow {
  id: number;
  stationId: number;
  stationName: string;
  stationOrder: number;
  ferryId: number;
  ferryName: string;
  passengerType: string;
  delta: number;
  createdAt: string;
}

export async function getManifestEvents(
  limit = 5000,
): Promise<ManifestEventRow[]> {
  return query<ManifestEventRow>(
    `SELECT e.id, e."stationId", s.name AS "stationName", s."order" AS "stationOrder",
            e."ferryId", f.name AS "ferryName",
            e."passengerType", e.delta, e."createdAt"
     FROM "PassengerEvent" e
     JOIN "Station" s ON s.id = e."stationId"
     JOIN "Ferry" f ON f.id = e."ferryId"
     ORDER BY e."createdAt" DESC, e.id DESC
     LIMIT $1`,
    [limit],
  );
}

/* --- Activity and logs ---------------------------------------------------- */

export async function getActivity(limit = 25): Promise<ActivityRow[]> {
  return query<ActivityRow>(
    `SELECT id, "userId", "userName", action, "entityType", "entityId", reason,
            details, "createdAt"
     FROM "ActivityLog"
     ORDER BY "createdAt" DESC, id DESC
     LIMIT $1`,
    [limit],
  );
}

export async function getGpsLogs(limit = 200): Promise<GpsLogRow[]> {
  return query<GpsLogRow>(
    `SELECT g.id, g."ferryId", f.name AS "ferryName", g."deviceId", g.lat, g.lon,
            g.speed, g.seq, g.rssi, g.snr, g.hdop, g.sats, g."receivedAt"
     FROM "GpsLog" g
     LEFT JOIN "Ferry" f ON f.id = g."ferryId"
     ORDER BY g."receivedAt" DESC, g.id DESC
     LIMIT $1`,
    [limit],
  );
}

/* --- The receiver's network ------------------------------------------------ */

/** Where a request is in its life. */
export type ReceiverNetworkStatus =
  | "pending"
  | "delivered"
  | "connected"
  | "failed"
  | "cancelled";

/** What a board says about the network it is on. */
export type ReceiverWifiStatus = "connected" | "failed" | "setup";

export interface ReceiverNetworkCommandRow {
  id: number;
  ssid: string;
  status: ReceiverNetworkStatus;
  message: string | null;
  createdAt: string;
  deliveredAt: string | null;
  answeredAt: string | null;
}

export interface PortStationRow {
  stationId: string;
  wifiSsid: string | null;
  wifiStatus: ReceiverWifiStatus | null;
  wifiIp: string | null;
  lastSeenAt: string | null;
  command: ReceiverNetworkCommandRow | null;
}

/**
 * Every board that talks to this PC, and the network each one is on.
 *
 * A board that has never reported is not in the list, unless a network has been
 * asked of it, because then the administrator has to see that the request is
 * still waiting.
 */
export async function getPortStations(): Promise<PortStationRow[]> {
  const rows = await query<{
    stationId: string;
    wifiSsid: string | null;
    wifiStatus: string | null;
    wifiIp: string | null;
    lastSeenAt: string | null;
    commandId: number | null;
    commandSsid: string | null;
    commandStatus: string | null;
    commandMessage: string | null;
    commandCreatedAt: string | null;
    commandDeliveredAt: string | null;
    commandAnsweredAt: string | null;
  }>(
    `WITH ids AS (
       SELECT "stationId" FROM "PortStation"
       UNION
       SELECT "stationId" FROM "ReceiverNetworkCommand"
     )
     SELECT i."stationId",
            p."wifiSsid", p."wifiStatus", p."wifiIp", p."lastSeenAt",
            c.id AS "commandId", c.ssid AS "commandSsid", c.status AS "commandStatus",
            c.message AS "commandMessage", c."createdAt" AS "commandCreatedAt",
            c."deliveredAt" AS "commandDeliveredAt", c."answeredAt" AS "commandAnsweredAt"
     FROM ids i
     LEFT JOIN "PortStation" p ON p."stationId" = i."stationId"
     LEFT JOIN LATERAL (
       SELECT * FROM "ReceiverNetworkCommand" c2
       WHERE c2."stationId" = i."stationId"
       ORDER BY c2."createdAt" DESC
       LIMIT 1
     ) c ON TRUE
     ORDER BY p."lastSeenAt" DESC NULLS LAST, i."stationId"`,
  );

  return rows.map((row) => ({
    stationId: row.stationId,
    wifiSsid: row.wifiSsid,
    wifiStatus: (row.wifiStatus ?? null) as ReceiverWifiStatus | null,
    wifiIp: row.wifiIp,
    lastSeenAt: row.lastSeenAt,
    command:
      row.commandId === null
        ? null
        : {
            id: row.commandId,
            ssid: row.commandSsid ?? "",
            status: (row.commandStatus ?? "pending") as ReceiverNetworkStatus,
            message: row.commandMessage,
            createdAt: row.commandCreatedAt ?? "",
            deliveredAt: row.commandDeliveredAt,
            answeredAt: row.commandAnsweredAt,
          },
  }));
}

/**
 * Asks a board to use a different network.
 *
 * Only one request is open at a time. A second request replaces the first one,
 * because the administrator has changed their mind and the old request would
 * only confuse the board.
 */
export async function requestReceiverNetwork(input: {
  stationId: string;
  ssid: string;
  password: string;
}): Promise<ReceiverNetworkCommandRow> {
  await query(
    `UPDATE "ReceiverNetworkCommand"
     SET status = 'cancelled', message = 'a newer request was made', "answeredAt" = now()
     WHERE "stationId" = $1 AND status IN ('pending', 'delivered')`,
    [input.stationId],
  );

  const rows = await query<{
    id: number;
    ssid: string;
    status: string;
    message: string | null;
    createdAt: string;
    deliveredAt: string | null;
    answeredAt: string | null;
  }>(
    `INSERT INTO "ReceiverNetworkCommand" ("stationId", ssid, password)
     VALUES ($1, $2, $3)
     RETURNING id, ssid, status, message, "createdAt", "deliveredAt", "answeredAt"`,
    [input.stationId, input.ssid, input.password],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("The network request was not written");
  }
  return {
    id: row.id,
    ssid: row.ssid,
    status: row.status as ReceiverNetworkStatus,
    message: row.message,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
    answeredAt: row.answeredAt,
  };
}

/**
 * Takes the network a board is being asked to use.
 *
 * The row is marked as delivered in the same statement that reads it, so two
 * boards asking at the same time cannot both be given the same request. The
 * password is returned once and then cleared.
 */
export async function takeReceiverNetwork(
  stationId: string,
): Promise<{ id: number; ssid: string; password: string } | null> {
  const rows = await query<{ id: number; ssid: string; password: string }>(
    `UPDATE "ReceiverNetworkCommand"
     SET status = 'delivered', "deliveredAt" = now()
     WHERE id = (
       SELECT id FROM "ReceiverNetworkCommand"
       WHERE "stationId" = $1 AND status = 'pending'
       ORDER BY "createdAt" ASC
       LIMIT 1
     )
     RETURNING id, ssid, password`,
    [stationId],
  );

  const row = rows[0];
  if (!row) return null;

  /* The secret has been handed over. It does not stay in the database. */
  await query(
    `UPDATE "ReceiverNetworkCommand" SET password = '' WHERE id = $1`,
    [row.id],
  );

  return { id: row.id, ssid: row.ssid, password: row.password };
}

/**
 * Writes down what a board says about its own network.
 *
 * When a board has been given a new network and it is now on that network,
 * the request is marked as answered. When the board tried it and could not get
 * on, the request is marked as failed and the board keeps the network it
 * already had.
 */
export async function recordPortStation(input: {
  stationId: string;
  ssid: string | null;
  status: string | null;
  ip: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO "PortStation" ("stationId", "wifiSsid", "wifiStatus", "wifiIp", "lastSeenAt")
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT ("stationId") DO UPDATE
       SET "wifiSsid" = COALESCE(EXCLUDED."wifiSsid", "PortStation"."wifiSsid"),
           "wifiStatus" = COALESCE(EXCLUDED."wifiStatus", "PortStation"."wifiStatus"),
           "wifiIp" = COALESCE(EXCLUDED."wifiIp", "PortStation"."wifiIp"),
           "lastSeenAt" = now(),
           "updatedAt" = now()`,
    [input.stationId, input.ssid, input.status, input.ip],
  );

  /*
   * Only a request the board has already taken is answered here. A request that
   * is still waiting was not taken yet, and the board saying which network it
   * is on says nothing about a network it has not been given.
   */
  if (input.status === "failed") {
    await query(
      `UPDATE "ReceiverNetworkCommand"
       SET status = 'failed', message = $2, "answeredAt" = now()
       WHERE "stationId" = $1 AND status = 'delivered'`,
      [input.stationId, "The board could not get on that network"],
    );
    return;
  }

  if (input.status === "connected" && input.ssid) {
    /* The board is on the network it was asked to use. */
    await query(
      `UPDATE "ReceiverNetworkCommand"
       SET status = 'connected', message = $2, "answeredAt" = now()
       WHERE "stationId" = $1 AND status = 'delivered' AND ssid = $3`,
      [input.stationId, "The board is on that network", input.ssid],
    );
    /* Any other request the board took earlier was not the one it is on now. */
    await query(
      `UPDATE "ReceiverNetworkCommand"
       SET status = 'failed', message = $2, "answeredAt" = now()
       WHERE "stationId" = $1 AND status = 'delivered' AND ssid <> $3`,
      [input.stationId, "The board stayed on the network it already had", input.ssid],
    );
  }
}

/**
 * Takes back a request that has not been answered.
 *
 * The board may already have taken it, so the request is only cancelled while
 * it is still waiting to be picked up.
 */
export async function cancelReceiverNetwork(stationId: string): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `UPDATE "ReceiverNetworkCommand"
     SET status = 'cancelled', message = 'cancelled by the administrator', "answeredAt" = now()
     WHERE "stationId" = $1 AND status = 'pending'
     RETURNING id`,
    [stationId],
  );
  return rows.length > 0;
}

/* --- The receiver bench --------------------------------------------------- */

/**
 * Every receiver that has reported, and what it last said.
 *
 * This is the list on the bench page. A receiver that is connected and
 * reporting is in it, whether it is on a boat or standing on the bench with
 * nothing else around it.
 */
export async function getGpsDevices(): Promise<ReceiverState[]> {
  return query<ReceiverState>(
    `SELECT d."deviceId", d.lat, d.lon, d.speed, d.hdop, d.sats, d.rssi, d.snr,
            d."lastSeq", d."lastSeenAt",
            COALESCE(c."fixCount", 0)::int AS "fixCount"
     FROM "GpsDevice" d
     LEFT JOIN LATERAL (
       SELECT count(*)::int AS "fixCount"
       FROM "GpsLog" g WHERE g."deviceId" = d."deviceId"
     ) c ON TRUE
     ORDER BY d."lastSeenAt" DESC NULLS LAST, d."deviceId"`,
  );
}

/**
 * The positions one receiver recorded, in the order they were recorded.
 *
 * The bench needs them in time order, oldest first, because a trace is a line
 * and a line has a direction.
 */
export async function getReceiverFixes(options: {
  deviceId: string;
  since?: Date | null;
  limit?: number;
}): Promise<ReceiverFix[]> {
  return query<ReceiverFix>(
    `SELECT g.id, g."deviceId", g.lat, g.lon, g.speed, g.seq, g.rssi, g.snr,
            g.hdop, g.sats, g."receivedAt"
     FROM "GpsLog" g
     WHERE g."deviceId" = $1
       AND ($2::timestamptz IS NULL OR g."receivedAt" >= $2)
     ORDER BY g."receivedAt", g.id
     LIMIT $3`,
    [options.deviceId, options.since ?? null, options.limit ?? 20000],
  );
}

/** Where the researcher says the receiver really is. */
export async function getGpsReference(
  deviceId: string,
): Promise<ReferencePoint | null> {
  const row = await queryOne<{ lat: number; lon: number; label: string }>(
    `SELECT lat, lon, label FROM "GpsReference" WHERE "deviceId" = $1`,
    [deviceId],
  );
  return row ? { lat: row.lat, lon: row.lon, label: row.label } : null;
}

/** Marks where the receiver really is. It replaces the old mark. */
export async function setGpsReference(reference: {
  deviceId: string;
  lat: number;
  lon: number;
  label: string;
}): Promise<ReferencePoint> {
  await query(
    `INSERT INTO "GpsReference" ("deviceId", label, lat, lon)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("deviceId") DO UPDATE
       SET label = EXCLUDED.label,
           lat = EXCLUDED.lat,
           lon = EXCLUDED.lon,
           "updatedAt" = now()`,
    [reference.deviceId, reference.label, reference.lat, reference.lon],
  );
  return {
    lat: reference.lat,
    lon: reference.lon,
    label: reference.label,
  };
}

/** Takes the mark away, so the page has no ground truth again. */
export async function clearGpsReference(deviceId: string): Promise<void> {
  await query(`DELETE FROM "GpsReference" WHERE "deviceId" = $1`, [deviceId]);
}

/**
 * Forgets a receiver: the mark, the positions it recorded and the receiver
 * itself.
 *
 * It is how a test run is cleared before the next one.
 */
export async function removeReceiver(deviceId: string): Promise<void> {
  await query(`DELETE FROM "GpsReference" WHERE "deviceId" = $1`, [deviceId]);
  await query(`DELETE FROM "GpsLog" WHERE "deviceId" = $1`, [deviceId]);
  await query(`DELETE FROM "GpsDevice" WHERE "deviceId" = $1`, [deviceId]);
}

/**
 * The whole measurement for one receiver.
 *
 * This is the one read the bench page and the bench API both use, so the page
 * and the download always show the same figures.
 */
export async function getReceiverAnalysis(options: {
  deviceId: string;
  hours?: number | null;
  maxHdop?: number | null;
  minSats?: number | null;
}): Promise<ReceiverAnalysis> {
  const since =
    options.hours && options.hours > 0
      ? new Date(Date.now() - options.hours * 3600 * 1000)
      : null;

  const fixes = await getReceiverFixes({ deviceId: options.deviceId, since });
  const reference = await getGpsReference(options.deviceId);

  return analyseReceiver({
    fixes,
    reference,
    filter: {
      maxHdop: options.maxHdop ?? null,
      minSats: options.minSats ?? null,
    },
  });
}

export interface LogFilters {
  /** A boarding date, YYYY-MM-DD. */
  date?: string | null;
  /** The start of the time range, for example "05:00 AM". */
  from?: string | null;
  /** The end of the time range, for example "09:00 PM". */
  to?: string | null;
  stationId?: number | null;
}

export async function getPassengerEvents(
  limit = 200,
  filters: LogFilters = {},
): Promise<PassengerEventRow[]> {
  return query<PassengerEventRow>(
    `SELECT e.id, e."ferryId", f.name AS "ferryName",
            e."stationId", s.name AS "stationName",
            e."userId", u.name AS "userName",
            e."passengerType", e.delta, e."clientId", e."createdAt"
     FROM "PassengerEvent" e
     JOIN "Ferry" f ON f.id = e."ferryId"
     JOIN "Station" s ON s.id = e."stationId"
     LEFT JOIN "User" u ON u.id = e."userId"
     WHERE ($1::date IS NULL OR e."createdAt" >= $1::date)
       AND ($2::time IS NULL OR e."createdAt"::time >= $2::time)
       AND ($3::time IS NULL OR e."createdAt"::time <= $3::time)
       AND ($4::int IS NULL OR e."stationId" = $4)
     ORDER BY e."createdAt" DESC, e.id DESC
     LIMIT $5`,
    [
      filters.date ?? null,
      filters.from ? toSqlTime(filters.from) : null,
      filters.to ? toSqlTime(filters.to) : null,
      filters.stationId ?? null,
      limit,
    ],
  );
}

/** "05:00 AM" into the time PostgreSQL understands. */
export function toSqlTime(value: string): string | null {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = (match[3] ?? "AM").toUpperCase();
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

/* --- Accounts ------------------------------------------------------------- */

export async function getUsers(): Promise<UserRow[]> {
  return query<UserRow>(
    `SELECT u.id, u.username, u.name, u.role, u."stationId",
            s.name AS "stationName",
            u."isActive", u."failedLogins", u."lockedUntil", u."createdAt",
            (SELECT max(a."createdAt") FROM "ActivityLog" a
             WHERE a."userId" = u.id AND a.action = 'LOGIN') AS "lastLogin"
     FROM "User" u
     LEFT JOIN "Station" s ON s.id = u."stationId"
     ORDER BY u.id`,
  );
}

/* --- Overview ------------------------------------------------------------- */

export interface OverviewStats {
  activeFerries: number;
  totalFerries: number;
  packetsToday: number;
  lastPacketAt: string | null;
  passengersToday: number;
  passengersOnBoard: number;
  stationsOpen: number;
  stationsTotal: number;
  availableSeats: number;
  operatingSeats: number;
  underwayFerries: number;
  dockedFerries: number;
  activeAccounts: number;
  staffAccounts: number;
  adminAccounts: number;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const row = await queryOne<{
    activeFerries: number;
    totalFerries: number;
    packetsToday: number;
    lastPacketAt: string | null;
    passengersToday: number;
    passengersOnBoard: number;
    stationsOpen: number;
    stationsTotal: number;
    availableSeats: number;
    operatingSeats: number;
    underwayFerries: number;
    dockedFerries: number;
    activeAccounts: number;
    staffAccounts: number;
    adminAccounts: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM "Ferry"
        WHERE "inOperation") AS "activeFerries",
       (SELECT count(*)::int FROM "Ferry") AS "totalFerries",
       (SELECT count(*)::int FROM "GpsLog"
        WHERE "receivedAt" >= date_trunc('day', now())) AS "packetsToday",
       (SELECT max("receivedAt") FROM "GpsLog") AS "lastPacketAt",
       (SELECT COALESCE(sum(delta), 0)::int FROM "PassengerEvent"
        WHERE "createdAt" >= date_trunc('day', now()) AND delta > 0) AS "passengersToday",
       (SELECT COALESCE(sum(delta), 0)::int FROM "PassengerEvent") AS "passengersOnBoard",
       (SELECT count(*)::int FROM "Station" WHERE "isOpen") AS "stationsOpen",
       (SELECT count(*)::int FROM "Station") AS "stationsTotal",
       (SELECT COALESCE(sum("seatsAvailable"), 0)::int FROM "Ferry"
        WHERE "inOperation") AS "availableSeats",
       (SELECT COALESCE(sum(capacity), 0)::int FROM "Ferry"
        WHERE "inOperation") AS "operatingSeats",
       (SELECT count(*)::int FROM "Ferry"
        WHERE "inOperation" AND status = 'IN_TRANSIT') AS "underwayFerries",
       (SELECT count(*)::int FROM "Ferry"
        WHERE "inOperation" AND status = 'DOCKED') AS "dockedFerries",
       (SELECT count(*)::int FROM "User" WHERE "isActive") AS "activeAccounts",
       (SELECT count(*)::int FROM "User" WHERE "isActive" AND role = 'STAFF') AS "staffAccounts",
       (SELECT count(*)::int FROM "User" WHERE "isActive" AND role <> 'STAFF') AS "adminAccounts"`,
  );
  return {
    activeFerries: row?.activeFerries ?? 0,
    totalFerries: row?.totalFerries ?? 0,
    packetsToday: row?.packetsToday ?? 0,
    lastPacketAt: row?.lastPacketAt ?? null,
    passengersToday: row?.passengersToday ?? 0,
    passengersOnBoard: row?.passengersOnBoard ?? 0,
    stationsOpen: row?.stationsOpen ?? 0,
    stationsTotal: row?.stationsTotal ?? 0,
    availableSeats: row?.availableSeats ?? 0,
    operatingSeats: row?.operatingSeats ?? 0,
    underwayFerries: row?.underwayFerries ?? 0,
    dockedFerries: row?.dockedFerries ?? 0,
    activeAccounts: row?.activeAccounts ?? 0,
    staffAccounts: row?.staffAccounts ?? 0,
    adminAccounts: row?.adminAccounts ?? 0,
  };
}

/**
 * Who is signed in right now, and how many were signed in over the last
 * three hours.
 *
 * The answer comes from the sign in and sign out events in the audit log.
 * An account counts as signed in when its last event before the sample
 * point was a sign in.
 */
export interface SessionSummary {
  onlineNow: number;
  staffOnline: number;
  adminOnline: number;
  series: { label: string; value: number }[];
}

export async function getSessionSummary(
  buckets = 12,
  bucketMinutes = 15,
): Promise<SessionSummary> {
  const spanMinutes = buckets * bucketMinutes;

  const events = await query<{
    userId: number | null;
    userName: string | null;
    role: string | null;
    action: string;
    createdAt: string;
  }>(
    `SELECT a."userId", a."userName",
            (SELECT u.role FROM "User" u WHERE u.id = a."userId") AS role,
            a.action, a."createdAt"
     FROM "ActivityLog" a
     WHERE a.action IN ('LOGIN', 'LOGOUT')
       AND a."createdAt" >= now() - ($1 || ' minutes')::interval
     ORDER BY a."createdAt" ASC`,
    [String(spanMinutes)],
  );

  const timeline = new Map<
    number,
    { action: string; at: number; role: string | null }[]
  >();
  for (const event of events) {
    if (event.userId === null) continue;
    const list = timeline.get(event.userId) ?? [];
    list.push({
      action: event.action,
      at: new Date(event.createdAt).getTime(),
      role: event.role,
    });
    timeline.set(event.userId, list);
  }

  const signedInAt = (at: number) => {
    let count = 0;
    let staff = 0;
    for (const list of timeline.values()) {
      let state: "in" | "out" | null = null;
      let role: string | null = null;
      for (const event of list) {
        if (event.at > at) break;
        state = event.action === "LOGIN" ? "in" : "out";
        role = event.role;
      }
      if (state === "in") {
        count += 1;
        if (role === "STAFF") staff += 1;
      }
    }
    return { count, staff };
  };

  const now = Date.now();
  const bucketMs = bucketMinutes * 60_000;
  const series: { label: string; value: number }[] = [];

  for (let index = buckets - 1; index >= 0; index -= 1) {
    const at = now - index * bucketMs;
    const sample = signedInAt(at);
    series.push({
      label: new Date(at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
      value: sample.count,
    });
  }

  const current = signedInAt(now);

  return {
    onlineNow: current.count,
    staffOnline: current.staff,
    adminOnline: current.count - current.staff,
    series,
  };
}

/**
 * The alerts shown on the overview.
 *
 * A ferry is an alert when it is out of service, or when it has not sent a
 * packet for more than the stale limit.
 */
export function buildAlerts(
  ferries: FerryHealthRow[],
  staleSeconds = 60,
): { level: "warn" | "info"; message: string }[] {
  const alerts: { level: "warn" | "info"; message: string }[] = [];
  const now = Date.now();

  for (const ferry of ferries) {
    if (!ferry.inOperation || ferry.status === "OFFLINE") {
      alerts.push({ level: "warn", message: `${ferry.name} is out of service` });
      continue;
    }
    if (!ferry.receivedAt) {
      alerts.push({ level: "warn", message: `${ferry.name} has not sent a packet yet` });
      continue;
    }
    const ageSeconds = (now - new Date(ferry.receivedAt).getTime()) / 1000;
    if (ageSeconds > staleSeconds) {
      alerts.push({
        level: "warn",
        message: `${ferry.name} has not sent a packet for ${Math.round(ageSeconds)} seconds`,
      });
    }
  }

  return alerts;
}
