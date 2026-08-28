import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

// This file lives under config/, so the repository root is stated explicitly rather than
// inferred from the config file location.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  root: repoRoot,
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Web tests opt into jsdom with a `@vitest-environment jsdom` docblock.
    environment: "node",
    env: { PIRUT_LOG_LEVEL: "silent" },
    // The server tests run a real Better Auth instance, which spends several seconds
    // initialising its crypto the first time a worker builds a context. That cost lands
    // on whichever test runs first, so the default 5s would fail a test for a reason
    // unrelated to what it asserts.
    testTimeout: 30_000,
  },
});
