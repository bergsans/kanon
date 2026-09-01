import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * The page shell as proportions instead of a class string. Top: the three
 * `max-w-*` tiers at their real ratio (768/896/1152px), centered as
 * `mx-auto` centers them. Bottom: the two-column grid of `/` and `/s/[id]`
 * above and below `lg`, where the archive moves from beside the answer to
 * under it — the one layout change a reader can't infer from the tiers.
 */
const TIERS = [
  { cls: "max-w-6xl", px: 1152, pages: "/ and /s/[id]" },
  { cls: "max-w-4xl", px: 896, pages: "/collection" },
  { cls: "max-w-3xl", px: 768, pages: "/projects, /costs, not-found" },
] as const;

const LABEL =
  "Page widths: max-w-6xl for the two-column search pages, max-w-4xl for /collection, max-w-3xl for everything else. At lg and up the search pages put main beside a 15rem sticky aside; below lg the aside falls under main.";

const WIDTH = 480;
const HEIGHT = 300;
const SCALE = (WIDTH - 40) / 1152;
const BAR_H = 22;

export function PageShellWireframe() {
  const cx = WIDTH / 2;
  const gridTop = 128;

  // lg and up: 1152px shell, 24px side padding, 48px gap, 15rem aside.
  const shellW = 1152 * SCALE * 0.62;
  const shellX = 20;
  const pad = 24 * SCALE * 0.62;
  const asideW = 240 * SCALE * 0.62;
  const gap = 48 * SCALE * 0.62;
  const mainW = shellW - pad * 2 - gap - asideW;

  // Below lg: one column, narrower frame.
  const narrowX = shellX + shellW + 28;
  const narrowW = WIDTH - narrowX - 20;

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      {TIERS.map((tier, i) => {
        const w = tier.px * SCALE;
        const y = 8 + i * (BAR_H + 10);
        return (
          <g key={tier.cls}>
            <rect x={cx - w / 2} y={y} width={w} height={BAR_H} fill={parchment[0]} stroke={parchment[300]} strokeWidth={1} />
            <text x={cx - w / 2 + 8} y={y + BAR_H / 2} dy="0.35em" fontSize={10.5} fontWeight={600} fill={ink[900]}>
              {tier.cls}
            </text>
            <text x={cx + w / 2 - 8} y={y + BAR_H / 2} dy="0.35em" textAnchor="end" fontSize={10} fill={ink[600]}>
              {tier.pages}
            </text>
          </g>
        );
      })}

      <text x={shellX} y={gridTop - 10} fontSize={10.5} fontWeight={600} fill={ink[900]}>
        lg and up
      </text>
      <rect x={shellX} y={gridTop} width={shellW} height={150} fill="none" stroke={parchment[300]} strokeDasharray="4,3" />
      <rect x={shellX + pad} y={gridTop + 12} width={mainW} height={126} fill={parchment[0]} stroke={parchment[300]} />
      <text x={shellX + pad + mainW / 2} y={gridTop + 70} textAnchor="middle" fontSize={11} fill={ink[900]}>
        main
      </text>
      <text x={shellX + pad + mainW / 2} y={gridTop + 86} textAnchor="middle" fontSize={9.5} fill={ink[600]}>
        max-w-3xl
      </text>
      <rect x={shellX + pad + mainW + gap} y={gridTop + 12} width={asideW} height={70} fill={parchment[0]} stroke={accent[600]} />
      <text x={shellX + pad + mainW + gap + asideW / 2} y={gridTop + 42} textAnchor="middle" fontSize={11} fill={ink[900]}>
        aside
      </text>
      <text x={shellX + pad + mainW + gap + asideW / 2} y={gridTop + 56} textAnchor="middle" fontSize={9.5} fill={ink[600]}>
        15rem
      </text>
      <text x={shellX + pad + mainW + gap + asideW / 2} y={gridTop + 68} textAnchor="middle" fontSize={9.5} fill={ink[600]}>
        sticky
      </text>

      <text x={narrowX} y={gridTop - 10} fontSize={10.5} fontWeight={600} fill={ink[900]}>
        below lg
      </text>
      <rect x={narrowX} y={gridTop} width={narrowW} height={150} fill="none" stroke={parchment[300]} strokeDasharray="4,3" />
      <rect x={narrowX + 8} y={gridTop + 12} width={narrowW - 16} height={80} fill={parchment[0]} stroke={parchment[300]} />
      <text x={narrowX + narrowW / 2} y={gridTop + 56} textAnchor="middle" fontSize={11} fill={ink[900]}>
        main
      </text>
      <rect x={narrowX + 8} y={gridTop + 102} width={narrowW - 16} height={36} fill={parchment[0]} stroke={accent[600]} />
      <text x={narrowX + narrowW / 2} y={gridTop + 124} textAnchor="middle" fontSize={11} fill={ink[900]}>
        aside
      </text>

      <text x={WIDTH / 2} y={HEIGHT - 6} textAnchor="middle" fontSize={10} fill={ink[600]}>
        every shell: mx-auto px-6 pt-16 pb-12 sm:pb-16
      </text>
    </GuideFigure>
  );
}
