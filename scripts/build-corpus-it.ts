/**
 * Generates the Italian part of the manifest (`src/lib/corpus-it.json`).
 *
 *   pnpm build-corpus-it            regenerate
 *   pnpm build-corpus-it --dry      show the report without writing the file
 *   pnpm build-corpus-it --authors [search term]   list the catalog's name forms
 *
 * Everything except the author list lives in `build-corpus-lang.ts`, which
 * Italian shares with French. The source is Gutenberg, and the reason is stated
 * there.
 *
 * THIS PART IS SMALL, AND THAT'S THE CATALOG'S FAULT. Gutenberg has 1,103
 * Italian texts but only about thirty from the canon: nine Dante, four Manzoni,
 * three Boccaccio, three Ariosto, three Alfieri, one Machiavelli, one Leopardi.
 * Tasso, Petrarca, Galilei, Goldoni, Foscolo, Castiglione, Guicciardini and Croce
 * are missing entirely. Anyone wanting them should use Liber Liber or Wikisource
 * as the source, not Gutenberg.
 *
 * THE OVERLAP IS THE POINT HERE, as with TCP and the Latin Perseus texts. Dante,
 * Boccaccio and Machiavelli are already in the collection in English translation.
 * But the *Commedia* is a work where the language is the substance — the terza
 * rima, the rhyme, the word choice — and a question about the order of hell gets
 * a different answer from Longfellow's English than from Dante's own text.
 *
 * THAT ITALIAN WORKS IS MEASURED in `.probe-rerank-more.ts`, using the same work
 * in two languages so content is held constant:
 *
 *   Dante, Commedia   it   top-10 6.5/10   ρ 0.713   score spread 0.108
 *                     en   top-10 6.5/10   ρ 0.693   score spread 0.074
 *
 * Italian scores above the English control on the same work and the same
 * questions. Of the four languages tested there, it was, along with Latin, the
 * safest choice — and Spanish the least safe, with less than half the English
 * score spread.
 */
import path from "node:path";
import { buildLanguagePart, type Author } from "./build-corpus-lang";

/**
 * The authors included.
 *
 * Short list, and the catalog is the reason — see the file header. The name
 * form is Gutenberg's exact one, with dates: "Dante Alighieri, 1265-1321" has no
 * comma-separated surname form at all, and "Lattes, Dante A." exists in the same
 * catalog.
 */
const AUTHORS: Author[] = [
  {
    name: "Dante Alighieri, 1265-1321",
    display: "Dante Alighieri",
    genre: "dikt",
    death: 1321,
  },
  {
    name: "Boccaccio, Giovanni, 1313-1375",
    display: "Giovanni Boccaccio",
    genre: "prosa",
    death: 1375,
  },
  {
    name: "Machiavelli, Niccolò, 1469-1527",
    display: "Niccolò Machiavelli",
    genre: "politik",
    death: 1527,
  },
  {
    name: "Ariosto, Lodovico, 1474-1533",
    display: "Ludovico Ariosto",
    genre: "dikt",
    death: 1533,
  },
  {
    name: "Alfieri, Vittorio, 1749-1803",
    display: "Vittorio Alfieri",
    genre: "drama",
    death: 1803,
  },
  {
    name: "Leopardi, Giacomo, 1798-1837",
    display: "Giacomo Leopardi",
    genre: "dikt",
    death: 1837,
  },
  {
    name: "Manzoni, Alessandro, 1785-1873",
    display: "Alessandro Manzoni",
    genre: "prosa",
    death: 1873,
  },
];

buildLanguagePart({
  language: "it",
  prefix: "it",
  outPath: path.join(process.cwd(), "src", "lib", "corpus-it.json"),
  authors: AUTHORS,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
