import { hierarchy, tree } from "d3-hierarchy";
import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * The DOM as landmarks see it. A real landmark gets a solid accent box; an
 * element that looks like one but isn't exposed as one (`<header>` and
 * `<footer>` inside `<main>`) gets a dashed box — shape, not color alone.
 */
interface Node {
  name: string;
  note?: string;
  landmark?: boolean;
  children?: Node[];
}

const DATA: Node = {
  name: "<html>",
  children: [
    {
      name: "<body>",
      children: [
        {
          name: "3 providers",
          children: [
            { name: "NavMenu", note: "fixed, no landmark" },
            {
              name: "<main>",
              note: "per page",
              landmark: true,
              children: [
                { name: "<header>", note: "never banner" },
                { name: "<footer>", note: "never contentinfo" },
              ],
            },
          ],
        },
      ],
    },
  ],
};
const LABEL =
  "DOM landmark tree: html, body, three providers, then NavMenu (fixed, no landmark) and main (the one real landmark), whose header and footer never become banner or contentinfo.";

const WIDTH = 480;
const HEIGHT = 250;
const NODE_W = 96;
const NODE_H = 30;

export function LandmarkTree() {
  const root = hierarchy(DATA);
  const layout = tree<Node>().nodeSize([104, 46]);
  layout(root);

  const xs = root.descendants().map((d) => d.x ?? 0);
  const offsetX = WIDTH / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
  const offsetY = 16;

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <g transform={`translate(${offsetX},${offsetY})`}>
        {root.links().map((link, i) => (
          <line
            key={i}
            x1={link.source.x}
            y1={(link.source.y ?? 0) + NODE_H / 2}
            x2={link.target.x}
            y2={(link.target.y ?? 0) - NODE_H / 2}
            stroke={parchment[300]}
            strokeWidth={1}
          />
        ))}
        {root.descendants().map((d, i) => {
          const x = (d.x ?? 0) - NODE_W / 2;
          const y = (d.y ?? 0) - NODE_H / 2;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={NODE_W}
                height={NODE_H}
                fill={parchment[0]}
                stroke={d.data.landmark ? accent[600] : parchment[300]}
                strokeWidth={d.data.landmark ? 2 : 1}
                strokeDasharray={d.data.landmark ? undefined : "3,3"}
              />
              <text x={d.x} y={(d.y ?? 0) - 3} textAnchor="middle" fontSize={11} fontWeight={600} fill={ink[900]}>
                {d.data.name}
              </text>
              {d.data.note && (
                <text x={d.x} y={(d.y ?? 0) + 11} textAnchor="middle" fontSize={9} fill={ink[600]}>
                  {d.data.note}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </GuideFigure>
  );
}
