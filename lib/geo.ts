/**
 * The distance maths for the receiver bench.
 *
 * Everything here is plain arithmetic on numbers, with no database and no
 * browser, so the same figures come out of the page, the API and the export.
 *
 * Two distances matter on this page, and they are different things:
 *
 *   - the **error**: how far a recorded position is from the place the receiver
 *     really is. The researcher marks that place once, on the map, and the page
 *     measures every fix against it. This is the accuracy of the GPS.
 *   - the **spread**: how far the recorded positions are from each other. It
 *     needs no ground truth at all, and it is the noise the receiver makes.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/** The mean radius of the earth, in metres. */
const EARTH_RADIUS_M = 6371008.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * The distance between two places, in metres.
 *
 * The haversine formula, which is the right one for the short distances a
 * receiver on the bench or a boat on the route covers.
 */
export function haversineMetres(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * How far one place is east and north of another, in metres.
 *
 * Over the length of a bench test or a short walk this flat projection is the
 * same as the earth being round, and it is far easier to work with than angles.
 */
export function offsetMetres(
  from: LatLon,
  to: LatLon,
): { east: number; north: number } {
  return {
    east:
      toRadians(to.lon - from.lon) *
      EARTH_RADIUS_M *
      Math.cos(toRadians(from.lat)),
    north: toRadians(to.lat - from.lat) * EARTH_RADIUS_M,
  };
}

/**
 * A percentile of a list of numbers.
 *
 * The list has to be sorted first. The value is worked out by straight line
 * between the two neighbours, which is what a spreadsheet does as well.
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return Number.NaN;
  const only = sortedValues[0];
  if (sortedValues.length === 1) return only ?? Number.NaN;

  const rank = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedValues[lower] ?? Number.NaN;

  const low = sortedValues[lower];
  const high = sortedValues[upper];
  if (low === undefined || high === undefined) return Number.NaN;

  return low + (rank - lower) * (high - low);
}

/**
 * The summary of a set of errors, in metres.
 *
 *   mean    the average error
 *   median  the middle error, the same as the CEP50
 *   cep50   the radius that half the points are inside, the 50th percentile
 *   cep95   the radius that 95 per cent of the points are inside
 *   max     the worst error
 *   rmse    the root mean square, which punishes the worst errors
 *
 * The CEP figures are the ones the GPS literature uses, so they are named as
 * well as computed. The median is the CEP50 and the 95th percentile is the
 * CEP95, because that is what those names mean.
 */
export interface ErrorStats {
  count: number;
  mean: number;
  median: number;
  cep50: number;
  cep95: number;
  max: number;
  rmse: number;
}

export function errorStats(errors: number[]): ErrorStats | null {
  if (errors.length === 0) return null;

  const sorted = [...errors].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const squares = sorted.reduce((total, value) => total + value * value, 0);
  const p95 = percentile(sorted, 95);
  const worst = sorted[sorted.length - 1] ?? 0;

  return {
    count: sorted.length,
    mean: sum / sorted.length,
    median: percentile(sorted, 50),
    cep50: percentile(sorted, 50),
    cep95: p95,
    max: worst,
    rmse: Math.sqrt(squares / sorted.length),
  };
}

/**
 * The distance from one point to another, going the short way round the
 * earth.
 *
 * Used for the legs of a trace, where the two points are seconds apart.
 */
export function legMetres(from: LatLon, to: LatLon): number {
  return haversineMetres(from, to);
}
