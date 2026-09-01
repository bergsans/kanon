/**
 * Does the embedding model split the vector space by LANGUAGE?
 *
 *   pnpm tsx scripts/.probe-lang-branch.ts
 *
 * The question arose from an observation: hits from works in languages other than
 * English never made it into the result list. The collection is in six languages and
 * just over a fifth of the passages are non-English, so this wasn't a skew but an absence.
 *
 * THE MEASUREMENT SITS BEFORE RERANKING, and that's what settled the matter. The
 * natural suspect was the cross-encoder — it scored everything but Swedish against
 * the English query. But a run of `hybridSearch` with reranking disabled
 * showed the fusion list of ninety-six candidates was already 96/96 English on two
 * of three queries. The loss was therefore in retrieval, not in any step after it.
 *
 * HENCE THIS MEASUREMENT: the same passage, the same thought, written in four languages,
 * and the language distribution among the hundred nearest neighbors of each. If the
 * model keeps the languages together, the four neighborhoods should be largely the
 * same. If it splits the space by language, they become disjoint, and then every HyDE
 * passage is a branch that can only find its own language.
 *
 * RESULT (986,857 passages indexed, collection is 85% English, 10% Swedish, 3% French, 2% German):
 *
 *   passage in en:  en  99   fr   1      best distance  en 0.465   rank 100: 0.500
 *   passage in fr:  fr 100                              fr 0.398   rank 100: 0.487
 *   passage in de:  de  98   fr   2                     de 0.443   rank 100: 0.478
 *   passage in sv:  sv 100                              sv 0.452   rank 100: 0.485
 *
 * The split is nearly total, and it does NOT follow the collection's share: German is
 * two percent of the passages and still takes ninety-eight of a hundred slots when the
 * query passage is German. It's language identity that dominates the vector, not the
 * material's size.
 *
 * THE CONCLUSION IS ONE BRANCH PER LANGUAGE. Four English HyDE passages gave four English
 * branches, and therefore zero way in for the non-English works — regardless of how well
 * they answered the query, and regardless of what was done further down the chain. See
 * `hypotheticalPassages` in claude.ts and `.probe-lang-crossscore.ts`, which measures whether
 * the six languages can then be sorted into one and the same list.
 *
 * Runs locally against the indexed database. No Claude, no tokens.
 */
import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";
import type { Language } from "../src/lib/taxonomy";

/**
 * One and the same passage in four language guises.
 *
 * Written for this measurement rather than pulled from the collection, because the
 * content must be held constant: a pulled passage would have made the difference a
 * mix of language and content. The subject — the soul's immortality from its
 * simplicity — was chosen because each of the four languages' share of the collection
 * carries it.
 *
 * Four and not six: Latin and Italian were added later and are too small to give
 * a stable hundred. The measurement doesn't need them — it demonstrates a split, and
 * a split that holds for four languages holds for six.
 */
const PASSAGES: Partial<Record<Language, string>> = {
  en: "If the soul be simple and without parts, it cannot be dissolved, for dissolution is the separating of what is composite. And that which cannot be dissolved cannot perish; wherefore the soul, being of the nature of the divine and unchanging, must continue when the body that housed it is scattered into its elements.",
  fr: "Si l'âme est simple et sans parties, elle ne peut être dissoute, car la dissolution est la séparation de ce qui est composé. Et ce qui ne peut être dissous ne peut périr ; c'est pourquoi l'âme, étant de nature divine et immuable, doit subsister lorsque le corps qui la logeait se disperse en ses éléments.",
  de: "Ist die Seele einfach und ohne Teile, so kann sie nicht aufgelöst werden, denn Auflösung ist die Trennung des Zusammengesetzten. Und was nicht aufgelöst werden kann, kann nicht vergehen; darum muß die Seele, da sie göttlicher und unwandelbarer Natur ist, fortbestehen, wenn der Leib, der sie beherbergte, in seine Elemente zerfällt.",
  sv: "Är själen enkel och utan delar kan den inte upplösas, ty upplösning är åtskiljandet av det sammansatta. Och det som inte kan upplösas kan inte förgås; därför måste själen, som är av gudomlig och oföränderlig natur, bestå när kroppen som hyste den skingras i sina beståndsdelar.",
};

/** The same k as retrieval's `BRANCH_LIMIT`: the branch is what's being measured. */
const K = 100;

const db = getDb();

const share = db
  .prepare(
    `select w.language as lang, count(*) as n
       from chunks c join works w on w.id = c.work_id
      where c.is_front_matter = 0
      group by w.language`,
  )
  .all() as { lang: string; n: number }[];
const total = share.reduce((s, r) => s + r.n, 0);
console.log(
  `samlingen: ${total.toLocaleString("sv-SE")} stycken — ` +
    share
      .sort((a, b) => b.n - a.n)
      .map((r) => `${r.lang} ${((100 * r.n) / total).toFixed(1)} %`)
      .join("  "),
);
console.log("\nspråkfördelning bland de 100 närmaste grannarna:\n");

const knn = db.prepare(
  `with knn as (
     select chunk_id, distance from vec_chunks where embedding match ? and k = ?
   )
   select w.language as lang, knn.distance as d
     from knn
     join chunks c on c.id = knn.chunk_id
     join works w on w.id = c.work_id
    order by knn.distance`,
);

for (const [lang, text] of Object.entries(PASSAGES)) {
  const rows = knn.all(vecBlob(await embedQuery(text)), K) as {
    lang: string;
    d: number;
  }[];

  const tally = new Map<string, number>();
  const best = new Map<string, number>();
  for (const r of rows) {
    tally.set(r.lang, (tally.get(r.lang) ?? 0) + 1);
    // The rows come in distance order, so the first per language is the best.
    if (!best.has(r.lang)) best.set(r.lang, r.d);
  }

  console.log(
    `  stycket på ${lang}:  ` +
      [...tally]
        .sort((a, b) => b[1] - a[1])
        .map(([l, n]) => `${l} ${String(n).padStart(3)}`)
        .join("  "),
  );
  console.log(
    `      bästa avstånd:  ` +
      [...best].map(([l, d]) => `${l} ${d.toFixed(3)}`).join("  ") +
      `   (plats ${K}: ${rows[K - 1]?.d.toFixed(3) ?? "–"})`,
  );
}

console.log(
  `\nÄr grannskapen disjunkta hittar ett HyDE-stycke bara sitt eget språk, och\n` +
    `hämtningen behöver en gren per språk. Läs avstånden bredvid: ligger det bästa\n` +
    `avståndet på ett FRÄMMANDE språk under det hundrade på det egna hade en enda\n` +
    `gren räckt, för då konkurrerar språken i samma lista. Gör det inte det — och\n` +
    `det gör det inte — är uppdelningen en vägg och inte en lutning.`,
);
