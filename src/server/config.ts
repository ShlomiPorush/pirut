export type ServerConfig = {
  host: string;
  port: number;
  databaseUrl: string;
  staticRoot: string | undefined;
  /** The absolute URL the household reaches Pirut on, without a trailing slash. */
  publicUrl: string;
  /** Signing key for sessions and tokens. Rotating it signs every member out. */
  authSecret: string;
  /** Extra origins accepted besides publicUrl, for a reverse proxy or a second name. */
  trustedOrigins: readonly string[];
};

/**
 * Long enough that the signing key cannot be guessed, and short enough to type by hand
 * once. `openssl rand -base64 48` produces 64 characters, comfortably above this.
 */
export const MIN_AUTH_SECRET_LENGTH = 32;

/** Repeated in both secret failures, because both are fixed the same way. */
const AUTH_SECRET_HELP =
  "Add PIRUT_AUTH_SECRET to config/docker/.env. Generate one with: openssl rand -base64 48";

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PIRUT_PORT must be a valid TCP port, received: ${value}`);
  }
  return port;
}

/**
 * The public URL decides cookie security, the accepted origin, and the passkey relying
 * party, so a value that is not a URL has to stop startup rather than degrade quietly.
 *
 * The default names localhost rather than 127.0.0.1 on purpose: WebAuthn refuses an IP
 * address as a relying party identifier, so passkeys would not work at all.
 */
function parsePublicUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`PIRUT_PUBLIC_URL must be an absolute URL, received: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`PIRUT_PUBLIC_URL must be an http or https URL, received: ${value}`);
  }
  return url.href.replace(/\/+$/, "");
}

/**
 * A comma-separated list of absolute URLs. Each is reduced to its origin, so a trailing
 * path in the setting cannot widen what is trusted.
 */
function parseTrustedOrigins(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === "") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      try {
        return new URL(entry).origin;
      } catch {
        throw new Error(`PIRUT_TRUSTED_ORIGINS must contain absolute URLs, received: ${entry}`);
      }
    });
}

function parseAuthSecret(value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: PIRUT_AUTH_SECRET. ${AUTH_SECRET_HELP}`,
    );
  }
  if (value.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(
      `PIRUT_AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters. ${AUTH_SECRET_HELP}`,
    );
  }
  return value;
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    // Loopback by default. Wider exposure is the reverse proxy's job, not this process's.
    host: env.PIRUT_HOST ?? "127.0.0.1",
    port: parsePort(env.PIRUT_PORT ?? "4610"),
    databaseUrl: requiredEnv(env, "PIRUT_DATABASE_URL"),
    staticRoot: env.PIRUT_STATIC_ROOT,
    publicUrl: parsePublicUrl(env.PIRUT_PUBLIC_URL ?? "http://localhost:4610"),
    authSecret: parseAuthSecret(env.PIRUT_AUTH_SECRET),
    trustedOrigins: parseTrustedOrigins(env.PIRUT_TRUSTED_ORIGINS),
  };
}
