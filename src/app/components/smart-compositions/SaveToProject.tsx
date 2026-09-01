"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ProjectChoice } from "@/lib/projects";
import {
  createProjectWith,
  listProjectsFor,
  toggleInProject,
} from "../../actions";
import { useT } from "../providers/LocaleProvider";

/**
 * The path from a passage into a project.
 *
 * The menu only reads the projects when it's opened. An answer can have
 * thirty rows each with its own save button, and querying the database
 * thirty times on every render — for a menu that may never open — would be
 * paying just to draw a button.
 *
 * The price for that shows in the label: the button can't know whether the
 * passage is already in a project until someone has opened the menu, so it
 * says "save" until then and "saved" only once it knows. The checkmark
 * inside the menu is what actually comes from the database, and that's what
 * counts.
 *
 * A new project is created from here, not on a page of its own. That's how
 * a project begins: you read a passage, realize it belongs somewhere, and
 * name that somewhere in the same breath.
 */
export function SaveToProject({
  chunkId,
  prompt,
  relevance,
}: {
  chunkId: number;
  /** The query the passage came from — saved as the passage's origin in the project. */
  prompt: string;
  /** Claude's rationale, as it stood when the passage was saved. */
  relevance: string;
}) {
  const { t, tn } = useT();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectChoice[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  // Only the outside-click listener lives on `document` — Escape is handled
  // by `onKeyDown` on the menu's own container below, not here. This menu
  // can open from inside `ContextSheet`, which has its own `document`
  // Escape listener to close the whole sheet; two `document` listeners for
  // the same key fire in registration order regardless of DOM nesting, so
  // one Escape press closed this menu *and* the sheet behind it. A
  // container-level listener that stops propagation is scoped to this
  // menu's own subtree and never reaches the sheet's at all.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    setOpen(false);
  }

  const meta = { prompt, relevance };

  function run(action: () => Promise<ProjectChoice[]>) {
    setError(null);
    startTransition(async () => {
      try {
        setProjects(await action());
      } catch {
        setError(t("project.saveFailed"));
      }
    });
  }

  function toggleMenu() {
    const next = !open;
    setOpen(next);
    // Fetched every time the menu opens, not just the first time: a project
    // may have been created in another tab, and the list is cheap to re-read.
    if (next) run(() => listProjectsFor(chunkId));
  }

  const saved = projects?.some((p) => p.holds) ?? false;

  return (
    <div ref={box} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={toggleMenu}
        aria-expanded={open}
        aria-haspopup="menu"
        className="cursor-pointer underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
      >
        {saved ? t("project.saved") : t("project.save")}
      </button>

      {open && (
        <div
          role="menu"
          /* The same sheet as the export menu: opaque parchment, a visible
             border, and the heavy shadow. A menu floating over the page has
             to sit *on* it, or it blends into whatever it's covering. */
          className="absolute left-0 z-20 mt-2 w-72 overflow-hidden rounded-lg border border-parchment-300 bg-parchment-0 py-1 shadow-lift"
        >
          <p className="eyebrow px-3 py-1.5">
            {t("project.chooseHeading")}
          </p>

          {projects?.length === 0 && (
            <p className="px-3 pb-2 text-xs leading-relaxed text-ink-400">
              {t("project.none")}
            </p>
          )}

          {projects?.map((p) => (
            <button
              key={p.slug}
              type="button"
              role="menuitemcheckbox"
              aria-checked={p.holds}
              disabled={pending}
              onClick={() => run(() => toggleInProject(p.slug, chunkId, meta))}
              className="cursor-pointer flex w-full items-baseline gap-2 px-3 py-2 text-left text-xs text-ink-600 transition hover:bg-parchment-100 hover:text-accent-700 disabled:cursor-wait disabled:opacity-60"
            >
              {/* The checkmark has its own column even when invisible:
                  otherwise the titles would shift sideways when a project
                  gets checked. */}
              <span aria-hidden className="w-3 shrink-0 text-accent-600">
                {p.holds ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink-900">{p.title}</span>
                <span className="mt-0.5 block text-ink-400">
                  {tn("project.count", p.passageCount)}
                </span>
              </span>
            </button>
          ))}

          <div className="my-1 border-t border-parchment-200" />

          {/* No <form>: a form submit inside a menu that sits inside the
              results list would take the page down with it. The field and
              the button are enough, and Enter is handled by the key
              handler. */}
          <div className="flex items-center gap-2 px-3 py-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !title.trim()) return;
                e.preventDefault();
                run(() => createProjectWith(title, chunkId, meta));
                setTitle("");
              }}
              placeholder={t("project.newPlaceholder")}
              maxLength={120}
              className="min-w-0 flex-1 rounded border border-parchment-300 bg-parchment-0 px-2 py-1 text-xs text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-accent-600"
            />
            <button
              type="button"
              disabled={pending || !title.trim()}
              onClick={() => {
                run(() => createProjectWith(title, chunkId, meta));
                setTitle("");
              }}
              // Same small solid button as `ProjectView`'s note save and
              // `ProjectHeader`'s save button — see that comment.
              className="cursor-pointer shrink-0 bg-accent-600 px-2 py-1 text-xs font-semibold text-parchment-0 transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-ink-400"
            >
              {pending ? t("project.creating") : t("project.create")}
            </button>
          </div>

          {error && (
            <p role="status" className="px-3 pb-2 text-xs text-accent-700">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
