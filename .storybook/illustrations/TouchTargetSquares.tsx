import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * `h-6` at 100% and at the "small text" setting's 80%, concentric so the
 * shortfall reads as a gap rather than two numbers. Drawn at 4x; the ratio
 * is what's real, not the pixels.
 */
const SCALE = 4;
const WCAG_MIN_PX = 24;
const SHRUNK_PX = 19.2;
const LABEL = `Touch target at two sizes: WCAG 2.5.8's ${WCAG_MIN_PX}px minimum, shown as a dashed outline, against the ${SHRUNK_PX}px the same control shrinks to at the app's own "small text" setting — a real shortfall, not a rounding difference.`;

const WIDTH = 300;
const HEIGHT = 170;
const CENTER_X = WIDTH / 2;
const CENTER_Y = 76;

export function TouchTargetSquares() {
  const outer = WCAG_MIN_PX * SCALE;
  const inner = SHRUNK_PX * SCALE;

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <rect
        x={CENTER_X - outer / 2}
        y={CENTER_Y - outer / 2}
        width={outer}
        height={outer}
        fill="none"
        stroke={parchment[300]}
        strokeWidth={1.5}
        strokeDasharray="4,3"
      />
      <rect
        x={CENTER_X - inner / 2}
        y={CENTER_Y - inner / 2}
        width={inner}
        height={inner}
        fill={accent[600]}
        fillOpacity={0.15}
        stroke={accent[600]}
        strokeWidth={1.5}
      />
      <text x={CENTER_X} y={CENTER_Y - outer / 2 - 12} textAnchor="middle" fontSize={11} fill={ink[600]}>
        {WCAG_MIN_PX}px minimum
      </text>
      <text x={CENTER_X} y={CENTER_Y + outer / 2 + 22} textAnchor="middle" fontSize={11} fontWeight={600} fill={ink[900]}>
        {SHRUNK_PX}px at "small text"
      </text>
    </GuideFigure>
  );
}
