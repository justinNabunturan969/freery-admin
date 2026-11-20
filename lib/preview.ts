/**
 * The live preview maths.
 *
 * This is the same reasoning the passenger website uses, brought into the
 * admin app so the two previews can never disagree. A ferry's real GPS
 * position is projected onto the straight line of station dots, and the card
 * beside it says where the boat is going, how far it is and how many seats are
 * free.
 *
 * Nothing here talks to the database. The route reads the snapshot and turns
 * it into the picture, so the admin console, the station app and the
 * passenger website all draw the same route from the same numbers.
 */

import { FERRY_COLOR_VALUES, ferryColorOf } from "@freery/shared";

/* -------------------------------------------------------------------------- */
/* The data                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The three states a boat can be in.
 *
 * The status is worked out by the database from the boat's own packets, so it
 * cannot be set by an administrator and the two screens cannot disagree.
 */
export type FerryStatus = "DOCKED" | "IN_TRANSIT" | "OFFLINE";

export interface PreviewFerry {
  id: number;
  name: string;
  status: FerryStatus;
  lat: number | null;
  lon: number | null;
  /** km/h */
  speed: number | null;
  seatsAvailable: number;
  capacity: number;
  /** False when the master administrator has taken the boat out of service. */
  inOperation: boolean;
  /** ISO timestamp of the last GPS packet. */
  receivedAt: string | null;
  /**
   * The identity colour of the boat, a name from the shared palette.
   *
   * It is read from the database, so the console and the passenger website
   * always draw the same boat in the same colour.
   */
  color: string | null;
}

export interface PreviewStation {
  id: number;
  name: string;
  lat: number;
  lon: number;
  order: number;
  isOpen: boolean;
}

export interface FleetSnapshot {
  servedAt: string;
  ferries: PreviewFerry[];
  stations: PreviewStation[];
}

/* -------------------------------------------------------------------------- */
/* Freshness                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A GPS packet older than this is treated as stale.
 *
 * The same limit the passenger website uses, so a boat cannot look alive on
 * one screen and stale on the other.
 */
export const STALE_SECONDS = 60;

/** How often the preview asks the server for a new snapshot. */
export const PREVIEW_POLL_MS = 5_000;

export type Freshness = "live" | "stale" | "offline" | "unknown";

export function ageSeconds(
  receivedAt: string | null,
  now: number = Date.now(),
): number | null {
  if (!receivedAt) return null;
  const parsed = Date.parse(receivedAt);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.round((now - parsed) / 1000));
}

export function freshnessOf(
  receivedAt: string | null,
  now: number = Date.now(),
  staleSeconds: number = STALE_SECONDS,
): Freshness {
  const age = ageSeconds(receivedAt, now);
  if (age === null) return "unknown";
  return age > staleSeconds ? "stale" : "live";
}

/** "just now", "3 min ago", "1 hr 12 min ago". */
export function describeAge(seconds: number | null): string {
  if (seconds === null) return "unknown";
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr ago` : `${hours} hr ${rest} min ago`;
}

/**
 * The same age in the short form, for the narrow callout card.
 *
 * "4 hr 17 min" instead of "4 hr 17 min ago". The card already says "Last
 * seen", so the extra three characters were only pushing the text out of the
 * card.
 */
export function describeAgeShort(seconds: number | null): string {
  if (seconds === null) return "unknown";
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** How the marker is drawn: normal, stale, or not on the route at all. */
export function markerState(
  status: string,
  receivedAt: string | null,
  now: number = Date.now(),
  staleSeconds: number = STALE_SECONDS,
): "normal" | "stale" | "offline" {
  if (status === "OFFLINE") return "offline";
  if (freshnessOf(receivedAt, now, staleSeconds) === "stale") return "stale";
  return "normal";
}

/* -------------------------------------------------------------------------- */
/* Distance and time                                                          */
/* -------------------------------------------------------------------------- */

const EARTH_RADIUS_KM = 6371;

export interface LatLon {
  lat: number;
  lon: number;
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

/** Great circle distance between two points, in kilometres. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Minutes to cover a distance at a given speed, or null when there is none. */
export function etaMinutes(
  distanceKm: number | null,
  speedKmh: number | null,
): number | null {
  if (distanceKm === null || speedKmh === null) return null;
  if (!Number.isFinite(distanceKm) || !Number.isFinite(speedKmh)) return null;
  if (speedKmh < 1) return null;
  return (distanceKm / speedKmh) * 60;
}

/** "4 min", "1 h 20 min", or a dash when there is no estimate. */
export function formatEta(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return "—";
  if (minutes < 1) return "< 1 min";
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "18 km/h", or a dash when there is no reading. */
export function formatSpeed(speedKmh: number | null): string {
  if (speedKmh === null || !Number.isFinite(speedKmh)) return "—";
  return `${Math.round(speedKmh)} km/h`;
}

/* -------------------------------------------------------------------------- */
/* Position on the schematic route                                            */
/* -------------------------------------------------------------------------- */

export type Direction = "up" | "down" | "unknown";

export interface RouteProjection {
  /** Index of the segment, 0 based, between stations[i] and stations[i + 1]. */
  segmentIndex: number;
  /** Fraction along that segment, 0 to 1. */
  t: number;
  /** Position on the whole route, 0 at the first station and 1 at the last. */
  routePosition: number;
  /** How far the raw position sits from the route line, in km. */
  offsetKm: number;
}

/**
 * Local flat frame in kilometres. Good enough over one route, and it keeps the
 * projection stable for the schematic line.
 */
function toLocalKm(point: LatLon, origin: LatLon): { x: number; y: number } {
  const latKm = 110.574;
  const lonKm = 111.32 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lon - origin.lon) * lonKm,
    y: (point.lat - origin.lat) * latKm,
  };
}

/**
 * Project a GPS position onto the station polyline.
 *
 * The segment that actually contains the position wins. Only when the
 * position sits past the end of the route does the closest segment win, so a
 * ferry between two stations is never snapped onto a different pair.
 */
export function projectOntoRoute(
  position: LatLon,
  stations: PreviewStation[],
): RouteProjection | null {
  if (stations.length < 2) return null;
  const origin = stations[0];
  if (!origin) return null;

  const p = toLocalKm(position, origin);
  let best: RouteProjection | null = null;
  let bestOutside: RouteProjection | null = null;

  for (let i = 0; i < stations.length - 1; i += 1) {
    const a = stations[i];
    const b = stations[i + 1];
    if (!a || !b) continue;

    const A = toLocalKm(a, origin);
    const B = toLocalKm(b, origin);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) continue;

    const raw = ((p.x - A.x) * dx + (p.y - A.y) * dy) / lengthSq;
    const t = Math.max(0, Math.min(1, raw));

    const projX = A.x + t * dx;
    const projY = A.y + t * dy;
    const offsetKm = Math.hypot(p.x - projX, p.y - projY);

    const projection: RouteProjection = {
      segmentIndex: i,
      t,
      routePosition: (i + t) / (stations.length - 1),
      offsetKm,
    };

    if (raw >= 0 && raw <= 1) {
      if (!best || offsetKm < best.offsetKm) best = projection;
    } else if (!bestOutside || offsetKm < bestOutside.offsetKm) {
      bestOutside = projection;
    }
  }

  return best ?? bestOutside;
}

/**
 * Compare the last two kept positions. Moving toward a higher station number
 * means heading up the route, toward a lower one means heading back.
 */
export function directionBetween(
  previous: number | null,
  next: number,
): Direction {
  if (previous === null) return "unknown";
  const delta = next - previous;
  if (Math.abs(delta) < 0.0005) return "unknown";
  return delta > 0 ? "up" : "down";
}

/** The index of the station the ferry is heading to. */
export function nextStationIndex(
  routePosition: number,
  direction: Direction,
  stationCount: number,
): number | null {
  const last = stationCount - 1;
  if (direction === "down") {
    const index = Math.ceil(routePosition) - 1;
    return index < 0 ? null : Math.max(0, Math.min(last, index));
  }
  const index = Math.floor(routePosition) + 1;
  if (index > last) return null;
  return index;
}

/**
 * The "Station 1 to Station 2" pair shown for a ferry.
 * `from` is the station it came from, `to` is the station it is heading to.
 */
export function routeEndpoints(
  routePosition: number,
  direction: Direction,
  segmentIndex: number,
  stationCount: number,
): { fromIndex: number; toIndex: number } {
  const last = stationCount - 1;
  if (direction === "down") {
    const from = Math.min(last, Math.max(0, Math.ceil(routePosition)));
    const to = Math.max(0, from - 1);
    return { fromIndex: from, toIndex: to };
  }
  if (direction === "up") {
    const from = Math.min(last, Math.max(0, Math.floor(routePosition)));
    const to = Math.min(last, from + 1);
    return { fromIndex: from, toIndex: to };
  }
  // No direction yet: show only the nearest segment.
  const from = Math.min(last, Math.max(0, segmentIndex));
  return { fromIndex: from, toIndex: Math.min(last, from + 1) };
}

/* -------------------------------------------------------------------------- */
/* The ferry view                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Everything the preview needs about one ferry, worked out from the raw
 * numbers: where it sits on the line, which way it is heading, how long until
 * it arrives and how many seats are free.
 */
export interface FerryView {
  ferry: PreviewFerry;
  /** Position on the route, 0 at the first station and 1 at the last. */
  routePosition: number | null;
  direction: Direction;
  fromStation: PreviewStation | null;
  toStation: PreviewStation | null;
  atStation: PreviewStation | null;
  /** "Station 1 to Station 2" */
  routeLabel: string;
  /** "Station 2 · 5 min", used inside the callout. */
  locationLabel: string;
  /**
   * The sentence that sits above the ferry icon.
   *
   * "Arrives Station 2 in 5 min" while the boat is on its way, "Now at
   * Station 2" while it is stopped. This is what an administrator used to
   * type in by hand as a trip status, and now it is worked out from the boat's
   * own last packet instead.
   */
  arrivalLabel: string;
  etaMinutes: number | null;
  etaText: string;
  seatsFree: number;
  seatsLabel: string;
  marker: "normal" | "stale" | "offline";
  stale: boolean;
  isLive: boolean;
  /** "Last known location, 3 min ago" when the ferry data is stale. */
  staleLabel: string | null;
  /** "3 min", the short form of the age, for the narrow callout card. */
  staleAge: string | null;
  /**
   * Why the boat is not drawn on the line. Null when it is on the line.
   *
   * The preview never hides a boat without saying why, because "where is it"
   * is the first question an administrator asks.
   */
  absenceReason: string | null;
}

export type PositionMap = Record<number, number>;

function nearestStation(
  position: LatLon,
  stations: PreviewStation[],
): PreviewStation | null {
  let best: PreviewStation | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const station of stations) {
    const distance = haversineKm(position, station);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = station;
    }
  }
  return best;
}

/**
 * Work out the view of every ferry.
 *
 * `previousPositions` is the route position each ferry had on the last
 * reading, so the direction can be told from the movement.
 */
export function computeFerryViews(
  ferries: PreviewFerry[],
  stations: PreviewStation[],
  previousPositions: PositionMap = {},
  now: number = Date.now(),
  staleSeconds: number = STALE_SECONDS,
): { views: FerryView[]; positions: PositionMap } {
  const positions: PositionMap = {};

  const views = ferries.map((ferry): FerryView => {
    const marker = markerState(ferry.status, ferry.receivedAt, now, staleSeconds);
    const stale = freshnessOf(ferry.receivedAt, now, staleSeconds) === "stale";
    const offline = ferry.status === "OFFLINE";
    const hasPosition = ferry.lat !== null && ferry.lon !== null;

    const projection = hasPosition
      ? projectOntoRoute({ lat: ferry.lat as number, lon: ferry.lon as number }, stations)
      : null;

    const routePosition = projection ? projection.routePosition : null;
    if (routePosition !== null) positions[ferry.id] = routePosition;

    const direction = directionBetween(
      previousPositions[ferry.id] ?? null,
      routePosition ?? previousPositions[ferry.id] ?? 0,
    );

    const segmentIndex = projection?.segmentIndex ?? 0;
    const endpoints = routeEndpoints(
      routePosition ?? 0,
      direction,
      segmentIndex,
      stations.length,
    );

    const fromStation = stations[endpoints.fromIndex] ?? null;
    const toStation = stations[endpoints.toIndex] ?? null;

    // A boat that is not moving is stopped. The status says so, because the
    // database works it out from the last packet the boat sent.
    const stopped = ferry.status === "DOCKED";
    const atStation =
      stopped && hasPosition
        ? nearestStation({ lat: ferry.lat as number, lon: ferry.lon as number }, stations)
        : null;

    // The ETA only makes sense while the boat is moving toward a station.
    let eta: number | null = null;
    let etaText = "—";
    let nextStation: PreviewStation | null = null;

    if (stopped && atStation) {
      etaText = "At station";
    } else if (!offline && !stale && hasPosition && toStation) {
      const index = nextStationIndex(routePosition ?? 0, direction, stations.length);
      nextStation = index === null ? null : (stations[index] ?? null);
      const distance = haversineKm(
        { lat: ferry.lat as number, lon: ferry.lon as number },
        nextStation ?? toStation,
      );
      eta = etaMinutes(distance, ferry.speed);
      etaText = formatEta(eta);
    }

    const routeLabel =
      stopped && atStation
        ? `Docked at ${atStation.name}`
        : fromStation && toStation
          ? `${fromStation.name} to ${toStation.name}`
          : "";

    const locationLabel =
      stopped && atStation
        ? `${atStation.name} · At station`
        : nextStation
          ? `${nextStation.name} · ${etaText}`
          : fromStation && toStation
            ? `${fromStation.name} to ${toStation.name}`
            : "";

    /*
     * The sentence that sits above the ferry icon.
     *
     * It answers the only question that matters at the dock: when does the
     * boat get here? The number comes from the boat's own last packet, so it
     * is an estimate, and the sentence says so rather than promising a time.
     * When there is nothing to promise, it says that instead of guessing.
     */
    const age = ageSeconds(ferry.receivedAt, now);
    let arrivalLabel: string;

    if (!ferry.inOperation) {
      arrivalLabel = "Out of service";
    } else if (!hasPosition || ferry.receivedAt === null) {
      arrivalLabel = "Waiting for its first GPS packet";
    } else if (stale) {
      arrivalLabel = `Last seen ${describeAgeShort(age)}`;
    } else if (atStation) {
      arrivalLabel = `Now at ${atStation.name}`;
    } else if (nextStation && eta !== null) {
      arrivalLabel =
        eta < 1
          ? `Arriving at ${nextStation.name} now`
          : `Arrives ${nextStation.name} in ${etaText}`;
    } else if (nextStation) {
      arrivalLabel = `Heading to ${nextStation.name}`;
    } else if (fromStation && toStation) {
      arrivalLabel = `${fromStation.name} to ${toStation.name}`;
    } else {
      arrivalLabel = "On the route";
    }

    // Why this boat is not on the line, said out loud.
    let absenceReason: string | null = null;
    if (!ferry.inOperation) {
      absenceReason = "Out of service · hidden from the passenger site";
    } else if (offline) {
      absenceReason = "Out of service";
    } else if (!hasPosition) {
      absenceReason = "No GPS position yet";
    } else if (routePosition === null) {
      absenceReason = stations.length < 2 ? "Not enough stations on the route" : "No position on the route";
    }

    return {
      ferry,
      routePosition,
      direction,
      fromStation,
      toStation,
      atStation,
      routeLabel,
      locationLabel,
      arrivalLabel,
      etaMinutes: eta,
      etaText,
      seatsFree: ferry.seatsAvailable,
      seatsLabel: offline ? "Unavailable" : `${ferry.seatsAvailable} seats available`,
      marker,
      stale,
      isLive: marker === "normal",
      staleLabel: stale ? `Last known location, ${describeAge(age)}` : null,
      staleAge: stale ? describeAgeShort(age) : null,
      absenceReason,
    };
  });

  return { views, positions };
}

/* -------------------------------------------------------------------------- */
/* The ferry colours                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The identity colour of a boat.
 *
 * The colour is kept on the boat row in the database, so the console and the
 * passenger website always draw the same boat in the same colour, and a boat
 * keeps its colour even while it is out of service. The palette itself lives
 * in the shared package, so the two sides cannot drift apart.
 */

export function ferryColor(ferry: {
  id: number;
  color?: string | null;
}): { hex: string; textHex: string; darkHex: string; label: string; name: string } {
  const name = ferryColorOf(ferry);
  return { ...FERRY_COLOR_VALUES[name], name };
}

/* -------------------------------------------------------------------------- */
/* Layout helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Keep a number inside a range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * How wide a station name is drawn, in pixels.
 *
 * The names under the dots are the first thing to overlap when there are many
 * stations, so the diagram needs to know how much room one name takes before
 * it can decide to shorten it.
 */
export function estimateLabelWidth(name: string, fontSize = 11): number {
  // The average letter of the system font is about half its size.
  return name.length * fontSize * 0.56 + 10;
}
