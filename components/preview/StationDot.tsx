import type { CSSProperties } from "react";
import type { PreviewStation } from "@/lib/preview";

/**
 * A station dot on the route diagram.
 *
 * The dot shrinks when there are more stations than the space can carry, so
 * the line never turns into a row of overlapping circles. The tap area stays
 * at least 44 px, so it is still comfortable to press even when the drawn dot
 * is only a few pixels wide.
 *
 * Each dot is a real button with a label, so it works with touch, mouse and
 * keyboard.
 */
export function StationDot({
  station,
  index,
  count,
  size,
  selected = false,
  onSelect,
  top,
  left,
  className = "",
}: {
  station: PreviewStation;
  index: number;
  count: number;
  /** The drawn diameter in pixels. */
  size: number;
  selected?: boolean;
  onSelect?: (stationId: number) => void;
  /** Vertical offset in pixels. */
  top?: number;
  /** Horizontal offset in pixels. Used by the vertical diagram. */
  left?: number;
  className?: string;
}) {
  const position = count > 1 ? (index / (count - 1)) * 100 : 50;
  const name = station.name || `Station ${index + 1}`;
  const label = selected
    ? `${name} selected, details below`
    : `${name}, ${station.isOpen ? "open" : "closed"}`;

  const style: CSSProperties = {};
  style.left = left === undefined ? `${position}%` : `${left}px`;
  if (top !== undefined) style.top = `${top}px`;

  // The border is a share of the dot, so the dot keeps its shape when it
  // shrinks instead of turning into a ring.
  const borderWidth = Math.max(1, Math.round(size * 0.19));

  const dot = (
    <span
      aria-hidden="true"
      className={`block rounded-full border transition-colors ${
        selected
          ? "border-brand-500 bg-brand-500"
          : station.isOpen
            ? "border-line-strong bg-white"
            : "border-slate-300 bg-slate-100"
      }`}
      style={{ width: size, height: size, borderWidth }}
    />
  );

  if (!onSelect) {
    return (
      <div
        className={`pointer-events-none absolute flex h-11 w-11 items-center justify-center ${className}`}
        style={style}
        title={name}
      >
        {dot}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(station.id)}
      aria-label={label}
      aria-pressed={selected}
      title={name}
      className={`absolute flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-brand-50 focus-visible:bg-brand-50 ${className}`}
      style={style}
    >
      {dot}
    </button>
  );
}
