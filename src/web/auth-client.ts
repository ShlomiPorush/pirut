import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";
import type { AuthFailure, AuthResult } from "./auth-errors.ts";

/**
 * The single place that talks to Better Auth.
 *
 * Everything below returns Pirut's own result shape, so screens never touch the library's
 * response union or its English messages, and tests can replace this one module.
 */
const client = createAuthClient({
  basePath: "/api/auth",
  plugins: [passkeyClient()],
});

/** A registered passkey, reduced to what the settings list shows. */
export type RegisteredPasskey = {
  id: string;
  /** Passkeys registered elsewhere may carry no name. */
  name: string | null;
  /** ISO timestamp, or null when the record carried none. */
  createdAt: string | null;
};

function toFailure(error: unknown): AuthFailure {
  const record: Record<string, unknown> =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  return {
    code: typeof record.code === "string" ? record.code : null,
    status: typeof record.status === "number" ? record.status : 0,
  };
}

/** The plugin types `createdAt` as a `Date`, but over the wire it arrives as a string. */
function toIsoString(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return typeof value === "string" ? value : null;
}

function toRegisteredPasskey(entry: {
  id: string;
  name?: string;
  createdAt: Date;
}): RegisteredPasskey {
  return {
    id: entry.id,
    name: typeof entry.name === "string" && entry.name !== "" ? entry.name : null,
    createdAt: toIsoString(entry.createdAt),
  };
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthResult<void>> {
  const response = await client.signIn.email({ email, password });
  return response.error === null
    ? { ok: true, value: undefined }
    : { ok: false, failure: toFailure(response.error) };
}

/**
 * `autoFill` asks the browser for conditional UI: the passkey is offered from the email
 * field rather than behind a button, and the promise settles only once the viewer chooses.
 */
export async function signInWithPasskey(autoFill = false): Promise<AuthResult<void>> {
  const response = await client.signIn.passkey({ autoFill });
  return response.error === null
    ? { ok: true, value: undefined }
    : { ok: false, failure: toFailure(response.error) };
}

export async function signOut(): Promise<void> {
  await client.signOut();
}

export async function listPasskeys(): Promise<AuthResult<readonly RegisteredPasskey[]>> {
  const response = await client.passkey.listUserPasskeys();
  return response.error === null
    ? { ok: true, value: response.data.map(toRegisteredPasskey) }
    : { ok: false, failure: toFailure(response.error) };
}

export async function addPasskey(name: string): Promise<AuthResult<void>> {
  const response = await client.passkey.addPasskey({ name });
  return response.error === null
    ? { ok: true, value: undefined }
    : { ok: false, failure: toFailure(response.error) };
}

export async function removePasskey(id: string): Promise<AuthResult<void>> {
  const response = await client.passkey.deletePasskey({ id });
  return response.error === null
    ? { ok: true, value: undefined }
    : { ok: false, failure: toFailure(response.error) };
}

/**
 * Conditional UI is a browser capability, not a library one. When it is missing the screen
 * keeps its plain passkey button, which works on every WebAuthn browser.
 */
export async function passkeyAutofillAvailable(): Promise<boolean> {
  const credentials = (globalThis as Record<string, unknown>).PublicKeyCredential;
  if (typeof credentials !== "function") {
    return false;
  }
  const check = (credentials as unknown as Record<string, unknown>).isConditionalMediationAvailable;
  if (typeof check !== "function") {
    return false;
  }
  try {
    return (await (check as () => Promise<boolean>).call(credentials)) === true;
  } catch {
    return false;
  }
}
