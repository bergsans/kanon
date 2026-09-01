"use client";

import { t } from "@/lib/i18n";

/**
 * Catches an error thrown by the root layout itself or by its
 * `generateMetadata` — `error.tsx` only wraps the pages *below* the root
 * layout (see its own comment), so a failure in `layout.tsx` before
 * `LocaleProvider` ever mounts falls through past it entirely and would
 * otherwise show Next's generic, unstyled, English-only fallback.
 *
 * Next requires this file to render its own complete `<html>`/`<body>` —
 * it replaces the root layout when active, so nothing the layout normally
 * provides (globals.css, `LocaleProvider`, even `<html lang>`) can be
 * relied on here. That's also why the text below isn't run through `t()`
 * with a resolved locale the way every other error surface in the app is:
 * there's no cookie-read locale to reach without the provider tree that
 * just failed to render, so both languages are shown at once instead of
 * guessing one.
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf6ee",
          color: "#1f1b16",
          fontFamily:
            "ui-serif, Georgia, 'Times New Roman', serif, system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "left" }}>
          <p style={{ fontWeight: 600, fontSize: "1.125rem", margin: 0 }}>
            {t("sv", "error.pageTitle")} / {t("en", "error.pageTitle")}
          </p>
          <p style={{ marginTop: "0.5rem", color: "#544c40" }}>
            {t("sv", "error.pageBody")}
          </p>
          <p style={{ marginTop: "0.25rem", color: "#544c40" }}>
            {t("en", "error.pageBody")}
          </p>
          <button
            type="button"
            onClick={retry}
            style={{
              marginTop: "1rem",
              cursor: "pointer",
              borderRadius: "0.375rem",
              border: "none",
              background: "#9a5b2e",
              color: "#fff",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            {t("sv", "error.retry")} / {t("en", "error.retry")}
          </button>
        </div>
      </body>
    </html>
  );
}
