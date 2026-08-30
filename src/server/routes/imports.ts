import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type {
  CommitResult,
  ImportService,
  MonthlySummary,
  StatementPreview,
  StoredImport,
  StoredTransaction,
  TransactionFilter,
} from "../../application/import-contracts.ts";
import type { InsightsReport } from "../../application/insight-contracts.ts";
import { ApiProblem } from "./api-errors.ts";

/**
 * The import and reporting endpoints.
 *
 * These routes own transport only: they read the upload, validate query parameters, and
 * hand everything else to the injected service. No parsing, no persistence, no policy.
 */

export type ImportRoutesOptions = {
  importService: ImportService;
};

/** The multipart field the client must use for the statement file. */
export const STATEMENT_FIELD = "statement";

/** Routes whose failures are read as upload failures rather than defects. */
export const UPLOAD_ROUTE_URLS: ReadonlySet<string> = new Set([
  "/api/imports/preview",
  "/api/imports/commit",
]);

const DEFAULT_SUMMARY_MONTHS = 12;
const MAX_SUMMARY_MONTHS = 36;

type QueryParameters = Record<string, unknown>;

function invalidFilter(): ApiProblem {
  return new ApiProblem(400, "invalid_filter");
}

/** A repeated query parameter arrives as an array, which is never a valid filter here. */
function singleValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw invalidFilter();
  return value;
}

/** Strict integer text only: `Number.parseInt` would happily accept "12abc". */
function parseInteger(value: string): number | undefined {
  return /^-?\d+$/.test(value) ? Number.parseInt(value, 10) : undefined;
}

/** `year` and `month` are both present or both absent, and describe a real charge month. */
export function parseTransactionFilter(query: QueryParameters): TransactionFilter {
  const yearText = singleValue(query.year);
  const monthText = singleValue(query.month);

  if (yearText === undefined && monthText === undefined) return {};
  if (yearText === undefined || monthText === undefined) throw invalidFilter();

  const year = parseInteger(yearText);
  const month = parseInteger(monthText);
  if (year === undefined || month === undefined) throw invalidFilter();
  if (year < 1000 || year > 9999) throw invalidFilter();
  if (month < 1 || month > 12) throw invalidFilter();

  return { year, month };
}

/** `months` is an integer window of 1 to 36 months, defaulting to a year. */
export function parseSummaryMonths(query: QueryParameters): number {
  const text = singleValue(query.months);
  if (text === undefined) return DEFAULT_SUMMARY_MONTHS;

  const months = parseInteger(text);
  if (months === undefined || months < 1 || months > MAX_SUMMARY_MONTHS) throw invalidFilter();
  return months;
}

/**
 * Reads the single uploaded statement into memory.
 *
 * The file size is capped by the multipart limits registered on the instance, so buffering
 * is bounded. The bytes are handed to the service and never written to disk or logged.
 */
async function readStatementUpload(request: FastifyRequest): Promise<Uint8Array> {
  const part = await request.file();
  if (part === undefined) {
    throw new ApiProblem(400, "unsupported_file", "the request contains no file part");
  }
  if (part.fieldname !== STATEMENT_FIELD) {
    // Drain the unwanted stream so the request can finish instead of stalling.
    part.file.resume();
    throw new ApiProblem(
      400,
      "unsupported_file",
      `expected a file field named "${STATEMENT_FIELD}"`,
    );
  }

  const buffer = await part.toBuffer();
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export const importRoutes: FastifyPluginAsync<ImportRoutesOptions> = async (app, options) => {
  const { importService } = options;

  app.post("/api/imports/preview", async (request, reply) => {
    const file = await readStatementUpload(request);
    const preview: StatementPreview = await importService.preview(file);
    return reply.code(200).send(preview);
  });

  app.post("/api/imports/commit", async (request, reply) => {
    const file = await readStatementUpload(request);
    const result: CommitResult = await importService.commit(file);
    return reply.code(200).send(result);
  });

  app.get("/api/imports", async (_request, reply) => {
    const imports: readonly StoredImport[] = await importService.listImports();
    return reply.code(200).send({ imports });
  });

  app.get<{ Querystring: QueryParameters }>("/api/transactions", async (request, reply) => {
    const filter = parseTransactionFilter(request.query);
    const transactions: readonly StoredTransaction[] = await importService.listTransactions(filter);
    return reply.code(200).send({ transactions });
  });

  app.get<{ Querystring: QueryParameters }>("/api/summary", async (request, reply) => {
    const monthLimit = parseSummaryMonths(request.query);
    const months: readonly MonthlySummary[] = await importService.monthlySummary(monthLimit);
    return reply.code(200).send({ months });
  });

  app.get("/api/insights", async (_request, reply) => {
    const insights: InsightsReport = await importService.insights();
    return reply.code(200).send(insights);
  });
};
