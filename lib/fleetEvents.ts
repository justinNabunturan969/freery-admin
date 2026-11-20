/**
 * The event the console fires when the fleet or the stations change.
 *
 * The preview reads the database on its own every few seconds, so it would
 * catch the change anyway. This event makes it happen at once, while the
 * administrator is still looking at the screen.
 */
export const FLEET_CHANGED_EVENT = "freery:fleet-changed";

export function announceFleetChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FLEET_CHANGED_EVENT));
}
