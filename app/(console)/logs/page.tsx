import Link from "next/link";
import { PASSENGER_TYPE_LABELS, type PassengerType } from "@freery/shared";
import {
  getActivity,
  getGpsLogs,
  getPassengerEvents,
} from "@/lib/queries";
import { Card, CardHeader, Footnote } from "@/components/ui/primitives";
import { formatDateTime, timeAgo } from "@/components/ui/stats";
import { PageHeader } from "@/components/admin/PageHeader";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "gps", label: "GPS records" },
  { key: "passenger", label: "Passenger events" },
  { key: "activity", label: "Activity log" },
];

/**
 * The logs.
 *
 * The GPS packets, the passenger events and the audit trail, each with a CSV
 * download for the field tests.
 *
 * The master administrator and the station administrator read the same tables.
 * A narrow screen scrolls the table sideways; the page is not a different page
 * for a different size.
 */
export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const active = TABS.some((tab) => tab.key === type) ? (type as string) : "gps";

  const [gpsLogs, passengerEvents, activity] = await Promise.all([
    getGpsLogs(300),
    getPassengerEvents(300),
    getActivity(300),
  ]);

  return (
    <>
      <PageHeader
        title="Logs"
        description="Everything the system recorded, with the CSV download for the field tests."
        action={
          <a
            href={`/api/admin/logs?type=${active}&format=csv`}
            className="inline-flex min-h-[40px] items-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Export this log as CSV
          </a>
        }
      />

      <div
        role="tablist"
        aria-label="Log kinds"
        className="mb-4 inline-flex flex-wrap rounded-xl border border-line bg-white p-1"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/logs?type=${tab.key}`}
            role="tab"
            aria-selected={active === tab.key}
            className={`inline-flex min-h-[40px] items-center rounded-lg px-4 text-sm font-semibold transition-colors ${
              active === tab.key
                ? "bg-brand-500 text-white"
                : "text-ink-muted hover:bg-[#eef1f3] hover:text-ink-strong"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {active === "gps" ? (
        <Card>
          <CardHeader
            title="GPS records"
            description="Every packet the port station sent to this computer."
          />
          {gpsLogs.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-muted">No packets yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-ink-muted">
                    <th scope="col" className="px-4 py-3 font-semibold">Received</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Ferry</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Seq</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Latitude</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Longitude</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Speed</th>
                    <th scope="col" className="px-4 py-3 font-semibold">RSSI</th>
                    <th scope="col" className="px-4 py-3 font-semibold">SNR</th>
                  </tr>
                </thead>
                <tbody>
                  {gpsLogs.map((log) => (
                    <tr key={log.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ink-muted">
                        <span className="block">{timeAgo(log.receivedAt)}</span>
                        <span className="text-xs text-ink-faint">
                          {formatDateTime(log.receivedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink-strong">
                        {log.ferryName}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{log.seq}</td>
                      <td className="px-4 py-3 text-ink-muted">{log.lat.toFixed(5)}</td>
                      <td className="px-4 py-3 text-ink-muted">{log.lon.toFixed(5)}</td>
                      <td className="px-4 py-3 text-ink-muted">{log.speed} km/h</td>
                      <td className="px-4 py-3 text-ink-muted">
                        {log.rssi !== null ? `${log.rssi} dBm` : "-"}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {log.snr !== null ? `${log.snr} dB` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Footnote>
            Recorded packets from the port station appear here.
          </Footnote>
        </Card>
      ) : null}

      {active === "passenger" ? (
        <Card>
          <CardHeader
            title="Passenger events"
            description="Every tap at the counter, with who counted it and when."
          />
          {passengerEvents.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-muted">
              Nobody has been counted yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-ink-muted">
                    <th scope="col" className="px-4 py-3 font-semibold">Recorded</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Station</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Ferry</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Change</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Counted by</th>
                  </tr>
                </thead>
                <tbody>
                  {passengerEvents.map((event) => (
                    <tr key={event.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ink-muted">
                        <span className="block">{timeAgo(event.createdAt)}</span>
                        <span className="text-xs text-ink-faint">
                          {formatDateTime(event.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink-strong">
                        {event.stationName}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{event.ferryName}</td>
                      <td className="px-4 py-3 text-ink-muted">
                        {PASSENGER_TYPE_LABELS[event.passengerType as PassengerType] ??
                          event.passengerType}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            event.delta > 0
                              ? "font-semibold text-[#07805a]"
                              : "font-semibold text-[#a5342b]"
                          }
                        >
                          {event.delta > 0 ? `+${event.delta}` : event.delta}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {event.userName ?? "unknown"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {active === "activity" ? (
        <Card>
          <CardHeader
            title="Activity log"
            description="Every change made in the admin app, with the account that made it."
          />
          {activity.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-muted">Nothing yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-ink-muted">
                    <th scope="col" className="px-4 py-3 font-semibold">Recorded</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Account</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Record</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((entry) => (
                    <tr key={entry.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ink-muted">
                        <span className="block">{timeAgo(entry.createdAt)}</span>
                        <span className="text-xs text-ink-faint">
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink-strong">
                        {entry.userName ?? "System"}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {entry.action.replaceAll("_", " ").toLowerCase()}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {entry.entityType}
                        {entry.entityId !== null ? ` #${entry.entityId}` : ""}
                      </td>
                      <td className="max-w-[280px] px-4 py-3 text-ink-muted">
                        {entry.reason ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </>
  );
}
