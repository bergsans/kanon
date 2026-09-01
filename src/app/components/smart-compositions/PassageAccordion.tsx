"use client";

import { useCallback, useState, type ReactNode } from "react";
import { genreLabel, SOURCE_LABEL } from "@/lib/taxonomy";
import { asMarkdown } from "@/lib/citation";
import { ApiError, readJson } from "@/lib/fetch-json";
import { cleanLocator } from "@/lib/locator";
import { money } from "@/lib/money";
import type { CostPayload, PassagePayload } from "@/lib/protocol";
import { ContextSheet } from "./ContextSheet";
import { CopyButton } from "../ui/CopyButton";
import { useCostEstimate } from "../providers/CostEstimateProvider";
import { CostTag } from "./CostTag";
import { emphasized, stripEmphasis } from "../ui/emphasis";
import { useT } from "../providers/LocaleProvider";
import { MoreFromWork } from "./MoreFromWork";
import { SaveToProject } from "./SaveToProject";
import { SimilarPassages } from "./SimilarPassages";
import { shortLocator } from "../ui/format";

/**
 * The first sentence of the rationale, as a preview in the collapsed row.
 * It's the only text that says anything about why the passage was included,
 * and without it a collapsed list of twelve work titles is impossible to
 * navigate.
 */
function teaser(relevance: string): string {
  // The underscores are stripped rather than italicized: the truncation
  // below can cut a pair in half, and a lone underscore in a preview looks
  // like an error in the text.
  const text = stripEmphasis(relevance);
  const stop = /(?<=[.!?])\s/.exec(text);
  const first = stop ? text.slice(0, stop.index + 1) : text;
  return first.length > 150 ? `${first.slice(0, 148).trimEnd()}…` : first;
}

interface Props {
  passage: PassagePayload;
  /**
   * The row's place in the list currently on screen, not an identity of
   * the passage itself — omitted where there's no ranked list to number
   * against (a saved project is a kept set, not a rank).
   */
  position?: number;
  /**
   * Whether the row directly above shares this passage's `workId`.
   *
   * The spread filter allows up to seven passages per work in sixty-four,
   * so two or three adjacent rows are routinely the same book. Repeating the
   * full "Author, Title" on every one of them reads as though the list
   * forgot who it was just talking about — a bibliography's own convention
   * (the em dash standing in for a repeated author) says the same thing in
   * one glyph instead. The full text stays for anyone using a screen reader
   * (`sr-only` below): the row's accessible name shouldn't change just
   * because its visible label did.
   */
  sameWorkAsAbove?: boolean;
  open: boolean;
  onToggle: () => void;
  /**
   * The search the passage is shown from, when there is one.
   *
   * Two things hinge on it. The save button writes the query as the
   * passage's origin in the project — a rationale without its query is a
   * sentence about nothing — and "more from this work" needs the slug,
   * because the server reads the query's language forms and the answer's
   * other passages from the saved row instead of accepting them from the
   * client.
   *
   * If the slug is missing, that button isn't drawn. This only happens in
   * the gap between the answer being shown and it having been saved, and a
   * button that answers 404 is worse than one that appears a second later.
   */
  search?: { slug: string | null; prompt: string };
  /** Extra rows under the passage. The project page puts the note here. */
  children?: ReactNode;
}

export function PassageAccordion({
  passage,
  position,
  sameWorkAsAbove = false,
  open,
  onToggle,
  search,
  children,
}: Props) {
  const { t, deathEra, locale } = useT();
  const { avgTranslationUsd, rate } = useCostEstimate();
  const m = money(locale);
  // Which passage the context panel shows. No longer a boolean: the
  // neighbor list below opens the same panel for *its* passage, not the one
  // currently open.
  const [contextChunk, setContextChunk] = useState<number | null>(null);
  // A stable reference, not a fresh arrow on every render: `ContextSheet`'s
  // Escape-key effect depends on `onClose`, so an inline arrow here made it
  // tear down and re-add that listener (and the body-scroll lock next to
  // it) on every render of this component, not just when the sheet opens
  // or closes.
  const closeContext = useCallback(() => setContextChunk(null), []);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translationCost, setTranslationCost] = useState<CostPayload | null>(
    null,
  );
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  // Neighbors and work stay behind "More …" until someone asks for them:
  // exploratory paths onward, read far less often than the four actions
  // on the primary row (translate, show in context, copy, save). Save used
  // to sit back here too, behind the same fold as the two purely
  // exploratory links — the one action that turns reading into keeping
  // deserves the row everything else on the first read already gets.
  const [showMore, setShowMore] = useState(false);
  const panelId = `passage-panel-${passage.chunkId}`;

  // Swedish original texts have nothing to translate to.
  const translatable = passage.language !== "sv";

  // Prose gets ragged edges at the largest text size and in narrow columns —
  // `hyphens-auto` reads the `lang` attribute already set on the blockquote
  // below and needs no per-language table here. Verse is excluded: a drama
  // or a poem's line breaks are the author's own, and a hyphen splitting the
  // last word of a line the poet chose to end there reads as the app's
  // mistake, not a typesetting nicety.
  const hyphenate = passage.genre !== "drama" && passage.genre !== "dikt";

  /**
   * Fetches the translation the first time, and thereafter toggles between
   * languages without asking the server again — it's already paid for and
   * sits in state.
   */
  async function toggleTranslation() {
    if (translation) {
      setShowTranslation((shown) => !shown);
      return;
    }

    setTranslating(true);
    setTranslationError(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkId: passage.chunkId }),
      });
      const json = await readJson<{
        text?: string;
        cost?: CostPayload;
        error?: string;
      }>(res);
      if (!res.ok || !json.text) {
        throw new Error(json.error ?? t("passage.translateFailed"));
      }
      setTranslation(json.text);
      // The translation is also a call to Claude, and also costs money. The
      // cost line stays put when switching back to the original: it applies
      // to the call, not to which language is currently shown.
      setTranslationCost(json.cost ?? null);
      setShowTranslation(true);
    } catch (err) {
      setTranslationError(
        err instanceof ApiError
          ? t("result.unknownError")
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setTranslating(false);
    }
  }

  const translationLabel = translating
    ? t("passage.translating")
    : !translation
      ? t("passage.translate")
      : showTranslation
        ? t("passage.showOriginal")
        : t("passage.showTranslation");

  return (
    <>
      <div id={`passage-${passage.index}`} className="scroll-mt-6">
        <h4>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            // The panel below is unmounted when closed (see its own
            // comment), so pointing at its id while closed would leave
            // `aria-controls` referencing an element that doesn't exist.
            aria-controls={open ? panelId : undefined}
            /* The hover state is one step down from the ground: the register
               direction dropped the list's own sheet (see the comment on the
               list in `CanonSearch`), so the row now sits directly on the
               page's `parchment-50` ground — a hover fill of that same shade
               painted nothing. `parchment-100` is the ground's own hover
               step everywhere else in the app (`ChipRow`, `NavMenu`'s menu
               items) and is visible against it without reading as a slab. */
            className="cursor-pointer group flex w-full items-baseline gap-3 rounded-md px-3 py-3 text-left transition hover:bg-parchment-100"
          >
            {/* The row's place in the list on screen, not the passage's own
                identity — see `position`'s comment on `Props`. Omitted
                (rather than reserving blank space for it) wherever there's
                no ranked list behind it, e.g. a saved project. */}
            {position != null && (
              <span
                aria-hidden
                className="mt-1 shrink-0 font-mono text-[0.6875rem] tabular-nums text-ink-400"
              >
                {position}
              </span>
            )}
            {/* A plus and a minus, not a triangle that rotates: a glyph
                that has to turn ninety degrees to mean something else is a
                curve standing in for the state, and the register's rows
                don't turn. Hidden on paper: printing opens every row (see
                `ProjectView`/`CanonSearch`), and a toggle affordance for a
                state that can't change once printed is noise. */}
            <span
              aria-hidden
              className="mt-1 shrink-0 font-mono text-sm text-accent-600 print:hidden"
            >
              {open ? "−" : "+"}
            </span>
            <span className="min-w-0 flex-1">
              {/* The author sits in the row, not in a group heading above:
                  the list is flat and sorted by relevance, so two adjacent
                  rows are rarely the same person. */}
              <span className="font-serif text-[1.0625rem] leading-snug text-ink-900">
                {sameWorkAsAbove ? (
                  <>
                    <span aria-hidden>———</span>
                    <span className="sr-only">
                      {passage.author}, {passage.title}
                    </span>
                  </>
                ) : (
                  <>
                    {passage.author}
                    <span className="text-ink-600">, {passage.title}</span>
                  </>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-ink-400">
                {deathEra(passage.year)} · {genreLabel(passage.genre, locale)}
                {passage.locator && (
                  /* The title attribute carries the full, cleaned locator
                     for a hover — unreachable on touch, so once the row is
                     open (there's room, and the reader has already asked
                     for more) the visible text switches from the
                     truncated form to the same full one, rather than
                     leaving it a hover away for good. */
                  <span title={cleanLocator(passage.locator)}>
                    {" "}
                    ·{" "}
                    {open
                      ? cleanLocator(passage.locator)
                      : shortLocator(passage.locator)}
                  </span>
                )}
                {passage.translator &&
                  ` · ${t("passage.translatedBy", { name: passage.translator })}`}
              </span>
              {/* Same guard as the open panel's rationale below: a passage
                  saved from `ContextSheet` carries no rationale to preview. */}
              {!open && passage.relevance && (
                <span className="mt-1.5 block text-sm leading-relaxed text-ink-600">
                  {teaser(passage.relevance)}
                </span>
              )}
            </span>
          </button>
        </h4>

        {/* The panel is unmounted when closed: a search yields up to sixteen
            passages at ~1200 characters each, and keeping them all in the
            DOM makes the page sluggish to scroll without anyone seeing them. */}
        {open && (
          <div
            id={panelId}
            /* Matches the row above: the button's own px-3, then a
               position digit and a toggle glyph each with their own gap
               where `position` is shown, one column narrower where it
               isn't (a saved project has no rank to number). */
            className={`px-3 pb-5 ${position != null ? "pl-14" : "pl-9"}`}
          >
            {/* The rationale often quotes an expression from the passage and
                carries its underscores along. Same reading here as in the
                quote below.

                The rule is `parchment-300`, not the accent: the query above
                already opens with a full-strength accent bar, and a second
                accent rule directly under it read as a quote nested inside
                a quote rather than as the one query's own chain of marks
                continuing. A neutral rule still sets the rationale off from
                the plain metadata line above it, without competing with the
                mark that actually means something here. */}
            {/* Empty only for a passage saved from `ContextSheet` — a
                neighbor or a work-listing row has no reranking rationale to
                carry, and `SaveToProject` there is given `relevance=""`
                rather than inventing one. An empty, still-bordered strip
                would read as a rendering bug; omitting the row entirely
                says the plain truth instead. */}
            {passage.relevance && (
              <p className="border-l-2 border-parchment-300 pl-3 text-sm leading-relaxed text-ink-600">
                {emphasized(passage.relevance)}
              </p>
            )}

            {/* `_italic_` in the raw text is Gutenberg's and Runeberg's way
                of carrying the author's emphasis through a plain text file.
                It's read here, not at indexing time: the raw text should
                stay the source's own. */}
            <blockquote
              lang={showTranslation && translation ? "sv" : passage.language}
              /* The quote is the page's darkest text. The rationale above is
                 set in ink-600 and the metadata row in ink-400 — three steps
                 that say what's the work and what's the app's commentary on
                 it. The size (17px at the root's default 16px) is a plain
                 rem value rather than a bare Tailwind step so it lines up
                 exactly with the px this blockquote used before `useTextSize`
                 scaled the whole document instead of just this element — no
                 inline style needed here any more, `TextSizeProvider` sets
                 the root and this scales with it like everything else. */
              /* Text figures, not lining ones: a year or a verse number sunk
                 into running prose the way the source editions themselves
                 set it, rather than standing full-height like a table
                 total. Assumed to help, not measured — the property is
                 harmless where a fallback font ignores it, since browsers
                 skip an OpenType feature the font doesn't carry. */
              className={`mt-4 font-serif text-[1.0625rem] leading-[1.7] whitespace-pre-wrap text-ink-900 [font-variant-numeric:oldstyle-nums] ${hyphenate ? "hyphens-auto" : ""}`}
            >
              {emphasized(showTranslation && translation ? translation : passage.text)}
            </blockquote>

            {/* The translation is a convenience for the reader, not an
                edition. Saying so plainly is the same kind of honesty as the
                source citation below: never quote this text as if it were
                Hobbes's own. */}
            {showTranslation && translation && (
              <p className="mt-2 text-xs text-ink-400 italic">
                {t("passage.machineTranslated")}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
              {/* `contents` rather than a `print:hidden` on the outer row:
                  the CC-BY credit below is a license condition and has to
                  survive onto paper, so only this interactive cluster — none
                  of it meaningful once nothing here can be clicked — is
                  hidden, and `contents` keeps its children in the same flex
                  row as the credit instead of nesting a box around them. */}
              <span className="contents print:hidden">
              {translatable && (
                <span className="inline-flex items-baseline gap-1.5">
                  <button
                    type="button"
                    onClick={toggleTranslation}
                    disabled={translating}
                    aria-busy={translating}
                    className="cursor-pointer underline decoration-dotted underline-offset-4 transition hover:text-accent-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    {translationLabel}
                  </button>
                  {/* Shown only before the click that spends the money — once
                      `translationCost` exists below, the real price has
                      replaced the question the estimate was answering. The
                      "≈" is not decoration: this is the archive's average,
                      not this passage's own token count, so it says
                      "roughly" rather than pretending to a precision it
                      doesn't have. */}
                  {!translation && avgTranslationUsd != null && (
                    <span
                      className="font-mono text-ink-400/80"
                      title={t("passage.translateEstimateTitle")}
                    >
                      {t("passage.translateEstimate", {
                        amount: `${m.usd(avgTranslationUsd)} · ${m.sek(avgTranslationUsd * rate)}`,
                      })}
                    </span>
                  )}
                </span>
              )}

              {translationCost && (
                <CostTag cost={translationCost} subject="translation" />
              )}

              <button
                type="button"
                onClick={() => setContextChunk(passage.chunkId)}
                className="cursor-pointer underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
              >
                {t("passage.showContext")}
              </button>

              {/* Always the original text, never whatever is currently shown.
                  The machine translation carries its warning in the UI but
                  would lose it on copy, and a quote that ends up in an essay
                  without being what the text actually says is exactly what
                  the app otherwise avoids. */}
              <CopyButton
                text={() => asMarkdown(passage, { locale })}
                label={t("passage.copyQuote")}
                done={t("passage.quoteCopied")}
              />

              {/* On the primary row, not behind "Mer …": this is the one
                  action that turns reading into keeping, and it used to sit
                  behind the same fold as two purely exploratory links,
                  reachable only after an extra click nothing else in the
                  row needed. */}
              <SaveToProject
                chunkId={passage.chunkId}
                prompt={search?.prompt ?? ""}
                relevance={passage.relevance}
              />

              {!showMore ? (
                <button
                  type="button"
                  onClick={() => setShowMore(true)}
                  className="cursor-pointer underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
                >
                  {t("passage.more")}
                </button>
              ) : (
                <>
                  <SimilarPassages
                    chunkId={passage.chunkId}
                    onOpenContext={setContextChunk}
                  />

                  {/* Two paths onward that look alike and ask opposite
                      things: the neighbors look for who ELSE says this, the
                      work for what the SAME book says that didn't make it
                      into the answer. */}
                  {search?.slug && (
                    <MoreFromWork
                      slug={search.slug}
                      workId={passage.workId}
                      onOpenContext={setContextChunk}
                    />
                  )}
                </>
              )}
              </span>

              {/* Litteraturbanken's editions are CC-BY. Crediting the source
                  and linking to it is the license condition, not a
                  decoration. */}
              {passage.sourceUrl && (
                <a
                  href={passage.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
                >
                  {SOURCE_LABEL[passage.source] ?? t("passage.sourceFallback")} ↗
                </a>
              )}
            </div>

            {translationError && (
              <p role="status" className="mt-2 text-xs text-accent-700">
                {translationError}
              </p>
            )}

            {children}
          </div>
        )}
      </div>

      {contextChunk !== null && (
        <ContextSheet
          chunkId={contextChunk}
          onClose={closeContext}
          /* The question this row's own passage came from, whether the panel
             is showing that same passage or a neighbor reached from it —
             see the prop's own comment on `ContextSheet` for why a
             neighbor doesn't get a more specific one of its own. */
          prompt={search?.prompt ?? ""}
        />
      )}
    </>
  );
}
