import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.ts";
import { fakeDatabase, fakeImportService, testConfig } from "./helpers.ts";

describe("health endpoint", () => {
  it("reports ready when the database answers", async () => {
    const app = await buildApp(testConfig, fakeDatabase(true), fakeImportService());
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready", database: "connected" });

    await app.close();
  });

  it("reports degraded with a failing status code when the database is unreachable", async () => {
    const app = await buildApp(testConfig, fakeDatabase(false), fakeImportService());
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "degraded", database: "disconnected" });

    await app.close();
  });
});
