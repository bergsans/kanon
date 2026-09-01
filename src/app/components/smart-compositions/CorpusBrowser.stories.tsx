import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import type { Entry, Section } from "@/lib/corpus-view";
import { CorpusBrowser } from "./CorpusBrowser";

function entry(partial: Partial<Entry> & Pick<Entry, "id" | "author" | "title" | "year">): Entry {
  return {
    translator: null,
    genre: "filosofi",
    era: "antiken",
    source: "gutenberg",
    sourceId: partial.id,
    href: null,
    ...partial,
  };
}

const EPICTETUS = entry({
  id: "epictetus-enchiridion-gutenberg",
  author: "Epictetus",
  title: "Encheiridion",
  year: 135,
  href: "https://www.gutenberg.org/ebooks/45109",
});
const MARCUS = entry({
  id: "marcus-aurelius-meditations-gutenberg",
  author: "Marcus Aurelius",
  title: "Self-Communings",
  year: 180,
  href: "https://www.gutenberg.org/ebooks/2680",
});
const DOSTOEVSKY_CRIME = entry({
  id: "dostoevsky-crime-punishment-gutenberg",
  author: "Fyodor Dostoyevsky",
  title: "Crime and Punishment",
  year: 1866,
  genre: "prosa",
  era: "1800-tal",
  translator: "Constance Garnett",
});
const DOSTOEVSKY_IDIOT = entry({
  id: "dostoevsky-idiot-gutenberg",
  author: "Fyodor Dostoyevsky",
  title: "The Idiot",
  year: 1869,
  genre: "prosa",
  era: "1800-tal",
  translator: "Eva Martin",
});

const GENRE_SECTIONS: Section[] = [
  {
    kind: "genre",
    key: "filosofi",
    works: 2,
    authors: [
      { author: "Epictetus", works: [EPICTETUS] },
      { author: "Marcus Aurelius", works: [MARCUS] },
    ],
  },
  {
    kind: "genre",
    key: "prosa",
    works: 2,
    authors: [
      { author: "Fyodor Dostoyevsky", works: [DOSTOEVSKY_CRIME, DOSTOEVSKY_IDIOT] },
    ],
  },
];

const ERA_SECTIONS: Section[] = [
  {
    kind: "era",
    key: "antiken",
    works: 2,
    authors: [
      { author: "Epictetus", works: [EPICTETUS] },
      { author: "Marcus Aurelius", works: [MARCUS] },
    ],
  },
  {
    kind: "era",
    key: "1800-tal",
    works: 2,
    authors: [
      { author: "Fyodor Dostoyevsky", works: [DOSTOEVSKY_CRIME, DOSTOEVSKY_IDIOT] },
    ],
  },
];

const LETTER_SECTIONS: Section[] = [
  { kind: "letter", key: "D", works: 2, authors: [{ author: "Fyodor Dostoyevsky", works: [DOSTOEVSKY_CRIME, DOSTOEVSKY_IDIOT] }] },
  { kind: "letter", key: "E", works: 1, authors: [{ author: "Epictetus", works: [EPICTETUS] }] },
  { kind: "letter", key: "M", works: 1, authors: [{ author: "Marcus Aurelius", works: [MARCUS] }] },
];

/**
 * `/samling` as plain HTML plus a client-side filter — the search box and
 * the genre/era/author tabs are the only interactive parts; the three
 * groupings arrive pre-sorted from the server (see the component's own
 * comment) and are never re-sorted here.
 */
const meta = {
  title: "Smart compositions/CorpusBrowser",
  component: CorpusBrowser,
  parameters: { layout: "padded" },
  args: {
    genreSections: GENRE_SECTIONS,
    eraSections: ERA_SECTIONS,
    letterSections: LETTER_SECTIONS,
  },
} satisfies Meta<typeof CorpusBrowser>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ByGenre: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "filosofi" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "prosa" })).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "Ämne" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
};

export const ByEra: Story = {
  play: async ({ canvas, userEvent }) => {
    const eraTab = await canvas.findByRole("tab", { name: "Epok" });
    await userEvent.click(eraTab);
    await expect(eraTab).toHaveAttribute("aria-selected", "true");
    // Same sections regrouped by era instead of genre — "antiken" and
    // "1800-tal" are headings now, "filosofi"/"prosa" are gone as headings.
    await expect(canvas.getByRole("heading", { name: "antiken" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "1800-talet" })).toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "filosofi" })).not.toBeInTheDocument();
  },
};

export const Filtered: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByRole("textbox", { name: "Filtrera samlingen" }),
      "dosto",
    );
    // Only Dostoyevsky's two works match — Epictetus and Marcus Aurelius
    // drop out along with their whole "filosofi" section.
    await expect(canvas.getByText("2 träffar")).toBeInTheDocument();
    // getByText can't find this one — "dosto" is inside the match and
    // `Highlighted` wraps it in its own <mark>, splitting the name across
    // elements. getByRole reads a heading's accessible name from all of
    // its descendant text regardless of how it's split, so it isn't fooled.
    await expect(
      canvas.getByRole("heading", { name: /Fyodor Dostoyevsky/, level: 3 }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: /Epictetus/, level: 3 }),
    ).not.toBeInTheDocument();
  },
};
