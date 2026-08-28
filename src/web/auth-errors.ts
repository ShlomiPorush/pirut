/**
 * Better Auth answers with its own English message and a machine-readable code. Only the
 * code is used here: the viewer always reads Pirut's own localized wording.
 */
export type AuthFailure = {
  /** Better Auth's stable code, or null when the failure carried none. */
  code: string | null;
  /** The HTTP status, which carries the rate-limit answer that has no code. */
  status: number;
};

export type AuthResult<T> = { ok: true; value: T } | { ok: false; failure: AuthFailure };

const STATUS_TOO_MANY_REQUESTS = 429;

/**
 * A wrong password, an unknown address, and a missing credential account all read the same,
 * so a stranger cannot use the sign-in form to learn which addresses have an account.
 */
const SIGN_IN_MESSAGE_KEYS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "errors.invalidCredentials",
  INVALID_PASSWORD: "errors.invalidCredentials",
  INVALID_EMAIL: "errors.invalidCredentials",
  INVALID_USER: "errors.invalidCredentials",
  USER_NOT_FOUND: "errors.invalidCredentials",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "errors.invalidCredentials",
  ACCOUNT_NOT_FOUND: "errors.invalidCredentials",
  EMAIL_NOT_VERIFIED: "errors.emailNotVerified",
  SESSION_EXPIRED: "errors.unauthorized",
  INVALID_ORIGIN: "errors.invalidOrigin",
};

const PASSKEY_MESSAGE_KEYS: Record<string, string> = {
  AUTH_CANCELLED: "errors.passkeyCancelled",
  REGISTRATION_CANCELLED: "errors.passkeyCancelled",
  AUTHENTICATION_FAILED: "errors.passkeyFailed",
  PASSKEY_NOT_FOUND: "errors.passkeyNotFound",
  CHALLENGE_NOT_FOUND: "errors.passkeyFailed",
  PREVIOUSLY_REGISTERED: "errors.passkeyAlreadyRegistered",
  SESSION_REQUIRED: "errors.unauthorized",
  INVALID_ORIGIN: "errors.invalidOrigin",
  YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: "errors.unauthorized",
};

function lookup(table: Record<string, string>, failure: AuthFailure): string | undefined {
  if (failure.status === STATUS_TOO_MANY_REQUESTS) {
    return "errors.tooManyAttempts";
  }
  return failure.code === null ? undefined : table[failure.code];
}

export function signInMessageKey(failure: AuthFailure): string {
  return lookup(SIGN_IN_MESSAGE_KEYS, failure) ?? "errors.signInFailed";
}

/** Registering, listing, and removing each need their own fallback wording. */
export function passkeyMessageKey(failure: AuthFailure, fallbackKey: string): string {
  return lookup(PASSKEY_MESSAGE_KEYS, failure) ?? fallbackKey;
}
