/**
 * What do the language branches do to the candidate list — before and after, on the same queries?
 *
 *   pnpm tsx scripts/.probe-lang-pipeline.ts
 *
 * `.probe-lang-branch.ts` shows WHY the non-English works were invisible:
 * the embedding model splits the vector space by language, so four English HyDE
 * passages gave four English branches. This measures what the fix is worth, in the
 * only measure that matters — the languages among the twenty-eight passages that
 * go on to Claude.
 *
 * BEFORE and AFTER are the same call to `hybridSearch` with the same queries and the
 * same cross-encoder. The only thing that differs is the list of hypothetical
 * passages: four English registers in one case, the same four plus one passage per
 * other language in the other. That's exactly the change `expandQuery` makes in
 * production.
 *
 * THE PASSAGES ARE HAND-WRITTEN HERE, not fetched from Claude, and that's a deliberate
 * choice: the measurement should be repeatable without costing money and without the
 * result shifting because the model wrote something different this time. They're
 * written in the registers and centuries the prompt asks for, so they're a reasonable
 * stand-in — but they aren't what Claude actually writes, and a run against real plans
 * (`pnpm eval`) is what decides how well the expansion follows the prompt.
 *
 * Runs locally. No Claude, no tokens.
 */
import { hybridSearch, type Candidate } from "../src/lib/search";
import { CORPUS_LANGUAGES, type Language } from "../src/lib/taxonomy";

interface Case {
  sv: string;
  queries: Record<Language, string>;
  keywords: string[];
  /** The four English registers — treatise, narrative, dramatization, system-building. */
  registers: string[];
  /** One passage per other language, in that language's own register. */
  languages: Partial<Record<Language, string>>;
}

const CASES: Case[] = [
  {
    sv: "Vad ger staten rätt att härska över sina medborgare?",
    queries: {
      sv: "Vad ger staten rätt att härska över sina medborgare?",
      en: "What gives the state the right to rule over its citizens?",
      fr: "Qu'est-ce qui donne à l'État le droit de gouverner ses citoyens ?",
      de: "Was gibt dem Staat das Recht, über seine Bürger zu herrschen?",
      la: "Quid civitati ius dat in cives suos imperandi?",
      it: "Che cosa dà allo Stato il diritto di governare i suoi cittadini?",
    },
    keywords: [
      "sovereign", "commonwealth", "obedience", "subjects", "consent", "multitude",
      "souveraineté", "obéissance", "sujets", "Staatsgewalt", "Gehorsam", "Obrigkeit",
      "imperium", "civitas", "sovranità", "sudditi", "överhet", "undersåtar",
    ],
    registers: [
      "The right of the sovereign over his subjects is founded not upon force alone, but upon that covenant whereby every man renounceth his private judgement and submitteth his will unto the common power. For where there is no such authority, each man is judge in his own cause, and the multitude is dissolved into a war of all against all.",
      "Among the Franks the king was chosen upon the shield and raised upon the shoulders of his warriors, and his authority extended no further than the assent of the assembled freemen. Only in the later reigns, when the bishops had anointed him with oil, was obedience demanded as a duty owed to heaven rather than a bargain struck among men.",
      "Tell me, by what right dost thou set thy word above the law? — By this right: that I am the state, and the state hath no judge above it. — Then thou art no king but a tyrant, and the gods that made thee will unmake thee.",
      "The state is the actuality of the ethical Idea, wherein the individual will, which in its immediacy knows only its own particular ends, is raised into universality and there finds its true freedom. Not the restriction of the will, therefore, but its fulfilment, is the ground of the right by which the whole commands the part.",
    ],
    languages: {
      sv: "Statens rätt över den enskilde grundar sig icke på svärdet, utan på det samfund vari var man avstått från att vara domare i egen sak. Den som lyder överheten lyder därför icke en främmande vilja, utan sin egen, sådan den blivit när den upphört att vara blott hans.",
      fr: "Ce qui fonde le droit de l'État sur ses citoyens n'est point la force, car la force ne fait point de droit et l'on n'est obligé d'obéir qu'aux puissances légitimes. C'est la convention seule par laquelle chacun, se donnant à tous, ne se donne à personne, et acquiert sur tous les associés le même droit qu'il leur cède sur lui.",
      de: "Der Staat ist die Wirklichkeit der sittlichen Idee, und das Recht, welches er über den Einzelnen ausübt, ist nicht Beschränkung, sondern Befreiung des Willens. Denn der einzelne Wille, der nur seine Besonderheit weiß, gelangt erst im Allgemeinen zu sich selbst, und was ihm als fremder Zwang erscheint, ist seine eigene Substanz.",
      la: "Quid est autem res publica nisi res populi? Populus autem non omnis hominum coetus quoquo modo congregatus, sed coetus multitudinis iuris consensu et utilitatis communione sociatus. Quae cum ita sint, imperium in cives non vi nititur sed consensu iuris, quo sublato nulla iam civitas est sed multitudo.",
      it: "Onde procede il diritto che 'l principe tiene sopra i suoi cittadini, se non da quel patto per lo quale ciascuno rimette il suo giudicio nella comune ragione? Ché dove non è legge comune, ivi non è cittade, ma moltitudine sparta, e ciascuno è signore e servo a un tempo.",
    },
  },
  {
    sv: "Vad händer med själen efter döden?",
    queries: {
      sv: "Vad händer med själen efter döden?",
      en: "What happens to the soul after death?",
      fr: "Qu'advient-il de l'âme après la mort ?",
      de: "Was geschieht mit der Seele nach dem Tode?",
      la: "Quid animae post mortem accidit?",
      it: "Che cosa accade all'anima dopo la morte?",
    },
    keywords: [
      "soul", "immortal", "shade", "resurrection", "grave", "spirit",
      "âme", "immortalité", "trépas", "Seele", "Unsterblichkeit", "Tod",
      "anima", "immortalitas", "umbra", "själ", "odödlighet", "graven",
    ],
    registers: [
      "If the soul be simple and without parts, it cannot be dissolved, for dissolution is the separating of what is composite. And that which cannot be dissolved cannot perish; wherefore the soul, being of the nature of the divine and unchanging, must continue when the body that housed it is scattered into its elements.",
      "The Egyptians held that the soul, upon the death of the body, entered into some other creature then being born, and having passed in this manner through all the creatures of land and sea and air, entered again into a human body; and this circuit, they said, was accomplished in three thousand years.",
      "I have seen the dead. They stood at the edge of the trench and drank, and knowing me they wept — and I stretched out my arms three times, and three times the shade went through them like smoke, and I understood that what a man loves is not what remains.",
      "Death is not an event in the life of spirit but the moment of its return into itself, wherein the particular existence, having exhausted its finitude, is taken up into the universal, and what perishes is only the immediate, never the substance which through that perishing first comes to know itself.",
    ],
    languages: {
      sv: "Och när stunden kom var det icke mörkt, utan endast tyst. Hon frågade sig om något av henne skulle bliva kvar, och fann intet svar utom detta: att hon icke kunde tänka sig sitt eget upphörande, ty den som tänkte det vore ju ännu till.",
      fr: "Nous mourons tous les jours, et ce que nous appelons la mort n'est que la dernière de ces morts. Que devient l'âme alors ? Ceux qui l'ont voulu savoir ont bâti des raisons ; mais nul n'est revenu nous en instruire, et le silence de ce pays-là est le seul témoignage certain que nous en ayons.",
      de: "Die Seele ist einfach, und was einfach ist, kann nicht zerfallen; der Tod aber ist Zerfall. Also kann die Seele nicht sterben. So schließt die Vernunft, und doch reicht dieser Schluß nicht zu, denn er beweist nur, daß sie nicht auf diese Weise vergehen kann, nicht aber, daß sie fortdauert.",
      la: "Quid igitur animus post mortem? Aut sensum omnino amittit, et tum nihil ad nos mors pertinet; aut in aeternam sedem migrat, et tum optanda est potius quam metuenda. Utrumlibet acceperis, non est quod sapiens mortem in malis numeret.",
      it: "Poi che la carne cade e l'ombra resta, non è però che l'anima si spenga: ché quella virtù che dal ciel discese non si dissolve come cosa mista, ma torna al suo principio e quivi attende il dì che le fia reso il suo vestire.",
    },
  },
];

const tally = (xs: Candidate[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x.language, (m.get(x.language) ?? 0) + 1);
  return CORPUS_LANGUAGES.filter((l) => m.has(l))
    .map((l) => `${l} ${String(m.get(l)).padStart(2)}`)
    .join("  ");
};

/** The same number as `CANDIDATES` in claude.ts — that's the list Claude sees. */
const LIMIT = 28;

for (const c of CASES) {
  console.log(`\n${"═".repeat(70)}\n${c.sv}\n${"═".repeat(70)}`);

  const languages = CORPUS_LANGUAGES.map((l) => c.languages[l]).filter(
    (p): p is string => Boolean(p),
  );

  const before = await hybridSearch({
    hypotheticalPassages: c.registers,
    keywords: c.keywords,
    queries: c.queries,
    limit: LIMIT,
  });
  const after = await hybridSearch({
    hypotheticalPassages: [...c.registers, ...languages],
    keywords: c.keywords,
    queries: c.queries,
    limit: LIMIT,
  });

  console.log(`  FÖRE  ${c.registers.length} grenar, alla engelska:   ${tally(before)}`);
  console.log(
    `  EFTER ${c.registers.length + languages.length} grenar, ett per språk:  ${tally(after)}`,
  );

  // Which works came in that weren't there before? That's the actual payoff.
  const had = new Set(before.map((p) => p.workId));
  const gained = after.filter((p) => !had.has(p.workId) && p.language !== "en");
  if (gained.length > 0) {
    console.log(`\n  nya icke-engelska verk i listan:`);
    for (const p of gained.slice(0, 10)) {
      const cross = p.crossScore === undefined ? "" : `  ${p.crossScore.toFixed(3)}`;
      console.log(`    ${p.language}  ${p.author}, ${p.title.slice(0, 52)}${cross}`);
    }
  }
}
