import { ExternalIcon } from "@/components/ui/icons";

/**
 * The title of an operations page.
 *
 * The reference screens call it "Operations overview" and put the link to
 * the passenger website on the right, with the date and the time under it.
 *
 * On a narrow screen the link drops under the title and the date and the time
 * move under the title as well. The title and the description are always
 * there.
 */
export function OperationsHeader({
  title = "Operations overview",
  subtitle,
  siteUrl,
  stamp,
}: {
  title?: string;
  subtitle?: string;
  siteUrl: string;
  /** The date and the time, already formatted. */
  stamp: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{subtitle}</p>
        ) : null}
        <p className="mt-1 text-xs text-ink-faint sm:hidden">{stamp}</p>
      </div>

      <div className="flex w-full shrink-0 flex-col items-start gap-2 sm:w-auto sm:items-end">
        <a
          href={siteUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink-strong transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
        >
          View passenger site
          <ExternalIcon />
        </a>
        <span className="hidden text-xs text-ink-faint sm:block">{stamp}</span>
      </div>
    </div>
  );
}
