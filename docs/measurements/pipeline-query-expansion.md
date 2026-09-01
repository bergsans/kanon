# Query expansion: HyDE, registers, languages

[← back to README](../../README.md)

1. **Query expansion** — Claude rewrites the question into _nine_ hypothetical
   ~90-word passages, plus a list of period-typical keywords, the question
   translated into the collection's languages, and the names of any authors or
   works the question explicitly mentions. This is
   [HyDE](https://arxiv.org/abs/2212.10496): a made-up answer sits much closer
   to the target passages in vector space than the question does. Measured on
   the collection, it moved the right passage from rank 4 to rank 1.

   Nine passages, not one, and for two reasons on different axes.

   **Register.** Four of them are English and sit in four different registers —
   treatise, historical narrative, dramatized scene, speculative
   system-building. A passage written like Hobbes finds Hobbes; it doesn't
   find Euripides.

   **Language.** The other five are one passage each in Swedish, French,
   German, Latin and Italian, written in that language's own register and
   century. This isn't a refinement but the condition for the collection's
   non-English fifth being findable at all: the embedding model splits the
   vector space by language, so a branch only finds text in the language its
   passage is written in. See [_Six languages, and why it
   works_](six-languages.md) for the measurement.

   Each passage becomes its own vector branch, and the embedding runs locally,
   so the branches only cost time — ~1.5–3.5 s for the five extra.

   The fourth register came last, for a measured reason. "Does history make
   progress" gave zero Hegel, Schopenhauer, Nietzsche, Kant and Marx despite
   all five being indexed: the first three registers pull toward narrative and
   ethnography, so Gibbon and Ferguson answered and the world-spirit didn't.
   Of everything tried in `.probe-progress-depth.ts` — deeper branches, pruned
   keywords — the register was the only thing that moved anything, and a real
   run afterward gave Marx and Engels a place in the answer and Schopenhauer a
   place among the candidates.

   Hegel, however, didn't come back, and that case is worth following all the
   way — it shows where the chain's real ceiling sits.

   The Hegel passages that _are_ read sit at fusion rank 46, 61, 83 and 86 and
   get 0.007 from the cross-encoder against 0.685 for the winning passage. It's
   not wrong: those are passages from the aesthetics. But the section that
   actually answers is indexed — the Encyclopedia's third part ends in
   Weltgeschichte, §§ 548–552 of _Philosophy of Mind_ — and that passage never
   surfaces. It sits 0.019 in cosine distance outside the vector branches' top
   100, and that small margin is in practice insurmountable:

   | lever                                      | where § 548 lands            |
   | --------------------------------------------- | ------------------------------- |
   | deeper branches, k=500                          | never enters the fusion          |
   | genre branch, philosophy only                   | rank 2,784 of 162,642            |
   | mentions branch, Hegel's works only              | outside the top 300 of 8,475     |
   | the cross-encoder, if it got to read it           | rank 18 of 103                   |

   So no lever in retrieval reaches the passage, while reranking would have let
   it in. The reason is in the text: Wallace translates Geist as "mind", and §
   548's wording talks about national spirits, climate and geography. The word
   "progress" isn't in it. The famous formulation — history as the progress of
   the consciousness of freedom — is in Sibree's _Philosophy of History_, and
   that isn't in the manifest. So the next lever is the collection, not the
   chain.

