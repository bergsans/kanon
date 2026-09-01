import { scaleLinear } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { ink, parchment } from "./theme";

/**
 * The three layers as a stack. Offsets follow the layers' order, not their
 * numbers: 20, 40 and 50 aren't evenly spaced and would draw a lopsided
 * stack that suggests a gap nobody meant.
 */
const LAYERS = [
  { z: "z-20", label: "dropdown popovers" },
  { z: "z-40", label: "hamburger trigger + backdrop" },
  { z: "z-50", label: "drawer, modal, context sheet" },
] as const;
const LABEL = `Three z-index layers, back to front: ${LAYERS.map((l) => `${l.z} — ${l.label}`).join("; ")}.`;

const WIDTH = 480;
const HEIGHT = 190;
const LAYER_WIDTH = 220;
const LAYER_HEIGHT = 64;
const STEP = 28;

export function ZIndexStack() {
  const offset = scaleLinear().domain([0, LAYERS.length - 1]).range([0, STEP * (LAYERS.length - 1)]);
  const originX = 16;
  const originY = HEIGHT - LAYER_HEIGHT - 16;

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      {LAYERS.map((layer, i) => {
        const dx = offset(i);
        const dy = -offset(i);
        const x = originX + dx;
        const y = originY + dy;
        return (
          <g key={layer.z}>
            <rect x={x + 4} y={y + 6} width={LAYER_WIDTH} height={LAYER_HEIGHT} fill={ink[900]} opacity={0.14} />
            <rect
              x={x}
              y={y}
              width={LAYER_WIDTH}
              height={LAYER_HEIGHT}
              fill={parchment[0]}
              stroke={parchment[300]}
              strokeWidth={1}
            />
            <text x={x + 12} y={y + 24} fontSize={12} fontWeight={600} fill={ink[900]}>
              {layer.z}
            </text>
            <text x={x + 12} y={y + 44} fontSize={11} fill={ink[600]}>
              {layer.label}
            </text>
          </g>
        );
      })}
    </GuideFigure>
  );
}
