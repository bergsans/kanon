/**
 * Why "does progress happen in history" doesn't surface Hegel, Schopenhauer, or Nietzsche.
 *
 * Candidate A is the plan Claude actually produced for the query; candidate B is the same
 * query written in German idealism's register. Same corpus, same chain, no
 * Claude call — the difference in outcome is then purely the expansion's merit or fault.
 */
import { hybridSearch, type Candidate } from "../src/lib/search";

const QUERIES = {
  sv: "Sker framsteg i historien, eller inte?",
  en: "Does progress occur in history, or does it not?",
};

/* Verbatim what expandQuery returned (see log): registers b and c pull toward
   ethnography and narrative, and the keywords are the prompt's own example words. */
const A = {
  keywords: [
    "progress",
    "the wheel of fortune",
    "decline and fall",
    "civilization",
    "rude nations",
    "savage",
    "manners",
    "corruption",
    "luxury",
    "perfectibility",
  ],
  hypotheticalPassages: [
    "The progress of society from rudeness to civility is not a straight ascent, but a course in which every acquisition of art and manners is purchased by the loss of some earlier virtue. Nations, having attained to opulence, decline into effeminacy; and the very refinements which distinguish the polished age prepare the corruption that overthrows it.",
    "Among the tribes of the interior we found no memory of any ancestor beyond the third generation, nor any tradition of a golden age. Their implements of stone differ little from those disinterred in the barrows of our own country; and the traveller who compares them perceives that the arts have everywhere advanced by the like stages.",
    "And is it your opinion, sir, that the world grows better? Nay, said he, I have seen too many winters. The son builds where the father burned, and the grandson burns again what was built; and the historian, who calls this progress, does but flatter the age that feeds him.",
  ],
};

/* The same query in the register it actually belongs to: world-spirit and dialectic,
   the will's blind repetition, the eternal recurrence, the course of the relations of production. */
const B = {
  keywords: [
    "world-spirit",
    "the Idea",
    "dialectic",
    "reason in history",
    "freedom",
    "the will",
    "eternal recurrence",
    "becoming",
    "the last man",
    "class struggle",
    "modes of production",
    "perfectibility",
    "cosmopolitan purpose",
    "necessity",
  ],
  hypotheticalPassages: [
    "The history of the world is none other than the progress of the consciousness of freedom; a progress whose necessity it is our business to comprehend. Spirit does not wander idly through the vicissitudes of time, but returns upon itself, and what appears as the fall of empires is the labour of the Idea attaining a fuller determination of its own essence.",
    "He who imagines that history advances has not looked upon it. The will objectifies itself in one generation as in another, and the misery of the species is neither increased nor diminished by the invention of engines. What we call the progress of the age is a change of masks upon the same suffering; the wheel turns, and turns again, and the spokes are men.",
    "How much has already been surmounted! Yet the historical sense, this new virtue of ours, is also a malady: we moderns, sated with the whole past, mistake our indigestion for advancement. There is no goal toward which the ages travel; there is only the eternal recurrence of the same, and the courage to will it once more.",
  ],
};

async function run(
  label: string,
  plan: { keywords: string[]; hypotheticalPassages: string[] },
) {
  const hits: Candidate[] = await hybridSearch({
    ...plan,
    queries: QUERIES,
    limit: 20,
  });
  console.log(`\n──── ${label} ────`);
  hits.forEach((c, i) =>
    console.log(
      `  ${String(i + 1).padStart(2)}. ${c.genre.padEnd(11)} ${c.author} — ${c.title.slice(0, 44)}`,
    ),
  );
  const authors = [...new Set(hits.map((h) => h.author))];
  console.log(`  författare: ${authors.join(", ")}`);
}

await run("A — planen Claude gav", A);
await run("B — samma fråga i idealismens register", B);
