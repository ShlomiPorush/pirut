import { createDatabase } from "../infrastructure/db/client.ts";
import { buildApp } from "./app.ts";
import { loadServerConfig } from "./config.ts";

const config = loadServerConfig();
const database = createDatabase(config.databaseUrl);
const app = await buildApp(config, database);

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
