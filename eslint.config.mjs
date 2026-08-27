import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "data/", "db/migrations/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/web/**/*.tsx", "src/web/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
