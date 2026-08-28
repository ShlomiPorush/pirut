import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Lint is always invoked from the repository root with --config, so ignore patterns are
// written relative to the root, not to this file.
export default tseslint.config(
  { ignores: ["dist/", "coverage/", "data/", "db/migrations/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/web/**/*.tsx", "src/web/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
