import { fontSans, ink, parchment } from "./theme";

/**
 * The two shadow tokens as real `box-shadow`, not an SVG blur that
 * approximates them — the difference between them is small, and an
 * approximation would show a difference that isn't the real one. HTML
 * rather than `GuideFigure` for the same reason: SVG has no box-shadow.
 */
const SHADOWS = [
  { token: "shadow-sheet", use: "Rests on the page — used twice: the corpus filter, a cost card" },
  { token: "shadow-lift", use: "Floats above it — used everywhere else: the search box, menus, dialogs, the context sheet" },
] as const;

export function ShadowSamples() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "2rem", margin: "1.5rem 0", padding: "1.5rem", background: parchment[50], fontFamily: fontSans }}>
      {SHADOWS.map((s) => (
        <figure key={s.token} style={{ margin: 0, flex: "1 1 12rem", maxWidth: "16rem" }}>
          <div style={{ height: "4.5rem", background: parchment[0], boxShadow: `var(--${s.token})` }} />
          <figcaption style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: ink[900], fontWeight: 600 }}>
            {s.token}
          </figcaption>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: ink[600] }}>{s.use}</p>
        </figure>
      ))}
    </div>
  );
}
