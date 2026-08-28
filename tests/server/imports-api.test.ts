import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { CommitResult } from "../../src/application/import-contracts.ts";
import { buildApp, MAX_UPLOAD_BYTES } from "../../src/server/app.ts";
import {
  fakeAuth,
  fakeDatabase,
  fakeImportService,
  multipartBody,
  sampleImports,
  samplePreview,
  sampleSummary,
  sampleTransactions,
  statementUpload,
  testConfig,
  type FakeBehaviour,
  type FakeImportService,
} from "./helpers.ts";

let running: FastifyInstance | undefined;

async function startApp(behaviour: FakeBehaviour = {}): Promise<{
  app: FastifyInstance;
  service: FakeImportService;
}> {
  const service = fakeImportService(behaviour);
  const app = await buildApp(testConfig, fakeDatabase(true), service, fakeAuth());
  running = app;
  return { app, service };
}

afterEach(async () => {
  await running?.close();
  running = undefined;
});

describe("POST /api/imports/preview", () => {
  it("returns the service preview verbatim and passes the uploaded bytes through", async () => {
    const { app, service } = await startApp();
    const upload = statementUpload("statement-bytes");

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/preview",
      ...upload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(JSON.parse(JSON.stringify(samplePreview)));
    expect(service.calls.preview).toHaveLength(1);
    expect(Buffer.from(service.calls.preview[0] ?? new Uint8Array()).toString()).toBe(
      "statement-bytes",
    );
  });

  it("accepts an upload larger than the JSON body limit", async () => {
    const { app, service } = await startApp();
    const content = Buffer.alloc(2 * 1024 * 1024, 0x41);

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/preview",
      ...statementUpload(content),
    });

    expect(response.statusCode).toBe(200);
    expect(service.calls.preview[0]?.byteLength).toBe(content.byteLength);
  });

  it("answers unsupported_file when the request carries no file part", async () => {
    const { app, service } = await startApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/preview",
      ...multipartBody({ fieldName: "statement", content: "not a file" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "unsupported_file" });
    expect(service.calls.preview).toHaveLength(0);
  });

  it("answers unsupported_file when the file uses the wrong field name", async () => {
    const { app, service } = await startApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/preview",
      ...multipartBody({ fieldName: "upload", filename: "statement.xlsx", content: "bytes" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "unsupported_file" });
    expect(service.calls.preview).toHaveLength(0);
  });

  it("answers unsupported_file when the request is not multipart", async () => {
    const { app } = await startApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/preview",
      payload: { statement: "nope" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "unsupported_file" });
  });

  it("answers file_too_large when the upload exceeds the limit", async () => {
    const { app, service } = await startApp();
    const content = Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 0x41);

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/preview",
      ...statementUpload(content),
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: "file_too_large" });
    expect(service.calls.preview).toHaveLength(0);
  });

  it("answers not_a_statement with a debug detail when the parser refuses the file", async () => {
    const { app } = await startApp({
      preview: async () => {
        throw new Error(
          "This does not look like an Isracard statement: no transaction header row.",
        );
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/preview",
      ...statementUpload("junk"),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "not_a_statement",
      detail: "This does not look like an Isracard statement: no transaction header row.",
    });
  });

  it("answers statement_does_not_reconcile when the totals disagree", async () => {
    const { app } = await startApp({
      preview: async () => {
        throw new Error("The transactions total 10.00 ILS but the statement states 12.00 ILS.");
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/preview",
      ...statementUpload("bytes"),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: "statement_does_not_reconcile" });
  });
});

describe("POST /api/imports/commit", () => {
  it("returns the imported result", async () => {
    const { app, service } = await startApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/commit",
      ...statementUpload("statement-bytes"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "imported",
      importId: 7,
      inserted: 1,
      skippedDuplicates: 0,
    });
    expect(service.calls.commit).toHaveLength(1);
  });

  it("returns the already_imported result", async () => {
    const result: CommitResult = { status: "already_imported", importId: 7 };
    const { app } = await startApp({ commit: async () => result });

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/commit",
      ...statementUpload("statement-bytes"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(result);
  });

  it("maps a reconciliation failure the same way preview does", async () => {
    const { app } = await startApp({
      commit: async () => {
        throw new Error("The transactions total 10.00 ILS but the statement states 12.00 ILS.");
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/commit",
      ...statementUpload("bytes"),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: "statement_does_not_reconcile" });
  });
});

describe("GET /api/imports", () => {
  it("lists the stored imports", async () => {
    const { app, service } = await startApp();

    const response = await app.inject({ method: "GET", url: "/api/imports" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ imports: sampleImports });
    expect(service.calls.listImports).toBe(1);
  });
});

describe("GET /api/transactions", () => {
  it("returns every transaction when no filter is given", async () => {
    const { app, service } = await startApp();

    const response = await app.inject({ method: "GET", url: "/api/transactions" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ transactions: sampleTransactions });
    expect(service.calls.listTransactions).toEqual([{}]);
  });

  it("passes a complete year and month filter to the service", async () => {
    const { app, service } = await startApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/transactions?year=2026&month=8",
    });

    expect(response.statusCode).toBe(200);
    expect(service.calls.listTransactions).toEqual([{ year: 2026, month: 8 }]);
  });

  const rejected = [
    "?year=2026",
    "?month=8",
    "?year=2026&month=13",
    "?year=2026&month=0",
    "?year=2026&month=abc",
    "?year=abc&month=8",
    "?year=2026&month=8.5",
    "?year=2026&month=",
    "?year=2026&year=2025&month=8",
  ];

  for (const query of rejected) {
    it(`rejects ${query} with invalid_filter`, async () => {
      const { app, service } = await startApp();

      const response = await app.inject({ method: "GET", url: `/api/transactions${query}` });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_filter" });
      expect(service.calls.listTransactions).toHaveLength(0);
    });
  }

  it("answers invalid_filter when the service rejects the filter", async () => {
    const { app } = await startApp({
      listTransactions: async () => {
        throw new Error("invalid_filter");
      },
    });

    const response = await app.inject({ method: "GET", url: "/api/transactions" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_filter" });
  });

  it("answers internal without a stack trace when the service fails unexpectedly", async () => {
    const { app } = await startApp({
      listTransactions: async () => {
        throw new Error("connection terminated unexpectedly");
      },
    });

    const response = await app.inject({ method: "GET", url: "/api/transactions" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal" });
    expect(response.body).not.toContain("connection terminated");
  });
});

describe("GET /api/summary", () => {
  it("defaults to twelve months", async () => {
    const { app, service } = await startApp();

    const response = await app.inject({ method: "GET", url: "/api/summary" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ months: sampleSummary });
    expect(service.calls.monthlySummary).toEqual([12]);
  });

  it("accepts the boundaries of the supported window", async () => {
    const { app, service } = await startApp();

    expect((await app.inject({ method: "GET", url: "/api/summary?months=1" })).statusCode).toBe(
      200,
    );
    expect((await app.inject({ method: "GET", url: "/api/summary?months=36" })).statusCode).toBe(
      200,
    );
    expect(service.calls.monthlySummary).toEqual([1, 36]);
  });

  for (const query of ["?months=0", "?months=37", "?months=-1", "?months=abc", "?months="]) {
    it(`rejects ${query} with invalid_filter`, async () => {
      const { app, service } = await startApp();

      const response = await app.inject({ method: "GET", url: `/api/summary${query}` });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_filter" });
      expect(service.calls.monthlySummary).toHaveLength(0);
    });
  }
});

describe("unknown API routes", () => {
  it("stay a 404 without the static fallback", async () => {
    const { app } = await startApp();

    const response = await app.inject({ method: "GET", url: "/api/nope" });

    expect(response.statusCode).toBe(404);
  });
});
