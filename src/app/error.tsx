"use client";

import { useT } from "./components/providers/LocaleProvider";

/**
 * Catches a render/data error that Next's own segment boundary hits — a
 * locked or mid-rebuild database, most likely, since several pages read
 * SQLite directly in the component body. Without this file the reader falls
 * through to Next's generic, English, unstyled fallback, which breaks the
 * app's one rule: everything the reader sees is in their own language.
 *
 * Only wraps the pages below the root layout (`layout.tsx`) — an error
 * thrown there or in `generateMetadata` never reaches this file at all, see
 * `global-error.tsx`'s own comment.
 */
export default function Error({ retry }: { error: Error; retry: () => void }) {
  const { t } = useT();
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-6 py-24">
      <div className="w-full rounded-lg border border-accent-600/40 border-l-[3px] border-l-accent-600 bg-accent-600/8 px-5 py-4">
        <p className="font-medium text-accent-700">{t("error.pageTitle")}</p>
        <p className="mt-1 text-sm text-ink-600">{t("error.pageBody")}</p>
      </div>
      <button
        type="button"
        // `retry()`, not `reset()`: it re-fetches the segment's data before
        // re-rendering, which matters here — a "database locked" error is
        // exactly the kind that's since become stale, and `reset()` alone
        // just clears the error boundary and re-renders with the same data
        // that failed the first time.
        onClick={retry}
        className="cursor-pointer rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-parchment-0 transition hover:bg-accent-700"
      >
        {t("error.retry")}
      </button>
    </div>
  );
}
