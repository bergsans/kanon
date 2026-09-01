"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { EFFORT_COOKIE, isEffort, isModelId, PROVIDER_COOKIE } from "@/lib/provider";
import {
  addToProject,
  createProject,
  deleteProject,
  projectsFor,
  removeFromProject,
  setNote,
  updateProject,
  type ProjectChoice,
  type ProjectMeta,
} from "@/lib/projects";
import { projectsHref } from "@/lib/routes";
import { deleteSearch } from "@/lib/searches";

/**
 * Removes a saved search from the archive on the home page.
 *
 * The slug is the only thing the client is allowed to send, and it's looked
 * up on the server: the row is never identified by anything the client made
 * up other than which of the visible links was pointed at.
 *
 * `refresh`, not `revalidatePath`: the list is read directly from SQLite on
 * a page that's already `force-dynamic`, so there's no cache to
 * invalidate — just a view that should re-render with the database's new
 * content, in the same response as the deletion.
 */
export async function forgetSearch(slug: string): Promise<void> {
  if (typeof slug !== "string" || !slug) return;
  deleteSearch(slug);
  refresh();
}

/**
 * Switches the UI language.
 *
 * A server function and not `document.cookie` on the client: the cookie is
 * read by the layout, the pages, and the API routes at render time, and if
 * it's only written in the browser, the server's half of the UI stays on
 * the old language until something else happens to be fetched.
 *
 * `refresh` re-renders the server markup in the same response without
 * unmounting the client. That's the whole reason the switch works mid-
 * answer: the passages, which ones are open, and the cost line live in
 * `useState` and survive the switch — someone changing language to show
 * someone else a result doesn't lose it.
 */
/**
 * The projects a passage belongs to, seen from that passage, for the save menu.
 *
 * A server function and not an API route: the menu needs no stream, no
 * cache header, and no error model of its own — it asks SQLite one question
 * and draws the answer. The routes in `src/app/api` exist for what's
 * expensive or slow (the search streams, the work's passages are scored by
 * a model); this is neither.
 *
 * Read when the menu opens, not when the page renders. An answer has thirty
 * rows each with its own save button, and thirty lookups for a menu that
 * may never open is thirty too many.
 */
export async function listProjectsFor(
  chunkId: number,
): Promise<ProjectChoice[]> {
  if (!Number.isInteger(chunkId) || chunkId <= 0) return [];
  return projectsFor(chunkId);
}

/**
 * Creates a project and immediately adds the passage to it.
 *
 * The two steps belong together because that's how a project actually
 * begins: you read a passage, realize it belongs somewhere, and name that
 * somewhere in the same breath. An empty project list to fill in later is a
 * page nobody visits.
 */
export async function createProjectWith(
  title: string,
  chunkId: number,
  meta: { prompt?: string; relevance?: string } = {},
): Promise<ProjectChoice[]> {
  if (typeof title !== "string" || !title.trim()) return projectsFor(chunkId);
  const project = createProject(title);
  addToProject(project.slug, chunkId, meta);
  return projectsFor(chunkId);
}

/**
 * Adds or removes a passage, and returns the menu's new content.
 *
 * The response is the whole list, not an ok: the menu draws a checkmark per
 * project, and that checkmark should come from the database, not from the
 * client's memory of what it just clicked. Two tabs open on the same
 * project is the whole reason.
 */
export async function toggleInProject(
  slug: string,
  chunkId: number,
  meta: { prompt?: string; relevance?: string } = {},
): Promise<ProjectChoice[]> {
  if (typeof slug !== "string" || !slug) return projectsFor(chunkId);
  const held = projectsFor(chunkId).find((p) => p.slug === slug);
  if (held?.holds) removeFromProject(slug, chunkId);
  else addToProject(slug, chunkId, meta);
  return projectsFor(chunkId);
}

/** Removes a passage from a project, from the project page. */
export async function dropFromProject(
  slug: string,
  chunkId: number,
): Promise<void> {
  if (typeof slug !== "string" || !slug) return;
  removeFromProject(slug, chunkId);
  refresh();
}

/**
 * The note under a saved passage.
 *
 * No `refresh` here. The note is typed into a field that already sits on
 * the page with its own value, and re-rendering the server markup mid-typing
 * would move focus out of the text box. The page is `force-dynamic` anyway
 * and shows the saved value the next time it's read.
 */
export async function saveNote(
  slug: string,
  chunkId: number,
  note: string,
): Promise<void> {
  if (typeof slug !== "string" || !slug) return;
  if (typeof note !== "string") return;
  setNote(slug, chunkId, note);
}

/**
 * Title, description, and tags on the project's own page.
 *
 * No `refresh`: the header is a client component that already has the
 * fields' text in its state, and the response here is exactly what it
 * should show afterward — re-rendering the server markup would just repeat
 * what the client already knows.
 */
export async function editProject(
  slug: string,
  title: string,
  description: string,
  tags: string[],
): Promise<ProjectMeta | null> {
  if (typeof slug !== "string" || !slug) return null;
  if (typeof title !== "string" || typeof description !== "string") return null;
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string"))
    return null;
  return updateProject(slug, { title, description, tags });
}

/**
 * Deletes an entire project. The passages remain in the corpus.
 *
 * `redirect`, not `refresh`: the button sits on the project's own page, and
 * re-rendering that page would be a 404 over something the user just
 * deleted themselves. The list is where they should actually end up.
 */
export async function forgetProject(slug: string): Promise<void> {
  if (typeof slug !== "string" || !slug) return;
  const locale = await getLocale();
  deleteProject(slug);
  redirect(projectsHref(locale));
}

export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    // One year. The language choice is a setting, not session state —
    // someone who's chosen English once shouldn't have to choose again
    // next month.
    maxAge: 60 * 60 * 24 * 365,
  });
  refresh();
}

export async function setProvider(provider: string): Promise<void> {
  if (!isModelId(provider)) return;
  (await cookies()).set(PROVIDER_COOKIE, provider, {
    path: "/",
    sameSite: "lax",
    // One year, like the language choice — a setting, not session state.
    maxAge: 60 * 60 * 24 * 365,
  });
  refresh();
}

/** Same shape as `setProvider`, for the reranking effort dial next to it. */
export async function setEffort(effort: string): Promise<void> {
  if (!isEffort(effort)) return;
  (await cookies()).set(EFFORT_COOKIE, effort, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  refresh();
}
