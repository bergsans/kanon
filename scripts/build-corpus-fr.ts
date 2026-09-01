/**
 * Generates the French part of the manifest (`src/lib/corpus-fr.json`).
 *
 *   pnpm build-corpus-fr            regenerate
 *   pnpm build-corpus-fr --dry      show the report without writing the file
 *   pnpm build-corpus-fr --authors [search term]   list the catalog's name forms
 *
 * Everything except the author list lives in `build-corpus-lang.ts`, shared by
 * French and Italian. The source is Gutenberg — same as the English part — and
 * the reason is stated there.
 *
 * THAT FRENCH WORKS IS MEASURED, and the first measurement was misleading.
 * `.probe-rerank-lang.ts` gave French 4.0/10 and Spearman 0.501 against
 * English's 5.8 and 0.649 — but all three languages were measured there on
 * *translations from Greek*, and it was impossible to separate French itself
 * from Zévort's translator prose. Re-measured on native prose in
 * `.probe-rerank-native.ts`, eight measurement points per language over
 * Tocqueville and Montesquieu:
 *
 *   en   top-10 5.8/10   Spearman 0.715   score spread 0.139
 *   de   top-10 6.1/10   Spearman 0.663   score spread 0.161
 *   fr   top-10 5.3/10   Spearman 0.594   score spread 0.158
 *
 * French is weaker than English and German but clearly usable. The difference is
 * worth knowing: a French passage needs to sit somewhat higher in the fusion
 * than an English one to survive reranking.
 */
import path from "node:path";
import { buildLanguagePart, type Author } from "./build-corpus-lang";

/**
 * The authors included.
 *
 * French is the third major tradition in the Western canon and was nearly
 * absent: the collection had Descartes, Rousseau and Montaigne in English
 * translation and nothing else. The selection spans the same genres as the rest
 * of the collection — the moralists and essayists, Enlightenment political
 * theory, 19th-century historiography and the novel.
 *
 * The name form is the catalog's, with dates, for exactly the same reason as in
 * the Gutenberg part: surname alone matches the wrong people silently.
 */
const AUTHORS: Author[] = [
  // The moralists and the 17th century.
  {
    name: "Montaigne, Michel de, 1533-1592",
    display: "Michel de Montaigne",
    genre: "essä",
    death: 1592,
  },
  {
    name: "Descartes, René, 1596-1650",
    display: "René Descartes",
    genre: "filosofi",
    death: 1650,
  },
  {
    name: "Pascal, Blaise, 1623-1662",
    display: "Blaise Pascal",
    genre: "filosofi",
    death: 1662,
  },
  {
    name: "La Rochefoucauld, François duc de, 1613-1680",
    display: "La Rochefoucauld",
    genre: "essä",
    death: 1680,
  },
  {
    name: "La Bruyère, Jean de, 1645-1696",
    display: "Jean de La Bruyère",
    genre: "essä",
    death: 1696,
  },
  {
    name: "Molière, 1622-1673",
    display: "Molière",
    genre: "drama",
    death: 1673,
  },
  {
    name: "Racine, Jean, 1639-1699",
    display: "Jean Racine",
    genre: "drama",
    death: 1699,
  },
  {
    name: "Corneille, Pierre, 1606-1684",
    display: "Pierre Corneille",
    genre: "drama",
    death: 1684,
  },
  {
    name: "La Fontaine, Jean de, 1621-1695",
    display: "Jean de La Fontaine",
    genre: "dikt",
    death: 1695,
  },

  // The Enlightenment.
  {
    name: "Montesquieu, Charles de Secondat, baron de, 1689-1755",
    display: "Montesquieu",
    genre: "politik",
    death: 1755,
  },
  {
    name: "Voltaire, 1694-1778",
    display: "Voltaire",
    genre: "filosofi",
    death: 1778,
  },
  {
    name: "Rousseau, Jean-Jacques, 1712-1778",
    display: "Jean-Jacques Rousseau",
    genre: "politik",
    death: 1778,
  },
  {
    name: "Diderot, Denis, 1713-1784",
    display: "Denis Diderot",
    genre: "filosofi",
    death: 1784,
  },
  // AN ITALIAN IN THE FRENCH LIST, and this is the only way in. Vico was
  // entirely absent from the collection — the only "Vico" present was Ludovico
  // Ariosto. Bergin & Fisch's English `New Science` is from 1948 and still
  // protected; the Italian isn't on Gutenberg at all (see the file header in
  // build-corpus-it.ts for why that catalog is so thin). What remains is
  // Michelet's 1827 translation, PG 43307 — and Michelet died in 1874, so it's
  // in the public domain. That the philosophy of history in the collection
  // started with Hegel and not Vico was a hundred-year gap.
  {
    name: "Vico, Giambattista, 1668-1744",
    display: "Giambattista Vico",
    genre: "filosofi",
    death: 1744,
  },

  // 19th-century political theory and historiography.
  {
    name: "Tocqueville, Alexis de, 1805-1859",
    display: "Alexis de Tocqueville",
    genre: "politik",
    death: 1859,
  },
  {
    name: "Constant, Benjamin, 1767-1830",
    display: "Benjamin Constant",
    genre: "politik",
    death: 1830,
  },
  {
    name: "Comte, Auguste, 1798-1857",
    display: "Auguste Comte",
    genre: "filosofi",
    death: 1857,
  },
  {
    name: "Renan, Ernest, 1823-1892",
    display: "Ernest Renan",
    genre: "historia",
    death: 1892,
  },
  {
    name: "Taine, Hippolyte, 1828-1893",
    display: "Hippolyte Taine",
    genre: "historia",
    death: 1893,
  },
  {
    name: "Chateaubriand, François-René, vicomte de, 1768-1848",
    display: "Chateaubriand",
    genre: "prosa",
    death: 1848,
  },

  // The novel and the poem.
  {
    name: "Balzac, Honoré de, 1799-1850",
    display: "Honoré de Balzac",
    genre: "prosa",
    death: 1850,
  },
  {
    name: "Flaubert, Gustave, 1821-1880",
    display: "Gustave Flaubert",
    genre: "prosa",
    death: 1880,
  },
  {
    name: "Stendhal, 1783-1842",
    display: "Stendhal",
    genre: "prosa",
    death: 1842,
  },
  {
    name: "Hugo, Victor, 1802-1885",
    display: "Victor Hugo",
    genre: "prosa",
    death: 1885,
  },
  {
    name: "Zola, Émile, 1840-1902",
    display: "Émile Zola",
    genre: "prosa",
    death: 1902,
  },
  {
    name: "Proust, Marcel, 1871-1922",
    display: "Marcel Proust",
    genre: "prosa",
    death: 1922,
  },
  {
    name: "Baudelaire, Charles, 1821-1867",
    display: "Charles Baudelaire",
    genre: "dikt",
    death: 1867,
  },
  // `L'Ève future` (1886) coined the word "android" and gave Hoffmann's
  // automaton and Frankenstein's creature a technological self: an inventor
  // builds a woman to be better than the original. The collection's only route
  // there, since Gutenberg doesn't have it in English translation.
  {
    name: "Villiers de L'Isle-Adam, Auguste, comte de, 1838-1889",
    display: "Villiers de L'Isle-Adam",
    genre: "prosa",
    death: 1889,
  },
];

buildLanguagePart({
  language: "fr",
  prefix: "fr",
  outPath: path.join(process.cwd(), "src", "lib", "corpus-fr.json"),
  authors: AUTHORS,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
