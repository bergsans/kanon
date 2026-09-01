import { GuideFigure } from "./GuideFigure";
import { ink } from "./theme";

/**
 * The three real backdrops side by side — `ink-900` at its real opacity,
 * blurred via an SVG filter where the class does the same — over the same
 * placeholder content so only the backdrop changes between panels. Two
 * dialogs share a look; the drawer doesn't quite, and the two dropdown
 * menus have none at all.
 */
const PANELS = [
  { label: "ContextSheet, CostTag", opacity: 0.4, blurred: true },
  { label: "NavMenu drawer", opacity: 0.3, blurred: false },
  { label: "ExportMenu, SaveToProject", opacity: 0, blurred: false },
] as const;
const LABEL = `Three backdrop treatments: ContextSheet and CostTag use ink-900 at 40 percent, blurred; the NavMenu drawer uses 30 percent, not blurred; ExportMenu and SaveToProject use no backdrop at all.`;

const WIDTH = 480;
const HEIGHT = 128;
const PANEL_W = 140;
const PANEL_H = 88;

export function BackdropCompare() {
  const gap = (WIDTH - PANEL_W * 3) / 4;

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <defs>
        <filter id="backdrop-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={1.6} />
        </filter>
      </defs>
      {PANELS.map((p, i) => {
        const x = gap + i * (PANEL_W + gap);
        return (
          <g key={p.label} transform={`translate(${x},0)`}>
            <rect width={PANEL_W} height={PANEL_H} fill="var(--color-parchment-50)" />
            {[14, 30, 46].map((ly) => (
              <rect key={ly} x={10} y={ly} width={PANEL_W - 20} height={6} fill="var(--color-parchment-300)" />
            ))}
            {p.opacity > 0 && (
              <rect
                width={PANEL_W}
                height={PANEL_H}
                fill={ink[900]}
                opacity={p.opacity}
                filter={p.blurred ? "url(#backdrop-blur)" : undefined}
              />
            )}
            <text x={PANEL_W / 2} y={PANEL_H + 18} textAnchor="middle" fontSize={9.5} fill={ink[600]}>
              {p.label}
            </text>
          </g>
        );
      })}
    </GuideFigure>
  );
}
