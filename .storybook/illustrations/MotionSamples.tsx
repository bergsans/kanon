import { useEffect, useState } from "react";
import { fontSans, ink, parchment } from "./theme";

/**
 * The four named animations, running on their real classes from
 * `globals.css` rather than described by name and duration — a table can
 * say "0.2s ease-out" but can't show what a slide feels like. The two
 * one-shot animations replay on a timer so the panel isn't static; `ping`
 * and `pulse` already loop on their own. All four fall silent under
 * `prefers-reduced-motion`, the same guard `globals.css` gives them —
 * this panel doesn't fake that, it inherits it.
 */
export function MotionSamples() {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCycle((c) => c + 1), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ margin: "1.5rem 0", display: "flex", flexWrap: "wrap", gap: "2rem", fontFamily: fontSans }}>
      <div style={{ width: 140, height: 80, overflow: "hidden", position: "relative", background: parchment[100] }}>
        <div
          key={`slide-${cycle}`}
          className="animate-menu-slide-in"
          style={{ position: "absolute", inset: 0, background: parchment[0], border: `1px solid ${parchment[300]}` }}
        />
        <p style={{ position: "absolute", bottom: 4, left: 6, fontSize: "0.6875rem", color: ink[600], margin: 0 }}>
          menu-slide-in
        </p>
      </div>

      <div style={{ width: 140, height: 80, position: "relative", background: parchment[100], overflow: "hidden" }}>
        {[14, 30, 46].map((top) => (
          <span key={top} style={{ position: "absolute", top, left: 10, right: 10, height: 6, background: parchment[300] }} />
        ))}
        {/* The tint is baked into the color itself (as the real `bg-ink-900/40`
            is), not the element's opacity — the animation's own opacity 0→1
            is the fade, layered on top of that already-tinted background,
            exactly as `CostTag`'s and `ContextSheet`'s backdrops do it. */}
        <div
          key={`fade-${cycle}`}
          className="animate-menu-backdrop-in"
          style={{ position: "absolute", inset: 0, background: "rgb(22 20 16 / 0.4)" }}
        />
        <p style={{ position: "absolute", bottom: 4, left: 6, fontSize: "0.6875rem", color: parchment[0], margin: 0 }}>
          menu-backdrop-in
        </p>
      </div>

      <div style={{ width: 140, height: 80, position: "relative", background: parchment[100] }}>
        <span
          className="motion-reduce:animate-none inline-block h-2 w-2 animate-ping rounded-full bg-accent-600"
          style={{ position: "absolute", top: 30, left: 66 }}
        />
        <p style={{ position: "absolute", bottom: 4, left: 6, fontSize: "0.6875rem", color: ink[600], margin: 0 }}>animate-ping</p>
      </div>

      <div style={{ width: 140, height: 80, position: "relative", background: parchment[100], padding: "10px 0.6rem" }}>
        <span className="motion-reduce:animate-none block h-3 w-full animate-pulse rounded bg-parchment-300" />
        <span className="motion-reduce:animate-none mt-2 block h-3 w-2/3 animate-pulse rounded bg-parchment-300" />
        <p style={{ position: "absolute", bottom: 4, left: 6, fontSize: "0.6875rem", color: ink[600], margin: 0 }}>animate-pulse</p>
      </div>
    </div>
  );
}
