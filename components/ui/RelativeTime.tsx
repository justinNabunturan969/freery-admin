"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/components/ui/stats";

/**
 * A relative time that does not fight the server.
 *
 * The server and the browser both render this component, and one second
 * apart is enough for "5 seconds ago" to become "6 seconds ago". React calls
 * that a hydration error, so the first render keeps the text the server sent
 * and the time is refreshed once the page is live.
 */
export function RelativeTime({
  iso,
  className,
}: {
  iso: string | null;
  className?: string;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(timeAgo(iso));
  }, [iso]);

  return (
    <span className={className} suppressHydrationWarning>
      {label ?? timeAgo(iso)}
    </span>
  );
}
