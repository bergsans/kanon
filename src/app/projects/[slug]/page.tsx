import { notFound } from "next/navigation";
import { cache } from "react";
import { PageHeader } from "@/app/components/smart-compositions/PageHeader";
import { ProjectHeader } from "@/app/components/smart-compositions/ProjectHeader";
import { ProjectView } from "@/app/components/smart-compositions/ProjectView";
import { bcp47, t, tn } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { listAllTags, loadProject } from "@/lib/projects";
import { projectsHref } from "@/lib/routes";

// The project lives in SQLite and changes while the app runs — and the
// passages are read from the corpus on every view, so a cached version
// would be wrong as soon as a work is re-indexed.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

// `generateMetadata` and the page component both need the same project —
// React's `cache()` de-dupes the two calls within one request, the same
// reason `s/[id]/page.tsx` wraps `loadSearch`.
const cachedLoadProject = cache(loadProject);

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const locale = await getLocale();
  const project = cachedLoadProject(slug);
  return {
    title: project
      ? t(locale, "meta.project", { title: project.title })
      : t(locale, "meta.projectMissing"),
    description:
      project?.description ||
      project?.passages
        .slice(0, 3)
        .map((p) => `${p.passage.author}, ${p.passage.title}`)
        .join(" · "),
  };
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getLocale();
  const project = cachedLoadProject(slug);
  if (!project) notFound();
  const existingTags = listAllTags();

  const when = new Date(project.createdAt).toLocaleDateString(bcp47(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="mx-auto max-w-3xl px-6 pt-16 pb-12 sm:pb-16">
      <PageHeader
        locale={locale}
        href={projectsHref(locale)}
        label={t(locale, "nav.projects")}
      >
        <div className="mt-8">
          <ProjectHeader
            slug={project.slug}
            title={project.title}
            description={project.description}
            tags={project.tags}
            existingTags={existingTags}
          />
        </div>
        <p className="mt-2 text-xs text-ink-400">
          {t(locale, "project.created", { date: when })}
        </p>

        {/* The dropped passages are shown in the page header, not in a
            footnote. A project that has quietly gotten shorter is only
            discovered once the essay is being written; one that says three
            rows were dropped can be searched again while you still remember
            what they were. */}
        {project.lost > 0 && (
          <p className="mt-4 rounded border border-accent-600/40 border-l-[3px] border-l-accent-600 bg-accent-600/8 px-3 py-2 text-xs text-accent-700">
            {tn(locale, "project.lost", project.lost)}
          </p>
        )}
      </PageHeader>

      <ProjectView
        slug={project.slug}
        title={project.title}
        entries={project.passages}
        lostEntries={project.lostPassages}
      />
    </main>
  );
}
