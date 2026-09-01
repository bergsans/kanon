import { scaleLinear } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * `sm` and `lg` at their real position, with Tailwind's unused `md`, `xl`
 * and `2xl` drawn crossed out rather than omitted — "no `md:` anywhere" is
 * the fact, and a ruler without them wouldn't show it.
 */
const REACHED = [
  { px: 640, label: "sm" },
  { px: 1024, label: "lg" },
];
const UNREACHED = [768, 1280, 1536];
const LABEL = `Breakpoint ruler: only ${REACHED.map((r) => `${r.label} (${r.px}px)`).join(" and ")} are reached for anywhere in src/app; Tailwind's md/xl/2xl (${UNREACHED.join("/")}) never appear, shown crossed out.`;

const WIDTH = 480;
const HEIGHT = 96;
const MARGIN = { left: 12, right: 12 };
const AXIS_Y = 56;
const DOMAIN_MAX = 1600;

export function BreakpointRuler() {
  const x = scaleLinear().domain([0, DOMAIN_MAX]).range([MARGIN.left, WIDTH - MARGIN.right]);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <line x1={x(0)} x2={x(DOMAIN_MAX)} y1={AXIS_Y} y2={AXIS_Y} stroke={parchment[300]} strokeWidth={1} />

      {UNREACHED.map((px) => (
        <g key={px} transform={`translate(${x(px)},${AXIS_Y})`}>
          <line y1={-8} y2={8} stroke={parchment[200]} strokeWidth={1} strokeDasharray="2,2" />
          <text y={26} textAnchor="middle" fontSize={10} fill={parchment[300]} textDecoration="line-through">
            {px}
          </text>
        </g>
      ))}

      {REACHED.map((bp) => (
        <g key={bp.px} transform={`translate(${x(bp.px)},${AXIS_Y})`}>
          <line y1={-16} y2={16} stroke={accent[600]} strokeWidth={2} />
          <text y={-22} textAnchor="middle" fontSize={12} fontWeight={600} fill={ink[900]}>
            {bp.label}:
          </text>
          <text y={32} textAnchor="middle" fontSize={11} fill={ink[600]}>
            {bp.px}px
          </text>
        </g>
      ))}
    </GuideFigure>
  );
}
