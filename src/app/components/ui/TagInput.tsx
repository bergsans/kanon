"use client";

import { useState } from "react";
import { MAX_TAGS, MAX_TAG_LENGTH } from "@/lib/tags";

/**
 * A tokenized tag field: type and press Enter or `,` to turn the draft into
 * a removable chip, Backspace on an empty draft removes the last one.
 *
 * Suggestions only appear once the draft is non-empty — an unfiltered list
 * of every tag ever used, offered on focus before a single keystroke, would
 * be more clutter than help for a field that holds at most ten entries.
 */
export function TagInput({
  value,
  onChange,
  suggestions,
  placeholder,
  removeLabel,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder: string;
  removeLabel: (tag: string) => string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const atCap = value.length >= MAX_TAGS;
  const fieldDisabled = disabled || atCap;

  const commit = (raw: string) => {
    const trimmed = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (!trimmed || atCap) return;
    if (value.some((tag) => tag.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const matches =
    draft.trim().length > 0
      ? suggestions
          .filter(
            (tag) =>
              tag.toLowerCase().startsWith(draft.trim().toLowerCase()) &&
              !value.some((v) => v.toLowerCase() === tag.toLowerCase()),
          )
          .slice(0, 6)
      : [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded border border-parchment-300 bg-parchment-0 px-2 py-1.5 focus-within:border-accent-600">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 border border-parchment-300 bg-parchment-50 py-0.5 pr-1 pl-2 text-[0.6875rem] text-ink-600"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              disabled={disabled}
              aria-label={removeLabel(tag)}
              className="cursor-pointer px-1 text-ink-400 transition hover:text-accent-700 disabled:cursor-not-allowed"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              remove(value[value.length - 1]);
            }
          }}
          disabled={fieldDisabled}
          placeholder={value.length === 0 ? placeholder : undefined}
          className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm text-ink-900 outline-none placeholder:text-ink-400 disabled:cursor-not-allowed"
        />
      </div>
      {matches.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {matches.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => commit(tag)}
              className="cursor-pointer border border-parchment-300 bg-parchment-50 px-2 py-0.5 text-[0.6875rem] text-ink-600 transition hover:border-accent-600 hover:text-accent-700"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
