import Link from "next/link";
import type { ReactNode } from "react";
import { t, type Locale } from "@/lib/i18n";
import { LocaleSwitch } from "./LocaleSwitch";
import { TextSizeSwitch } from "../ui/TextSizeSwitch";

/**
 * The way home: wordmark, arrow, and where the link leads — the breadcrumb
 * every page below the home page carries, plus the optional heading and
 * rule a page with its own title adds beneath it.
 *
 * Seven copies of this markup used to live in seven pages and had already
 * drifted apart from each other: `print:hidden` was missing on the switches
 * in some of them, the header's bottom margin was `mb-10` in some and
 * `mb-12` in others with no reason tied to content, and the `h1` carried
 * `sm:text-4xl` on some pages but not on `projekt/page.tsx`. One component
 * means the seven can't drift again one at a time.
 *
 * `title` is what decides whether this is the compact breadcrumb-only header
 * (a saved search, the corpus 404) or the full one with its own heading (the
 * corpus, the projects list, the cost page) — the margin below follows from
 * that same flag, since a bare breadcrumb needs less room under it than a
 * heading does. `children` is whatever a page hangs beneath the rule: an
 * intro paragraph, the corpus's language bar, a project's editable title.
 */
export function PageHeader({
  locale,
  href,
  label,
  title,
  children,
  onClick,
}: {
  locale: Locale;
  href: string;
  label: string;
  title?: string;
  children?: ReactNode;
  /**
   * Only `HomeSearchShell` passes this: there, `href` points at the route
   * already on screen, so the `Link` alone won't clear the answer still
   * showing beneath it. Next still runs its own navigation alongside this —
   * nothing here calls `preventDefault`.
   */
  onClick?: () => void;
}) {
  return (
    <header className={title ? "mb-12" : "mb-10"}>
      <div className="flex items-start justify-between gap-6">
        <Link
          href={href}
          onClick={onClick}
          className="group inline-flex items-baseline gap-2 text-ink-900"
        >
          <span
            aria-hidden
            className="text-lg text-ink-400 transition group-hover:-translate-x-0.5 group-hover:text-accent-700"
          >
            ←
          </span>
          <span className="font-serif text-2xl tracking-tight transition group-hover:text-accent-700">
            {t(locale, "app.name")}
          </span>
          <span className="text-xs text-ink-400 transition group-hover:text-accent-700">
            {label}
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-4 print:hidden">
          <TextSizeSwitch />
          <LocaleSwitch />
        </div>
      </div>

      {title && (
        <>
          <h1 className="mt-8 font-serif text-3xl tracking-tight text-ink-900 sm:text-4xl">
            {title}
          </h1>
          {/* The same rule as under the home page's wordmark — the pages
              should read as the same publication. */}
          <div aria-hidden className="mt-3 h-0.5 w-10 bg-accent-600" />
        </>
      )}

      {children}
    </header>
  );
}
