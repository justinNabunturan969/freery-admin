/**
 * The accuracy of a GPS receiver, worked out from its own recorded positions.
 *
 * This is the measurement the researchers take on the bench: the accuracy of the
 * GPS inside the receiver, not where a boat is on the route.
 *
 * The steps are always the same.
 *
 *   1. Take the positions the receiver recorded, in the order they arrived.
 *   2. Measure every position against the place the receiver really is. That
 *      place is marked by the researcher on the map, and it is the ground
 *      truth. The distance is the **error** of the fix.
 *   3. Measure the **spread** of the positions around each other. It needs no
 *      ground truth, and it is the noise the receiver makes on its own.
 *   4. Summarise the errors: the mean, the median (CEP50), the 95th percentile
 *      (CEP95), the worst point and the root mean square.
 *
 * Nothing here reads the database or the clock, so the page, the API and the
 * export all work from the same numbers.
 */

import {
  errorStats,
  haversineMetres,
  legMetres,
  offsetMetres,
  percentile,
  type ErrorStats,
  type LatLon,
} from "./geo";

/** One position, as the receiver recorded it. */
export interface ReceiverFix {
  id: number;
  /** The receiver that produced it. */
  deviceId: string | null;
  lat: number;
  lon: number;
  speed: number;
  seq: number;
  rssi: number | null;
  snr: number | null;
  hdop: number | null;
  sats: number | null;
  receivedAt: string;
}

/** A fix with its error against the marked true position. */
export interface MeasuredFix extends ReceiverFix {
  /** The distance from this fix to the marked true position, in metres. */
  errorM: number | null;
}

/**
 * Where the receiver really is.
 *
 * The researcher stands the receiver at a place whose position they know and
 * marks it on the map. Every fix is then measured against this point.
 */
export interface ReferencePoint extends LatLon {
  label: string;
}

/** The receiver's own state, the last thing it reported. */
export interface ReceiverState {
  deviceId: string;
  lat: number | null;
  lon: number | null;
  speed: number | null;
  hdop: number | null;
  sats: number | null;
  rssi: number | null;
  snr: number | null;
  lastSeq: number;
  lastSeenAt: string | null;
  /** How many positions this receiver has sent. */
  fixCount: number;
}

/**
 * How far the positions are from each other.
 *
 * This is the noise the receiver makes, and it needs no ground truth. Read it
 * as the accuracy of the GPS only when the receiver is standing still.
 */
export interface Scatter {
  /** How many positions the spread was worked out from. */
  count: number;
  /** The root mean square of the distance from the positions to their centre. */
  rmsRadiusM: number | null;
  /** The radius that 95 per cent of the positions are inside. */
  radius95M: number | null;
  /** The largest distance between any two positions, in metres. */
  extentM: number | null;
}

/** What the receiver said about its own fixes. */
export interface FixQuality {
  /** The positions that carried the receiver's own quality numbers. */
  pointsWithQuality: number;
  /** The positions that did not, because the unit was flashed before them. */
  pointsWithoutQuality: number;
  averageHdop: number | null;
  worstHdop: number | null;
  averageSats: number | null;
  /** The positions the receiver itself would call poor. */
  poorFixes: number;
}

export interface QualityFilter {
  /** Positions with an HDOP above this are left out. */
  maxHdop?: number | null;
  /** Positions with fewer satellites than this are left out. */
  minSats?: number | null;
}

/**
 * The horizontal error the receiver asks for, in metres, from its own HDOP.
 *
 * The HDOP is the receiver's own statement about how good the geometry of the
 * satellites is. Multiplying it by the receiver error, which is about a metre
 * for a good GPS receiver, gives the horizontal error the receiver expects.
 * The assumption is stated on the page, because a number without its
 * assumption is not a measurement.
 */
export const UERE_METRES = 1;

export function estimatedAccuracyM(hdop: number | null): number | null {
  if (hdop === null) return null;
  return hdop * UERE_METRES;
}

/**
 * The distance from a fix to the marked true position, in metres.
 *
 * It is null when the researcher has not marked the true position yet, which
 * is the honest answer rather than a zero that would look like a perfect fix.
 */
export function errorToReferenceM(
  fix: LatLon,
  reference: ReferencePoint | null,
): number | null {
  if (!reference) return null;
  return haversineMetres(fix, reference);
}

/**
 * Leaves out the positions the receiver itself was not happy with.
 *
 * A position with no quality numbers at all is kept, because there is nothing
 * to judge it by. Dropping every position from a unit that was flashed before
 * the quality numbers were added would throw the whole trace away.
 */
export function applyQualityFilter(
  fixes: ReceiverFix[],
  filter: QualityFilter,
): { kept: ReceiverFix[]; dropped: number } {
  const maxHdop = filter.maxHdop ?? null;
  const minSats = filter.minSats ?? null;

  if (maxHdop === null && minSats === null) {
    return { kept: fixes, dropped: 0 };
  }

  const kept: ReceiverFix[] = [];
  let dropped = 0;

  for (const fix of fixes) {
    const hdopTooBig = maxHdop !== null && fix.hdop !== null && fix.hdop > maxHdop;
    const tooFewSatellites = minSats !== null && fix.sats !== null && fix.sats < minSats;

    if (hdopTooBig || tooFewSatellites) {
      dropped += 1;
      continue;
    }
    kept.push(fix);
  }

  return { kept, dropped };
}

/**
 * How far the positions are from each other.
 *
 * The centre of the positions is worked out first, and every position is then
 * measured from it. The extent is the largest distance between any two
 * positions.
 */
export function scatterStats(fixes: LatLon[]): Scatter {
  if (fixes.length === 0) {
    return { count: 0, rmsRadiusM: null, radius95M: null, extentM: null };
  }

  const first = fixes[0];
  if (!first) {
    return { count: 0, rmsRadiusM: null, radius95M: null, extentM: null };
  }

  /* The centre of the positions, in the flat plane around the first one. */
  let eastSum = 0;
  let northSum = 0;
  const offsets = fixes.map((fix) => {
    const offset = offsetMetres(first, fix);
    eastSum += offset.east;
    northSum += offset.north;
    return offset;
  });

  const centreEast = eastSum / fixes.length;
  const centreNorth = northSum / fixes.length;

  const radii = offsets.map(
    (offset) => Math.hypot(offset.east - centreEast, offset.north - centreNorth),
  );
  const sortedRadii = [...radii].sort((a, b) => a - b);

  let extentM = 0;
  for (const radius of radii) {
    if (radius > extentM) extentM = radius;
  }

  const squares = radii.reduce((total, value) => total + value * value, 0);

  return {
    count: fixes.length,
    rmsRadiusM: Math.sqrt(squares / radii.length),
    radius95M: percentile(sortedRadii, 95),
    extentM: extentM * 2,
  };
}

/**
 * What the receiver said about its own fixes.
 *
 * A fix with an HDOP over 5.0 or fewer than four satellites is one the
 * receiver itself would call poor. Those positions stay in the trace, because
 * the position is still a position, but they are counted here so the reader
 * knows how much of the trace was recorded in doubt.
 */
export function fixQuality(fixes: ReceiverFix[]): FixQuality {
  let pointsWithQuality = 0;
  let pointsWithoutQuality = 0;
  let hdopSum = 0;
  let hdopCount = 0;
  let worstHdop: number | null = null;
  let satsSum = 0;
  let satsCount = 0;
  let poorFixes = 0;

  for (const fix of fixes) {
    const hdop = fix.hdop;
    const sats = fix.sats;
    const hasHdop = hdop !== null;
    const hasSats = sats !== null;

    if (hasHdop || hasSats) {
      pointsWithQuality += 1;
    } else {
      pointsWithoutQuality += 1;
    }

    if (hdop !== null) {
      hdopSum += hdop;
      hdopCount += 1;
      if (worstHdop === null || hdop > worstHdop) {
        worstHdop = hdop;
      }
    }

    if (sats !== null) {
      satsSum += sats;
      satsCount += 1;
    }

    const badHdop = hdop !== null && hdop > 5;
    const fewSatellites = sats !== null && sats < 4;
    if (badHdop || fewSatellites) poorFixes += 1;
  }

  return {
    pointsWithQuality,
    pointsWithoutQuality,
    averageHdop: hdopCount ? hdopSum / hdopCount : null,
    worstHdop,
    averageSats: satsCount ? satsSum / satsCount : null,
    poorFixes,
  };
}

export interface ReceiverAnalysis {
  /** The positions of the receiver, with the error against the true position. */
  fixes: MeasuredFix[];
  /** The place the researcher marked, when there is one. */
  reference: ReferencePoint | null;
  /** The summary of the errors against the marked true position. */
  stats: ErrorStats | null;
  /** How far the positions are from each other. */
  scatter: Scatter;
  /** What the receiver said about its own fixes. */
  quality: FixQuality;
  /** The middle gap between two positions, in seconds. */
  samplingIntervalS: number | null;
  /** The middle difference between the reported speed and the speed the positions imply. */
  medianSpeedErrorKmh: number | null;
  /** The root mean square of the speed difference. */
  speedRmseKmh: number | null;
  /** The length of the trace, in metres. */
  totalDistanceM: number;
  /** The horizontal error the receiver asks for, from its own HDOP. */
  estimatedAccuracyM: number | null;
  /** How many positions the quality filter left out. */
  droppedPoints: number;
}

/**
 * The whole analysis of one receiver.
 *
 * The quality filter is applied first, so every figure below is worked out from
 * the positions that were kept.
 */
export function analyseReceiver({
  fixes,
  reference,
  filter = {},
}: {
  fixes: ReceiverFix[];
  reference: ReferencePoint | null;
  filter?: QualityFilter;
}): ReceiverAnalysis {
  const { kept, dropped } = applyQualityFilter(fixes, filter);

  const measured: MeasuredFix[] = kept.map((fix) => ({
    ...fix,
    errorM: errorToReferenceM(fix, reference),
  }));

  const errors = measured
    .map((fix) => fix.errorM)
    .filter((value): value is number => value !== null);

  /* The gaps between the positions, and the speed the positions imply. */
  const intervals: number[] = [];
  const speedErrors: number[] = [];
  let distanceM = 0;

  for (let index = 1; index < measured.length; index += 1) {
    const previous = measured[index - 1];
    const fix = measured[index];
    if (!previous || !fix) continue;

    const seconds =
      (new Date(fix.receivedAt).getTime() -
        new Date(previous.receivedAt).getTime()) /
      1000;

    distanceM += legMetres(previous, fix);

    if (seconds <= 0) continue;
    intervals.push(seconds);

    const computedKmh = (legMetres(previous, fix) / seconds) * 3.6;
    speedErrors.push(Math.abs(fix.speed - computedKmh));
  }

  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const sortedSpeedErrors = [...speedErrors].sort((a, b) => a - b);

  const hdops = measured
    .map((fix) => fix.hdop)
    .filter((value): value is number => value !== null);
  const averageHdop = hdops.length
    ? hdops.reduce((sum, value) => sum + value, 0) / hdops.length
    : null;

  return {
    fixes: measured,
    reference,
    stats: errorStats(errors),
    scatter: scatterStats(measured),
    quality: fixQuality(measured),
    samplingIntervalS: sortedIntervals.length
      ? percentile(sortedIntervals, 50)
      : null,
    medianSpeedErrorKmh: sortedSpeedErrors.length
      ? percentile(sortedSpeedErrors, 50)
      : null,
    speedRmseKmh: sortedSpeedErrors.length
      ? Math.sqrt(
          sortedSpeedErrors.reduce((total, value) => total + value * value, 0) /
            sortedSpeedErrors.length,
        )
      : null,
    totalDistanceM: distanceM,
    estimatedAccuracyM: estimatedAccuracyM(averageHdop),
    droppedPoints: dropped,
  };
}
