import Link from "next/link";
import { PageHeader } from "./components/smart-compositions/PageHeader";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

/**
 * The app-wide 404 — any address that matches no route at all.
 *
 * Without this file Next falls through to its own generic, English,
 * unstyled fallback (confirmed against the framework's own docs on
 * `not-found.js`), which breaks the one rule every other page in the app
 * follows: everything the reader sees is in their own language, and leads
 * somewhere. `/s/[id]` and `/projects/[slug]` already have their own more
 * specific 404s for "this particular search/project is gone"; this is the
 * generic one, for a URL that was never a route to begin with.
 */
export default async function NotFound() {
  const locale = await getLocale();

  return (
    <main className="mx-auto max-w-3xl px-6 pt-16 pb-12 sm:pb-16">
      <PageHeader locale={locale} href="/" label={t(locale, "nav.allQuestions")} />

      <p className="font-serif text-xl text-ink-900">
        {t(locale, "notfound.genericTitle")}
      </p>
      <p className="mt-2 max-w-xl text-ink-600">
        {t(locale, "notfound.genericBody")}{" "}
        <Link
          href="/"
          className="text-accent-700 underline decoration-dotted underline-offset-4"
        >
          {t(locale, "notfound.link")}
        </Link>
        .
      </p>
    </main>
  );
}
