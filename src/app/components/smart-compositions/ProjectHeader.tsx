"use client";

import { useState, useTransition } from "react";
import { editProject } from "../../actions";
import { useT } from "../providers/LocaleProvider";
import { TagInput } from "../ui/TagInput";

/**
 * Title, description, and tags — editable in place.
 *
 * The same pattern as the note in `ProjectView`: the saved value is shown
 * until you click Edit, and a form saves on button press rather than on
 * every keystroke. The title alone no longer suffices as a heading in a
 * list of twenty projects — the description and tags are what distinguish
 * "Stoicism" from "Stoicism, spring '26" when both were opened for the same
 * reason.
 *
 * The tags are re-normalized server-side (see `updateProject`) — trimmed,
 * capped, and deduplicated — regardless of what the chip input already
 * enforced client-side; what's shown afterward is what the server actually
 * saved, not what was submitted.
 */
export function ProjectHeader({
  slug,
  title,
  description,
  tags,
  existingTags,
}: {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  existingTags: string[];
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [stored, setStored] = useState({ title, description, tags });
  const [titleInput, setTitleInput] = useState(title);
  const [descriptionInput, setDescriptionInput] = useState(description);
  const [tagsInput, setTagsInput] = useState(tags);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const startEdit = () => {
    setTitleInput(stored.title);
    setDescriptionInput(stored.description);
    setTagsInput(stored.tags);
    setFailed(false);
    setEditing(true);
  };

  const save = () => {
    if (!titleInput.trim()) return;
    setFailed(false);
    startTransition(async () => {
      const result = await editProject(
        slug,
        titleInput,
        descriptionInput,
        tagsInput,
      );
      if (!result) {
        setFailed(true);
        return;
      }
      setStored(result);
      setEditing(false);
    });
  };

  if (!editing) {
    return (
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-serif text-3xl leading-tight tracking-tight text-ink-900">
            {stored.title}
          </h1>
          <button
            type="button"
            onClick={startEdit}
            className="cursor-pointer text-xs text-ink-400 underline decoration-dotted underline-offset-4 transition hover:text-accent-700 print:hidden"
          >
            {t("project.edit")}
          </button>
        </div>
        {stored.description && (
          <p className="mt-2 max-w-xl text-sm text-ink-600">
            {stored.description}
          </p>
        )}
        {stored.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stored.tags.map((tag) => (
              <span
                key={tag}
                className="border border-parchment-300 bg-parchment-50 px-2 py-0.5 text-[0.6875rem] text-ink-600"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-2">
      <input
        value={titleInput}
        onChange={(e) => setTitleInput(e.target.value)}
        placeholder={t("project.titlePlaceholder")}
        className="block w-full rounded border border-parchment-300 bg-parchment-0 px-3 py-2 font-serif text-2xl text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-accent-600"
      />
      <textarea
        value={descriptionInput}
        onChange={(e) => setDescriptionInput(e.target.value)}
        rows={2}
        placeholder={t("project.descriptionPlaceholder")}
        className="block w-full resize-y rounded border border-parchment-300 bg-parchment-0 px-3 py-2 text-sm leading-relaxed text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-accent-600"
      />
      <TagInput
        value={tagsInput}
        onChange={setTagsInput}
        suggestions={existingTags}
        placeholder={t("project.tagsPlaceholder")}
        removeLabel={(tag) => t("project.tagsRemove", { tag })}
        disabled={pending}
      />
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          disabled={pending || !titleInput.trim()}
          onClick={save}
          /* Same small solid button as `ProjectView`'s note save and
             `SaveToProject`'s create button — see that comment. */
          className="cursor-pointer bg-accent-600 px-2 py-1 font-semibold text-parchment-0 transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-ink-400"
        >
          {pending ? t("project.editSaving") : t("project.editSave")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(false)}
          className="cursor-pointer text-ink-400 underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
        >
          {t("project.editCancel")}
        </button>
        {failed && (
          <span role="status" className="text-accent-700">
            {t("project.editFailed")}
          </span>
        )}
      </div>
    </div>
  );
}
