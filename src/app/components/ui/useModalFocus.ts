import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus trap and return-focus for a modal dialog.
 *
 * `ContextSheet` and `CostTag`'s breakdown both open as a `role="dialog"`
 * over the page and already close on Escape and lock body scroll — but
 * neither moved focus into the dialog on open or gave it back on close, and
 * neither stopped `Tab` from walking straight out into the page hidden
 * behind the backdrop. Someone navigating by keyboard could tab into a
 * button under the dimmed passage list without ever having "entered" the
 * sheet that's actually on screen, and closing it left focus wherever that
 * wandered to rather than back on the button that opened it. One hook
 * instead of two copies of the same fix.
 *
 * Takes a ref instead of a boolean: both callers only mount their dialog
 * while it's open (`{open && <ContextSheet .../>}`,
 * `{open && <CostBreakdown .../>}`), so the hook's own mount *is* the
 * "opened" event, and its cleanup on unmount is the "closed" one.
 */
export function useModalFocus(containerRef: React.RefObject<HTMLElement | null>) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;

    const focusable = () =>
      container
        ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
        : [];

    focusable()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Wraps at both ends rather than letting Tab leave the dialog — the
      // backdrop behind it is inert while this is open, so there's nothing
      // outside worth tabbing into anyway.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Back to whatever had focus before the dialog opened — the button
      // that opened it, in every current caller — not the top of the page.
      previouslyFocused.current?.focus();
    };
  }, [containerRef]);
}
