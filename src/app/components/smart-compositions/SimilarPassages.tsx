"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, readJson } from "@/lib/fetch-json";
import type { Genre, Language, Source } from "@/lib/taxonomy";
import { genreLabel } from "@/lib/taxonomy";
import { cleanLocator } from "@/lib/locator";
import { quoted, shortLocator } from "../ui/format";
import { useT } from "../providers/LocaleProvider";

export interface SimilarPassage {
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
  similarity: number;
  sourceUrl: string | null;
}

/**
 * The neighbors of a passage — the same thing said by someone else.
 *
 * The list is flat and not collapsible. An accordion inside an accordion
 * makes navigation impossible to keep track of, and the neighbors aren't an
 * answer but a path onward: the row should say who's speaking and roughly
 * what about, then lead to the text in its own context.
 */
export function SimilarPassages({
  chunkId,
  onOpenContext,
}: {
  chunkId: number;
  onOpenContext: (chunkId: number) => void;
}) {
  const { t, deathEra, locale } = useT();
  const [passages, setPassages] = useState<SimilarPassage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A fresh controller per `load()` call, so a component unmounted mid-fetch
  // (the accordion row collapsed, the search replaced) doesn't call
  // `setState` on the way out.
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function load() {
    // Fetched once is enough. The vector index doesn't change between two
    // clicks — but a failed fetch leaves `passages` at `null`, so a retry
    // after an error still goes through, not just the first click.
    if (passages || loading) return;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch(`/api/similar?chunkId=${chunkId}`, {
        signal: controller.signal,
      });
      const json = await readJson<{
        passages?: SimilarPassage[];
        error?: string;
      }>(res);
      if (!res.ok || !json.passages) {
        throw new Error(json.error ?? t("similar.failed"));
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
        {loading ? t("similar.searching") : t("similar.heading")}
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
        {t("similar.heading")}
        {/* The app shows a price on every query. Noting that this path
            is free is information, not modesty — it's the difference
            between moving on and paying to move on. */}
        <span className="ml-2 font-normal normal-case tracking-normal text-ink-400">
          {t("similar.free")}
        </span>
      </p>

      {passages?.length === 0 && (
        <p className="mt-2 text-xs text-ink-400">{t("similar.none")}</p>
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
                <span className="block font-serif text-[0.9375rem] leading-snug text-ink-900">
                  {p.author}
                  <span className="text-ink-600">, {p.title}</span>
                </span>
                <span className="mt-0.5 block text-xs text-ink-400">
                  {deathEra(p.year)} · {genreLabel(p.genre, locale)}
                  {p.locator && (
                    <span title={cleanLocator(p.locator)}> · {shortLocator(p.locator)}</span>
                  )}
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
