import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink-strong">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {/*
       * The action keeps its own width, but it is never wider than the page,
       * so two buttons on a narrow screen wrap onto two lines instead of
       * pushing the page sideways.
       */}
      {action ? <div className="min-w-0 max-w-full shrink-0">{action}</div> : null}
    </div>
  );
}
