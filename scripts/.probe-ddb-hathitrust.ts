/**
 * Are Deutsche Digitale Bibliothek and HathiTrust indexable?
 *
 *   pnpm tsx scripts/.probe-ddb-hathitrust.ts
 *
 * Both are reasonable to ask about. DDB is Germany's national aggregator, and
 * HathiTrust has seventeen million volumes, a large share of which are public domain —
 * more Western canon than Gutenberg, Litteraturbanken, and Perseus combined.
 *
 * Neither can be used, and the reasons differ. This script queries the sources
 * themselves instead of relying on memory, so the answer can be re-checked the day
 * something changes. Network calls only — no Claude, no tokens.
 *
 * WHAT THE APP ACTUALLY NEEDS, and what the yardstick below is: flowing, readable prose
 * from a whole work, fetchable without an agreement, with the rights status readable per
 * text. Page images aren't enough, metadata isn't enough, and word frequencies per page
 * aren't enough — the app answers with a passage someone is meant to read.
 */
const UA = "canon-indexer/0.1 (personal research project)";

interface Result {
  what: string;
  status: number | string;
  note: string;
}

async function probe(what: string, url: string, init?: RequestInit): Promise<Result> {
  try {
    const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...init?.headers } });
    const body = await res.text();
    return { what, status: res.status, note: summarize(body) };
  } catch (err) {
    return { what, status: "fel", note: err instanceof Error ? err.message.slice(0, 80) : "" };
  }
}

/** Trims a response down to what says something about access. */
function summarize(body: string): string {
  if (/Anubis|Making sure you're not a bot/i.test(body)) {
    return "proof-of-work-spärr (Anubis) — kräver JavaScript, ingen maskinväg";
  }
  if (/Just a moment|challenges\.cloudflare/i.test(body)) {
    return "Cloudflare-spärr — kräver webbläsare, ingen maskinväg";
  }
  const json = /^\s*[{[]/.test(body);
  if (json) {
    const name = /"name"\s*:\s*"([^"]+)"/.exec(body)?.[1];
    const message = /"message"\s*:\s*"([^"]+)"/.exec(body)?.[1];
    if (name || message) return `${name ?? ""}${message ? `: ${message}` : ""}`.slice(0, 96);
  }
  return body.replace(/\s+/g, " ").trim().slice(0, 96);
}

function report(title: string, rows: Result[], verdict: string[]): void {
  console.log(`\n${"═".repeat(72)}\n${title}\n${"═".repeat(72)}`);
  for (const r of rows) {
    console.log(`  ${String(r.status).padStart(5)}  ${r.what.padEnd(34)} ${r.note}`);
  }
  console.log("");
  for (const line of verdict) console.log(`  ${line}`);
}

// ── Deutsche Digitale Bibliothek ────────────────────────────────────────────
const ddb = [
  await probe("api /search", "https://api.deutsche-digitale-bibliothek.de/search?query=Nietzsche"),
  await probe("api /items", "https://api.deutsche-digitale-bibliothek.de/items/ITEMID"),
  await probe("webbplatsens api-sida", "https://www.deutsche-digitale-bibliothek.de/api"),
  await probe("oai-pmh Identify", "https://oai.deutsche-digitale-bibliothek.de/?verb=Identify"),
  await probe(
    "öppet tidningsindex",
    "https://api.deutsche-digitale-bibliothek.de/2/search/index/newspaper-issues/select?q=*:*&rows=1&wt=json",
  ),
];

// The open path exists, and that's exactly what settles the matter: the field is called
// `plainpagefulltext`, but the content is unread Fraktur OCR.
const sample = await fetch(
  "https://api.deutsche-digitale-bibliothek.de/2/search/index/newspaper-issues/select?q=*:*&rows=1&wt=json",
  { headers: { "User-Agent": UA } },
)
  .then((r) => r.json() as Promise<{ response?: { docs?: { plainpagefulltext?: string }[] } }>)
  .catch(() => null);
const ocr = sample?.response?.docs?.[0]?.plainpagefulltext ?? "";

report("Deutsche Digitale Bibliothek", ddb, [
  "DDB är en metadataaggregator, inte ett textarkiv. Objekten är skannade sidbilder",
  "hos sexhundra institutioner; DDB håller posten och miniatyren, inte verkets text.",
  "",
  "Tre vägar in, och ingen bär löpande prosa:",
  "  · /search och /items kräver API-nyckel, och lämnar även med nyckel ut metadata",
  "    och digitala objekt — inte verk som text.",
  "  · OAI-PMH är öppet men har bara metadataformaten edm, oai_dc och ddb.",
  "  · Tidningsindexet är öppet och har fulltext, men den är oläst frakturocr:",
  ocr ? `      "${ocr.replace(/\s+/g, " ").slice(0, 96)}…"` : "      (inget svar den här gången)",
  "",
  "Det är samma sorts text som Projekt Runeberg avvisar — den ser ut som språk utan",
  "att vara det — och tidningssidor är dessutom inte västerlandets kanon.",
  "",
  "Dessutom: DDB är tyskspråkig, och `Language` är \"en\" | \"sv\". Kanon på tyska",
  "kräver att chunkningens rubrikregler får ett tredje språk. Det är gjort på en",
  "eftermiddag — men först när det finns tysk text värd att chunka, och den finns",
  "inte här. Deutsches Textarchiv är den källan, inte DDB.",
]);

// ── HathiTrust ──────────────────────────────────────────────────────────────
const hathi = [
  await probe("bib-api (metadata)", "https://catalog.hathitrust.org/api/volumes/brief/oclc/424023.json"),
  await probe("babel: läsvyn", "https://babel.hathitrust.org/cgi/pt?id=uc1.b4405602"),
  await probe("babel: sidtext", "https://babel.hathitrust.org/cgi/imgsrv/html?id=mdp.39015004977293;seq=20"),
  await probe("data-api", "https://babel.hathitrust.org/cgi/htd/volume/pageimage/mdp.39015004977293/20"),
  await probe("robots.txt", "https://babel.hathitrust.org/robots.txt"),
];

report("HathiTrust", hathi, [
  "Bib-API:t svarar, och det är det enda som gör det. Det lämnar ut katalogpost och",
  "rättighetskod per band (`rightsCode`, `usRightsString`) — uppgifter *om* en text,",
  "aldrig texten.",
  "",
  "Allt som skulle kunna ge text ligger bakom babel.hathitrust.org, och den svarar",
  "403 på varje maskinanrop. Data-API:t — den avsedda vägen till sidtext — kräver",
  "nycklar som delas ut till medlemsinstitutioner efter avtal, inte till en enskild",
  "utvecklare. Den fritt nedladdbara härledningen, HTRC Extracted Features, är",
  "ordfrekvenser per sida: den kan säga att ordet 'frihet' står nio gånger på sidan,",
  "men inte återge meningen det står i. Appen svarar med ett stycke, så det är",
  "obrukbart här.",
  "",
  "Att gå runt spärren är inte ett alternativ. Det vore att kringgå en åtkomstkontroll",
  "för att komma åt texter vars rättighetsläge HathiTrust själva bedömer band för band",
  "— alltså precis den gräns `marxists.ts` finns för att inte överträda.",
  "",
  "Det HathiTrust har som är fritt och som appen skulle vilja ha finns dessutom nästan",
  "alltid hos Gutenberg redan, i korrekturläst form i stället för som ocr.",
]);

console.log(`\n${"─".repeat(72)}`);
console.log("Slutsats: ingen av de två går att indexera. Perseus, som prövades samtidigt,");
console.log("gör det — se scripts/.probe-perseus.ts och scripts/build-corpus-perseus.ts.");
