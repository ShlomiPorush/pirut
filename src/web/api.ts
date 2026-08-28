import type {
  AuthErrorCode,
  AuthStatus,
  AuthUser,
  HouseholdMember,
} from "../application/auth-contracts.ts";
import { PUBLIC_API_PREFIXES } from "../application/auth-contracts.ts";
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
export type ApiErrorCode = ImportErrorCode | AuthErrorCode | "internal" | "network";

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
  unauthorized: "errors.unauthorized",
  setup_already_completed: "errors.setupAlreadyCompleted",
  invalid_member: "errors.invalidMember",
  member_exists: "errors.memberExists",
  weak_password: "errors.weakPassword",
  cannot_remove_self: "errors.cannotRemoveSelf",
  last_member: "errors.lastMember",
  internal: "errors.internal",
  network: "errors.network",
  too_many_requests: "errors.tooManyRequests",
};

const KNOWN_CODES = new Set(Object.keys(ERROR_MESSAGE_KEYS));

/** The multipart field the upload routes read. */
const UPLOAD_FIELD = "statement";

const STATUS_UNAUTHORIZED = 401;
const STATUS_NO_CONTENT = 204;

type UnauthorizedListener = () => void;

const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * A session can end while the interface is open, and every guarded route then answers 401.
 * The shell subscribes once and sends the viewer back to sign-in, so no screen has to
 * handle an expired session on its own.
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

/** Public routes answer without a session, so a 401 from one is not a session problem. */
function isPublicRoute(url: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => url.startsWith(prefix));
}

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

  if (response.status === STATUS_UNAUTHORIZED && !isPublicRoute(url)) {
    for (const listener of unauthorizedListeners) {
      listener();
    }
    return { ok: false, code: "unauthorized" };
  }

  // A successful delete answers 204 with no body, so there is nothing to parse.
  if (response.status === STATUS_NO_CONTENT) {
    return { ok: true, value: undefined as T };
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

function sendJson<T>(url: string, method: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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

function readUser(value: unknown): AuthUser | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const { id, name, email } = record;
  return typeof id === "string" && typeof name === "string" && typeof email === "string"
    ? { id, name, email }
    : null;
}

/**
 * Which screen the shell opens on. Public, so it answers with or without a session.
 *
 * The body is read field by field: this one answer decides whether the application or the
 * sign-in form is shown, so a malformed one must fall back to asking for a sign-in rather
 * than to a half-built member.
 */
export async function fetchAuthStatus(): Promise<ApiResult<AuthStatus>> {
  const result = await request<unknown>("/api/setup/status");
  if (!result.ok) {
    return result;
  }
  const body: Record<string, unknown> =
    typeof result.value === "object" && result.value !== null
      ? (result.value as Record<string, unknown>)
      : {};
  return {
    ok: true,
    value: { needsFirstUser: body.needsFirstUser === true, user: readUser(body.user) },
  };
}

export type NewMember = { name: string; email: string; password: string };

/** First-run setup. Succeeds once; afterwards the route answers setup_already_completed. */
export function createFirstUser(member: NewMember): Promise<ApiResult<unknown>> {
  return sendJson<unknown>("/api/setup/first-user", "POST", member);
}

export async function fetchMembers(): Promise<ApiResult<readonly HouseholdMember[]>> {
  const result = await request<unknown>("/api/household/members");
  return result.ok
    ? { ok: true, value: readArray<HouseholdMember>(result.value, "members") }
    : result;
}

export function createMember(member: NewMember): Promise<ApiResult<unknown>> {
  return sendJson<unknown>("/api/household/members", "POST", member);
}

export function deleteMember(id: string): Promise<ApiResult<void>> {
  return request<void>(`/api/household/members/${encodeURIComponent(id)}`, { method: "DELETE" });
}
