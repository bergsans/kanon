import { GuideFigure } from "./GuideFigure";
import { ink, parchment } from "./theme";

/**
 * The rule is the arrow — `smart-compositions/` imports `ui/`, never the
 * reverse — so it's drawn as one, not stated in indented text.
 */
const LABEL =
  "Three folders, one boundary: providers/ wraps the app once; smart-compositions/ owns fetch and server actions and assembles ui/, one direction only — ui/ takes props in, JSX out, never the reverse.";

const WIDTH = 480;
const HEIGHT = 190;

export function FolderBoundaryDiagram() {
  const outerX = 24;
  const outerY = 16;
  const outerW = WIDTH - 48;
  const outerH = 130;
  const scX = outerX + 24;
  const scY = outerY + 30;
  const scW = 200;
  const scH = 84;
  const uiX = scX + scW + 60;
  const uiY = scY + 14;
  const uiW = 110;
  const uiH = 56;

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <rect x={outerX} y={outerY} width={outerW} height={outerH} fill="none" stroke={parchment[300]} strokeWidth={1} strokeDasharray="4,3" />
      <text x={outerX + 10} y={outerY + 16} fontSize={10} fill={ink[600]}>
        providers/ — wrapped once in layout.tsx
      </text>

      <rect x={scX} y={scY} width={scW} height={scH} fill={parchment[0]} stroke={parchment[300]} strokeWidth={1} />
      <text x={scX + 10} y={scY + 18} fontSize={11} fontWeight={600} fill={ink[900]}>
        smart-compositions/
      </text>
      <text x={scX + 10} y={scY + 34} fontSize={9.5} fill={ink[600]}>
        owns fetch / server actions,
      </text>
      <text x={scX + 10} y={scY + 46} fontSize={9.5} fill={ink[600]}>
        assembles ui/ with real data
      </text>

      <rect x={uiX} y={uiY} width={uiW} height={uiH} fill={parchment[0]} stroke={parchment[300]} strokeWidth={1} />
      <text x={uiX + uiW / 2} y={uiY + 20} textAnchor="middle" fontSize={11} fontWeight={600} fill={ink[900]}>
        ui/
      </text>
      <text x={uiX + uiW / 2} y={uiY + 38} textAnchor="middle" fontSize={9.5} fill={ink[600]}>
        props in,
      </text>
      <text x={uiX + uiW / 2} y={uiY + 50} textAnchor="middle" fontSize={9.5} fill={ink[600]}>
        JSX out
      </text>

      <defs>
        <marker id="folder-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={ink[600]} />
        </marker>
      </defs>
      <line
        x1={scX + scW + 6}
        y1={scY + scH / 2}
        x2={uiX - 6}
        y2={uiY + uiH / 2}
        stroke={ink[600]}
        strokeWidth={1.5}
        markerEnd="url(#folder-arrow)"
      />

      <text x={WIDTH / 2} y={outerY + outerH + 24} textAnchor="middle" fontSize={10} fill={ink[600]}>
        one direction only — never ui/ → smart-compositions/
      </text>
    </GuideFigure>
  );
}
