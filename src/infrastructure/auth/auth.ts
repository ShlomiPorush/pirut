import { passkey } from "@better-auth/passkey";
import { betterAuth, type DBAdapterInstance } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { MIN_PASSWORD_LENGTH } from "../../application/auth-contracts.ts";
import type { Database } from "../db/client.ts";
import {
  authAccounts,
  authPasskeys,
  authSessions,
  authUsers,
  authVerifications,
} from "../db/schema.ts";

/**
 * Pirut's Better Auth instance.
 *
 * Better Auth owns password hashing, sessions, cookies, CSRF, rate limiting, and passkeys,
 * and serves its own routes under `basePath`. This module adds the one policy Better Auth
 * cannot decide for us: who is allowed to create an account.
 */

/** Where Better Auth's own routes live. The session guard treats this prefix as public. */
export const AUTH_BASE_PATH = "/api/auth";

/**
 * The relying party name a browser shows in the passkey prompt. It is a product name
 * rather than a hostname, so it is not derived from configuration.
 */
const RELYING_PARTY_NAME = "Pirut";

/**
 * Better Auth keys its schema by model name, not by our export name, and the Drizzle
 * adapter looks each model up as `schema[model]`.
 */
const authTables = {
  user: authUsers,
  session: authSessions,
  account: authAccounts,
  verification: authVerifications,
  passkey: authPasskeys,
};

export type CreateAuthOptions = {
  /**
   * The adapter Better Auth persists through. The server passes
   * {@link pirutDrizzleAdapter}; tests pass an in-memory adapter so they need no database.
   */
  adapter: DBAdapterInstance;
  /** The absolute URL the household reaches Pirut on. Decides origin, rpID, and cookies. */
  publicUrl: string;
  /** Additional origins the household reaches Pirut on, such as a reverse proxy name. */
  extraTrustedOrigins?: readonly string[];
  /** Signing key for sessions and tokens. Validated by the server configuration loader. */
  authSecret: string;
};

export type AuthInstance = ReturnType<typeof createAuth>;

/** The Drizzle-backed adapter used by the running server. */
export function pirutDrizzleAdapter(database: Database): DBAdapterInstance {
  return drizzleAdapter(database, { provider: "pg", schema: authTables });
}

/**
 * Rejects an account creation that no one is entitled to make.
 *
 * 401 rather than 403: the only way to fail this check is to arrive without a session
 * once the household exists. Better Auth also gives 403 a special meaning inside the
 * sign-up route, which this deliberately stays clear of.
 */
function signUpRequiresSession(): APIError {
  return new APIError("UNAUTHORIZED", {
    code: "SIGN_UP_REQUIRES_SESSION",
    message: "Only a signed-in household member may create an account.",
  });
}

/**
 * Every origin the household may legitimately arrive from.
 *
 * Better Auth rejects a request whose `Origin` is not listed, answering `INVALID_ORIGIN`.
 * `localhost` and `127.0.0.1` are the same machine but different origins, and someone who
 * configured one will inevitably open the other, so both loopback spellings are accepted
 * whenever the public URL names either. Anything beyond loopback has to be stated
 * explicitly through PIRUT_TRUSTED_ORIGINS, because trusting an unstated origin is how a
 * cross-site request gets accepted.
 */
export function trustedOriginsFor(publicUrl: URL, extra: readonly string[] = []): string[] {
  const origins = new Set<string>([publicUrl.origin, ...extra]);

  const loopbackAliases: Record<string, string> = {
    localhost: "127.0.0.1",
    "127.0.0.1": "localhost",
  };
  const alias = loopbackAliases[publicUrl.hostname];
  if (alias !== undefined) {
    const mirrored = new URL(publicUrl.href);
    mirrored.hostname = alias;
    origins.add(mirrored.origin);
  }

  return [...origins];
}

export function createAuth(options: CreateAuthOptions) {
  const publicUrl = new URL(options.publicUrl);

  return betterAuth({
    appName: RELYING_PARTY_NAME,
    database: options.adapter,
    basePath: AUTH_BASE_PATH,
    baseURL: options.publicUrl,
    secret: options.authSecret,
    trustedOrigins: trustedOriginsFor(publicUrl, options.extraTrustedOrigins),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      autoSignIn: true,
    },
    advanced: {
      // The owner's reverse proxy terminates TLS, so the cookie flag follows the URL the
      // browser actually used rather than the protocol this process is listening on.
      useSecureCookies: publicUrl.protocol === "https:",
    },
    plugins: [
      passkey({
        rpName: RELYING_PARTY_NAME,
        // WebAuthn forbids an IP address here, which is why the default public URL names
        // localhost rather than 127.0.0.1.
        rpID: publicUrl.hostname,
        origin: publicUrl.origin,
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          /**
           * Account creation policy, enforced at the one place every path goes through.
           *
           * Two creations are legitimate: the first account, which sets the household up,
           * and an account created by a member who is already signed in. Anything else is
           * a stranger reaching a public sign-up route, and is refused.
           *
           * The hook receives the endpoint context, so it can see the request headers on
           * both paths: an HTTP call to Better Auth's own `/api/auth/sign-up/email`, and
           * Pirut's routes calling `auth.api.signUpEmail` with the caller's headers.
           */
          before: async (_user, context) => {
            if (context === null) {
              // A creation outside any request cannot be attributed to anyone. Pirut never
              // does this, so refusing keeps the policy closed instead of guessing.
              throw signUpRequiresSession();
            }

            const existingUsers = await context.context.adapter.count({ model: "user" });
            if (existingUsers === 0) return;

            const session = await getSessionFromCtx(context);
            if (session !== null) return;

            throw signUpRequiresSession();
          },
        },
      },
    },
  });
}
