import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { fromNodeHeaders } from "better-auth/node";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import path from "node:path";
import type { ImportService } from "../application/import-contracts.ts";
import { AUTH_BASE_PATH, type AuthInstance } from "../infrastructure/auth/auth.ts";
import type { DatabaseHandle } from "../infrastructure/db/client.ts";
import type { ServerConfig } from "./config.ts";
import { authRoutes } from "./routes/auth.ts";
import { classifyApiError, type ErrorSource } from "./routes/api-errors.ts";
import { importRoutes, UPLOAD_ROUTE_URLS } from "./routes/imports.ts";
import { createSessionGuard } from "./routes/session-guard.ts";

export type HealthResponse = {
  status: "ready" | "degraded";
  database: "connected" | "disconnected";
};

/** A statement export is a small spreadsheet; anything larger is not one. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Where every Better Auth route is relayed from. */
const AUTH_ROUTE_PATTERN = `${AUTH_BASE_PATH}/*`;

/** Methods that must not carry a request body when rebuilt as a Web `Request`. */
const BODILESS_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

/**
 * Relays Better Auth's `Response` onto a Fastify reply.
 *
 * `Set-Cookie` is read through `getSetCookie` and replayed one header at a time. Reading
 * it like any other header would join several cookies into a single value that no browser
 * accepts, which is exactly how a session silently fails to be set.
 */
function relayResponse(reply: FastifyReply, response: Response, body: Buffer): void {
  void reply.code(response.status);
  for (const [key, value] of response.headers) {
    if (key.toLowerCase() === "set-cookie") continue;
    void reply.header(key, value);
  }
  for (const cookie of response.headers.getSetCookie()) {
    void reply.header("set-cookie", cookie);
  }
  // A Buffer is sent as-is, so Fastify never re-serialises a body Better Auth already
  // encoded and never rewrites its content type.
  void reply.send(body);
}

export async function buildApp(
  config: ServerConfig,
  database: DatabaseHandle,
  importService: ImportService,
  auth: AuthInstance,
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
    // Pirut runs behind the owner's reverse proxy, which terminates TLS. Without this the
    // client address and protocol Better Auth records would be the proxy's, not the
    // member's, and secure cookies would be judged against the wrong scheme.
    trustProxy: true,
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

  // Runs before every route, so no handler can be reached without a session it needs.
  app.addHook("onRequest", createSessionGuard(auth));

  app.get("/api/health", async (_request, reply) => {
    const connected = await database.checkConnection();
    const body: HealthResponse = {
      status: connected ? "ready" : "degraded",
      database: connected ? "connected" : "disconnected",
    };
    return reply.code(connected ? 200 : 503).send(body);
  });

  /**
   * Better Auth's own routes.
   *
   * They are mounted in their own plugin scope so the body parser below is encapsulated:
   * Better Auth signs and validates the raw body, so it must arrive as bytes rather than
   * as an object Fastify already parsed and would have to re-serialise. Every other route
   * keeps Fastify's normal JSON parsing.
   */
  await app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => {
      done(null, body);
    });

    scope.all(AUTH_ROUTE_PATTERN, async (request, reply) => {
      const url = new URL(request.url, config.publicUrl);
      // A plain `Uint8Array` rather than the `Buffer` Fastify hands back, because that is
      // what the Web `Request` body accepts.
      const body = Buffer.isBuffer(request.body) ? new Uint8Array(request.body) : undefined;
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: BODILESS_METHODS.has(request.method) ? undefined : body,
        }),
      );
      relayResponse(reply, response, Buffer.from(await response.arrayBuffer()));
    });
  });

  await app.register(authRoutes, { auth });
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
