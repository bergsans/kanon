---
name: canon-retrieval
description: Change Canon's search pipeline — HyDE expansion, vector and BM25 branches, RRF, the mention branch, the cross-encoder, the diversity filter, Claude's reranking, the cache, or the cost. Use when search returns the wrong passages, when a threshold or candidate count needs changing, when a step needs adding or removing, or when someone asks what a step costs. Also use for English requests about the retrieval pipeline, reranking, RRF, HyDE or the semantic cache.
---

# Retrieval

Every number in the chain is measured. Read the line that set it before you change it — it's
in the doc comment on the constant, and in detail in `README.md`.

## The order is the invariant

```
branches → RRF → dedupe → cross-encoder → diversify → Claude
```

**The cross-encoder must come before the diversity filter** (AGENTS.md → "The chain"
and "Not allowed").

**Crowded-out passages aren't discarded.** `diversify` puts them last instead, so a
narrow query where only one work answers still returns a full list.

## The numbers and what set them

| constant                          | where                 | value                          | reason                                                                                                                                                                                         |
| ---------------------------------- | --------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CANDIDATES`                      | `api/search/route.ts` | 28                             | cut down from 40 once the cross-encoder came in. Not lower: out of 20 candidates Claude's selection is a write-off, not a selection                                                            |
| `RERANK_POOL`                     | `search.ts`           | 48                             | ~70 ms per passage, ~3 s total                                                                                                                                                                  |
| `MAX_PER_WORK` / `MAX_PER_AUTHOR` | `search.ts`           | 3 / 4                          | without a cap, "civilization vs. barbarism" becomes fifteen passages out of Gibbon's six volumes                                                                                                |
| `RRF_K`                           | `search.ts`           | 60                             | the original paper's default value                                                                                                                                                              |
| `SIMILARITY`                      | `searches.ts`         | 0.95                           | the classes overlap: rephrasings 0.87–0.97, related but different questions 0.79–0.93. "Is power more important than morality for a prince?" against its mirror image sits at 0.93 and must not share an answer |
| `MODEL`                           | `claude.ts`           | `claude-sonnet-5`              | Sonnet picked 7 of 8 passages identically to Opus, at a third of the price                                                                                                                      |
| cross-encoder                     | `rerank.ts`           | `mmarco-mMiniLMv2-L12-H384-v1` | 8/10 top-10 overlap between Swedish and English query; `bge-reranker-base` (q8) gave 4/10 — the quantized build collapses                                                                        |

To change a number: **measure first** (see `canon-probe`), write the measurement into the
doc comment, update `.env.example` if there's a `CANON_*` variable for it,
and fix the README line that carries the old number.

## The branches

Three HyDE passages, not one, and in three registers — treatise, historical
account, dramatized scene. A passage written in Hobbes's style finds Hobbes; it doesn't
find Euripides. Each passage becomes its own vector branch, and the embedding runs
locally, so the branches are free.

**The mention branch** is locked to the works the query explicitly names. Without it, "What
does Kant say about lying?" has no guarantee of returning Kant — the vector space doesn't care
who wrote a passage. The branch can't use vec0's own index (it searches everything)
and instead computes distances directly; Plato's 5,700 passages take 57 ms. `MENTION_ID_BATCH`
exists because SQLite takes ~32,000 bound parameters.

## The cache

Two paths: an exact hit on `prompt_norm`, then vector similarity. **vec0 measures
Euclidean distance, not cosine** — `cos = 1 − d²/2`. The ranking stays the
same, so the error never shows up in search, but here an absolute number is compared against a
threshold, and 0.97 becomes 0.75 if the distance is read wrong.

Only the passages' IDs are saved, never their text. A saved search whose passages disappeared
during reindexing is treated as a **miss**, not as a partial answer.

`translations` carries `text_hash` of the source text for the same reason: chunk IDs are reused on
reindexing, and without the hash the old translation shows up under the new text.

## The cost

~$0.076 per search at 40 candidates; about a quarter lower at 28. The candidate text is
the biggest line item on the bill — but only on the input side. Justifications and thinking are billed
as **output** and aren't affected by the candidate count. Adaptive thinking is output:
the expansion step sends ~250 tokens of visible JSON and gets billed ~725.

A repeated query costs **zero**. It's the single biggest line item in the economics and
doesn't show up in a per-passage cost.

Touching `claude.ts`: `PRICE`, `CACHE_READ`/`CACHE_WRITE`, `CACHE_MINIMUM`, and
`SUPPORTS_EFFORT` are tied to `CostLine`/`CostStep` in `protocol.ts` and to
the table in `CostTag.tsx`. A new line on the bill → all four. Haiku 4.5 rejects
`output_config.effort` with a 400 — hence `SUPPORTS_EFFORT`; without it, a model swap
isn't a cheaper app but a broken one.

## Checking a change

```bash
pnpm typecheck                # the gate
pnpm eval                     # COSTS MONEY — ask first
pnpm eval --no-rerank         # what the cross-encoder moves
pnpm eval --compare           # hybrid against pure BM25
pnpm eval --no-expand         # with and without Claude's expansion
pnpm eval "custom query"
```

`scripts/eval.ts` has eight probe queries, each with its own purpose — `civilization vs.
barbarism` probes breadth, `what does Kant say about lying?` the mention branch, `marriage as
an institution built on a lie` the Swedish collection. Adding a query: write the
comment stating what it probes, otherwise it's just one more query.

`localPlan` in the same file is the free baseline. Everything Claude produces has a local
substitute except the three hypothetical passages — that's exactly the difference `--no-expand`
measures.
