"use client";

import { useEffect } from "react";
import { Alert, Button, Card, CardHeader } from "@/components/ui/primitives";
import { PageHeader } from "@/components/admin/PageHeader";

/**
 * The console's own error page.
 *
 * A mistake in the browser used to leave the reader with nothing but
 * "Application error: a client-side exception has occurred". That says nothing
 * about what went wrong and offers nothing to do about it.
 *
 * This page says what happened and offers the one thing that helps: another
 * try. It sits on the console, so every page under it is covered.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader
        title="This page did not open"
        description="Something went wrong in the browser. Nothing was changed, so the data is as it was."
      />

      <Card>
        <CardHeader
          title="The console could not draw this page"
          description="Trying again usually clears it. If it keeps happening, the browser's console has the details."
        />
        <div className="space-y-4 px-5 pb-5">
          <Alert tone="warn">
            {error.message
              ? `The error said: ${error.message}`
              : "The error did not say what it was."}
          </Alert>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => reset()}>
              Try again
            </Button>
            <a
              href="/"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-brand-300 hover:bg-brand-50"
            >
              Back to the overview
            </a>
          </div>
        </div>
      </Card>
    </>
  );
}
