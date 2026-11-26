import { z } from "zod";

/**
 * Runtime validation. Every request body and every API response is checked
 * here before it reaches the UI or the database.
 */

/**
 * The three states a boat can be in.
 *
 * The database works the status out from the boat's own data, so this is a
 * check on what comes back, not something an administrator can choose.
 */
export const ferryStatusSchema = z.enum(["DOCKED", "IN_TRANSIT", "OFFLINE"]);

export const ferrySchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  status: ferryStatusSchema,
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  speed: z.number().min(0).nullable(),
  seatsAvailable: z.number().int().min(0),
  capacity: z.number().int().min(1),
  receivedAt: z.string().nullable(),
  /**
   * The identity colour of the boat. It is a name from the palette, and the
   * database only accepts a colour that is on the list.
   */
  color: z.string().nullable().optional(),
});

export const ferriesResponseSchema = z.object({
  servedAt: z.string(),
  ferries: z.array(ferrySchema),
});

export const stationSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  order: z.number().int(),
  isOpen: z.boolean(),
  notice: z.string().nullable(),
});

export const stationsResponseSchema = z.object({
  stations: z.array(stationSchema),
});

export const passengerTypeSchema = z.enum([
  "STUDENT",
  "REGULAR",
  "SENIOR",
  "PWD",
]);

/* --- Admin payloads ------------------------------------------------------ */

export const updateFerrySchema = z.object({
  id: z.number().int().positive(),
  capacity: z.number().int().min(1).max(500).optional(),
  inOperation: z.boolean().optional(),
  /** Manual seat correction. A reason is required whenever it is used. */
  seatsAvailable: z.number().int().min(0).max(500).optional(),
  reason: z.string().trim().min(3).max(300).optional(),
});

export const updateStationSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(80).optional(),
  isOpen: z.boolean().optional(),
  notice: z.string().trim().max(300).nullable().optional(),
  operatingHours: z.string().trim().max(120).optional(),
  boardingInfo: z.string().trim().max(400).optional(),
});

/**
 * A new ferry.
 *
 * The console fills in the rest: the boat starts at the first station on the
 * route, so it is on the line straight away, and it is given an identity
 * colour that nobody else is using. It can be put out of service straight
 * away, which keeps it off the passenger site.
 *
 * There is no trip status here. The database works it out from the boat's
 * own packets, so nobody has to guess it.
 */
export const createFerrySchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Defaults to 40, the capacity assumed by the study. */
  capacity: z.number().int().min(1).max(500).optional(),
  /** Free seats when the ferry is added. Defaults to the capacity. */
  seatsAvailable: z.number().int().min(0).max(500).optional(),
  /** Whether the ferry shows on the passenger site straight away. */
  inOperation: z.boolean().optional(),
});

/**
 * A new station.
 *
 * The position is needed because the route diagram projects the ferries onto
 * the line between the stations. The route has not been surveyed yet, so the
 * console offers the next point on the example line as the starting value.
 */
export const createStationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  operatingHours: z.string().trim().max(120).optional(),
  boardingInfo: z.string().trim().max(400).optional(),
  /** Defaults to open. */
  isOpen: z.boolean().optional(),
});

/**
 * The accounts.
 *
 * The admin app is private to the station network, so an account is a
 * username and a password. There is no email address and no password reset by
 * mail: the master administrator hands the password over.
 */
export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "The username may only use letters, numbers, dot, dash and underscore"),
  name: z.string().trim().min(1).max(80),
  role: z.enum(["ADMIN", "STAFF"]),
  stationId: z.number().int().positive().nullable().optional(),
  password: z.string().min(8).max(200),
});

export const updateUserSchema = z.object({
  id: z.number().int().positive(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "The username may only use letters, numbers, dot, dash and underscore")
    .optional(),
  name: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  stationId: z.number().int().positive().nullable().optional(),
  password: z.string().min(8).max(200).optional(),
});

/* --- Ingest and counter payloads ----------------------------------------- */

export const ingestSchema = z
  .object({
    /**
     * The boat the position belongs to, when it came from a boat on the route.
     *
     * It is optional: a receiver on the bench has no boat, and the researchers
     * measure that one on its own.
     */
    ferryId: z.number().int().positive().optional(),
    /**
     * The receiver that produced the position.
     *
     * This is what the bench measures. A packet from the port station carries
     * the name of the receiver under test, so a receiver that is connected on
     * its own appears on the map with a record of its own.
     */
    deviceId: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(
        /^[a-zA-Z0-9._-]+$/,
        "The receiver name may only use letters, numbers, dot, dash and underscore",
      )
      .optional(),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    speed: z.number().min(0).max(120),
    seq: z.number().int().nonnegative(),
    rssi: z.number().int().min(-150).max(0).optional(),
    snr: z.number().min(-30).max(50).optional(),
    /**
     * The receiver's own quality numbers.
     *
     * The first version of the radio packet had five fields and no quality
     * numbers, so these are optional. A packet without them is still stored; it
     * simply says nothing about how sure the receiver was.
     */
    hdop: z.number().min(0).max(50).optional(),
    sats: z.number().int().min(0).max(64).optional(),
  })
  .refine((packet) => packet.ferryId !== undefined || packet.deviceId !== undefined, {
    message: "A position has to name a boat or a receiver",
    path: ["deviceId"],
  });

/**
 * Where the researcher says the receiver really is.
 *
 * This is the ground truth the accuracy is measured against, so it is the
 * researcher's own mark and not something the system guesses.
 */
export const gpsReferenceSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "The receiver name may only use letters, numbers, dot, dash and underscore",
    ),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  label: z.string().trim().min(1).max(80),
});

export const counterEventSchema = z.object({  ferryId: z.number().int().positive(),
  passengerType: passengerTypeSchema,
  delta: z.union([z.literal(1), z.literal(-1)]),
  clientId: z.string().min(8).max(120),
  /**
   * Optional. The counter screen sends the station it is counting at, and
   * the server refuses it when it is not the signed in staff member's own
   * station.
   */
  stationId: z.number().int().positive().optional(),
});

/* --- The receiver's network ------------------------------------------------ */

/**
 * The name of a board that talks to the PC.
 *
 * The letters, numbers, dot, dash and underscore only. The name goes into a URL
 * and into the database, and it is printed on the console.
 */
export const stationNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "The name may only use letters, numbers, dot, dash and underscore",
  );

/**
 * The network a receiver is told to use.
 *
 * The master administrator types it into the console instead of editing the
 * sketch and flashing the board again.
 *
 * The password is the station's own Wi-Fi password. It goes into the database
 * so the board can be given it later, and it is never sent back to a browser.
 */
export const receiverNetworkSchema = z.object({
  stationId: stationNameSchema,
  ssid: z.string().trim().min(1).max(64),
  /** An open network has no password, so this one may be empty. */
  password: z.string().max(128),
});

/**
 * What the receiver says about the network it is on.
 *
 * "connected" is a normal connection, "failed" means it tried the network it
 * was given and could not get on it, and "setup" means the board is waiting
 * for someone to give it a network.
 */
export const deviceWifiSchema = z.object({
  ssid: z.string().max(64).optional(),
  status: z.enum(["connected", "failed", "setup"]).optional(),
  ip: z.string().max(45).optional(),
});

/**
 * What the receiver sends to the server when it asks for work.
 *
 * The board asks every few seconds whether it has been given a new network,
 * and says what its own network looks like at the same time. It never sends
 * the password of the network it is on.
 */
export const deviceLinkSchema = z.object({
  stationId: stationNameSchema,
  wifi: deviceWifiSchema.optional(),
});

/**
 * One receiver, as the console shows it.
 *
 * The password of the network is not here. The console never shows it again
 * after it has been typed.
 */
export const receiverRowSchema = z.object({
  stationId: z.string(),
  wifiSsid: z.string().nullable(),
  wifiStatus: z.enum(["connected", "failed", "setup"]).nullable(),
  wifiIp: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  /** The network the receiver is being asked to use, if there is one. */
  command: z
    .object({
      id: z.number().int(),
      ssid: z.string(),
      status: z.enum(["pending", "delivered", "connected", "failed", "cancelled"]),
      message: z.string().nullable(),
      createdAt: z.string(),
      deliveredAt: z.string().nullable(),
      answeredAt: z.string().nullable(),
    })
    .nullable(),
});

export const receiversResponseSchema = z.object({
  receivers: z.array(receiverRowSchema),
});

/* --- Admin passenger manifest correction ---------------------------------- */

/**
 * A correction of the passenger manifest at one station. It is a manual
 * override, so it always carries a reason and it is written to the audit
 * log by the acting account.
 */
export const passengerCorrectionSchema = z.object({
  ferryId: z.number().int().positive(),
  stationId: z.number().int().positive(),
  passengerType: passengerTypeSchema,
  onBoard: z.number().int().min(0).max(500),
  reason: z.string().trim().min(3).max(300),
  /**
   * When the boarding actually happened. It is optional, the server stamps
   * the event with the current time when it is left out.
   */
  occurredAt: z.string().datetime().optional(),
});
