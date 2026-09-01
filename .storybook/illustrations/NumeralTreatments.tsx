import { fontMono, fontSerif, ink, parchment } from "./theme";

/**
 * `tabular-nums` isn't visible in a class name — only in whether digits
 * line up. Real CSS, not SVG: "1" stacked on "111" shows a proportional
 * "1" landing off-column while a tabular one holds its own width, the
 * exact problem the cost table and the stopwatch would have without it.
 * Old-style figures need the real serif face to dip below the baseline —
 * a description can't show that, only the glyph can.
 */
const COLUMNS = [
  { label: "default", cls: "", face: fontMono },
  { label: "tabular-nums", cls: "tabular-nums", face: fontMono },
] as const;

export function NumeralTreatments() {
  return (
    <div style={{ margin: "1.5rem 0", display: "flex", gap: "2.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
      {COLUMNS.map((c) => (
        <div key={c.label}>
          <div style={{ fontSize: "0.8125rem", color: ink[600], marginBottom: "0.4rem" }}>{c.label}</div>
          <div style={{ borderLeft: `1px solid ${parchment[300]}`, paddingLeft: "0.5rem" }}>
            {["1", "111"].map((digits) => (
              <div key={digits} className={c.cls} style={{ fontFamily: c.face, fontSize: "1.5rem", color: ink[900], lineHeight: 1.4 }}>
                {digits}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{ maxWidth: 180 }}>
        <div style={{ fontSize: "0.8125rem", color: ink[600], marginBottom: "0.4rem" }}>oldstyle-nums</div>
        <div
          className="[font-variant-numeric:oldstyle-nums]"
          style={{ fontFamily: fontSerif, fontSize: "1.25rem", color: ink[900], lineHeight: 1.4 }}
        >
          book II, 1809
        </div>
        <div style={{ fontSize: "0.75rem", color: ink[400], marginTop: "0.35rem" }}>a verse number inside the quote</div>
      </div>
    </div>
  );
}
