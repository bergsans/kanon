import { defineConfig } from "vitest/config";
import path from "node:path";

// Pure-function tests only — no database, no network, no native modules.
// `environment: "node"` (the default) is stated explicitly so a future
// dependency on jsdom doesn't creep in unnoticed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
