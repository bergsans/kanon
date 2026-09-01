"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { projectAsMarkdown } from "@/lib/citation";
import type { LostPassage, SavedPassage } from "@/lib/projects";
import { dropFromProject, forgetProject, saveNote } from "../../actions";
import { ExportMenu } from "./ExportMenu";
import { useT } from "../providers/LocaleProvider";
import { PassageAccordion } from "./PassageAccordion";

/**
 * A project as a list.
 *
 * The same accordion as the results list, deliberately: a saved passage is
 * the same thing as a found one, and it should look the same. The
 * difference lives inside the opened passage — that's where the query it
 * came from and the box for the personal note sit, i.e. what turns the list
 * into someone's work rather than a search result.
 *
 * The order is the one the passages were collected in and can't be
 * re-sorted. A results list has a query to be relevant to; a project has
 * none, and the order the passages were picked in carries a history that
 * sorting would erase.
 */
export function ProjectView({
  slug,
  title,
  entries,
  lostEntries = [],
}: {
  slug: string;
  title: string;
  entries: SavedPassage[];
  /**
   * Saved passages whose text can no longer be shown — see `LostPassage`'s
   * own comment in `projects.ts`. Rendered dimmed, below the real list:
   * the prompt and the note are the only things about them still true, and
   * until now there was no way to read either again or to remove the row.
   * Optional and defaulted for the same reason `position` is optional on
   * `PassageAccordion` — existing callers (and stories) that never had a
   * notion of a lost passage shouldn't have to invent an empty array.
   */
  lostEntries?: LostPassage[];
}) {
  const { t, tn } = useT();
  const [open, setOpen] = useState<Set<number>>(new Set());
  // Removed rows are hidden immediately rather than waiting for the
  // server's re-render: the same tradeoff the archive list makes, for the
  // same reason. If the call fails the row reappears. Shared between the
  // real list and the lost one below — a chunk ID is in at most one of
  // `entries`/`lostEntries` at a time, so the two never collide in here.
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [, startTransition] = useTransition();

  const toggle = useCallback((chunkId: number) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(chunkId)) next.add(chunkId);
      return next;
    });
  }, []);

  const visible = entries.filter((e) => !removed.has(e.passage.chunkId));
  const visibleLost = lostEntries.filter((e) => !removed.has(e.chunkId));

  // A project is an essay in progress, and on paper an essay isn't read one
  // collapsed title at a time. Printing opens every passage for the
  // duration of the print and puts back whatever was open before —
  // `beforeOpen` holds that snapshot, not state, since restoring it should
  // never itself trigger a render the reader sees mid-print.
  const beforeOpen = useRef<Set<number> | null>(null);
  useEffect(() => {
    // Reads and writes `open` through the functional form so this effect
    // never needs `open` itself in its dependency list — re-registering the
    // print listeners on every single row toggle would be needless churn
    // for a pair of handlers that only ever fire around an actual print.
    const expand = () => {
      setOpen((prev) => {
        beforeOpen.current = prev;
        return new Set(visible.map((e) => e.passage.chunkId));
      });
    };
    const restore = () => {
      if (beforeOpen.current) setOpen(beforeOpen.current);
      beforeOpen.current = null;
    };
    window.addEventListener("beforeprint", expand);
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("beforeprint", expand);
      window.removeEventListener("afterprint", restore);
    };
  }, [visible]);

  const remove = (chunkId: number) => {
    setRemoved((prev) => new Set(prev).add(chunkId));
    startTransition(async () => {
      try {
        await dropFromProject(slug, chunkId);
      } catch {
        setRemoved((prev) => {
          const next = new Set(prev);
          next.delete(chunkId);
          return next;
        });
      }
    });
  };

  // Empty means nothing left to show at all — a project can be down to
  // zero intact passages and still have lost ones worth reading (their
  // notes) and removing, so this checks both lists, not just `visible`.
  if (visible.length === 0 && visibleLost.length === 0) {
    return <p className="text-sm text-ink-400">{t("project.empty")}</p>;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        {/* The rule, not just the label: a project is the same register as
            the results list (see the comment on the list below), and the
            results list's own count heading carries this same trailing
            hairline. */}
        <h2 className="eyebrow eyebrow-rule flex-1">
          {tn("project.count", visible.length)}
        </h2>
        <div className="flex items-center gap-4 text-xs print:hidden">
          <ExportMenu
            filename={title}
            passages={visible.map((e) => e.passage)}
            /* The project's own document, not the search's: here there are
               two notes under each quote — Claude's rationale and the
               reader's own — and the reader's own is the one that carries
               over into the essay. */
            markdown={(locale) =>
              projectAsMarkdown(
                title,
                visible.map((e) => ({
                  passage: e.passage,
                  prompt: e.prompt,
                  note: e.note,
                })),
                { locale },
              )
            }
          />
        </div>
      </div>

      {/* The register, not the card: a project is a kept set of the same
          passages the results list shows, and it should look like the same
          register — a rule for the sheet's top edge, rows running the full
          width, no card holding them — not like a different, boxed kind of
          list just because it's a saved one. See the results list's own
          comment on this in `CanonSearch.tsx`. */}
      <div className="divide-y divide-parchment-200 border-t-2 border-accent-600">
        {visible.map((entry) => (
          <PassageAccordion
            key={entry.passage.chunkId}
            passage={entry.passage}
            open={open.has(entry.passage.chunkId)}
            onToggle={() => toggle(entry.passage.chunkId)}
            /* No slug: the search the passage came from may have been
               deleted from the archive since, and "more from this work"
               shouldn't guess at one that may no longer exist. The query is
               still carried along — someone saving the passage on to
               another project shouldn't lose the origin just because it's
               shown here instead of in a results list. */
            search={{ slug: null, prompt: entry.prompt }}
          >
            <div className="mt-5 border-t border-parchment-200 pt-4">
              {entry.prompt && (
                <p className="text-xs text-ink-400 italic">
                  {t("project.fromSearch", { prompt: entry.prompt })}
                </p>
              )}
              <Note
                slug={slug}
                chunkId={entry.passage.chunkId}
                initial={entry.note}
              />
              <button
                type="button"
                onClick={() => remove(entry.passage.chunkId)}
                className="cursor-pointer mt-3 text-xs text-ink-400 underline decoration-dotted underline-offset-4 transition hover:text-accent-700 print:hidden"
              >
                {t("project.remove")}
              </button>
            </div>
          </PassageAccordion>
        ))}
      </div>

      {/* Dimmed, and its own hairline register rather than `PassageAccordion`
          rows — there's no title, author or quote left to give a row that
          shape, only the two things `project_passages` still has untouched:
          the question it came from and the note written about it. */}
      {visibleLost.length > 0 && (
        <div className="border-t border-parchment-200 pt-4">
          <h2 className="eyebrow">
            {tn("project.lostHeading", visibleLost.length)}
          </h2>
          <ul className="mt-3 divide-y divide-parchment-200">
            {visibleLost.map((entry) => (
              <li key={entry.chunkId} className="py-3 first:pt-0 last:pb-0">
                {entry.prompt && (
                  <p className="text-xs text-ink-400 italic">
                    {t("project.fromSearch", { prompt: entry.prompt })}
                  </p>
                )}
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-400">
                  {entry.note || (
                    <span className="italic">{t("project.lostNoNote")}</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => remove(entry.chunkId)}
                  className="cursor-pointer mt-2 text-xs text-ink-400 underline decoration-dotted underline-offset-4 transition hover:text-accent-700 print:hidden"
                >
                  {t("project.remove")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Deletion sits last, not in the page header: it's the rarest thing
          done to a project, and a button that removes everything shouldn't
          sit next to the one clicked most often. A hairline and extra room
          above it now do the same job visually that used to rest on
          position alone — the register above ends in its own accent rule
          at the top, so without a break of its own here this link read as
          one more row in the list instead of a separate, graver action
          below it. */}
      <p className="mt-6 border-t border-parchment-200 pt-4 print:hidden">
        <button
          type="button"
          onClick={() => {
            if (!window.confirm(t("project.deleteConfirm"))) return;
            startTransition(() => forgetProject(slug));
          }}
          className="cursor-pointer text-xs text-ink-400 underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
        >
          {t("project.delete")}
        </button>
      </p>
    </section>
  );
}

/**
 * The note under a saved passage.
 *
 * Saved on button press and on blur, not while typing — autosave per
 * keystroke would have sent a call per character or required a debounce
 * delay to guess at, and the text here is a thought being worked out to
 * completion, not a form field. Blur was added alongside the button, not
 * instead of it: leaving the field — by clicking elsewhere on the page, or
 * away entirely — used to discard whatever had just been typed with no
 * warning at all, and "the thought is finished" is exactly as true of
 * moving on as it is of pressing the button.
 */
function Note({
  slug,
  chunkId,
  initial,
}: {
  slug: string;
  chunkId: number;
  initial: string;
}) {
  const { t } = useT();
  const [note, setNote] = useState(initial);
  // What the server has. Distinct from `initial`, which is the prop the
  // page was rendered with and stays fixed after a save — without this line
  // the field would stay dirty forever after the first save, and the
  // confirmation would never show.
  const [stored, setStored] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = note.trim() !== stored.trim();

  // Guarded the same way the button's own `disabled` already was: a blur
  // with nothing changed, or one that lands while a save is still in
  // flight, has nothing to do. `saveNote` overwrites rather than appends,
  // so the rare case where both the button and a blur fire for the same
  // edit — a click that moves focus off the field and onto the button in
  // one gesture — sends the same text twice rather than corrupting anything.
  const save = () => {
    if (pending || !dirty) return;
    startTransition(async () => {
      await saveNote(slug, chunkId, note);
      setStored(note);
      setSaved(true);
    });
  };

  return (
    <div className="mt-3">
      <label className="block text-xs font-semibold uppercase tracking-widest text-ink-600">
        {t("project.note")}
      </label>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        onBlur={save}
        rows={3}
        placeholder={t("project.notePlaceholder")}
        className="mt-1.5 block w-full resize-y rounded border border-parchment-300 bg-parchment-0 px-3 py-2 text-sm leading-relaxed text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-accent-600 print:hidden"
      />
      {/* A textarea's value isn't reliably part of what a browser prints —
          this note is exactly the kind of text that should survive onto
          paper, so it gets its own plain-text line for that case instead of
          depending on the field it's edited in. */}
      {note.trim() && (
        <p className="mt-1.5 hidden whitespace-pre-wrap text-sm leading-relaxed text-ink-900 print:block">
          {note}
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-3 text-xs print:hidden">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={save}
          /* A small solid button, not the chip's border-and-fill: a chip
             marks a selection that persists, this saves a note — the same
             difference `SearchBox`'s own comment draws between the two
             shapes. Solid accent with parchment text is the search box's
             own submit button at this size, so the two "commit" actions in
             the app read as one kind of control. */
          className="cursor-pointer bg-accent-600 px-2 py-1 font-semibold text-parchment-0 transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-ink-400"
        >
          {pending ? t("project.noteSaving") : t("project.noteSave")}
        </button>
        {saved && !dirty && (
          <span role="status" className="text-ink-400">
            {t("project.noteSaved")}
          </span>
        )}
      </div>
    </div>
  );
}
