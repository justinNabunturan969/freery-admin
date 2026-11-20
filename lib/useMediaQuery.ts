"use client";

import { useSyncExternalStore } from "react";

/**
 * Read a media query without breaking hydration.
 *
 * useSyncExternalStore is given the desktop value for the server snapshot and
 * the real value on the client, so React hydrates with the same markup it
 * rendered on the server and then corrects itself after hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  };

  const getSnapshot = () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  };

  /** Always false on the server, so the desktop layout is the first paint. */
  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * True on narrow screens. The route diagram is drawn horizontally on a wide
 * screen and vertically on a narrow one, the same way the passenger website
 * does it.
 */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
