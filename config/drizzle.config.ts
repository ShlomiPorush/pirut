import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.PIRUT_DATABASE_URL ?? "",
  },
});
