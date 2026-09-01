"use client";

import { useEffect, useRef, useState } from "react";
import { EXAMPLE_QUESTIONS } from "@/lib/i18n";
import {
  eraLabel,
  genreLabel,
  type CorpusFacets,
  type CorpusFilter,
} from "@/lib/taxonomy";
import { useT } from "../providers/LocaleProvider";
import { ChipRow } from "./ChipRow";

/** The textarea's `maxLength`, shared with the counter below it so the two never drift apart. */
const MAX_QUESTION_LENGTH = 1000;

/**
 * Below this, the counter stays hidden. A question worth asking runs to a
 * sentence or two, and "12 / 1000" next to it answers a question nobody's
 * asking yet. The number earns its place once the limit is actually a
 * consideration — a fifth of the field left — not on every keystroke from
 * the first character.
 */
const COUNTER_THRESHOLD = MAX_QUESTION_LENGTH * 0.8;

/**
 * Not a measured number — three is simply the shortest input that could
 * still be a question ("gud", "mat"), so the guard catches a stray keystroke
 * or an accidental Enter without ever blocking something a person would
 * actually ask. Search is the paid step at the end of this form, so the
 * guard has to sit here, before submit, not just on the server.
 */
const MIN_QUESTION_LENGTH = 3;

interface Props {
  onSearch: (prompt: string) => void;
  busy: boolean;
  /** The genres and eras that have indexed works — the only ones worth a chip. */
  available: CorpusFacets;
  filter: CorpusFilter;
  onFilterChange: (filter: CorpusFilter) => void;
  /**
   * The "utanför samlingen" checkbox — see `findExternal` in claude.ts. Off
   * by default, like the genre/era filter it sits below: both are things a
   * reader opts into before asking, not something the form assumes.
   */
  external: boolean;
  onExternalChange: (external: boolean) => void;
  /**
   * What the field should already hold when it appears — the question being
   * refined, when `CanonSearch` reopens the box on top of an answer already
   * on screen. Read once, at mount, like every other uncontrolled form
   * default: the caller forces a remount with a fresh `key` when it wants a
   * new starting value, rather than this component chasing prop changes.
   */
  initialValue?: string;
  /**
   * "Claude · ~2 min 4 s · ≈ $0,12 · 1,15 kr" or "Lokal (qwen3:14b) · ~9 min
   * 37 s · kostar ingenting" — computed by `CanonSearch` (which already
   * reads `useCostEstimate()` for the progress bar) and handed down as a
   * finished string. This is a `ui/` component: it owns no server data, no
   * provider and no cookie-backed setting, only what it's given — see the
   * `canon-ui` skill on what `ui/` may and may not read.
   */
  estimate: string;
}

export function SearchBox({
  onSearch,
  busy,
  available,
  filter,
  onFilterChange,
  external,
  onExternalChange,
  initialValue,
  estimate,
}: Props) {
  const { t, locale } = useT();
  const [value, setValue] = useState(initialValue ?? "");
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Reopened with a question already in it — put the cursor there instead of
  // making someone click into the field before they can change a word of it.
  // Only on mount: `[]` is deliberate, this isn't meant to steal focus back
  // on every re-render, just the one where the box just appeared.
  useEffect(() => {
    if (initialValue) textarea.current?.focus();
  }, [initialValue]);

  const submit = (prompt: string) => {
    const trimmed = prompt.trim();
    // Enter bypasses the submit button's `disabled`, so the length guard has
    // to live here too — otherwise a stray two-character Enter still ran the
    // full paid pipeline while the button sat there looking like it hadn't.
    if (trimmed.length < MIN_QUESTION_LENGTH || busy) return;
    setValue(trimmed);
    onSearch(trimmed);
    textarea.current?.blur();
  };

  // Blank until something's been typed — an empty field is just unstarted,
  // not invalid, and the guard has nothing useful to say about it yet.
  const trimmedLength = value.trim().length;
  const tooShort = trimmedLength > 0 && trimmedLength < MIN_QUESTION_LENGTH;
  const guardrailId = "search-guardrail";

  return (
    <div>
      {/* The first of the row of section eyebrows the register direction
          marks with a ruled hairline — small caps, then a line that
          carries on to the column's edge, so the eye reads a boundary
          even where there's nothing else to draw one. */}
      <h2 className="eyebrow eyebrow-rule">
        {t("search.eyebrow")}
      </h2>
      <form
        className="mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <div className="relative">
          <textarea
            ref={textarea}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              // Enter searches, Shift+Enter gives a line break.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(value);
              }
            }}
            rows={3}
            maxLength={MAX_QUESTION_LENGTH}
            placeholder={t("search.placeholder")}
            aria-label={t("search.ariaQuestion")}
            aria-describedby={tooShort ? guardrailId : undefined}
            aria-invalid={tooShort}
            /* The search box is the page's first sheet and should sit on
               top in that hierarchy: full surface, full border, and a more
               pronounced shadow than the results list.

               The left edge carries the accent at full strength always, not
               just on focus — the first mark in a chain that continues,
               fainter, on the filter box below, and again at full strength
               on the results list once there's an answer. Examples and the
               archive carry none: they aren't part of the question that's
               currently being asked.

               On focus, the border goes to 2px on all four sides, not just
               the left: a translucent ring outside a one-sided-thick border
               read as a red edge fading into white rather than one solid
               frame. A uniform, fully-saturated border reads as one piece —
               and needs no ring to be seen; 2px accent-600 against parchment
               already clears the contrast a 30-percent ring was standing in
               for. */
            className="w-full resize-none rounded-lg border border-parchment-300 border-l-[3px] border-l-accent-600 bg-parchment-0 px-5 py-4 pr-16 font-serif text-lg leading-relaxed text-ink-900 shadow-lift outline-none transition placeholder:text-ink-400 focus:border-2 focus:border-accent-600 disabled:opacity-60"
            disabled={busy}
          />
          {/* Visual only — the textarea's own `maxLength` is what actually
              stops input, and a screen reader announcing a number on every
              keystroke would be noise, not help. Hidden below
              `COUNTER_THRESHOLD`: see that constant's own comment. */}
          {value.length > COUNTER_THRESHOLD && (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-3 left-5 font-mono text-[0.6875rem] tabular-nums text-ink-400"
            >
              {value.length} / {MAX_QUESTION_LENGTH}
            </span>
          )}
          <button
            type="submit"
            disabled={busy || tooShort || trimmedLength === 0}
            /* No aria-label: one used to sit here fixed to `search.submit`,
               which — because aria-label replaces a control's accessible
               name rather than supplementing it — kept announcing "Sök"
               to a screen reader even while busy, when the visible text
               (and the button's own state) had already moved on to
               "Söker…". The two lines below are the button's only name now,
               so the busy state is heard, not just seen. */
            /* No shadow: a filled accent rectangle already reads as a
               button from color and contrast alone, and the search box is
               the only sheet on the page that lifts — everything below it
               is told apart by a border instead.

               Disabled state is its own two colors, not the accent faded
               out: 40 percent opacity over parchment landed on a washed-out
               pink that still read as "the accent, dimly" rather than as
               "not available yet". `parchment-200`/`ink-400` is the same
               pairing a disabled control uses everywhere else in the app
               (see `chipClass` above), so an inert search button looks like
               every other inert control instead of like a lighter shade of
               itself. */
            className="cursor-pointer absolute bottom-3 right-3 rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-parchment-0 transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-ink-400"
          >
            {busy ? t("search.submitBusy") : t("search.submit")}
          </button>
        </div>
        {/* `role="status"` carries an implicit polite live region — the
            disabled button already stops the submit silently, and without
            this a screen reader user gets no signal that anything went
            wrong. Sighted users get the same explanation instead of
            guessing why the button won't click. */}
        {tooShort && (
          <p
            id={guardrailId}
            role="status"
            className="mt-1.5 text-xs text-accent-700"
          >
            {t("search.tooShort", { min: MIN_QUESTION_LENGTH })}
          </p>
        )}
      </form>

      {/* Hidden while busy: `CanonSearch`'s own status row takes over at
          that point with the live wait, and repeating the same estimate
          beside it would read as two clocks disagreeing. */}
      {!busy && (
        <p className="mt-1.5 text-xs text-ink-400">{estimate}</p>
      )}

      {/* Its own row, not folded into the filter box below: a genre or era
          narrows where the answer is drawn FROM inside the collection, this
          instead reaches outside it — a different kind of choice, and one
          that costs money on its own (see `findExternal`'s own comment on
          why it can't be folded into an existing call). The label wraps the
          input so the whole line, not just the small box, is clickable. */}
      <label
        className={`mt-3 flex items-start gap-2 text-xs text-ink-400 ${
          busy ? "cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <input
          type="checkbox"
          checked={external}
          onChange={(e) => onExternalChange(e.target.checked)}
          disabled={busy}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent-600 disabled:opacity-60"
        />
        <span>
          <span className="text-ink-600">{t("external.checkbox")}</span>{" "}
          <span>{t("external.checkboxHint")}</span>
        </span>
      </label>

      {/* The selectors sit between the box and the example questions, i.e.
          before the first click a new visitor makes: an example question
          should be answerable within a genre or era without first having
          been asked of everything. The labels come from the taxonomy, not
          the dictionary; genres and eras are already bilingual there.

          The two axes live in their own framed box. The chips used to look
          exactly like the example questions — same pill, same size, same
          row — with the reasoning that the same shape means "click here and
          something happens with the search". But the same thing doesn't
          happen: a chip *sets* something that persists, an example question
          *runs* a paid search right away. Four rows of identical pills also
          read as a single list, with the bottom one looking like past
          searches. The frame says where the settings end.

          An axis with only one value isn't drawn at all. Choosing between
          "everything" and "the only thing there is" isn't a choice, and a
          corpus containing only one era shouldn't carry a row implying
          otherwise — so the box isn't drawn either when no axis is left. */}
      {(available.genres.length > 1 || available.eras.length > 1) && (
        /* A hairline above, nothing else — no box, no fill, no left edge.
           Two boxed treatments were tried before this: a filled slab
           (parchment-100, rejected — read as a tan block the size of the
           search box) and a bordered sheet with the search box's accent
           continued at 45 percent down the left edge. Both drew a
           container; this instead makes the filter read as a *section* of
           the column, the same device the page already uses to open
           "STÄLL EN FRÅGA" and the footer's attribution — a rule, not a
           room.

           No line below: a hairline immediately followed by the example
           questions' own heading read as two boundaries fighting over the
           same few pixels — the rule said "section ends here" and the
           whitespace right after it had to say the same thing again. Space
           alone carries that break now (see the examples' own `mt-10`
           below); the top rule is enough to say where the filter begins.

           The trade this makes: the accent chain from the search box's
           left edge breaks here, because there's no left edge left to
           carry it on. Nothing else replaces that link — the rule is
           plain `parchment-200`, the same hairline the eyebrows and the
           divider between the axes already use. */
        <div className="mt-4 divide-y divide-parchment-200 border-t border-parchment-200 py-3">
          {available.genres.length > 1 && (
            <ChipRow
              label={t("subjects.label")}
              allLabel={t("subjects.all")}
              options={available.genres}
              selected={filter.genres}
              onChange={(genres) => onFilterChange({ ...filter, genres })}
              busy={busy}
              labelOf={(g) => genreLabel(g, locale)}
            />
          )}
          {available.eras.length > 1 && (
            <ChipRow
              label={t("eras.label")}
              allLabel={t("eras.all")}
              options={available.eras}
              selected={filter.eras}
              onChange={(eras) => onFilterChange({ ...filter, eras })}
              busy={busy}
              labelOf={(e) => eraLabel(e, locale)}
            />
          )}
        </div>
      )}

      {/* The example questions are questions and are therefore set in the
          same serif as the passages and the archive's rows — sans and pills
          are the UI's controls, serif is text from or to the corpus. The
          heading is needed so they don't read as already-asked questions;
          the archive in the right margin differs in turn by standing in a
          column, carrying a passage count per row, and pointing at a
          permalink. The chevron is decoration and therefore aria-hidden —
          the button's name is the question.

          `mt-10`, not the `mt-6` every other gap in this column uses: the
          filter above no longer closes with its own rule, so the break
          into a new section has to read from spacing alone — and spacing
          that's doing a rule's job needs to be more than the usual gap. */}
      <div className="mt-10">
        {/* The trailing rule stays here, same as "STÄLL EN FRÅGA" above it —
            it runs *beside* the label, not under it, so it doesn't compete
            with the filter's hairline or the `mt-10` above. What did sit
            directly under the heading was the first example question's own
            `border-t`, just 8px below on `mt-2` — see the `first:` override
            below. */}
        <h2 className="eyebrow eyebrow-rule">
          {t("examples.label")}
        </h2>
        {/* Stacked rows, not a wrapped row of pills: a pill is the same
            shape the filter chips use for something that *sets* a value,
            and an example question instead *runs* a search immediately —
            the register direction gives it its own shape, a hairline-bound
            row like the archive's, so the two are never mistaken for each
            other by eye alone. */}
        <div className="mt-2">
          {EXAMPLE_QUESTIONS[locale].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => submit(example)}
              disabled={busy}
              /* `first:border-t-0`: the top border exists to separate one
                 example from the next, and the first one has no previous
                 example to be separated from — only the heading above it,
                 which already ends in its own rule a few pixels up. Without
                 the override, that top border sat almost flush under the
                 heading and read as a second, redundant line. */
              className="group flex w-full cursor-pointer items-baseline gap-2 border-t border-parchment-200 py-2.5 text-left font-serif text-sm text-ink-600 transition first:border-t-0 last:border-b hover:text-accent-700 disabled:opacity-50"
            >
              <span aria-hidden className="shrink-0 text-accent-600">
                ›
              </span>
              <span className="underline decoration-parchment-300 decoration-dotted underline-offset-4 transition group-hover:decoration-accent-600">
                {example}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
