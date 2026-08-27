import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadServerConfig } from "../../server/config.ts";
import { createDatabase } from "./client.ts";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../db/migrations",
);

const config = loadServerConfig();
const database = createDatabase(config.databaseUrl);

try {
  await migrate(database.db, { migrationsFolder });
  console.log("Migrations applied");
} finally {
  await database.close();
}
