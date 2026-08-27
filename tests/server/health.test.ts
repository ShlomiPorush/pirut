import { describe, expect, it } from "vitest";
import type { DatabaseHandle } from "../../src/infrastructure/db/client.ts";
import { buildApp } from "../../src/server/app.ts";
import type { ServerConfig } from "../../src/server/config.ts";

const config: ServerConfig = {
  host: "127.0.0.1",
  port: 4610,
  databaseUrl: "postgres://unused",
  staticRoot: undefined,
};

function fakeDatabase(connected: boolean): DatabaseHandle {
  return {
    db: undefined as unknown as DatabaseHandle["db"],
    pool: undefined as unknown as DatabaseHandle["pool"],
    checkConnection: async () => connected,
    close: async () => {},
  };
}

describe("health endpoint", () => {
  it("reports ready when the database answers", async () => {
    const app = await buildApp(config, fakeDatabase(true));
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready", database: "connected" });

    await app.close();
  });

  it("reports degraded with a failing status code when the database is unreachable", async () => {
    const app = await buildApp(config, fakeDatabase(false));
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "degraded", database: "disconnected" });

    await app.close();
  });
});
