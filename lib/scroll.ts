/**
 * Scrolling helpers.
 *
 * The console scrolls a lot: the administrator moves between the fleet table
 * and the update panel, and the page keeps its place while the panel changes.
 */

/**
 * Brings an element into view, but only as far as it has to.
 *
 * On a wide screen the update panel is already on screen, so nothing moves.
 * On a narrow screen it is below the table, so it comes into view.
 *
 * A reader who asked for less motion gets an instant move instead of a
 * smooth one.
 */
export function scrollIntoViewNear(element: HTMLElement | null): void {
  if (!element) return;
  const reduced =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  element.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    block: "nearest",
    inline: "nearest",
  });
}
