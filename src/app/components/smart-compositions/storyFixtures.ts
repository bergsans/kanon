/**
 * Shared story data for the "smart-compositions" layer — one PassagePayload set reused
 * across CanonSearch, PassageAccordion, ExportMenu and ProjectView's stories
 * instead of four slightly different ad-hoc lists drifting apart from the
 * real shape in src/lib/protocol.ts.
 */

import { http, HttpResponse } from "msw";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import type {
  ContextWindowPayload,
  CostPayload,
  ExternalHit,
  PassagePayload,
  SearchEvent,
} from "@/lib/protocol";
import type { CorpusFacets } from "@/lib/taxonomy";

export const AVAILABLE: CorpusFacets = {
  genres: ["filosofi", "politik", "historia", "drama", "dikt"],
  eras: ["antiken", "renässans", "upplysning", "1800-tal"],
};

export const PASSAGES: PassagePayload[] = [
  {
    index: 0,
    chunkId: 10234,
    workId: "epictetus-enchiridion-gutenberg",
    author: "Epictetus",
    title: "Encheiridion",
    translator: "Elizabeth Carter",
    genre: "filosofi",
    language: "en",
    source: "gutenberg",
    year: 135,
    locator: "ch. 1",
    text: "Of things some are in our power, and others are not. In our power are opinion, movement towards a thing, desire, aversion, and, in a word, whatever are our own acts; not in our power are the body, property, reputation, offices, and, in a word, whatever are not our own acts.",
    relevance:
      "Öppnar Epiktetos hela system: skillnaden mellan det som står i vår makt och det som inte gör det är grunden för den stoiska likgiltigheten inför yttre omständigheter.",
    sourceUrl: "https://www.gutenberg.org/ebooks/45109",
  },
  {
    index: 1,
    chunkId: 20871,
    workId: "marcus-aurelius-meditations-gutenberg",
    author: "Marcus Aurelius",
    title: "Self-Communings",
    translator: "George Long",
    genre: "filosofi",
    language: "en",
    source: "gutenberg",
    year: 180,
    locator: "book II, 1",
    text: "Begin the morning by saying to thyself, I shall meet with the busy-body, the ungrateful, arrogant, deceitful, envious, unsocial. All these things happen to them by reason of their ignorance of what is good and evil.",
    relevance:
      "Samma distinktion praktiskt tillämpad: Marcus Aurelius vänder den mot andra människors fel snarare än mot yttre händelser, ett komplement till Epiktetos mer abstrakta formulering.",
    sourceUrl: "https://www.gutenberg.org/ebooks/2680",
  },
  {
    index: 2,
    chunkId: 33012,
    workId: "seneca-de-vita-beata-perseus",
    author: "Seneca",
    title: "De Vita Beata",
    translator: null,
    genre: "filosofi",
    language: "la",
    source: "perseus",
    year: 58,
    locator: "IV",
    text: "Quod ergo hic dicit, hoc sentio: summum bonum est animus fortuita despiciens, virtute laetus.",
    relevance:
      "Den tredje stoikern i urvalet, på originalspråket — samma tema uttryckt som en formel: det högsta goda är själen som föraktar slumpens gåvor och gläds åt dygden.",
    sourceUrl: "https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:2007.01.0018",
  },
];

export const COST: CostPayload = {
  model: "claude-sonnet-5",
  usd: 0.1183,
  originalUsd: 0.1183,
  rate: 9.6,
  cached: false,
  steps: [
    {
      step: "frågeexpansion",
      model: "claude-sonnet-5",
      cost: 0.0214,
      lines: [
        { label: "inmatning", tokens: 612, perMillion: 3, cost: 0.0018 },
        { label: "utmatning", tokens: 1840, perMillion: 15, cost: 0.0276 },
      ],
    },
    {
      step: "omrankning",
      model: "claude-sonnet-5",
      cost: 0.0969,
      lines: [
        { label: "inmatning", tokens: 28_400, perMillion: 3, cost: 0.0852 },
        { label: "cacheläsning", tokens: 8_100, perMillion: 0.3, cost: 0.0024 },
        { label: "utmatning", tokens: 620, perMillion: 15, cost: 0.0093 },
      ],
    },
  ],
};

/**
 * The NDJSON body shape of a real /api/search response: the events in
 * `events`, one per line, staggered with a short delay so a story shows the
 * same "expanding the question" → "retrieving" → "reading" progression a
 * real search does instead of the whole answer appearing in one frame.
 * Shared by `searchApiHandler` and `searchDeclinedApiHandler` so the two
 * don't carry two copies of the same streaming logic.
 */
function ndjsonStream(events: SearchEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const event of events) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }
      controller.close();
    },
  });
}

/**
 * The event sequence a full, answered search sends — shared by
 * `searchApiHandler`, which always returns it, and `guardrailApiHandler`,
 * which returns it only for a question its heuristic doesn't decline.
 */
function answeredEvents(): SearchEvent[] {
  return [
    { type: "plan" },
    { type: "candidates", count: 64, works: 23 },
    { type: "passages", passages: PASSAGES },
    { type: "done", slug: "stoicism-epikureism", cached: false, cost: COST },
  ];
}

/** A stand-in for the real /api/search route, answering with a full result. */
export function searchApiHandler() {
  return http.post("/api/search", async () =>
    new Response(ndjsonStream(answeredEvents()), {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    }),
  );
}

/**
 * The external step's own event — see `findExternal` in claude.ts and
 * `ExternalSources`. A single Kollontai article, the same kind of gap
 * `sources-marxists.md` documents: none of her 43 MIA articles pass the
 * collection's own `LICENSED` check, so this is the sort of hit the real
 * step would actually return.
 */
/**
 * The external step's own result — see `findExternal` in claude.ts and
 * `ExternalSources`. Exported (not inlined into `EXTERNAL_EVENT` below) so
 * `ExternalSources.stories.tsx` renders the same hit instead of hand-typing
 * a second copy that could drift from this one.
 */
export const EXTERNAL_HITS: ExternalHit[] = [
  {
    author: "Alexandra Kollontai",
    title: "Communism and the Family",
    url: "https://www.marxists.org/archive/kollontai/1920/communism-family.htm",
    relevance:
      "Argumenterar att familjen som ekonomisk enhet upplöses under kommunismen — samlingens rättighetskontroll släpper igenom ingen av Kollontais 43 MIA-artiklar, så texten finns bara här, som länk.",
  },
];

const EXTERNAL_EVENT: SearchEvent = {
  type: "external",
  hits: EXTERNAL_HITS,
  usd: 0.0284,
  rate: 9.62,
};

/**
 * A stand-in for /api/search with the "utanför samlingen" checkbox on —
 * the same answered stream `searchApiHandler` sends, with the external
 * step's own result appended after "done", exactly like the real route:
 * that step runs alongside retrieval and reranking rather than before them,
 * see `startExternal`'s own comment in the route.
 */
export function searchApiHandlerWithExternal() {
  return http.post("/api/search", async () =>
    new Response(ndjsonStream([...answeredEvents(), EXTERNAL_EVENT]), {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    }),
  );
}

/**
 * What just the expansion call costs — the frågeexpansion line off `COST`,
 * reused rather than retyped. A guardrail decline (the relevance check, or
 * Claude's own refusal while reading the question) never reaches reranking,
 * so `COST`'s omrankning line — implying a search that actually ran — would
 * misstate what happened.
 */
export const EXPANSION_COST: CostPayload = {
  ...COST,
  usd: COST.steps[0].cost,
  originalUsd: COST.steps[0].cost,
  steps: [COST.steps[0]],
};

/**
 * A stand-in for /api/search when a guardrail declines to answer instead of
 * running the rest of the pipeline — either the relevance check
 * (`claude.outOfScope`, decided during expansion — see `inScope` on
 * `QueryPlan`) or Claude's own refusal while reading the question
 * (`claude.refused`, `stop_reason: "refusal"`, see `IncompleteAnswerError`).
 * Both happen during expansion, so the real route never sends `plan` or
 * `candidates` first — its `declined` event, carrying the expansion cost,
 * is the whole stream.
 */
export function searchDeclinedApiHandler(message: string) {
  return http.post("/api/search", async () =>
    new Response(
      ndjsonStream([{ type: "declined", message, cost: EXPANSION_COST }]),
      { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } },
    ),
  );
}

/**
 * A math question in Swedish, English or with symbols — "vad är 4 plus 4",
 * "what is 2+2", "12 * 4?" — the one example the relevance guardrail's own
 * doc comment on `QueryPlan` names. Not a stand-in for Claude's judgment,
 * just enough of one pattern to let `guardrailApiHandler` react to it below.
 */
const LOOKS_LIKE_ARITHMETIC =
  /\d\s*(\+|plus|-|minus|\*|gånger|times|\/|delat med|divided)\s*\d/i;

/**
 * `guardrailApiHandler`'s trigger word for the *other* guardrail — Claude's
 * own refusal. There's no way to demonstrate that path with real
 * inappropriate text without putting real inappropriate text in the
 * codebase and in front of whoever opens Storybook, so the word itself
 * ("inappropriate") stands for it instead.
 */
const REFUSAL_TRIGGER = /olämplig|inappropriate/i;

/**
 * Unlike every other handler in this file, which always returns the same
 * canned result regardless of what was typed, this one actually reads the
 * submitted question — built for `TryTheGuardrails`, the one story in
 * CanonSearch.stories.tsx meant to be played with by hand rather than only
 * proven by its own `play` function. Three outcomes, in the order checked:
 *
 *   1. a question containing "olämplig"/"inappropriate" gets the same
 *      `declined` event a real Claude refusal produces;
 *   2. a simple arithmetic question gets the `declined` event the relevance
 *      guardrail produces for "vad är 4 plus 4";
 *   3. anything else gets `answeredEvents()` — the full mocked result,
 *      regardless of what was actually asked, since there's no real search
 *      behind this handler, only three outcomes to demonstrate.
 *
 * The messages come from `t()` against the real dictionary, not retyped —
 * this handler can't drift from what the app actually says the way a
 * hardcoded string could.
 */
export function guardrailApiHandler() {
  return http.post("/api/search", async ({ request }) => {
    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt ?? "";

    const declined = REFUSAL_TRIGGER.test(prompt)
      ? t(DEFAULT_LOCALE, "claude.refused")
      : LOOKS_LIKE_ARITHMETIC.test(prompt)
        ? t(DEFAULT_LOCALE, "claude.outOfScope")
        : null;

    return new Response(
      ndjsonStream(
        declined
          ? [{ type: "declined", message: declined, cost: EXPANSION_COST }]
          : answeredEvents(),
      ),
      { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } },
    );
  });
}

// Same work as PASSAGES[0] — author, title, translator, locator and text
// line up on purpose, so the fixture reads as the same passage seen through
// two different endpoints rather than an unrelated stand-in.
const CONTEXT_WINDOW: ContextWindowPayload = {
  workId: "epictetus-enchiridion-gutenberg",
  author: "Epictetus",
  title: "Encheiridion",
  translator: "Elizabeth Carter",
  year: 135,
  language: "en",
  source: "gutenberg",
  sourceUrl: "https://www.gutenberg.org/ebooks/45109",
  locator: "ch. 1",
  before:
    "The Encheiridion, or manual, is not a work of Epictetus's own composition but a digest compiled by his pupil Arrian from the lectures. It is nonetheless the work that most concisely speaks for later Stoicism.\n\n",
  passage:
    "Of things some are in our power, and others are not. In our power are opinion, movement towards a thing, desire, aversion, and, in a word, whatever are our own acts; not in our power are the body, property, reputation, offices, and, in a word, whatever are not our own acts.",
  after:
    "\n\nAnd the things in our power are by nature free, not subject to restraint or hindrance: but the things not in our power are weak, slavish, subject to restraint, in the power of others.",
  atStart: true,
  atEnd: false,
};

/** A stand-in for /api/context — the surrounding chapter for ContextSheet's own story. */
export function contextApiHandler() {
  return http.get("/api/context", () => HttpResponse.json(CONTEXT_WINDOW));
}

const WORK_PASSAGES = PASSAGES.slice(0, 2).map((p, i) => ({
  chunkId: 90_000 + i,
  workId: p.workId,
  author: p.author,
  title: p.title,
  translator: p.translator,
  genre: p.genre,
  language: p.language,
  source: p.source,
  year: p.year,
  locator: p.locator,
  text: p.text,
  sourceUrl: p.sourceUrl,
}));

/** A stand-in for /api/work — more passages from the same work, for MoreFromWork's own story. */
export function workApiHandler() {
  return http.get("/api/work", () => HttpResponse.json({ passages: WORK_PASSAGES }));
}

const SIMILAR_PASSAGES = PASSAGES.slice(1).map((p, i) => ({
  chunkId: 80_000 + i,
  workId: p.workId,
  author: p.author,
  title: p.title,
  translator: p.translator,
  genre: p.genre,
  language: p.language,
  source: p.source,
  year: p.year,
  locator: p.locator,
  text: p.text,
  similarity: 0.91 - i * 0.04,
  sourceUrl: p.sourceUrl,
}));

/** A stand-in for /api/similar — the neighbors of a passage, for SimilarPassages' own story. */
export function similarApiHandler() {
  return http.get("/api/similar", () => HttpResponse.json({ passages: SIMILAR_PASSAGES }));
}

/** A stand-in for /api/translate — a Swedish rendering of PASSAGES[0], for PassageAccordion's own story. */
export function translateApiHandler() {
  return http.post("/api/translate", () =>
    HttpResponse.json({
      text: "Av tingen är somliga i vår makt, andra inte. I vår makt är uppfattning, strävan, begär, motvilja — kort sagt, allt som är våra egna handlingar; inte i vår makt är kroppen, egendomen, ryktet, ämbeten — kort sagt, allt som inte är våra egna handlingar.",
      cached: false,
      cost: {
        model: "claude-sonnet-5",
        usd: 0.0091,
        originalUsd: 0.0091,
        rate: 9.6,
        cached: false,
        steps: [
          {
            step: "översättning",
            model: "claude-sonnet-5",
            cost: 0.0091,
            lines: [
              { label: "inmatning", tokens: 340, perMillion: 3, cost: 0.001 },
              { label: "utmatning", tokens: 540, perMillion: 15, cost: 0.0081 },
            ],
          },
        ],
      },
    }),
  );
}
