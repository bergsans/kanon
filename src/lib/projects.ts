/**
 * Projects: the search becomes a workbench.
 *
 * A search is a one-off — it gets an answer, a permalink, and an export menu,
 * and then it's done. Essay work is the opposite: a couple dozen questions
 * around the same theme over a few weeks, where what matters is what you kept
 * between them. This module is that place. A project is a working title and a
 * list of passages, each with the question it came from, Claude's rationale
 * as it stood then, and the user's own note.
 *
 * The module deliberately mirrors `searches.ts`: the same slug form, the same
 * way of reading passages back out of `chunks` instead of copying them, the
 * same refusal to show half an answer, and the same `textHash` guard against
 * a chunk ID reused by a re-index. The difference from the archive is that
 * the rows here are hand-picked, and a swapped quotation would follow
 * straight into the essay — see `text_hash` in the schema.
 */
import crypto from "node:crypto";
import { getDb, type DB, type PassageRow } from "./db";
import { textHash } from "./hash";
import { parseTags, normalizeTags } from "./tags";
import {
  toPassagePayload,
  type Genre,
  type Language,
  type Source,
} from "./corpus";
import type { PassagePayload } from "./protocol";

/** Longest working title. The heading needs to fit on one line in the list, not a column. */
const MAX_TITLE = 120;

/** The description is a line or two in the list, not a summary of the essay. */
const MAX_DESCRIPTION = 500;

/** Short and distinguishable; collisions are caught by the unique index and retried. */
function newSlug(): string {
  return crypto.randomBytes(5).toString("base64url");
}

export interface ProjectSummary {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
  /** Only the passages that can actually still be shown — see `loadProject`. */
  passageCount: number;
}

/** A saved passage with what makes it *someone's* passage and not just one. */
export interface SavedPassage {
  /**
   * The passage as the result list carries it. `relevance` is Claude's
   * rationale from the search the passage was picked out of, saved verbatim:
   * it belongs to the question and cannot be recomputed from the collection.
   */
  passage: PassagePayload;
  /** The question the passage came from. Empty for a passage saved outside a search. */
  prompt: string;
  /** The user's own note. Empty until someone writes something. */
  note: string;
  addedAt: string;
}

/**
 * A saved passage whose text can no longer be shown — the work has been
 * re-indexed since it was saved, and the chunk ID now points at nothing, or
 * (chunk IDs are reused, see `hash.ts`) at a different passage entirely.
 *
 * Deliberately carries no title, author or text: for a *reused* ID those
 * fields would come back from the join non-null but describing the wrong
 * work, which is worse than showing nothing — the same reasoning
 * `hydrate()` in `searches.ts` applies to a stale permalink. `prompt` and
 * `note` are safe: both live in `project_passages` itself, untouched by
 * whatever happened to `chunks`.
 */
export interface LostPassage {
  chunkId: number;
  prompt: string;
  note: string;
  addedAt: string;
}

export interface Project {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
  passages: SavedPassage[];
  /**
   * Number of saved passages that can no longer be shown — the work has been
   * re-indexed and the text behind the ID has changed or disappeared.
   *
   * The number is surfaced in the UI rather than kept quiet. A project that
   * silently shrinks is worse than one that says three rows dropped out: the
   * first is discovered when the essay is being written, the second can be
   * searched again. `lostPassages` carries the rows themselves — see that
   * type's own comment for why they carry only `prompt`/`note`/`addedAt`.
   */
  lost: number;
  lostPassages: LostPassage[];
}

/**
 * Creates a project and returns it empty.
 *
 * Description and tags are accepted but never solicited here — the project
 * is created in the same breath as the first passage is saved (see
 * `createProjectWith` in actions.ts), and that moment has only a name to
 * offer. The other two fields are filled in afterwards on the project's own
 * page, for the same reason the list has no "create project" button.
 */
export function createProject(
  title: string,
  opts: { description?: string; tags?: string[] } = {},
): ProjectSummary {
  const db = getDb();
  const name = title.trim().slice(0, MAX_TITLE);
  if (!name) throw new Error("Projektet måste ha ett namn.");
  const description = (opts.description ?? "").trim().slice(0, MAX_DESCRIPTION);
  const tags = normalizeTags(opts.tags ?? []);

  const createdAt = new Date().toISOString();
  const insert = db.prepare(
    "insert into projects (slug, title, description, tags, created_at) values (?, ?, ?, ?, ?)",
  );

  // Same slug strategy as the searches: five random bytes, and the unique
  // index decides the collision rather than a pre-check that could go stale anyway.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = newSlug();
    try {
      insert.run(slug, name, description, tags.join(","), createdAt);
      return { slug, title: name, description, tags, createdAt, passageCount: 0 };
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("Kunde inte skapa projektet.");
}

/**
 * The projects, most recently created first.
 *
 * The count is rows in the table, not passages that can still be shown.
 * Computing the exact number would mean reading and hashing every passage in
 * every project just to draw a list — `loadProject` does that check where it
 * matters, and the list would rather overstate by one than pay to be exact.
 */
export function listProjects(): ProjectSummary[] {
  const rows = getDb()
    .prepare(
      `select p.slug, p.title, p.description, p.tags, p.created_at as createdAt,
              (select count(*) from project_passages pp where pp.project_id = p.id)
                as passageCount
         from projects p order by p.id desc`,
    )
    .all() as (Omit<ProjectSummary, "tags"> & { tags: string })[];
  return rows.map((r) => ({ ...r, tags: parseTags(r.tags) }));
}

/**
 * Every tag used on any project, deduplicated case-insensitively and
 * sorted — the suggestion list for the tag-entry autocomplete, so the same
 * subject doesn't end up spelled two ways across projects.
 */
export function listAllTags(): string[] {
  const rows = getDb()
    .prepare("select tags from projects where tags != ''")
    .all() as { tags: string }[];
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const tag of parseTags(row.tags)) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

function projectId(db: DB, slug: string): number | null {
  const row = db.prepare("select id from projects where slug = ?").get(slug) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

/** Left-joined, so every passage column is null when the chunk is gone. */
interface ProjectPassageRow {
  chunkId: number;
  textHash: string;
  prompt: string;
  relevance: string;
  note: string;
  addedAt: string;
  workId: string | null;
  locator: string | null;
  text: string | null;
  author: string | null;
  title: string | null;
  translator: string | null;
  year: number | null;
  genre: Genre | null;
  language: Language | null;
  source: Source | null;
}

/**
 * A project with its passages, in the order they were collected.
 *
 * Chronological, not by relevance: a project has no question to be relevant
 * to. The order they were picked in is the only thing that matters, and it
 * also carries a history — the first three passages come from the question
 * you started with.
 *
 * A passage whose text has changed since it was saved is NOT shown. The left
 * join and the hash comparison exist for that: chunk IDs are reused on
 * re-indexing, and a quotation that has silently become a different one is
 * exactly the kind of bug the rest of the app is built to avoid.
 */
export function loadProject(slug: string): Project | null {
  const db = getDb();
  const project = db
    .prepare(
      "select id, slug, title, description, tags, created_at as createdAt from projects where slug = ?",
    )
    .get(slug) as
    | {
        id: number;
        slug: string;
        title: string;
        description: string;
        tags: string;
        createdAt: string;
      }
    | undefined;
  if (!project) return null;

  const rows = db
    .prepare(
      `select pp.chunk_id as chunkId, pp.text_hash as textHash, pp.prompt,
              pp.relevance, pp.note, pp.added_at as addedAt,
              c.work_id as workId, c.locator, c.text,
              w.author, w.title, w.translator, w.year, w.genre, w.language, w.source
         from project_passages pp
         left join chunks c on c.id = pp.chunk_id
         left join works w on w.id = c.work_id
        where pp.project_id = ?
        order by pp.added_at, pp.chunk_id`,
    )
    .all(project.id) as ProjectPassageRow[];

  const passages: SavedPassage[] = [];
  const lostPassages: LostPassage[] = [];
  for (const row of rows) {
    const intact =
      row.text !== null &&
      row.workId !== null &&
      row.author !== null &&
      row.title !== null &&
      row.year !== null &&
      row.genre !== null &&
      row.language !== null &&
      row.source !== null &&
      textHash(row.text) === row.textHash;
    if (!intact) {
      lostPassages.push({
        chunkId: row.chunkId,
        prompt: row.prompt,
        note: row.note,
        addedAt: row.addedAt,
      });
      continue;
    }
    passages.push({
      prompt: row.prompt,
      note: row.note,
      addedAt: row.addedAt,
      // Numbering is set below, once the list is fully filtered: a gap in
      // the number sequence would be the only trace of a dropped passage,
      // and that trace belongs in `lost`, not in a skipping numbering. The
      // cast is what `intact` above just checked, column by column.
      passage: toPassagePayload(
        row as ProjectPassageRow & PassageRow,
        row.relevance,
        0,
      ),
    });
  }

  return {
    slug: project.slug,
    title: project.title,
    description: project.description,
    tags: parseTags(project.tags),
    createdAt: project.createdAt,
    passages: passages.map((p, i) => ({
      ...p,
      passage: { ...p.passage, index: i + 1 },
    })),
    lost: lostPassages.length,
    lostPassages,
  };
}

/**
 * Adds a passage to a project.
 *
 * Idempotent: the same passage twice is the same row. `insert or ignore`, not
 * `replace`, since the row carries the user's note — clicking save a second
 * time should not lose what was written the first time.
 *
 * Returns false if the project or the passage doesn't exist. A passage that
 * has vanished from the collection should not be savable: the row would then
 * be lost the moment it was written.
 */
export function addToProject(
  slug: string,
  chunkId: number,
  meta: { prompt?: string; relevance?: string } = {},
): boolean {
  const db = getDb();
  const id = projectId(db, slug);
  if (id === null) return false;

  const chunk = db
    .prepare("select text from chunks where id = ?")
    .get(chunkId) as { text: string } | undefined;
  if (!chunk) return false;

  db.prepare(
    `insert or ignore into project_passages
       (project_id, chunk_id, text_hash, prompt, relevance, note, added_at)
     values (?, ?, ?, ?, ?, '', ?)`,
  ).run(
    id,
    chunkId,
    textHash(chunk.text),
    meta.prompt ?? "",
    meta.relevance ?? "",
    new Date().toISOString(),
  );
  return true;
}

export function removeFromProject(slug: string, chunkId: number): boolean {
  const db = getDb();
  const id = projectId(db, slug);
  if (id === null) return false;
  const info = db
    .prepare(
      "delete from project_passages where project_id = ? and chunk_id = ?",
    )
    .run(id, chunkId);
  return info.changes > 0;
}

/** The note under a saved passage. An empty string removes it. */
export function setNote(slug: string, chunkId: number, note: string): boolean {
  const db = getDb();
  const id = projectId(db, slug);
  if (id === null) return false;
  const info = db
    .prepare(
      "update project_passages set note = ? where project_id = ? and chunk_id = ?",
    )
    .run(note.trim(), id, chunkId);
  return info.changes > 0;
}

export interface ProjectMeta {
  title: string;
  description: string;
  tags: string[];
}

/**
 * Changes name, description and tags in one go.
 *
 * One call and not three, even though usually only one field changes: the
 * form on the project page shows and saves all three together, and a project
 * without a name is not a valid state to save — the same guard `createProject`
 * has.
 *
 * Returns the saved values, not just a bool. The client already has the
 * fields' untrimmed text in its state; the response is the source of truth
 * after the server has capped and normalized it, so the field can show what
 * actually landed in the database.
 */
export function updateProject(
  slug: string,
  meta: { title: string; description: string; tags: string[] },
): ProjectMeta | null {
  const db = getDb();
  const title = meta.title.trim().slice(0, MAX_TITLE);
  if (!title) return null;
  const description = meta.description.trim().slice(0, MAX_DESCRIPTION);
  const tags = normalizeTags(meta.tags);

  const info = db
    .prepare(
      "update projects set title = ?, description = ?, tags = ? where slug = ?",
    )
    .run(title, description, tags.join(","), slug);
  if (info.changes === 0) return null;

  return { title, description, tags };
}

/**
 * Deletes a project and its rows.
 *
 * `project_passages` is declared `on delete cascade` on `project_id`, and
 * better-sqlite3 ships with `pragma foreign_keys` on by default (unlike
 * SQLite's own C default, which is off) — the cascade does fire. The
 * explicit delete here isn't working around a disabled pragma; it's kept so
 * the function reads correctly on its own, without the reader having to
 * know the pragma's compiled-in default to trust it, and so it stays
 * correct even if that default is ever turned off explicitly.
 *
 * Only the project disappears. The passages live in `chunks` and are untouched.
 */
export function deleteProject(slug: string): boolean {
  const db = getDb();
  const id = projectId(db, slug);
  if (id === null) return false;

  db.transaction(() => {
    db.prepare("delete from project_passages where project_id = ?").run(id);
    db.prepare("delete from projects where id = ?").run(id);
  })();
  return true;
}

/** A project in the save menu: its name, and whether the passage is already in it. */
export interface ProjectChoice extends ProjectSummary {
  holds: boolean;
}

/**
 * The projects seen from a passage — what the save menu needs in order to be drawn.
 *
 * One query and not one per project: the menu opens from a row in the result
 * list, and an answer can have thirty rows.
 */
export function projectsFor(chunkId: number): ProjectChoice[] {
  return getDb()
    .prepare(
      `select p.slug, p.title, p.description, p.tags, p.created_at as createdAt,
              (select count(*) from project_passages pp where pp.project_id = p.id)
                as passageCount,
              exists(select 1 from project_passages pp
                      where pp.project_id = p.id and pp.chunk_id = ?)
                as holds
         from projects p order by p.id desc`,
    )
    .all(chunkId)
    .map((row) => {
      const r = row as Omit<ProjectSummary, "tags"> & {
        tags: string;
        holds: number;
      };
      return { ...r, tags: parseTags(r.tags), holds: r.holds === 1 };
    });
}
