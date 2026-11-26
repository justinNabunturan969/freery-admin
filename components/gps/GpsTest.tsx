"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, Footnote, Input } from "@/components/ui/primitives";
import { StatCard } from "@/components/ui/stats";
import {
  ReceiverMap,
  type MapFix,
  type MapReceiver,
} from "@/components/gps/ReceiverMap";
import type { ErrorStats } from "@/lib/geo";

/**
 * The receiver bench.
 *
 * This is the function the researchers use. They connect a receiver, it appears
 * on the map, and the page measures how accurate the GPS inside it is.
 *
 * The page is ready to connect: it asks which receiver is being tested, and the
 * receiver appears on the map the moment it sends its first position. A
 * receiver that reports without anybody naming it appears as well.
 *
 * The page asks the PC for the newest positions every few seconds, so the
 * trace on the map grows as they arrive and the receiver sits at the leading
 * edge of it. The figures under the map are worked out from the same
 * positions, so they move with the trace.
 *
 * The accuracy needs a ground truth: where the receiver really is. The
 * researcher marks that point on the map, and every position is measured
 * against it.
 *
 * Nothing on the page is made up. A receiver that has not reported has no
 * positions, and the figures read "no data" until it does.
 */

export interface BenchReceiver {
  deviceId: string;
  lat: number | null;
  lon: number | null;
  speed: number | null;
  hdop: number | null;
  sats: number | null;
  rssi: number | null;
  snr: number | null;
  lastSeq: number;
  lastSeenAt: string | null;
  fixCount: number;
}

export interface BenchFix {
  id: number;
  deviceId: string | null;
  lat: number;
  lon: number;
  speed: number;
  seq: number;
  rssi: number | null;
  snr: number | null;
  hdop: number | null;
  sats: number | null;
  receivedAt: string;
  /** The distance from this position to the marked true position, in metres. */
  errorM: number | null;
}

export interface BenchScatter {
  count: number;
  rmsRadiusM: number | null;
  radius95M: number | null;
  extentM: number | null;
}

export interface BenchQuality {
  pointsWithQuality: number;
  pointsWithoutQuality: number;
  averageHdop: number | null;
  worstHdop: number | null;
  averageSats: number | null;
  poorFixes: number;
}

export interface BenchReference {
  lat: number;
  lon: number;
  label: string;
}

export interface BenchAnalysis {
  fixes: BenchFix[];
  reference: BenchReference | null;
  stats: ErrorStats | null;
  scatter: BenchScatter;
  quality: BenchQuality;
  samplingIntervalS: number | null;
  medianSpeedErrorKmh: number | null;
  speedRmseKmh: number | null;
  totalDistanceM: number;
  estimatedAccuracyM: number | null;
  droppedPoints: number;
}

export interface BenchInitial {
  receivers: BenchReceiver[];
  deviceId: string | null;
  analysis: BenchAnalysis | null;
}

/** How often the page asks the PC for the newest positions. */
const POLL_MS = 3000;

/** A receiver that has not been heard from in this long is not connected. */
const LIVE_SECONDS = 120;

function metres(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "no data";
  if (value < 10) return value.toFixed(2);
  if (value < 1000) return value.toFixed(1);
  return (value / 1000).toFixed(2);
}

function kilometres(value: number): string {
  if (value < 1000) return `${value.toFixed(0)} m`;
  return `${(value / 1000).toFixed(2)} km`;
}

function duration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "no data";
  if (seconds < 1) return `${seconds.toFixed(1)} s`;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

/** "12 s ago" for the last packet. */
function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

/** "2:05 PM" for the time a position was recorded. */
function clockTime(iso: string | null): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const shifted = new Date(date.getTime() + 8 * 60 * 60_000);
  const hours = shifted.getUTCHours();
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  const meridiem = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${minute} ${meridiem}`;
}

export function GpsTest({
  deviceId,
  hours,
  initial,
}: {
  deviceId: string | null;
  hours: number | null;
  initial: BenchInitial;
}) {
  const router = useRouter();

  const [receivers, setReceivers] = useState<BenchReceiver[]>(initial.receivers);
  const [analysis, setAnalysis] = useState<BenchAnalysis | null>(initial.analysis);
  const [follow, setFollow] = useState(true);
  const [marking, setMarking] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [wanted, setWanted] = useState(deviceId ?? "");
  const [offline, setOffline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forgetArmed, setForgetArmed] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const running = useRef(true);

  /* The clock on the page, so "12 seconds ago" keeps counting. */
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* The newest positions, every few seconds. */
  useEffect(() => {
    running.current = true;

    async function tick() {
      try {
        const query = new URLSearchParams();
        if (deviceId) query.set("deviceId", deviceId);
        if (hours) query.set("hours", String(hours));

        const response = await fetch(`/api/admin/gps-test?${query.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          if (running.current) setOffline(true);
          return;
        }

        const body = (await response.json()) as {
          receivers: BenchReceiver[];
          analysis: BenchAnalysis | null;
        };

        if (!running.current) return;
        setOffline(false);
        setReceivers(body.receivers ?? []);
        setAnalysis(body.analysis ?? null);
      } catch {
        if (running.current) setOffline(true);
      }
    }

    void tick();
    const timer = setInterval(tick, POLL_MS);

    return () => {
      running.current = false;
      clearInterval(timer);
    };
  }, [deviceId, hours]);

  /*
   * The receiver that is on show.
   *
   * A receiver the reader has connected is the one on show, even when it has
   * not reported yet: the page then waits for it. With nothing connected, the
   * receiver that reported most recently is the one on show, so a receiver
   * that is plugged in appears on the map by itself.
   */
  const receiver = useMemo<BenchReceiver | null>(() => {
    if (deviceId) {
      return receivers.find((item) => item.deviceId === deviceId) ?? null;
    }
    return receivers[0] ?? null;
  }, [receivers, deviceId]);

  /* The box follows the receiver that is connected. */
  useEffect(() => {
    setWanted(deviceId ?? "");
    setForgetArmed(false);
    setNotice("");
  }, [deviceId]);

  /*
   * Connecting and disconnecting.
   *
   * The choice lives in the address, so the page can be linked to one receiver
   * and the filters and the downloads follow it.
   */
  const connect = useCallback(
    (id: string) => {
      const clean = id.trim();
      if (!clean) return;

      const query = new URLSearchParams();
      query.set("deviceId", clean);
      if (hours) query.set("hours", String(hours));
      router.replace(`/gps-test?${query.toString()}`, { scroll: false });
    },
    [hours, router],
  );

  const disconnect = useCallback(() => {
    const query = new URLSearchParams();
    if (hours) query.set("hours", String(hours));
    const search = query.toString();
    router.replace(`/gps-test${search ? `?${search}` : ""}`, { scroll: false });
  }, [hours, router]);

  const fixes = analysis?.fixes ?? [];

  const mapFixes = useMemo<MapFix[]>(
    () =>
      fixes.map((fix) => ({
        id: fix.id,
        lat: fix.lat,
        lon: fix.lon,
        errorM: fix.errorM,
        hdop: fix.hdop,
        sats: fix.sats,
      })),
    [fixes],
  );

  const others = useMemo<MapReceiver[]>(
    () =>
      receivers
        .filter(
          (item) =>
            item.deviceId !== receiver?.deviceId &&
            item.lat !== null &&
            item.lon !== null,
        )
        .map((item) => ({
          deviceId: item.deviceId,
          lat: item.lat as number,
          lon: item.lon as number,
        })),
    [receivers, receiver],
  );

  /*
   * The receiver on the map.
   *
   * A receiver that has not reported has no place yet, so it is left off the
   * map: the map would open in the middle of the ocean, on a position the
   * receiver has never given.
   */
  const onShow =
    receiver && receiver.lat !== null && receiver.lon !== null
      ? {
          deviceId: receiver.deviceId,
          lat: receiver.lat,
          lon: receiver.lon,
          current: true,
        }
      : null;

  const reference = analysis?.reference ?? null;
  const stats = analysis?.stats ?? null;
  const scatter = analysis?.scatter ?? null;
  const quality = analysis?.quality ?? null;

  const connected =
    receiver?.lastSeenAt !== null &&
    receiver?.lastSeenAt !== undefined &&
    now - new Date(receiver.lastSeenAt).getTime() <= LIVE_SECONDS * 1000;

  /*
   * What the reader is told.
   *
   * The page is honest about what it has: a receiver that has not reported
   * has no positions, and it says so rather than showing something made up.
   * It is also honest about the difference between "named" and "reporting": a
   * receiver that reports on its own is on the map, but the reader has not
   * picked it, and the line says which of the two it is.
   */
  const status = deviceId
    ? receiver === null
      ? `Waiting for ${deviceId} to report. It appears on the map as soon as it sends its first position.`
      : connected
        ? `${deviceId} is reporting. It is on the map, and the trace grows as the positions arrive.`
        : `${deviceId} was last heard ${ago(receiver.lastSeenAt, now)}. The positions it sent are on the map.`
    : receiver === null
      ? "No receiver is connected. Name the one you are testing above. A receiver that reports on its own appears on the map as well."
      : connected
        ? `${receiver.deviceId} reported on its own and it is on the map. Name it above to follow it.`
        : `${receiver.deviceId} was last heard ${ago(receiver.lastSeenAt, now)}. Name it above to follow it.`;

  /* The researcher marks where the receiver really is. */
  const pickReference = useCallback(
    async (lat: number, lon: number) => {
      if (!receiver) return;
      setSaving(true);

      try {
        const response = await fetch("/api/admin/gps-reference", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            deviceId: receiver.deviceId,
            lat,
            lon,
            label: "The true position",
          }),
        });

        if (response.ok) {
          setMarking(false);
          setAnalysis((current) =>
            current
              ? {
                  ...current,
                  reference: { lat, lon, label: "The true position" },
                }
              : current,
          );
        }
      } finally {
        setSaving(false);
      }
    },
    [receiver],
  );

  /* The mark can be taken away, so the page has no ground truth again. */
  const clearReference = useCallback(async () => {
    if (!receiver) return;
    setSaving(true);

    try {
      const response = await fetch(
        `/api/admin/gps-reference?deviceId=${encodeURIComponent(receiver.deviceId)}`,
        { method: "DELETE" },
      );

      if (response.ok) {
        setAnalysis((current) =>
          current ? { ...current, reference: null, stats: null } : current,
        );
      }
    } finally {
      setSaving(false);
    }
  }, [receiver]);

  const chooseReceiver = (id: string): void => {
    const query = new URLSearchParams();
    query.set("deviceId", id);
    if (hours) query.set("hours", String(hours));
    router.replace(`/gps-test?${query.toString()}`, { scroll: false });
  };

  /*
   * Forgetting a receiver.
   *
   * A test run is cleared before the next one: the receiver, the place it was
   * marked and the positions it recorded go away. The button asks twice, because
   * the positions it removes cannot be got back. If the unit is still powered
   * and still reporting, it comes back by itself on the next poll.
   */
  const forgetReceiver = useCallback(async () => {
    if (!receiver) return;
    const name = receiver.deviceId;
    setSaving(true);

    try {
      const response = await fetch(
        `/api/admin/gps-test?deviceId=${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );

      if (response.ok) {
        setForgetArmed(false);
        setAnalysis(null);
        setReceivers((current) => current.filter((item) => item.deviceId !== name));
        setNotice(
          `${name} was forgotten. Its positions and its mark were removed.`,
        );
      }
    } finally {
      setSaving(false);
    }
  }, [receiver]);

  const recent = fixes.slice(-25).reverse();

  return (
    <>
      {/* Connect a GPS. This is the function the page is for. */}
      <Card className="mb-4">
        <CardHeader
          title="Connect a GPS"
          description="Name the receiver you are testing. It appears on the map the moment it sends its first position."
        />
        <div className="px-5 pb-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              connect(wanted);
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <label
                htmlFor="connect-device"
                className="block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted"
              >
                Receiver
              </label>
              <Input
                id="connect-device"
                name="device"
                value={wanted}
                onChange={(event) => setWanted(event.target.value)}
                placeholder="RX-1"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Connect
            </button>
            {deviceId ? (
              <button
                type="button"
                onClick={disconnect}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-brand-300 hover:bg-brand-50"
              >
                Disconnect
              </button>
            ) : null}
          </form>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">{status}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            The receiver names itself. On a unit under test that is
            <span className="mx-1 font-mono">BENCH_DEVICE_NAME</span> in the port
            station's
            <span className="mx-1 font-mono">config.h</span>, and it has to be the
            same name here. A receiver that reports without anybody naming it
            still appears on the map.
          </p>
        </div>
      </Card>

      {/* The receivers that are reporting. */}
      <Card className="mb-4">
        <CardHeader
          title="The receivers"
          description="Every receiver that has reported. Connect one and it appears here."
        />
        <div className="px-5 pb-4">
          {receivers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-ink-faint/40 px-4 py-6 text-sm text-ink-muted">
              No receiver has reported yet. Connect the receiver under test and
              its positions will appear here and on the map.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {receivers.map((item) => {
                const onShowNow = item.deviceId === receiver?.deviceId;
                const live =
                  item.lastSeenAt !== null &&
                  now - new Date(item.lastSeenAt).getTime() <= LIVE_SECONDS * 1000;

                return (
                  <li key={item.deviceId}>
                    <button
                      type="button"
                      onClick={() => chooseReceiver(item.deviceId)}
                      aria-pressed={onShowNow}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        onShowNow
                          ? "border-brand-400 bg-brand-50"
                          : "border-line bg-white hover:border-brand-300"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink-strong">
                          {item.deviceId}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            live
                              ? "bg-[#e6f6ef] text-[#0e7a52]"
                              : "bg-ink-faint text-ink-muted"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              live ? "bg-[#0e9f6e]" : "bg-ink-muted"
                            }`}
                            aria-hidden="true"
                          />
                          {live ? "Connected" : "Last seen"}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-ink-muted">
                        {ago(item.lastSeenAt, now)} · {item.fixCount} positions
                        {item.hdop !== null ? ` · HDOP ${item.hdop.toFixed(2)}` : ""}
                        {item.sats !== null ? ` · ${item.sats} satellites` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      {/* The map, and the live readings of the receiver on show. */}
      <Card className="mb-4">
        <CardHeader
          title="The receiver on the map"
          description="The trace it has recorded so far. It grows as the positions arrive."
          action={
            <div className="flex flex-wrap items-center gap-2">
              {receiver ? (
                <button
                  type="button"
                  onClick={() => setMarking((value) => !value)}
                  className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-brand-300 hover:bg-brand-50"
                >
                  {marking ? "Cancel the marking" : "Mark the true position"}
                </button>
              ) : null}
              {reference ? (
                <button
                  type="button"
                  onClick={clearReference}
                  disabled={saving}
                  className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-brand-300 hover:bg-brand-50"
                >
                  Clear the mark
                </button>
              ) : null}
              {receiver ? (
                <button
                  type="button"
                  onClick={() => setFocusRequest((value) => value + 1)}
                  className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-brand-300 hover:bg-brand-50"
                >
                  {reference ? "Zoom to the true position" : "Zoom to the receiver"}
                </button>
              ) : null}
              {receiver ? (
                <button
                  type="button"
                  onClick={() => setFollow((value) => !value)}
                  className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-brand-300 hover:bg-brand-50"
                >
                  {follow ? "Stop following the receiver" : "Follow the receiver"}
                </button>
              ) : null}
              {receiver ? (
                <button
                  type="button"
                  onClick={() => {
                    if (forgetArmed) {
                      void forgetReceiver();
                      return;
                    }
                    setForgetArmed(true);
                  }}
                  disabled={saving}
                  className={`inline-flex min-h-[40px] items-center rounded-xl border px-3 text-sm font-semibold ${
                    forgetArmed
                      ? "border-[#c2410c] bg-[#fff4ed] text-[#c2410c]"
                      : "border-line bg-white text-ink hover:border-brand-300 hover:bg-brand-50"
                  }`}
                >
                  {forgetArmed
                    ? `Yes, forget ${receiver.deviceId}`
                    : "Forget this receiver"}
                </button>
              ) : null}
            </div>
          }
        />

        <div className="px-5 pb-4">
          {notice ? (
            <p className="mb-4 rounded-xl border border-line bg-ink-faint/40 px-4 py-3 text-xs leading-relaxed text-ink-muted">
              {notice}
            </p>
          ) : null}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                connected
                  ? "bg-[#e6f6ef] text-[#0e7a52]"
                  : "bg-ink-faint text-ink-muted"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected ? "bg-[#0e9f6e]" : "bg-ink-muted"
                }`}
                aria-hidden="true"
              />
              {receiver
                ? connected
                  ? `Connected — ${receiver.deviceId}`
                  : `Last seen — ${receiver.deviceId}`
                : "No receiver"}
            </span>
            <span className="text-xs text-ink-muted">
              Last packet {ago(receiver?.lastSeenAt ?? null, now)}
              {offline ? " · the console cannot be reached" : ""}
            </span>
          </div>

          {receiver ? (
            <ReceiverMap
              fixes={mapFixes}
              receiver={onShow}
              others={others}
              reference={reference}
              cep50M={stats?.cep50 ?? null}
              cep95M={stats?.cep95 ?? null}
              follow={follow}
              marking={marking}
              focusRequest={focusRequest}
              onFollowChange={setFollow}
              onPick={pickReference}
            />
          ) : (
            /*
             * Nothing to draw yet.
             *
             * An empty map with no position on it only looks broken, so the
             * map is not drawn at all until there is a receiver to draw.
             */
            <div className="flex h-[340px] w-full items-center justify-center rounded-xl border border-dashed border-line bg-ink-faint/30 px-6 text-center sm:h-[420px] lg:h-[520px]">
              <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
                Nothing on the map yet. Connect a receiver above, and it appears
                here the moment it sends its first position.
              </p>
            </div>
          )}
        </div>

        <Footnote>
          {reference
            ? `Every position is measured against the marked true position. The circles are the radii that half and 95 per cent of the positions fall inside.`
            : "There is no ground truth yet. Mark where the receiver really is, and the page will measure every position against it."}{" "}
          The map follows the receiver while it is reporting. Drag the map to take
          over, and the button above starts it again. The accuracy is a matter of
          metres, so the map opens on the trace and the **Zoom to the true
          position** button goes in close enough to see the circles and the
          positions apart.
        </Footnote>
      </Card>

      {/* The accuracy against the true position. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Mean error"
          value={stats ? metres(stats.mean) : "—"}
          unit={stats ? "m" : undefined}
          hint="The average distance from the true position."
        />
        <StatCard
          label="CEP50 (median)"
          value={stats ? metres(stats.cep50) : "—"}
          unit={stats ? "m" : undefined}
          hint="Half of the positions are inside this distance."
        />
        <StatCard
          label="CEP95"
          value={stats ? metres(stats.cep95) : "—"}
          unit={stats ? "m" : undefined}
          hint="95 per cent of the positions are inside this distance."
        />
        <StatCard
          label="Worst position"
          value={stats ? metres(stats.max) : "—"}
          unit={stats ? "m" : undefined}
          hint="The one position that was furthest from the true position."
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="RMSE"
          value={stats ? metres(stats.rmse) : "—"}
          unit={stats ? "m" : undefined}
          hint="The root mean square. It punishes the worst positions."
        />
        <StatCard
          label="Spread (RMS)"
          value={scatter ? metres(scatter.rmsRadiusM) : "—"}
          unit={scatter ? "m" : undefined}
          hint="How far the positions are from each other. Read it as noise when the receiver stands still."
        />
        <StatCard
          label="The receiver's own estimate"
          value={analysis?.estimatedAccuracyM ? metres(analysis.estimatedAccuracyM) : "—"}
          unit={analysis?.estimatedAccuracyM ? "m" : undefined}
          hint="The average HDOP, times the one metre a good receiver usually gets. The receiver's own claim, not a measurement."
        />
        <StatCard
          label="Positions measured"
          value={stats ? stats.count : fixes.length}
          hint={
            analysis && analysis.droppedPoints > 0
              ? `${analysis.droppedPoints} left out by the quality filter.`
              : "Every position the receiver recorded in this period."
          }
        />
      </div>

      {/* What the receiver said about its own fixes. */}
      <Card className="mt-4">
        <CardHeader
          title="How good the fixes were"
          description="What the receiver said about its own positions."
        />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 px-5 pb-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Average HDOP
            </dt>
            <dd className="mt-1 text-lg font-semibold text-ink-strong">
              {quality?.averageHdop !== null && quality?.averageHdop !== undefined
                ? quality.averageHdop.toFixed(2)
                : "not reported"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Worst HDOP
            </dt>
            <dd className="mt-1 text-lg font-semibold text-ink-strong">
              {quality?.worstHdop !== null && quality?.worstHdop !== undefined
                ? quality.worstHdop.toFixed(2)
                : "not reported"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Average satellites
            </dt>
            <dd className="mt-1 text-lg font-semibold text-ink-strong">
              {quality?.averageSats !== null && quality?.averageSats !== undefined
                ? quality.averageSats.toFixed(1)
                : "not reported"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Poor fixes
            </dt>
            <dd className="mt-1 text-lg font-semibold text-ink-strong">
              {quality?.poorFixes ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Sampling interval
            </dt>
            <dd className="mt-1 text-lg font-semibold text-ink-strong">
              {duration(analysis?.samplingIntervalS ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Length of the trace
            </dt>
            <dd className="mt-1 text-lg font-semibold text-ink-strong">
              {analysis ? kilometres(analysis.totalDistanceM) : "no data"}
            </dd>
          </div>
        </dl>
        <Footnote>
          A fix with an HDOP over 5.0 or fewer than four satellites is one the
          receiver itself would call poor. The unit is flashed with the quality
          numbers in its packet, so a unit flashed before them says "not
          reported" instead of a made up number.
        </Footnote>
      </Card>

      {/* The positions, one row each. */}
      <Card className="mt-4">
        <CardHeader
          title="The positions"
          description="The last positions the receiver recorded."
        />
        <div className="overflow-x-auto px-5 pb-4">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                <th className="py-2 pr-4 font-semibold">Time</th>
                <th className="py-2 pr-4 font-semibold">Latitude</th>
                <th className="py-2 pr-4 font-semibold">Longitude</th>
                <th className="py-2 pr-4 font-semibold">Error</th>
                <th className="py-2 pr-4 font-semibold">HDOP</th>
                <th className="py-2 pr-4 font-semibold">Satellites</th>
                <th className="py-2 font-semibold">Speed</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-4 text-sm text-ink-muted"
                  >
                    No position has been recorded yet.
                  </td>
                </tr>
              ) : (
                recent.map((fix) => (
                  <tr key={fix.id} className="border-b border-line/60">
                    <td className="py-2 pr-4 text-ink-strong">
                      {clockTime(fix.receivedAt)}
                    </td>
                    <td className="py-2 pr-4 text-ink-strong">
                      {fix.lat.toFixed(6)}
                    </td>
                    <td className="py-2 pr-4 text-ink-strong">
                      {fix.lon.toFixed(6)}
                    </td>
                    <td className="py-2 pr-4 text-ink-strong">
                      {fix.errorM === null ? "—" : `${fix.errorM.toFixed(2)} m`}
                    </td>
                    <td className="py-2 pr-4 text-ink-strong">
                      {fix.hdop === null ? "not reported" : fix.hdop.toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-ink-strong">
                      {fix.sats === null ? "not reported" : fix.sats}
                    </td>
                    <td className="py-2 text-ink-strong">
                      {fix.speed.toFixed(1)} km/h
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
