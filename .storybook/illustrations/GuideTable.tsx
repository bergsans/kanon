import type { ReactNode } from "react";
import { fontSans, ink, parchment } from "./theme";

/**
 * Storybook's docs renderer applies no CSS at all to a markdown pipe table —
 * there's no `.sbdocs`-style base sheet in this version — and Tailwind's
 * preflight, imported globally in preview.tsx for every story, strips the
 * browser defaults (borders, cell padding, `border-collapse`) it would
 * otherwise have fallen back to. The result is every cell's text run
 * together with no grid, which is what reads as a failed table. A wrapping
 * `<div>` can't fix it with an inline `style` prop — border and padding
 * aren't inherited CSS properties, so nothing on an ancestor reaches the
 * `<td>`/`<th>` elements the markdown compiles to — so this scopes a real
 * stylesheet under one class instead.
 */
export function GuideTable({ children }: { children: ReactNode }) {
  return (
    <div className="guide-table">
      <style>{`
        .guide-table { overflow-x: auto; margin: 1.5rem 0; }
        .guide-table table { width: 100%; border-collapse: collapse; font-family: ${fontSans}; font-size: 0.875rem; line-height: 1.4; }
        .guide-table th, .guide-table td { text-align: left; vertical-align: top; padding: 0.5rem 0.9rem 0.5rem 0; border-bottom: 1px solid ${parchment[200]}; }
        .guide-table th { color: ${ink[600]}; font-weight: 500; border-bottom: 1px solid ${parchment[300]}; white-space: nowrap; }
        .guide-table td { color: ${ink[800]}; }
        .guide-table td code, .guide-table th code { font-family: ui-monospace, monospace; font-size: 0.85em; }
        .guide-table tr:last-child td { border-bottom: none; }
      `}</style>
      {children}
    </div>
  );
}
