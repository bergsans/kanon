/**
 * Paragraph-based chunking with locator detection.
 *
 * The goal is passages that can be read standalone in the interface, that carry
 * a reference you can look up ("Republic, Book VII"), and that fall within a size
 * range the embedding model actually handles.
 */

import type { Language } from "./corpus";

const TARGET_MIN = 900;
const TARGET_MAX = 1400;
/**
 * Individual paragraphs above this are split on a sentence boundary. The ceiling
 * sits below the embedding model's 512-token window (~2000 characters) — a longer
 * chunk would have its tail silently clipped at indexing time and become
 * unsearchable.
 */
const HARD_SPLIT = 1800;

/**
 * Heading forms, per language.
 *
 * The keyword can sit anywhere in the line — editions differ:
 * "BOOK I." (Republic), "FIRST BOOK" (Meditations), "THE SECOND PART" (Leviathan),
 * "CHAPTER XVI. CONCERNING LIBERALITY" (The Prince).
 *
 * ACT and SCENE were added with the drama: without them a passage from *Lear*
 * gets no reference at all, and "show in context" is the only way to see where
 * you are. Same for HYMN, ODE, PSALM, FABLE and SATIRE in the poetry collections,
 * and for SURA in the Quran.
 *
 * The Swedish lists are deliberately shorter. The most common Swedish heading form
 * — "FÖRSTA KAPITLET.", "ANDRA AKTEN." — is caught anyway by the rule for short
 * all-caps lines further down, so the keywords only need to cover headings that
 * are *not* set in caps. The more words in the list, the more ordinary sentences
 * happen to look like headings.
 */
interface HeadingRules {
  /** Words that turn a short line into a heading even in lowercase. */
  keyword: RegExp;
  /**
   * Headings that *may* mean "the translator's apparatus, not the work".
   * Jowett's introduction to the Republic is alone ~36% of the file and would
   * otherwise drown the search.
   *
   * But only the position decides: Spinoza's Ethics has a PREFACE inside every
   * part, and it is Spinoza's own text. See `isApparatus` below.
   */
  apparatus: RegExp;
  /** Headings that mark where the work's own text begins. */
  body: RegExp;
}

const RULES: Record<Language, HeadingRules> = {
  en: {
    keyword:
      /\b(BOOK|CHAPTER|PART|SECTION|APHORISM|ESSAY|DISCOURSE|MEDITATION|PREFACE|INTRODUCTION|APPENDIX|PROLOGUE|EPILOGUE|CANTO|ACT|SCENE|HYMN|ODE|PSALM|FABLE|SATIRE|IDYLL|ELEGY|LETTER|SURA|FYTTE|RHAPSODY)\b/i,
    apparatus:
      /\b(INTRODUCTION|PREFACE|ANALYSIS|APPENDIX|GLOSSARY|CONTENTS|NOTES?|BIBLIOGRAPHY|CHRONOLOGY|TRANSLATOR|EDITOR|LIFE OF|MEMOIR|DEDICATION|DRAMATIS PERSONAE|PERSONS REPRESENTED|ARGUMENT OF THE)\b/i,
    body: /\b(BOOK|CHAPTER|PART|SECTION|CANTO|ESSAY|DISCOURSE|APHORISM|MEDITATION|ACT|SCENE|HYMN|ODE|PSALM|SURA|FYTTE|RHAPSODY)\b/i,
  },
  sv: {
    keyword:
      /\b(BOK|BOKEN|KAPITEL|KAPITLET|KAP|DEL|DELEN|AVDELNING|AKT|AKTEN|SCEN|SCENEN|SÅNG|SÅNGEN|BREV|FÖRORD|INLEDNING|EFTERSKRIFT|BILAGA|PROLOG|EPILOG)\b/i,
    apparatus:
      /\b(INLEDNING|FÖRORD|INNEHÅLL|REGISTER|ORDFÖRKLARING(AR)?|NOTER|ANMÄRKNINGAR|KOMMENTAR(ER)?|EFTERSKRIFT|BIBLIOGRAFI|INNEHÅLLSFÖRTECKNING|TILL LÄSAREN|PERSONER(NA)?|RÄTTELSER)\b/i,
    // Narrower than the keyword list, and deliberately so. This list decides where
    // the work's own text BEGINS, and everything before it becomes front matter.
    // "SÅNGEN PÅ BERGET" is a poem title in Södergran, not a section heading: had
    // it counted as the work's beginning, the forty poems preceding it would have
    // fallen out of the search.
    body: /\b(BOK|BOKEN|KAPITEL|KAPITLET|KAP|DELEN|AVDELNING|AKT|AKTEN|SCEN|SCENEN)\b/i,
  },
  /**
   * German.
   *
   * HAUPTSTÜCK is included for a specific reason: Kant's *Kritik der reinen
   * Vernunft* is divided into Hauptstücke, not Kapitel, and without the word the
   * entire transcendental analytic gets no reference at all. THEIL with its old
   * spelling likewise — 18th- and 19th-century printings don't write "Teil".
   *
   * EINLEITUNG sits in the apparatus list even though Kant's own introduction is
   * part of the work. It's the same tradeoff as INTRODUCTION in the English list:
   * the word only strikes what lies *outside* the work's span, and an introduction
   * inside a work counts as the author's own. See `isApparatus`.
   */
  de: {
    keyword:
      /\b(BUCH|KAPITEL|HAUPTST(Ü|UE)CK|ABSCHNITT|ABTHEILUNG|ABTEILUNG|TH?EIL|VORREDE|VORWORT|EINLEITUNG|ANHANG|NACHWORT|AUFZUG|AKT|SZENE|SCENE|GESANG|BRIEF|ABHANDLUNG|BETRACHTUNG|VORLESUNG|PARAGRAPH)\b/i,
    apparatus:
      /\b(EINLEITUNG|VORREDE|VORWORT|INHALT|INHALTSVERZEICHNIS|REGISTER|ANMERKUNGEN|ERL(Ä|AE)UTERUNGEN|NACHWORT|ANHANG|BIBLIOGRAPHIE|DRUCKFEHLER|BERICHTIGUNGEN|WIDMUNG|ZUEIGNUNG|PERSONEN|VORBERICHT)\b/i,
    body: /\b(BUCH|KAPITEL|HAUPTST(Ü|UE)CK|ABSCHNITT|ABTHEILUNG|ABTEILUNG|TH?EIL|AUFZUG|AKT|SZENE|SCENE|GESANG|VORLESUNG)\b/i,
  },
  /**
   * French.
   *
   * LIVRE and CHAPITRE carry most of it, but TITRE has to be included: Montesquieu
   * divides *De l'esprit des lois* into livres and, under those, chapitres, while
   * the codes and statutes he quotes use titres. DISCOURS likewise — Descartes'
   * work bears that name, and so do Rousseau's two famous tracts.
   *
   * The list is shorter than the English one for the same reason as the Swedish
   * one: the common French heading is set in caps ("CHAPITRE PREMIER"), and it's
   * caught anyway by the rule for short all-caps lines. The keywords only need to
   * cover headings in lowercase.
   */
  fr: {
    keyword:
      /\b(LIVRE|CHAPITRE|PARTIE|SECTION|TITRE|ACTE|SC(È|E)NE|CHANT|LETTRE|DISCOURS|ESSAI|M(É|E)DITATION|PR(É|E)FACE|INTRODUCTION|AVERTISSEMENT|AVANT-PROPOS|APPENDICE|(É|E)PILOGUE|PROLOGUE|FRAGMENT)\b/i,
    apparatus:
      /\b(PR(É|E)FACE|INTRODUCTION|AVERTISSEMENT|AVANT-PROPOS|TABLE|SOMMAIRE|NOTES?|APPENDICE|INDEX|BIBLIOGRAPHIE|ERRATA|D(É|E)DICACE|PERSONNAGES|GLOSSAIRE|CHRONOLOGIE|NOTICE)\b/i,
    body: /\b(LIVRE|CHAPITRE|PARTIE|SECTION|TITRE|ACTE|SC(È|E)NE|CHANT|DISCOURS|M(É|E)DITATION)\b/i,
  },
  /**
   * Italian.
   *
   * CANTO carries Dante alone: the *Commedia* has a hundred cantos and nothing
   * else to divide by, so without the word the whole work gets a single
   * reference. GIORNATA and NOVELLA belong to the Decameron — Boccaccio counts in
   * days and tales, not chapters — and without them the frame narrative's ten
   * days collapse into one passage.
   */
  it: {
    keyword:
      /\b(LIBRO|CAPITOLO|CAPO|PARTE|SEZIONE|CANTO|ATTO|SCENA|GIORNATA|NOVELLA|LETTERA|DISCORSO|PROEMIO|PREFAZIONE|INTRODUZIONE|APPENDICE|EPILOGO|PROLOGO)\b/i,
    apparatus:
      /\b(PREFAZIONE|INTRODUZIONE|PROEMIO|AVVERTENZA|INDICE|SOMMARIO|NOTE|APPENDICE|BIBLIOGRAFIA|ERRATA|DEDICA|PERSONAGGI|GLOSSARIO|CRONOLOGIA)\b/i,
    body: /\b(LIBRO|CAPITOLO|CAPO|PARTE|SEZIONE|CANTO|ATTO|SCENA|GIORNATA|DISCORSO)\b/i,
  },
  /**
   * Latin.
   *
   * Latin text is inflected, so a keyword shows up in four forms — LIBER, LIBRI,
   * LIBRO, LIBRUM — and the more forms the list covers, the more ordinary
   * sentences happen to look like headings. The rules cover the nominative and the
   * most common case forms found in heading position.
   *
   * THE ENGLISH STRUCTURE WORDS MUST ALSO BE INCLUDED, and that's not a sloppy
   * mixing. The Latin comes from Perseus, and `perseus.ts` builds the reference
   * from the CTS catalog's unit names — which are English regardless of the
   * text's language. Cicero's *In Verrem* gets the heading "ACTIO 1, BOOK 1 — IN
   * C. VERREM ACTIO PRIMA": a Latin work name, an English structure word. Without
   * BOOK in the list, the line isn't recognized, and the whole work ended up
   * without a reference — 892 passages with `locator: null`.
   */
  la: {
    keyword:
      /\b(LIBER|LIBRI|CAPUT|CAPITA|PARS|SECTIO|EPISTULA|EPISTOLA|CARMEN|ORATIO|ACTIO|ACTUS|SCAENA|SCENA|DIALOGUS|MEDITATIO|PRAEFATIO|PROOEMIUM|ARGUMENTUM|APPENDIX|BOOK|CHAPTER|SECTION|PART|POEM|LETTER|SPEECH)\b/i,
    apparatus:
      /\b(PRAEFATIO|PROOEMIUM|INDEX|NOTAE|ADNOTATIONES|APPENDIX|ARGUMENTUM|ERRATA|DEDICATIO|PERSONAE|GLOSSARIUM)\b/i,
    body: /\b(LIBER|LIBRI|CAPUT|CAPITA|PARS|SECTIO|EPISTULA|EPISTOLA|CARMEN|ORATIO|ACTIO|ACTUS|SCAENA|SCENA|DIALOGUS|MEDITATIO|BOOK|CHAPTER|SECTION|PART|POEM|LETTER|SPEECH)\b/i,
  },
};

/** A heading is short and stands alone — excludes sentences that happen to mention "book". */
const MAX_HEADING_LEN = 90;

/**
 * Scripture numbers itself, and that's why it fell out of the references.
 *
 * The Bible is the collection's only work that puts its division in the body text
 * instead of in headings: chapter and verse appear as "1:1 In the beginning", and
 * the chapter change has no line of its own. Book lines do exist, but carry the
 * keyword in the middle — "The First Book of Moses: Called Genesis", where BOOK
 * sits at position 10 and the line isn't all-caps — and `looksLikeHeading`
 * requires either position 0 or an all-caps line.
 *
 * The result was that all 5,416 passages got `locator: null`: the whole Bible
 * indexed and searchable, and not a single passage possible to look up — in the
 * one work where chapter and verse ARE the reference, and where "The Bible, The
 * King James Version" with no book says about as much as "Plato, Works".
 *
 * Loosening `RULES.en` was not the way: a keyword allowed anywhere in a short line
 * turns every line of dialogue under 90 characters that happens to contain "book"
 * into a heading, and the chapters still wouldn't have been caught. The form is
 * instead distinctive enough to be recognized on its own.
 */
const VERSE_RE = /^(\d+):\d+\s/;

/** The book's first passage, and the only place in a book where the verse is 1:1. */
const FIRST_VERSE_RE = /^1:1\s/;

/**
 * How many verse-numbered passages are required for the text to be read as
 * scripture.
 *
 * The form decides, not the work's ID. A Bible from another source or in another
 * language numbers the same way and should be treated the same way — and
 * conversely: if the threshold latches onto one work's ID, it has to be reset
 * every time the collection grows.
 *
 * The number is measured in `.probe-bible-locator.ts` over the 2,335 fetched texts
 * in `data/texts`: the Bible has 24,404 verse-numbered passages out of 24,610
 * (99.2%), and the second-highest value in the whole collection is 5 — five
 * numbered letter headings ("1:0 Svar på Alexanders svar…") in Stiernstedt. The
 * margin is four orders of magnitude, and requiring the verse passages to exceed
 * half of all passages also distinguishes scripture from a work that merely
 * *quotes* chapter and verse extensively.
 */
const VERSE_MINIMUM = 500;

/**
 * The book's name as a reference writes it, not as Gutenberg's heading line reads.
 *
 * KJV's own lines are spelled out 17th-century style — "The First Epistle of Paul
 * the Apostle to the Corinthians" — and that line plus a chapter number becomes 58
 * characters in a column where `shortLocator` truncates at 44. Nobody cites it
 * that way either: the reference is "1 Corinthians 13", and that's the form that
 * can be looked up in any edition, in any language.
 *
 * The rules are tried in order and written against KJV's 66 heading lines — all 66
 * outcomes are recorded in `.probe-bible-locator.ts`. If a line falls through all
 * the rules, the reference becomes the heading line as it stands: worse, but never
 * wrong.
 */
const BOOK_NAME_RULES: [RegExp, string][] = [
  // The order is not arbitrary: "Book of the Prophet Isaiah" must meet the prophet
  // rule before the general book rule, otherwise the book would be named "Prophet
  // Isaiah", and the Pauline epistles have their own rule ahead of the general
  // epistle rule.
  [/^book of the prophet\s+/i, ""],
  [/^books?\s+of\s+(the\s+)?/i, ""],
  [/^gospel according to saint\s+/i, ""],
  [/^epistle of paul the apostle to\s+(the\s+)?/i, ""],
  [/^(general\s+)?epistle\s+(general\s+)?of\s+/i, ""],
  [/^acts of the apostles$/i, "Acts"],
  [/^revelation of\s+.+$/i, "Revelation"],
  [/^lamentations of\s+.+$/i, "Lamentations"],
];

/** "The First Book of Samuel" → "1 Samuel". The ordinal comes first in the reference. */
const ORDINAL: Record<string, string> = { first: "1", second: "2", third: "3" };

function bookName(line: string): string {
  const raw = line.replace(/\s+/g, " ").trim();

  // The books of Moses are named after a colon and carry no ordinal in the
  // reference — "Genesis", not "1 Moses". So that rule is tried before the
  // ordinal.
  const called = /:\s*called\s+(.+)$/i.exec(raw);
  if (called) return called[1].trim();

  let ordinal = "";
  let s = raw;
  const ord = /\b(first|second|third)\b\s*/i.exec(s);
  if (ord) {
    ordinal = `${ORDINAL[ord[1].toLowerCase()]} `;
    s = (s.slice(0, ord.index) + s.slice(ord.index + ord[0].length))
      .replace(/\s+/g, " ")
      .trim();
  }

  // The definite article carries no information in a reference and gets in the way
  // of every rule below, so it's dropped first, on its own.
  s = s.replace(/^the\s+/i, "").trim();

  // The rest are tried in order and AT MOST ONE fires: each rule shortens its own
  // heading pattern down to the same name, and two in a row would cut into the
  // name itself.
  for (const [re, to] of BOOK_NAME_RULES) {
    const next = s.replace(re, to).trim();
    if (next !== s) {
      s = next;
      break;
    }
  }
  return `${ordinal}${s}`.trim();
}

/**
 * Lines between two books that are not the book's name: the testament headings
 * and the asterisk line separating the Old Testament from the New. They should
 * become neither reference nor body text, but they must be skipped — otherwise
 * they linger in the previous chapter's chunk and get cited as part of Malachi 4.
 */
function isDivider(text: string): boolean {
  if (!/\p{L}/u.test(text)) return true;
  return text.length <= MAX_HEADING_LEN && /\btestament\b/i.test(text);
}

/** A book title is short, stands on its own line, and doesn't end the way a sentence does. */
function isBookTitle(text: string): boolean {
  if (text.length > MAX_HEADING_LEN) return false;
  if (text.includes("\n")) return false;
  if (/[.!?]$/.test(text)) return false;
  return /\p{L}/u.test(text) && !isDivider(text);
}

interface Scripture {
  /** The reference per passage: "Genesis 1". */
  locator: (string | null)[];
  /** Heading, testament, and divider lines — no body text. */
  skip: boolean[];
  /** The first book's beginning. Everything before it is a table of contents. */
  firstBody: number;
}

/**
 * Where the books begin and which chapter each passage belongs to.
 *
 * The book boundary is "1:1" and nothing else: the verse occurs exactly once per
 * book and never inside one. The heading sits in the unbroken cluster of
 * non-verse passages closest before it — but NOT necessarily last in that
 * cluster, and that's the whole difficulty. 1 Samuel follows its heading with its
 * own alternate title ("Otherwise Called: The First Book of the Kings"), and
 * Ecclesiastes with its own ("or The Preacher"), so the last line before 1:1
 * would give Samuel the name "Kings". The cluster's FIRST heading line is the
 * book's name.
 *
 * The chapter is read from the passage's first verse number. A passage without a
 * verse number inherits the chapter from above, and that's deliberate: KJV's last
 * verse in a chapter is sometimes broken off into its own passage without the
 * number following ("And he comforted them, and spake kindly unto them." is
 * Genesis 50:21), and that line is text from the work just as much as the rest.
 */
function scriptureStructure(paras: Para[]): Scripture {
  const locator: (string | null)[] = new Array(paras.length).fill(null);
  const skip: boolean[] = new Array(paras.length).fill(false);
  let firstBody = paras.length;

  const book: (string | null)[] = new Array(paras.length).fill(null);
  for (let i = 0; i < paras.length; i++) {
    if (!FIRST_VERSE_RE.test(paras[i].text)) continue;

    let name: string | null = null;
    let start = i;
    for (let j = i - 1; j >= 0; j--) {
      const text = paras[j].text;
      if (VERSE_RE.test(text)) break;
      if (isBookTitle(text)) name = text;
      else if (!isDivider(text)) break;
      skip[j] = true;
      start = j;
    }
    if (name === null) continue;
    book[i] = bookName(name);
    firstBody = Math.min(firstBody, start);
  }

  let current: string | null = null;
  let chapter = "";
  for (let i = 0; i < paras.length; i++) {
    if (book[i] !== null) {
      current = book[i];
      chapter = "";
    }
    if (current === null) continue;
    const verse = VERSE_RE.exec(paras[i].text);
    if (verse) chapter = verse[1];
    locator[i] = chapter ? `${current} ${chapter}` : current;
  }

  return { locator, skip, firstBody };
}

/** Scripture or ordinary text. The form decides — see `VERSE_MINIMUM`. */
function scriptureOf(paras: Para[]): Scripture | null {
  const verses = paras.filter((p) => VERSE_RE.test(p.text)).length;
  if (verses < VERSE_MINIMUM || verses * 2 <= paras.length) return null;
  const structure = scriptureStructure(paras);
  // The form can match without the books being nameable — the ordinary heading
  // route is still better than no references at all.
  return structure.locator.some((l) => l !== null) ? structure : null;
}

/** Strict Roman numeral, so "Civil" doesn't accidentally get capitalized to "CIVIL". */
const ROMAN_RE = /^m*(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;

export interface Chunk {
  ordinal: number;
  locator: string | null;
  isFrontMatter: boolean;
  charStart: number;
  charEnd: number;
  text: string;
}

interface Para {
  text: string;
  start: number;
  end: number;
}

/** Splits on blank lines, keeping each paragraph's character offset in the original text. */
function splitParagraphs(text: string): Para[] {
  const out: Para[] = [];
  let cursor = 0;
  for (const raw of text.split(/\n\s*\n/)) {
    const start = text.indexOf(raw, cursor);
    if (start === -1) continue;
    cursor = start + raw.length;
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      const lead = raw.length - raw.trimStart().length;
      out.push({
        text: trimmed,
        start: start + lead,
        end: start + lead + trimmed.length,
      });
    }
  }
  return out;
}

function looksLikeHeading(p: Para, rules: HeadingRules): boolean {
  // Headings wrap across lines in several editions ("CHAPTER I. HOW MANY KINDS OF\nPRINCIPALITIES..."),
  // so test the joined form — but only a couple of lines, not a whole paragraph.
  if (p.text.split("\n").length > 3) return false;
  const line = p.text.replace(/\s+/g, " ").trim();
  if (line.length > MAX_HEADING_LEN) return false;
  if (/[?!]$/.test(line)) return false;

  const allCaps = line === line.toUpperCase() && /[A-ZÅÄÖ]/.test(line);

  // A short, standalone all-caps line is a heading even without a keyword.
  // Jowett's Plato editions separate introduction from dialogue with just
  // "STATESMAN" on its own line, and without this rule the whole file gets the
  // locator "Introduction And Analysis" — whereupon Jowett's own introduction gets
  // searched as if it were Plato's text. The requirement of at least two words
  // keeps out all-caps exclamations mid-line.
  if (allCaps && /\s/.test(line) === false && line.length < 24) return true;
  if (allCaps && line.split(/\s+/).length <= 8) return true;

  const m = rules.keyword.exec(line);
  if (!m) return false;

  // Either the keyword opens the line ("Chapter I", "BOOK I."), or the whole line
  // is all-caps ("FIRST BOOK", "THE SECOND PART"). An ordinary sentence that
  // happens to mention the word — "Yes, but discourse should have a limit" — is
  // neither.
  return m.index === 0 || allCaps;
}

/**
 * Tables of contents look exactly like headings. The difference is that they come
 * in a cluster: three or more heading candidates in a row with no body text
 * between them is a table of contents, not chapter headings.
 */
function markRealHeadings(paras: Para[], rules: HeadingRules): boolean[] {
  const candidate = paras.map((p) => looksLikeHeading(p, rules));
  const real = [...candidate];
  let runStart = -1;
  for (let i = 0; i <= paras.length; i++) {
    if (i < paras.length && candidate[i]) {
      if (runStart === -1) runStart = i;
      continue;
    }
    if (runStart !== -1 && i - runStart >= 3) {
      for (let j = runStart; j < i; j++) real[j] = false;
    }
    runStart = -1;
  }
  return real;
}

/** Normalizes "BOOK VII." → "Book VII" so citations look reasonable in the UI. */
function normalizeHeading(s: string): string {
  const cleaned = s
    .trim()
    .replace(/[.:;,\s]+$/, "")
    .replace(/\s+/g, " ");
  // All-caps headings become Title Case; mixed-case text is left alone.
  if (cleaned === cleaned.toUpperCase()) {
    return (
      cleaned
        .toLowerCase()
        // \b won't do: JavaScript's word boundary sits between [A-Za-z0-9_] and
        // everything else, so å, ä and ö count as punctuation. With \b,
        // "fågelperspektiv" became "FÅGelperspektiv" — every Swedish vowel started
        // a new "word". The Unicode class \p{L} knows better.
        .replace(
          /(^|[^\p{L}])(\p{Ll})/gu,
          (_, before: string, c: string) => before + c.toUpperCase(),
        )
        // Roman numerals should stay uppercase: "Book Vii" → "Book VII"
        .replace(/(?<!\p{L})[ivxlcdm]+(?!\p{L})/giu, (m) =>
          ROMAN_RE.test(m) ? m.toUpperCase() : m,
        )
    );
  }
  return cleaned;
}

/**
 * Splits an over-long paragraph on a sentence boundary.
 *
 * The pieces' offsets are looked up in the original text rather than computed
 * from lengths — the gap between sentences can be line breaks and more than one
 * character, and an accumulated length would drift away from the real positions.
 * That would in turn highlight the wrong span of text in "show in context".
 */
function splitLongParagraph(p: Para): Para[] {
  const pieces: Para[] = [];
  // Ü for German, É/À for French, « for the French quotation mark: "Über",
  // "Étant" and «Voilà» begin a sentence just as often as "Om" does in Swedish,
  // and without them a long paragraph gets split in the wrong places.
  const sentences = p.text.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖÜÉÈÀÇ“"'(«])/);

  let cursor = 0;
  let start = -1;
  let end = -1;

  const flush = () => {
    if (start === -1) return;
    pieces.push({
      text: p.text.slice(start, end),
      start: p.start + start,
      end: p.start + end,
    });
    start = -1;
  };

  for (const s of sentences) {
    const at = p.text.indexOf(s, cursor);
    if (at === -1) continue;
    cursor = at + s.length;
    if (start !== -1 && at + s.length - start > TARGET_MAX) flush();
    if (start === -1) start = at;
    end = at + s.length;
  }
  flush();

  // Verse, dialogue and lists have no sentence boundaries to split on — there the
  // loop above hands back a single overweight piece. Break it on a word boundary
  // instead.
  return (pieces.length > 0 ? pieces : [p]).flatMap(hardWrap);
}

/** Last resort: split at the nearest word boundary before the ceiling. */
function hardWrap(p: Para): Para[] {
  if (p.text.length <= HARD_SPLIT) return [p];

  const out: Para[] = [];
  let offset = 0;
  while (offset < p.text.length) {
    const remaining = p.text.length - offset;
    if (remaining <= HARD_SPLIT) {
      out.push({
        text: p.text.slice(offset),
        start: p.start + offset,
        end: p.end,
      });
      break;
    }
    const window = p.text.slice(offset, offset + HARD_SPLIT);
    const cut = window.lastIndexOf(" ");
    const len = cut > HARD_SPLIT / 2 ? cut : HARD_SPLIT;
    out.push({
      text: p.text.slice(offset, offset + len),
      start: p.start + offset,
      end: p.start + offset + len,
    });
    offset += len + (cut > HARD_SPLIT / 2 ? 1 : 0);
  }
  return out;
}

export function chunkText(text: string, language: Language = "en"): Chunk[] {
  const rules = RULES[language];
  const paras = splitParagraphs(text);

  const scripture = scriptureOf(paras);

  const isHeading = markRealHeadings(paras, rules);
  const headingCount = isHeading.filter(Boolean).length;

  // Without heading structure there's no way to tell apparatus from the work — then everything is body text.
  const hasStructure = headingCount >= 3;

  // Where the work's own text begins and ends. Apparatus (introduction, index)
  // only counts as front matter outside that span — a PREFACE in the middle of
  // the work, as in Spinoza's Ethics, is the author's own and should be searched.
  const bodyIdx = paras
    .map((p, i) =>
      isHeading[i] && rules.body.test(p.text) && !rules.apparatus.test(p.text)
        ? i
        : -1,
    )
    .filter((i) => i >= 0);
  const firstBody = bodyIdx.length > 0 ? bodyIdx[0] : -1;
  const lastBody = bodyIdx.length > 0 ? bodyIdx[bodyIdx.length - 1] : -1;

  // Fallback when the work has no keyword headings at all (BOOK, CHAPTER, PART …).
  // Plato's dialogues in Jowett's edition have only "INTRODUCTION AND ANALYSIS"
  // and "STATESMAN" — no book divisions, hence no `firstBody` to measure against.
  // Then an apparatus heading counts as front matter if some later heading is NOT
  // apparatus, i.e. if the work's own text demonstrably comes afterward.
  //
  // The rule only applies when `firstBody === -1`. Otherwise it would strike
  // Spinoza's PREFACE, which sits inside every part of the Ethics and is his own
  // text.
  const headingIdx = paras.map((_, i) => i).filter((i) => isHeading[i]);
  const lastOwnHeading = headingIdx
    .filter((i) => !rules.apparatus.test(paras[i].text))
    .pop();

  const isApparatus = (loc: string | null, paraIndex: number): boolean => {
    if (!hasStructure) return false;

    if (firstBody === -1) {
      if (loc === null || lastOwnHeading === undefined) return false;
      return rules.apparatus.test(loc) && paraIndex < lastOwnHeading;
    }

    // Before the work's first part: title page, contents, translator's introduction.
    if (paraIndex < firstBody) return true;
    // After the last part: index, glossary, notes.
    if (paraIndex > lastBody && (loc === null || rules.apparatus.test(loc)))
      return true;
    return false;
  };

  const chunks: Chunk[] = [];
  let locator: string | null = null;
  let buf: Para[] = [];
  let bufLen = 0;
  let ordinal = 0;
  let bufStart = 0;
  // True whenever `buf` holds nothing but the overlap paragraph `flush`
  // just carried forward — i.e. no new paragraph has been pushed onto it
  // since. A boundary right after that (a heading, a scripture chapter
  // change, the end of the text) used to call `flush` again on exactly that
  // untouched buf, pushing the overlap paragraph a second time as its own
  // chunk — text already sitting at the tail of the chunk before it, and
  // invisible to the dedupe filter at the end of this function, which only
  // compares a chunk's whole text against its neighbor's, not against a
  // substring of it. `flush` below is a no-op while this is true, and the
  // one place `buf` gains genuinely new content — the `push` in the main
  // loop — clears it.
  let overlapOnly = false;

  const flush = () => {
    if (buf.length === 0 || overlapOnly) return;
    const text = buf.map((p) => p.text).join("\n\n");
    chunks.push({
      ordinal: ordinal++,
      locator,
      // Scripture has no apparatus to separate out — Gutenberg's KJV is just text,
      // and the only thing outside the work is the book listing at the top.
      isFrontMatter: scripture
        ? bufStart < scripture.firstBody
        : isApparatus(locator, bufStart),
      charStart: buf[0].start,
      charEnd: buf[buf.length - 1].end,
      text,
    });
    // One paragraph of overlap, so an argument spanning the boundary still exists
    // whole within at least one chunk.
    const last = buf[buf.length - 1];
    buf = last.text.length < TARGET_MAX / 2 ? [last] : [];
    bufLen = buf.reduce((s, p) => s + p.text.length, 0);
    overlapOnly = buf.length > 0;
  };

  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];

    if (scripture) {
      // Heading and divider lines are not text from the work and must not end up
      // inside a passage.
      if (scripture.skip[i]) {
        flush();
        buf = [];
        bufLen = 0;
        overlapOnly = false;
        continue;
      }
      // The chapter change breaks the chunk, and the overlap `flush()` otherwise
      // saves must be dropped right here: a verse from Genesis 2 in a passage
      // labeled "Genesis 3" is a reference pointing at the wrong place, and the
      // reference is the whole reason scripture is chunked on its own.
      if (scripture.locator[i] !== locator) {
        flush();
        buf = [];
        bufLen = 0;
        overlapOnly = false;
        locator = scripture.locator[i];
      }
    } else if (isHeading[i]) {
      flush();
      buf = [];
      bufLen = 0;
      overlapOnly = false;
      locator = normalizeHeading(p.text);
      continue;
    }

    const pieces = p.text.length > HARD_SPLIT ? splitLongParagraph(p) : [p];
    for (const piece of pieces) {
      if (bufLen > 0 && bufLen + piece.text.length > TARGET_MAX) flush();
      // The overlap `flush()` saved must not in turn push the chunk over the
      // model's window — better to sacrifice the overlap then.
      if (bufLen > 0 && bufLen + piece.text.length > HARD_SPLIT) {
        buf = [];
        bufLen = 0;
        overlapOnly = false;
      }
      if (buf.length === 0) bufStart = i;
      buf.push(piece);
      overlapOnly = false;
      bufLen += piece.text.length;
      if (bufLen >= TARGET_MIN) flush();
    }
  }
  flush();

  // The overlap rule can leave a final chunk identical to the previous one's tail.
  return chunks.filter(
    (c, i) => c.text.length > 120 && (i === 0 || c.text !== chunks[i - 1].text),
  );
}
