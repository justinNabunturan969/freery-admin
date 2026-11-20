"use client";

import { useEffect, useRef, useState } from "react";
import {
  clamp,
  estimateLabelWidth,
  type FerryView,
  type PreviewStation,
} from "@/lib/preview";
import { useIsMobile } from "@/lib/useMediaQuery";
import { FerryCallout } from "./FerryCallout";
import { FerryMarker } from "./FerryMarker";
import { StationDot } from "./StationDot";

/**
 * The schematic route.
 *
 * Plain SVG and CSS, no map library and no map tiles. The route is a line with
 * evenly spaced station dots, horizontal when the card it is in has the room
 * for it and vertical when it does not.
 * The ferry markers sit on the line at the position projected from their
 * reported coordinates.
 *
 * The drawing adapts to what it is given:
 *
 *   - The station dots shrink when there are more stations than the width can
 *     carry, so a long route still fits on one screen.
 *   - The station names are replaced by their number when the names would
 *     overlap, and the numbers are the same numbers in the station list.
 *   - Everything is measured with a ResizeObserver, so the picture follows the
 *     window when it is resized or when the screen resolution changes.
 */

/**
 * The height of one callout card, and the gap between two rows of them.
 *
 * The card holds the arrival message, which is a sentence and sometimes takes
 * two lines, so the row is taller than a single line of text needs.
 */
const CALLOUT_H = 88;
const LEVEL_GAP = 96;
const CALL_OUT_OFFSET = 10;

/** The row height of the vertical diagram on a narrow screen. */
const ROW_H = 54;

/**
 * The room the horizontal route needs before it is worth drawing.
 *
 * The callouts are cards that hang over the line, so the horizontal route only
 * works when the card it sits in is wide enough to hold two of them side by
 * side with the gap between them. Where it is not, the route is drawn
 * vertically instead, where the callouts stack and cannot overlap.
 *
 * The card padding and the padding inside the plot are taken off first, so the
 * number is the room the plot itself gets.
 */
const MIN_HORIZONTAL_ROOM = 520;

/** The card padding and the padding inside the plot. */
const FRAME_CHROME = 88;

/**
 * Push callouts apart when two ferries are close on the line. Positions and
 * the minimum gap are in the same unit, normally pixels, so a fixed callout
 * width never overlaps however narrow the card is.
 *
 * Two callouts share a row only when there is that much room between them.
 * When no row has the room, the callout goes on a row of its own and the card
 * grows by that row. The card is never allowed to put one callout on top of
 * another: a taller card is better than a card that cannot be read.
 */
function packLevels(
  positions: number[],
  minGap: number,
): number[] {
  const order = positions
    .map((x, index) => ({ x, index }))
    .sort((a, b) => a.x - b.x);
  const lastX: number[] = [];
  const result = new Array<number>(positions.length).fill(0);

  for (const { x, index } of order) {
    let best = -1;
    let bestGap = -Infinity;

    for (let row = 0; row < lastX.length; row++) {
      const last = lastX[row];
      if (last === undefined) continue;
      const gap = Math.abs(x - last);
      if (gap >= minGap && gap > bestGap) {
        bestGap = gap;
        best = row;
      }
    }

    if (best === -1) {
      // A row is free, or the card grows by one row.
      best = lastX.length;
      lastX.push(x);
      result[index] = best;
      continue;
    }

    lastX[best] = x;
    result[index] = best;
  }

  return result;
}

/**
 * Track the rendered width of the route plot, so the spacing can be worked
 * out in pixels instead of as a percentage of an unknown width.
 */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => setWidth(element.getBoundingClientRect().width);
    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * The sizes the diagram works out for itself.
 *
 * `room` is how much space one station gets, in pixels. The dots are sized
 * against that room, so adding stations makes them smaller instead of
 * pushing them off the ends.
 */
export interface RouteLayout {
  /** The drawn diameter of a station dot. */
  dotSize: number;
  /** The drawn diameter of a ferry marker. */
  markerSize: number;
  /** The width of a callout card. */
  calloutWidth: number;
  /** Whether the full station names still fit under the dots. */
  showNames: boolean;
  /** The room between two stations, in pixels. */
  slot: number;
}

function planLayout(
  width: number,
  count: number,
  names: string[],
  /** The room one label has, in pixels. */
  labelRoom: number,
): RouteLayout {
  const safeWidth = Math.max(120, width);
  const slot = count > 1 ? safeWidth / (count - 1) : safeWidth;

  // The dot keeps a small gap from its neighbour, and never gets so small
  // that it stops being a dot.
  const dotSize = clamp(Math.min(16, slot - 8), 7, 16);
  const markerSize = clamp(Math.min(26, slot * 0.7), 14, 26);
  // The callout is wide enough for the arrival sentence on one line, which is
  // the message that answers "when does the boat get here". A longer station
  // name pushes it onto a second line, and the card has room for that.
  const calloutWidth = clamp(Math.min(184, safeWidth / 3), 138, 184);

  const widest = names.reduce(
    (max, name) => Math.max(max, estimateLabelWidth(name)),
    0,
  );
  const showNames =
    count <= 1 || widest + 6 <= Math.min(slot, Math.max(labelRoom, 40));

  return { dotSize, markerSize, calloutWidth, showNames, slot };
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px] text-ink-muted">
      <div className="flex flex-wrap items-center gap-5">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-[11px] w-[11px] rounded-full border-2 border-line-strong bg-white"
          />
          Station
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-[11px] w-[11px] rounded-full bg-brand-500"
          />
          Ferry in service
        </span>
      </div>
      <span className="text-ink-faint">Schematic route, not for marine navigation</span>
    </div>
  );
}

export function RouteDiagram({
  stations,
  views,
  orientation = "auto",
  loading = false,
}: {
  stations: PreviewStation[];
  views: FerryView[];
  /**
   * "auto" follows the room the diagram is given: horizontal when the card it
   * sits in is wide enough for it, vertical when it is not. Pass "horizontal"
   * or "vertical" to force one of them.
   */
  orientation?: "auto" | "horizontal" | "vertical";
  loading?: boolean;
}) {
  const isMobile = useIsMobile();
  const [frameRef, frameWidth] = useMeasuredWidth<HTMLDivElement>();

  // Only the ferries that can be drawn are drawn: one that has no position,
  // or that is out of service, is listed under the diagram with the reason.
  const placed = views.filter(
    (view) => view.routePosition !== null && view.marker !== "offline",
  );

  /**
   * The route follows the card it is in, not the window.
   *
   * The same picture is used in a full width card on the overview page and in
   * a narrower column on the counter screen. When the window is wide but the
   * column is not, the horizontal route would put two callouts on top of one
   * another, so the room the card actually has decides.
   *
   * Before the first measurement the window decides, so the first picture is
   * the right one in the usual case.
   */
  const resolved =
    orientation !== "auto"
      ? orientation
      : frameWidth > 0
        ? frameWidth - FRAME_CHROME >= MIN_HORIZONTAL_ROOM
          ? "horizontal"
          : "vertical"
        : isMobile
          ? "vertical"
          : "horizontal";

  return (
    <div ref={frameRef}>
      {loading ? (
        <div className="rounded-xl bg-brand-50 p-5">
          <div className="h-[120px] animate-pulse rounded-lg bg-white/70" />
        </div>
      ) : stations.length === 0 ? (
        <div className="rounded-xl bg-brand-50 p-5">
          <p className="text-sm font-semibold text-ink-strong">No stations yet</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            The route appears here as soon as the first station is added.
          </p>
        </div>
      ) : resolved === "vertical" ? (
        <div className="rounded-xl bg-brand-50 p-4 sm:p-5">
          <VerticalDiagram stations={stations} views={placed} />
          <Legend />
        </div>
      ) : (
        <div className="rounded-xl bg-brand-50 p-5">
          <HorizontalDiagram stations={stations} views={placed} />
          <Legend />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Desktop: horizontal route                                                  */
/* -------------------------------------------------------------------------- */

function HorizontalDiagram({
  stations,
  views,
}: {
  stations: PreviewStation[];
  views: FerryView[];
}) {
  const count = stations.length;
  const [plotRef, plotWidth] = useMeasuredWidth<HTMLDivElement>();
  const names = stations.map((station) => station.name);

  // Before the first measurement the percentage rule keeps the picture
  // steady, and the measurement replaces it a moment later.
  const width = plotWidth > 0 ? plotWidth : 900;
  const layout = planLayout(width, count, names, width);

  const positions = views.map((view) => (view.routePosition ?? 0) * 100);

  /**
   * The number of callout rows is taken from the size of the fleet, not from
   * where the ferries happen to be at this moment. Otherwise the card grows
   * and shrinks as the boats move, and the whole page moves under the reader
   * who is trying to read it.
   *
   * The rows that are actually needed are counted as well: when the boats are
   * on top of each other the card gets the extra row it needs rather than
   * putting two callouts on top of one another.
   */
  const reservedRows = Math.max(1, Math.ceil(views.length / 2));

  // Callouts have a fixed width, so their centres need that much room in
  // pixels.
  const measured = plotWidth > 0;
  const halfCallout = Math.min(layout.calloutWidth, width) / 2;
  const centers = views.map((view) => {
    const raw = (view.routePosition ?? 0) * width;
    return Math.max(halfCallout, Math.min(width - halfCallout, raw));
  });
  const levels = measured
    ? packLevels(centers, layout.calloutWidth + 12)
    : packLevels(positions, 16);

  const rowsUsed = levels.reduce((most, level) => Math.max(most, level + 1), 1);
  const rows = Math.max(reservedRows, rowsUsed);

  const lineY = CALL_OUT_OFFSET + (rows - 1) * LEVEL_GAP + CALLOUT_H + 14;
  const height = lineY + 56;
  const linePercent = (lineY / height) * 100;

  return (
    <div className="px-2 sm:px-6">
      <div ref={plotRef} className="relative" style={{ height }}>
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d={`M0 ${linePercent} H100`}
            className="route-line"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {stations.map((station, index) => (
          <span
            key={`label-${station.id}`}
            className={`pointer-events-none absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-ink-muted ${
              layout.showNames ? "" : "font-semibold"
            }`}
            style={{
              left: `${(index / Math.max(1, count - 1)) * 100}%`,
              top: lineY + 20,
            }}
            title={station.name}
          >
            {layout.showNames ? station.name : index + 1}
          </span>
        ))}

        {stations.map((station, index) => (
          <StationDot
            key={`dot-${station.id}`}
            station={station}
            index={index}
            count={count}
            size={layout.dotSize}
            top={lineY}
            className="-translate-x-1/2 -translate-y-1/2"
          />
        ))}

        {views.map((view, index) => (
          <div
            key={`marker-${view.ferry.id}`}
            className="ferry-marker pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${positions[index] ?? 0}%`, top: lineY }}
          >
            <FerryMarker view={view} size={layout.markerSize} />
          </div>
        ))}

        {views.map((view, index) => {
          const level = levels[index] ?? 0;
          const position = positions[index] ?? 0;
          const center = centers[index] ?? 0;
          return (
            <div
              key={`callout-${view.ferry.id}`}
              className="absolute z-20"
              style={{
                left: measured
                  ? `${center}px`
                  : `clamp(${layout.calloutWidth / 2}px, ${position}%, calc(100% - ${layout.calloutWidth / 2}px))`,
                top: CALL_OUT_OFFSET + level * LEVEL_GAP,
                transform: "translateX(-50%)",
              }}
            >
              <FerryCallout view={view} width={layout.calloutWidth} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile: vertical route                                                     */
/* -------------------------------------------------------------------------- */

function VerticalDiagram({
  stations,
  views,
}: {
  stations: PreviewStation[];
  views: FerryView[];
}) {
  const count = stations.length;
  const [plotRef, plotWidth] = useMeasuredWidth<HTMLDivElement>();
  const names = stations.map((station) => station.name);

  // The name column takes a share of the screen, and the line sits after it.
  const width = plotWidth > 0 ? plotWidth : 360;
  const lineX = clamp(Math.min(88, width * 0.32), 52, 88);
  const labelRoom = Math.max(24, lineX - 26);
  const layout = planLayout(width, count, names, labelRoom);

  const span = Math.max(1, count - 1);
  const height = span * ROW_H + 40;

  // Keep the callouts from sitting on top of each other.
  const placed = views
    .map((view) => ({
      view,
      top: ((view.routePosition ?? 0) * span * ROW_H + 20) - CALLOUT_H / 2,
    }))
    .sort((a, b) => a.top - b.top);

  let lastBottom = -Infinity;
  for (const item of placed) {
    if (item.top < lastBottom) item.top = lastBottom + 8;
    lastBottom = item.top + CALLOUT_H;
  }

  return (
    <div ref={plotRef} className="relative" style={{ height }}>
      {/*
        The vertical line.

        The height has to be given to the element itself. An svg carries an
        intrinsic ratio, so with an automatic height it would take the height
        of its own width and the line would stop a short way down the route.
      */}
      <svg
        className="absolute"
        style={{ left: lineX - 1.5, width: 3, height: "100%" }}
        viewBox="0 0 3 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M1.5 0 V100"
          className="route-line"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {stations.map((station, index) => (
        <span
          key={`label-${station.id}`}
          className="pointer-events-none absolute truncate text-[12px] text-ink-muted"
          style={{
            top: index * ROW_H + 13,
            left: 0,
            width: lineX - 22,
            textAlign: "right",
          }}
          title={station.name}
        >
          {layout.showNames ? station.name : index + 1}
        </span>
      ))}

      {stations.map((station, index) => (
        <StationDot
          key={`dot-${station.id}`}
          station={station}
          index={index}
          count={count}
          size={layout.dotSize}
          top={index * ROW_H + 20}
          left={lineX}
          className="-translate-x-1/2 -translate-y-1/2"
        />
      ))}

      {views.map((view) => (
        <div
          key={`marker-${view.ferry.id}`}
          className="ferry-marker pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: lineX,
            top: ((view.routePosition ?? 0) * span * ROW_H + 20),
          }}
        >
          <FerryMarker view={view} size={Math.min(22, layout.markerSize)} />
        </div>
      ))}

      {placed.map((item) => (
        <div
          key={`callout-${item.view.ferry.id}`}
          className="absolute z-20"
          style={{ left: lineX + 22, right: 0, top: item.top }}
        >
          <FerryCallout
            view={item.view}
            width={layout.calloutWidth < 172 ? undefined : layout.calloutWidth}
          />
        </div>
      ))}
    </div>
  );
}
