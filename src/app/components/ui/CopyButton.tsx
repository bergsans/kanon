"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copy to clipboard with a confirmation.
 *
 * The behavior first lived in `Permalink` and was then needed in two more
 * places — the quote and the export. Three copies of the same timeout is
 * one too many.
 *
 * The text is fetched through a function, not passed as a string: a quote
 * is formatted from the whole passage, and there's no reason to build the
 * string for sixteen passages nobody has clicked on.
 */
export function useCopy(resetAfter = 2000) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The panel can be closed while the confirmation is still showing — then
  // the timer shouldn't write to an unmounted component.
  useEffect(
    () => () => void (timer.current && clearTimeout(timer.current)),
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), resetAfter);
      } catch {
        // Without clipboard write permission (insecure origin, denied
        // permission) there's nothing sensible to do. Failing silently is
        // better than an error message about a button that wasn't
        // essential to begin with.
        setCopied(false);
      }
    },
    [resetAfter],
  );

  return { copied, copy };
}

interface Props {
  /** Only built when someone clicks. */
  text: () => string;
  label: string;
  /** The confirmation. Stays for two seconds, then reverts to `label`. */
  done: string;
}

/*
 * One and the same shape for all three buttons. The appearance used to be
 * overridable from outside, and the permalink did so with a class that
 * contained neither underline nor color — it therefore stood as the one
 * undecorated word in a row of dotted links and read as a heading.
 */
const BASE =
  "text-ink-400 underline cursor-pointer decoration-dotted underline-offset-4 transition hover:text-accent-700";

export function CopyButton({ text, label, done }: Props) {
  const { copied, copy } = useCopy();

  return (
    <button type="button" onClick={() => copy(text())} className={BASE}>
      {copied ? done : label}
    </button>
  );
}
