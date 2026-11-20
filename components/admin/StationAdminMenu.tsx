"use client";

import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/admin/SignOutButton";

/**
 * The account menu in the top right.
 *
 * It shows who is signed in and what they are allowed to do, and it is the
 * way out of the app.
 */
export function StationAdminMenu({
  name,
  role,
  username,
}: {
  name: string;
  role: string;
  username: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const roleLabel = role === "ADMIN" ? "Master administrator" : "Station administrator";

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink-strong transition-colors hover:border-brand-300 hover:bg-brand-50"
      >
        {roleLabel}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-line bg-white p-3 shadow-lift"
        >
          <p className="text-sm font-semibold text-ink-strong">{name}</p>
          <p className="truncate text-xs text-ink-muted">{username}</p>
          <p className="mt-2 rounded-lg bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
            {roleLabel}
          </p>
          <div className="mt-3">
            <SignOutButton className="w-full justify-center" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
