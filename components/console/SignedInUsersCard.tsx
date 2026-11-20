import { AreaChart } from "@/components/ui/AreaChart";
import { Card, CardHeader } from "@/components/ui/primitives";
import type { SessionSummary } from "@/lib/queries";

/**
 * The signed in users card.
 *
 * It shows who is connected right now, how that number moved over the last
 * three hours, and the state of the link between the hardware and this
 * computer.
 *
 * The hardware is not fitted yet, so the connection health is honest about
 * it: the port receiver only reads as connected when a packet has really
 * arrived in the last minute.
 */
export function SignedInUsersCard({
  sessions,
  updatedLabel,
  unitsCount,
  receiverOnline,
  lastPacketAt,
}: {
  sessions: SessionSummary;
  updatedLabel: string;
  unitsCount: number;
  receiverOnline: boolean;
  lastPacketAt: string | null;
}) {
  const health = [
    {
      label: `GPS + LoRa · ${unitsCount} units`,
      ok: receiverOnline,
      note: receiverOnline
        ? "Packets are arriving"
        : "The units are not fitted yet",
    },
    {
      label: "Port receiver",
      ok: receiverOnline,
      note: receiverOnline
        ? "Online"
        : lastPacketAt
          ? "Last packet was a while ago"
          : "No packet has arrived yet",
    },
    {
      label: "Database",
      ok: true,
      note: "Connected",
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Signed-in users"
        action={
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
            {updatedLabel}
          </span>
        }
      />

      <div className="px-5 pt-4">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <p className="text-4xl font-semibold tracking-tight text-brand-600">
            {sessions.onlineNow}
            <span className="ml-2 text-sm font-normal text-ink-muted">
              online now
            </span>
          </p>
          <p className="text-lg font-semibold text-ink-strong">
            {sessions.staffOnline}
            <span className="ml-1.5 text-sm font-normal text-ink-muted">
              Station staff
            </span>
          </p>
          <p className="text-lg font-semibold text-ink-strong">
            {sessions.adminOnline}
            <span className="ml-1.5 text-sm font-normal text-ink-muted">
              Administrator
            </span>
          </p>
        </div>
      </div>

      <div className="min-w-0 px-3 pb-1 pt-4">
        <AreaChart
          points={sessions.series}
          label="The number of signed in sessions over the last three hours"
        />
      </div>

      <div className="border-t border-line px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">
          Connection health
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {health.map((item) => (
            <li key={item.label} className="flex items-start gap-2">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  item.ok ? "bg-brand-500" : "bg-[#c7d2d9]"
                }`}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-strong">
                  {item.label}
                </span>
                <span className="block text-xs leading-relaxed text-ink-faint">
                  {item.note}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
