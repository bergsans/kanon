import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { PageHeader } from "./PageHeader";

/**
 * The breadcrumb every page below the home page shares — one component
 * instead of the seven that had already drifted apart from each other (see
 * the file's own comment). `title` decides between the compact breadcrumb
 * and the full heading + rule.
 */
const meta = {
  title: "Smart compositions/PageHeader",
  component: PageHeader,
  parameters: { layout: "padded" },
  args: { locale: "en", href: "/", label: "to the search" },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BreadcrumbOnly: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Canon.*to the search/ })).toHaveAttribute(
      "href",
      "/",
    );
    // No `title` — the compact breadcrumb carries no page heading.
    await expect(canvas.queryByRole("heading")).not.toBeInTheDocument();
  },
};

export const WithTitle: Story = {
  args: { title: "The collection", label: "to the home page" },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "The collection" }),
    ).toBeInTheDocument();
  },
};

export const WithTitleAndChildren: Story = {
  args: { title: "Costs", label: "to the home page" },
  render: (args) => (
    <PageHeader {...args}>
      <p className="mt-4 max-w-xl text-sm text-ink-600">
        What every search and translation has cost, in dollars and kronor.
      </p>
    </PageHeader>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Costs" })).toBeInTheDocument();
    await expect(
      canvas.getByText(/What every search and translation has cost/),
    ).toBeInTheDocument();
  },
};
