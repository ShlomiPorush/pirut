export type ServerConfig = {
  host: string;
  port: number;
  databaseUrl: string;
  staticRoot: string | undefined;
};

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

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    // Loopback by default. Wider exposure requires an approved authentication decision.
    host: env.PIRUT_HOST ?? "127.0.0.1",
    port: parsePort(env.PIRUT_PORT ?? "4610"),
    databaseUrl: requiredEnv(env, "PIRUT_DATABASE_URL"),
    staticRoot: env.PIRUT_STATIC_ROOT,
  };
}
