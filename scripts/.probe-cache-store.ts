/** Saves a search, reads it back, and tries both cache paths. */
import { findCached, loadSearch, saveSearch, recentSearches } from "../src/lib/searches";
import { getDb } from "../src/lib/db";

const db = getDb();
const refs = (
  db
    .prepare("select id from chunks where is_front_matter = 0 order by id limit 3")
    .all() as { id: number }[]
).map((r, i) => ({ chunkId: r.id, relevance: `Motivering ${i + 1}.` }));

const PROMPT = "PROV — vad är det goda livet?";
const slug = await saveSearch(PROMPT, refs, 0.0731);
console.log("sparad som", slug);

const loaded = loadSearch(slug);
console.log("permalänk:", loaded?.prompt, "→", loaded?.passages.length, "stycken");
console.log("  första:", loaded?.passages[0].author, "—", loaded?.passages[0].title);
console.log("  källänk:", loaded?.passages[0].sourceUrl);

const exact = await findCached("  PROV — Vad är det goda livet?  ");
console.log("ordagrann träff (annan skiftning/blanksteg):", exact?.slug === slug ? "ja" : "NEJ");

const near = await findCached("PROV — vad är ett gott liv?");
console.log("semantisk träff:", near?.slug ?? "ingen");

const miss = await findCached("PROV — får staten begränsa individens frihet?");
console.log("ska INTE träffa:", miss?.slug ?? "ingen (rätt)");

console.log("senaste:", recentSearches(3).map((r) => r.prompt).join(" | "));

// Clean up after the test.
const row = db.prepare("select id from searches where slug = ?").get(slug) as { id: number };
db.prepare("delete from vec_searches where search_id = ?").run(BigInt(row.id));
db.prepare("delete from searches where id = ?").run(row.id);
console.log("provraden borttagen.");
