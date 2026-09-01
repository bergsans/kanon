<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Canon

Swedish question in, passages from the Western canon out — with author, work,
book/chapter and a rationale. ~2690 works, ~490 authors, six sources, six languages,
ten genres.
The collection is three-quarters English; the question and the whole interface are
Swedish. That's the app's central tension and explains nearly every choice in the
pipeline.

**Read `README.md` and `docs/measurements/` before changing anything in ingestion,
chunking, or the collection.** `README.md` is the short version; the measurement
behind each threshold, model choice, and filter — the number that motivates it —
is logged in its own file under `docs/measurements/`, linked from the matching
README section. Change one of those numbers without reading the file that set it,
and you tear down a result someone paid to obtain.

## Pipeline

```
query + topics/eras
      → cache (verbatim, then vector ≥0.95)     searches.ts     keyed on the selection
      → query expansion: 9 HyDE passages (4 en-
        register + 1 per language) + keywords +
        the query per language + mentions       claude.ts       ~$0.021
      → hybrid retrieval: 9 vector branches +
        BM25 + a mention branch, fused with RRF search.ts       free, local
        a language without a branch is a
        language without hits — the embedding
        splits the space by LANGUAGE before
        content, measured                       .probe-lang-*   see README
        the selection filters EVERY branch,
        never the fused list afterward          taxonomy.ts     CorpusFilter
      → cross-encoder, 192 candidates           rerank.ts       free, ~12 s
      → diversity filter, share of the list     search.ts       must sit AFTER
        (3/work and 4/author per 28)
      → Claude justifies the ones of 64 that
        answer — no target count, the number
        follows the question                    claude.ts       ~$0.12
      → NDJSON stream to the client             api/search/     protocol.ts
```

## Map

| var                                                                         | what                                                                                |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/lib/taxonomy.ts`                                                       | genre, era, source, language, `CanonWork` — without the manifest in tow            |
| `src/lib/i18n.ts`                                                           | the interface's two languages, the dictionary, `t`/`tn`. `i18n-server.ts` reads the cookie |
| `src/lib/corpus.ts`                                                         | merges the ten manifests, `WORK_BY_ID`, `sourceLink`                               |
| `src/lib/corpus*.json`                                                      | **generated** — see below                                                          |
| `src/lib/db.ts`                                                             | schema, migrations, `vecKey`/`vecBlob`, singleton handle                           |
| `src/lib/search.ts`                                                         | branches, the topic/era filter, RRF, cross-encoder call, `diversify`, `getContext` |
| `src/lib/available.ts`                                                      | which topics and eras have indexed works — the selector's options                  |
| `src/lib/searches.ts`                                                       | permalink + cache                                                                  |
| `src/lib/claude.ts`                                                         | the two Claude steps, price and cache tables, `logUsage`                           |
| `src/lib/protocol.ts`                                                       | the wire types between `/api/search` and the client                                |
| `src/lib/citation.ts`                                                       | citation export — pure functions, no server. The year is deliberately absent from the reference |
| `src/lib/{gutenberg,litteraturbanken,runeberg,marxists,perseus,tcp,dta,wikisource}.ts` | ingestion + rights check per source                                     |
| `src/lib/chunk.ts`                                                          | paragraph splitting, heading and front-matter detection, per language (en/sv/de/fr/it/la) |
| `src/lib/tei.ts`                                                            | `tagText` — the one piece of TEI parsing shared by Perseus, TCP and DTA             |
| `scripts/build-corpus*.ts`                                                  | the manifest generators — one per source, ten separate output files on purpose (see `corpus.ts`); `scripts/lib/` below is what they do share |
| `scripts/lib/era.ts`                                                        | `eraOf` — the era boundaries every generator uses                                  |
| `scripts/lib/manifest.ts`                                                   | `assertNoDuplicateIds`, `writeManifest` — the guard and the write (or `--dry` report) tail every generator shares |
| `scripts/lib/csv.ts`                                                        | `parseCsv` — shared by the Gutenberg and TCP catalog readers                       |
| `scripts/.probe-*.ts`                                                       | the measurements behind the choices — the repo's way of settling a question        |

## Writing conventions

The code is commented in **English**, and the comment explains _why_, never what.
That's not a style preference but the house's only documentation of the
measurements. A comment that says "caches the system prompt" is worthless; one that
says why the five-minute cache was chosen over the one-hour variant is the whole
point.

- Write **English** in comments and doc comments. Identifiers, types, and SQL are
  English — as in the existing code.
- No string the user sees lives in a component. The interface exists in Swedish and
  English, and everything goes through the dictionary in `src/lib/i18n.ts` — new
  strings are added in **both** languages, or `pnpm typecheck` fails.
- A constant with a measured value carries the measurement in its doc comment: the
  number, what was compared, and what got worse with the alternative. See
  `CACHE_MINIMUM`, `SIMILARITY`, `CANDIDATES`, `MODEL`.
- Haven't measured it: don't write that you have. Write what you assumed, or measure
  (see below).
- Em dash (—) and Swedish decimal comma in prose. No emoji.
- The comment sits _above_ what it explains, never after.

## Not allowed

- **Editing `src/lib/corpus*.json` by hand.** They're generated. Change the
  generator instead.
- **Running `pnpm ingest` without being asked.** A full run takes 5–8 hours.
  `--limit`/`--only`/`--source` exist for spot checks — use them, and say so first.
- **Running `pnpm eval`, `pnpm dev` searches, or `.probe-*` scripts that call Claude
  without being asked.** They cost real money (~$0.03–0.08 per query) and require
  `ANTHROPIC_API_KEY`. Ask, and say what the run will cost.
- **Removing the `nextjs-agent-rules` block at the top.** `next dev` writes it back.
- **Touching `data/`.** Gitignored, ~8 GB, rebuilt only by `pnpm ingest`.
- **Placing the cross-encoder after the diversity filter.** The order is motivated
  in `hybridSearch`; swap it and the works' best passages get discarded.
- **Removing a language from `hypotheticalPassages` to save time or tokens.** The
  embedding model splits the vector space by language before content — measured in
  `.probe-lang-branch.ts`, 98–100 of 100 neighbors in the passage's own language —
  so a branch that disappears isn't a slower search but a language that can no
  longer be found. That's exactly how the non-English works became invisible.
- **Loosening a rights check to get a work through.** They live in
  `litteraturbanken.ts`, `marxists.ts`, `perseus.ts`, `tcp.ts`, `dta.ts`, and
  `wikisource.ts` and run on _every_ ingestion, because the manifest is a file
  that can be edited. Perseus's
  two grounds — age or license — are two independent reasons, not one softened
  check; don't merge them, and don't move `MODERN_IMPRINT` just to let a text in.
- **Giving two works the same manifest ID.** The slug shortens the title, so
  multi-volume works collide: Montaigne's four volumes became one ID, `WORK_BY_ID`
  dropped three of them, and ingest rewrote the same rows in a loop until
  vec_chunks objected. The source's ID at the end of the slug fixes it, and the
  generators call the shared `assertNoDuplicateIds` (`scripts/lib/manifest.ts`)
  to stop the run on a collision. Change an ID's shape: run
  `pnpm tsx scripts/.probe-orphans.ts` afterward, since the old rows stay in the
  database and get served as duplicates.
- **Moving `slug` (or `titleKey`, `lifespan`) into `scripts/lib/`.** Unlike
  `eraOf`, the duplicate-ID guard, CSV parsing and the manifest writer — all
  genuinely identical across generators and consolidated there — each
  generator's `slug` is tuned to its own source's naming quirks (see the
  French part's ç/ß handling, noted where it's defined). A shared version
  edited for one source would silently reshape IDs everywhere at once; kept
  apart, a change to one generator's ID scheme stays that generator's
  problem to run `.probe-orphans.ts` against.
- **Deriving `authorMatch` from a catalog instead of from the file.** The check
  exists to catch an ID that points to the wrong place, and for that the
  expectation must come from the source's own file. Perseus's catalog says
  "Appianus of Alexandria" where the file says "Appian of Alexandria" — sixteen
  legitimate works were aborted on that difference.

## Verification

`pnpm typecheck` and `pnpm test` (Vitest) are the automatic gate. Run both after
every change. Tests cover pure functions only — chunking, citation formatting,
era boundaries, manifest helpers — never the database or the network; nothing
here calls Claude or touches `data/`.

`pnpm status` reads the database and is free. `pnpm build-corpus --dry` shows the
generator's report without writing the file — always run that variant first.

Added a Gutenberg author? Run `pnpm tsx scripts/.probe-header-match.ts --new`
before ingest. It tests `titleMatch`/`authorMatch` against the files' headers
ahead of time, free and in minutes. `--dry` only confirms the catalog has a name —
it says nothing about whether the file behind the ID is the same work, or whether
it even exists as text.

Changes to chunking require `pnpm ingest --force` to take effect. New _fields_ in
the manifest, by contrast, sync into already-indexed works on every regular run.

## Stack

- **Next.js 16 / React 19.** Read `node_modules/next/dist/docs/01-app/` before
  writing code in `src/app/`. It's App Router, server components by default,
  `"use client"` only where state lives.
- **Native modules.** `better-sqlite3`, `sqlite-vec`, and `onnxruntime-node` sit in
  `serverExternalPackages`. Every route that touches the database or a model must
  have `export const runtime = "nodejs"` — edge isn't an option.
- **Tailwind 4**, configured in `@theme` in `globals.css`. Parchment and ink:
  `parchment-*`, `ink-*`, `accent-*`. Use tokens, not hex.
- **vec0 measures Euclidean distance, not cosine.** `cos = 1 − d²/2`. The ranking
  ends up the same, so the error never shows in search — but the semantic cache
  compares an absolute number against a threshold, and there 0.97 becomes 0.75.
- **Environment variables** are `CANON_*`, all documented in `.env.example` with
  the measurement that set the default. New variable → new line there, with the
  reason.
