import { useState } from "react";
import type { FontPairing } from "./candidateFonts";
import { accent, fontMono, fontSans, fontSerif, ink, parchment } from "./theme";

/**
 * One scoped sheet for every figure on the typography page, for the same
 * reason GuideTable carries its own: Tailwind's preflight strips table and
 * list defaults, and border/padding don't inherit from an inline style on a
 * wrapper. Rendered once per figure — duplicate identical rules are inert.
 */
const STYLES = `
  .type-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); gap: 1rem; margin: 1.5rem 0; list-style: none; padding: 0; }
  .type-card { position: relative; width: 100%; text-align: left; cursor: pointer; font: inherit; background: ${parchment[0]}; border: 1px solid ${parchment[200]}; border-radius: 6px; padding: 1.25rem 1.25rem 1rem; display: flex; flex-direction: column; gap: 0.75rem; box-shadow: 0 1px 2px rgb(0 0 0 / 0.04); }
  .type-card[data-baseline] { background: ${parchment[50]}; }
  .type-card[aria-checked="true"] { border-color: ${accent[600]}; box-shadow: 0 0 0 1px ${accent[600]}; }
  .type-card:hover { border-color: ${ink[400]}; }
  .type-card[aria-checked="true"]:hover { border-color: ${accent[600]}; }
  .type-card:focus-visible { outline: 2px solid ${accent[600]}; outline-offset: 2px; }
  .type-card__badges { position: absolute; top: 0.75rem; right: 0.75rem; display: flex; gap: 0.375rem; }
  .type-card__badge { font-family: ${fontSans}; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.02em; border-radius: 3px; padding: 0.1rem 0.4rem; white-space: nowrap; }
  .type-card__badge--live { background: ${parchment[100]}; color: ${ink[600]}; border: 1px solid ${parchment[300]}; }
  .type-card__badge--selected { background: ${accent[600]}; color: ${parchment[0]}; }
  .type-card__glyphs { display: flex; align-items: baseline; gap: 0.75rem; color: ${ink[900]}; line-height: 1; }
  .type-card__glyphs span:first-child { font-size: 3.25rem; }
  .type-card__glyphs span:last-child { font-size: 2rem; color: ${ink[600]}; }
  .type-card__rule { display: flex; height: 2px; }
  .type-card__rule span:first-child { width: 2rem; background: ${accent[600]}; }
  .type-card__rule span:last-child { flex: 1; height: 1px; background: ${parchment[200]}; }
  .type-card__q { font-size: 1.25rem; line-height: 1.3; color: ${ink[900]}; margin: 0; }
  .type-card__meta { font-size: 0.75rem; color: ${ink[400]}; margin: 0; font-variant-numeric: tabular-nums; }
  .type-card__foot { margin-top: auto; padding-top: 0.75rem; border-top: 1px solid ${parchment[200]}; font-family: ${fontSans}; }
  .type-card__name { font-size: 0.8125rem; font-weight: 600; color: ${ink[800]}; margin: 0 0 0.25rem; }
  .type-card__note { font-size: 0.75rem; line-height: 1.45; color: ${ink[600]}; margin: 0; }

  .type-preview { margin: 0 0 2.5rem; border: 1px solid ${parchment[200]}; border-radius: 6px; background: ${parchment[0]}; overflow: hidden; }
  .type-preview__bar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.6rem 1rem; background: ${parchment[50]}; border-bottom: 1px solid ${parchment[200]}; font-family: ${fontSans}; font-size: 0.75rem; color: ${ink[600]}; }
  .type-preview__bar strong { color: ${ink[800]}; font-weight: 600; }
  .type-preview__page { padding: 1.75rem 1.75rem 1.5rem; }
  .type-preview__eyebrow { font-family: ${fontSans}; font-size: 0.75rem; color: ${ink[400]}; margin: 0 0 0.5rem; }
  .type-preview__h1 { font-size: 2.25rem; line-height: 1.15; color: ${ink[900]}; margin: 0; letter-spacing: -0.01em; }
  .type-preview__rule { display: flex; height: 2px; margin: 0.75rem 0 1.25rem; }
  .type-preview__rule span:first-child { width: 2.5rem; background: ${accent[600]}; }
  .type-preview__rule span:last-child { flex: 1; height: 1px; background: ${parchment[200]}; align-self: center; }
  .type-preview__question { font-size: 1.25rem; line-height: 1.35; color: ${ink[900]}; margin: 0 0 1rem; }
  .type-preview__quote { font-size: 1.0625rem; line-height: 1.5; color: ${ink[900]}; margin: 0 0 1rem; padding-left: 0.85rem; border-left: 2px solid ${parchment[300]}; }
  .type-preview__body { font-family: ${fontSans}; font-size: 0.875rem; line-height: 1.55; color: ${ink[800]}; margin: 0 0 1rem; }
  .type-preview__chrome { font-family: ${fontSans}; font-size: 0.75rem; color: ${ink[400]}; margin: 0; display: flex; flex-wrap: wrap; gap: 0 0.75rem; }

  .type-compare { overflow-x: auto; margin: 0.75rem 0 2.5rem; border: 1px solid ${parchment[200]}; border-radius: 6px; background: ${parchment[0]}; }
  .type-compare table { width: 100%; border-collapse: collapse; font-family: ${fontSans}; }
  .type-compare caption { caption-side: top; text-align: left; padding: 0.6rem 1rem; background: ${parchment[50]}; border-bottom: 1px solid ${parchment[200]}; font-size: 0.75rem; color: ${ink[600]}; }
  .type-compare caption code { font-family: ${fontMono}; font-size: 0.7rem; color: ${ink[800]}; background: ${parchment[100]}; padding: 0.1rem 0.35rem; border-radius: 3px; margin-right: 0.5rem; }
  .type-compare th { width: 11rem; text-align: left; vertical-align: middle; padding: 0.9rem 1rem; font-size: 0.75rem; font-weight: 500; color: ${ink[600]}; white-space: nowrap; border-bottom: 1px solid ${parchment[200]}; }
  .type-compare td { vertical-align: middle; padding: 0.9rem 1rem 0.9rem 0; color: ${ink[900]}; border-bottom: 1px solid ${parchment[200]}; }
  .type-compare tr:last-child th, .type-compare tr:last-child td { border-bottom: none; }
  .type-compare tr[data-baseline] th, .type-compare tr[data-baseline] td { background: ${parchment[50]}; }
  .type-compare tr[data-baseline] th { color: ${ink[400]}; font-style: italic; }
  .type-compare__pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
`;

function fontOf(p: FontPairing, family: "serif" | "sans") {
  return (family === "serif" ? p.serif : p.sans) ?? (family === "serif" ? fontSerif : fontSans);
}

/** Epictetus, Enchiridion — already public-domain passage-shaped text, not
 * invented for this page, reused here as the 17px "quote in context" role. */
const QUOTE_SAMPLE = "Of things some are in our power, and others are not.";

/**
 * Cards pick which pairing the mockup below renders in, so the comparison
 * moves from "read six rows and imagine the page" to seeing one full page
 * at once, live. `role="radiogroup"`: exactly one pairing is ever the thing
 * shown, same as a real settings choice, not a multi-select.
 *
 * The baseline card carries a permanent "live today" badge, separate from
 * the accent "selected" badge a click adds to whichever card is active —
 * otherwise the two states (what the app renders right now vs. what this
 * page happens to be showing you) collapse into one and neither is
 * answerable at a glance.
 */
export function TypographyLab({ pairings }: { pairings: readonly FontPairing[] }) {
  const [selected, setSelected] = useState(0);
  const active = pairings[selected] ?? pairings[0];
  const serif = fontOf(active, "serif");
  const sans = fontOf(active, "sans");

  return (
    <>
      <style>{STYLES}</style>
      <ul className="type-cards" role="radiogroup" aria-label="Font pairing">
        {pairings.map((p, i) => {
          const isBaseline = !p.serif;
          const isSelected = i === selected;
          const cardSerif = fontOf(p, "serif");
          const cardSans = fontOf(p, "sans");
          return (
            <li key={p.name}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                data-baseline={isBaseline ? "" : undefined}
                className="type-card"
                onClick={() => setSelected(i)}
              >
                <span className="type-card__badges">
                  {isBaseline && <span className="type-card__badge type-card__badge--live">live today</span>}
                  {isSelected && <span className="type-card__badge type-card__badge--selected">shown below</span>}
                </span>
                <span className="type-card__glyphs" aria-hidden>
                  <span style={{ fontFamily: cardSerif }}>Aa</span>
                  <span style={{ fontFamily: cardSans }}>Aa</span>
                </span>
                <span className="type-card__rule" aria-hidden>
                  <span />
                  <span />
                </span>
                <span className="type-card__q" style={{ fontFamily: cardSerif }}>
                  Är makt viktigare än moral för en furste?
                </span>
                <span className="type-card__meta" style={{ fontFamily: cardSans }}>
                  2 690 verk · 490 författare · 10 genrer
                </span>
                <span className="type-card__foot">
                  <span className="type-card__name">{p.name}</span>
                  <span className="type-card__note">{p.note}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="type-preview">
        <div className="type-preview__bar">
          <span>
            Showing: <strong>{active.name}</strong>
          </span>
          <span>page h1 down to chrome, same strings as the cards above</span>
        </div>
        <div className="type-preview__page">
          <p className="type-preview__eyebrow">Ställ en fråga</p>
          <h2 className="type-preview__h1" style={{ fontFamily: serif }}>
            Kanon
          </h2>
          <div className="type-preview__rule" aria-hidden>
            <span />
            <span />
          </div>
          <p className="type-preview__question" style={{ fontFamily: serif }}>
            Är makt viktigare än moral för en furste?
          </p>
          <p className="type-preview__quote" style={{ fontFamily: serif }}>
            {QUOTE_SAMPLE}
          </p>
          <p className="type-preview__body" style={{ fontFamily: sans }}>
            Appen letar upp de stycken ur västerlandets kanon som bär på ett svar.
          </p>
          <p className="type-preview__chrome" style={{ fontFamily: sans }}>
            <span>2 690 verk · 490 författare · 10 genrer</span>
            <span>Exportera</span>
            <span>Textstorlek</span>
          </p>
        </div>
      </div>
    </>
  );
}

/**
 * All pairings set at one real type-scale role, one row each in a shared
 * table — not a bordered box per pairing. Boxing each pairing apart meant
 * comparing two candidates at page-h1 size meant scrolling past whichever
 * box sat between them; a shared table puts every candidate on one column.
 * The role, class, and size live in the caption so the MDX around it no
 * longer has to repeat them as a heading.
 */
export function FontSizeTable({
  px,
  family,
  role,
  cls,
  sample,
  pairings,
}: {
  px: number;
  family: "serif" | "sans";
  role: string;
  cls: string;
  sample: string;
  pairings: readonly FontPairing[];
}) {
  return (
    <div className="type-compare">
      <style>{STYLES}</style>
      <table>
        <caption>
          <code>{cls}</code>
          {px}px · {family} · {role}
        </caption>
        <tbody>
          {pairings.map((p) => (
            <tr key={p.name} data-baseline={p.serif ? undefined : ""}>
              <th scope="row">{p.name}</th>
              <td style={{ fontFamily: fontOf(p, family), fontSize: `${px}px`, lineHeight: 1.25 }}>{sample}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The collection is set in six languages and the interface is Swedish, so a
 * face that lacks — or badly draws — å, ß, œ or a macron is out whatever it
 * looks like in English. Serif and sans side by side, since both roles meet
 * these letters: the serif in passages, the sans in author names in chrome.
 */
const DIACRITICS = "Åå Ää Öö · Üü ß · Éé Èè Çç Œœ · Ææ Āā";

export function DiacriticsTable({ pairings }: { pairings: readonly FontPairing[] }) {
  return (
    <div className="type-compare">
      <style>{STYLES}</style>
      <table>
        <caption>sv · de · fr · la — serif left, sans right, 20px</caption>
        <tbody>
          {pairings.map((p) => (
            <tr key={p.name} data-baseline={p.serif ? undefined : ""}>
              <th scope="row">{p.name}</th>
              <td>
                <div className="type-compare__pair" style={{ fontSize: "20px" }}>
                  <span style={{ fontFamily: fontOf(p, "serif") }}>{DIACRITICS}</span>
                  <span style={{ fontFamily: fontOf(p, "sans") }}>{DIACRITICS}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
