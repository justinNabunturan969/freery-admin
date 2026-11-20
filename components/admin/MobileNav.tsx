"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useConsoleNav, type AdminLink } from "@/components/admin/AdminNav";
import type { ConsoleTabKey } from "@/components/console/ConsoleTabProvider";

/**
 * The menu on a narrow screen.
 *
 * On a small screen the top bar keeps the logo, the view badge and the
 * burger, and the sections slide out of the side when it is pressed.
 *
 * The drawer is put at the end of the document, because the top bar has a
 * blur on it, and a blurred box holds on to anything fixed inside it. Left
 * in the bar, the drawer would be squeezed into the bar and its links could
 * not be pressed.
 */
export function MobileNav({
  links,
  badgeLabel,
}: {
  links: AdminLink[];
  badgeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { isActive, takeOverClick } = useConsoleNav();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the menu"
        aria-expanded={open}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-strong transition-colors hover:bg-[#eef1f3] lg:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open && mounted
        ? createPortal(
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                aria-label="Close the menu"
                onClick={() => setOpen(false)}
                className="absolute inset-0 bg-navy/30"
              />
              <nav
                aria-label="Admin sections"
                className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-lift"
              >
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <span className="text-sm font-semibold text-ink-strong">Freery</span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close the menu"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted hover:bg-[#eef1f3]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="h-5 w-5"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
                <ul className="flex-1 overflow-y-auto p-2">
                  {links.map((link) => {
                    const active = isActive(link);
                    const className = `flex min-h-[48px] w-full items-center rounded-xl px-3 text-sm font-medium ${
                      active
                        ? "bg-brand-50 text-brand-700"
                        : "text-ink-muted hover:bg-[#eef1f3] hover:text-ink-strong"
                    }`;

                    return (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          aria-current={active ? "page" : undefined}
                          data-console-nav-tab={link.tab}
                          onClick={
                            link.tab
                              ? (event) => {
                                  takeOverClick(event, link.tab as ConsoleTabKey);
                                  setOpen(false);
                                }
                              : undefined
                          }
                          className={className}
                        >
                          {link.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <div className="border-t border-line px-4 py-3">
                  <span className="rounded-md bg-[#fdf1e3] px-2 py-1 text-xs font-medium text-[#9c4a0b]">
                    {badgeLabel}
                  </span>
                </div>
              </nav>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
