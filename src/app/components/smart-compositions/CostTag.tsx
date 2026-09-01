"use client";

import { useEffect, useRef, useState } from "react";
import { bcp47 } from "@/lib/i18n";
import { money } from "@/lib/money";
import { isClaudeModelName } from "@/lib/provider";
import type { CostPayload } from "@/lib/protocol";
import { CloseIcon } from "../ui/CloseIcon";
import { useT } from "../providers/LocaleProvider";
import { useModalFocus } from "../ui/useModalFocus";

/**
 * What the cost line refers to. A key and not a finished string: the word
 * is inflected into three different sentences ("What the query cost", the
 * aria label, the heading), and a caller passing in plain text would have
 * passed it in the wrong language.
 */
export type CostSubject = "question" | "translation";

const SUBJECT_KEY = {
  question: "cost.subjectQuestion",
  translation: "cost.subjectTranslation",
} as const;

/**
 * What a query cost, next to the query.
 *
 * The figure is shown without being asked for, and it's shown in two
 * currencies: the dollar is what Anthropic bills, the krona is what that
 * means. The breakdown is a click away rather than in the line itself — the
 * total is what should always be visible, the line items only when someone
 * wonders why the total looks the way it does.
 *
 * And people do wonder. A dozen or so cents for one query is incomprehensible
 * until you see that reranking sends sixty-four passages of text in and that
 * the thinking is billed as output: then it's no longer a price but a
 * choice, and next time you know which button is the expensive one. The
 * figure lives in `CANDIDATES`, and it's the retrieval's reach you're buying
 * with it — not a longer results list.
 */
export function CostTag({
  cost,
  subject = "question",
}: {
  cost: CostPayload;
  subject?: CostSubject;
}) {
  const { t, locale } = useT();
  const m = money(locale);
  const [open, setOpen] = useState(false);
  const what = t(SUBJECT_KEY[subject]);

  // A local model has no per-token bill to break down — `localStep` in
  // local.ts always returns `lines: []`, since Ollama and mlx-serve don't
  // charge per token at all. The ordinary row below would show "$0" next to
  // an info button that opens to "no breakdown was saved", which reads as
  // data loss rather than as what's actually true: there was never a bill
  // to itemize. Checked on the model name, not on whether the lines happen
  // to be empty, so an old Claude row saved before the breakdown existed
  // still gets the real, itemizable treatment below instead of this one.
  if (!isClaudeModelName(cost.model)) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-ink-400">
        <span className="font-medium text-ink-600">{t("cost.local")}</span>
        <span className="font-mono text-ink-400">{cost.model}</span>
      </span>
    );
  }

  return (
    <>
      <span className="flex items-center gap-1.5 text-xs text-ink-400">
        {/* The total is information, not a footnote — it's set one shade
            darker than the surrounding line, for the same reason it sits
            next to the query. */}
        <span className="font-mono font-medium tabular-nums text-ink-600">
          {m.usd(cost.usd)} · {m.sek(cost.usd * cost.rate)}
        </span>
        {cost.cached && <span>{t("cost.fromArchive")}</span>}
        {/* The technical identifier, not translated — same treatment
            `NavMenu`'s model switch and the per-step line in `CostBreakdown`
            give a model name. Shown here unconditionally, live or from a
            permalink, so which model answered is never a click away. */}
        <span className="font-mono text-ink-400">{cost.model}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={t("cost.ariaBreakdown", { subject: what })}
          // No focus-visible override here: the global ring in `globals.css`
          // is already 2px solid accent-600 at full strength, and a
          // half-opacity restatement of the same width and offset only
          // weakened it for no reason tied to this control.
          className="cursor-pointer rounded-full text-ink-400 transition hover:text-accent-700"
        >
          <InfoIcon />
        </button>
      </span>

      {open && (
        <CostBreakdown
          cost={cost}
          subject={what}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden
      className="block"
    >
      <circle cx="8" cy="8" r="6.6" />
      <path d="M8 7.2v4" strokeLinecap="round" />
      <path d="M8 4.9v.1" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

interface BreakdownProps {
  cost: CostPayload;
  /** Already translated — the component just inflects it into its sentences. */
  subject: string;
  onClose: () => void;
}

function CostBreakdown({ cost, subject, onClose }: BreakdownProps) {
  const { t, locale, costLabel } = useT();
  const m = money(locale);
  const panel = useRef<HTMLDivElement | null>(null);
  useModalFocus(panel);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // The background shouldn't scroll while the modal is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // Line items don't exist for searches saved before the breakdown existed.
  // The total still stands and is still true — the table is what's missing,
  // not the cost, and filling it with guessed numbers would be worse than
  // saying so.
  const detailed = cost.steps.filter((s) => s.lines.length > 0);
  const total =
    cost.steps.reduce((sum, step) => sum + step.cost, 0) || cost.originalUsd;
  const original = `${m.usd(cost.originalUsd)} · ${m.sek(cost.originalUsd * cost.rate)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-[3px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("cost.heading", { subject })}
    >
      <div
        ref={panel}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-parchment-200 bg-parchment-0 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-parchment-200 px-5 py-4">
          <div>
            <p className="font-serif text-lg text-ink-900">
              {t("cost.heading", { subject })}
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              {t("cost.subheading")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            /* Same drawn mark as the menu's own close button — see `CloseIcon`. */
            className="cursor-pointer shrink-0 rounded-md p-1.5 text-ink-400 transition hover:bg-parchment-100 hover:text-ink-800"
          >
            <CloseIcon size={18} />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          {cost.cached && (
            <p className="rounded-md border border-parchment-200 bg-parchment-100 px-3 py-2 text-xs leading-relaxed text-ink-600">
              {/* Two whole sentences rather than one assembled from parts:
                  "the line items below" only when there are line items
                  below, and a sentence built from fragments can't be
                  translated without the pieces landing in the wrong order. */}
              {detailed.length > 0
                ? t("cost.cachedWithLines", { amount: original })
                : t("cost.cachedWithoutLines", { amount: original })}
            </p>
          )}

          {detailed.length === 0 ? (
            <p className="text-sm leading-relaxed text-ink-600">
              {/* The total is already shown in the box above when the
                  answer came from the archive. Repeating it two lines down
                  doesn't make it any truer. */}
              {cost.cached
                ? t("cost.noBreakdownCached")
                : t("cost.noBreakdown", { amount: original })}
            </p>
          ) : (
            detailed.map((step) => (
              <section key={step.step}>
                <h3 className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-medium uppercase tracking-widest text-ink-600">
                    {costLabel("step", step.step)}
                  </span>
                  <span className="font-mono text-ink-400">{step.model}</span>
                </h3>

                <div className="mt-2 overflow-x-auto">
                  <table className="w-full table-fixed text-left text-xs tabular-nums">
                    <colgroup>
                      <col className="w-[30%]" />
                      <col className="w-[17%]" />
                      <col className="w-[16%]" />
                      <col className="w-[19%]" />
                      <col className="w-[18%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-parchment-200 text-ink-400">
                        <th className="py-1 pr-3 font-normal">
                          {t("cost.colLine")}
                        </th>
                        <th className="py-1 px-2 text-right font-normal">
                          {t("cost.colTokens")}
                        </th>
                        <th className="py-1 px-2 text-right font-normal">
                          {t("cost.colPerMillion")}
                        </th>
                        <th className="py-1 px-2 text-right font-normal">
                          {t("cost.colCost")}
                        </th>
                        <th className="py-1 pl-2 text-right font-normal">
                          {t("cost.colSek")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {step.lines.map((line) => (
                        <tr
                          key={line.label}
                          // A line with zero tokens isn't clutter: a zero on
                          // the cache read is the notice that the cache
                          // missed, and that's often the explanation for an
                          // expensive query. It's therefore set muted but
                          // not faded — the tone used to be ink-400 at 70
                          // percent opacity, i.e. 3.5:1, and an explanation
                          // you have to lean in to read is no explanation.
                          className={
                            line.tokens === 0 ? "text-ink-400" : "text-ink-800"
                          }
                        >
                          <td className="py-1 pr-3">
                            {costLabel("line", line.label)}
                          </td>
                          <td className="py-1 px-2 text-right font-mono">
                            {m.tokens(line.tokens)}
                          </td>
                          <td className="py-1 px-2 text-right font-mono">
                            {m.perMillion(line.perMillion)}
                          </td>
                          <td className="py-1 px-2 text-right font-mono">
                            {m.usd(line.cost)}
                          </td>
                          <td className="py-1 pl-2 text-right font-mono">
                            {m.sek(line.cost * cost.rate)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-parchment-200 text-ink-800">
                        <td className="py-1 pr-3" colSpan={3}>
                          {t("cost.stepTotal", {
                            step: costLabel("step", step.step),
                          })}
                        </td>
                        <td className="py-1 px-2 text-right font-mono">
                          {m.usd(step.cost)}
                        </td>
                        <td className="py-1 pl-2 text-right font-mono">
                          {m.sek(step.cost * cost.rate)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}

          {detailed.length > 0 && (
            <p className="flex items-baseline justify-between gap-4 border-t border-parchment-300 pt-3 font-serif text-ink-900">
              <span>{t("cost.total")}</span>
              <span className="font-mono text-sm tabular-nums">
                {m.usd(total)} · {m.sek(total * cost.rate)}
              </span>
            </p>
          )}

          <div className="space-y-2 text-xs leading-relaxed text-ink-400">
            {/* The line item that surprises most sits at the top. Output is
                almost always larger than the visible text, and without this
                sentence the line looks like an error in the bill. Without a
                table there's no line to explain, so the paragraph is just
                text. */}
            {detailed.length > 0 && <p>{t("cost.thinkingNote")}</p>}
            <p>
              {t("cost.rateNote", {
                rate: cost.rate.toLocaleString(bcp47(locale), {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
