/**
 * The formatting helpers the operations pages share.
 *
 * The times are always written in Philippine time. The Philippines keeps one
 * time zone with no daylight saving, so the offset is a flat eight hours ahead
 * of UTC.
 *
 * The time is written out by hand instead of with toLocaleString, because
 * toLocaleString follows the language and the time zone of whatever machine
 * runs it. The server and the browser would then print different times, and
 * React would call that a hydration error.
 */

const MANILA_OFFSET_MINUTES = 8 * 60;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The date and the time in the Philippines, split into its parts. */
export function manilaParts(date: Date) {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MINUTES * 60_000);
  const hours = shifted.getUTCHours();
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    month: MONTHS[shifted.getUTCMonth()],
    day: shifted.getUTCDate(),
    hour: hours % 12 === 0 ? 12 : hours % 12,
    hour24: hours,
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    meridiem: hours >= 12 ? "PM" : "AM",
  };
}

/** The weekday of a moment in Philippine time. */
function manilaWeekday(date: Date): string {
  // January 1, 1970 was a Thursday, which is index 4 in the list above.
  const dayIndex = Math.floor(
    (date.getTime() + MANILA_OFFSET_MINUTES * 60_000) / 86_400_000,
  );
  const index = (((dayIndex + 4) % 7) + 7) % 7;
  return WEEKDAYS[index] ?? "Sun";
}

/** "2026-11-15", the format the date picker wants. */
export function manilaDateInput(date: Date): string {
  const parts = manilaParts(date);
  return `${parts.year}-${String(parts.monthIndex + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** "14:05", the format the time picker wants. */
export function manilaTimeInput(date: Date): string {
  const parts = manilaParts(date);
  return `${String(parts.hour24).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/**
 * A date and a time from the pickers into a moment in time.
 *
 * The pickers give the time in the Philippines, so the reading is taken as
 * Philippine time no matter which machine the browser is running on.
 */
export function manilaDateTimeToIso(date: string, time: string): string {
  const dateParts = date.split("-").map(Number);
  const timeParts = time.split(":").map(Number);
  const year = dateParts[0] ?? 0;
  const month = dateParts[1] ?? 1;
  const day = dateParts[2] ?? 1;
  const hour = timeParts[0] ?? 0;
  const minute = timeParts[1] ?? 0;
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return new Date().toISOString();
  }
  const utc =
    Date.UTC(year, month - 1, day, hour, minute, 0) -
    MANILA_OFFSET_MINUTES * 60_000;
  return new Date(utc).toISOString();
}

/** A timestamp as a date and time in the Philippines. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "not yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "not yet";
  const parts = manilaParts(date);
  const day = String(parts.day).padStart(2, "0");
  const hour = String(parts.hour).padStart(2, "0");
  const minute = String(parts.minute).padStart(2, "0");
  const second = String(parts.second).padStart(2, "0");
  return `${parts.month} ${day}, ${parts.year}, ${hour}:${minute}:${second} ${parts.meridiem}`;
}

/** "Sun, Nov 15, 2026" in the Philippines. */
export function formatDate(iso: string | null): string {
  if (!iso) return "not yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "not yet";
  const parts = manilaParts(date);
  return `${manilaWeekday(date)}, ${parts.month} ${parts.day}, ${parts.year}`;
}

/** The time of day in the Philippines, like "11:02 AM". */
export function formatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = manilaParts(date);
  const hour = String(parts.hour).padStart(2, "0");
  const minute = String(parts.minute).padStart(2, "0");
  return `${hour}:${minute} ${parts.meridiem}`;
}

/** "Sun, Nov 15, 2026 · 11:02 AM" */
export function operationsStamp(date: Date = new Date()): string {
  const iso = date.toISOString();
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

/** The address of the passenger website, shown in the header. */
export function passengerSiteUrl(): string {
  return process.env.PUBLIC_SITE_URL ?? "http://localhost:3000";
}
