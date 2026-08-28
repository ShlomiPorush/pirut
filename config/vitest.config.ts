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
  },
});
