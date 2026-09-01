import Link from "next/link";
import { PageHeader } from "@/app/components/smart-compositions/PageHeader";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { projectsHref } from "@/lib/routes";

/**
 * A project that doesn't exist.
 *
 * The same reasoning as the permalink's own 404: the default page has no
 * navigation at all, and someone who just deleted a project — or followed
 * an old link to one — should be led to the list instead of being stuck in
 * a dead end.
 */
export default async function ProjectNotFound() {
  const locale = await getLocale();

  return (
    <main className="mx-auto max-w-3xl px-6 pt-16 pb-12 sm:pb-16">
      <PageHeader locale={locale} href="/" label={t(locale, "nav.search")} />

      <p className="font-serif text-xl text-ink-900">
        {t(locale, "notfound.projectTitle")}
      </p>
      <p className="mt-2 max-w-xl text-ink-600">
        {t(locale, "notfound.projectBody")}{" "}
        <Link
          href={projectsHref(locale)}
          className="text-accent-700 underline decoration-dotted underline-offset-4"
        >
          {t(locale, "notfound.projectLink")}
        </Link>
        .
      </p>
    </main>
  );
}
