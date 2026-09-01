"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  isTextSize,
  ROOT_SCALE,
  TEXT_SIZE_STORAGE_KEY,
  TEXT_SIZES,
  type TextSize,
} from "@/lib/text-size";

// Re-exported: every existing importer of this module reached the two
// constants through this path, and they only moved to `@/lib/text-size`
// because the root layout's inline script (see `layout.tsx`) needed them
// too and must not depend on a `"use client"` module.
export { TEXT_SIZES, type TextSize };

const DEFAULT_SIZE: TextSize = "md";

interface TextSizeContextValue {
  size: TextSize;
  setSize: (size: TextSize) => void;
}

const TextSizeContext = createContext<TextSizeContextValue>({
  size: DEFAULT_SIZE,
  setSize: () => {},
});

/**
 * The reading view's font size, remembered per browser.
 *
 * Unlike the locale, nothing server-rendered depends on this — it only ever
 * sets the `<html>` element's inline `font-size` on the client — so it lives
 * in `localStorage` instead of a cookie and needs no request round-trip.
 *
 * The state starts at "md" here, same as ever — but by the time this
 * component mounts, the root layout's inline script (`beforeInteractive`,
 * see `layout.tsx`) has already applied the stored size directly to
 * `<html>`, before first paint. React's own state still has to agree with
 * the DOM it's about to start managing — the localStorage-reading effect
 * below brings `size` in line with it, and the font-size effect after it
 * skips its own first run rather than re-applying "md" over what the
 * inline script already got right (see that effect's own comment for why
 * that write, not skipping it, used to be the source of the flash this
 * whole mechanism exists to prevent).
 */
export function TextSizeProvider({ children }: { children: React.ReactNode }) {
  const [size, setSizeState] = useState<TextSize>(DEFAULT_SIZE);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
      if (isTextSize(stored)) setSizeState(stored);
    } catch {
      // Private browsing, or storage disabled outright: the default stands.
    }
  }, []);

  // Skips its own very first run — the doc comment above says the mount
  // write is "a no-op against what the inline script already applied", but
  // it wasn't: this effect and the localStorage-reading one above both run
  // after the same first commit, in declaration order, and *within that
  // commit* the state update the first effect queues hasn't taken effect
  // yet — this effect's `size` closure is still "md" regardless of what's
  // actually stored. Writing it anyway overwrote the inline script's
  // already-correct value with "md" for one paint, then snapped to the
  // right size once the queued update caused a re-render — the exact flash
  // the inline script exists to prevent. Skipping the first invocation
  // entirely leaves the DOM exactly as the inline script left it; every
  // later invocation — the stored preference loading, or a click on the
  // switch — still writes normally.
  const skipFirstWrite = useRef(true);
  useEffect(() => {
    if (skipFirstWrite.current) {
      skipFirstWrite.current = false;
      return;
    }
    document.documentElement.style.fontSize = ROOT_SCALE[size];
  }, [size]);

  const setSize = useCallback((next: TextSize) => {
    setSizeState(next);
    try {
      localStorage.setItem(TEXT_SIZE_STORAGE_KEY, next);
    } catch {
      // Nothing to persist to — the choice still applies for this page load.
    }
  }, []);

  return (
    <TextSizeContext value={{ size, setSize }}>{children}</TextSizeContext>
  );
}

export function useTextSize(): TextSizeContextValue {
  return use(TextSizeContext);
}
