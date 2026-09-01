/**
 * The gold standard — what retrieval has to deliver.
 *
 * Without a gold set, "better" is an opinion. `pnpm eval` has so far printed lists
 * and let the cross-encoder judge the mean score, which says something but can
 * never go down when a change does harm: a selection of wrong passages can just as
 * well score high on average as a selection of right ones.
 *
 * THE REQUIREMENTS BELOW ARE NOT MEASURED. They are normative: this is how we
 * read what the question means, and a retrieval that doesn't deliver this has
 * missed. Where a requirement is backed by an actual run, that's stated in the
 * `probes` line, and where it's a plain assumption, that's stated too. The
 * distinction must not be blurred just because the list looks measured.
 *
 * The name form is the EXACT string from `works.author`, never a substring.
 * `build-corpus` already carries the repo's most expensive lesson on this point —
 * "Wollstonecraft" matches Mary Shelley, "Darwin" matches a golf writer — and a
 * gold list that matched on substring would silently repeat the same mistake.
 * "Mill" appears in three indexed names, of which only one is John Stuart Mill.
 */

/** Three outcomes, not two — see `check()` below. */
export type AuthorVerdict = "träff" | "miss" | "oindexerad";

export interface GoldCase {
  question: string;
  /** What the question probes, and what the requirement rests on. */
  probes: string;
  /**
   * Authors who MUST be among the candidates. If one is missing, retrieval has
   * failed — that's the entire claim this list makes.
   */
  authors?: string[];
  /**
   * Authors who SHOULD be present. Reported but not counted toward recall.
   *
   * Exists for cases where the repo already knows the answer is missing and why.
   * A known open case should show up in every run without lowering the number
   * that measures whether today's change did harm.
   */
  wanted?: string[];
  /** Minimum number of distinct genres among the candidates. */
  minGenres?: number;
  /** Minimum number of Swedish original-language passages among the candidates. */
  minSwedish?: number;
}

export const GOLD: GoldCase[] = [
  {
    question: "vad är det goda livet?",
    probes:
      "Grundfallet. Frågan har ett kanoniskt svar hos Aristoteles och ett hos Platon; ger hämtningen ingendera är den trasig. Antaget, inte mätt.",
    authors: ["Aristotle", "Plato"],
    minGenres: 3,
  },
  {
    question: "får staten begränsa individens frihet?",
    probes:
      "Mill står i claude.ts:14 som den träff HyDE-expansionen gav på frihetsfrågan hos alla tre Claude-modeller — det kravet har alltså stöd i en körning. Hobbes är antagandet.",
    authors: ["John Stuart Mill", "Thomas Hobbes"],
    minGenres: 3,
  },
  {
    question: "är makt viktigare än moral för en furste?",
    probes:
      "Machiavelli står i claude.ts:15 som träffen på furstefrågan hos alla tre modellerna. Uteblir han är det inte en smaksak utan ett fel.",
    authors: ["Niccolò Machiavelli"],
  },
  {
    question: "vad säger Kant om lögnen?",
    probes:
      "Mentiongrenen. eval.ts har burit raden 'svaret SKA innehålla Kant' sedan grenen skrevs — utan den blev svaret Mill, Sidgwick och Augustinus, rimliga stycken om lögn men fel person.",
    authors: ["Immanuel Kant"],
  },
  {
    question: "civilisation kontra barbari",
    probes:
      "Bredden, och README:s eget exempel: frågan besvaras sämst av traktaten och bäst av Tacitus, Ferguson, Gibbon, Euripides och Conrad. Kravet är satt lågt mot den listan — två författare och fyra genrer — därför att spridningsfiltret medvetet får kasta ut de övriga.",
    authors: ["Cornelius Tacitus", "Edward Gibbon"],
    wanted: ["Adam Ferguson", "Euripides", "Joseph Conrad"],
    minGenres: 4,
  },
  {
    question: "sker framsteg i historien?",
    probes:
      "Kedjans dokumenterade tak. Marx gick från borta till kandidatplats 5 när det fjärde HyDE-registret lades till (.probe-progress-live.ts) — det är mätt. Hegel står som önskad och inte som krav: § 548 i Philosophy of Mind når ingen gren, oavsett pool, och nästa spak är samlingen. Se README.md:152-175.",
    authors: ["Karl Marx"],
    wanted: ["Georg Wilhelm Friedrich Hegel", "Arthur Schopenhauer"],
    minGenres: 3,
  },
  {
    question: "vad händer med själen efter döden?",
    probes:
      "Platons Faidon är svaret; religionsgenren ska höras. Antaget, inte mätt.",
    authors: ["Plato"],
    minGenres: 3,
  },
  {
    question: "ångesten inför den egna friheten",
    probes:
      "README:s eget exempel på en fråga vars ord inte finns i texterna — den prövar om vektorgrenarna bär när BM25 inte gör det. Kierkegaard är antagandet.",
    authors: ["Søren Kierkegaard"],
  },
  {
    question: "är människan god av naturen?",
    probes:
      "Två motsatta svar som båda ska med. Sonderar om omrankningen håller ihop en motsättning i stället för att välja sida. Antaget.",
    authors: ["Jean-Jacques Rousseau", "Thomas Hobbes"],
  },
  {
    question: "vad gör en handling moraliskt riktig?",
    probes:
      "Pliktetik mot nytta. Samma sak som ovan, i en fråga där båda svaren är traktater — spridningskravet vilar här på författare, inte genre. Antaget.",
    authors: ["Immanuel Kant", "John Stuart Mill"],
  },
  {
    question: "vad är religionens ursprung?",
    probes:
      "Antropologin. Frazers Golden Bough och Tylors Primitive Culture handlar om ingenting annat; ger frågan bara filosofi når hämtningen inte den delen av samlingen. Antaget.",
    authors: ["James George Frazer", "Edward Burnett Tylor"],
    minGenres: 3,
  },
  {
    question: "äktenskapet som en institution byggd på lögn",
    probes:
      "Tvåspråkigheten, och appens bärande påstående: originalet väger tyngre än översättningen. Strindberg och Ibsen finns båda som engelska Gutenbergutgåvor. minSwedish faller tills de svenska källorna är indexerade — den raden är avsiktligt ett krav som i dag inte går att uppfylla, och den ska stå kvar tills den gör det.",
    authors: ["August Strindberg", "Henrik Ibsen"],
    minSwedish: 1,
    minGenres: 2,
  },
];

/** A passage the gold set needs to be able to read. A subset of `Candidate`. */
export interface GoldPassage {
  author: string;
  genre: string;
  language: string;
}

export interface AuthorResult {
  author: string;
  verdict: AuthorVerdict;
  /** Requirement or wish? Only requirements count toward recall. */
  required: boolean;
}

export interface GoldResult {
  authors: AuthorResult[];
  genres: number;
  swedish: number;
  /** Requirements met and requirement count — recall's numerator and denominator. */
  hits: number;
  required: number;
  /** Requirements that couldn't be tested, because the author isn't in the index. */
  untestable: number;
  /** The spread requirements, `null` when the case doesn't impose one. */
  genresOk: boolean | null;
  swedishOk: boolean | null;
}

/**
 * Checks one case against the candidates.
 *
 * Three outcomes and not two, because "the author didn't make it in" and "the
 * author isn't in the database" are different failures and call for different
 * fixes — one in the retrieval chain, the other in indexing.
 * `.probe-progress-coverage.ts` exists precisely to keep them apart, and a gold
 * set that conflated them would be worthless while the collection is being
 * indexed: the number would rise on its own as ingest caught up, and look as
 * though a change to retrieval had helped.
 *
 * `indexedAuthors` is therefore the names actually present in `works`, not the
 * ones listed in the manifest.
 */
export function check(
  gold: GoldCase,
  candidates: GoldPassage[],
  indexedAuthors: Set<string>,
): GoldResult {
  const present = new Set(candidates.map((c) => c.author));

  const judge = (author: string, required: boolean): AuthorResult => ({
    author,
    required,
    verdict: present.has(author)
      ? "träff"
      : indexedAuthors.has(author)
        ? "miss"
        : "oindexerad",
  });

  const authors = [
    ...(gold.authors ?? []).map((a) => judge(a, true)),
    ...(gold.wanted ?? []).map((a) => judge(a, false)),
  ];

  const req = authors.filter((a) => a.required);
  const genres = new Set(candidates.map((c) => c.genre)).size;
  const swedish = candidates.filter((c) => c.language === "sv").length;

  return {
    authors,
    genres,
    swedish,
    hits: req.filter((a) => a.verdict === "träff").length,
    required: req.filter((a) => a.verdict !== "oindexerad").length,
    untestable: req.filter((a) => a.verdict === "oindexerad").length,
    genresOk: gold.minGenres === undefined ? null : genres >= gold.minGenres,
    swedishOk:
      gold.minSwedish === undefined ? null : swedish >= gold.minSwedish,
  };
}
