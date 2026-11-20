import type { ReactNode } from "react";

/**
 * The small set of building blocks every admin and counter screen uses.
 *
 * The colours come from the shared Tailwind preset, which was sampled from
 * the reference screens, so the admin app looks like the public website.
 */

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
}) {
  return (
    <Tag
      className={`rounded-2xl border border-line bg-white shadow-card ${className}`}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  align = "between",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /**
   * "between" puts the action at the far right of the header. "start" keeps
   * everything packed to the left, next to the title, so the controls never
   * drift off to the side and the heading stays where the eye expects it.
   */
  align?: "between" | "start";
}) {
  return (
    <div
      className={`flex flex-wrap gap-3 border-b border-line px-5 py-4 ${
        align === "start"
          ? "items-center justify-start"
          : "items-start justify-between"
      }`}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink-strong">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="min-w-0 max-w-full">{action}</div> : null}
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
        {children}
      </h3>
      {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
    </div>
  );
}

type BadgeTone = "neutral" | "brand" | "warn" | "good" | "bad" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-[#eef1f3] text-ink-muted ring-[#dfe5e9]",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  warn: "bg-[#fdf1e3] text-[#9c4a0b] ring-[#f2ddc6]",
  good: "bg-[#e8f6f0] text-[#07805a] ring-[#c9e8db]",
  bad: "bg-[#fdeceb] text-[#a5342b] ring-[#f3d3d1]",
  info: "bg-[#eef2fb] text-[#3d4f9e] ring-[#d7dff4]",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-500 text-white hover:bg-brand-600 disabled:bg-brand-300 shadow-sm",
  secondary:
    "border border-line bg-white text-ink hover:border-brand-300 hover:bg-brand-50 disabled:text-ink-faint",
  danger:
    "border border-[#f3d3d1] bg-white text-[#a5342b] hover:bg-[#fdeceb] disabled:text-ink-faint",
  ghost: "text-ink-muted hover:bg-[#eef1f3] hover:text-ink-strong",
};

export function Button({
  children,
  variant = "secondary",
  type = "button",
  className = "",
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-ink-faint">{hint}</p> : null}
    </div>
  );
}

const CONTROL_CLASS =
  "min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${CONTROL_CLASS} ${className}`} {...rest} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select className={`${CONTROL_CLASS} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea className={`${CONTROL_CLASS} py-2.5 ${className}`} {...rest} />
  );
}

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "bad" | "good";
  children: ReactNode;
}) {
  const tones = {
    info: "border-[#d7dff4] bg-[#eef2fb] text-[#33437f]",
    warn: "border-[#f2ddc6] bg-[#fdf1e3] text-[#8a430a]",
    bad: "border-[#f3d3d1] bg-[#fdeceb] text-[#8f2c24]",
    good: "border-[#c9e8db] bg-[#e8f6f0] text-[#066a49]",
  };
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-semibold text-ink-strong">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** A short line under a table or a panel. */
export function Footnote({ children }: { children: ReactNode }) {
  return <p className="px-5 py-3 text-xs leading-relaxed text-ink-faint">{children}</p>;
}
