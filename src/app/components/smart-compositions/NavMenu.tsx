"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Locale } from "@/lib/i18n";
import {
  EFFORT_LEVELS,
  OLLAMA_MODELS,
  OPENAI_MODELS,
  isLocalModel,
  modelDuration,
  modelLabel,
  type Effort,
  type ModelId,
} from "@/lib/provider";
import { corpusHref, costsHref, projectsHref, searchesHref } from "@/lib/routes";
import { setEffort, setProvider } from "../../actions";
import { CloseIcon } from "../ui/CloseIcon";
import { useT } from "../providers/LocaleProvider";

/** Closes an open popup on an outside click or Escape — shared by both dropdowns below. */
function useCloseOnOutside(
  box: React.RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [box, open, close]);
}

const listItem =
  "block w-full cursor-pointer px-3 py-1.5 text-left text-xs transition hover:bg-parchment-100 hover:text-accent-700";

// `outline-none` suppresses the global ring from `globals.css`, so this
// control has to restate it — but at full strength, not the half-opacity
// restatement this carried before, which was the one focus ring in the app
// dimmer than every other control's.
const settingsTrigger =
  "flex h-6 w-full cursor-pointer items-center justify-between gap-1.5 border border-parchment-300 pl-3 pr-2.5 text-xs text-ink-600 outline-none transition hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:cursor-wait disabled:opacity-60";

const settingsEyebrow = "eyebrow";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 8"
      className={`h-2 w-2.5 shrink-0 text-ink-600/60 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M1 1.5L6 6.5L11 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Separate keys for the menu rows (nav.menu*), distinct from nav.search/
   corpus/projects, which are reused as running text in the pages'
   breadcrumbs ("← Canon back to the search"). The menu rows should be
   capitalized, the breadcrumbs should keep reading as a running sentence —
   the same key would have forced the same case in both places. */
const ITEMS: {
  href: (locale: Locale) => string;
  labelKey:
    | "nav.menuSearch"
    | "nav.menuSearches"
    | "nav.menuCorpus"
    | "nav.menuProjects"
    | "nav.menuCosts";
  icon: () => React.JSX.Element;
}[] = [
  { href: () => "/", labelKey: "nav.menuSearch", icon: SearchIcon },
  // Right after the search box: the archive of past questions is the
  // thing this app does most often, and "Senast ställda frågor" in the
  // margin is only ever a six-row preview of it.
  { href: searchesHref, labelKey: "nav.menuSearches", icon: SearchesIcon },
  { href: corpusHref, labelKey: "nav.menuCorpus", icon: CorpusIcon },
  { href: projectsHref, labelKey: "nav.menuProjects", icon: ProjectsIcon },
  { href: costsHref, labelKey: "nav.menuCosts", icon: CostsIcon },
];

/**
 * The hamburger menu: the pages, from any one of them.
 *
 * Every page used to have only one way back — to the home page, or to the
 * list a subpage belonged to. The corpus and the projects then sat two
 * clicks apart (via the home page's footer), even though both are their
 * own archives rather than subpages of one another. The menu puts them all
 * within reach everywhere, instead of adding more individual links to every
 * page header.
 *
 * All items are always shown, even the link to the page you're already on —
 * the menu should look the same no matter where it's opened, not drop a
 * row depending on where you are.
 *
 * Fixed in the corner, once in `layout.tsx`, instead of in every page
 * header: the pages have different column widths (the home page's grid
 * versus the narrower subpages' centered container), so a menu in the flow
 * landed at different distances from the edge on different pages. The
 * corner is the same point regardless of layout.
 *
 * The panel slides out from the right edge instead of dropping a small
 * menu under the button — the classic mobile menu pattern, with a
 * semi-transparent backdrop that closes the menu on click.
 *
 * The model and effort switches (`provider.ts`) live in this panel rather
 * than as their own fixed-corner control (formerly `ProviderSwitch`,
 * mirroring this button on the opposite corner). That control needed
 * arbitrary pixel values instead of the app's usual `rem` classes just to
 * survive `TextSizeProvider`: growing the root font size grew the switch
 * faster than the page's own `rem`-based top padding, and the wordmark
 * started sliding in under it — a collision only possible because it sat
 * in the flow next to page content while being positioned outside that
 * flow. Inside this slide-out panel there's nothing beside it to collide
 * with, so the switches use the same plain `rem` classes as everything
 * else here, full width instead of truncated, and don't need to hide below
 * `sm` to stay clear of this very button.
 */
export function NavMenu({
  provider,
  effort: initialEffort,
}: {
  provider: ModelId;
  effort: Effort;
}) {
  const { t, locale } = useT();
  // `usePathname()` carries a documented hydration-mismatch risk on a
  // statically prerendered page reached through a rewrite (Next's own docs
  // on the hook): the value embedded in the server-rendered HTML can be the
  // source route, not the alias `proxy.ts` rewrote it from. That risk
  // doesn't apply here — every row below only renders once `open` is true,
  // i.e. after a client-only click well past hydration, so this value is
  // never part of what the server sent down in the first place.
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(provider);
  const [effort, setActiveEffort] = useState(initialEffort);
  const [modelOpen, setModelOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [effortPending, startEffortTransition] = useTransition();
  const modelBox = useRef<HTMLDivElement>(null);
  const effortBox = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);

  /**
   * Arrow-key roving between the five `menuitem` links — `role="menu"`
   * implies this pattern (ARIA's authoring practices), and without it the
   * role promised more than `Tab` alone delivers. `Home`/`End` jump to the
   * first/last item, the way a native menu's own keyboard handling would.
   * `Tab` itself is left alone: the items are real links in DOM order, and
   * `Tab` already moves through them correctly on its own.
   */
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = nav.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!items || items.length === 0) return;
    e.preventDefault();
    const list = Array.from(items);
    const current = list.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown"
        ? current < 0
          ? 0
          : (current + 1) % list.length
        : e.key === "ArrowUp"
          ? current <= 0
            ? list.length - 1
            : current - 1
          : e.key === "Home"
            ? 0
            : list.length - 1;
    list[next]?.focus();
  };

  /* No more "click outside" listener on the panel itself: the panel has
     its own backdrop that closes on click, so a global document listener
     would just duplicate it and risk closing the menu on a click inside
     the panel. The two dropdowns below are smaller popups inside that same
     panel, so they keep their own `useCloseOnOutside` — a click on a menu
     link shouldn't be swallowed by an open dropdown, but should close it. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useCloseOnOutside(modelBox, modelOpen, () => setModelOpen(false));
  useCloseOnOutside(effortBox, effortOpen, () => setEffortOpen(false));

  /* State for both switches lives here, in the always-mounted `NavMenu`,
     not in the conditionally-rendered panel JSX below — the panel itself
     unmounts on close (`{open && ...}`), and a component that owned this
     state would forget a choice made earlier in the session every time the
     menu was closed and reopened. */
  const chooseModel = (model: ModelId) => {
    setModelOpen(false);
    if (model === active || pending) return;
    setActive(model);
    startTransition(async () => {
      await setProvider(model);
    });
  };

  const chooseEffort = (level: Effort) => {
    setEffortOpen(false);
    if (level === effort || effortPending) return;
    setActiveEffort(level);
    startEffortTransition(async () => {
      await setEffort(level);
    });
  };


  return (
    <>
      {/* Nothing in this menu means anything on paper — it's the way to
          another page in an app that, once printed, is a single page. */}
      <div className="fixed right-4 top-4 z-40 print:hidden sm:right-6 sm:top-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={t("nav.menu")}
          className="cursor-pointer p-1 text-ink-600 transition hover:text-accent-700"
        >
          <MenuIcon />
        </button>
      </div>

      {open && (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="animate-menu-backdrop-in fixed inset-0 z-40 bg-ink-900/30"
          />
          <div
            role="menu"
            aria-label={t("nav.menu")}
            className="animate-menu-slide-in fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-parchment-300 bg-parchment-0 shadow-lift sm:w-80"
          >
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3 text-ink-900">
                <LogoIcon />
                <span className="font-serif text-2xl tracking-tight">
                  {t("app.name")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("nav.close")}
                className="cursor-pointer p-1 text-ink-600 transition hover:text-accent-700"
              >
                <CloseIcon />
              </button>
            </div>
            <nav
              ref={nav}
              onKeyDown={onMenuKeyDown}
              className="flex flex-col px-2 pt-2 pb-4"
            >
              {ITEMS.map((item) => {
                // Exact match only — a saved search (`/s/[id]`) or a single
                // project (`/projekt/[slug]`) is a more specific place than
                // the list or the search box it's one click from, and
                // marking those too would need the same prefix logic the
                // rest of the app avoids for permalinks (see `routes.ts`).
                const current = pathname === item.href(locale);
                return (
                  <Link
                    key={item.labelKey}
                    href={item.href(locale)}
                    role="menuitem"
                    aria-current={current ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    /* Weight and ink, not the accent — the same "mark, not
                       fill" convention `RecentSearches`' own current-row
                       styling already uses: this says where you are, it
                       doesn't narrow a selection. */
                    className={`flex items-center gap-4 rounded-md px-4 py-3.5 text-sm transition hover:bg-parchment-100 hover:text-accent-700 ${
                      current ? "font-semibold text-ink-900" : "text-ink-600"
                    }`}
                  >
                    <item.icon />
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </nav>
            {/* Pinned to the panel's bottom edge (`mt-auto`) rather than
                simply following the nav in the flow: the nav's five rows
                never fill this panel's height, and a settings block that
                just came after them would float partway down instead of
                anchoring where a reader expects app-wide preferences to
                sit — under everything else, not among it.

                Stacked full-width, not side by side: below `sm` the panel
                spans the full viewport width, at `sm` and up it's a fixed
                320px — narrower than the two triggers plus a long
                local-model tag (`OPENAI_MODELS` in provider.ts runs to
                eighteen characters) ever fit side by side without
                truncating the label — and there's no longer a hamburger
                button sharing this corner to leave room for. */}
            <div className="mt-auto flex flex-col gap-4 border-t border-parchment-300 px-5 pt-5 pb-5">
              <div className="flex flex-col gap-1">
                {/* Not aria-hidden: with no separate aria-label on the
                    trigger below, this is what tells a screen reader user
                    which switch they've landed on — the trigger's own name
                    is just the current value (see the button's comment). */}
                <span className={settingsEyebrow}>
                  {t("provider.label")}
                </span>
                <div ref={modelBox} className="relative">
                  {/*
                   * No aria-label here — one used to sit on this button,
                   * repeating the eyebrow above it, and because aria-label
                   * replaces rather than supplements a control's accessible
                   * name, it silently dropped the model name: every screen
                   * reader announcement of this button read "Modell",
                   * never "Claude" or "Lokal (qwen3:14b)". The eyebrow above
                   * now carries the field name instead, and the button's
                   * name is left to come from what's actually inside it.
                   */}
                  <button
                    type="button"
                    onClick={() => setModelOpen((o) => !o)}
                    disabled={pending}
                    aria-haspopup="listbox"
                    aria-expanded={modelOpen}
                    title={
                      isLocalModel(active)
                        ? t("provider.localWarning")
                        : undefined
                    }
                    className={settingsTrigger}
                  >
                    <span className="truncate">{modelLabel(active, locale)}</span>
                    <Chevron open={modelOpen} />
                  </button>

                  {modelOpen && (
                    <div
                      role="listbox"
                      aria-label={t("provider.label")}
                      className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-lg border border-parchment-300 bg-parchment-0 py-1 shadow-lift"
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={active === "claude"}
                        className={`${listItem} ${active === "claude" ? "text-accent-700" : "text-ink-600"}`}
                        onClick={() => chooseModel("claude")}
                      >
                        {t("provider.claude")}
                        <span className="mt-0.5 block text-ink-400">
                          {modelDuration("claude", locale)}
                        </span>
                      </button>
                      {/* Model tags are technical identifiers, not
                          translated — the same treatment `CostBreakdown`
                          gives `step.model`. The duration note underneath is
                          what makes the switch's warning concrete per model
                          instead of one blanket disclaimer.

                          Two groups, not one flat list: Ollama's three run
                          on this machine (`CANON_OLLAMA_URL` defaults to
                          localhost), while the OPENAI_MODELS three speak to
                          mlx-serve, which `.env.example` notes "usually
                          runs on another machine on the network" — a
                          different kind of "local" someone picking a model
                          should be able to tell apart at a glance. */}
                      {(
                        [
                          ["provider.onDevice", OLLAMA_MODELS],
                          ["provider.onNetwork", OPENAI_MODELS],
                        ] as const
                      ).map(([labelKey, models]) => (
                        <div
                          key={labelKey}
                          role="group"
                          aria-label={t(labelKey)}
                          className="border-t border-parchment-200 first:border-t-0"
                        >
                          <p
                            aria-hidden
                            className="px-3 pt-2 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-400"
                          >
                            {t(labelKey)}
                          </p>
                          {models.map((model) => (
                            <button
                              key={model}
                              type="button"
                              role="option"
                              aria-selected={active === model}
                              className={`${listItem} ${active === model ? "text-accent-700" : "text-ink-600"}`}
                              onClick={() => chooseModel(model)}
                            >
                              {t("provider.local", { model })}
                              <span className="mt-0.5 block text-ink-400">
                                {modelDuration(model, locale)}
                              </span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                {/* Not aria-hidden — see the model eyebrow's comment above. */}
                <span className={settingsEyebrow}>
                  {t("effort.label")}
                </span>
                <div ref={effortBox} className="relative">
                  {/* No aria-label — see the model trigger's comment above. */}
                  <button
                    type="button"
                    onClick={() => setEffortOpen((o) => !o)}
                    disabled={effortPending}
                    aria-haspopup="listbox"
                    aria-expanded={effortOpen}
                    title={active !== "claude" ? t("effort.claudeOnly") : undefined}
                    className={settingsTrigger}
                  >
                    <span className="truncate">{t(`effort.${effort}`)}</span>
                    <Chevron open={effortOpen} />
                  </button>

                  {effortOpen && (
                    <div
                      role="listbox"
                      aria-label={t("effort.label")}
                      className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-lg border border-parchment-300 bg-parchment-0 py-1 shadow-lift"
                    >
                      {EFFORT_LEVELS.map((level) => (
                        <button
                          key={level}
                          type="button"
                          role="option"
                          aria-selected={effort === level}
                          className={`${listItem} ${effort === level ? "text-accent-700" : "text-ink-600"}`}
                          onClick={() => chooseEffort(level)}
                        >
                          {t(`effort.${level}`)}
                        </button>
                      ))}
                      {/* Same footer treatment as the model panel: the
                          scope of the dial (Claude's reranking call only)
                          is what makes it worth touching while a local
                          model is active, not a caveat to miss on the way
                          past. */}
                      <p className="mt-1 border-t border-parchment-300 px-3 pt-1.5 text-xs text-ink-400">
                        {t("effort.claudeOnly")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* The same mark as `icon.svg` (the favicon), redrawn rather than reused:
   the favicon is a static file with its colors hardcoded as hex, since it's
   served outside Next and never sees Tailwind's `@theme` — this one is a
   component and takes the same accent-600/parchment-0 as tokens. No extra
   detail added at this larger size, unlike the codex motif this replaced:
   the pilcrow is already the whole mark, not a crop of a busier drawing. */
function LogoIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="38"
      height="38"
      role="img"
      aria-hidden
      className="block shrink-0"
    >
      <rect width="32" height="32" rx="1" className="fill-accent-600" />
      <path
        className="fill-parchment-0"
        d="M24 6H16A6 6 0 0 0 16 18H14V32H18V18H20V32H24Z"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 22 22"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
      className="block"
    >
      <path d="M3.5 6.5h15" />
      <path d="M3.5 11h15" />
      <path d="M3.5 15.5h15" />
    </svg>
  );
}

function iconProps() {
  return {
    viewBox: "0 0 16 16",
    width: 18,
    height: 18,
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "block shrink-0 text-ink-400",
  };
}

function SearchIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2 13.5 13.5" />
    </svg>
  );
}

/** A clock face — the archive is the collection's past questions, not the collection itself. */
function SearchesIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="8" cy="8" r="5.3" />
      <path d="M8 5.2v3.1h2.6" />
    </svg>
  );
}

function CorpusIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M2.5 3.2h4.2c.7 0 1.3.5 1.3 1.2v8.4c0-.7-.6-1.2-1.3-1.2H2.5z" />
      <path d="M13.5 3.2H9.3c-.7 0-1.3.5-1.3 1.2v8.4c0-.7.6-1.2 1.3-1.2h4.2z" />
    </svg>
  );
}

function ProjectsIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M2.5 4.8c0-.55.45-1 1-1h2.7l1.1 1.3h5.2c.55 0 1 .45 1 1v5.1c0 .55-.45 1-1 1h-9c-.55 0-1-.45-1-1z" />
    </svg>
  );
}

function CostsIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="8" cy="8" r="5.3" />
      <path d="M8 5.2v5.6" />
      <path d="M6.3 9.6c0 .8.75 1.2 1.7 1.2s1.7-.4 1.7-1.1c0-1.6-3.4-.7-3.4-2.3 0-.7.75-1.1 1.7-1.1s1.7.4 1.7 1.1" />
    </svg>
  );
}
