import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import path from "node:path";
import type { DatabaseHandle } from "../infrastructure/db/client.ts";
import type { ServerConfig } from "./config.ts";

export type HealthResponse = {
  status: "ready" | "degraded";
  database: "connected" | "disconnected";
};

export async function buildApp(
  config: ServerConfig,
  database: DatabaseHandle,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.PIRUT_LOG_LEVEL ?? "info",
      // Uploaded rows, merchant names, and identifiers must never reach the log stream.
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    // Statement uploads are handled by a later task; keep the skeleton's body limit small.
    bodyLimit: 1_048_576,
  });

  app.get("/api/health", async (_request, reply) => {
    const connected = await database.checkConnection();
    const body: HealthResponse = {
      status: connected ? "ready" : "degraded",
      database: connected ? "connected" : "disconnected",
    };
    return reply.code(connected ? 200 : 503).send(body);
  });

  if (config.staticRoot !== undefined) {
    const root = path.resolve(config.staticRoot);
    await app.register(fastifyStatic, { root });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "not_found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
