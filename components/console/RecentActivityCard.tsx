import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { formatDate, formatTime, timeAgo } from "@/components/ui/stats";
import type { ActivityRow } from "@/lib/queries";

/**
 * The recent activity card.
 *
 * Every change, with the account that made it, how long ago it happened and
 * the exact date and time it happened.
 */
export function RecentActivityCard({
  activity,
}: {
  activity: ActivityRow[];
}) {
  return (
    <Card>
      <CardHeader title="Recent activity" />
      {activity.length === 0 ? (
        <EmptyState title="Nothing has happened yet" />
      ) : (
        <ol className="divide-y divide-line">
          {activity.slice(0, 8).map((entry) => (
            <li key={entry.id} className="px-5 py-3">
              <p className="text-sm font-medium text-ink-strong">
                {describeAction(entry)}
              </p>
              {entry.reason ? (
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                  {entry.reason}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-ink-muted">
                {entry.userName ? `by ${entry.userName} · ` : null}
                <span className="font-medium text-brand-600">
                  {timeAgo(entry.createdAt)}
                </span>
              </p>
              {/* The exact moment, in Philippine time. */}
              <p className="mt-0.5 text-xs text-ink-faint">
                {formatDate(entry.createdAt)} · {formatTime(entry.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** Turns an action name and its details into a sentence. */
function describeAction(entry: ActivityRow): string {
  const details = (entry.details ?? {}) as Record<string, unknown>;
  const name = String(details.ferry ?? details.station ?? details.account ?? "");

  switch (entry.action) {
    case "FERRY_UPDATED":
      return `${name || "Ferry"} updated`;
    case "SEAT_CORRECTION":
      return `${name || "Ferry"} passenger count updated`;
    case "STATION_OPENED":
      return `${name || "Station"} reopened`;
    case "STATION_UPDATED":
      return `${name || "Station"} updated`;
    case "ACCOUNT_CREATED":
      return `Account ${name || ""} created`.trim();
    case "ACCOUNT_DISABLED":
      return `Account ${name || ""} disabled`.trim();
    case "ACCOUNT_UPDATED":
      return `Account ${name || ""} updated`.trim();
    case "PASSENGER_MANIFEST_CORRECTED":
      return `${name || "Manifest"} corrected`;
    case "LOGIN":
      return `${entry.userName ?? "An account"} signed in`;
    case "LOGOUT":
      return `${entry.userName ?? "An account"} signed out`;
    default:
      return entry.action.replaceAll("_", " ").toLowerCase();
  }
}
