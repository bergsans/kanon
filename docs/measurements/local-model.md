# Local model (experimental)

[← back to README](../../README.md)

### Local model (experimental)

The switch in the menu (top-right corner) can disconnect Claude entirely and
run the whole chain (query expansion + reranking) on a local model via
Ollama — `src/lib/local.ts`. Free in dollars, but not free in latency or
accuracy.

**The switch, open** — Claude and the three local models, with the measured
share of shared passages where it exists
![The model switch open](docs/screenshots/modellval.png)

**The same view, a local model's answer** — the same permalink template as
Claude's answer (`delad-sokning.png` above), here saved from qwen3:8b. The
switch shows the session's current choice, not which model once answered — see
`provider-server.ts`.
![A saved search run with a local model](docs/screenshots/lokal-modell.png)

**Installation.** Ollama runs as its own server on the machine, separate from
the app:

```
brew install ollama
brew services start ollama        # or: ollama serve, in its own terminal window
ollama pull qwen3:14b
ollama pull qwen3:8b
ollama pull gemma3:12b
```

Those three are the list in `OLLAMA_MODELS` in `src/lib/provider.ts` — add a
line there and run the matching `ollama pull` to offer a fourth. No `.env`
variable controls which model is used any more; that's entirely the switch's
job, set per session in the `canon-provider` cookie. `CANON_OLLAMA_URL` remains
for anyone running Ollama at an address other than `localhost:11434`.

**A second protocol, for servers that speak OpenAI's API instead of
Ollama's.** `OPENAI_MODELS` in `provider.ts` lists models reached over
`/v1/chat/completions` rather than `/api/chat` — all three entries are the
same mlx-serve model (MLX on Apple Silicon) at different quantizations,
`qwen-3.8-27b-bf16`, `qwen-3.8-27b-8bit`, and `qwen-3.8-27b-6bit`. `local.ts`
picks the wire format per model, so the switch and the rest of the chain
don't know or care which protocol answered. Point at a non-default host with
`CANON_MLX_URL` (mlx-serve itself runs as its own process, the same way
Ollama does — nothing here starts it); `CANON_MLX_API_KEY` exists for a
server that actually checks the bearer token instead of accepting any value.
None of the three has been run through `.probe-rerank-local.ts` against
Sonnet — offered for comparison the same way qwen3:8b and gemma3:12b are, not
because any has been measured for selection quality the same way.
`.probe-local-timing.ts` (below) times all three; it doesn't judge what they
pick.

**Flash attention and quantized KV cache** are two flags the Ollama server
itself reads, not something the app sets — they lower memory pressure from the
large context window (`NUM_CTX` in `local.ts`) on a machine without much
VRAM/unified memory. Set them before the service starts:

```
launchctl setenv OLLAMA_FLASH_ATTENTION 1
launchctl setenv OLLAMA_KV_CACHE_TYPE q8_0
brew services restart ollama
```

`launchctl setenv` only applies to the logged-in session — a computer restart
resets it, and the commands have to be run again. The effect on latency and
accuracy isn't measured here; `OLLAMA_KV_CACHE_TYPE=q8_0` quantizes a field
that otherwise sits in f16, which in theory could affect precision on long
answers somewhat — no run in the table below has tested with or without it.

The models were chosen for what fits in memory alongside the rest of the app
(better-sqlite3, sqlite-vec, onnxruntime) on a machine with 24 GB: `qwen3:14b`
(~9.3 GB), `qwen3:8b` (~5.2 GB, same family but smaller — a pure size
comparison), and `gemma3:12b` (~8.1 GB, a different model family for breadth).
Only `qwen3:14b` is measured against Sonnet below; the other two can be
selected so the curious can compare for themselves, not because either has
been shown to hold the same (or different) quality.

**The context window was the first trap.** Ollama's default is 4096 tokens per
slot; reranking's candidate list is 13,000–15,000. Without raising `num_ctx`,
the server silently truncates the prompt and the model justifies passages it
never read — the first run gave rationales that consistently described the
wrong author for every candidate (e.g. a line labeled "Thomas De Quincey" that
actually summarized Cicero). `num_ctx: 32768` in `local.ts` fixes that. The
second trap was `stream: false`: Ollama then holds the whole response back
until generation finishes, and at ~7–9 tokens/s on CPU a broad response takes
longer than undici's built-in body timeout of 300 s — an error that looks like
a network problem but is a latency problem. Streaming mode fixes it; see
`local.ts`.

**The third trap was thinking.** qwen3 reasons on its own before answering,
and that text arrives in its own `thinking` field, separate from the actual
answer — a trivial one-word answer took 104 output tokens with thinking on and
3 with `think: false` set. That was likely the single largest factor behind a
single reranking call taking around nine minutes. `local.ts` sets `think:
false` on every call; the effect on accuracy (not just speed) is in the table
below if it was measured after this was written, otherwise it's still an open
question.

**Measured in `.probe-rerank-local.ts`**
(`pnpm run probe-rerank-local -- --local-only`), the same 28 candidates per
question Sonnet got, eight questions, with the correct context window:

| question                                          | sonnet | qwen3:14b | shared |
| ----------------------------------------------------- | -----: | --------: | -----: |
| what is the good life?                                  |     20 |        10 |   7/23 |
| may the state restrict individual freedom?               |     15 |         0 |   0/15 |
| anxiety in the face of one's own freedom                  |      6 |         6 |    3/9 |
| what happens to the soul after death?                     |     19 |        22 |  17/24 |
| is power more important than morals for a prince?          |     16 |         5 |   5/16 |
| civilization versus barbarism                              |     16 |        12 |   9/19 |
| what does Kant say about lying?                              |      3 |         2 |    2/3 |
| marriage as an institution built on a lie                    |     12 |         4 |   3/13 |

**38% shared selected passages overall (46/122).** Attributions are now
correct — a rationale labeled Cudworth is actually about Cudworth — so the
error that remains isn't hallucination but coverage: the model often misses
the breadth Sonnet finds (0 of 28 on the freedom question, despite relevant
candidates in the pool), and rarely holds to the prompt's instruction that
there's no target count. None of this is compared against other local models
— only against Sonnet, on a single machine (M4, 24 GB).

The cache (`searches.ts`) keeps Claude's and the local model's answers apart:
cache hits require the same `model` column, not just the same question and
filter.

