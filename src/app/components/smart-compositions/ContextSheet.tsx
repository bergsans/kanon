"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { asMarkdown } from "@/lib/citation";
import { ApiError, readJson } from "@/lib/fetch-json";
import { cleanLocator } from "@/lib/locator";
import type { ContextWindowPayload } from "@/lib/protocol";
import { SOURCE_LABEL } from "@/lib/taxonomy";
import { CloseIcon } from "../ui/CloseIcon";
import { CopyButton } from "../ui/CopyButton";
import { emphasized } from "../ui/emphasis";
import { SaveToProject } from "./SaveToProject";
import { useT } from "../providers/LocaleProvider";
import { useModalFocus } from "../ui/useModalFocus";

interface Props {
  chunkId: number;
  onClose: () => void;
  /**
   * The question this exploration started from, when there is one — carried
   * through to a save so the project entry has the same origin the passage
   * it was found alongside does. Empty for a passage reached by clicking
   * into a neighbor or a work listing rather than a search's own "show in
   * context": there, no single question owns the passage, and saying so
   * plainly is more honest than guessing.
   */
  prompt?: string;
}

/**
 * How much text the panel starts with, and how far it may grow.
 *
 * The cap is the server's, not this number — the route clamps regardless of
 * what's sent. The doubling is chosen so that four clicks are enough for a
 * long chapter: someone looking for where an argument begins shouldn't have
 * to click twelve times.
 */
const START = 3000;
const MAX = 40_000;

/** The skeleton's row widths, like a paragraph: full width with some
    variation, a short last line. Written as whole class names — Tailwind
    reads the source as text and won't find a class assembled from pieces. */
const SKELETON_WIDTHS = [
  "w-full",
  "w-11/12",
  "w-full",
  "w-10/12",
  "w-full",
  "w-11/12",
  "w-9/12",
  "w-5/12",
];

export function ContextSheet({ chunkId, onClose, prompt = "" }: Props) {
  const { t, locale } = useT();
  // Labels the panel, not the backdrop — see the `role="dialog"` comment
  // below on why both moved there together.
  const titleId = useId();
  const [data, setData] = useState<ContextWindowPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [before, setBefore] = useState(START);
  const [after, setAfter] = useState(START);
  const [growing, setGrowing] = useState(false);
  const mark = useRef<HTMLElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  useModalFocus(panel);

  // Whether the passage has already been scrolled into view for the chunk
  // ID currently shown. The first window should be centered; after that the
  // panel should hold still.
  const placed = useRef(false);
  // The scroll position as it looked when "read earlier" was pressed. See
  // the effect below.
  const anchor = useRef<{ top: number; height: number } | null>(null);

  // Switching passage — the neighbor list opens the panel for a different
  // one — restarts the window. Otherwise the new passage would inherit the
  // previous one's expansion.
  useEffect(() => {
    setBefore(START);
    setAfter(START);
    setData(null);
    placed.current = false;
    anchor.current = null;
  }, [chunkId]);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    // The text already shown should stay put while the window grows:
    // resetting `data` here would swap the chapter for skeleton rows on
    // every click, and the reader would lose the spot they just found. Only
    // switching passage clears the panel, and that's done in the effect
    // above.
    setGrowing(true);

    fetch(`/api/context?chunkId=${chunkId}&before=${before}&after=${after}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await readJson<ContextWindowPayload & { error?: string }>(
          res,
        );
        if (!res.ok) throw new Error(json.error ?? t("context.failed"));
        setData(json);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(
          err instanceof ApiError
            ? t("result.unknownError")
            : err instanceof Error
              ? err.message
              : String(err),
        );
      })
      .finally(() => setGrowing(false));

    return () => controller.abort();
  }, [chunkId, before, after, t]);

  /**
   * The panel should hold still while it grows.
   *
   * It used to scroll the quoted passage to the center on *every* response,
   * which made "read on" unusable: you'd read down through the chapter,
   * click for more, and get thrown back to the passage you'd left long ago.
   * The reasoning behind that line was still sound — text added above
   * pushes everything down, and without a countermeasure "read earlier"
   * jumps just as badly in the other direction.
   *
   * The fix is to compensate instead of centering: the scroll position is
   * shifted by exactly how much the document grew above it, so the line
   * being read stays in the same spot on screen. "Read on" only appends
   * below and needs nothing. Centering remains for the very first window,
   * where the passage should actually be sought out for the reader.
   *
   * `useLayoutEffect`, not `useEffect`: the adjustment must happen in the
   * same frame the new text is painted, or you see the jump this was meant
   * to avoid.
   */
  useLayoutEffect(() => {
    if (!data) return;
    const el = scroller.current;
    if (!el) return;

    if (!placed.current) {
      mark.current?.scrollIntoView({ block: "center" });
      placed.current = true;
      return;
    }

    const from = anchor.current;
    anchor.current = null;
    if (from) el.scrollTop = from.top + (el.scrollHeight - from.height);
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // The background shouldn't scroll while the panel is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const readEarlier = () => {
    const el = scroller.current;
    if (el) anchor.current = { top: el.scrollTop, height: el.scrollHeight };
    setBefore((current) => Math.min(current * 2, MAX));
  };

  const readOn = () => setAfter((current) => Math.min(current * 2, MAX));

  const moreButton = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={growing}
      aria-busy={growing}
      className="cursor-pointer w-full rounded-md border border-parchment-300 bg-parchment-50 px-3 py-2 text-xs font-medium text-ink-600 transition hover:border-accent-600 hover:bg-accent-600/8 hover:text-accent-700 disabled:cursor-wait disabled:opacity-60"
    >
      {growing ? t("context.loading") : label}
    </button>
  );

  return (
    <div
      /* The dimming behind the panel is ink, not black, and 40 percent, not
         50: the blur already makes the distinction between in front and
         behind, and a darker backdrop behind a parchment sheet looks like a
         spotlight. */
      className="animate-menu-backdrop-in fixed inset-0 z-50 flex justify-end bg-ink-900/40 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        ref={panel}
        // `role="dialog"` and its label belong on the panel that's
        // actually the dialog, not the backdrop behind it — a screen
        // reader announcing the dialog should land on the title, not on an
        // unlabeled full-screen click target.
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        /* `shadow-lift`, not Tailwind's `shadow-2xl`: the latter is black,
           and a gray shadow against yellow paper looks dirty — the same
           reasoning noted at the shadow token in globals.css.

           The same slide-in as the hamburger menu's panel — another sheet
           that enters from the same edge, so it should arrive the same way.
           `globals.css` already honors reduced motion for that animation;
           this rides along on the same rule instead of needing its own. */
        className="animate-menu-slide-in flex h-full w-full max-w-2xl flex-col border-l border-parchment-300 bg-parchment-0 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-parchment-200 px-6 py-4">
          <div>
            <p id={titleId} className="font-serif text-lg text-ink-900">
              {data ? `${data.author}, ${data.title}` : t("context.loading")}
            </p>
            {data?.locator && (
              <p className="mt-0.5 text-sm text-ink-400">
                {cleanLocator(data.locator)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            /* Same drawn mark as the menu's own close button — see `CloseIcon`. */
            className="cursor-pointer shrink-0 rounded-md p-1.5 text-ink-400 transition hover:bg-parchment-100 hover:text-ink-800"
          >
            <CloseIcon size={18} />
          </button>
        </header>

        {/* A non-scrolling strip, not folded into the article below: a
            chapter-length window scrolls, and an action row that scrolled
            away with it would be a click-then-scroll-back for every use.
            This is the only place in the app a neighbor's or a work
            listing's passage can be saved or cited at all — until now,
            reading one here was the end of the road. */}
        {data && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-parchment-200 px-6 py-3 text-xs text-ink-400">
            <SaveToProject chunkId={chunkId} prompt={prompt} relevance="" />
            <CopyButton
              text={() =>
                asMarkdown(
                  {
                    workId: data.workId,
                    author: data.author,
                    title: data.title,
                    translator: data.translator,
                    locator: data.locator,
                    text: data.passage,
                    source: data.source,
                    sourceUrl: data.sourceUrl,
                    year: data.year,
                  },
                  { locale },
                )
              }
              label={t("passage.copyQuote")}
              done={t("passage.quoteCopied")}
            />
            {/* Litteraturbanken's editions are CC-BY: the source must be
                credited and linked here too, not just in the hit list. */}
            {data.sourceUrl && (
              <a
                href={data.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
              >
                {SOURCE_LABEL[data.source] ?? t("passage.sourceFallback")} ↗
              </a>
            )}
          </div>
        )}

        <div ref={scroller} className="flex-1 overflow-y-auto px-6 py-6">
          {error && (
            <p role="alert" className="text-sm text-accent-700">
              {error}
            </p>
          )}

          {!data && !error && (
            /* The rows are different lengths, with a short last one. Eight
               equally-wide blocks read as a loading table; what's coming is
               a piece of prose, and the wait should look like what it's
               waiting for. */
            <div className="space-y-3" aria-hidden>
              {SKELETON_WIDTHS.map((width, i) => (
                <div
                  key={i}
                  className={`h-4 animate-pulse rounded bg-parchment-100 motion-reduce:animate-none ${width}`}
                />
              ))}
            </div>
          )}

          {data && (
            <>
              {/* The button disappears at the start of the work — otherwise
                  you'd click into thin air and get an unchanged response
                  without understanding why. */}
              {!data.atStart && before < MAX && (
                <div className="mb-5">
                  {moreButton(t("context.readEarlier"), readEarlier)}
                </div>
              )}

              {/* The text is rendered in three parts so the quoted section
                  can be highlighted. Italics starting before the passage and
                  ending inside it therefore can't be paired up, and its
                  underscore is left standing — a visible mark is better than
                  a guess at where the emphasis ended. */}
              {/* The surrounding context is a chapter to read, not a label
                  to skim: the text around it is therefore set in ink-600
                  (8.9:1), not the muted tone, which gave 3.7:1 for running
                  serif at body size. The distinction from the quoted section
                  is instead carried by the highlight — darker ink and a
                  stronger accent tone. */}
              {/* Text figures — see the same property on the quote in
                  `PassageAccordion`; this is the same chapter, just longer. */}
              <article
                lang={data.language}
                className="font-serif text-[1.0625rem] leading-[1.75] whitespace-pre-wrap text-ink-600 [font-variant-numeric:oldstyle-nums]"
              >
                <span>{emphasized(data.before)}</span>
                <mark
                  ref={mark}
                  className="bg-accent-600/15 text-ink-900 [box-decoration-break:clone]"
                >
                  {emphasized(data.passage)}
                </mark>
                <span>{emphasized(data.after)}</span>
              </article>

              {!data.atEnd && after < MAX && (
                <div className="mt-5">
                  {moreButton(t("context.readOn"), readOn)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
