import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import path from "node:path";
import type { ImportService } from "../application/import-contracts.ts";
import type { DatabaseHandle } from "../infrastructure/db/client.ts";
import type { ServerConfig } from "./config.ts";
import { classifyApiError, type ErrorSource } from "./routes/api-errors.ts";
import { importRoutes, UPLOAD_ROUTE_URLS } from "./routes/imports.ts";

export type HealthResponse = {
  status: "ready" | "degraded";
  database: "connected" | "disconnected";
};

/** A statement export is a small spreadsheet; anything larger is not one. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function buildApp(
  config: ServerConfig,
  database: DatabaseHandle,
  importService: ImportService,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.PIRUT_LOG_LEVEL ?? "info",
      // Uploaded rows, merchant names, and identifiers must never reach the log stream.
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    // JSON requests stay small. Uploads are bounded by the multipart limits below, which
    // apply to the file stream rather than to a buffered body.
    bodyLimit: 1_048_576,
  });

  await app.register(fastifyMultipart, {
    limits: { files: 1, fileSize: MAX_UPLOAD_BYTES },
  });

  app.setErrorHandler(async (error, request, reply) => {
    const source: ErrorSource = UPLOAD_ROUTE_URLS.has(request.routeOptions.url ?? "")
      ? "upload"
      : "query";
    const { statusCode, body } = classifyApiError(error, source);
    if (statusCode >= 500) {
      // Only the error itself is logged. Request bodies and parsed rows are never logged,
      // and the response carries no stack trace.
      request.log.error({ err: error }, "unhandled request error");
    }
    return reply.code(statusCode).send(body);
  });

  app.get("/api/health", async (_request, reply) => {
    const connected = await database.checkConnection();
    const body: HealthResponse = {
      status: connected ? "ready" : "degraded",
      database: connected ? "connected" : "disconnected",
    };
    return reply.code(connected ? 200 : 503).send(body);
  });

  await app.register(importRoutes, { importService });

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
