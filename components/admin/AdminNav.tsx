"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import {
  useConsoleTab,
  type ConsoleTabKey,
} from "@/components/console/ConsoleTabProvider";

/**
 * One entry in the top bar.
 *
 * An entry with a panel belongs to the console box. Its href is where the
 * browser goes when the entry is used as a plain link, which is what happens
 * on the sections that do not hold the box.
 */
export type AdminLink = {
  /** The route the entry belongs to. */
  path: string;
  /** Where the browser goes when the entry is used as a link. */
  href: string;
  label: string;
  /** The console panel this entry shows. */
  tab?: ConsoleTabKey;
};

export const ADMIN_LINKS: AdminLink[] = [
  { path: "/overview", href: "/overview", label: "Overview", tab: "ferries" },
  {
    path: "/overview",
    href: "/overview?tab=stations",
    label: "Station management",
    tab: "stations",
  },
  { path: "/sessions", href: "/sessions", label: "Sessions" },
  { path: "/gps-test", href: "/gps-test", label: "GPS test" },
  { path: "/hardware", href: "/hardware", label: "Hardware" },
  { path: "/logs", href: "/logs", label: "Logs" },
  { path: "/accounts", href: "/accounts", label: "Accounts" },
];

/**
 * The sections of the station app.
 *
 * The same bar as the console, with the station app's own sections in it. The
 * station administrator gets the fleet and the stations on the dashboard, the
 * counting screen, and the read only pages. The fleet and the stations stay
 * read only for them, which is enforced by the database and not by the screen.
 */
export const COUNTER_LINKS: AdminLink[] = [
  { path: "/overview", href: "/overview", label: "Home", tab: "ferries" },
  {
    path: "/overview",
    href: "/overview?tab=stations",
    label: "Stations",
    tab: "stations",
  },
  { path: "/counter", href: "/counter", label: "Count" },
  { path: "/sessions", href: "/sessions", label: "Sessions" },
  { path: "/gps-test", href: "/gps-test", label: "GPS test" },
  { path: "/hardware", href: "/hardware", label: "Hardware" },
  { path: "/logs", href: "/logs", label: "Logs" },
  { path: "/accounts", href: "/accounts", label: "Accounts" },
];

/**
 * The top bar, and the narrow screen menu, in one place.
 *
 * The two fleet entries are real links, so they can be opened in a new tab
 * and they still work when the scripts do not. When the console box is on the
 * screen the click is taken over, and the card is swapped in place: the
 * administrator never leaves the page and never loses their place on it.
 */
export function useConsoleNav() {
  const pathname = usePathname();
  const { tab, hasPanel, selectTab } = useConsoleTab();

  /**
   * True when the console box is on the screen.
   *
   * The page knows it by its address, and the box knows it by being there.
   * Either one is enough.
   */
  const consoleOpen = pathname === "/overview" || hasPanel;

  /** The panel on screen. The ferries until the box says otherwise. */
  const shownTab: ConsoleTabKey = tab ?? "ferries";

  function isActive(link: AdminLink): boolean {
    if (link.tab) return consoleOpen && shownTab === link.tab;
    return pathname === link.path || pathname.startsWith(`${link.path}/`);
  }

  /**
   * Swap the card in place.
   *
   * It answers false when there is no card on the screen, so the link is left
   * to do its own work.
   */
  function openConsole(next: ConsoleTabKey): boolean {
    return selectTab(next);
  }

  /** Take over a click on a fleet entry, but only a plain left click. */
  function takeOverClick(
    event: MouseEvent<HTMLAnchorElement>,
    next: ConsoleTabKey,
  ): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;
    if (!openConsole(next)) return;
    event.preventDefault();
  }

  return { consoleOpen, shownTab, isActive, openConsole, takeOverClick };
}

/**
 * The top bar navigation.
 *
 * The reference screens put the admin sections in a bar across the top, so
 * the whole console is one click deep on any screen. The station app uses the
 * same bar with its own sections in it, so the two look the same however
 * wide the screen is.
 */
export function AdminNav({ links = ADMIN_LINKS }: { links?: AdminLink[] }) {
  const { isActive, takeOverClick } = useConsoleNav();

  return (
    <nav
      aria-label="Admin sections"
      className="-mx-1 hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 pb-0.5 lg:flex"
    >
      {links.map((link) => {
        const active = isActive(link);
        const className = `inline-flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
          active
            ? "bg-brand-50 font-semibold text-brand-700"
            : "text-ink-muted hover:bg-[#eef1f3] hover:text-ink-strong"
        }`;

        return (
          <Link
            key={link.label}
            href={link.href}
            aria-current={active ? "page" : undefined}
            data-console-nav-tab={link.tab}
            onClick={
              link.tab ? (event) => takeOverClick(event, link.tab as ConsoleTabKey) : undefined
            }
            className={className}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
