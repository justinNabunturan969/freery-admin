"use client";

/**
 * The minus, number and plus control.
 *
 * The buttons are 48 pixels tall so they are comfortable to press with a
 * finger, and the number in the middle is the current value.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div className="flex items-center overflow-hidden rounded-xl border border-line bg-white">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Remove one ${label}`}
        className="min-h-[48px] min-w-[52px] text-xl font-semibold text-ink-strong transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:text-ink-faint disabled:hover:bg-white"
      >
        &minus;
      </button>
      <div
        className="flex h-12 min-w-0 flex-1 items-center justify-center border-x border-line text-lg font-semibold text-ink-strong"
        aria-live="polite"
      >
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`Add one ${label}`}
        className="min-h-[48px] min-w-[52px] text-xl font-semibold text-ink-strong transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:text-ink-faint disabled:hover:bg-white"
      >
        +
      </button>
    </div>
  );
}
