"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  useConsoleTab,
  type ConsoleTabKey,
} from "@/components/console/ConsoleTabProvider";

export type { ConsoleTabKey };

export type ConsolePanelContextValue = {
  /** The panel that is on screen. */
  tab: ConsoleTabKey;
  /** Put the other panel on screen. The page is never left. */
  setTab: (next: ConsoleTabKey) => void;
};

const ConsolePanelContext = createContext<ConsolePanelContextValue | null>(null);

/**
 * The panel switch, when this component sits inside one.
 *
 * It is null when a section is used on its own, where there is nothing to
 * switch between.
 */
export function useConsolePanel(): ConsolePanelContextValue | null {
  return useContext(ConsolePanelContext);
}

// The layout effect only runs in the browser, where there is a layout.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The Ferries and Stations switch.
 *
 * The two panels share one place on the screen. Choosing one swaps the card
 * in place: the page is never left, the scroll stays where the administrator
 * left it, and a half typed edit is still there when the administrator comes
 * back to it.
 *
 * The address bar keeps up with the choice, so the console can be reloaded or
 * shared and still opens on the same panel.
 *
 * The switch also hands itself to the shell, so that "Station management" in
 * the top bar swaps this card instead of opening another page.
 */
export function ConsolePanelSwitch({
  initialTab,
  ferries,
  stations,
}: {
  initialTab: ConsoleTabKey;
  ferries: ReactNode;
  stations: ReactNode;
}) {
  const router = useRouter();
  const { registerSwitch, clearSwitch, reportTab } = useConsoleTab();
  const [tab, setTabState] = useState<ConsoleTabKey>(initialTab);
  const tabRef = useRef<ConsoleTabKey>(initialTab);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<number | null>(null);
  const focusPending = useRef(false);

  /**
   * The card that is on screen.
   *
   * The panel wrapper has no box of its own, because it only holds the panel
   * that is on show. The card inside it is what has a place on the screen,
   * and that is what has to be measured.
   */
  const visibleCard = useCallback((): HTMLElement | null => {
    const panels = wrapRef.current?.querySelectorAll<HTMLElement>(
      "[id^='console-panel-']",
    );
    if (!panels) return null;
    for (const panel of panels) {
      if (panel.classList.contains("hidden")) continue;
      return panel.firstElementChild as HTMLElement | null;
    }
    return null;
  }, []);

  // The server decides the panel on the first render, and again after a
  // navigation, so a link that carries ?tab= always wins over what is on
  // screen.
  useIsomorphicLayoutEffect(() => {
    tabRef.current = initialTab;
    setTabState(initialTab);
  }, [initialTab]);

  const setTab = useCallback(
    (next: ConsoleTabKey) => {
      if (next === tabRef.current) return;

      // Remember where the card sits on the screen, so the swap keeps the
      // administrator in the same place.
      const card = visibleCard();
      if (card) anchorRef.current = card.getBoundingClientRect().top;

      focusPending.current = true;
      tabRef.current = next;
      setTabState(next);

      // The address bar follows the choice, but the page is never left: the
      // card changes its content in place and the scroll is left alone.
      //
      // The router is asked to do it, and not the browser's history, because
      // the router has to stay in step with the address. Changing the address
      // behind the router's back leaves it looking for the wrong page, and
      // the next link the administrator presses does nothing.
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      router.replace(`${url.pathname}?${url.searchParams.toString()}`, {
        scroll: false,
      });
    },
    [router],
  );

  // The top bar can ask for a panel. It gets this handle.
  useIsomorphicLayoutEffect(() => {
    registerSwitch(setTab);
    return () => clearSwitch();
  }, [registerSwitch, clearSwitch, setTab]);

  // The top bar shows which panel is on screen.
  useIsomorphicLayoutEffect(() => {
    reportTab(tab);
  }, [reportTab, tab]);

  // The two panels are not the same height, so the swap can move the card
  // under the administrator's eyes. The anchor puts it back.
  useIsomorphicLayoutEffect(() => {
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (anchor === null) return;
    const card = visibleCard();
    if (!card) return;
    const delta = card.getBoundingClientRect().top - anchor;
    if (Math.abs(delta) > 0.5) {
      window.scrollBy({ top: delta, behavior: "auto" });
    }
  }, [tab]);

  // The tab bar of the panel that just came on screen takes the focus, so the
  // keyboard does not fall back to the top of the page.
  useIsomorphicLayoutEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-console-tab-button]"),
    );
    const active = buttons.find(
      (button) =>
        button.getAttribute("aria-selected") === "true" &&
        button.offsetParent !== null,
    );
    active?.focus({ preventScroll: true });
  }, [tab]);

  const contextValue = useMemo(() => ({ tab, setTab }), [tab, setTab]);

  return (
    <ConsolePanelContext.Provider value={contextValue}>
      <div ref={wrapRef} className="min-w-0">
        <div
          id="console-panel-ferries"
          role="tabpanel"
          aria-label="Ferry management"
          className={tab === "ferries" ? "contents" : "hidden"}
        >
          {ferries}
        </div>
        <div
          id="console-panel-stations"
          role="tabpanel"
          aria-label="Station management"
          className={tab === "stations" ? "contents" : "hidden"}
        >
          {stations}
        </div>
      </div>
    </ConsolePanelContext.Provider>
  );
}
