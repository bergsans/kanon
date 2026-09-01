import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs";
import remarkGfm from "remark-gfm";

// "type": "module" in package.json makes this file ESM, where __dirname
// doesn't exist — derived from import.meta.url instead.
const dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)", "../.storybook/*.mdx"],
  addons: [
    "msw-storybook-addon",
    "@storybook/addon-a11y",
    {
      name: "@storybook/addon-docs",
      // MDX's base syntax has no pipe tables — that's GFM, an extension
      // this addon doesn't enable on its own. Without remark-gfm, every
      // `| a | b |` row in the Guide's .mdx pages compiles to a literal
      // paragraph of pipes and dashes instead of a <table> (see Design
      // guide/Known issues, which has five such tables).
      options: { mdxPluginOptions: { mdxCompileOptions: { remarkPlugins: [remarkGfm] } } },
    },
  ],
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },
  staticDirs: ["../public"],
  webpackFinal: async (webpackConfig) => {
    webpackConfig.resolve ??= {};
    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      // src/app/actions.ts opens with "use server" and assumes Next's server
      // runtime for every export. Storybook's preview only ever runs in the
      // browser, so every smart-compositions/ component that imports a
      // server action is redirected here by absolute path to ./mocks/actions
      // — one place instead of a mock wired into each story.
      [path.resolve(dirname, "../src/app/actions.ts")]: path.resolve(
        dirname,
        "./mocks/actions.ts",
      ),
    };
    return webpackConfig;
  },
};

export default config;
