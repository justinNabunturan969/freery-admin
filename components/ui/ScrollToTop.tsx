"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Puts the reader back at the top of the page after a change of page.
 *
 * A browser keeps the scroll position when it moves to another page, so
 * choosing a section in the top bar would otherwise drop the reader half way
 * down a page they have not seen yet.
 *
 * A link with an anchor is left alone, because the browser is about to take
 * the reader to that anchor.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
