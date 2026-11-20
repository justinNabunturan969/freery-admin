/**
 * The counter rules.
 *
 * The count cannot go below zero or above the capacity, each tap carries a
 * unique client id so a retry does not count twice, and staff can only
 * count at their own station.
 */

export type RuleResult = { ok: true } | { ok: false; status: number; message: string };

/**
 * The seats available after a passenger gets on or off.
 *
 * The delta is a change in the number of passengers, not a change in the
 * number of free seats. A passenger boarding takes a seat, so the free
 * seats go down.
 */
export function seatsAfterDelta(
  seatsAvailable: number,
  passengerDelta: number,
  capacity: number,
): RuleResult & { seats?: number } {
  const aboardNow = capacity - seatsAvailable;
  const aboardNext = aboardNow + passengerDelta;

  if (aboardNext < 0) {
    return { ok: false, status: 409, message: "There is nobody aboard to remove" };
  }
  if (aboardNext > capacity) {
    return { ok: false, status: 409, message: "The ferry is already at capacity" };
  }
  return { ok: true, seats: capacity - aboardNext };
}

/** Staff can only count at their own station. */
export function canCountAtStation(
  userStationId: number | null,
  eventStationId: number,
): RuleResult {
  if (userStationId === null) {
    return { ok: false, status: 403, message: "This account is not assigned to a station" };
  }
  if (userStationId !== eventStationId) {
    return { ok: false, status: 403, message: "You can only count at your own station" };
  }
  return { ok: true };
}
