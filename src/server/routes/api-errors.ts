import type { AuthErrorCode } from "../../application/auth-contracts.ts";
import type { ImportErrorCode } from "../../application/import-contracts.ts";

/**
 * Translation from thrown values to the API error envelope.
 *
 * The API never returns a human sentence meant for display: the client localises by the
 * `error` code. `detail` exists for debugging only and is never logged, because parser
 * messages can quote cell contents.
 */

/**
 * Every code the API can answer with. The envelope shape is the contract's `ApiError`;
 * this widens only the set of codes, so an importing client reading `ApiError` still sees
 * a valid response.
 */
export type ApiErrorCode = ImportErrorCode | AuthErrorCode | "internal" | "not_found";

export type ApiErrorBody = {
  error: ApiErrorCode;
  /** Debug detail. Never shown to a user; the client localises by `error` code. */
  detail?: string;
};

export type ApiErrorResponse = {
  statusCode: number;
  body: ApiErrorBody;
};

/** Where the failure came from, which decides how an unrecognised `Error` is read. */
export type ErrorSource = "upload" | "query";

/** Thrown by a route when it already knows the exact code the client should receive. */
export class ApiProblem extends Error {
  readonly statusCode: number;
  readonly errorCode: ApiErrorCode;
  readonly detail: string | undefined;

  constructor(statusCode: number, errorCode: ApiErrorCode, detail?: string) {
    super(errorCode);
    this.name = "ApiProblem";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.detail = detail;
  }
}

/**
 * The reconciliation failure in the Isracard parser is the one parse error worth its own
 * code, because it means the file was read but the totals disagree. It is recognised by
 * the fixed part of the thrown message.
 */
const RECONCILIATION_MARKER = "but the statement states";

/** The service signals a rejected filter by message, since the contract has no error type. */
const INVALID_FILTER_MESSAGE = "invalid_filter";

/** Codes raised by Fastify and @fastify/multipart before or during upload handling. */
const FRAMEWORK_ERROR_CODES: Record<string, ApiErrorResponse> = {
  FST_REQ_FILE_TOO_LARGE: { statusCode: 413, body: { error: "file_too_large" } },
  FST_ERR_CTP_BODY_TOO_LARGE: { statusCode: 413, body: { error: "file_too_large" } },
  FST_PARTS_LIMIT: { statusCode: 400, body: { error: "unsupported_file" } },
  FST_FILES_LIMIT: { statusCode: 400, body: { error: "unsupported_file" } },
  FST_FIELDS_LIMIT: { statusCode: 400, body: { error: "unsupported_file" } },
  FST_PROTO_VIOLATION: { statusCode: 400, body: { error: "unsupported_file" } },
  FST_INVALID_MULTIPART_CONTENT_TYPE: { statusCode: 400, body: { error: "unsupported_file" } },
  FST_MP_PREMATURE_CLOSE: { statusCode: 400, body: { error: "unsupported_file" } },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: { statusCode: 400, body: { error: "unsupported_file" } },
  FST_ERR_CTP_EMPTY_JSON_BODY: { statusCode: 400, body: { error: "unsupported_file" } },
  FST_ERR_CTP_INVALID_JSON_BODY: { statusCode: 400, body: { error: "unsupported_file" } },
};

function frameworkCodeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code: unknown = (error as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Maps any thrown value to a status code and an envelope.
 *
 * `source` decides the fallback: an upload route only ever calls the parser, so an
 * unrecognised `Error` means the bytes were not a statement this importer understands.
 * Everywhere else an unrecognised error is a defect and answers 500.
 */
export function classifyApiError(error: unknown, source: ErrorSource): ApiErrorResponse {
  if (error instanceof ApiProblem) {
    return {
      statusCode: error.statusCode,
      body:
        error.detail === undefined
          ? { error: error.errorCode }
          : { error: error.errorCode, detail: error.detail },
    };
  }

  const frameworkCode = frameworkCodeOf(error);
  if (frameworkCode !== undefined) {
    const mapped = FRAMEWORK_ERROR_CODES[frameworkCode];
    if (mapped !== undefined) return { statusCode: mapped.statusCode, body: { ...mapped.body } };
    // Any other coded error is infrastructure speaking: PostgreSQL raises SQLSTATE codes
    // such as 23505, the driver raises ECONNREFUSED. Parser errors carry no code, so a
    // coded failure during an upload is a server problem, not a bad statement.
    return { statusCode: 500, body: { error: "internal" } };
  }

  if (!(error instanceof Error)) return { statusCode: 500, body: { error: "internal" } };

  if (error.message === INVALID_FILTER_MESSAGE) {
    return { statusCode: 400, body: { error: "invalid_filter" } };
  }
  if (error.message.includes(RECONCILIATION_MARKER)) {
    // The amounts stay out of the envelope; the code is enough for the client to explain.
    return { statusCode: 422, body: { error: "statement_does_not_reconcile" } };
  }
  if (source === "upload") {
    return { statusCode: 422, body: { error: "not_a_statement", detail: error.message } };
  }
  return { statusCode: 500, body: { error: "internal" } };
}
