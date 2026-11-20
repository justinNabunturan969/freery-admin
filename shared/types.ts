/**
 * The data contract shared by the public website, the read-only API and the
 * admin app. Changing anything here changes all three.
 */

/**
 * The three states a boat can be in.
 *
 * The status is worked out from the boat's own data by the database, so it
 * cannot be set by an administrator. A boat that is out of the fleet is
 * OFFLINE, a boat that is not moving is DOCKED, and a boat that is moving is
 * IN_TRANSIT. There is no "boarding" and no "delayed", because nobody at the
 * station can know those things while the boat is on its way.
 */
export type FerryStatus = "DOCKED" | "IN_TRANSIT" | "OFFLINE";

export interface Ferry {
  id: number;
  name: string;
  status: FerryStatus;
  lat: number | null;
  lon: number | null;
  /** km/h */
  speed: number | null;
  seatsAvailable: number;
  capacity: number;
  /** ISO timestamp of the last GPS packet */
  receivedAt: string | null;
  /**
   * The identity colour of the boat, a name from `FERRY_COLOR_NAMES`.
   *
   * The colour is on the boat itself, so it never moves to another boat and
   * it stays the same while the boat is out of service.
   */
  color: string | null;
}

export interface FerriesResponse {
  servedAt: string;
  ferries: Ferry[];
}

export interface Station {
  id: number;
  name: string;
  lat: number;
  lon: number;
  order: number;
  isOpen: boolean;
  notice: string | null;
}

export interface StationsResponse {
  stations: Station[];
}

export type PassengerType = "STUDENT" | "REGULAR" | "SENIOR" | "PWD";

/**
 * The two kinds of account in the admin app.
 *
 * ADMIN is the master administrator: the only account that opens the admin
 * console, changes the ferries and the stations, and manages the accounts of
 * the station administrators. STAFF is a station administrator: it counts
 * passengers at its own station on the phone app and reads everything else.
 */
export type UserRole = "ADMIN" | "STAFF";

export const PASSENGER_TYPES: PassengerType[] = [
  "STUDENT",
  "REGULAR",
  "SENIOR",
  "PWD",
];

export const PASSENGER_TYPE_LABELS: Record<PassengerType, string> = {
  STUDENT: "Student",
  REGULAR: "Regular passenger",
  SENIOR: "Senior",
  PWD: "Person with disability",
};

export const STATUS_LABELS: Record<FerryStatus, string> = {
  DOCKED: "Docked",
  IN_TRANSIT: "Underway",
  OFFLINE: "Out of service",
};
