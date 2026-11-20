import { ferryColor, formatSpeed, type FerryView } from "@/lib/preview";

/**
 * The small card that sits above a ferry on the route: name, speed, when the
 * boat is due and how many seats are free.
 *
 * The width can be left out to fill the space the parent gives.
 */
export function FerryCallout({
  view,
  width,
  className = "",
}: {
  view: FerryView;
  /** Fixed width in pixels. Leave it out to fill the space the parent gives. */
  width?: number;
  className?: string;
}) {
  const color = ferryColor(view.ferry);

  return (
    <div
      className={`rounded-lg border border-line bg-white px-3 py-2 shadow-chip ${className}`}
      style={{
        ...(width ? { width } : {}),
        borderLeftWidth: 3,
        borderLeftColor: color.hex,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="text-[12px] font-bold leading-none"
          style={{ color: color.textHex }}
        >
          {view.ferry.name}
        </span>
        <span className="whitespace-nowrap text-[11px] text-ink-muted">
          {formatSpeed(view.ferry.speed)}
        </span>
      </div>
      {/*
        The arrival message. This is what the trip status used to be: an
        administrator typed in "boarding" or "delayed" by hand, and the
        passenger website showed it as if it were true. Now the message is
        worked out from the boat's own packets and it says when the boat is
        due at the next station.
      */}
      <p className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-tight text-ink-strong">
        {view.arrivalLabel}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-ink-muted">
        {view.seatsLabel}
      </p>
    </div>
  );
}
