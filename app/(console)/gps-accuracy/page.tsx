import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The old address of the GPS page.
 *
 * The page is now the receiver bench, at `/gps-test`. The old address still
 * works, so a bookmark or a link from an earlier note does not break.
 */
export default async function GpsAccuracyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const query = new URLSearchParams();
  for (const key of ["hours", "maxHdop", "minSats"]) {
    const value = params[key];
    const text = Array.isArray(value) ? value[0] : value;
    if (text) query.set(key, text);
  }

  const target = query.toString();
  redirect(target ? `/gps-test?${target}` : "/gps-test");
}
