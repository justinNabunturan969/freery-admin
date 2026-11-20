import { getFerries, getGpsLogs, successRate } from "@/lib/queries";
import { Card, CardHeader, Footnote } from "@/components/ui/primitives";
import { Meter, StatCard, StatusPill, formatDateTime, timeAgo } from "@/components/ui/stats";
import { PageHeader } from "@/components/admin/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Hardware and system health.
 *
 * The signal strength per ferry, the packet success rate worked out from the
 * sequence numbers, the last packet that arrived and the state of the
 * receiver that forwards the packets to this PC.
 *
 * The master administrator and the station administrator read the same page.
 */
export default async function HardwarePage() {
  const [ferries, gpsLogs] = await Promise.all([getFerries(), getGpsLogs(50)]);

  const lastPacket = ferries
    .map((ferry) => ferry.receivedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  const rates = ferries.map((ferry) => successRate(ferry));
  const knownRates = rates.filter((value): value is number => value !== null);
  const averageRate =
    knownRates.length > 0
      ? knownRates.reduce((sum, value) => sum + value, 0) / knownRates.length
      : null;

  const strongest = ferries
    .filter((ferry) => ferry.lastRssi !== null)
    .sort((a, b) => (b.lastRssi ?? -999) - (a.lastRssi ?? -999))[0];

  return (
    <>
      <PageHeader
        title="Hardware"
        description="The state of the radio link and the port station that forwards the packets to this computer."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Receiver"
          value="Online"
          tone="brand"
          hint="The port station posts packets to this PC."
        />
        <StatCard
          label="Packet success rate"
          value={averageRate === null ? "no data" : `${Math.round(averageRate * 100)}%`}
          hint="Worked out from the gaps in the sequence numbers."
        />
        <StatCard
          label="Last packet"
          value={lastPacket ? timeAgo(lastPacket) : "never"}
          hint={lastPacket ? formatDateTime(lastPacket) : "No packet has arrived yet"}
        />
        <StatCard
          label="Strongest signal"
          value={strongest?.lastRssi !== null && strongest ? `${strongest.lastRssi} dBm` : "no data"}
          hint={strongest ? `On ${strongest.name}` : "No RSSI has been reported yet"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {ferries.map((ferry) => {
          const rate = successRate(ferry);
          return (
            <Card key={ferry.id}>
              <CardHeader
                title={ferry.name}
                description={`Sequence ${ferry.firstSeq ?? "-"} to ${ferry.maxSeq ?? "-"}`}
                action={<StatusPill status={ferry.status} />}
              />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 px-5 py-4 sm:grid-cols-4">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    RSSI
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-ink-strong">
                    {ferry.lastRssi !== null ? `${ferry.lastRssi} dBm` : "no data"}
                  </dd>
                  <dd className="text-xs text-ink-faint">
                    average {ferry.avgRssi !== null ? `${Math.round(ferry.avgRssi)} dBm` : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    SNR
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-ink-strong">
                    {ferry.lastSnr !== null ? `${ferry.lastSnr} dB` : "no data"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Packets
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-ink-strong">
                    {ferry.packetCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Success
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-ink-strong">
                    {rate === null ? "no data" : `${Math.round(rate * 100)}%`}
                  </dd>
                </div>
              </dl>
              <div className="px-5">
                <Meter
                  value={rate === null ? 0 : Math.round(rate * 100)}
                  max={100}
                  tone={
                    rate === null
                      ? "brand"
                      : rate > 0.95
                        ? "good"
                        : rate > 0.8
                          ? "warn"
                          : "bad"
                  }
                  label={`${ferry.name} packet success rate`}
                />
              </div>
              <Footnote>
                Last packet {timeAgo(ferry.receivedAt)}. A packet that arrives
                with a sequence number that has already been used is ignored.
              </Footnote>
            </Card>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="The ingest endpoint"
            description="Where the port station sends the packets."
          />
          <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-ink-muted">
            <p>
              The port station posts a JSON packet to{" "}
              <code className="break-words rounded bg-[#eef1f3] px-1.5 py-0.5 text-xs text-ink-strong">
                POST http://&lt;this-pc&gt;:3001/api/ingest
              </code>{" "}
              with the device key in the{" "}
              <code className="break-words rounded bg-[#eef1f3] px-1.5 py-0.5 text-xs text-ink-strong">
                x-device-key
              </code>{" "}
              header.
            </p>
            <p>
              The key is the <code className="text-xs">DEVICE_API_KEY</code>{" "}
              value in the environment file on this PC. It is never sent to a
              browser and never written to the database.
            </p>
            <p className="text-xs text-ink-faint">
              A wrong or missing key is answered with 401. A packet that fails
              validation is answered with 400. A repeat of a sequence number
              is ignored and answered with 200.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Recent packets"
            description="The last GPS packets the port station sent."
          />
          {gpsLogs.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-muted">No packets yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-ink-muted">
                    <th scope="col" className="px-4 py-3 font-semibold">Ferry</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Seq</th>
                    <th scope="col" className="px-4 py-3 font-semibold">RSSI</th>
                    <th scope="col" className="px-4 py-3 font-semibold">SNR</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {gpsLogs.slice(0, 12).map((log) => (
                    <tr key={log.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 font-medium text-ink-strong">
                        {log.ferryName}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{log.seq}</td>
                      <td className="px-4 py-3 text-ink-muted">
                        {log.rssi !== null ? `${log.rssi} dBm` : "-"}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {log.snr !== null ? `${log.snr} dB` : "-"}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {timeAgo(log.receivedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Footnote>
            These numbers come from the recorded packets until the port station
            is running.
          </Footnote>
        </Card>
      </div>
    </>
  );
}
