"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, readJson } from "@/lib/fetch-json";
import type { Genre, Language, Source } from "@/lib/taxonomy";
import { genreLabel } from "@/lib/taxonomy";
import { quoted, shortLocator } from "../ui/format";
import { useT } from "../providers/LocaleProvider";

export interface WorkPassageRow {
  chunkId: number;
  workId: string;
  author: string;
  title: string;
  translator: string | null;
  genre: Genre;
  language: Language;
  source: Source;
  year: number;
  locator: string | null;
  text: string;
  sourceUrl: string | null;
}

/**
 * More passages from the work currently being read — the ones the
 * diversity filter discarded.
 *
 * The neighbor list beside it ("more like this") deliberately excludes the
 * whole author's body of work: its question is who ELSE says this. This
 * list asks the opposite question, and both are needed. When a work turns
 * out to be the essay's center of gravity, seven passages out of
 * sixty-four is a cap you want past, and the alternative — rephrasing the
 * query until the cap falls differently — is a paid search to reach
 * passages that were already retrieved.
 *
 * No score is shown on the rows. The cross-encoder has ranked them, but its
 * numbers are only comparable within the same call, and a number in the
 * list would invite exactly the comparison it can't support.
 */
export function MoreFromWork({
  slug,
  workId,
  onOpenContext,
}: {
  /** The search the row is shown from. The server reads the query and the selection from it. */
  slug: string;
  workId: string;
  onOpenContext: (chunkId: number) => void;
}) {
  const { t, deathEra, locale } = useT();
  const [passages, setPassages] = useState<WorkPassageRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A fresh controller per `load()` call, so a component unmounted mid-fetch
  // doesn't call `setState` on the way out.
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function load() {
    // Fetched once is enough. Neither the index nor the search changes in
    // the meantime — but a failed fetch leaves `passages` at `null`, so a
    // retry after an error still goes through, not just the first click.
    if (passages || loading) return;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch(
        `/api/work?slug=${encodeURIComponent(slug)}&workId=${encodeURIComponent(workId)}`,
        { signal: controller.signal },
      );
      const json = await readJson<{
        passages?: WorkPassageRow[];
        error?: string;
      }>(res);
      if (!res.ok || !json.passages) {
        throw new Error(json.error ?? t("work.failed"));
      }
      setPassages(json.passages);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(
        err instanceof ApiError
          ? t("result.unknownError")
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  if (!passages && !error) {
    return (
      <button
        type="button"
        onClick={load}
        disabled={loading}
        aria-busy={loading}
        className="cursor-pointer underline decoration-dotted underline-offset-4 transition hover:text-accent-700 disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? t("work.searching") : t("work.heading")}
      </button>
    );
  }

  if (error) {
    return (
      <p role="alert" className="mt-4 text-xs text-accent-700">
        {error}{" "}
        <button
          type="button"
          onClick={load}
          className="cursor-pointer underline decoration-dotted underline-offset-4 hover:text-accent-900"
        >
          {t("error.retry")}
        </button>
      </p>
    );
  }

  return (
    <div className="mt-4 w-full border-t border-parchment-200 pt-4">
      <p className="eyebrow">
        {t("work.heading")}
        {/* The same disclosure the neighbor list carries, and for the same
            reason: the app shows a price for every query, so noting that
            this path is free is information, not modesty. */}
        <span className="ml-2 font-normal normal-case tracking-normal text-ink-400">
          {t("work.free")}
        </span>
      </p>

      {passages?.length === 0 && (
        <p className="mt-2 text-xs text-ink-400">{t("work.none")}</p>
      )}

      {passages && passages.length > 0 && (
        <ul className="mt-2 space-y-2">
          {passages.map((p) => (
            <li key={p.chunkId}>
              <button
                type="button"
                onClick={() => onOpenContext(p.chunkId)}
                className="cursor-pointer group block w-full rounded-md px-2 py-1.5 text-left transition hover:bg-parchment-100"
              >
                {/* The locator comes first and the author not at all: every
                    row is the same work by the same person, and repeating
                    the name eight times says nothing. Book and chapter are
                    what distinguishes the rows. */}
                <span className="block font-serif text-[0.9375rem] leading-snug text-ink-900">
                  {p.locator ? shortLocator(p.locator) : p.title}
                </span>
                <span className="mt-0.5 block text-xs text-ink-400">
                  {deathEra(p.year)} · {genreLabel(p.genre, locale)}
                </span>
                <span
                  lang={p.language}
                  className="mt-1 block font-serif text-sm leading-relaxed text-ink-600 italic"
                >
                  {quoted(p.text, locale, 130)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
