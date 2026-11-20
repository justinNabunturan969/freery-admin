"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ConsoleTabKey = "ferries" | "stations";

export type ConsoleTabContextValue = {
  /**
   * The panel that is on screen. It is null until the panel switch mounts, so
   * the shell knows it is not looking at the console box.
   */
  tab: ConsoleTabKey | null;
  /**
   * True while the console box is on the page.
   *
   * The shell uses it to know that the two fleet entries are about the box
   * in front of them and not about another page.
   */
  hasPanel: boolean;
  /**
   * Put a panel on screen without leaving the page.
   *
   * It answers false when the console box is not on the page, so the caller
   * can fall back to a normal navigation.
   */
  selectTab: (next: ConsoleTabKey) => boolean;
  /** The panel switch tells the shell which panel is on screen. */
  reportTab: (tab: ConsoleTabKey) => void;
  /** The panel switch hands the shell the handle that changes the panel. */
  registerSwitch: (set: (next: ConsoleTabKey) => void) => void;
  /** The panel switch left the page. */
  clearSwitch: () => void;
};

const ConsoleTabContext = createContext<ConsoleTabContextValue | null>(null);

/**
 * The console box, shared by the page and the shell around it.
 *
 * The Ferries and Stations card lives in the page, but the top bar sits above
 * it. This provider is the one place the two can meet, so that "Station
 * management" in the bar swaps the card in place instead of opening a
 * different page.
 *
 * The switch itself keeps the truth about which panel is on screen. The
 * provider only mirrors it and passes on the command, so there is one answer
 * to "what is showing" and one way to change it.
 */
export function ConsoleTabProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<ConsoleTabKey | null>(null);
  const [hasPanel, setHasPanel] = useState(false);
  const switcher = useRef<((next: ConsoleTabKey) => void) | null>(null);

  const reportTab = useCallback((next: ConsoleTabKey) => {
    setTab(next);
  }, []);

  const registerSwitch = useCallback((set: (next: ConsoleTabKey) => void) => {
    switcher.current = set;
    setHasPanel(true);
  }, []);

  const clearSwitch = useCallback(() => {
    switcher.current = null;
    setHasPanel(false);
    setTab(null);
  }, []);

  const selectTab = useCallback((next: ConsoleTabKey) => {
    const change = switcher.current;
    if (!change) return false;
    change(next);
    return true;
  }, []);

  const value = useMemo(
    () => ({ tab, hasPanel, selectTab, reportTab, registerSwitch, clearSwitch }),
    [tab, hasPanel, selectTab, reportTab, registerSwitch, clearSwitch],
  );

  return (
    <ConsoleTabContext.Provider value={value}>{children}</ConsoleTabContext.Provider>
  );
}

/**
 * The console box, for the shell around it.
 *
 * It always answers, so a component can ask for the panel without caring
 * whether the console box is on the page.
 */
export function useConsoleTab(): ConsoleTabContextValue {
  const value = useContext(ConsoleTabContext);
  if (value) return value;

  return {
    tab: null,
    hasPanel: false,
    selectTab: () => false,
    reportTab: () => undefined,
    registerSwitch: () => undefined,
    clearSwitch: () => undefined,
  };
}
