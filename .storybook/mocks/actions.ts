/**
 * Stand-in for src/app/actions.ts inside Storybook's preview.
 *
 * The real file is `"use server"` — every export assumes Next's server
 * runtime (cookies, redirect, the database). Storybook's iframe has none of
 * that, so .storybook/main.ts aliases the real module to this one by
 * absolute path. Every function here just logs to the Actions panel and
 * returns a value shaped like the real one, so a story can still exercise
 * the button that calls it without a server behind it.
 */

import type { ProjectChoice, ProjectMeta } from "@/lib/projects";

function logAction(name: string, ...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(`[storybook mock action] ${name}`, ...args);
}

export async function forgetSearch(slug: string): Promise<void> {
  logAction("forgetSearch", slug);
}

export async function listProjectsFor(chunkId: number): Promise<ProjectChoice[]> {
  logAction("listProjectsFor", chunkId);
  return [];
}

export async function createProjectWith(
  title: string,
  chunkId: number,
  meta: { prompt?: string; relevance?: string } = {},
): Promise<ProjectChoice[]> {
  logAction("createProjectWith", title, chunkId, meta);
  return [
    {
      slug: "mock-project",
      title,
      description: "",
      tags: [],
      createdAt: new Date().toISOString(),
      passageCount: 1,
      holds: true,
    },
  ];
}

export async function toggleInProject(
  slug: string,
  chunkId: number,
  meta: { prompt?: string; relevance?: string } = {},
): Promise<ProjectChoice[]> {
  logAction("toggleInProject", slug, chunkId, meta);
  return [
    {
      slug,
      title: "Mock project",
      description: "",
      tags: [],
      createdAt: new Date().toISOString(),
      passageCount: 1,
      holds: true,
    },
  ];
}

export async function dropFromProject(slug: string, chunkId: number): Promise<void> {
  logAction("dropFromProject", slug, chunkId);
}

export async function saveNote(
  slug: string,
  chunkId: number,
  note: string,
): Promise<void> {
  logAction("saveNote", slug, chunkId, note);
}

export async function editProject(
  slug: string,
  title: string,
  description: string,
  tags: string[],
): Promise<ProjectMeta | null> {
  logAction("editProject", slug, title, description, tags);
  return { title, description, tags };
}

export async function forgetProject(slug: string): Promise<void> {
  logAction("forgetProject", slug);
}

export async function setLocale(locale: string): Promise<void> {
  logAction("setLocale", locale);
}

export async function setProvider(provider: string): Promise<void> {
  logAction("setProvider", provider);
}

export async function setEffort(effort: string): Promise<void> {
  logAction("setEffort", effort);
}
