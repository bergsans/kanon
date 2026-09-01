import { scaleBand, scaleLinear } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { ink, parchment } from "./theme";

/**
 * The two solid-button recipes decoded to pixels, since "px-4 py-2
 * rounded-md" and "px-2 py-1" don't compare at a glance as class strings.
 * Both share one disabled pairing (`ProjectHeader`'s own comment says so
 * explicitly) — nothing else in the source says why the sizes differ.
 */
const METRICS = ["padding-x", "padding-y", "radius"] as const;
const VARIANTS = [
  { name: "Search submit", color: ink[800], values: { "padding-x": 16, "padding-y": 8, radius: 6 } },
  { name: "Commit (project forms)", color: ink[400], values: { "padding-x": 8, "padding-y": 4, radius: 0 } },
] as const;
const LABEL = `Two solid-button recipes in pixels: search submit — padding-x 16, padding-y 8, radius 6; commit in project forms — padding-x 8, padding-y 4, radius 0. Both share one disabled pairing; nothing states why the sizes differ.`;

const WIDTH = 480;
const HEIGHT = 200;
const MARGIN = { top: 28, right: 16, bottom: 24, left: 72 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

export function ButtonMetrics() {
  const y = scaleLinear().domain([0, 16]).range([INNER_HEIGHT, 0]);
  const xMetric = scaleBand().domain(METRICS).range([0, INNER_WIDTH]).paddingOuter(0.15).paddingInner(0.3);
  const xVariant = scaleBand()
    .domain(VARIANTS.map((v) => v.name))
    .range([0, xMetric.bandwidth()])
    .padding(0.15);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      {VARIANTS.map((variant, i) => (
        <g key={variant.name} transform={`translate(${MARGIN.left + i * 210},14)`}>
          <rect width={10} height={10} fill={variant.color} />
          <text x={16} y={9} fontSize={10.5} fill={ink[600]}>
            {variant.name}
          </text>
        </g>
      ))}
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {y.ticks(4).map((tick) => (
          <g key={tick}>
            <line x1={0} x2={INNER_WIDTH} y1={y(tick)} y2={y(tick)} stroke={parchment[200]} strokeWidth={1} />
            <text x={-8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={10} fill={ink[600]}>
              {tick}px
            </text>
          </g>
        ))}

        {METRICS.map((metric) => {
          const metricX = xMetric(metric) ?? 0;
          return (
            <g key={metric} transform={`translate(${metricX},0)`}>
              {VARIANTS.map((variant) => {
                const value = variant.values[metric];
                const barX = xVariant(variant.name) ?? 0;
                return (
                  <rect
                    key={variant.name}
                    x={barX}
                    y={y(value)}
                    width={xVariant.bandwidth()}
                    height={INNER_HEIGHT - y(value)}
                    fill={variant.color}
                  />
                );
              })}
              <text x={xMetric.bandwidth() / 2} y={INNER_HEIGHT + 16} textAnchor="middle" fontSize={11} fill={ink[600]}>
                {metric}
              </text>
            </g>
          );
        })}
      </g>
    </GuideFigure>
  );
}
