import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, "../..");

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  build: {
    outDir: path.join(repoRoot, "dist/web"),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      // Anchored to the trailing slash: a bare "/api" prefix also captures source
      // modules such as /api.ts and serves them from the backend instead of Vite.
      "^/api/": "http://127.0.0.1:4610",
    },
  },
});
