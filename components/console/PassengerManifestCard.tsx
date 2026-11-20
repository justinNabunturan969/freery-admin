"use client";

import { useMemo, useState } from "react";
import { PASSENGER_TYPES, PASSENGER_TYPE_LABELS } from "@freery/shared";
import { Card, CardHeader } from "@/components/ui/primitives";
import { RelativeTime } from "@/components/ui/RelativeTime";
import type { ManifestEventRow } from "@/lib/queries";

export interface ManifestStation {
  id: number;
  name: string;
}

const TIME_OPTIONS = [
  "12:00 AM",
  "01:00 AM",
  "02:00 AM",
  "03:00 AM",
  "04:00 AM",
  "05:00 AM",
  "06:00 AM",
  "07:00 AM",
  "08:00 AM",
  "09:00 PM",
  "10:00 PM",
  "11:00 PM",
];

/**
 * The station passenger manifest.
 *
 * A matrix: one row per station, one column per passenger type, and the
 * total for each station at the end. The filters are the ones the field
 * tests need, a boarding date, a time range and a station.
 */
export function PassengerManifestCard({
  events,
  stations,
  routeName = "Route A",
}: {
  events: ManifestEventRow[];
  stations: ManifestStation[];
  routeName?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState("05:00 AM");
  const [to, setTo] = useState("09:00 PM");
  const [stationId, setStationId] = useState("all");

  const rows = useMemo(() => {
    const fromMinutes = toMinutes(from);
    const toMinutesValue = toMinutes(to);

    const matching = events.filter((event) => {
      if (stationId !== "all" && event.stationId !== Number(stationId)) {
        return false;
      }
      const when = new Date(event.createdAt);
      if (date && when.toISOString().slice(0, 10) !== date) return false;
      const minutes = when.getHours() * 60 + when.getMinutes();
      if (minutes < fromMinutes || minutes > toMinutesValue) return false;
      return true;
    });

    const byStation = new Map<
      number,
      { name: string; order: number; counts: Record<string, number>; last: string | null }
    >();

    for (const event of matching) {
      const entry = byStation.get(event.stationId) ?? {
        name: event.stationName,
        order: event.stationOrder,
        counts: {},
        last: null,
      };
      entry.counts[event.passengerType] =
        (entry.counts[event.passengerType] ?? 0) + event.delta;
      if (!entry.last || new Date(event.createdAt) > new Date(entry.last)) {
        entry.last = event.createdAt;
      }
      byStation.set(event.stationId, entry);
    }

    return [...byStation.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, entry]) => ({ id, ...entry }));
  }, [events, date, from, to, stationId]);

  const totals = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const type of PASSENGER_TYPES) sums[type] = 0;
    let grand = 0;
    for (const row of rows) {
      for (const type of PASSENGER_TYPES) {
        sums[type] = (sums[type] ?? 0) + (row.counts[type] ?? 0);
      }
      grand += Object.values(row.counts).reduce((sum, value) => sum + value, 0);
    }
    return { sums, grand };
  }, [rows]);

  const query = new URLSearchParams({
    type: "passenger",
    date,
    from,
    to,
  });
  if (stationId !== "all") query.set("stationId", stationId);

  const csvHref = `/api/admin/logs?${query.toString()}&format=csv`;
  const xlsxHref = `/api/admin/logs?${query.toString()}&format=xlsx`;

  return (
    <Card>
      <CardHeader
        title="Station passenger manifest"
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href={csvHref}
              className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink-strong transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              Export CSV
            </a>
            <a
              href={xlsxHref}
              className="inline-flex min-h-[40px] items-center rounded-xl bg-brand-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Export Excel
            </a>
          </div>
        }
      />

      <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Boarding date
          </span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Time range
          </span>
          <span className="flex items-center gap-2">
            <select
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-line bg-white px-2 text-sm text-ink"
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-faint">to</span>
            <select
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-line bg-white px-2 text-sm text-ink"
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Station
          </span>
          <select
            value={stationId}
            onChange={(event) => setStationId(event.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
          >
            <option value="all">All stations</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-[#fafcfc] text-left text-xs uppercase tracking-[0.08em] text-ink-muted">
              <th scope="col" className="px-4 py-3 font-semibold">Station</th>
              {PASSENGER_TYPES.map((type) => (
                <th key={type} scope="col" className="px-4 py-3 font-semibold">
                  {PASSENGER_TYPE_LABELS[type]}
                </th>
              ))}
              <th scope="col" className="px-4 py-3 font-semibold">Total</th>
              <th scope="col" className="px-4 py-3 font-semibold">Last boarding</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={PASSENGER_TYPES.length + 3}
                  className="px-4 py-8 text-center text-sm text-ink-muted"
                >
                  No passengers boarded in this filter.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const total = Object.values(row.counts).reduce(
                  (sum, value) => sum + value,
                  0,
                );
                return (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink-strong">
                      {row.name}
                    </td>
                    {PASSENGER_TYPES.map((type) => (
                      <td key={type} className="px-4 py-3 text-ink-muted">
                        {row.counts[type] ?? 0}
                      </td>
                    ))}
                    <td className="px-4 py-3 font-semibold text-ink-strong">
                      {total}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {row.last ? <RelativeTime iso={row.last} /> : "—"}
                    </td>
                  </tr>
                );
              })
            )}
            {rows.length > 0 ? (
              <tr className="bg-brand-50/60">
                <td className="px-4 py-3 font-semibold text-brand-700">Total</td>
                {PASSENGER_TYPES.map((type) => (
                  <td key={type} className="px-4 py-3 font-semibold text-brand-700">
                    {totals.sums[type] ?? 0}
                  </td>
                ))}
                <td className="px-4 py-3 font-semibold text-brand-700">
                  {totals.grand}
                </td>
                <td className="px-4 py-3 text-brand-700">—</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="px-5 py-3 text-xs leading-relaxed text-ink-faint">
        Exports include boarding date, time, station, passenger types, and
        station totals.
      </p>
    </Card>
  );
}

/** "05:00 AM" into the number of minutes after midnight. */
function toMinutes(value: string): number {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return 0;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = (match[3] ?? "AM").toUpperCase();
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}
