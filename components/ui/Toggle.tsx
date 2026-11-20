"use client";

/**
 * The on and off switch.
 *
 * Used for the in operation flag of a ferry and for the open and closed
 * state of a station. The state is never colour alone, the switch carries
 * the text next to it and it has a screen reader label.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
        checked
          ? "border-brand-500 bg-brand-500"
          : "border-[#c7d2d9] bg-[#dde4e8]"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}
