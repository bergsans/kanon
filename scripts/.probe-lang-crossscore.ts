/**
 * Are the cross-encoder's scores COMPARABLE ACROSS LANGUAGES?
 *
 *   pnpm tsx scripts/.probe-lang-crossscore.ts
 *
 * The repo's three earlier language probes all measure the same thing: whether the
 * ranking holds within one and the same language. `.probe-rerank.ts` gave 8/10 for
 * Swedish against English, `.probe-rerank-native.ts` 6.1 for German and 5.3 for
 * French, `.probe-rerank-more.ts` extended that to Italian and Latin. All three rank
 * a list where every passage is in the same language.
 *
 * THAT IS NOT THE QUESTION THE APP ASKS. `crossRerank` in search.ts sorts ONE list
 * by absolute score, and after the language branches that list contains six languages
 * at once. It's then not enough for the model to rank German correctly within German: a
 * German passage and an English one that answer equally well must get roughly the same
 * NUMBER, otherwise one language wins every comparison regardless of content. A shift of
 * a few tenths wouldn't show up as an error — only as a result list that stays English
 * after the branches were rebuilt specifically to stop being that.
 *
 * CONTENT IS HELD CONSTANT, language is varied. The passages below are written for
 * this measurement rather than pulled from the collection, for exactly that reason:
 * pulled passages would have made the difference a mix of language and content, and
 * that's exactly the conflation that made `.probe-rerank-lang.ts` uninterpretable
 * (French fell there to 4.0/10 and there was no way to tell whether it was French or
 * Zévort's prose that was being measured). Here the same thought is written six times.
 *
 * TWO NUMBERS PER LANGUAGE, not one. The score on the passage that answers says where
 * the language lands in the shared sort. The gap down to the passages that DON'T answer
 * says whether the model distinguishes them at all in that language — and that
 * distinction is exactly what `.probe-rerank-more.ts` showed was the whole point: a
 * model can be perfectly consistent in its indifference.
 *
 * The model runs locally. No Claude, no tokens.
 */
import { scorePairs } from "../src/lib/rerank";
import { MODEL_ID } from "../src/lib/rerank";
import { CORPUS_LANGUAGES, type Language } from "../src/lib/taxonomy";

/**
 * Three subjects, each written in the collection's six languages.
 *
 * Three and not one: a single number is noise, and it's the average across subjects
 * that should decide whether a language shift exists. The subjects are chosen to sit
 * at the collection's center of gravity — the soul, sovereignty, freedom — so the
 * passages could plausibly belong to it.
 */
const TOPICS: { sv: string; passages: Record<Language, string> }[] = [
  {
    sv: "Vad händer med själen efter döden?",
    passages: {
      en: "If the soul be simple and without parts, it cannot be dissolved, for dissolution is the separating of what is composite. And that which cannot be dissolved cannot perish; wherefore the soul, being of the nature of the divine and unchanging, must continue when the body that housed it is scattered into its elements.",
      sv: "Är själen enkel och utan delar kan den inte upplösas, ty upplösning är åtskiljandet av det sammansatta. Och det som inte kan upplösas kan inte förgås; därför måste själen, som är av gudomlig och oföränderlig natur, bestå när kroppen som hyste den skingras i sina beståndsdelar.",
      de: "Ist die Seele einfach und ohne Teile, so kann sie nicht aufgelöst werden, denn Auflösung ist die Trennung des Zusammengesetzten. Und was nicht aufgelöst werden kann, kann nicht vergehen; darum muß die Seele, da sie göttlicher und unwandelbarer Natur ist, fortbestehen, wenn der Leib, der sie beherbergte, in seine Elemente zerfällt.",
      fr: "Si l'âme est simple et sans parties, elle ne peut être dissoute, car la dissolution est la séparation de ce qui est composé. Et ce qui ne peut être dissous ne peut périr ; c'est pourquoi l'âme, étant de nature divine et immuable, doit subsister lorsque le corps qui la logeait se disperse en ses éléments.",
      it: "Se l'anima è semplice e senza parti, non può essere dissolta, poiché la dissoluzione è la separazione di ciò che è composto. E ciò che non può essere dissolto non può perire; perciò l'anima, essendo di natura divina e immutabile, deve permanere quando il corpo che la ospitava si disperde nei suoi elementi.",
      la: "Si anima simplex est et sine partibus, dissolvi non potest, nam dissolutio est separatio eius quod compositum est. Et quod dissolvi non potest, perire non potest; quare anima, cum divinae et immutabilis naturae sit, permanere debet cum corpus quod eam hospitabatur in elementa sua dispergitur.",
    },
  },
  {
    sv: "Vad ger staten rätt att härska över sina medborgare?",
    passages: {
      en: "The right of the sovereign over his subjects is founded not upon force alone, but upon that covenant whereby every man renounceth his private judgement and submitteth his will unto the common power. For where there is no such authority, each man is judge in his own cause, and the multitude is dissolved into a war of all against all.",
      sv: "Suveränens rätt över sina undersåtar vilar inte på våldet allena, utan på det fördrag varigenom var man avsäger sig sitt enskilda omdöme och underkastar sin vilja den gemensamma makten. Ty där ingen sådan myndighet finns är var man domare i sin egen sak, och mängden upplöses i allas krig mot alla.",
      de: "Das Recht des Souveräns über seine Untertanen gründet nicht auf Gewalt allein, sondern auf jenem Vertrage, wodurch ein jeder sein eigenes Urteil aufgibt und seinen Willen der gemeinsamen Macht unterwirft. Denn wo keine solche Obrigkeit ist, da ist ein jeder Richter in eigener Sache, und die Menge löst sich auf in den Krieg aller gegen alle.",
      fr: "Le droit du souverain sur ses sujets ne se fonde pas sur la seule force, mais sur ce pacte par lequel chacun renonce à son jugement particulier et soumet sa volonté à la puissance commune. Car où il n'est point d'une telle autorité, chacun est juge en sa propre cause, et la multitude se dissout en la guerre de tous contre tous.",
      it: "Il diritto del sovrano sui suoi sudditi non si fonda sulla sola forza, ma su quel patto per cui ciascuno rinuncia al proprio giudizio privato e sottomette la sua volontà alla potenza comune. Poiché dove non vi è tale autorità, ciascuno è giudice nella propria causa, e la moltitudine si dissolve nella guerra di tutti contro tutti.",
      la: "Ius principis in subditos non vi sola nititur, sed pacto illo quo unusquisque iudicium suum privatum abdicat et voluntatem suam potestati communi subicit. Ubi enim nulla talis auctoritas est, ibi unusquisque in causa sua iudex est, et multitudo in bellum omnium contra omnes dissolvitur.",
    },
  },
  {
    sv: "Kan frihet och jämlikhet förenas?",
    passages: {
      en: "Liberty and equality are not the same good, and it is the error of our age to confound them. He that is made equal to his neighbour in condition may yet be less free than before, for the hand that levels must also hold; and the more perfectly the levelling is accomplished, the heavier must that hand press upon every man alike.",
      sv: "Friheten och jämlikheten är icke samma goda, och det är vår tids villfarelse att sammanblanda dem. Den som gjorts jämlik sin nästa i villkor kan likväl vara mindre fri än förr, ty handen som jämnar måste ock hålla; och ju fullkomligare jämnandet fullbordas, dess tyngre måste den handen trycka på var och en lika.",
      de: "Freiheit und Gleichheit sind nicht dasselbe Gut, und es ist der Irrtum unseres Zeitalters, sie zu verwechseln. Wer seinem Nachbarn im Zustande gleichgemacht ward, mag gleichwohl minder frei sein als zuvor, denn die Hand, die ebnet, muß auch halten; und je vollkommener die Ebnung vollbracht wird, desto schwerer muß jene Hand auf einem jeden gleich lasten.",
      fr: "La liberté et l'égalité ne sont pas le même bien, et c'est l'erreur de notre siècle que de les confondre. Celui qu'on a rendu égal à son voisin en condition peut être pourtant moins libre qu'auparavant, car la main qui nivelle doit aussi retenir ; et plus le nivellement s'accomplit parfaitement, plus cette main doit peser également sur chacun.",
      it: "La libertà e l'uguaglianza non sono il medesimo bene, ed è l'errore del nostro secolo confonderle. Colui che è stato reso uguale al suo vicino nella condizione può nondimeno essere meno libero di prima, poiché la mano che livella deve anche trattenere; e quanto più perfettamente il livellamento si compie, tanto più gravemente quella mano deve premere su ciascuno ugualmente.",
      la: "Libertas et aequalitas non idem bonum sunt, et error saeculi nostri est ea confundere. Qui vicino suo condicione aequatus est, minus tamen liber esse potest quam antea, nam manus quae aequat etiam tenere debet; et quo perfectius aequatio perficitur, eo gravius manus illa in unumquemque pariter premat necesse est.",
    },
  },
];

const pad = (s: string, n: number) => s.padEnd(n);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log(`modell: ${MODEL_ID}\n`);
console.log(
  "Varje fråga poängsätts mot ALLA arton styckena — sex språkdräkter av det stycke\n" +
    "som svarar, och tolv av de stycken som inte gör det. Talen är cross-encoderns\n" +
    "råa poäng, alltså exakt det `crossRerank` sorterar på.\n",
);

/** Per language: the score on the answering passage, and on the non-answering ones. */
const hit = new Map<Language, number[]>();
const miss = new Map<Language, number[]>();
/** The rank the answering passage in that language gets in the shared sort. */
const place = new Map<Language, number[]>();

for (const topic of TOPICS) {
  const pairs: {
    query: string;
    passage: string;
    lang: Language;
    answers: boolean;
  }[] = [];
  for (const other of TOPICS) {
    for (const lang of CORPUS_LANGUAGES) {
      pairs.push({
        query: topic.sv,
        passage: other.passages[lang],
        lang,
        answers: other === topic,
      });
    }
  }

  const scores = await scorePairs(pairs);
  const ranked = scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.i);
  const rankOf = new Map(ranked.map((i, r) => [i, r + 1]));

  console.log(`${topic.sv}`);
  for (const lang of CORPUS_LANGUAGES) {
    const own = pairs.findIndex((p) => p.lang === lang && p.answers);
    const others = pairs
      .map((p, i) => (p.lang === lang && !p.answers ? scores[i] : null))
      .filter((s): s is number => s !== null);

    hit.set(lang, [...(hit.get(lang) ?? []), scores[own]]);
    miss.set(lang, [...(miss.get(lang) ?? []), ...others]);
    place.set(lang, [...(place.get(lang) ?? []), rankOf.get(own)!]);

    console.log(
      `   ${pad(lang, 4)} svarar ${scores[own].toFixed(4)}` +
        `   svarar inte ${mean(others).toFixed(4)}` +
        `   plats ${String(rankOf.get(own)).padStart(2)}/${pairs.length}`,
    );
  }
  console.log();
}

console.log("─".repeat(62));
console.log("över alla tre frågorna:\n");
console.log(
  `   ${pad("språk", 6)}${pad("svarar", 10)}${pad("svarar inte", 13)}${pad("skillnad", 10)}snittplats`,
);
for (const lang of CORPUS_LANGUAGES) {
  const h = mean(hit.get(lang)!);
  const m = mean(miss.get(lang)!);
  console.log(
    `   ${pad(lang, 6)}${pad(h.toFixed(4), 10)}${pad(m.toFixed(4), 13)}` +
      `${pad((h - m).toFixed(4), 10)}${mean(place.get(lang)!).toFixed(1)}`,
  );
}

const en = mean(hit.get("en")!);
console.log(
  `\nLäs kolumnen "svarar" mot engelskans ${en.toFixed(4)}. Ligger ett språk\n` +
    `påtagligt under vinner engelskan varje jämförelse i den blandade listan oavsett\n` +
    `innehåll, och språkgrenarna i search.ts behöver en kvot för att synas i svaret —\n` +
    `en gemensam sortering på absolut poäng räcker då inte. Kolumnen "skillnad" säger\n` +
    `om modellen alls skiljer svarande från icke-svarande på det språket: är den nära\n` +
    `noll är poängen brus och språket kan inte rankas alls, hur högt talet än ser ut.`,
);
