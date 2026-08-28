import { describe, expect, it } from "vitest";
import { ApiProblem, classifyApiError } from "../../src/server/routes/api-errors.ts";

function frameworkError(code: string): Error {
  const error = new Error("framework failure");
  Object.assign(error, { code });
  return error;
}

describe("classifyApiError", () => {
  it("reports a database failure during an upload as internal, not as a bad statement", () => {
    // node-postgres errors carry a SQLSTATE or syscall code; parser errors never do.
    const pgError = Object.assign(new Error("duplicate key value"), { code: "23505" });
    expect(classifyApiError(pgError, "upload")).toEqual({
      statusCode: 500,
      body: { error: "internal" },
    });

    const connectionError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    expect(classifyApiError(connectionError, "upload")).toEqual({
      statusCode: 500,
      body: { error: "internal" },
    });
  });

  it("uses the code and detail an ApiProblem already carries", () => {
    const problem = new ApiProblem(400, "unsupported_file", "the request contains no file part");

    expect(classifyApiError(problem, "upload")).toEqual({
      statusCode: 400,
      body: { error: "unsupported_file", detail: "the request contains no file part" },
    });
  });

  it("omits detail when an ApiProblem has none", () => {
    expect(classifyApiError(new ApiProblem(400, "invalid_filter"), "query")).toEqual({
      statusCode: 400,
      body: { error: "invalid_filter" },
    });
  });

  it("maps an oversized upload to file_too_large", () => {
    expect(classifyApiError(frameworkError("FST_REQ_FILE_TOO_LARGE"), "upload")).toEqual({
      statusCode: 413,
      body: { error: "file_too_large" },
    });
    expect(classifyApiError(frameworkError("FST_ERR_CTP_BODY_TOO_LARGE"), "upload")).toEqual({
      statusCode: 413,
      body: { error: "file_too_large" },
    });
  });

  it("maps malformed multipart requests to unsupported_file", () => {
    for (const code of [
      "FST_INVALID_MULTIPART_CONTENT_TYPE",
      "FST_FILES_LIMIT",
      "FST_PARTS_LIMIT",
      "FST_MP_PREMATURE_CLOSE",
      "FST_ERR_CTP_INVALID_MEDIA_TYPE",
    ]) {
      expect(classifyApiError(frameworkError(code), "upload")).toEqual({
        statusCode: 400,
        body: { error: "unsupported_file" },
      });
    }
  });

  it("maps the service's invalid_filter signal to a 400", () => {
    expect(classifyApiError(new Error("invalid_filter"), "query")).toEqual({
      statusCode: 400,
      body: { error: "invalid_filter" },
    });
  });

  it("recognises a reconciliation failure by the parser's message", () => {
    const error = new Error("The transactions total 10.00 ILS but the statement states 12.00 ILS.");

    expect(classifyApiError(error, "upload")).toEqual({
      statusCode: 422,
      body: { error: "statement_does_not_reconcile" },
    });
  });

  it("keeps amounts out of the reconciliation envelope", () => {
    const error = new Error("The transactions total 10.00 ILS but the statement states 12.00 ILS.");
    const { body } = classifyApiError(error, "upload");

    expect(JSON.stringify(body)).not.toContain("10.00");
  });

  it("reads any other upload failure as a file this importer does not understand", () => {
    expect(
      classifyApiError(new Error("The statement does not identify a card."), "upload"),
    ).toEqual({
      statusCode: 422,
      body: { error: "not_a_statement", detail: "The statement does not identify a card." },
    });
  });

  it("reads any other query failure as an internal defect", () => {
    expect(classifyApiError(new Error("relation does not exist"), "query")).toEqual({
      statusCode: 500,
      body: { error: "internal" },
    });
  });

  it("treats a thrown non-error as internal", () => {
    expect(classifyApiError("boom", "upload")).toEqual({
      statusCode: 500,
      body: { error: "internal" },
    });
    expect(classifyApiError(undefined, "query")).toEqual({
      statusCode: 500,
      body: { error: "internal" },
    });
  });

  it("does not share mutable state between classifications", () => {
    const first = classifyApiError(frameworkError("FST_REQ_FILE_TOO_LARGE"), "upload");
    first.body.detail = "mutated";
    const second = classifyApiError(frameworkError("FST_REQ_FILE_TOO_LARGE"), "upload");

    expect(second.body).toEqual({ error: "file_too_large" });
  });
});
