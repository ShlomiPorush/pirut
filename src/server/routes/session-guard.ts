import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest, onRequestAsyncHookHandler } from "fastify";
import { PUBLIC_API_PREFIXES, type AuthUser } from "../../application/auth-contracts.ts";
import type { AuthInstance } from "../../infrastructure/auth/auth.ts";

/**
 * The session guard.
 *
 * Every route under `/api/` needs a session unless the contract lists it as public. The
 * check runs once, in `onRequest`, so a route handler can never be reached without one and
 * no handler has to remember to ask.
 */

declare module "fastify" {
  interface FastifyRequest {
    /**
     * The signed-in member, set by the session guard before any guarded handler runs.
     * Undefined on public routes, which is the only place a handler must allow for it.
     */
    authUser?: AuthUser;
  }
}

/** Everything the API serves lives under this prefix; the rest is the interface itself. */
const API_PREFIX = "/api/";

export function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** The path alone. A query string must never decide whether a route is guarded. */
export function requestPathname(request: FastifyRequest): string {
  const separator = request.url.indexOf("?");
  return separator === -1 ? request.url : request.url.slice(0, separator);
}

/** Narrows Better Auth's user record to the three fields the contract exposes. */
export function toAuthUser(user: { id: string; name: string; email: string }): AuthUser {
  return { id: user.id, name: user.name, email: user.email };
}

export function createSessionGuard(auth: AuthInstance): onRequestAsyncHookHandler {
  return async function sessionGuard(request, reply) {
    const pathname = requestPathname(request);
    if (!pathname.startsWith(API_PREFIX)) return;
    if (isPublicApiPath(pathname)) return;

    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (session === null) {
      // A machine-readable code only: the interface decides what to say and where to send
      // the member. The envelope matches every other API error.
      return reply.code(401).send({ error: "unauthorized" });
    }

    request.authUser = toAuthUser(session.user);
  };
}
