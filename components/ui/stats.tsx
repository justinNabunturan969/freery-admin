import type { ReactNode } from "react";
import { STATUS_LABELS, type FerryStatus } from "@freery/shared";

/**
 * Statistic cards, status pills and meters.
 *
 * A status is always a word plus a dot, never colour alone.
 */

export function StatCard({
  label,
  value,
  unit,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: "default" | "brand" | "warn";
  /** A small line drawing in the top right corner of the card. */
  icon?: ReactNode;
}) {
  const tones = {
    default: "text-ink-strong",
    brand: "text-brand-600",
    warn: "text-[#9c4a0b]",
  };
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">
          {label}
        </p>
        {icon ? (
          <span className="shrink-0 text-ink-faint" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${tones[tone]}`}>
        {value}
        {unit ? (
          <span className="ml-1 text-base font-medium text-ink-muted">{unit}</span>
        ) : null}
      </p>
      {hint ? (
        <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const STATUS_TONE: Record<FerryStatus, { dot: string; text: string; label: string }> = {
  DOCKED: { dot: "bg-[#64748b]", text: "text-ink-muted", label: "Docked" },
  IN_TRANSIT: { dot: "bg-[#0e9f6e]", text: "text-[#07805a]", label: "Underway" },
  OFFLINE: { dot: "bg-[#9aa7b1]", text: "text-ink-muted", label: "Out of service" },
};

export function StatusPill({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  const tone = STATUS_TONE[status as FerryStatus] ?? STATUS_TONE.OFFLINE;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full bg-[#eef1f3] px-2.5 py-1 text-xs font-medium ${tone.text} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
      {tone.label}
    </span>
  );
}

/** A thin bar for a seat count or a percentage. */
export function Meter({
  value,
  max,
  tone = "brand",
  label,
}: {
  value: number;
  max: number;
  tone?: "brand" | "good" | "warn" | "bad";
  label?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const tones = {
    brand: "bg-brand-500",
    good: "bg-[#0e9f6e]",
    warn: "bg-[#c2611c]",
    bad: "bg-[#c2453b]",
  };
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[#eef1f3]"
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ?? `${value} of ${max}`}
    >
      <div className={`h-full rounded-full ${tones[tone]}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * The date helpers live in lib/format so that the server pages and the
 * browser components all print the same Philippine time. They are re-exported
 * here because most of the screens import their formatters from this file.
 */
export {
  formatDate,
  formatDateTime,
  formatTime,
  manilaDateInput,
  manilaDateTimeToIso,
  manilaParts,
  manilaTimeInput,
} from "@/lib/format";

/** Turns a timestamp into something a person can read. */
export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export { STATUS_LABELS };
