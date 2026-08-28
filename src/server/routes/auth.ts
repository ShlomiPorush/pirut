import { isAPIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  MIN_PASSWORD_LENGTH,
  type AuthStatus,
  type AuthUser,
  type CreateMemberRequest,
  type HouseholdMember,
} from "../../application/auth-contracts.ts";
import type { AuthInstance } from "../../infrastructure/auth/auth.ts";
import { ApiProblem } from "./api-errors.ts";
import { RateLimiter } from "./rate-limit.ts";
import { toAuthUser } from "./session-guard.ts";

/**
 * Pirut's own auth-adjacent routes.
 *
 * Better Auth serves sign-in, sign-out, and passkeys itself under `/api/auth/*`. What is
 * left is the household: whether setup is still pending, who the members are, and adding
 * or removing one. These routes own transport and policy only; every credential operation
 * goes through `auth.api`, so password hashing and session issuing stay in one place.
 */

export type AuthRoutesOptions = {
  auth: AuthInstance;
  /** Overridable so a test can drive the window without waiting on the clock. */
  rateLimiter?: RateLimiter;
};

/**
 * A household is a family, not a directory. Reading every member in one query is correct
 * at this size, and the bound stops a runaway table from becoming a runaway response.
 */
const MAX_HOUSEHOLD_MEMBERS = 500;

/** Better Auth's own default. Rejecting here keeps the code ours rather than theirs. */
const MAX_PASSWORD_LENGTH = 128;

const MAX_NAME_LENGTH = 100;
/** The longest address RFC 5321 allows. */
const MAX_EMAIL_LENGTH = 254;

/**
 * Deliberately permissive. Better Auth validates the address properly; this only rejects
 * input that is obviously not an address, so the failure carries our code rather than a
 * 500 from an unexpected library error.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The Better Auth error code raised when the address is already registered. */
const DUPLICATE_EMAIL_CODE = "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";

/** Raised by Pirut's account creation policy when the caller carries no session. */
const NO_SESSION_CODE = "SIGN_UP_REQUIRES_SESSION";

type UserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: Date | string;
};

function invalidMember(detail: string): ApiProblem {
  return new ApiProblem(400, "invalid_member", detail);
}

/**
 * Validates a member payload before it reaches Better Auth.
 *
 * A missing or malformed field is `invalid_member`; a present but too short password is
 * `weak_password`, because the interface shows the member a different thing in each case.
 */
export function parseMemberRequest(body: unknown): CreateMemberRequest {
  if (typeof body !== "object" || body === null) throw invalidMember("body must be an object");
  const { name, email, password } = body as Record<string, unknown>;

  if (typeof name !== "string") throw invalidMember("name must be a string");
  const trimmedName = name.trim();
  if (trimmedName === "" || trimmedName.length > MAX_NAME_LENGTH) {
    throw invalidMember("name must be between 1 and 100 characters");
  }

  if (typeof email !== "string") throw invalidMember("email must be a string");
  const trimmedEmail = email.trim().toLowerCase();
  if (trimmedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(trimmedEmail)) {
    throw invalidMember("email must be an address");
  }

  if (typeof password !== "string") throw invalidMember("password must be a string");
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new ApiProblem(400, "weak_password");
  }

  return { name: trimmedName, email: trimmedEmail, password };
}

/** Better Auth's error body carries the code; the status alone does not identify it. */
function authErrorCode(error: unknown): string | undefined {
  if (!isAPIError(error)) return undefined;
  const body: unknown = error.body;
  if (typeof body !== "object" || body === null || !("code" in body)) return undefined;
  const code: unknown = (body as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Translates a failed sign-up into Pirut's codes.
 *
 * Anything unrecognised is returned unchanged rather than flattened, so a real defect
 * still reaches the error handler as one.
 */
function signUpFailure(error: unknown): unknown {
  const code = authErrorCode(error);
  if (code === DUPLICATE_EMAIL_CODE) return new ApiProblem(409, "member_exists");
  if (code === NO_SESSION_CODE) return new ApiProblem(401, "unauthorized");
  return error;
}

/**
 * Copies the session cookie Better Auth issued onto Pirut's own response.
 *
 * `getSetCookie` is used rather than `get`, because a single header value would join
 * several cookies into one unusable string. Fastify accumulates repeated `set-cookie`
 * headers into the array a browser expects.
 */
export function relaySetCookie(reply: FastifyReply, headers: Headers): void {
  for (const cookie of headers.getSetCookie()) {
    void reply.header("set-cookie", cookie);
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Better Auth rate-limits only the routes its own router serves. These routes call
 * `auth.api.*` directly, so they need their own bound: they create accounts and accept
 * passwords, and nothing else would stop a client retrying them in a loop.
 *
 * The window is generous enough that a person correcting a typo never notices it.
 */
const CREDENTIAL_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {
  const { auth } = options;
  const limiter = options.rateLimiter ?? new RateLimiter(CREDENTIAL_RATE_LIMIT);

  /** Keyed by client address: one household, so the address is the only caller identity. */
  function enforceRateLimit(request: { ip: string }, reply: FastifyReply): void {
    const decision = limiter.check(request.ip);
    if (decision.allowed) return;
    void reply.header("retry-after", String(decision.retryAfterSeconds));
    throw new ApiProblem(429, "too_many_requests");
  }

  /** Better Auth's adapter, so these routes read members through the store it writes. */
  async function adapter() {
    return (await auth.$context).adapter;
  }

  async function countUsers(): Promise<number> {
    const store = await adapter();
    return await store.count({ model: "user" });
  }

  // Public: the interface calls this before it knows whether anyone can sign in.
  app.get("/api/setup/status", async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    const status: AuthStatus = {
      needsFirstUser: (await countUsers()) === 0,
      user: session === null ? null : toAuthUser(session.user),
    };
    return reply.code(200).send(status);
  });

  // Public, and only usable once: the account it creates is what closes it.
  app.post("/api/setup/first-user", async (request, reply) => {
    enforceRateLimit(request, reply);
    if ((await countUsers()) > 0) throw new ApiProblem(409, "setup_already_completed");
    const member = parseMemberRequest(request.body);

    try {
      const { headers, response } = await auth.api.signUpEmail({
        body: { name: member.name, email: member.email, password: member.password },
        returnHeaders: true,
      });
      // The first member is signed in immediately. Nobody should have to sign in to the
      // account they just created.
      relaySetCookie(reply, headers);
      const user: AuthUser = toAuthUser(response.user);
      return reply.code(200).send({ user });
    } catch (error) {
      throw signUpFailure(error);
    }
  });

  app.get("/api/household/members", async (_request, reply) => {
    const store = await adapter();
    const users = await store.findMany<UserRow>({
      model: "user",
      limit: MAX_HOUSEHOLD_MEMBERS,
    });
    const passkeys = await store.findMany<{ userId: string }>({
      model: "passkey",
      limit: MAX_HOUSEHOLD_MEMBERS * 10,
    });

    const passkeyCounts = new Map<string, number>();
    for (const credential of passkeys) {
      passkeyCounts.set(credential.userId, (passkeyCounts.get(credential.userId) ?? 0) + 1);
    }

    const members: HouseholdMember[] = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: toIsoString(user.createdAt),
      passkeyCount: passkeyCounts.get(user.id) ?? 0,
    }));
    return reply.code(200).send({ members });
  });

  app.post("/api/household/members", async (request, reply) => {
    enforceRateLimit(request, reply);
    const member = parseMemberRequest(request.body);

    try {
      // The caller's headers are forwarded so the account creation policy can see their
      // session. The response headers are deliberately dropped: adding a member must not
      // replace the caller's own session with the new one.
      const created = await auth.api.signUpEmail({
        body: { name: member.name, email: member.email, password: member.password },
        headers: fromNodeHeaders(request.headers),
      });
      const result: HouseholdMember = {
        id: created.user.id,
        name: created.user.name,
        email: created.user.email,
        createdAt: toIsoString(created.user.createdAt),
        passkeyCount: 0,
      };
      return reply.code(201).send({ member: result });
    } catch (error) {
      throw signUpFailure(error);
    }
  });

  app.delete<{ Params: { id: string } }>("/api/household/members/:id", async (request, reply) => {
    const caller = request.authUser;
    if (caller === undefined) throw new ApiProblem(401, "unauthorized");

    const store = await adapter();
    const id = request.params.id;
    const target = await store.findOne<UserRow>({
      model: "user",
      where: [{ field: "id", value: id }],
    });
    if (target === null) throw new ApiProblem(404, "not_found");

    // Checked before the self check on purpose. Emptying the household locks everyone out
    // of the data permanently, and "you are the last member" explains that, where "you
    // cannot remove yourself" would suggest another member could do it instead.
    if ((await countUsers()) <= 1) throw new ApiProblem(409, "last_member");
    if (id === caller.id) throw new ApiProblem(400, "cannot_remove_self");

    // PostgreSQL cascades these, but the deletion is written out so the behaviour does not
    // depend on which store is underneath.
    for (const model of ["session", "passkey", "account"]) {
      await store.deleteMany({ model, where: [{ field: "userId", value: id }] });
    }
    await store.delete({ model: "user", where: [{ field: "id", value: id }] });

    return reply.code(204).send();
  });
};
