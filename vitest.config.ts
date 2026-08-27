import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Web tests opt into jsdom with a `@vitest-environment jsdom` docblock.
    environment: "node",
    env: { PIRUT_LOG_LEVEL: "silent" },
  },
});
