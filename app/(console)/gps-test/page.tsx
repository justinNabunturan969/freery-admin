import { getGpsDevices, getReceiverAnalysis } from "@/lib/queries";
import {
  Card,
  CardHeader,
  Input,
  Select,
} from "@/components/ui/primitives";
import { PageHeader } from "@/components/admin/PageHeader";
import { GpsTest } from "@/components/gps/GpsTest";

export const dynamic = "force-dynamic";

/**
 * The receiver bench.
 *
 * This is the function the researchers use to measure the accuracy of the GPS
 * inside a receiver. They connect the receiver, it appears on the map, and the
 * page measures how far its positions are from the place the receiver really
 * is.
 *
 * There is no boat in this page. The measurement is about the receiver and the
 * GPS in it, so the page has no route, no stations and no boats. The only
 * ground truth it needs is the point the researcher marks on the map.
 *
 * The master administrator and the station administrator read the same page.
 */

const TIME_RANGES = [
  { value: "", label: "Everything" },
  { value: "1", label: "The last hour" },
  { value: "24", label: "The last 24 hours" },
  { value: "168", label: "The last 7 days" },
];

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default async function GpsTestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const askedDevice = first(params.deviceId).trim();
  const hours = numberOrNull(first(params.hours));
  const maxHdop = numberOrNull(first(params.maxHdop));
  const minSats = numberOrNull(first(params.minSats));

  const receivers = await getGpsDevices();

  /*
   * The receiver that is connected.
   *
   * It is the one the address names, and nothing is connected until the
   * reader names one. The page then waits for that receiver.
   */
  const deviceId = askedDevice || null;

  /*
   * The receiver on show.
   *
   * With nothing connected, it is the receiver that reported most recently, so
   * a receiver that is plugged in appears on the map by itself.
   */
  const onShowId = deviceId ?? receivers[0]?.deviceId ?? null;

  const analysis = onShowId
    ? await getReceiverAnalysis({ deviceId: onShowId, hours, maxHdop, minSats })
    : null;

  /* The filters travel with the exports, so a download is the same set of
     positions that is on the screen. */
  const query = new URLSearchParams();
  if (onShowId) query.set("deviceId", onShowId);
  if (hours !== null) query.set("hours", String(hours));
  if (maxHdop !== null) query.set("maxHdop", String(maxHdop));
  if (minSats !== null) query.set("minSats", String(minSats));

  const exportHref = (format: string) => {
    const withFormat = new URLSearchParams(query);
    withFormat.set("format", format);
    return `/api/admin/gps-test?${withFormat.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="GPS receiver test"
        description="The accuracy of the GPS inside the receiver. Connect a receiver and it appears on the map; mark where it really is and the page measures every position against that point."
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href={exportHref("csv")}
              className="inline-flex min-h-[40px] items-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Export the positions as CSV
            </a>
            <a
              href={exportHref("gpx")}
              className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-brand-300 hover:bg-brand-50"
            >
              Export the trace as GPX
            </a>
          </div>
        }
      />

      <Card className="mb-4">
        <CardHeader
          title="What to measure"
          description="Choose the period and how good a fix has to be."
        />
        <form
          method="get"
          action="/gps-test"
          className="grid gap-4 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {deviceId !== null ? (
            <input type="hidden" name="deviceId" value={deviceId} />
          ) : null}

          <div className="space-y-1.5">
            <label
              htmlFor="hours"
              className="block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted"
            >
              Period
            </label>
            <Select id="hours" name="hours" defaultValue={hours ?? ""}>
              {TIME_RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="maxHdop"
              className="block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted"
            >
              Worst HDOP
            </label>
            <Input
              id="maxHdop"
              name="maxHdop"
              type="number"
              step="0.1"
              min="0"
              max="50"
              placeholder="any"
              defaultValue={maxHdop ?? ""}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="minSats"
              className="block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted"
            >
              Fewest satellites
            </label>
            <Input
              id="minSats"
              name="minSats"
              type="number"
              step="1"
              min="0"
              max="64"
              placeholder="any"
              defaultValue={minSats ?? ""}
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Apply
            </button>
          </div>
        </form>
      </Card>

      <GpsTest
        deviceId={deviceId}
        hours={hours}
        initial={{
          receivers,
          deviceId,
          analysis,
        }}
      />
    </>
  );
}
