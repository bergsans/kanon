/**
 * Step 4: what reranking does to Ruskin, measured on the whole candidate list.
 *
 * The sanity check (`.probe-rerank-sanity.ts`) cleared the model: 0.977 on a
 * textbook pair, 0.0007 on a miss, 0.992 with a Swedish query against an English passage.
 * So it isn't broken and it isn't monolingual. But the same model gives 0.029 to
 * Kant's lying passage against the app's own eval query — it scores factual answers, not
 * thematic kinship, and Canon's queries are consistently thematic.
 *
 * Here the same candidate list is run twice: once as the fusion leaves it, once as
 * the cross-encoder reorders it. The difference in Ruskin's placement is the measure.
 */
import { hybridSearch, type Candidate } from "../src/lib/search";
import { CORPUS_LANGUAGES, type Language } from "../src/lib/taxonomy";

const QUESTION =
  "arkitektur säger sanningen om en civilisation mer än vad den säger om sig själv";

/** The same nine hand-written passages as in `.probe-ruskin.ts`. */
const PASSAGES = [
  "Great nations write their autobiographies in three manuscripts: the book of their deeds, the book of their words, and the book of their art. Of the three the only trustworthy one is the last. The acts of a nation may be triumphant by its good fortune, and its words mighty by the genius of a few of its children; but its art only by the general gifts and common sympathies of the race.",
  "The traveller who enters the city by water reads in the change of the mouldings the whole history of the republic: the frank strength of the earlier centuries, the rich confidence of the age of conquest, and at last the weak and ostentatious ornament of the years of decline. The chronicles of the state praise its virtue to the end; the carved capitals of its houses record the corruption of its faith long before any chronicler dared name it.",
  "Stand here, and look at the wall before you. The builder is dead these five hundred years, and no word of his survives; yet the labour of his hand tells you whether he was a free man or a slave, whether he loved his work or feared his master, whether his city honoured God or itself. A building is a confession made by a whole people without knowing that it confesses.",
  "In every epoch the spirit of a people objectifies itself first in stone, and only afterwards attains consciousness of itself in religion, in law, and in philosophy. Architecture is therefore the earliest and the least dissembling of the arts: the temple, the cathedral, the factory each embody the ruling idea of their age with a fidelity which the age's own account of itself never possesses.",
  "En byggnad ljuger inte. Ett folks lagar och predikningar säger vad det vill vara; dess murar, portar och kyrkor säger vad det verkligen var. Därför är byggnadskonsten den säkraste källan vi har till en civilisations inre tillstånd.",
  "Die Baukunst ist die erste und ehrlichste Selbstdarstellung eines Volkes. Was ein Zeitalter von sich selbst behauptet, steht in seinen Büchern; was es wirklich war, steht in seinen Mauern, Gewölben und Türmen.",
  "L'architecture est le grand livre de l'humanité. Ce qu'un peuple dit de lui-même dans ses lois peut mentir; ce qu'il bâtit ne ment jamais. La pierre garde la trace exacte de la foi et de la corruption d'une civilisation.",
  "L'architettura è la testimonianza più veritiera di una civiltà. Le cronache di una repubblica ne lodano la virtù fino all'ultimo giorno; i capitelli dei suoi palazzi registrano la decadenza della sua fede molto prima che qualcuno osi nominarla.",
  "Aedificia populi mores verius produnt quam verba. Quae de se ipsa civitas praedicat in legibus scripta sunt; quae vere fuit, in muris, templis et arcubus manet. Lapis enim mentiri nescit.",
];

const KEYWORDS = [
  "architecture", "building", "stones", "civilisation", "nation", "ornament", "gothic",
  "byggnadskonst", "arkitektur", "civilisation",
  "Baukunst", "Volk", "architecture", "civilisation", "architettura", "civiltà",
  "aedificium", "mores",
];

const queries = Object.fromEntries(
  CORPUS_LANGUAGES.map((l) => [l, QUESTION]),
) as Record<Language, string>;

function show(label: string, list: Candidate[]) {
  console.log(`\n${label}`);
  list.slice(0, 28).forEach((c, i) => {
    const mark = c.author.includes("Ruskin") ? " <<<" : "";
    const cross = c.crossScore === undefined ? "     " : c.crossScore.toFixed(3).padStart(6);
    console.log(
      `  ${String(i + 1).padStart(2)}. ${cross} ${c.author.slice(0, 22).padEnd(22)} ` +
        `${c.title.slice(0, 38).padEnd(38)} ${c.text.replace(/\s+/g, " ").slice(0, 54)}${mark}`,
    );
  });
  const ruskin = list.map((c, i) => ({ c, i })).filter((r) => r.c.author.includes("Ruskin"));
  console.log(
    `  Ruskin: ${ruskin.length} av ${list.length}` +
      (ruskin.length ? ` — platser ${ruskin.map((r) => r.i + 1).join(", ")}` : ""),
  );
}

const fusion = await hybridSearch({
  hypotheticalPassages: PASSAGES,
  keywords: KEYWORDS,
  queries,
  limit: 28,
  disableRerank: true,
});
show("UTAN CROSS-ENCODER (ren fusionsordning)", fusion);

const reranked = await hybridSearch({
  hypotheticalPassages: PASSAGES,
  keywords: KEYWORDS,
  queries,
  limit: 28,
});
show("MED CROSS-ENCODER (som appen kör)", reranked);
