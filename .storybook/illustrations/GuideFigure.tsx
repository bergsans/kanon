import type { ReactNode } from "react";
import { fontSans } from "./theme";

/**
 * `role="img"` + `aria-label` rather than `aria-hidden`: the figures carry
 * facts the prose around them no longer repeats, so the label is where that
 * fact survives for a screen-reader user. One sentence — the figure's
 * headline, not a transcript of every value.
 */
export function GuideFigure({
  children,
  width,
  height,
  label,
}: {
  children: ReactNode;
  width: number;
  height: number;
  label: string;
}) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxWidth: width, height: "auto", display: "block", margin: "1.5rem 0", fontFamily: fontSans }}
    >
      {children}
    </svg>
  );
}
