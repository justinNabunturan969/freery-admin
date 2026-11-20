/**
 * The ferry identity colours.
 *
 * A boat keeps one colour for as long as it is in the fleet, so a passenger
 * can tell the boats apart at a glance without reading a name. The console
 * hands a new boat the first colour nobody is using, and the database keeps
 * that colour on the ferry row, so a colour never moves from one boat to
 * another and a boat keeps its colour even while it is out of service.
 *
 * The colours are deliberately far apart from each other and from the brand
 * teal, so no boat can be mistaken for the interface itself.
 *
 * The passenger website keeps its own copy of the same palette in
 * `apps/public-web/lib/constants.ts`, because that app is deployed on its
 * own and does not share this package. The two copies have to agree on the
 * names, and the database refuses any colour that is not on the list.
 */

export const FERRY_COLOR_NAMES = [
  "orange",
  "purple",
  "green",
  "gray",
  "blue",
  "pink",
] as const;

export type FerryColorName = (typeof FERRY_COLOR_NAMES)[number];

export interface FerryColorValue {
  /** The solid colour, for the markers, the icons and the seat bars. */
  hex: string;
  /** A darker step of the same hue, for the colour carrying words on white. */
  textHex: string;
  /** A lighter step of the same hue, for the dark landing preview card. */
  darkHex: string;
  /** The name a passenger reads. Colour is never the only clue. */
  label: string;
}

export const FERRY_COLOR_VALUES: Record<FerryColorName, FerryColorValue> = {
  orange: {
    hex: "#C2611C",
    textHex: "#9C4A0B",
    darkHex: "#F0A868",
    label: "Orange",
  },
  purple: {
    hex: "#7C3AED",
    textHex: "#6D28D9",
    darkHex: "#C4A5FB",
    label: "Purple",
  },
  green: {
    hex: "#0E9F6E",
    textHex: "#07805A",
    darkHex: "#4ADE9E",
    label: "Green",
  },
  gray: {
    hex: "#64748B",
    textHex: "#556274",
    darkHex: "#CBD5E1",
    label: "Gray",
  },
  blue: {
    hex: "#1D4ED8",
    textHex: "#1E40AF",
    darkHex: "#93C5FD",
    label: "Blue",
  },
  pink: {
    hex: "#BE185D",
    textHex: "#9D174D",
    darkHex: "#F9A8D4",
    label: "Pink",
  },
};

/** Whether a string is one of the colours on the list. */
export function isFerryColorName(value: unknown): value is FerryColorName {
  return (
    typeof value === "string" &&
    (FERRY_COLOR_NAMES as readonly string[]).includes(value)
  );
}

/**
 * The first colour nobody is using.
 *
 * The colours are handed out in the order of the list, so the fleet keeps the
 * colours of the reference screens: the first boat is orange, the second
 * purple, the third green, the fourth gray, and the two after that blue and
 * pink. A boat that is removed frees its colour for the next one.
 *
 * When every colour is already in use the fleet is bigger than the palette,
 * so the first colour is repeated. A boat with no colour at all would be
 * worse than two boats sharing one.
 */
export function pickFreeFerryColor(
  used: readonly (string | null | undefined)[],
): FerryColorName {
  const taken = new Set(
    used.filter((value): value is string => typeof value === "string"),
  );
  const free = FERRY_COLOR_NAMES.find((name) => !taken.has(name));
  return free ?? FERRY_COLOR_NAMES[0];
}

/**
 * The colour of one ferry.
 *
 * The colour is read from the database. A boat with no colour on its row is
 * a boat that was added before the colour existed, so it falls back to the
 * old rule of counting through the palette, which is the best that can be
 * done without changing the data.
 */
export function ferryColorOf(
  ferry: { id: number; color?: string | null },
): FerryColorName {
  if (isFerryColorName(ferry.color)) return ferry.color;
  const index = ((ferry.id - 1) % FERRY_COLOR_NAMES.length + FERRY_COLOR_NAMES.length) %
    FERRY_COLOR_NAMES.length;
  return FERRY_COLOR_NAMES[index] ?? "gray";
}

/** The values of one colour. */
export function ferryColorValues(name: FerryColorName): FerryColorValue {
  return FERRY_COLOR_VALUES[name];
}
