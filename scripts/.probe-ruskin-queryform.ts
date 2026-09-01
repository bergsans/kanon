/**
 * Step 3: why does the cross-encoder give EVERYTHING on this query zero?
 *
 * Step 2 gave the opposite result from what was expected: the three passages where Ruskin
 * actually says what the query claims — St Mark's Rest, Lamp of Memory, Nature of
 * Gothic — got 0.000–0.009, i.e. LOWER than an arbitrary Ruskin passage about
 * marble. A passage written to answer the query directly got 0.037. The numbers
 * aren't just low, they're collapsed: the README's reference for a working query is 0.685.
 *
 * The suspicion is the query's grammatical form. The user's input is a STATEMENT ("architecture
 * tells the truth about…"), not a question, and `expandQuery` translates the query but
 * doesn't rewrite it — so the statement goes straight into a model trained on mMARCO,
 * i.e. on search queries. Here the same passages are measured against the same content in five forms.
 */
import { scorePairs } from "../src/lib/rerank";

/** The forms. Same matter, different grammar. */
const FORMS: { label: string; q: string }[] = [
  { label: "sv påstående (som inmatat)", q: "arkitektur säger sanningen om en civilisation mer än vad den säger om sig själv" },
  { label: "sv fråga", q: "Vad avslöjar arkitekturen om en civilisation?" },
  { label: "sv nyckelord", q: "arkitektur civilisation vittnesbörd byggnadskonst folk" },
  { label: "en påstående", q: "architecture tells the truth about a civilisation more than what it says about itself" },
  { label: "en fråga", q: "What does a civilisation's architecture reveal about it?" },
  { label: "en nyckelord", q: "architecture nation character buildings testimony" },
];

/** The passages: two that answer, one that doesn't. */
const PASSAGES: { label: string; text: string }[] = [
  {
    label: "SVARAR   St Mark's Rest",
    text:
      "Great nations write their autobiographies in three manuscripts,--the book of their deeds, the book of their words, and the book of their art. Not one of these books can be understood unless we read the two others; but of the three the only trustworthy one is the last. The acts of a nation may be triumphant by its good fortune; and its words mighty by the genius of a few of its children: but its art, only by the general gifts and common sympathies of the race.",
  },
  {
    label: "SVARAR   Lamp of Memory",
    text:
      "How cold is all history, how lifeless all imagery, compared to that which the living nation writes, and the uncorrupted marble bears! How many pages of doubtful record might we not often spare, for a few stones left one upon another! There are but two strong conquerors of the forgetfulness of men, Poetry and Architecture; and the latter in some sort includes the former, and is mightier in its reality.",
  },
  {
    label: "SVARAR EJ Proserpina, om mossa",
    text:
      "The mosses, in their myriads, are the first mercy of the earth to the rock; they gather the dust of ages, and prepare in silence the bed of the flowers that are to come after them. Nor is there any part of the vegetable creation in which the perfectness of design is more constantly visible, or less constantly regarded.",
  },
];

console.log("stycke                          " + FORMS.map((f) => f.label.slice(0, 13).padStart(14)).join(""));
for (const p of PASSAGES) {
  const scores = await scorePairs(FORMS.map((f) => ({ query: f.q, passage: p.text })));
  console.log(p.label.padEnd(32) + scores.map((s) => s.toFixed(3).padStart(14)).join(""));
}

/**
 * Check that the model works at all in this run: the README's pair from
 * "does progress happen in history", where the Tylor passage measured 0.685.
 */
const control = await scorePairs([
  {
    query: "sker framsteg i historien?",
    passage:
      "The condition of the lower races, as compared with our own, is that of an earlier stage of civilization; and the study of savage tribes is the study of our own past. Progress in culture is the rule, degradation the exception, and the general movement of mankind has been from the savage to the civilized state.",
  },
  {
    query: "vad säger Kant om lögnen?",
    passage:
      "To be truthful (honest) in all declarations is therefore a sacred command of reason prescribing unconditionally, one not to be restricted by any conveniences. A lie always harms another; if not some other particular man, still it harms mankind generally.",
  },
]);
console.log(`\nkontroll att modellen fungerar i körningen:`);
console.log(`  Tylor mot "sker framsteg i historien?"   ${control[0].toFixed(3)}  (README: 0,685)`);
console.log(`  Kant mot "vad säger Kant om lögnen?"     ${control[1].toFixed(3)}`);
