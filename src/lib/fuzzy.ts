/**
 * Name matching for the filter on `/samling`.
 *
 * The collection is spelled as the sources spell it: Camões, Kierkegaard,
 * Dostojevskij, Söderberg, Bjørnson. Someone searching types what the
 * keyboard allows, and the difference between the two is the whole reason
 * this module exists — a filter that requires the right diacritic and the
 * right transliteration is a filter that answers "nothing" to a name that's
 * right there in the list.
 *
 * No off-the-shelf fuzzy module: `fuse.js` and its relatives don't fold
 * diacritics, and it's exactly the diacritics that trip up these names.
 * Adding a package and still having to write the folding yourself would be
 * paying bundle weight for half the work. The module is also pure and
 * isomorphic — it runs in the browser.
 *
 * Does not rank. Matches are shown in the page's own order (subject, then
 * author name), because the list is a bibliography and not a result list; an
 * order that jumps with every keystroke is harder to read than the
 * alphabetical one already learned.
 */

/**
 * The same folding as `foldName` in `gutenberg.ts`, for the same reason: NFD
 * alone isn't enough, since ø, æ, ð and ł have no combining form to strip.
 *
 * The duplication is deliberate, not an import mistake. `gutenberg.ts`
 * starts with `node:fs` and drags fetching, the disk cache and the rights
 * check along with it; none of that should end up in the client bundle for
 * a search box.
 */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/ł/g, "l")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The query as a list of folded words. An empty list means no filter at all.
 *
 * The words are tested individually and all must match, in any order:
 * "dosto brott" should find Brott och straff, and "kierkegaard begreppet"
 * shouldn't require remembering whether the author or the title came first
 * in the line.
 */
export function queryTerms(query: string): string[] {
  const folded = fold(query);
  return folded ? folded.split(" ") : [];
}

/**
 * How many character errors a search word may carry.
 *
 * The thresholds are chosen, not measured. The reason is the shape of the
 * mistakes that used to trip up these names: "dostojevski" against
 * "Dostojevskij" and "kirkegard" against "Kierkegaard" are one and two edits
 * in words of nine to eleven characters, while short words can't tolerate
 * any at all — with one error "kant" also becomes "karl," "katt" and "land,"
 * and three letters would match half the collection. Below five characters,
 * plain substring matching applies instead.
 */
function tolerance(length: number): number {
  if (length >= 8) return 2;
  if (length >= 5) return 1;
  return 0;
}

/**
 * Levenshtein with a cap: bails out as soon as the whole row exceeds `max`.
 *
 * The cap isn't an optimization but the condition itself — we never ask how
 * far apart two words are, only whether they're closer than this. The bail
 * makes the thousands of words that don't resemble the search word cost one
 * or two rows instead of the whole matrix.
 */
function withinDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let row = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    row[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return false;
    [prev, row] = [row, prev];
  }
  return prev[b.length] <= max;
}

/**
 * A search word against a folded name.
 *
 * Substring first, and that's the common hit: "berg" in "Kierkegaard,"
 * "brott" in "brott och straff." Only when that misses is the misspelling
 * tolerance tried, and only word by word — the search word is compared
 * against the word's start plus the error margin, so "dostojevski" reaches
 * "dostojevskij" without the whole surname needing to be spelled out.
 * Comparing against the whole name at once would be pointless: the distance
 * between "kant" and "immanuel kant" is ten edits, no matter how correct the
 * word is.
 */
function matchesTerm(term: string, folded: string): boolean {
  if (folded.includes(term)) return true;

  const max = tolerance(term.length);
  if (max === 0) return false;

  for (const word of folded.split(" ")) {
    if (withinDistance(term, word.slice(0, term.length + max), max)) return true;
  }
  return false;
}

/** Every search word must match the name. An empty list matches everything. */
export function matches(terms: string[], folded: string): boolean {
  return terms.every((term) => matchesTerm(term, folded));
}

export interface HighlightRange {
  start: number;
  end: number;
}

/**
 * Folding that preserves character positions 1:1 against the original string.
 *
 * `fold()` can't be used for highlighting: it swaps ø/æ/œ/ð/þ/ł/ß for one or
 * two other characters and collapses runs of spaces into a single one, so an
 * index in the folded string no longer points at the same spot in the
 * original. NFD plus stripped diacritics is enough for positions, since a
 * composed letter (é → e + accent) folds to exactly one character, just as
 * it occupied in the original.
 */
function foldKeepingPositions(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Where in the text the search words sit, in order to highlight them in the list.
 *
 * Only substring hits are drawn. A name the filter found only through the
 * error margin in `matchesTerm` — a Dostojevskij misspelling, or a letter
 * `fold()` rewrote into several characters — has no exact position to work
 * out without repeating Levenshtein character by character, and stays
 * unhighlighted in the list. Same tradeoff `fold()` makes: the substring is
 * the common hit, the error margin the exception.
 */
export function highlightRanges(text: string, terms: string[]): HighlightRange[] {
  if (terms.length === 0) return [];
  const folded = foldKeepingPositions(text);

  const ranges: HighlightRange[] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at === -1) break;
      ranges.push({ start: at, end: at + term.length });
      from = at + term.length;
    }
  }
  if (ranges.length === 0) return [];

  // Overlapping or adjacent matches (two search words that share letters)
  // are merged, otherwise the same character gets drawn into two <mark>s and
  // React complains about nested keys.
  ranges.sort((a, b) => a.start - b.start);
  const merged = [ranges[0]];
  for (const range of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push(range);
  }
  return merged;
}
