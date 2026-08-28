import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createImportService } from "../application/import-service.ts";
import { createAuth, pirutDrizzleAdapter } from "../infrastructure/auth/auth.ts";
import { createDatabase } from "../infrastructure/db/client.ts";
import { buildApp } from "./app.ts";
import { loadServerConfig } from "./config.ts";

// Resolved from this module, so the same expression works from `src/` and from `dist/`:
// both leave the repository or image root two levels up.
const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations",
);

const config = loadServerConfig();
const database = createDatabase(config.databaseUrl);

// The schema is brought up to date before the first request can arrive. A failure here
// stops the process rather than serving against a schema the code does not expect.
try {
  await migrate(database.db, { migrationsFolder });
} catch (error) {
  await database.close();
  throw error;
}

const auth = createAuth({
  adapter: pirutDrizzleAdapter(database.db),
  publicUrl: config.publicUrl,
  extraTrustedOrigins: config.trustedOrigins,
  authSecret: config.authSecret,
});

const importService = createImportService(database.db);
const app = await buildApp(config, database, importService, auth);

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await database.close();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

await app.listen({ host: config.host, port: config.port });
