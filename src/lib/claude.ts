import Anthropic from "@anthropic-ai/sdk";
import { GENRE_LABEL } from "./corpus";
import { NotIndexedError } from "./db";
import {
  CORPUS_LANGUAGES,
  ERA_LABEL,
  LANGUAGE_CORPUS,
  LANGUAGE_LABEL,
  NO_FILTER,
  type CorpusFilter,
  type Language,
} from "./taxonomy";
import { DEFAULT_LOCALE, t, type Locale } from "./i18n";
import { DEFAULT_EFFORT, type Effort } from "./provider";
import { envInt, type Candidate } from "./search";
import type { CostLine, CostStep, ExternalHit } from "./protocol";

/**
 * Model choice — measured, not guessed.
 *
 * Both steps were run on Opus 5, Sonnet 5 and Haiku 4.5 with identical prompts:
 *   reranking, 24 candidates   Opus $0.078   Sonnet $0.030   Haiku $0.012
 *   query expansion, per query Opus $0.011   Sonnet $0.004   Haiku $0.002
 * Sonnet chose 7 of 8 passages identically to Opus and wrote equally useful
 * Swedish rationales; the HyDE expansion produced the same hits (Mill on the
 * liberty question, Machiavelli on the prince question) across all three. Opus
 * thus pays ~3x for a difference that doesn't show up in the result.
 *
 * Set CANON_MODEL=claude-opus-5 in .env.local to switch back up.
 */
export const MODEL = process.env.CANON_MODEL ?? "claude-sonnet-5";

/** $ per million tokens, [input, output] — the basis for the whole bill. */
const PRICE: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};

/**
 * Models that accept `output_config.effort`.
 *
 * Haiku 4.5 doesn't: the parameter is rejected with a 400 "This model does not
 * support the effort parameter", and the whole call fails. This was discovered
 * when CANON_MODEL was set to Haiku for a measurement — without this table, a
 * model swap isn't a cheaper or pricier app, it's a broken one.
 */
const SUPPORTS_EFFORT: Record<string, boolean> = {
  "claude-opus-5": true,
  "claude-sonnet-5": true,
  "claude-haiku-4-5": false,
};

/** Passes the effort level only to models that can accept it. */
export function effort(level: "low" | "medium"): { effort?: "low" | "medium" } {
  return SUPPORTS_EFFORT[MODEL] === false ? {} : { effort: level };
}

/**
 * The cache has its own prices, both figured off the input price: a read costs a
 * tenth, a write costs twenty-five percent extra.
 *
 * The multipliers stand as their own numbers instead of inline in the sum because
 * the per-line price follows through to the interface. A line with 8,000 read
 * tokens and a cost of $0.0016 looks like an arithmetic error until $0.20/Mtok
 * stands next to it.
 */
const CACHE_READ = 0.1;
const CACHE_WRITE = 1.25;

/**
 * The shortest prefix the model will cache at all, in tokens.
 *
 * The number is model-dependent, and there's no error code for falling short of
 * it: `cache_control` is accepted, nothing gets saved, and the whole prompt is
 * billed as ordinary input on every call.
 *
 * This table exists to explain the warning in `logUsage`, not because any code
 * computes against it. An attempt to determine in advance whether a prompt is
 * long enough went wrong: the system prompt isn't the whole prefix. The JSON
 * schema in `output_config.format` sits before the messages and is cached along
 * with the prompt, and that's the difference between believing and knowing —
 *
 *   reranking, system prompt alone       867 tokens  under the threshold
 *   reranking, as actually sent         1161 tokens  over the threshold, cached
 *
 * So the warning is issued afterward against `usage` instead, where the answer is
 * there in black and white.
 */
const CACHE_MINIMUM: Record<string, number> = {
  "claude-opus-5": 512,
  "claude-sonnet-5": 1024,
  "claude-haiku-4-5": 4096,
};

const warnedCache = new Set<string>();

/**
 * The system prompt as a cached block.
 *
 * The five-minute cache, not `ttl: "1h"`: the hour variant costs double to write
 * instead of 1.25x and needs three calls on the same prefix within the hour to
 * break even, against two within five minutes. This app asks occasional questions
 * with long gaps between them, and a repeated question never even reaches Claude
 * anyway — it's caught by the semantic cache in searches.ts. In that case the
 * pricier write is just a pricier write.
 */
export function cachedSystem(text: string): Anthropic.TextBlockParam[] {
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

function costLine(label: string, tokens: number, perMillion: number): CostLine {
  return { label, tokens, perMillion, cost: (tokens * perMillion) / 1e6 };
}

/**
 * Computes what a call cost, line by line, and logs the total.
 *
 * Adaptive thinking is billed as *output*, and that's the line that dominates the
 * bill — the expansion step sends ~250 tokens of visible JSON but is billed for
 * ~725. The breakdown exists so that difference can be seen in the interface
 * instead of guessed at: someone wondering why a query cost twelve cents gets the
 * answer from the "output" line, not from the total.
 *
 */
export function logUsage(step: string, usage: Anthropic.Usage): CostStep {
  const [pIn, pOut] = PRICE[MODEL] ?? PRICE["claude-sonnet-5"];
  const lines = [
    costLine("inmatning", usage.input_tokens, pIn),
    costLine("utmatning", usage.output_tokens, pOut),
    costLine(
      "cacheläsning",
      usage.cache_read_input_tokens ?? 0,
      pIn * CACHE_READ,
    ),
    costLine(
      "cacheskrivning",
      usage.cache_creation_input_tokens ?? 0,
      pIn * CACHE_WRITE,
    ),
  ];
  const cost = lines.reduce((sum, line) => sum + line.cost, 0);
  // The cache lines are included in the log even though they're usually zero.
  // It's the only place a cache that has stopped working can be spotted: the cost
  // rises a few tenths of a cent and nothing else says so.
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const cache = read || write ? ` (cache: ${read} läst, ${write} skrivet)` : "";

  // Neither read nor written, even though the call asked for caching: the prefix
  // is shorter than the model's minimum cacheable length. It doesn't show up as an
  // error anywhere else — just as a bill that's a few tenths of a cent too high,
  // every time.
  if (read === 0 && write === 0 && !warnedCache.has(step)) {
    warnedCache.add(step);
    const minimum = CACHE_MINIMUM[MODEL];
    console.warn(
      `[canon] ${step}: ingenting cachades på ${MODEL}` +
        (minimum
          ? ` — prefixet är kortare än ${minimum} token, modellens gräns.`
          : "."),
    );
  }
  console.log(
    `[canon] ${step}: ${usage.input_tokens} in / ${usage.output_tokens} ut` +
      `${cache} = $${cost.toFixed(4)}`,
  );
  return { step, model: MODEL, lines, cost };
}

/**
 * A step that never ran. Costs zero and isn't logged — it exists only so the bill
 * has the same shape regardless of which path through the pipeline was taken.
 */
export function zeroStep(step: string): CostStep {
  return { step, model: MODEL, lines: [], cost: 0 };
}

/** The sum of several steps — a search is two calls, a translation is one. */
export function totalCost(steps: CostStep[]): number {
  return steps.reduce((sum, step) => sum + step.cost, 0);
}

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY saknas. Lägg den i .env.local (se .env.example).",
    );
  }
  client ??= new Anthropic();
  return client;
}

export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Thrown when a structured answer stopped before it was complete.
 *
 * Its own class so `describeError` can say what happened. Without it the
 * reader got `JSON.parse`'s "Unexpected end of JSON input" — true, but a
 * sentence about the parser, not about the answer, and one that gives no
 * hint that a narrower question is the way around it.
 */
export class IncompleteAnswerError extends Error {
  constructor(
    readonly reason: "max_tokens" | "model_context_window_exceeded" | "refusal",
  ) {
    super(`Claude stoppade innan svaret var färdigt (${reason}).`);
    this.name = "IncompleteAnswerError";
  }
}

/**
 * The text of a structured answer, once it's known to be whole.
 *
 * Every call in the app asks for a JSON schema, and a response cut off by the
 * token ceiling or the context window is invalid JSON by definition. Checked
 * after `logUsage`, never before: the truncated call was still billed, and
 * the bill should say so.
 */
export function completeText(message: Anthropic.Message): string {
  const reason = message.stop_reason;
  if (
    reason === "max_tokens" ||
    reason === "model_context_window_exceeded" ||
    reason === "refusal"
  ) {
    throw new IncompleteAnswerError(reason);
  }
  return textOf(message);
}

/* ------------------------------------------------------------------ *
 * Step 1 — query expansion
 * ------------------------------------------------------------------ */

/**
 * The languages the expansion writes a hypothetical passage in.
 *
 * English isn't included: it has its four registers in `hypotheticalPassages`
 * instead of a single passage, and that split is the collection's own — English
 * is five-sixths of the passages and carries the full genre range, while the
 * others are narrow selections from one archive each. See `LANGUAGE_CORPUS`.
 */
const PASSAGE_LANGUAGES = CORPUS_LANGUAGES.filter((l) => l !== "en");

/**
 * The languages the expansion translates the query into, for the cross-encoder.
 *
 * Swedish isn't included: it's the user's own query, verbatim. Asking the model
 * to rewrite it into Swedish would be paying tokens to risk it drifting.
 */
const QUERY_LANGUAGES = CORPUS_LANGUAGES.filter((l) => l !== "sv");

export interface QueryPlan {
  /**
   * Whether the question is something this collection could plausibly
   * answer — the Western canon in ten genres and six languages, not a
   * calculator or a coding assistant. Placed first in the schema, ahead of
   * `restatement`, so the model decides scope before spending output tokens
   * on hypothetical passages for a question the corpus was never going to
   * answer.
   *
   * Deliberately liberal, not measured against a gold standard the way the
   * numbers in this file are: false only for a question with no plausible
   * reading as philosophy, history, politics, drama, poetry, prose, science,
   * anthropology, religion or the essay — "what is 4 + 4", "write me a
   * Python script" —
   * never for an unusual or narrow one the collection might still answer.
   * `false` here stops the pipeline in the route before retrieval or
   * reranking ever run — see `plan.inScope` in `api/search/route.ts`.
   */
  inScope: boolean;
  /**
   * Not shown in the interface. This field is deliberately placed second in the
   * schema, right after `inScope`: the model formulates what the query is
   * looking for before it writes the hypothetical passages, and those passages
   * are what the entire vector search hinges on. Costs ~25 tokens.
   */
  restatement: string;
  /**
   * The query in each of the collection's languages — the cross-encoder's input.
   *
   * Used to be just `queryEn`, which scored every German, French, Italian and
   * Latin passage against the English form. That wasn't what made them invisible
   * — they never got that far — but it would have become the next bottleneck as
   * soon as the language branches let them through.
   *
   * Swedish is filled in by the caller from the query itself; the rest cost ~15
   * tokens each.
   */
  queries: Record<Language, string>;
  /**
   * Authors and works the query explicitly names, in the form they appear in the
   * collection. Drives the filtered branch in retrieval.
   */
  mentions: string[];
  /**
   * Four hypothetical passages in different registers — treatise, history/
   * narrative, poetry or drama, and the speculative system-building. One passage
   * was enough when the collection was only philosophy; now it also holds
   * historians, dramatists and novelists, and a passage written like Hobbes won't
   * find Euripides. Each passage becomes its own vector branch.
   *
   * The fourth register was added after "does history make progress", which
   * returned zero Hegel, Schopenhauer, Nietzsche, Kant and Marx. The first three
   * registers pull toward narrative and ethnography: Gibbon and Ferguson answer
   * the question, the world-spirit doesn't.
   *
   * Measured on a real run afterward (`.probe-progress-live.ts`, $0.068): Marx
   * went from absent to candidate rank 5 and into the answer, Engels likewise,
   * Schopenhauer entered the candidates but was dropped by reranking. So the
   * register carries weight.
   *
   * Hegel it doesn't carry, and the reason lies outside the expansion. The
   * Weltgeschichte section is indexed — §§ 548–552 of *Philosophy of Mind* — but
   * no branch reaches it: `.probe-progress-branchlimit.ts` shows § 548 doesn't
   * enter the fusion even at k=500, and `.probe-progress-genrerank.ts` shows it
   * sits at rank 2784 of the philosophy genre's 162,642 passages. Not even within
   * Hegel's own 8,475 passages does it make the top 300. Wallace translates
   * *Geist* as "mind", and the paragraph's wording is literally about national
   * spirits, climate and geography — the word "progress" isn't in it. It's the
   * embedding that fails to reach the passage, not a missing register, and that's
   * why the next lever is the collection: the famous formulation is in Sibree's
   * *Philosophy of History*, which isn't in the manifest.
   *
   * THE LIST IS NO LONGER JUST ENGLISH, and that's the heaviest change to this
   * field. After the four registers comes one passage per language from
   * `PASSAGE_LANGUAGES` — Swedish, French, German, Latin, Italian — so the list is
   * nine passages, and retrieval gets nine vector branches instead of four.
   *
   * The reason is measured, in `.probe-lang-branch.ts`: the embedding model splits
   * the vector space by LANGUAGE before content. The same idea written in four
   * languages produced four nearly disjoint neighborhoods — 99 of 100 English for
   * the English passage, 100 of 100 French for the French one, 98 of 100 German
   * for the German one, 100 of 100 Swedish for the Swedish one. German is two
   * percent of the collection and still takes ninety-eight of a hundred slots when
   * the query passage is German, so it isn't the share that governs but language
   * identity. Four English passages gave four English branches, and the
   * non-English works — just over a fifth of the collection — never entered the
   * candidate list at all.
   *
   * The list is flat and the passages aren't tagged with their language, because
   * retrieval doesn't need to know which is which: the branch is a KNN on the
   * vector, and the vector already carries the language. That's exactly what the
   * measurement above shows.
   */
  hypotheticalPassages: string[];
  /**
   * Search terms for the BM25 branch, in the collection's languages and not just
   * English.
   *
   * The same bug the passages had, one branch further down: FTS matches literal
   * tokens, so English search terms can only hit French or German text via proper
   * names. The words go into ONE shared FTS query rather than one branch per
   * language — the branch is one of eleven, and it's the vector branches that
   * carry the language work.
   */
  keywords: string[];
  /** What the expansion cost, broken down by line item. */
  usage: CostStep;
}

/**
 * The collection's languages as lines in the prompt, built from `LANGUAGE_CORPUS`.
 *
 * Generated rather than hand-written because the prompt otherwise starts lying as
 * soon as a language is added — and that's exactly what it did: it described the
 * collection as English and Swedish while Deutsches Textarchiv, Perseus Latin,
 * French and Italian were already indexed. A language the prompt doesn't mention
 * gets no hypothetical passage, and without a passage there's no branch.
 *
 * The string is constant across calls, so the cached system prompt keeps hitting
 * as before.
 */
const LANGUAGE_LINES = CORPUS_LANGUAGES.map(
  (l) => `  ${l}  ${LANGUAGE_LABEL[l]} — ${LANGUAGE_CORPUS[l]}`,
).join("\n");

export const EXPAND_SYSTEM = `Du är en beläst bibliotekarie för västerlandets kanon.
Användaren skriver en fråga på svenska. samlingen är public domain-texter, och den är
BRED: filosofi (Platon, Aristoteles, Augustinus, Hobbes, Spinoza, Kant, Mill, Nietzsche,
Russell), politisk teori (Machiavelli, Smith, Burke, Marx, Tocqueville), historia
(Herodotos, Thukydides, Tacitus, Gibbon, Buckle, Guizot, Prescott), antropologi och
civilisationsteori (Morgan, Tylor, Frazer, Boas), drama (Aischylos, Sofokles, Euripides,
Shakespeare, Ibsen), dikt och epos (Homeros, Vergilius, Dante, Milton, Beowulf), prosa
(Cervantes, Swift, Melville, Dostojevskij, Conrad), vetenskap (Galileo, Newton, Darwin,
Huxley), essä (Addison, Johnson, Winckelmann, Reynolds) samt religiösa skrifter (Bibeln,
Koranen, Upanishaderna, Tao Te Ching).

samlingen är SEXSPRÅKIG. Fem sjättedelar är engelska original och 1800-talsöversättningar;
resten är originaltexter på fem andra språk, hämtade ur skilda arkiv och alltså inte
översättningar av varandra utan fem egna urval:

${LANGUAGE_LINES}

Detta är avgörande för din uppgift. Sökningen sker med en embeddingmodell som delar upp
sitt rum på SPRÅK: ett engelskt stycke hittar bara engelska texter, ett tyskt bara tyska.
Ett språk du inte skriver ett stycke på är därför ett språk vars verk inte kan hittas alls.

Din uppgift är att förbereda en sökning. Du ska producera sju saker:

1. "inScope" — sant om frågan rimligen kan besvaras med ett utdrag ur samlingen ovan:
   filosofi, politisk teori, historia, antropologi, vetenskap, drama, dikt, prosa,
   religion eller essä, i vid mening. Även en ovanlig eller smal fråga räknas hit, och
   osäkerhet ska falla mot sant — var LIBERAL. Falskt bara för frågor utan rimlig
   koppling till samlingen:
   räkneuppgifter ("vad är 4 plus 4?"), kodningsuppgifter, väderprognoser, vardagsråd,
   eller annat som uppenbart inte är en fråga till västerlandets kanon. Är fältet
   falskt: lämna "restatement" tom, "hypotheticalPassages", "keywords" och "mentions"
   tomma listor, och "languagePassages" och "queries" tomma strängar per språk —
   ingen sökning kommer att köras på dem, så det är bortkastade ord att fylla i dem.

2. "restatement" — på svenska, en mening: vad frågan egentligen söker efter.

3. "hypotheticalPassages" — EXAKT FYRA stycken på ENGELSKA, cirka 90 ord vardera, skrivna
   som om de vore utdrag ur verk i samlingen: tänkta passager som skulle besvara frågan.
   De fyra ska ligga i FYRA OLIKA register, i denna ordning:
     a) traktaten — filosofisk eller politisk argumentation, begreppslig och resonerande
     b) skildringen — historikerns eller etnografens konkreta beskrivning av folk,
        seder, händelser och förfall, med namn och exempel
     c) den gestaltade — replik, vers eller berättande prosa som visar saken i stället
        för att hävda den
     d) systembygget — den spekulativa rösten som talar om helheten och dess nödvändighet:
        anden som återvänder till sig själv, viljan som objektiverar sig, den eviga
        återkomsten, produktionsförhållandenas gång. Skriv det som en påstådd lag om
        historien eller tillvaron i stort, inte som ett exempel. Registret finns med
        därför att den tyska idealismen och dess arvtagare varken skriver traktat eller
        skildring, och utan stycket svarar de aldrig på de stora frågorna.
   Skriv i periodens register och ordval, inte modern engelska. Ingen sammanfattning,
   ingen metatext om filosofi — det ska läsa som text ur boken. Styckena används för
   semantisk matchning, så konkreta formuleringar är viktigare än korrekthet.

4. "languagePassages" — ETT stycke på vart och ett av samlingens övriga fem språk, cirka
   90 ord vardera, med samma uppgift som de fyra ovan: en tänkt passage som skulle besvara
   frågan.
   Skriv PÅ språket, inte översatt TILL det. Ett stycke ska läsa som om det stod i just
   det arkivets texter, i deras register och århundrade: det tyska som tysk idealism, det
   latinska som antik prosa, det svenska som svensk 1800- eller tidigt 1900-tal, det
   franska som fransk moralism eller upplysning, det italienska som Dante eller renässans.
   Ett tyskt stycke skrivet som fransk essä landar mitt emellan och träffar ingenting.
   Välj för varje språk det register som det språkets del av samlingen faktiskt bär —
   listan ovan säger vad som finns där. Svarar ett språks texter dåligt på frågan, skriv
   ändå stycket: en tunn gren kostar ingenting, en gren som saknas kostar hela språket.

5. "keywords" — 10–18 engelska sökord och termer som troligen står ordagrant i texterna,
   OCH därtill 3–5 ord på vart och ett av de fem andra språken, i samma lista. Ta med
   periodtypiska ord (t.ex. "temperance", "the good", "sovereign", "the multitude",
   "savage", "rude nations", "manners") snarare än moderna motsvarigheter. Orden matchas
   bokstavligt mot texten, så skriv dem i den form de skulle stå tryckta.

6. "queries" — frågan som EN mening på vart och ett av de fem språk som inte är svenska,
   trogen och osmyckad. Den ska läsa som en fråga, inte som ett svar: "What is the good
   life, and how ought a person to live?"

7. "mentions" — namn på författare eller verk som frågan UTTRYCKLIGEN nämner, i den form
   de skulle stå i en engelsk utgåva: "Kant", "Marcus Aurelius", "Nicomachean Ethics".
   Svenska namnformer ska översättas ("Platon" → "Plato", "Dostojevskij" → "Dostoyevsky").
   Nämner frågan ingen är listan TOM. Gissa aldrig vem som borde svara — fältet styr en
   sökning som är låst till just de namnen, och en gissning skulle snäva in svaret till
   fel person.
   Svenska författare behåller sin svenska namnform ("Strindberg", "Selma Lagerlöf").

Står det en eller två rader "Sökningen är begränsad till …" under frågan har
användaren valt ut vilka ämnen och vilka epoker svaret får hämtas ur. Skriv då ALLA
styckena — de fyra engelska och de fem andra — så att de kunde stå i just de texterna:
i register som finns inom ämnena — söks bara dikt och drama ska inget av dem vara en
traktat — och i epokens eget språk och föreställningsvärld, så att en sökning i antiken
inte får stycken som talar om ångvälten. Lägg nyckelorden i de texternas ordval. Låt inte
begränsningen ändra vad frågan handlar om, bara var svaret hämtas.`;

/**
 * The restriction as lines in the *user message*, never in the system prompt.
 *
 * The system prompt goes out as a cached block, and the cache only hits on a
 * byte-for-byte identical prefix. A system prompt that varied with the selection
 * would have produced thousands of different prefixes — one per subset of ten
 * genres times six eras — and the five-minute cache would never have had time to
 * hit any of them. These lines therefore belong with what distinguishes two
 * requests, not with what they share.
 *
 * Swedish labels, like the rest of the prompt: the call is the same regardless of
 * which interface language the reader chose, and the cache is shared across
 * languages.
 */
export function filterLines(filter: CorpusFilter): string {
  const lines: string[] = [];
  if (filter.genres.length) {
    lines.push(
      `Sökningen är begränsad till ämnena: ${filter.genres
        .map((g) => GENRE_LABEL[g] ?? g)
        .join(", ")}.`,
    );
  }
  if (filter.eras.length) {
    lines.push(
      `Sökningen är begränsad till epokerna: ${filter.eras
        .map((e) => ERA_LABEL[e] ?? e)
        .join(", ")}.`,
    );
  }
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}

/**
 * An object with one string per language, as a schema.
 *
 * Built from the language list rather than hand-written: a new language added to
 * `Language` shouldn't be able to land in the prompt while falling out of the
 * schema. `required` takes all the keys, so an omitted language form becomes an
 * empty field to catch in the code below, rather than an `undefined` that
 * silently becomes one branch fewer.
 */
function byLanguageSchema(languages: Language[]) {
  return {
    type: "object" as const,
    properties: Object.fromEntries(
      languages.map((l) => [l, { type: "string" as const }]),
    ),
    required: languages,
    additionalProperties: false,
  };
}

export const QUERY_PLAN_SCHEMA = {
  type: "object" as const,
  properties: {
    inScope: { type: "boolean" as const },
    restatement: { type: "string" as const },
    queries: byLanguageSchema(QUERY_LANGUAGES),
    // The count is governed by the prompt and capped in the code below: the API
    // rejects `minItems` above 1 in a json_schema format.
    hypotheticalPassages: {
      type: "array" as const,
      items: { type: "string" as const },
    },
    languagePassages: byLanguageSchema(PASSAGE_LANGUAGES),
    keywords: { type: "array" as const, items: { type: "string" as const } },
    mentions: { type: "array" as const, items: { type: "string" as const } },
  },
  required: [
    "inScope",
    "restatement",
    "queries",
    "hypotheticalPassages",
    "languagePassages",
    "keywords",
    "mentions",
  ],
  additionalProperties: false,
};

/**
 * Parses raw JSON into a `QueryPlan`, without `usage` — only the caller
 * knows the cost. Broken out of `expandQuery` so `local.ts` can parse the
 * local model's response with exactly the same rules, instead of a copy
 * that drifts from this one whenever either changes.
 */
export function parseQueryPlan(
  raw: string,
  prompt: string,
): Omit<QueryPlan, "usage"> {
  const json = JSON.parse(raw) as unknown;
  // `JSON.parse` accepts `"null"`, `"42"`, `"[]"` as valid JSON — none of
  // them an object, so `parsed.inScope` below would throw a TypeError
  // instead of falling back the way every other field here does. Same
  // "liberal by design" treatment: a reply that isn't a plan is a missing
  // plan, not a crash.
  const parsed = (
    json !== null && typeof json === "object" && !Array.isArray(json)
      ? json
      : {}
  ) as Partial<
    Omit<QueryPlan, "queries" | "usage"> & {
      queries: Partial<Record<Language, string>>;
      languagePassages: Partial<Record<Language, string>>;
    }
  >;

  const text = (v: unknown): string =>
    typeof v === "string" && v.trim() ? v.trim() : "";

  // Liberal by design (see the field's own doc comment): a missing or
  // malformed value — a local model that doesn't honour booleans in its
  // structured output — falls back to `true` rather than blocking a
  // question on a parsing quirk instead of a judgment about its content.
  const inScope = typeof parsed.inScope === "boolean" ? parsed.inScope : true;

  // Swedish is the user's own query and never comes from the model. A language
  // that's still missing falls back to the Swedish form instead of an empty
  // string: the cross-encoder can score across the language boundary — that's
  // what the repo's four rerank probes measure — while an empty query would just
  // add noise.
  const queries = Object.fromEntries(
    CORPUS_LANGUAGES.map((l) => [
      l,
      l === "sv" ? prompt : text(parsed.queries?.[l]) || prompt,
    ]),
  ) as Record<Language, string>;

  // The four English registers first, then one passage per remaining language —
  // that order is `PASSAGE_LANGUAGES`, and the branches are built in it. Empty
  // ones are skipped rather than becoming a branch searching on nothing.
  const registers = (
    Array.isArray(parsed.hypotheticalPassages)
      ? parsed.hypotheticalPassages
      : []
  )
    .map(text)
    .filter(Boolean)
    .slice(0, 4);
  const perLanguage = PASSAGE_LANGUAGES.map((l) =>
    text(parsed.languagePassages?.[l]),
  ).filter(Boolean);

  return {
    inScope,
    restatement: text(parsed.restatement),
    queries,
    hypotheticalPassages: [...registers, ...perLanguage],
    // Filtered like `mentions`: Claude's schema guarantees strings, but a local
    // model parsed through this same function may not honour it, and one
    // number in the list crashes `toFtsQuery` on `split`.
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k) => typeof k === "string" && k.trim())
      : [],
    mentions: Array.isArray(parsed.mentions)
      ? parsed.mentions
          .filter((m) => typeof m === "string" && m.trim())
          .slice(0, 6)
      : [],
  };
}

export async function expandQuery(
  prompt: string,
  filter: CorpusFilter = NO_FILTER,
  /**
   * A per-search `AbortController`'s signal, registered in
   * `search-registry.ts` — NOT the browser request's own signal. The
   * pipeline runs to completion and saves regardless of the client
   * disconnecting; this fires only when someone presses Avbryt, reaching
   * this exact run through its token via `POST /api/search/cancel`.
   */
  signal?: AbortSignal,
): Promise<QueryPlan> {
  const res = await getClient().messages.create(
    {
      model: MODEL,
      // Raised from 2000 with the addition of the language passages. Five passages
      // at ~90 words, five query forms, and another twenty-odd keywords is ~750
      // more output tokens, and the ceiling has to accommodate them together with
      // the thinking output — a truncated response is invalid JSON and fails the
      // whole search, just like in the reranking step below. The ceiling itself
      // costs nothing; only what actually gets written is billed.
      max_tokens: 3200,
      output_config: {
        ...effort("low"),
        format: { type: "json_schema", schema: QUERY_PLAN_SCHEMA },
      },
      system: cachedSystem(EXPAND_SYSTEM),
      messages: [{ role: "user", content: prompt + filterLines(filter) }],
    },
    { signal },
  );
  const usage = logUsage("frågeexpansion", res.usage);

  return { ...parseQueryPlan(completeText(res), prompt), usage };
}

/* ------------------------------------------------------------------ *
 * Step 2 — reranking
 * ------------------------------------------------------------------ */

export interface SelectedPassage extends Candidate {
  /** Claude's rationale, in Swedish. */
  relevance: string;
  index: number;
}

/**
 * How many candidates reranking gets to read.
 *
 * The number has gone 40 → 28 → 64, and the two steps pulled in different
 * directions for different reasons. The cut to 28 came when the local
 * cross-encoder inserted itself between retrieval and Claude: forty had been
 * needed because RRF's top list was coarse, and with a pool that got resorted,
 * the extra width was no longer needed to buy precision. The raise to 64 came
 * when it turned out the width was needed anyway, for a reason nobody had
 * measured — see below.
 *
 * RAISED 28 → 64, AND IT'S RETRIEVAL THAT JUSTIFIES IT, NOT SELECTION. Measured
 * over the gold standard's twelve queries in `.probe-cross-threshold.ts`, as the
 * share of satisfied name requirements in the list Claude gets to read:
 *
 *   28 candidates    7/19        48 candidates   11/19
 *   64 candidates   13/19        96 candidates   15/19
 *
 * At 28, six of nineteen must-have authors never reached this step at all: Mill
 * sat at rank 60 on the liberty question, Gibbon at 34 on the barbarism question,
 * Marx at 36 on the progress question. The answer looking thin was never the
 * selection step's fault — those passages simply weren't in the room where the
 * choice was made.
 *
 * 96 buys two more requirements and was rejected anyway: candidate text is the
 * bill's largest line item, and 96 spends ~$0.04 more per search on it for those
 * two. Anyone who wants them changes this line, and `.probe-cross-threshold.ts`
 * says what they'd get.
 *
 * THE PROMPT NO LONGER HAS A TARGET COUNT. It used to ask for 10–16 passages; now
 * it asks for every passage that answers. The ceiling here is therefore no longer
 * "how many Claude gets to choose from" but "how many can come out at all" — and
 * it's the only remaining bound on the answer's length.
 *
 * An alternative was measured and rejected: letting the cross-encoder cut on
 * score instead of keeping the list wide. No threshold form — absolute, relative,
 * or jump-based — reached even today's 7/19, and the only one that held recall
 * (α=0.05) did so by barely cutting at all. The reason is in `rerank.ts`: its
 * score is a ranking, not a measure. The answer key lives in
 * `.probe-cross-threshold.ts`.
 *
 * Candidate text is still the bill's largest item, so this is still the expensive
 * dial — but only on the input side. The rationales and the thinking are billed
 * as output. The server log prints what each call actually cost.
 *
 * This number lives here and not in the route because it has two readers: the
 * stream in `/api/search` and the measurement in `scripts/eval.ts`. Eval long
 * carried its own copy — twenty, under a comment claiming that's what the app
 * sent — and so measured a configuration that wasn't running. A constant with two
 * copies drifts apart; this is the only guard against that happening again.
 */
export const CANDIDATES = 64;

export const RERANK_SYSTEM = `Du får en användares fråga på svenska och ett antal numrerade
kandidatstycken ur västerlandets kanon, hämtade med hybridsökning. Sökningen ger tematisk
närhet — din uppgift är att skilja "handlar om samma ämne" från "besvarar faktiskt frågan".

Varje kandidat är märkt med sin genre: filosofi, politisk teori, historia, antropologi,
vetenskap, drama, dikt & epos, prosa, religion eller essä.

Kandidaterna kan vara på sex språk: engelska original och 1800-talsöversättningar, samt
originaltexter på svenska, franska, tyska, latin och italienska. Varje kandidat är märkt
med sitt språk.

Språket är ingen merit i sig — välj efter vad stycket säger. Men två saker följer av att
samlingen är sexspråkig. Står samma sak i original och i översättning är originalet det
bättre citatet. Och ett stycke får aldrig väljas bort för att det är på ett språk du
antar att läsaren inte behärskar: sidan visar originalet, och läsaren avgör själv. Att
tyst föredra engelskan vore att göra fem sjättedelar av samlingen till hela samlingen.

Välj varje stycke som bär på ett svar, och lämna resten. DET FINNS INGET
ANTAL ATT SIKTA PÅ. En fråga med ett smalt svar ska ge fyra stycken; en som hela kanon
tvistar om ska ge trettio. Ett stycke står med därför att det säger något om saken —
aldrig för att listan ser kort ut, och aldrig bort för att den ser lång ut. Frågan
"hur många ska jag ta?" har inget svar här; frågan är "svarar det här stycket?".

Två saker att sträva efter, i den här ordningen:

1. UPPREPNING ÄR INTE ETT SVAR. Två stycken som säger samma sak är ett stycke. Säger
   tre stycken av samma författare samma sak, ta det starkaste och lämna de andra —
   inte för att hålla ett antal, utan för att de andra inte tillför något. Säger de
   olika saker hör de alla hemma, hur många de än är.

2. SPRIDNING MELLAN GENRER. En fråga om civilisation och barbari besvaras inte bara av
   traktaten som definierar begreppen — den besvaras också av historikern som beskriver
   germanerna, av tragedin där gästfriheten bryts, av romanen där kolonisatören förfaller.
   Ta med gestaltande källor när de faktiskt bär på ett svar, inte som utsmyckning: ett
   stycke ur *Lear* räknas om det säger något om saken, inte för att det är Shakespeare.
   Motsatta svar är mer upplysande än sex varianter av samma.

   Står det en eller två rader "Sökningen är begränsad till …" efter frågan har
   användaren själv valt ämnen eller epoker, och då finns inga andra att sprida över.
   Kravet gäller då inom urvalet: olika författare, olika verk, olika tider och
   motsatta svar. Beklaga inte begränsningen och välj inte ett svagare stycke för att
   bredda en bredd som inte står till buds.

För varje valt stycke skriver du "relevance": 2–3 meningar på svenska om HUR just detta
stycke förhåller sig till frågan. Var konkret om vad stycket hävdar eller visar. Skriv inte
"detta stycke handlar om frihet" — skriv vad det säger om saken, och nämn om det svarar
snett, motsäger ett annat stycke eller bara berör frågan indirekt. För en gestaltande källa:
säg vad scenen eller bilden gör med frågan, inte bara vad som händer i den.

Välj bara bland de givna styckena och bara utifrån vad som står i dem.`;

export const RERANK_SCHEMA = {
  type: "object" as const,
  properties: {
    selected: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          id: { type: "integer" as const, description: "Kandidatens nummer" },
          relevance: { type: "string" as const },
        },
        required: ["id", "relevance"],
        additionalProperties: false,
      },
    },
  },
  required: ["selected"],
  additionalProperties: false,
};

/**
 * The language is marked on every candidate, not only the non-English ones.
 *
 * A marking applied only sometimes reads as a deviation — "this passage is
 * unusual" — and the prompt explicitly asks for the opposite. The cost is a
 * couple of tokens per candidate, so roughly eighty on the whole call.
 */
export function renderCandidates(candidates: Candidate[]): string {
  return candidates
    .map((c, i) => {
      const where = c.locator ? `, ${c.locator}` : "";
      const genre = GENRE_LABEL[c.genre] ?? c.genre;
      const language = LANGUAGE_LABEL[c.language] ?? c.language;
      return `[${i + 1}] (${genre}, ${language}) ${c.author}, ${c.title}${where}\n${c.text}`;
    })
    .join("\n\n---\n\n");
}

export interface RerankResult {
  passages: SelectedPassage[];
  /** What reranking cost, broken down by line item. Saved with the search. */
  usage: CostStep;
}

/**
 * Parses raw JSON into the selected list, renumbered. Broken out for the
 * same reason as `parseQueryPlan`: the local model's response should be
 * parsed with exactly the same rules as Claude's, not a copy.
 */
export function parseRerankSelection(
  raw: string,
  candidates: Candidate[],
): SelectedPassage[] {
  const json = JSON.parse(raw) as unknown;
  const parsed = (
    json !== null && typeof json === "object" && !Array.isArray(json)
      ? json
      : {}
  ) as { selected?: unknown };

  // The schema asks for `{id: integer, relevance: string}[]`, but a local
  // model's structured output isn't guaranteed to honour it (see
  // `parseQueryPlan`'s own comment on the same trust boundary). An entry
  // with a non-numeric `id` or an empty `relevance` used to pass straight
  // through: it read fine when streamed live, but `chosen()` on reload
  // (searches.ts) drops anything without a non-empty `relevance`, so the
  // permalink silently showed fewer passages, renumbered, than the answer
  // the searcher actually saw.
  const rawSelected: unknown[] = Array.isArray(parsed.selected)
    ? parsed.selected
    : [];

  const seen = new Set<number>();
  return rawSelected
    .map((entry) => {
      if (entry === null || typeof entry !== "object") return null;
      const s = entry as { id?: unknown; relevance?: unknown };
      if (typeof s.id !== "number" || typeof s.relevance !== "string") {
        return null;
      }
      const relevance = s.relevance.trim();
      if (!relevance) return null;
      const candidate = candidates[s.id - 1];
      // The model can invent a number outside the list or repeat one — both must
      // be dropped before indices are assigned, otherwise there are gaps in
      // [1], [2], … and two cards with the same key.
      if (!candidate || seen.has(candidate.chunkId)) return null;
      seen.add(candidate.chunkId);
      return { ...candidate, relevance };
    })
    .filter((p): p is Omit<SelectedPassage, "index"> => p !== null)
    .map((p, i) => ({ ...p, index: i + 1 }));
}

export async function rerank(
  prompt: string,
  candidates: Candidate[],
  filter: CorpusFilter = NO_FILTER,
  /** See the same parameter on `expandQuery` — this is the expensive one to abort. */
  signal?: AbortSignal,
  /**
   * User-chosen via the switch next to the model dropdown — see `Effort` in
   * provider.ts for what "medium" versus "low" means and why only those two
   * are offered. Defaults to "medium" so every caller that predates the
   * dial (the `.probe-*` scripts, `eval.ts`) keeps running the same call it
   * always has.
   */
  effortLevel: Effort = DEFAULT_EFFORT,
): Promise<RerankResult> {
  if (candidates.length === 0) {
    return { passages: [], usage: zeroStep("omrankning") };
  }

  const res = await getClient().messages.create(
    {
      model: MODEL,
      // Raised from 8000 once the number of selected passages stopped having a cap
      // in the prompt. Eight thousand was enough for 16 rationales; now a broad
      // question can yield thirty or more, and 8000 would have become an
      // accidental cap on the number of passages — the worst kind, because it
      // doesn't show up as a cap but as a truncated response. Invalid JSON fails
      // the whole search. The ceiling itself costs nothing; only what gets written
      // is billed.
      max_tokens: 16000,
      output_config: {
        ...effort(effortLevel),
        format: { type: "json_schema", schema: RERANK_SCHEMA },
      },
      system: cachedSystem(RERANK_SYSTEM),
      messages: [
        {
          role: "user",
          content:
            `Fråga: ${prompt}${filterLines(filter)}\n\n` +
            `Kandidatstycken:\n\n${renderCandidates(candidates)}`,
        },
      ],
    },
    { signal },
  );
  const usage = logUsage("omrankning", res.usage);

  return {
    passages: parseRerankSelection(completeText(res), candidates),
    usage,
  };
}

/* ------------------------------------------------------------------ *
 * Step 4 — external sources (opt-in, the "utanför samlingen" checkbox)
 * ------------------------------------------------------------------ */

/**
 * The only domains the external step's web search may return hits from —
 * never the open web.
 *
 * marxists.org is on it because it's a documented gap, not a guess: MIA
 * mixes free and unlicensed translations in the same catalog, and
 * `LICENSED` in marxists.ts keeps out everything whose provenance line
 * doesn't say the translation was made for MIA — none of Kollontai's 43
 * articles pass, 6 of Luxemburg's 74 do (see `sources-marxists.md`). Those
 * pages still exist and are free to read; this lets a reader who wants them
 * anyway find them, as a link, without the app hosting or quoting a word of
 * them — so the check in marxists.ts stays exactly as strict as it is.
 * Add a domain here only when `docs/measurements/sources-*.md` documents it
 * as a similar gap; this is a pointer to known holes, not a general web
 * search box.
 *
 * Not exported: `allowed_domains` restricts what the *search tool* returns,
 * not what the model *writes down* afterward — nothing stops a hallucinated
 * or off-domain URL from appearing in the JSON, so `parseExternalHits`
 * below checks every hit's host against this same list before anything
 * reaches the client. Both checks read the one list; a second copy could
 * only drift from it.
 */
const EXTERNAL_DOMAINS = ["marxists.org"];

/**
 * How many searches the external step's web search tool may run.
 *
 * NOT MEASURED — assumed. Three lets the model try a couple of phrasings
 * (an author's name, then a work's title) without the per-search fee — $10
 * per 1 000 searches, i.e. $0.01 each — turning a curiosity click into
 * money nobody signed off on. A `scripts/.probe-external.ts` would settle
 * this the way `CANDIDATES` and `RERANK_POOL` were settled; nobody has
 * written it yet.
 */
const EXTERNAL_MAX_USES = envInt(process.env.CANON_EXTERNAL_MAX_USES, 3);

const EXTERNAL_SYSTEM = `Du letar efter sidor UTANFÖR den här samlingens databas, begränsat till de
domäner sökverktyget tillåter. De sidorna finns inte i samlingen därför att
deras upphovsrätt inte går att fastställa — se marxists.ts: en sida hos
Marxists Internet Archive tas bara in i samlingen om dess proveniensrad
uttryckligen säger att just den översättningen är gjord för MIA eller under
Creative Commons. Många av arkivets sidor saknar en sådan rad och ligger
ändå kvar hos MIA. Uppgiften här är att peka en läsare dit — inte att
kringgå kontrollen genom att återge texten själv.

Sök efter sidor som besvarar frågan, och returnera bara träffar sökverktyget
faktiskt gav dig. Hitta hellre ingenting än att gissa en URL eller ett
författarnamn. Citera ALDRIG ord ur sidan, inte ens en enda kort mening —
skriv bara med egna ord varför den svarar på frågan. En sida som ligger här
därför att dess upphovsrätt inte är fastställd får inget citat, kort eller
långt. För varje träff, ange:

- "author" — författaren, som sidan själv anger den
- "title" — sidans eller textens titel
- "url" — länken exakt som sökverktyget gav den
- "relevance" — 1–2 meningar på svenska, med egna ord, om varför sidan
  svarar på frågan — aldrig ett citat

Svarar inget av det du hittar på frågan, returnera en tom lista. Gissa
aldrig för att listan inte ska se tom ut.`;

const EXTERNAL_SCHEMA = {
  type: "object" as const,
  properties: {
    hits: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          author: { type: "string" as const },
          title: { type: "string" as const },
          url: { type: "string" as const },
          relevance: { type: "string" as const },
        },
        required: ["author", "title", "url", "relevance"],
        additionalProperties: false,
      },
    },
  },
  required: ["hits"],
  additionalProperties: false,
};

/**
 * True for an `http`/`https` URL whose host is (or is a subdomain of) one
 * of `EXTERNAL_DOMAINS`. `allowed_domains` on the tool restricts what the
 * search itself can return, but the JSON the model writes afterward is
 * unconstrained free text — a hallucinated or off-domain URL would
 * otherwise reach the reader under a canon author's name and the app's own
 * rationale attached. `URL` throwing on a malformed string is treated as
 * "not allowed" rather than propagating: a bad URL is a hit to drop, not a
 * reason to fail the whole step.
 */
function isAllowedHost(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return false;
    return EXTERNAL_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

/**
 * Parses raw JSON into the external hit list.
 *
 * Not exported, unlike `parseQueryPlan`/`parseRerankSelection`: those are
 * reused by `local.ts` because a local model still has to produce the same
 * shape by hand. There's no local counterpart to this step — the web
 * search tool is server-side, and a local model can't call it — so nothing
 * else would import this function.
 */
function parseExternalHits(raw: string): ExternalHit[] {
  const parsed = JSON.parse(raw) as { hits?: unknown };
  if (!Array.isArray(parsed.hits)) return [];
  const text = (v: unknown): string =>
    typeof v === "string" && v.trim() ? v.trim() : "";
  const seen = new Set<string>();
  return parsed.hits
    .map((h) => {
      const hit = h as Partial<ExternalHit>;
      const author = text(hit.author);
      const title = text(hit.title);
      const url = text(hit.url);
      const relevance = text(hit.relevance);
      // A hit missing any of the four fields is worthless in the UI — a
      // link with no title, or a rationale with no link — so it's dropped
      // rather than shown half-filled. A URL outside `EXTERNAL_DOMAINS` is
      // dropped for the reason `isAllowedHost` explains, and a repeated URL
      // (the model asked twice, or the tool returned the same page from two
      // phrasings) would otherwise give the list a duplicate React key.
      if (!author || !title || !url || !relevance) return null;
      if (!isAllowedHost(url)) return null;
      if (seen.has(url)) return null;
      seen.add(url);
      return { author, title, url, relevance };
    })
    .filter((h): h is ExternalHit => h !== null);
}

export interface ExternalResult {
  hits: ExternalHit[];
  /**
   * What this call cost — always a real charge, since this step is never
   * cached (see the "external" event's own comment in protocol.ts). A
   * plain number, not a `CostStep`: there is no per-line breakdown worth
   * showing for one call whose only two charges are ordinary tokens and a
   * flat per-search fee, and forcing the fee into `CostLine`'s
   * tokens×perMillion shape would print "$10 000,00" under a column headed
   * "$/Mtok" for something that isn't tokens at all.
   */
  usd: number;
}

/**
 * Looks for texts outside the collection that answer the question — the
 * "utanför samlingen" checkbox. Off by default and run only when asked for:
 * unlike `expandQuery` and `rerank`, this step never runs as part of an
 * ordinary search.
 *
 * Runs as its own call, not folded into `rerank`, for two reasons. The web
 * search tool is server-side and Anthropic bills it per request regardless
 * of which call makes it, so combining the calls wouldn't save the fee. And
 * `rerank`'s prompt is entirely about the collection's own candidates — an
 * unrelated tool bolted onto it would need its own instructions anyway, so
 * nothing is shared by merging them. Run in parallel with retrieval and
 * reranking in the route, so checking the box never delays the collection's
 * own answer.
 */
export async function findExternal(
  prompt: string,
  signal?: AbortSignal,
): Promise<ExternalResult> {
  const res = await getClient().messages.create(
    {
      model: MODEL,
      // Six short fields per hit and at most a handful of hits — an order
      // of magnitude less than a rationale in `rerank`'s selection, which
      // gets 16 000. Raise it if a real run ever shows `IncompleteAnswerError`
      // for this step; nothing suggests it will.
      max_tokens: 2000,
      output_config: {
        ...effort("low"),
        format: { type: "json_schema", schema: EXTERNAL_SCHEMA },
      },
      tools: [
        {
          // The SDK also ships `web_search_20260318` — a deliberate choice
          // to stay on `20260209`, the variant documented as current for
          // Sonnet 5/Opus 5, rather than the newer one nothing here has
          // verified against this model.
          type: "web_search_20260209",
          name: "web_search",
          max_uses: EXTERNAL_MAX_USES,
          allowed_domains: EXTERNAL_DOMAINS,
        },
      ],
      system: cachedSystem(EXTERNAL_SYSTEM),
      messages: [{ role: "user", content: prompt }],
    },
    { signal },
  );

  const usage = logUsage("externa källor", res.usage);
  // Web search's own fee isn't in `input_tokens`/`output_tokens` at all —
  // Anthropic bills it per request, $10 per 1 000, and reports how many ran
  // on `usage.server_tool_use.web_search_requests`.
  const searches = res.usage.server_tool_use?.web_search_requests ?? 0;
  const searchFee = (searches / 1000) * 10;
  if (searchFee > 0) {
    console.log(
      `[canon] externa källor: ${searches} webbsökningar à $0,01 = $${searchFee.toFixed(4)}`,
    );
  }
  const usd = usage.cost + searchFee;

  // The call already cost `usd` by this point, win or lose — a response
  // that came back truncated or malformed still ran the search and spent
  // the tokens. Caught here rather than left to propagate, so a parsing
  // failure reports what was actually spent instead of the route's
  // fallback `usd: 0`, which would understate the bill for the one case
  // where something genuinely went wrong after the money was spent.
  try {
    return { hits: parseExternalHits(completeText(res)), usd };
  } catch (err) {
    console.error("[search] externt svar kunde inte tolkas:", err);
    return { hits: [], usd };
  }
}

function isTransient(err: unknown): boolean {
  if (
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError
  ) {
    return true;
  }
  // An overload mid-stream arrives as an APIError without a status.
  return err instanceof Error && /overloaded/i.test(err.message);
}

/**
 * Translates SDK errors into something that can be shown to the user.
 *
 * The language comes from the caller — the routes read the same cookie as the
 * pages — so the error appears in the same language as the button that triggered
 * it. The SDK's own `message` is always English and is left as is: that line is a
 * quote from the response, not a sentence the app wrote.
 */
export function describeError(
  err: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (err instanceof NotIndexedError) {
    return t(locale, "api.notIndexed");
  }
  if (err instanceof IncompleteAnswerError) {
    return t(
      locale,
      err.reason === "refusal" ? "claude.refused" : "claude.truncated",
    );
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return t(locale, "claude.badKey");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return t(locale, "claude.rateLimited");
  }
  if (isTransient(err)) {
    return t(locale, "claude.overloaded");
  }
  if (err instanceof Anthropic.APIError) {
    return t(locale, "claude.apiError", {
      status: String(err.status),
      message: err.message,
    });
  }
  // Every case above is a known failure mode with a message written for the
  // reader. Falling through to `err.message` here used to hand back
  // whatever an unrelated library threw — a SQLite constraint, an `ENOENT`
  // with an absolute path — verbatim, from `/api/context`, `/api/similar`
  // and `/api/work` as much as from a search. The detail is still worth
  // having, just not on screen.
  console.error("[canon] unexpected error:", err);
  return t(locale, "api.unknownError");
}
