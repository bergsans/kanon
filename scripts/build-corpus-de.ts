/**
 * Generates the German Gutenberg part of the manifest (`src/lib/corpus-gde.json`).
 *
 *   pnpm build-corpus-de            regenerate
 *   pnpm build-corpus-de --dry      show the report without writing the file
 *   pnpm build-corpus-de --authors [search term]   list the catalog's name forms
 *
 * Everything except the author list lives in `build-corpus-lang.ts`, shared by
 * German with French and Italian.
 *
 * THE SOURCE IS GUTENBERG AND NOT DTA, and that's the entire reason this file
 * exists. `build-corpus.ts` filters on `language === "en"` and thereby discarded
 * 2,397 German texts on every run — the same problem French and Italian
 * suffered before they got their own parts. Until then the manifest's German
 * was exclusively the Deutsches Textarchiv's 83 works, i.e. idealism and the
 * classics in the original.
 *
 * THE TWO SOURCES COVER DIFFERENT THINGS, which is why this one doesn't make
 * DTA redundant. DTA has the philosophical first edition with its 18th-century
 * typesetting; Gutenberg has the novel, the novella, drama and 19th-century
 * prose, which DTA doesn't carry at all: Storm 18, Grillparzer 16, Fontane 8,
 * Kafka 10, Freud 24. And a single line is reason enough on its own —
 * `"Schopenhauer, Arthur, 1788-1860"` with *Aphorismen zur Lebensweisheit*.
 * Schopenhauer isn't in DTA at all: the catalog's "Schopenhauer" is Johanna, his
 * mother, and that trap is already documented in the README. Gutenberg's catalog
 * repeats it — Johanna and Adele are listed there too, which is why Arthur's
 * dates are in the name form.
 *
 * THE OVERLAP IS A DELIBERATE CHOICE, as with TCP and Perseus. Kant, Hegel,
 * Fichte, Nietzsche, Goethe, Schiller, Lessing and Kleist exist in both sources.
 * DTA's editions are first printings with long s and overwritten vowels
 * normalized; Gutenberg's are later typesettings. A question may be answered
 * better by one than the other, and the cap of ten works per author keeps one
 * from drowning out the other.
 *
 * THE DISPLAY NAME FOLLOWS THE GERMAN SIDE, not the English one. The collection
 * already has "J. W. von Goethe" (DTA) and "Johann Wolfgang von Goethe"
 * (Gutenberg, English) as two authors, and the same split for Lessing, Hegel and
 * Nietzsche. The new works are German and belong to the German cluster, so they
 * take DTA's form when DTA has the author and Gutenberg's English form
 * otherwise. Genre follows DTA's for the same reason where they diverge: Goethe
 * is `dikt` (poetry) in DTA and `drama` in the English part, and one author
 * shouldn't have two genres in the same language. That the split persists across
 * languages is a pre-existing issue not resolved here.
 *
 * HÖLDERLIN AND HERDER ARE NOT IN THE LIST, and that's checked, not forgotten:
 * neither has any German entry at all on Gutenberg. They exist only in DTA, with
 * ten and two works respectively.
 *
 * HESSE, THOMAS MANN AND KELLERMANN ARE ALSO ABSENT, for the opposite reason:
 * they have 21, 10 and 11 entries each and are free in the US but protected in
 * Sweden until 2033, 2026 and 2022. The rights check in `build-corpus-lang.ts`
 * rejects them if someone enters them anyway.
 */
import path from "node:path";
import { buildLanguagePart, type Author } from "./build-corpus-lang";

/**
 * The authors included, with the catalog's exact name form and the number of
 * entries it returned when the list was created. The number isn't a promise —
 * the title filter, character floor and paragraph floor take their share out of
 * it — but a note of what was available to fetch, so an empty report line can be
 * told apart from a misspelled name form.
 */
const AUTHORS: Author[] = [
  // Philosophy. DTA has the first editions; these are the later typesettings,
  // and for Schopenhauer this is the only German text the collection can get at all.
  {
    name: "Kant, Immanuel, 1724-1804",
    display: "Immanuel Kant",
    genre: "filosofi",
    death: 1804,
  },
  {
    name: "Hegel, Georg Wilhelm Friedrich, 1770-1831",
    display: "G. W. F. Hegel",
    genre: "filosofi",
    death: 1831,
  },
  {
    name: "Fichte, Johann Gottlieb, 1762-1814",
    display: "J. G. Fichte",
    genre: "filosofi",
    death: 1814,
  },
  {
    name: "Schopenhauer, Arthur, 1788-1860",
    display: "Arthur Schopenhauer",
    genre: "filosofi",
    death: 1860,
  },
  {
    name: "Nietzsche, Friedrich Wilhelm, 1844-1900",
    display: "Friedrich Nietzsche",
    genre: "filosofi",
    death: 1900,
  },
  {
    name: "Simmel, Georg, 1858-1918",
    display: "Georg Simmel",
    genre: "filosofi",
    death: 1918,
  },
  {
    name: "Lessing, Gotthold Ephraim, 1729-1781",
    display: "G. E. Lessing",
    genre: "essä",
    death: 1781,
  },

  // Drama. Grillparzer and Hebbel don't exist in the collection in any
  // language, and without them the German stage jumps straight from Schiller to Ibsen.
  {
    name: "Schiller, Friedrich, 1759-1805",
    display: "Friedrich Schiller",
    genre: "drama",
    death: 1805,
  },
  {
    name: "Grillparzer, Franz, 1791-1872",
    display: "Franz Grillparzer",
    genre: "drama",
    death: 1872,
  },
  {
    name: "Hebbel, Friedrich, 1813-1863",
    display: "Friedrich Hebbel",
    genre: "drama",
    death: 1863,
  },
  {
    name: "Büchner, Georg, 1813-1837",
    display: "Georg Büchner",
    genre: "drama",
    death: 1837,
  },

  // Poetry.
  {
    name: "Goethe, Johann Wolfgang von, 1749-1832",
    display: "J. W. von Goethe",
    genre: "dikt",
    death: 1832,
  },
  {
    name: "Heine, Heinrich, 1797-1856",
    display: "Heinrich Heine",
    genre: "dikt",
    death: 1856,
  },
  {
    name: "Novalis, 1772-1801",
    display: "Novalis",
    genre: "dikt",
    death: 1801,
  },
  {
    name: "Rilke, Rainer Maria, 1875-1926",
    display: "Rainer Maria Rilke",
    genre: "dikt",
    death: 1926,
  },
  {
    name: "Droste-Hülshoff, Annette von, 1797-1848",
    display: "Annette von Droste-Hülshoff",
    genre: "dikt",
    death: 1848,
  },

  // Prose, which is what DTA lacks entirely. Storm, Fontane and Wieland don't
  // exist in the collection in any language.
  {
    name: "Kleist, Heinrich von, 1777-1811",
    display: "Heinrich von Kleist",
    genre: "prosa",
    death: 1811,
  },
  {
    name: "Hoffmann, E. T. A. (Ernst Theodor Amadeus), 1776-1822",
    display: "E. T. A. Hoffmann",
    genre: "prosa",
    death: 1822,
  },
  {
    name: "Wieland, Christoph Martin, 1733-1813",
    display: "Christoph Martin Wieland",
    genre: "prosa",
    death: 1813,
  },
  {
    name: "Jean Paul, 1763-1825",
    display: "Jean Paul",
    genre: "prosa",
    death: 1825,
  },
  {
    name: "Storm, Theodor, 1817-1888",
    display: "Theodor Storm",
    genre: "prosa",
    death: 1888,
  },
  {
    name: "Fontane, Theodor, 1819-1898",
    display: "Theodor Fontane",
    genre: "prosa",
    death: 1898,
  },
  {
    name: "Kafka, Franz, 1883-1924",
    display: "Franz Kafka",
    genre: "prosa",
    death: 1924,
  },

  // History and science. Mommsen's *Römische Geschichte* is listed as six
  // volumes, i.e. exactly the case the duplicate-ID key exists for.
  {
    name: "Mommsen, Theodor, 1817-1903",
    display: "Theodor Mommsen",
    genre: "historia",
    death: 1903,
  },
  {
    name: "Freud, Sigmund, 1856-1939",
    display: "Sigmund Freud",
    genre: "vetenskap",
    death: 1939,
  },
  {
    name: "Haeckel, Ernst, 1834-1919",
    display: "Ernst Haeckel",
    genre: "vetenskap",
    death: 1919,
  },
  {
    name: "Humboldt, Alexander von, 1769-1859",
    display: "Alexander von Humboldt",
    genre: "vetenskap",
    death: 1859,
  },
];

buildLanguagePart({
  language: "de",
  // "gde" and not "de": the DTA part's IDs already start with "dta-", but the
  // prefix is meant to say which *source* the row came from, not which
  // language. Two German sources with the same prefix would make a collision
  // possible as soon as the same work exists in both — and Kant's Kritik does.
  prefix: "gde",
  outPath: path.join(process.cwd(), "src", "lib", "corpus-gde.json"),
  authors: AUTHORS,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
