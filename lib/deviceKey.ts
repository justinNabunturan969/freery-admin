import { timingSafeEqual } from "node:crypto";

/**
 * The device API key check for the GPS ingest route.
 *
 * The port station sends the key in a header. The key lives in a server side
 * environment variable and is never part of any public code path.
 */
export function deviceKeyMatches(candidate: string | null | undefined): boolean {
  const expected = Buffer.from(process.env.DEVICE_API_KEY ?? "");
  const given = Buffer.from(candidate ?? "");
  if (expected.length === 0 || expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
