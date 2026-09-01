# Cost

[← back to README](../../README.md)

### Cost

**~$0.076 per search** was the measured figure with 40 candidates going to
reranking. The cross-encoder made it possible to send 28 instead, and that
line item is the bill's largest. Counted in tokens — not measured — input
falls by roughly a third and the whole search by around a quarter. The
rationales and the thinking are billed as _output_ and aren't affected at all,
which is why the saving isn't half.

Then the figure went the other way again. The candidate list is now 64, and
the reason is recall: at 28, a third of the gold standard's must-have authors
never reached Claude at all (see "How many passages an answer consists of").
Input grows ~2.3x against 28 and output with the number of rationales, so a
search costs on the order of **~$0.12**. That's the most expensive the chain
has ever been, and what's bought for the money is retrieval's reach — not a
longer answer list.

Every call's actual cost is logged to the server console, so the figure can be
checked instead of guessed. It's also saved with the search.

A **repeated question costs zero**. That's the single biggest change to the
economics, and it doesn't show up in a per-search cost figure.

Steps 2 and 3 are free and run entirely locally. The cross-encoder is what
makes retrieval slow: the whole of steps 2 and 3 clocked at 11.9 s at pool 96,
against the ~3 seconds that held when the pool was 48. The pool is now 192,
and that cost surprisingly little: 12.2 s averaged over the gold standard's
twelve questions, meaning ~0.3 s for a doubling. A linear count at 70 ms per
pair would have predicted ~7 s — the batching in `rerank.ts` carries the other
half almost for free. `CANON_RERANK_POOL` controls how many candidates it
reads, and `CANON_LOCAL_RERANK=0` turns the step off entirely.

The model choice at Claude is measured, not assumed: Opus 5, Sonnet 5 and
Haiku 4.5 were run against identical prompts. Sonnet chose 7 of 8 passages
identically to Opus and produced the same HyDE hits, at a third of the price —
which is why Sonnet 5 is the default. Set `CANON_MODEL=claude-opus-5` in
`.env.local` to switch up.

Note that adaptive thinking is billed as **output** tokens: the expansion step
sends ~250 tokens of visible JSON but is billed for ~725. It's easy to
underestimate.

