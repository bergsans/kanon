import Link from "next/link";
import { PageHeader } from "@/app/components/smart-compositions/PageHeader";
import { bcp47, t, tn } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { listProjects } from "@/lib/projects";
import { projectHref } from "@/lib/routes";

// Projects live in SQLite and are added while the app is running.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: t(locale, "meta.projects"),
    description: t(locale, "meta.projectsDescription"),
  };
}

/**
 * All projects.
 *
 * No "create project" button here, and that's deliberate. A project doesn't
 * begin with a name but with a passage worth keeping — the save button
 * inside a passage creates it, and an empty folder to fill in later is a
 * page nobody visits twice.
 */
export default async function ProjectsPage() {
  const locale = await getLocale();
  const projects = listProjects();

  return (
    <main className="mx-auto max-w-3xl px-6 pt-16 pb-12 sm:pb-16">
      <PageHeader
        locale={locale}
        href="/"
        label={t(locale, "nav.search")}
        title={t(locale, "project.heading")}
      >
        <p className="mt-4 max-w-xl text-ink-600">
          {t(locale, "project.intro")}
        </p>
      </PageHeader>

      {projects.length === 0 ? (
        <p className="max-w-xl text-sm text-ink-400">
          {t(locale, "project.listEmpty")}
        </p>
      ) : (
        /* The register, not the card: a saved project is the same list
           shape a results list or an open project's own passages are (see
           `ProjectView`'s comment on that), and a list of projects is no
           different — a rule for the top edge, rows running full width, no
           card holding them. */
        <ul className="divide-y divide-parchment-200 border-t-2 border-accent-600">
          {projects.map((p) => (
            <li key={p.slug}>
              <Link
                href={projectHref(locale, p.slug)}
                className="block px-3 py-3 transition hover:bg-parchment-100"
              >
                <span className="block font-serif text-[1.0625rem] leading-snug text-ink-900">
                  {p.title}
                </span>
                <span className="mt-0.5 block text-xs text-ink-400">
                  {tn(locale, "project.count", p.passageCount)} ·{" "}
                  {t(locale, "project.created", {
                    date: new Date(p.createdAt).toLocaleDateString(
                      bcp47(locale),
                      { year: "numeric", month: "long", day: "numeric" },
                    ),
                  })}
                </span>
                {p.description && (
                  <span className="mt-1 block text-sm text-ink-600">
                    {p.description}
                  </span>
                )}
                {p.tags.length > 0 && (
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.tags.map((tag) => (
                      <span
                        key={tag}
                        className="border border-parchment-300 bg-parchment-50 px-2 py-0.5 text-[0.6875rem] text-ink-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
