import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, waitFor } from "storybook/test";
import { CanonSearch } from "./CanonSearch";
import {
  AVAILABLE,
  COST,
  guardrailApiHandler,
  PASSAGES,
  searchApiHandler,
  searchApiHandlerWithExternal,
  searchDeclinedApiHandler,
} from "./storyFixtures";

/**
 * The whole search session: the question, the streamed answer, the cost
 * tag, and the export menu. `initial` renders an already-answered session
 * with no network involved — the same prop `/s/[id]/page.tsx` passes for a
 * saved search. `Live` instead exercises the real fetch-and-stream path
 * against a mocked /api/search (see storyFixtures.searchApiHandler).
 */
const meta = {
  title: "Smart compositions/CanonSearch",
  component: CanonSearch,
  parameters: { layout: "padded" },
  args: { available: AVAILABLE },
} satisfies Meta<typeof CanonSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ställ en fråga")).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Din fråga" })).toBeInTheDocument();
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
  },
};

export const Answered: Story = {
  args: {
    initial: {
      prompt: "What distinguishes Stoicism from Epicureanism?",
      filter: { genres: ["filosofi"], eras: ["antiken"] },
      slug: "stoicism-epicureanism",
      passages: PASSAGES,
      cost: COST,
      durationMs: 8_400,
      corpusGrowth: 0,
    },
  },
  play: async ({ canvas, userEvent }) => {
    // All three passages listed. The top one starts expanded — it's
    // already the strongest answer by reranking's own order — the other
    // two start closed; see CanonSearch's own comment on `open`.
    const rows = canvas.getAllByRole("button", { name: /Epictetus|Marcus Aurelius|Seneca/ });
    await expect(rows).toHaveLength(3);
    await expect(rows[0]).toHaveAttribute("aria-expanded", "true");
    for (const row of rows.slice(1)) await expect(row).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.getByText(/In our power are opinion/)).toBeInTheDocument();

    await expect(canvas.getByText("claude-sonnet-5")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Exportera" })).toBeInTheDocument();

    await userEvent.click(rows[1]);
    await expect(rows[1]).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText(/Begin the morning by saying to thyself/)).toBeInTheDocument();
  },
};

/**
 * A cache hit whose collection has grown since — `corpusGrowth` only ever
 * arrives non-zero this way (see the "done" event's own comment in
 * protocol.ts). "Sök på nytt" re-runs the search with `fresh: true`,
 * exercised here against the same mocked /api/search the `Live` story uses.
 */
export const AnsweredFromArchiveGrown: Story = {
  args: {
    initial: {
      prompt: "What distinguishes Stoicism from Epicureanism?",
      filter: { genres: ["filosofi"], eras: ["antiken"] },
      slug: "stoicism-epicureanism",
      passages: PASSAGES,
      cost: { ...COST, usd: 0, cached: true },
      durationMs: 8_400,
      corpusGrowth: 34,
    },
  },
  parameters: {
    msw: { handlers: [searchApiHandler()] },
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByText(
        "Samlingen har vuxit med 34 verk sedan svaret togs fram.",
      ),
    ).toBeInTheDocument();

    const again = canvas.getByRole("button", { name: /Sök på nytt/ });
    await userEvent.click(again);
    // A real re-search started — the same busy status the `Live` story
    // checks, proving the click actually reached `search()` and not just a
    // no-op button.
    await expect(await canvas.findByText("Tolkar frågan…")).toBeInTheDocument();
  },
};

export const Live: Story = {
  parameters: {
    msw: { handlers: [searchApiHandler()] },
  },
  play: async ({ canvas, userEvent }) => {
    const field = await canvas.findByRole("textbox", { name: "Din fråga" });
    await userEvent.type(field, "What distinguishes Stoicism from Epicureanism?");
    await userEvent.click(canvas.getByRole("button", { name: "Sök" }));

    // The mocked stream's first event ("plan") arrives after ~400ms — the
    // "reading the question" status should be up before anything else is.
    await expect(await canvas.findByText("Tolkar frågan…")).toBeInTheDocument();

    // Four events at ~400ms apart — comfortably inside a 5s window even
    // under CI load.
    await waitFor(() => expect(canvas.queryByRole("status")).not.toBeInTheDocument(), {
      timeout: 5000,
    });
    await expect(canvas.getAllByText(/Epictetus|Marcus Aurelius|Seneca/).length).toBeGreaterThan(0);
  },
};

/**
 * The "utanför samlingen" checkbox, checked before submitting — see
 * `findExternal` in claude.ts and `ExternalSources`. The mocked stream
 * (`searchApiHandlerWithExternal`) sends its "external" event after "done",
 * the same order the real route uses since the step runs alongside
 * retrieval and reranking rather than before them — so the passages appear
 * first and the external section a beat later, exactly as this proves.
 */
export const LiveWithExternal: Story = {
  parameters: {
    msw: { handlers: [searchApiHandlerWithExternal()] },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Inkludera källor/ }),
    );
    const field = await canvas.findByRole("textbox", { name: "Din fråga" });
    await userEvent.type(field, "What distinguishes Stoicism from Epicureanism?");
    await userEvent.click(canvas.getByRole("button", { name: "Sök" }));

    // The collection's own answer lands first…
    await expect(
      await canvas.findByText(/Epictetus|Marcus Aurelius|Seneca/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    // …and the external pointer a beat after, never mixed into that list.
    await expect(
      await canvas.findByRole(
        "link",
        { name: "Alexandra Kollontai, Communism and the Family" },
        { timeout: 5000 },
      ),
    ).toHaveAttribute(
      "href",
      "https://www.marxists.org/archive/kollontai/1920/communism-family.htm",
    );
    await expect(canvas.getByText(/Extern sökning/)).toBeInTheDocument();
  },
};

/**
 * Inappropriate material never becomes an answer: Claude itself is the
 * guardrail here, declining while reading the question (`stop_reason:
 * "refusal"`, see `IncompleteAnswerError` in claude.ts) rather than the app
 * filtering anything client-side. That happens during expansion, the
 * pipeline's first call, so the real route never reaches `plan` or
 * `candidates` — its `declined` event is the whole stream, exactly like
 * `OutOfScope` below. The message is copied verbatim from i18n.ts's
 * "claude.refused", and the heading is the neutral "declined" box, not the
 * accent-colored error one: nothing broke, the guardrail worked.
 */
export const Refused: Story = {
  parameters: {
    msw: {
      handlers: [searchDeclinedApiHandler("Claude avböjde att svara på frågan.")],
    },
  },
  play: async ({ canvas, userEvent }) => {
    const field = await canvas.findByRole("textbox", { name: "Din fråga" });
    await userEvent.type(field, "En olämplig fråga");
    await userEvent.click(canvas.getByRole("button", { name: "Sök" }));

    await expect(
      await canvas.findByText("Frågan avvisades", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Claude avböjde att svara på frågan."),
    ).toBeInTheDocument();
    // No passages, and the busy status is gone — the decline replaces the
    // wait, it doesn't sit alongside it.
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
    await expect(
      canvas.queryByText(/Epictetus|Marcus Aurelius|Seneca/),
    ).not.toBeInTheDocument();
  },
};

/**
 * The relevance guardrail: a question with no plausible reading as one for
 * the collection is declined during expansion, before retrieval or
 * reranking ever run — see `inScope` on `QueryPlan` in claude.ts. The
 * message is copied verbatim from i18n.ts's "claude.outOfScope".
 */
export const OutOfScope: Story = {
  parameters: {
    msw: {
      handlers: [
        searchDeclinedApiHandler(
          "Frågan verkar inte höra hemma i samlingen. Canon svarar på frågor till västerlandets kanon — filosofi, historia, politik, drama, dikt och liknande — inte till exempel räkneuppgifter eller kodfrågor.",
        ),
      ],
    },
  },
  play: async ({ canvas, userEvent }) => {
    const field = await canvas.findByRole("textbox", { name: "Din fråga" });
    await userEvent.type(field, "Vad är 4 plus 4?");
    await userEvent.click(canvas.getByRole("button", { name: "Sök" }));

    await expect(
      await canvas.findByText("Frågan avvisades", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/inte höra hemma i samlingen/),
    ).toBeInTheDocument();
    // The cost of the expansion call that made this decision is still
    // shown — a declined question isn't free, and the app never pretends
    // it is (see `EXPANSION_COST` in storyFixtures.ts).
    await expect(canvas.getByText("claude-sonnet-5")).toBeInTheDocument();
  },
};

/**
 * `Refused` and `OutOfScope` above each prove one fixed outcome — that's
 * what makes them a reliable check, but neither can be typed into by hand.
 * This story's mock (`guardrailApiHandler`) is the one handler in
 * storyFixtures.ts that actually reads the submitted question instead of
 * always returning the same canned result, so it's the story built for
 * trying the guardrails rather than only watching them proven:
 *
 *   - a plain question gets a real mocked answer, same as `Live`;
 *   - a simple arithmetic question ("vad är 4 plus 4", "what is 2+2") gets
 *     declined by the relevance guardrail;
 *   - a question containing the word "olämplig" ("inappropriate") gets
 *     declined the way Claude's own refusal would — a safe stand-in, since
 *     nothing actually inappropriate needs to be typed to see that path.
 *
 * The `play` function only demonstrates the arithmetic case, with a real
 * assertion (every story here has one). The search box stays open
 * afterward — a decline never reaches `phase === "done"`, and
 * `showSearchBox` is true whenever it isn't — so retyping the question with
 * something else is how the other two paths get tried by hand, in
 * Storybook's own canvas.
 */
export const TryTheGuardrails: Story = {
  parameters: {
    msw: { handlers: [guardrailApiHandler()] },
  },
  play: async ({ canvas, userEvent }) => {
    const field = await canvas.findByRole("textbox", { name: "Din fråga" });
    await userEvent.type(field, "Vad är 4 plus 4?");
    await userEvent.click(canvas.getByRole("button", { name: "Sök" }));

    await expect(
      await canvas.findByText("Frågan avvisades", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  },
};
