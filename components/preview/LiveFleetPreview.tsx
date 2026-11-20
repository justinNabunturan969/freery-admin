"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/primitives";
import { formatTime } from "@/components/ui/stats";
import {
  computeFerryViews,
  ferryColor,
  PREVIEW_POLL_MS,
  type FleetSnapshot,
  type PositionMap,
} from "@/lib/preview";
import { FLEET_CHANGED_EVENT } from "@/lib/fleetEvents";
import { RouteDiagram } from "./RouteDiagram";

/**
 * The live preview of the fleet.
 *
 * It is the same picture the passenger website shows, drawn in the admin app:
 * the route, the station dots and the boats sitting on the line.
 *
 * The snapshot comes from `/api/fleet`, which reads the database directly, so
 * a ferry or a station the master administrator adds is on the picture within
 * a few seconds without anybody reloading the page. The console also fires a
 * change event after an edit, which brings the picture forward at once.
 *
 * The master administrator and the station administrators read the same route,
 * so the two screens can never tell different stories.
 */
export function LiveFleetPreview({ className = "" }: { className?: string }) {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<PositionMap>({});

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/fleet", { cache: "no-store" });
        if (!response.ok) throw new Error("bad answer");
        const data = (await response.json()) as FleetSnapshot;
        if (!active) return;
        setSnapshot(data);
        setError(null);
      } catch {
        if (!active) return;
        setError("The preview could not reach the station PC.");
      }
    };

    void load();

    // The boats move on their own, so the picture is refreshed on a timer.
    const timer = setInterval(() => {
      void load();
    }, PREVIEW_POLL_MS);

    // Come back to the tab, and the picture catches up straight away.
    const onFocus = () => {
      void load();
    };
    window.addEventListener("focus", onFocus);

    // Somebody changed the fleet or the stations on this screen.
    const onFleetChanged = () => {
      void load();
    };
    window.addEventListener(FLEET_CHANGED_EVENT, onFleetChanged);

    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(FLEET_CHANGED_EVENT, onFleetChanged);
    };
  }, []);

  const ferries = snapshot?.ferries ?? [];
  const stations = snapshot?.stations ?? [];

  const { views, positions } = useMemo(
    () => computeFerryViews(ferries, stations, historyRef.current),
    [ferries, stations],
  );

  // Remember where each boat was, so the next reading can tell whether it is
  // heading up the route or heading back.
  useEffect(() => {
    historyRef.current = positions;
  }, [positions]);

  const inFleet = ferries.filter((ferry) => ferry.inOperation).length;
  const offRoute = views.filter((view) => view.absenceReason !== null);

  return (
    <Card className={className}>
      <CardHeader
        title="Live fleet preview"
        description="Where the boats are right now, read from the database every few seconds."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
              {inFleet} of {ferries.length} in the fleet
            </span>
            <span className="text-xs text-ink-faint">
              {snapshot ? `Updated ${formatTime(snapshot.servedAt)}` : "Connecting…"}
            </span>
          </div>
        }
      />

      <div className="p-4 sm:p-5">
        {error ? (
          <p className="mb-3 rounded-xl border border-[#f3d3d1] bg-[#fdeceb] px-4 py-3 text-sm text-[#8f2c24]">
            {error}
          </p>
        ) : null}

        <RouteDiagram
          stations={stations}
          views={views}
          orientation="auto"
          loading={!snapshot}
        />

        {/*
          A boat that is not on the line is never hidden without a reason.
          This is where the reason is written down.
        */}
        {offRoute.length > 0 ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {offRoute.map((view) => (
              <li
                key={view.ferry.id}
                className="flex items-start gap-2.5 rounded-xl border border-line bg-white px-3 py-2"
              >
                <span
                  className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                  style={{ backgroundColor: ferryColor(view.ferry).hex }}
                  aria-hidden="true"
                >
                  {view.ferry.id}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-strong">
                    {view.ferry.name}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {view.absenceReason}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {/*
          The station list. The numbers under the dots point into this row,
          so the route still reads properly when the names do not fit.
        */}
        {stations.length > 0 ? (
          <div className="mt-4 overflow-x-auto route-scroll">
            <ol className="flex min-w-max items-center gap-1.5">
              {stations.map((station, index) => (
                <li
                  key={station.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1 text-[11px] text-ink-muted"
                >
                  <span className="font-semibold text-ink-strong">{index + 1}</span>
                  <span>{station.name}</span>
                  {!station.isOpen ? (
                    <span className="rounded bg-[#eef1f3] px-1 text-[10px] text-ink-faint">
                      Closed
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
