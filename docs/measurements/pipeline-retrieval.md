# Hybrid retrieval and the genre/era filter

[← back to README](../../README.md)

2. **Hybrid retrieval** — `multilingual-e5-small` (384 dim, runs locally) for
   semantic closeness, SQLite FTS5/BM25 for verbatim terms. The branches are
   combined with Reciprocal Rank Fusion, which ranks on position and so never
   needs to normalize different score scales.

   If the question names an author or work, one more branch is added, locked to
   just those works. "What does Kant say about lying?" would otherwise have no
   guarantee of returning Kant — the vector space doesn't care who wrote a
   passage, and the answer could come out Mill and Sidgwick. The branch can't
   use vec0's own index, which searches everything, and instead computes
   distances directly against the works in question; Plato's 5,700 passages
   take 57 ms.

   If the question has been scoped to certain subjects or eras, the filter
   applies to **every branch** — the vector branches, the BM25 branch and the
   mentions branch — and to nothing after them. Filtering the fusion list
   afterward instead would have given an empty search for the narrow subjects:
   religion is 2.7% of the collection and rarely reaches the first hundred.

   vec0's KNN can't take a genre condition, so there are two routes, and
   `.probe-genre-filter.ts` measured both. Filtering a KNN with a high k gives
   _exactly_ the right answer as long as a hundred slots get filled — a global
   KNN comes back in distance order, so what's filtered out of it is the
   subject's actual top list. The fill rate is thus the whole measure, measured
   at k=4096 (vec0's cap) with one passage per register:

   | subject     | share | filled slots      |     | subject       | share | filled slots      |
   | ------------ | ----- | ------------------- | --- | -------------- | ----- | ------------------- |
   | philosophy    | 24.7% | 100 100 100 100      |     | essay           | 5.3%  | 100 100 100 100      |
   | prose         | 18.8% | 100 100 100 100      |     | science         | 4.3%  | 100 100 100 49       |
   | history       | 17.7% | 100 100 100 100      |     | anthropology    | 3.5%  | 100 100 82 68         |
   | poetry        | 10.7% | 97 100 100 100       |     | religion        | 2.7%  | 4 53 56 33            |
   | politics      | 6.7%  | 100 100 100 100      |     | drama           | 5.7%  | 73 74 100 100         |

   The line falls at seven percent, not at drama: a subject falls out of a KNN
   because the question points away from it, not because the subject is small
   — drama at 5.7% misses where essay at 5.3% doesn't. Below the line,
   distances are computed directly against the selection's passages, same as
   the mentions branch, and that route is cheap precisely because the selection
   is small: ~69 µs per passage.

   That the exact route is even possible is because all four registers are
   counted in the **same** pass. The cost is in row fetching and blob decoding,
   not the 384 multiplications: four separate queries against drama's 48,683
   passages took 9.7 s; one pass counting all four distances, 3.4 s — and gave
   identical top lists, 100 of 100 (`.probe-genre-filter3.ts`).

   The second figures above were clocked while the machine was running two
   indexing jobs, and the collection grew during the measurement. It's the
   ratios and fill rates that carry the point, not the milliseconds; the shares
   are where the subjects stood at 852,410 body passages.

