/**
 * The contract between the authentication layer, the HTTP API, and the interface.
 *
 * Authentication itself is delegated to Better Auth, which owns password hashing,
 * sessions, cookies, CSRF, rate limiting, and passkeys, and serves its own routes under
 * `/api/auth/*`. Pirut adds only what Better Auth does not decide: who may create an
 * account, which routes require a session, and the household model.
 *
 * Household model, decided by the owner on 2026-08-28: every signed-in member sees and
 * imports into the same data. Accounts gate access; they do not partition data.
 */

/** Everything the interface needs to decide which screen to show first. */
export type AuthStatus = {
  /** True until the first account exists. The interface then shows first-run setup. */
  needsFirstUser: boolean;
  /** The signed-in member, or null when the request carries no valid session. */
  user: AuthUser | null;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

/** A household member as listed to other members. */
export type HouseholdMember = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  /** Number of registered passkeys, so the list can nudge members to add one. */
  passkeyCount: number;
};

/** Body of POST /api/household/members. Only a signed-in member may call it. */
export type CreateMemberRequest = {
  name: string;
  email: string;
  password: string;
};

/** Stable machine-readable error codes for Pirut's own auth-adjacent routes. */
export type AuthErrorCode =
  | "unauthorized"
  | "setup_already_completed"
  | "invalid_member"
  | "member_exists"
  | "weak_password"
  | "cannot_remove_self"
  | "last_member"
  /** Too many attempts against a credential route in a short window. */
  | "too_many_requests";

/**
 * Routes that stay reachable without a session. Everything else under `/api/` requires
 * one. Better Auth's own routes decide their own access.
 */
export const PUBLIC_API_PREFIXES = ["/api/health", "/api/auth/", "/api/setup/"] as const;

/** Minimum password length enforced on first-run setup and member creation. */
export const MIN_PASSWORD_LENGTH = 12;
