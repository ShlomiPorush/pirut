import type {
  CommitResult,
  ImportErrorCode,
  MonthlySummary,
  StatementPreview,
  StoredTransaction,
} from "../application/import-contracts.ts";

/**
 * The API's own codes plus the two failures that never reach it: a server error with no
 * usable body, and a request that could not be sent at all.
 */
export type ApiErrorCode = ImportErrorCode | "internal" | "network";

export type ApiResult<T> = { ok: true; value: T } | { ok: false; code: ApiErrorCode };

/**
 * Every code maps to a message that says what happened and what to do next. Keeping the map
 * total means a new code cannot ship without a translation.
 */
export const ERROR_MESSAGE_KEYS: Record<ApiErrorCode, string> = {
  not_a_statement: "errors.notAStatement",
  statement_does_not_reconcile: "errors.statementDoesNotReconcile",
  unsupported_file: "errors.unsupportedFile",
  file_too_large: "errors.fileTooLarge",
  invalid_filter: "errors.invalidFilter",
  internal: "errors.internal",
  network: "errors.network",
};

const KNOWN_CODES = new Set(Object.keys(ERROR_MESSAGE_KEYS));

/** The multipart field the upload routes read. */
const UPLOAD_FIELD = "statement";

function readErrorCode(body: unknown): ApiErrorCode {
  if (typeof body === "object" && body !== null && "error" in body) {
    const code = (body as { error: unknown }).error;
    if (typeof code === "string" && KNOWN_CODES.has(code)) {
      return code as ApiErrorCode;
    }
  }
  return "internal";
}

async function request<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, code: "network" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, code: "internal" };
  }

  if (!response.ok) {
    return { ok: false, code: readErrorCode(body) };
  }
  return { ok: true, value: body as T };
}

function uploadBody(file: File): FormData {
  const form = new FormData();
  form.append(UPLOAD_FIELD, file);
  return form;
}

export function previewStatement(file: File): Promise<ApiResult<StatementPreview>> {
  return request<StatementPreview>("/api/imports/preview", {
    method: "POST",
    body: uploadBody(file),
  });
}

export function commitStatement(file: File): Promise<ApiResult<CommitResult>> {
  return request<CommitResult>("/api/imports/commit", {
    method: "POST",
    body: uploadBody(file),
  });
}

function readArray<T>(body: unknown, field: string): readonly T[] {
  if (typeof body === "object" && body !== null && field in body) {
    const value = (body as Record<string, unknown>)[field];
    if (Array.isArray(value)) {
      return value as T[];
    }
  }
  return [];
}

export async function fetchMonthlySummary(
  monthLimit: number,
): Promise<ApiResult<readonly MonthlySummary[]>> {
  const result = await request<unknown>(`/api/summary?months=${String(monthLimit)}`);
  return result.ok
    ? { ok: true, value: readArray<MonthlySummary>(result.value, "months") }
    : result;
}

export async function fetchTransactions(
  year: number,
  month: number,
): Promise<ApiResult<readonly StoredTransaction[]>> {
  const query = `year=${String(year)}&month=${String(month)}`;
  const result = await request<unknown>(`/api/transactions?${query}`);
  return result.ok
    ? { ok: true, value: readArray<StoredTransaction>(result.value, "transactions") }
    : result;
}
