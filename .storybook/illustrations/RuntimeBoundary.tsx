import { GuideFigure } from "./GuideFigure";
import { ink, parchment } from "./theme";

/**
 * The rule stated as a crossing-out rather than a sentence: edge is drawn,
 * struck through, and left empty, because that's the option that doesn't
 * exist here — `better-sqlite3`, `sqlite-vec` and `onnxruntime-node` are
 * native modules and every route touching one declares `runtime = "nodejs"`
 * explicitly, the same fact `FolderBoundaryDiagram` draws for the component
 * boundary.
 */
const LABEL =
  "Runtime boundary: a route touching the database or a model declares export const runtime = \"nodejs\" and runs in the Node runtime, alongside the three native modules — better-sqlite3, sqlite-vec, onnxruntime-node. Edge is crossed out: none of the three run there, so it is never an option for these routes.";

const WIDTH = 520;
const HEIGHT = 172;

const routeX = 20, routeY = 68, routeW = 106, routeH = 40;
const nodeX = 178, nodeY = 24, nodeW = 200, nodeH = 128;
const edgeX = 420, edgeY = 68, edgeW = 80, edgeH = 40;
const routeCy = routeY + routeH / 2;
const nodeCy = nodeY + nodeH / 2;

export function RuntimeBoundary() {
  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <defs>
        <marker id="runtime-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={ink[600]} />
        </marker>
      </defs>

      <rect x={routeX} y={routeY} width={routeW} height={routeH} fill={parchment[0]} stroke={parchment[300]} />
      <text x={routeX + routeW / 2} y={routeY + 17} textAnchor="middle" fontSize={10} fontWeight={600} fill={ink[900]}>
        a route
      </text>
      <text x={routeX + routeW / 2} y={routeY + 31} textAnchor="middle" fontSize={8.5} fill={ink[600]}>
        touching db or model
      </text>

      <line x1={routeX + routeW + 6} y1={routeCy} x2={nodeX - 6} y2={nodeCy} stroke={ink[600]} strokeWidth={1.5} markerEnd="url(#runtime-arrow)" />

      <rect x={nodeX} y={nodeY} width={nodeW} height={nodeH} fill={parchment[0]} stroke={parchment[300]} strokeWidth={1.5} />
      <text x={nodeX + nodeW / 2} y={nodeY + 20} textAnchor="middle" fontSize={11} fontWeight={600} fill={ink[900]}>
        Node runtime
      </text>
      {["better-sqlite3", "sqlite-vec", "onnxruntime-node"].map((mod, i) => (
        <text key={mod} x={nodeX + nodeW / 2} y={nodeY + 40 + i * 15} textAnchor="middle" fontSize={9.5} fill={ink[600]}>
          {mod}
        </text>
      ))}
      <text x={nodeX + nodeW / 2} y={nodeY + nodeH - 12} textAnchor="middle" fontSize={9} fontFamily="ui-monospace, monospace" fill={ink[800]}>
        runtime = "nodejs"
      </text>

      <rect x={edgeX} y={edgeY} width={edgeW} height={edgeH} fill="none" stroke={ink[400]} strokeDasharray="4,3" />
      <line x1={edgeX} y1={edgeY} x2={edgeX + edgeW} y2={edgeY + edgeH} stroke={ink[400]} strokeWidth={1} />
      <line x1={edgeX} y1={edgeY + edgeH} x2={edgeX + edgeW} y2={edgeY} stroke={ink[400]} strokeWidth={1} />
      <text x={edgeX + edgeW / 2} y={edgeY - 8} textAnchor="middle" fontSize={9.5} fill={ink[600]}>
        Edge
      </text>
      <text x={edgeX + edgeW / 2} y={edgeY + edgeH + 16} textAnchor="middle" fontSize={8.5} fill={ink[600]}>
        not an option
      </text>
    </GuideFigure>
  );
}
