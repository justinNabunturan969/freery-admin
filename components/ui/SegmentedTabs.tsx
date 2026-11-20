"use client";

import { useRef } from "react";
import {
  useConsolePanel,
  type ConsolePanelContextValue,
  type ConsoleTabKey,
} from "@/components/console/ConsolePanelSwitch";

/**
 * The small switch between the fleet and the stations.
 *
 * It swaps the card in place: the page is never left, so the administrator
 * keeps their place and the scroll stays where it was. The arrow keys move
 * between the two choices, the way a tab bar is expected to work.
 *
 * Without a panel switch there is nothing to switch between, so the control
 * is not drawn at all.
 */
export function SegmentedTabs({
  tabs,
  className = "",
}: {
  tabs: { key: ConsoleTabKey; label: string }[];
  className?: string;
}) {
  const panel = useConsolePanel();

  if (!panel) return null;

  return <SegmentedTabList tabs={tabs} className={className} panel={panel} />;
}

function SegmentedTabList({
  tabs,
  className,
  panel,
}: {
  tabs: { key: ConsoleTabKey; label: string }[];
  className: string;
  panel: ConsolePanelContextValue;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const current = panel.tab;

  function focusButton(key: ConsoleTabKey) {
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-console-tab-button="${key}"]`,
        )
        ?.focus();
    });
  }

  function move(step: number) {
    const index = tabs.findIndex((tab) => tab.key === current);
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (!next) return;
    panel.setTab(next.key);
    focusButton(next.key);
  }

  function moveTo(key: ConsoleTabKey | undefined) {
    if (!key || key === current) return;
    panel.setTab(key);
    focusButton(key);
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Fleet or stations"
      className={`inline-flex rounded-xl border border-line bg-white p-1 ${className}`}
    >
      {tabs.map((tab) => {
        const selected = tab.key === current;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`console-panel-${tab.key}`}
            tabIndex={selected ? 0 : -1}
            data-console-tab-button={tab.key}
            onClick={() => panel.setTab(tab.key)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                move(1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                move(-1);
              } else if (event.key === "Home") {
                event.preventDefault();
                moveTo(tabs[0]?.key);
              } else if (event.key === "End") {
                event.preventDefault();
                moveTo(tabs[tabs.length - 1]?.key);
              }
            }}
            className={`inline-flex min-h-[36px] items-center rounded-lg px-4 text-sm font-medium transition-colors ${
              selected
                ? "bg-brand-500 text-white shadow-sm"
                : "text-ink-muted hover:bg-[#eef1f3] hover:text-ink-strong"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
