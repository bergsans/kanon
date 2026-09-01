"use client";

import { useEffect, useRef, useState } from "react";
import { exportFilename, worksAsBibtex, worksAsRis } from "@/lib/citation";
import type { Locale } from "@/lib/i18n";
import type { PassagePayload } from "@/lib/protocol";
import { useCopy } from "../ui/CopyButton";
import { useT } from "../providers/LocaleProvider";

/**
 * The way out of a whole answer.
 *
 * Markdown for the essay — the quotes with Claude's rationales as notes
 * under each one. BibTeX and RIS for the reference manager, and those work
 * on *works*: three quotes from the Republic is one entry, not three.
 *
 * The menu used to filter out the candidates reranking didn't select. That
 * filtering is gone along with them: the answer consists of the selection,
 * and everything in the list carries a rationale along with it.
 *
 * The markdown is passed in as a function rather than built here. The menu
 * is used by two pages, each with its own document — a search has a query
 * at the top, a project has a working title and two notes per quote — but
 * BibTeX and RIS are identical for both, since they operate on works and a
 * work is a work. Adding a mode instead would have made the menu the thing
 * that knows what a project is.
 */
export function ExportMenu({
  filename,
  passages,
  markdown,
}: {
  /** What the downloaded file should be called, before slugging: the query or the title. */
  filename: string;
  passages: PassagePayload[];
  markdown: (locale: Locale) => string;
}) {
  const { t, tn, locale } = useT();
  const [open, setOpen] = useState(false);
  const { copied, copy } = useCopy();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // If reranking selected nothing, there's nothing to export.
  if (passages.length === 0) return null;

  function download(text: string, extension: string, mime: string) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename(filename, extension);
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  const item =
    "block w-full px-3 py-2 text-left text-xs text-ink-600 transition hover:bg-parchment-100 hover:text-accent-700";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="cursor-pointer text-ink-400 underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
      >
        {copied ? t("export.copied") : t("export.label")}
      </button>

      {open && (
        <div
          role="menu"
          /* A menu floating over the page has to sit *on* it: the same
             parchment-white sheet as the results list, a visible border,
             and the heavy shadow. It used to be the ground's own color and
             blended into whatever it was covering. */
          className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-lg border border-parchment-300 bg-parchment-0 py-1 shadow-lift"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              copy(markdown(locale));
              setOpen(false);
            }}
          >
            {t("export.markdown")}
            <span className="mt-0.5 block text-ink-400">
              {tn("export.markdownNote", passages.length)}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() =>
              download(markdown(locale), "md", "text/markdown")
            }
          >
            {t("export.downloadMd")}
          </button>

          <div className="my-1 border-t border-parchment-200" />

          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() =>
              download(
                worksAsBibtex(passages, { locale }),
                "bib",
                "application/x-bibtex",
              )
            }
          >
            {t("export.bibtex")}
            <span className="mt-0.5 block text-ink-400">
              {t("export.bibtexNote")}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() =>
              download(
                worksAsRis(passages, { locale }),
                "ris",
                "application/x-research-info-systems",
              )
            }
          >
            {t("export.ris")}
          </button>
        </div>
      )}
    </div>
  );
}
