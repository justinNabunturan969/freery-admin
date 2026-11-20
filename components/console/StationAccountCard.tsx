import { Card, CardHeader, Badge } from "@/components/ui/primitives";
import { StationPinIcon } from "@/components/ui/icons";

export interface StationAccountStation {
  id: number;
  name: string;
  /** The position of the station on the route, counting from 1. */
  order: number;
  isOpen: boolean;
  operatingHours: string | null;
  notice: string | null;
}

/**
 * The station the station administrator works at.
 *
 * It answers one question before anything else: which station am I working
 * at? The answer is the station's own name from the database, so renaming a
 * station on the console renames it here too, and the account holder is never
 * left counting at the wrong stop.
 *
 * It is an ordinary card, the same card as every other panel in the console,
 * and it reflows with the rest of the page.
 */
export function StationAccountCard({
  station,
  stationCount,
}: {
  station: StationAccountStation | null;
  /** How many stations are on the route. */
  stationCount: number;
}) {
  if (!station) {
    return (
      <Card>
        <CardHeader title="Your station" />
        <div className="px-5 py-4">
          <p className="text-sm font-semibold text-ink-strong">
            Not tied to one station
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            This account is not tied to one station, so it can count at any stop
            on the route. The master administrator can set a station on the
            Accounts page of the console.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Your station"
        action={
          <Badge tone={station.isOpen ? "good" : "bad"}>
            {station.isOpen ? "Open" : "Closed"}
          </Badge>
        }
      />
      <div className="px-5 py-4">
        <p className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink-strong">
          <StationPinIcon className="h-5 w-5 shrink-0 text-brand-500" />
          <span className="truncate">{station.name}</span>
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-xs">
          <div>
            <dt className="font-semibold uppercase tracking-[0.08em] text-ink-faint">
              On the route
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-ink-strong">
              Stop {station.order} of {stationCount}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-[0.08em] text-ink-faint">
              Hours
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-ink-strong">
              {station.operatingHours ?? "Not set"}
            </dd>
          </div>
        </dl>

        {station.notice ? (
          <p className="mt-4 rounded-xl border border-line bg-[#f5f8fa] px-3 py-2 text-xs leading-relaxed text-ink-muted">
            {station.notice}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
