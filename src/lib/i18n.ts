/**
 * The UI's two languages.
 *
 * The collection is nine-tenths English and the question is asked in Swedish
 * — that is the app's central tension, and it stays. What gets localized here
 * is the *shell*: buttons, headings, error messages, the cost line. Claude's
 * rationales still come in Swedish, and the translate button still translates
 * into Swedish. Localizing them would require keying the cache on language
 * too — otherwise a Swedish rationale gets served to an English session — and
 * that is a change to the pipeline, not to the UI.
 *
 * The module is deliberately isomorphic: it's imported by server components,
 * by route handlers, and by client components. Cookie reading therefore lives
 * in `i18n-server.ts`, not here.
 */

export type Locale = "sv" | "en";

export const LOCALES: readonly Locale[] = ["sv", "en"];

/**
 * Swedish is the default, not English. The app is built for a Swedish
 * question, and someone arriving without a cookie should meet the intended view.
 */
export const DEFAULT_LOCALE: Locale = "sv";

/** The cookie the language choice lives in. Read on the server, written by `setLocale`. */
export const LOCALE_COOKIE = "canon-locale";

/** The language's own name in the switcher — never translated, that's the whole point. */
export const LOCALE_NAME: Record<Locale, string> = {
  sv: "Svenska",
  en: "English",
};

/**
 * Number formatting follows the UI language, not the server's.
 *
 * en-GB, not en-US: the app counts in kronor and writes dates ISO-like, and
 * American number formatting would drag along an expectation of American
 * units that nothing else in the app fulfils. It still gets a decimal point —
 * that's the difference that matters when the same figure appears in two
 * language versions of the same table.
 */
const NUMBER_LOCALE: Record<Locale, string> = {
  sv: "sv-SE",
  en: "en-GB",
};

export function isLocale(value: unknown): value is Locale {
  return value === "sv" || value === "en";
}

/** The BCP 47 tag for `toLocaleString` and `<html lang>`. */
export function bcp47(locale: Locale): string {
  return NUMBER_LOCALE[locale];
}

export function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(NUMBER_LOCALE[locale]);
}

/**
 * The example questions under the search box.
 *
 * Translated, not just transcribed: the question goes to Claude, which
 * expands it against an English collection, so an English question works
 * just as well. But they need to be the *same* questions in both languages —
 * the list is a demonstration of what the collection answers well, and it
 * shouldn't become a different demonstration because someone switched language.
 */
export const EXAMPLE_QUESTIONS: Record<Locale, string[]> = {
  sv: [
    "Vad är det goda livet?",
    "Civilisation kontra barbari",
    "Får staten begränsa individens frihet?",
    "Ångesten inför den egna friheten",
    "Är makt viktigare än moral för en furste?",
    "Vad händer med själen efter döden?",
  ],
  en: [
    "What is the good life?",
    "Civilisation against barbarism",
    "May the state limit individual liberty?",
    "The dread of one's own freedom",
    "Does a prince need power more than morals?",
    "What becomes of the soul after death?",
  ],
};

const sv = {
  "app.name": "Kanon",
  "app.tagline": "sök i västerlandets kanon",
  "meta.description":
    "Ställ en fråga på svenska och få tillbaka de stycken ur kanon som utforskar den.",
  "meta.saved": "{prompt} — Kanon",
  "meta.missing": "Sökningen finns inte — Kanon",
  "meta.corpus": "Samlingen — Kanon",
  "meta.corpusDescription":
    "Varje verk som är indexerat och sökbart, ordnat efter ämne och författarnamn, med länk till utgåvan hos källan.",
  "meta.projects": "Projekt — Kanon",
  "meta.projectsDescription":
    "Essäer under arbete: de stycken du behållit ur dina sökningar, med frågan de kom ur och dina egna anteckningar.",
  "meta.project": "{title} — Kanon",
  "meta.projectMissing": "Projektet finns inte — Kanon",
  "meta.costs": "Kostnader — Kanon",
  "meta.costsDescription":
    "Notan summerad över hela arkivet, steg för steg och post för post — samma uppdelning som en enskild frågas kostnadsruta visar.",
  "meta.searches": "Sökningar — Kanon",
  "meta.searchesDescription":
    "Varje sparad sökning, filtrerbar på frågans text och på modellen som svarade.",

  "home.intro":
    "Ställ en fråga. Appen letar upp de stycken ur västerlandets kanon som bär på ett svar — filosofi och politisk teori, men också historia, antropologi, drama, epos, roman och heliga skrifter.",
  "home.stats": "{works} verk · {authors} författare · {genres} genrer",
  "home.notIndexedBefore": "samlingen är inte indexerad ännu. Kör",
  "home.notIndexedAfter": "i projektmappen.",

  "footer.sources":
    "Texterna kommer ur öppna arkiv och läses i sin helhet hos dem:",
  "footer.corpus": "Se hela samlingen",
  "footer.projects": "Dina projekt",

  "year.bc": "{year} f.Kr.",
  "year.ad": "{year}",
  "year.bce": "{year} f.v.t.",
  "year.ce": "{year} e.v.t.",
  // "d." for "död" (died) — the year the metadata row, the collection
  // listing and the neighbor rows all show is the author's year of death,
  // never the work's own date (see `CanonWork.year` in taxonomy.ts). Wraps
  // the already-formatted `era()`/`year()` string, not the raw number — the
  // era suffix above still belongs inside it.
  "year.death": "d. {year}",
  // The Gutenberg catalogue writes 0 when it simply has no death year —
  // Sappho's two renderings, six Malory entries. See `isUnknownYear` in
  // i18n.ts for why this exists at all.
  "year.unknown": "okänt årtal",

  "nav.allQuestions": "alla frågor",
  "nav.corpus": "se hela samlingen",
  "nav.search": "till sökningen",
  "nav.projects": "dina projekt",
  "nav.menu": "meny",
  "nav.close": "stäng menyn",
  "nav.menuSearch": "Sök i Kanon",
  "nav.menuSearches": "Tidigare sökningar",
  "nav.menuCorpus": "Se hela samlingen",
  "nav.menuProjects": "Dina projekt",
  "nav.menuCosts": "Kostnader",
  "saved.when": "Sparad sökning · {date}",

  "corpus.heading": "Samlingen",
  "corpus.intro":
    "Varje verk som är indexerat och sökbart, ordnat efter ämne och därunder efter författarnamn. Titeln länkar till utgåvan hos källan — det är den texten styckena är hämtade ur.",
  "corpus.totals": "{works} verk · {authors} författare",
  "corpus.jump": "Hoppa till en grupp",
  "corpus.groupBy.ariaLabel": "Gruppera samlingen",
  "corpus.groupBy.genre": "Ämne",
  "corpus.groupBy.era": "Epok",
  "corpus.groupBy.letter": "Författare",
  "corpus.eraTimeline.ariaLabel": "Tidslinje över epoker",
  "textSize.label": "Textstorlek",
  "textSize.sm": "Liten text",
  "textSize.md": "Normal textstorlek",
  "textSize.lg": "Stor text",
  "corpus.distributionHeading": "Fördelning",
  "corpus.sourcesHeading": "Källor",
  "corpus.genresHeading": "Ämnen",
  "corpus.works_one": "{count} verk",
  "corpus.works_other": "{count} verk",
  "corpus.authors_one": "{count} författare",
  "corpus.authors_other": "{count} författare",
  "corpus.filter.placeholder": "Filtrera på författare eller titel …",
  "corpus.filter.ariaLabel": "Filtrera samlingen",
  "corpus.filter.clear": "Rensa filtret",
  "corpus.filter.matches_one": "{count} träff",
  "corpus.filter.matches_other": "{count} träffar",
  "corpus.filter.none":
    "Inget i samlingen matchar det filtret. Namn stavas som källan stavar dem — prova ett kortare utdrag.",
  "corpus.yearNote":
    "Årtalet (”d.” för död) är författarens dödsår, för hela samlingen — katalogerna saknar tillkomstår för verket självt. Det räcker för epokindelning och kronologi, men det är ingen utgivningsuppgift att citera.",

  "stats.erasHeading": "Epoker",
  "stats.languagesHeading": "Språk",
  "stats.usageHeading": "Användning",
  "stats.searchesHeading": "Sökningar",
  "stats.searches_one": "{count} sparad sökning",
  "stats.searches_other": "{count} sparade sökningar",
  "stats.spent": "{amount} sammanlagt",
  "stats.localSearches_one": "{count} av dem lokal, kostar ingenting",
  "stats.localSearches_other": "{count} av dem lokala, kostar ingenting",
  "stats.savedByCache_one":
    "{amount} sparat av cachen — {count} fråga fick ett gratis svar",
  "stats.savedByCache_other":
    "{amount} sparat av cachen — {count} frågor fick ett gratis svar",
  "stats.noSearches": "Inga sökningar sparade ännu.",
  "stats.projectsHeading": "Projekt",
  "stats.projects_one": "{count} projekt",
  "stats.projects_other": "{count} projekt",
  "stats.passages_one": "{count} sparat stycke",
  "stats.passages_other": "{count} sparade stycken",
  "stats.noProjects": "Inga projekt ännu.",
  "stats.translationsHeading": "Översättningar",
  "stats.translations_one": "{count} översatt stycke",
  "stats.translations_other": "{count} översatta stycken",
  "stats.noTranslations": "Inga stycken översatta ännu.",

  "costs.heading": "Kostnader",
  "costs.intro":
    "Notan summerad över hela arkivet, steg för steg och post för post — samma uppdelning som en enskild frågas kostnadsruta visar (se informationsikonen bredvid en fråga), men över alla sparade sökningar och översättningar i stället för en.",
  "costs.stepHeading": "Per steg i kedjan",
  "costs.lineHeading": "Per posttyp",
  "costs.total": "Totalt",
  "costs.noData": "Inga kostnader sparade ännu.",
  "costs.tokens_one": "{count} token",
  "costs.tokens_other": "{count} token",

  "searches.heading": "Sökningar",
  "searches.intro":
    "Varje sparad sökning, nyast till äldst och filtrerbar på frågans text och på modellen som svarade. ”Senast ställda frågor” i marginalen visar bara de sex senaste — det här är hela arkivet.",
  "searches.filter.placeholder": "Filtrera på frågans text …",
  "searches.filter.ariaLabel": "Filtrera sökningarna",
  "searches.filter.none":
    "Inget i arkivet matchar det filtret. Prova ett kortare utdrag av frågan.",
  "searches.modelFilter.label": "Modell",
  "searches.modelFilter.all": "alla modeller",

  "notfound.genericTitle": "Den här sidan finns inte.",
  "notfound.genericBody":
    "Adressen matchar ingenting i appen. Frågan går att ställa här —",
  "notfound.title": "Sökningen finns inte kvar.",
  "notfound.body":
    "Länken pekar på en sparad sökning som tagits bort, eller vars stycken försvunnit ur samlingen sedan den kördes. Frågan går att ställa igen —",
  "notfound.link": "sökrutan står på startsidan",
  "notfound.projectTitle": "Projektet finns inte kvar.",
  "notfound.projectBody":
    "Länken pekar på ett projekt som tagits bort. De stycken det innehöll finns kvar i samlingen —",
  "notfound.projectLink": "se dina övriga projekt",

  // The label above the search box in the register direction — the first
  // of the row of section eyebrows (see also "examples.label",
  // "recent.heading") that mark where one part of the page ends and the
  // next begins, now that the ruled hairline after each carries that
  // weight instead of spacing alone.
  "search.eyebrow": "Ställ en fråga",
  "search.placeholder":
    "Ställ en fråga — t.ex. om människan styrs av sitt förnuft eller sitt begär…",
  "search.ariaQuestion": "Din fråga",
  "search.submit": "Sök",
  "search.submitBusy": "Söker…",
  "search.tooShort": "Frågan är för kort (minst {min} tecken).",
  "search.estimateClaude": "{model} · {duration} · ≈ {amount}",
  "search.estimateClaudeNoHistory": "{model} · {duration}",
  "search.estimateLocal": "{model} · {duration} · kostar ingenting",

  // The "utanför samlingen" checkbox under the search box — see
  // `findExternal` in claude.ts. Off by default and shown in the same
  // register as the rest of the form, not as a warning: checking it is a
  // deliberate choice to pay for a live web search, not a risk to flag.
  "external.checkbox": "Inkludera källor utanför samlingen",
  "external.checkboxHint":
    "Söker med Claude på webben (t.ex. Marxists Internet Archive) efter texter samlingens rättighetskontroller hållit ute. Kostar extra och tar längre tid.",
  "external.heading": "Utanför samlingen",
  "external.explain":
    "Dessa sidor ligger hos andra arkiv och ingår inte i samlingen, oftast för att deras upphovsrätt inte går att fastställa. Länken leder dit — texten citeras eller sparas aldrig här.",
  "external.loading": "Söker utanför samlingen…",
  "external.empty": "Inget utanför samlingen hittades.",
  "external.cost": "Extern sökning: {amount}",

  "subjects.label": "Ämne",
  "subjects.all": "alla ämnen",
  "subjects.selected": "sökt i {list}",

  "eras.label": "Epok",
  "eras.all": "alla epoker",

  // The heading says *examples* and not "questions": the row used to sit
  // unlabeled below the selectors and was read as previous searches.
  "examples.label": "Exempelfrågor",

  "phase.expanding": "Tolkar frågan…",
  "phase.retrieving": "Söker igenom samlingen…",
  // {count} is the works, {passages} the candidates — the plural follows the
  // works because the passages are never one.
  "phase.reading_one":
    "Läser {passages} stycken ur {count} verk och väljer ut dem som svarar…",
  "phase.reading_other":
    "Läser {passages} stycken ur {count} verk och väljer ut dem som svarar…",
  "phase.cancel": "Avbryt",

  "result.errorTitle": "Något gick fel",
  "result.declinedTitle": "Frågan avvisades",
  "result.serverSaid": "Servern svarade {status}.",
  "result.streamEnded":
    "Anslutningen bröts innan svaret var klart. Försök igen.",
  "result.unknownError":
    "Ett oväntat fel inträffade. Kontrollera anslutningen och försök igen.",
  "result.empty":
    "Inga stycken i samlingen matchade frågan. Pröva att omformulera den.",
  // Two messages and not one: someone who searched within a single subject
  // should learn the restriction may be the reason, instead of assuming the
  // collection is simply empty of answers.
  "result.emptyFiltered":
    "Inga stycken inom {list} matchade frågan. Pröva att omformulera den, eller att vidga urvalet.",
  "result.count_one": "{count} utvalt stycke",
  "result.count_other": "{count} utvalda stycken",
  "result.duration": "tog {duration}",
  "result.editQuestion": "Redigera frågan",
  "result.corpusGrown_one":
    "Samlingen har vuxit med {count} verk sedan svaret togs fram.",
  "result.corpusGrown_other":
    "Samlingen har vuxit med {count} verk sedan svaret togs fram.",
  "result.searchAgain": "Sök på nytt",
  "result.searchAgainWithPrice": "Sök på nytt (≈ {amount})",
  "result.cachedPrompt": "Svar ur arkivet på frågan ”{prompt}”.",
  "sort.label": "Sortering",
  "sort.relevance": "relevans",
  "sort.chronological": "kronologiskt",

  "passage.translate": "Översätt till svenska",
  "passage.translateEstimate": "≈ {amount}",
  "passage.translateEstimateTitle":
    "Genomsnittet av tidigare översättningar, inte priset för just det här stycket.",
  "passage.translating": "Översätter…",
  "passage.showOriginal": "Visa originalet",
  "passage.showTranslation": "Visa översättningen",
  "passage.machineTranslated":
    "Maskinöversatt av Claude — originalet är ett klick bort.",
  "passage.showContext": "Visa i sammanhang",
  "passage.copyQuote": "Kopiera citat",
  "passage.quoteCopied": "Citat kopierat",
  "passage.translatedBy": "övers. {name}",
  "passage.sourceFallback": "Källan",
  "passage.translateFailed": "Kunde inte översätta stycket.",
  "passage.more": "Mer …",

  "similar.heading": "Fler som denna",
  "similar.searching": "Söker…",
  "similar.free": "söker lokalt i vektorindexet, kostar ingenting",
  "similar.none": "Inga liknande stycken utanför det egna verket.",
  "similar.failed": "Kunde inte hämta liknande stycken.",

  "work.heading": "Fler ur detta verk",
  "work.searching": "Läser verket…",
  "work.free": "poängsätts lokalt, kostar ingenting",
  "work.none": "Inga fler stycken ur verket svarar på frågan.",
  "work.failed": "Kunde inte hämta fler stycken ur verket.",

  "project.save": "Spara i projekt",
  "project.saved": "Sparat",
  "project.chooseHeading": "Spara i",
  "project.newPlaceholder": "Nytt projekt…",
  "project.create": "Skapa",
  "project.creating": "Skapar…",
  "project.none": "Inga projekt ännu. Skriv ett namn för att skapa det första.",
  "project.saveFailed": "Kunde inte spara stycket.",
  "project.heading": "Projekt",
  "project.intro":
    "Ett projekt är en essä under arbete: styckena du behöll ur dina sökningar, i den ordning du hittade dem, var och en med frågan den kom ur och din egen anteckning.",
  "project.listEmpty":
    "Inga projekt ännu. Ett projekt skapas där du sparar ditt första stycke — knappen står i varje stycke i en träfflista.",
  "project.count_one": "{count} stycke",
  "project.count_other": "{count} stycken",
  "project.created": "Påbörjat {date}",
  "project.empty":
    "Projektet är tomt. Spara ett stycke ur en träfflista, så hamnar det här.",
  "project.fromSearch": "ur frågan ”{prompt}”",
  "project.note": "Anteckning",
  "project.notePlaceholder": "Varför sparade du det här?",
  "project.noteSave": "Spara anteckningen",
  "project.noteSaving": "Sparar…",
  "project.noteSaved": "Sparad",
  "project.remove": "Ta bort ur projektet",
  "project.delete": "Ta bort projektet",
  "project.deleteConfirm":
    "Ta bort projektet och alla anteckningar i det? Styckena finns kvar i samlingen.",
  // Description and tags are not set when the project is created — that
  // moment has only a name to give — but afterwards, on the project's own page.
  "project.edit": "Redigera",
  "project.editSave": "Spara",
  "project.editSaving": "Sparar…",
  "project.editCancel": "Avbryt",
  "project.editFailed": "Kunde inte spara ändringarna.",
  "project.titlePlaceholder": "Projektets namn",
  "project.descriptionPlaceholder": "En kort beskrivning av projektet…",
  "project.tagsPlaceholder": "Lägg till en tagg, Enter för att spara",
  "project.tagsRemove": "Ta bort taggen {tag}",
  // The number is surfaced in the UI rather than hidden: a project that
  // silently shrinks is discovered only when the essay is being written.
  "project.lost_one":
    "{count} sparat stycke går inte längre att visa — verket har indexerats om sedan det sparades. Anteckningen finns kvar längst ned.",
  "project.lost_other":
    "{count} sparade stycken går inte längre att visa — verken har indexerats om sedan de sparades. Anteckningarna finns kvar längst ned.",
  "project.lostHeading_one": "Förlorat stycke",
  "project.lostHeading_other": "Förlorade stycken",
  "project.lostNoNote": "Ingen anteckning skriven.",

  "context.readEarlier": "↑ Läs tidigare",
  "context.readOn": "↓ Läs vidare",
  "context.loading": "Hämtar…",
  "context.title": "Stycket i sitt sammanhang",
  "context.failed": "Kunde inte hämta sammanhanget.",

  "cost.subjectQuestion": "frågan",
  "cost.subjectTranslation": "översättningen",
  "cost.fromArchive": "· ur arkivet",
  "cost.local": "lokal modell · kostar ingenting",
  // The second half of `cost.local` alone, for a row that already names
  // the model elsewhere — `/sokningar`'s own list, for one.
  "cost.free": "kostar ingenting",
  "cost.ariaBreakdown": "Vad {subject} kostade — visa posterna",
  "cost.heading": "Vad {subject} kostade",
  "cost.subheading": "Token debiterade hos Anthropic, post för post.",
  "cost.cachedWithLines":
    "Den här förfrågan kostade ingenting — svaret fanns redan i arkivet. Posterna nedan är vad det kostade att räkna fram första gången, {amount}.",
  "cost.cachedWithoutLines":
    "Den här förfrågan kostade ingenting — svaret fanns redan i arkivet. Att räkna fram det kostade {amount}.",
  "cost.noBreakdownCached":
    "Uppdelningen sparades inte för den här sökningen — bara summan.",
  "cost.noBreakdown":
    "Uppdelningen sparades inte för den här sökningen — bara summan, {amount}.",
  "cost.colLine": "post",
  "cost.colTokens": "token",
  "cost.colPerMillion": "$/Mtok",
  "cost.colCost": "kostnad",
  "cost.colSek": "kronor",
  "cost.stepTotal": "summa {step}",
  "cost.total": "Totalt",
  "cost.thinkingNote":
    "Tänkandet debiteras som utmatning och syns inte i svaret: ett steg som skriver 250 token synlig JSON kan debiteras trippelt så mycket. Cacheläsning kostar en tiondel av inmatningspriset, cacheskrivning tjugofem procent extra — priset per post står i tabellen.",
  "cost.rateNote": "Kronbeloppen är omräknade till {rate} kr per dollar.",

  // The steps and lines are written by the server and stored in the database
  // in Swedish. They are therefore translated on display, not on write — an
  // old row should be readable in both language versions without anyone
  // touching the database.
  "cost.step.frågeexpansion": "frågeexpansion",
  "cost.step.omrankning": "omrankning",
  "cost.step.översättning": "översättning",
  "cost.line.inmatning": "inmatning",
  "cost.line.utmatning": "utmatning",
  "cost.line.cacheläsning": "cacheläsning",
  "cost.line.cacheskrivning": "cacheskrivning",

  // Short explanations for the cost page's lines — same keys as above, one
  // level deeper. Only the steps and line types the server actually writes
  // have a text; an unfamiliar name shows no explanation rather than a guessed one.
  "cost.step.frågeexpansion.desc":
    "Claude skriver nio hypotetiska stycken och nyckelord som breddar frågan till samlingens språk innan sökningen.",
  "cost.step.omrankning.desc":
    "Claude läser de bästa styckena och skriver motiveringen som visas med svaret.",
  "cost.step.översättning.desc":
    "Ett sparat stycke översatt till svenska på begäran.",
  "cost.line.inmatning.desc":
    "Text skickad till modellen: frågan, kandidatstyckena eller texten som ska översättas.",
  "cost.line.utmatning.desc":
    "Svaret modellen skriver, tänkande inräknat — ofta den största posten på notan.",
  "cost.line.cacheläsning.desc":
    "Systemprompten återanvänd ur cache, en tiondel av priset för vanlig inmatning.",
  "cost.line.cacheskrivning.desc":
    "Systemprompten sparad i cache i fem minuter, en fjärdedel dyrare men bara första gången.",

  "export.label": "Exportera",
  "export.copied": "Kopierat",
  "export.markdown": "Kopiera som Markdown",
  "export.markdownNote_one": "{count} stycke med motivering",
  "export.markdownNote_other": "{count} stycken med motivering",
  "export.downloadMd": "Ladda ned som .md",
  "export.bibtex": "Verken som BibTeX",
  "export.bibtexNote": "ett verk per post, inte ett stycke",
  "export.ris": "Verken som RIS",

  "recent.heading": "Senast ställda frågor",
  "recent.count_one": "{count} stycke",
  "recent.count_other": "{count} stycken",
  "recent.remove": "Ta bort sökningen ”{prompt}”",
  "recent.removeTitle": "Ta bort sökningen",

  "locale.label": "Språk",

  "provider.label": "Modell",
  "provider.claude": "Claude",
  "provider.local": "Lokal ({model})",
  // Ollama serves these on the machine running the app, always localhost
  // (see CANON_OLLAMA_URL in .env.example) — a different kind of "local"
  // than the group below.
  "provider.onDevice": "På den här datorn",
  // The OPENAI_MODELS entries (provider.ts) speak to mlx-serve, which
  // .env.example notes "usually runs on another machine on the network" —
  // still free and still local in the sense that matters (no API cost, no
  // data leaving the network), but not on this device.
  "provider.onNetwork": "Via det lokala nätverket",
  "provider.localWarning":
    "Experimentell: körs på din egen maskin, är långsammare och mindre träffsäker än Claude.",
  "provider.durationMeasured": "~{duration}, fråga till svar",
  "provider.durationUnmeasured": "tid ej mätt",

  "effort.label": "Noggrannhet",
  "effort.medium": "Grundlig",
  "effort.low": "Snabb",
  "effort.claudeOnly":
    "Gäller bara Claudes omrankning — lokala modeller påverkas inte.",

  "common.close": "Stäng",

  "citation.translatedBy": "övers. {name}",
  "citation.retrieved": "hämtad {date}",
  "citation.subtitle_one":
    "Canon, {date} — {count} stycke ur västerlandets kanon.",
  "citation.subtitle_other":
    "Canon, {date} — {count} stycken ur västerlandets kanon.",
  "citation.projectSubtitle_one":
    "Canon, {date} — {count} sparat stycke ur västerlandets kanon.",
  "citation.projectSubtitle_other":
    "Canon, {date} — {count} sparade stycken ur västerlandets kanon.",
  "citation.fromQuestion": "Ur frågan: {prompt}",
  "citation.note": "Anteckning:",
  "citation.deathNote":
    "Författaren död {year}; utgivningsår saknas i källkatalogen",

  "api.invalidJson": "Ogiltig JSON i förfrågan.",
  "api.emptyPrompt": "Tom fråga.",
  "api.promptTooLong": "Frågan är för lång (max {max} tecken).",
  "api.badChunkId": "chunkId saknas eller är ogiltigt.",
  "api.chunkNotFound": "Stycket hittades inte.",
  "api.badWork": "slug eller workId saknas.",
  "api.searchNotFound": "Sökningen hittades inte i arkivet.",
  "api.unknownError": "Okänt fel",
  "api.notIndexed":
    "Samlingen är inte indexerad ännu. Kör `pnpm ingest` i projektmappen och försök igen.",

  "error.pageTitle": "Något gick sönder",
  "error.pageBody":
    "Sidan kunde inte visas. Databasen kan vara låst eller mitt i en ombyggnad — ett nytt försök löser det oftast.",
  "error.retry": "Försök igen",

  "claude.badKey":
    "Claude avvisade API-nyckeln. Kontrollera ANTHROPIC_API_KEY i .env.local.",
  "claude.rateLimited":
    "Claude är hastighetsbegränsad just nu. Försök igen om en stund.",
  "claude.overloaded":
    "Claude är överbelastad just nu. Försök igen om en stund.",
  "claude.apiError": "Claude svarade med fel {status}: {message}",
  "claude.truncated":
    "Svaret tog slut innan det var färdigskrivet. Försök igen, eller ställ en smalare fråga.",
  "claude.refused": "Claude avböjde att svara på frågan.",
  "claude.outOfScope":
    "Frågan verkar inte höra hemma i samlingen. Canon svarar på frågor till västerlandets kanon — filosofi, historia, politik, drama, dikt och liknande — inte till exempel räkneuppgifter eller kodfrågor.",
};

/**
 * The dictionary is typed off the Swedish one: a key missing from `en`, or
 * one that only exists there, is a compile error. `pnpm typecheck` is the
 * house's only automated check, and this is the only way to let it guard the
 * translations.
 */
export type Key = keyof typeof sv;
type Dict = Record<Key, string>;

const en: Dict = {
  "app.name": "Canon",
  "app.tagline": "search the Western canon",
  "meta.description":
    "Ask a question and get back the passages from the Western canon that actually carry an answer.",
  "meta.saved": "{prompt} — Canon",
  "meta.missing": "No such search — Canon",
  "meta.corpus": "The collection — Canon",
  "meta.corpusDescription":
    "Every work that is indexed and searchable, ordered by subject and author name, each linked to its edition at the source.",
  "meta.projects": "Projects — Canon",
  "meta.projectsDescription":
    "Essays in progress: the passages you kept from your searches, with the question they came from and your own notes.",
  "meta.project": "{title} — Canon",
  "meta.projectMissing": "No such project — Canon",
  "meta.costs": "Costs — Canon",
  "meta.costsDescription":
    "The bill summed across the whole archive, step by step and line by line — the same breakdown a single question's cost box shows.",
  "meta.searches": "Searches — Canon",
  "meta.searchesDescription":
    "Every saved search, filterable by the question's text and by the model that answered.",

  "home.intro":
    "Ask a question. The app finds the passages of the Western canon that actually carry an answer — philosophy and political theory, but also history, anthropology, drama, epic, the novel and sacred writings.",
  "home.stats": "{works} works · {authors} authors · {genres} genres",
  "home.notIndexedBefore": "The corpus has not been indexed yet. Run",
  "home.notIndexedAfter": "in the project directory.",

  "footer.sources":
    "The texts come from open archives, and can be read there in full:",
  "footer.corpus": "See the whole collection",
  "footer.projects": "Your projects",

  "year.bc": "{year} BC",
  "year.ad": "{year}",
  "year.bce": "{year} BCE",
  "year.ce": "{year} CE",
  "year.death": "d. {year}",
  "year.unknown": "year unknown",

  "nav.allQuestions": "all questions",
  "nav.corpus": "see the whole collection",
  "nav.search": "to the search",
  "nav.projects": "your projects",
  "nav.menu": "menu",
  "nav.close": "close menu",
  "nav.menuSearch": "Search Canon",
  "nav.menuSearches": "All searches",
  "nav.menuCorpus": "See the whole collection",
  "nav.menuProjects": "Your projects",
  "nav.menuCosts": "Costs",
  "saved.when": "Saved search · {date}",

  "corpus.heading": "The collection",
  "corpus.intro":
    "Every work that is indexed and searchable, ordered by subject and, within it, by author name. The title links to the edition at its source — that is the text the passages are taken from.",
  "corpus.totals": "{works} works · {authors} authors",
  "corpus.jump": "Jump to a group",
  "corpus.groupBy.ariaLabel": "Group the collection",
  "corpus.groupBy.genre": "Subject",
  "corpus.groupBy.era": "Era",
  "corpus.groupBy.letter": "Author",
  "corpus.eraTimeline.ariaLabel": "Timeline of eras",
  "textSize.label": "Text size",
  "textSize.sm": "Small text",
  "textSize.md": "Normal text size",
  "textSize.lg": "Large text",
  "corpus.distributionHeading": "Distribution",
  "corpus.sourcesHeading": "Sources",
  "corpus.genresHeading": "Subjects",
  "corpus.works_one": "{count} work",
  "corpus.works_other": "{count} works",
  "corpus.authors_one": "{count} author",
  "corpus.authors_other": "{count} authors",
  "corpus.filter.placeholder": "Filter by author or title …",
  "corpus.filter.ariaLabel": "Filter the collection",
  "corpus.filter.clear": "Clear the filter",
  "corpus.filter.matches_one": "{count} match",
  "corpus.filter.matches_other": "{count} matches",
  "corpus.filter.none":
    "Nothing in the collection matches that filter. Names are spelled as the source spells them — try a shorter fragment.",
  "corpus.yearNote":
    'The year ("d." for died) is the author\'s year of death, across the whole collection — the catalogues carry no date of composition for the work itself. It is enough for periodisation and chronology, but it is not a publication date to cite.',

  "stats.erasHeading": "Eras",
  "stats.languagesHeading": "Languages",
  "stats.usageHeading": "Usage",
  "stats.searchesHeading": "Searches",
  "stats.searches_one": "{count} saved search",
  "stats.searches_other": "{count} saved searches",
  "stats.spent": "{amount} spent in total",
  "stats.localSearches_one": "{count} of them local, cost nothing",
  "stats.localSearches_other": "{count} of them local, cost nothing",
  "stats.savedByCache_one":
    "{amount} saved by the cache — {count} question got a free answer",
  "stats.savedByCache_other":
    "{amount} saved by the cache — {count} questions got a free answer",
  "stats.noSearches": "No searches saved yet.",
  "stats.projectsHeading": "Projects",
  "stats.projects_one": "{count} project",
  "stats.projects_other": "{count} projects",
  "stats.passages_one": "{count} saved passage",
  "stats.passages_other": "{count} saved passages",
  "stats.noProjects": "No projects yet.",
  "stats.translationsHeading": "Translations",
  "stats.translations_one": "{count} translated passage",
  "stats.translations_other": "{count} translated passages",
  "stats.noTranslations": "No passages translated yet.",

  "costs.heading": "Costs",
  "costs.intro":
    "The bill summed across the whole archive, step by step and line by line — the same breakdown a single question's cost box shows (the info icon next to a question), but over every saved search and translation instead of one.",
  "costs.stepHeading": "By pipeline step",
  "costs.lineHeading": "By line type",
  "costs.total": "Total",
  "costs.noData": "No costs recorded yet.",
  "costs.tokens_one": "{count} token",
  "costs.tokens_other": "{count} tokens",

  "searches.heading": "Searches",
  "searches.intro":
    "Every saved search, newest to oldest and filterable by the question's text and by the model that answered. “Recent questions” in the margin only shows the last six — this is the whole archive.",
  "searches.filter.placeholder": "Filter by the question's text …",
  "searches.filter.ariaLabel": "Filter the searches",
  "searches.filter.none":
    "Nothing in the archive matches that filter. Try a shorter fragment of the question.",
  "searches.modelFilter.label": "Model",
  "searches.modelFilter.all": "all models",

  "notfound.genericTitle": "This page doesn't exist.",
  "notfound.genericBody":
    "The address doesn't match anything in the app. A question can be asked here —",
  "notfound.title": "That search is gone.",
  "notfound.body":
    "The link points to a saved search that has been deleted, or whose passages have left the corpus since it ran. The question can be asked again —",
  "notfound.link": "the search box is on the front page",
  "notfound.projectTitle": "That project is gone.",
  "notfound.projectBody":
    "The link points to a project that has been deleted. The passages it held remain in the collection —",
  "notfound.projectLink": "see your other projects",

  "search.eyebrow": "Ask a question",
  "search.placeholder":
    "Ask a question — say, what the ancients have to say about friendship, justice or death…",
  "search.ariaQuestion": "Your question",
  "search.submit": "Search",
  "search.submitBusy": "Searching…",
  "search.tooShort": "The question is too short (min {min} characters).",
  "search.estimateClaude": "{model} · {duration} · ≈ {amount}",
  "search.estimateClaudeNoHistory": "{model} · {duration}",
  "search.estimateLocal": "{model} · {duration} · costs nothing",

  "external.checkbox": "Include sources outside the collection",
  "external.checkboxHint":
    "Has Claude search the web (e.g. Marxists Internet Archive) for texts the collection's own rights checks kept out. Costs extra and takes longer.",
  "external.heading": "Outside the collection",
  "external.explain":
    "These pages live at other archives and aren't part of the collection, usually because their rights can't be established. The link leads there — the text is never quoted or stored here.",
  "external.loading": "Searching outside the collection…",
  "external.empty": "Nothing outside the collection was found.",
  "external.cost": "External search: {amount}",

  "subjects.label": "Subject",
  "subjects.all": "all subjects",
  "subjects.selected": "searched in {list}",

  "eras.label": "Era",
  "eras.all": "all eras",

  "examples.label": "Example questions",

  "phase.expanding": "Reading the question…",
  "phase.retrieving": "Searching the corpus…",
  "phase.reading_one":
    "Reading {passages} passages from {count} work and choosing those that answer…",
  "phase.reading_other":
    "Reading {passages} passages from {count} works and choosing those that answer…",
  "phase.cancel": "Cancel",

  "result.errorTitle": "Something went wrong",
  "result.declinedTitle": "The question was declined",
  "result.serverSaid": "The server answered {status}.",
  "result.streamEnded":
    "The connection dropped before the answer finished. Try again.",
  "result.unknownError":
    "Something unexpected went wrong. Check your connection and try again.",
  "result.empty":
    "No passage in the corpus matched the question. Try putting it differently.",
  "result.emptyFiltered":
    "No passage in {list} matched the question. Try putting it differently, or widening the selection.",
  "result.count_one": "{count} chosen passage",
  "result.count_other": "{count} chosen passages",
  "result.duration": "took {duration}",
  "result.editQuestion": "Edit the question",
  "result.corpusGrown_one":
    "The collection has grown by {count} work since this answer was computed.",
  "result.corpusGrown_other":
    "The collection has grown by {count} works since this answer was computed.",
  "result.searchAgain": "Search again",
  "result.searchAgainWithPrice": "Search again (≈ {amount})",
  "result.cachedPrompt":
    "Answer from the archive, for the question “{prompt}”.",
  "sort.label": "Order",
  "sort.relevance": "relevance",
  "sort.chronological": "chronological",

  "passage.translate": "Translate into Swedish",
  "passage.translateEstimate": "≈ {amount}",
  "passage.translateEstimateTitle":
    "The average of past translations, not the price for this particular passage.",
  "passage.translating": "Translating…",
  "passage.showOriginal": "Show the original",
  "passage.showTranslation": "Show the translation",
  "passage.machineTranslated":
    "Machine-translated by Claude — the original is one click away.",
  "passage.showContext": "Show in context",
  "passage.copyQuote": "Copy quotation",
  "passage.quoteCopied": "Quotation copied",
  "passage.translatedBy": "trans. {name}",
  "passage.sourceFallback": "The source",
  "passage.translateFailed": "The passage could not be translated.",
  "passage.more": "More …",

  "similar.heading": "More like this",
  "similar.searching": "Searching…",
  "similar.free": "searches the local vector index, costs nothing",
  "similar.none": "No similar passages outside the work itself.",
  "similar.failed": "The similar passages could not be fetched.",

  "work.heading": "More from this work",
  "work.searching": "Reading the work…",
  "work.free": "scored locally, costs nothing",
  "work.none": "No further passages from the work answer the question.",
  "work.failed": "Could not fetch more passages from the work.",

  "project.save": "Save to a project",
  "project.saved": "Saved",
  "project.chooseHeading": "Save to",
  "project.newPlaceholder": "New project…",
  "project.create": "Create",
  "project.creating": "Creating…",
  "project.none": "No projects yet. Type a name to create the first one.",
  "project.saveFailed": "The passage could not be saved.",
  "project.heading": "Projects",
  "project.intro":
    "A project is an essay in progress: the passages you kept from your searches, in the order you found them, each with the question it came from and a note of your own.",
  "project.listEmpty":
    "No projects yet. A project is created where you save your first passage — the button sits inside every passage in a result list.",
  "project.count_one": "{count} passage",
  "project.count_other": "{count} passages",
  "project.created": "Begun {date}",
  "project.empty":
    "This project is empty. Save a passage from a result list and it will appear here.",
  "project.fromSearch": "from the question “{prompt}”",
  "project.note": "Note",
  "project.notePlaceholder": "Why did you keep this one?",
  "project.noteSave": "Save the note",
  "project.noteSaving": "Saving…",
  "project.noteSaved": "Saved",
  "project.remove": "Remove from the project",
  "project.delete": "Delete the project",
  "project.deleteConfirm":
    "Delete the project and every note in it? The passages remain in the collection.",
  "project.edit": "Edit",
  "project.editSave": "Save",
  "project.editSaving": "Saving…",
  "project.editCancel": "Cancel",
  "project.editFailed": "Could not save the changes.",
  "project.titlePlaceholder": "Project name",
  "project.descriptionPlaceholder": "A short description of the project…",
  "project.tagsPlaceholder": "Add a tag, press Enter",
  "project.tagsRemove": "Remove the tag {tag}",
  "project.lost_one":
    "{count} saved passage can no longer be shown — the work has been re-indexed since it was saved. The note is still there, at the bottom.",
  "project.lost_other":
    "{count} saved passages can no longer be shown — the works have been re-indexed since they were saved. The notes are still there, at the bottom.",
  "project.lostHeading_one": "Lost passage",
  "project.lostHeading_other": "Lost passages",
  "project.lostNoNote": "No note was written.",

  "context.readEarlier": "↑ Read earlier",
  "context.readOn": "↓ Read on",
  "context.loading": "Fetching…",
  "context.title": "The passage in its context",
  "context.failed": "The context could not be fetched.",

  "cost.subjectQuestion": "the question",
  "cost.subjectTranslation": "the translation",
  "cost.fromArchive": "· from the archive",
  "cost.local": "local model · costs nothing",
  "cost.free": "costs nothing",
  "cost.ariaBreakdown": "What {subject} cost — show the lines",
  "cost.heading": "What {subject} cost",
  "cost.subheading": "Tokens billed by Anthropic, line by line.",
  "cost.cachedWithLines":
    "This request cost nothing — the answer was already in the archive. The lines below are what it cost to work out the first time, {amount}.",
  "cost.cachedWithoutLines":
    "This request cost nothing — the answer was already in the archive. Working it out cost {amount}.",
  "cost.noBreakdownCached":
    "No breakdown was saved for this search — only the total.",
  "cost.noBreakdown":
    "No breakdown was saved for this search — only the total, {amount}.",
  "cost.colLine": "line",
  "cost.colTokens": "tokens",
  "cost.colPerMillion": "$/Mtok",
  "cost.colCost": "cost",
  "cost.colSek": "SEK",
  "cost.stepTotal": "{step} total",
  "cost.total": "Total",
  "cost.thinkingNote":
    "Thinking is billed as output and never appears in the answer: a step that writes 250 tokens of visible JSON can be billed for three times as much. A cache read costs a tenth of the input price, a cache write twenty-five per cent extra — the price per line is in the table.",
  "cost.rateNote":
    "The krona amounts are converted at {rate} SEK to the dollar.",

  "cost.step.frågeexpansion": "query expansion",
  "cost.step.omrankning": "reranking",
  "cost.step.översättning": "translation",
  "cost.line.inmatning": "input",
  "cost.line.utmatning": "output",
  "cost.line.cacheläsning": "cache read",
  "cost.line.cacheskrivning": "cache write",

  "cost.step.frågeexpansion.desc":
    "Claude writes nine hypothetical passages and keywords that broaden the question to the collection's languages before retrieval.",
  "cost.step.omrankning.desc":
    "Claude reads the best passages and writes the reasoning shown with the answer.",
  "cost.step.översättning.desc":
    "A saved passage translated to Swedish on request.",
  "cost.line.inmatning.desc":
    "Text sent to the model: the question, the candidate passages, or the text being translated.",
  "cost.line.utmatning.desc":
    "The model's written response, thinking included — usually the largest line on the bill.",
  "cost.line.cacheläsning.desc":
    "The system prompt reused from cache, a tenth of the price of ordinary input.",
  "cost.line.cacheskrivning.desc":
    "The system prompt cached for five minutes, a quarter more expensive but only the first time.",

  "export.label": "Export",
  "export.copied": "Copied",
  "export.markdown": "Copy as Markdown",
  "export.markdownNote_one": "{count} passage with a rationale",
  "export.markdownNote_other": "{count} passages with rationales",
  "export.downloadMd": "Download as .md",
  "export.bibtex": "The works as BibTeX",
  "export.bibtexNote": "one entry per work, not per passage",
  "export.ris": "The works as RIS",

  "recent.heading": "Recent questions",
  "recent.count_one": "{count} passage",
  "recent.count_other": "{count} passages",
  "recent.remove": "Delete the search “{prompt}”",
  "recent.removeTitle": "Delete the search",

  "locale.label": "Language",

  "provider.label": "Model",
  "provider.claude": "Claude",
  "provider.local": "Local ({model})",
  "provider.onDevice": "On this computer",
  "provider.onNetwork": "Over the local network",
  "provider.durationMeasured": "~{duration}, query to answer",
  "provider.durationUnmeasured": "duration not measured",
  "provider.localWarning":
    "Experimental: runs on your own machine, slower and less accurate than Claude.",

  "effort.label": "Thoroughness",
  "effort.medium": "Thorough",
  "effort.low": "Fast",
  "effort.claudeOnly":
    "Only affects Claude's reranking step — local models are unaffected.",

  "common.close": "Close",

  "citation.translatedBy": "trans. {name}",
  "citation.retrieved": "retrieved {date}",
  "citation.subtitle_one":
    "Canon, {date} — {count} passage from the Western canon.",
  "citation.subtitle_other":
    "Canon, {date} — {count} passages from the Western canon.",
  "citation.projectSubtitle_one":
    "Canon, {date} — {count} kept passage from the Western canon.",
  "citation.projectSubtitle_other":
    "Canon, {date} — {count} kept passages from the Western canon.",
  "citation.fromQuestion": "From the question: {prompt}",
  "citation.note": "Note:",
  "citation.deathNote":
    "Author died {year}; year of publication missing from the source catalogue",

  "api.invalidJson": "Malformed JSON in the request.",
  "api.emptyPrompt": "Empty question.",
  "api.promptTooLong": "The question is too long (max {max} characters).",
  "api.badChunkId": "chunkId is missing or invalid.",
  "api.chunkNotFound": "No such passage.",
  "api.badWork": "slug or workId is missing.",
  "api.searchNotFound": "The search is not in the archive.",
  "api.unknownError": "Unknown error",
  "api.notIndexed":
    "The corpus has not been indexed yet. Run `pnpm ingest` in the project directory and try again.",

  "error.pageTitle": "Something broke",
  "error.pageBody":
    "The page could not be shown. The database may be locked or mid-rebuild — trying again usually fixes it.",
  "error.retry": "Try again",

  "claude.badKey":
    "Claude rejected the API key. Check ANTHROPIC_API_KEY in .env.local.",
  "claude.rateLimited": "Claude is rate-limited right now. Try again shortly.",
  "claude.overloaded": "Claude is overloaded right now. Try again shortly.",
  "claude.apiError": "Claude answered with error {status}: {message}",
  "claude.truncated":
    "The answer ran out before it was finished. Try again, or ask a narrower question.",
  "claude.refused": "Claude declined to answer the question.",
  "claude.outOfScope":
    "This doesn't look like a question for the collection. Canon answers questions about the Western canon — philosophy, history, politics, drama, poetry and the like — not, for instance, arithmetic or coding questions.",
};

const DICT: Record<Locale, Dict> = { sv, en };

/**
 * Looks up a string and fills in the placeholders.
 *
 * An unknown placeholder is left as it stands rather than turned into
 * "undefined": a translation that happens to keep a `{count}` the caller
 * doesn't pass should show up as a bug to fix, not be silenced into a word
 * that looks intentional.
 */
export function t(
  locale: Locale,
  key: Key,
  vars?: Record<string, string | number>,
): string {
  const template = DICT[locale][key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

type PluralBase<K> = K extends `${infer B}_one` ? B : never;

/**
 * Pluralized strings: `foo_one` and `foo_other`.
 *
 * Both languages distinguish only one from many, so a single rule suffices —
 * but it should live in one place. `{count}` is filled in automatically and
 * formatted per language: English writes 1,200 where Swedish writes 1 200.
 */
export function tn(
  locale: Locale,
  base: PluralBase<Key>,
  count: number,
  vars?: Record<string, string | number>,
): string {
  const key = `${base}_${count === 1 ? "one" : "other"}` as Key;
  return t(locale, key, { ...vars, count: formatNumber(count, locale) });
}

/**
 * Years in the UI. Negative years are before the common era.
 *
 * No thousands separator — "1 800 f.Kr." and "1,800 BC" read as a measurement
 * rather than a year, and the collection spans four digits at both ends.
 *
 * Two forms, because they already existed: the result list writes "BCE/CE"
 * and marks the era even on positive years — there the year sits next to a
 * genre and needs a marker — while the collection's rows and the citation
 * export write "BC" and leave positive years bare. (The form originally sat
 * in the header's collection span, which is gone now.)
 */
/**
 * `year` is the author's death year (see `CanonWork.year` in taxonomy.ts),
 * and the Gutenberg generators write `0` when the catalogue simply doesn't
 * have one — true for both Sappho renderings and six Malory entries, none
 * of whose death years are actually known to the catalogue. `0 < 0` is
 * false, so without this guard the pre-`year.death` code already showed the
 * nonsensical "0 e.v.t.", and wrapping that in "d." (`deathEra`/`deathYear`
 * in `LocaleProvider.tsx`) would assert a death year no source claims.
 */
function isUnknownYear(year: number): boolean {
  return year === 0;
}

export function formatEra(year: number, locale: Locale): string {
  if (isUnknownYear(year)) return t(locale, "year.unknown");
  return year < 0
    ? t(locale, "year.bce", { year: Math.abs(year) })
    : t(locale, "year.ce", { year });
}

export function formatYear(year: number, locale: Locale): string {
  if (isUnknownYear(year)) return t(locale, "year.unknown");
  return year < 0
    ? t(locale, "year.bc", { year: Math.abs(year) })
    : t(locale, "year.ad", { year });
}

/**
 * The label for a step or a line on the bill.
 *
 * The server writes them in Swedish and they're stored that way in
 * `cost_detail`. A row written by a future version — or an older one — falls
 * back to its own text: an unfamiliar step name should be shown as-is, not disappear.
 */
export function costLabel(
  locale: Locale,
  kind: "step" | "line",
  swedish: string,
): string {
  const dict: Record<string, string | undefined> = DICT[locale];
  return dict[`cost.${kind}.${swedish}`] ?? swedish;
}

/**
 * The short explanation for a step or a line, for the cost page.
 *
 * Empty string, not `swedish` as `costLabel` does: an unfamiliar name should
 * be shown without an explanation, not with the Swedish key printed out as if
 * it were text meant for a reader.
 */
export function costDescription(
  locale: Locale,
  kind: "step" | "line",
  swedish: string,
): string {
  const dict: Record<string, string | undefined> = DICT[locale];
  return dict[`cost.${kind}.${swedish}.desc`] ?? "";
}
