import Link from "next/link";
import { PageHeader } from "@/app/components/smart-compositions/PageHeader";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

/**
 * A permalink that no longer leads anywhere.
 *
 * This really happens: the search may have been removed from the archive,
 * or it may have become invalid on its own when a work was re-indexed and
 * the passages it pointed to got new IDs. The default 404 has no navigation
 * at all — someone who followed a shared link here would be stuck in a dead
 * end — so this page does the one sensible thing: points back to the search box.
 */
export default async function SearchNotFound() {
  const locale = await getLocale();

  return (
    <main className="mx-auto max-w-3xl px-6 pt-16 pb-12 sm:pb-16">
      <PageHeader locale={locale} href="/" label={t(locale, "nav.allQuestions")} />

      <p className="font-serif text-xl text-ink-900">{t(locale, "notfound.title")}</p>
      <p className="mt-2 max-w-xl text-ink-600">
        {t(locale, "notfound.body")}{" "}
        <Link href="/" className="text-accent-700 underline decoration-dotted underline-offset-4">
          {t(locale, "notfound.link")}
        </Link>
        .
      </p>
    </main>
  );
}
