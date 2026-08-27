import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

export type Database = ReturnType<typeof drizzle>;

export type DatabaseHandle = {
  db: Database;
  pool: Pool;
  checkConnection: () => Promise<boolean>;
  close: () => Promise<void>;
};

export function createDatabase(databaseUrl: string): DatabaseHandle {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const db = drizzle(pool);

  return {
    db,
    pool,
    async checkConnection() {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        // The reason is intentionally not logged: connection strings carry credentials.
        return false;
      }
    },
    async close() {
      await pool.end();
    },
  };
}
