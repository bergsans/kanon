/**
 * CSS-variable handles for the guide's illustrations, so a figure reads the
 * live `@theme` in `globals.css` instead of a hex copy that drifts the next
 * time the palette changes — it already has once, Silverstift → Rödkrita.
 *
 * Accent marks the one thing a figure points at (a threshold, a skipped
 * heading level), never a generic series color — the guide's own rule
 * applied to its illustrations.
 */
export const ink = {
  400: "var(--color-ink-400)",
  600: "var(--color-ink-600)",
  800: "var(--color-ink-800)",
  900: "var(--color-ink-900)",
} as const;

export const parchment = {
  0: "var(--color-parchment-0)",
  50: "var(--color-parchment-50)",
  100: "var(--color-parchment-100)",
  200: "var(--color-parchment-200)",
  300: "var(--color-parchment-300)",
} as const;

export const accent = {
  600: "var(--color-accent-600)",
  700: "var(--color-accent-700)",
} as const;

export const fontSans = "var(--font-sans)";
export const fontSerif = "var(--font-serif)";
/**
 * Unlike the two above, `--font-mono` has no entry in `@theme` — the same
 * gap `font-mono` falls into in the app itself (see Design guide/Known
 * issues), so this reads the browser's monospace stack instead of a token
 * that doesn't exist, deliberately mirroring that rather than papering over
 * it.
 */
export const fontMono = "ui-monospace, monospace";
