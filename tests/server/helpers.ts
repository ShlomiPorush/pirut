import { memoryAdapter } from "better-auth/adapters/memory";
import type {
  CommitResult,
  ImportService,
  MonthlySummary,
  StatementPreview,
  StoredImport,
  StoredTransaction,
  TransactionFilter,
} from "../../src/application/import-contracts.ts";
import type { InsightsReport } from "../../src/application/insight-contracts.ts";
import { createAuth, type AuthInstance } from "../../src/infrastructure/auth/auth.ts";
import type { DatabaseHandle } from "../../src/infrastructure/db/client.ts";
import type { ServerConfig } from "../../src/server/config.ts";

/** Shared fakes for the HTTP tests. Nothing here touches a database or a real statement. */

/** Long enough to satisfy the configuration loader, and obviously not a real secret. */
const TEST_AUTH_SECRET = "test-secret-that-is-long-enough-for-better-auth";

export const testConfig: ServerConfig = {
  host: "127.0.0.1",
  port: 4610,
  databaseUrl: "postgres://unused",
  staticRoot: undefined,
  publicUrl: "http://localhost:4610",
  authSecret: TEST_AUTH_SECRET,
  trustedOrigins: [],
};

/**
 * A real Better Auth instance backed by the in-memory adapter, so the auth tests exercise
 * the actual library, hooks, cookies, and policy without needing PostgreSQL.
 *
 * Each call gets a fresh store, so tests cannot leak members into one another.
 */
export function memoryAuth(): AuthInstance {
  return createAuth({
    // The memory adapter reads each model as an existing key rather than creating it on
    // first write, so every table Better Auth and the passkey plugin use starts empty.
    adapter: memoryAdapter({ user: [], session: [], account: [], verification: [], passkey: [] }),
    publicUrl: testConfig.publicUrl,
    authSecret: testConfig.authSecret,
  });
}

/**
 * A stand-in for tests that are not about authentication.
 *
 * It reports a signed-in member for every request, so the import and health tests exercise
 * their own behaviour rather than re-testing the session guard. Only the two members
 * `buildApp` actually calls are implemented, which is why the cast is needed.
 */
export function fakeAuth(): AuthInstance {
  const user = { id: "member-1", name: "Test Member", email: "member@example.test" };
  return {
    api: {
      getSession: async () => ({ user, session: { id: "session-1", userId: user.id } }),
    },
    handler: async () => new Response(null, { status: 404 }),
  } as unknown as AuthInstance;
}

export function fakeDatabase(connected: boolean): DatabaseHandle {
  return {
    db: undefined as unknown as DatabaseHandle["db"],
    pool: undefined as unknown as DatabaseHandle["pool"],
    checkConnection: async () => connected,
    close: async () => {},
  };
}

export const samplePreview: StatementPreview = {
  metadata: {
    issuer: "isracard",
    cardLastDigits: "1234",
    cardLabel: "test card",
    chargeDate: { year: 2026, month: 8, day: 2 },
    statedTotal: { minorUnits: 12_345, currency: "ILS" },
  },
  transactions: [
    {
      purchaseDate: { year: 2026, month: 7, day: 14 },
      chargeDate: { year: 2026, month: 8, day: 2 },
      merchant: "test merchant",
      kind: "purchase",
      originalAmount: { minorUnits: 12_345, currency: "ILS" },
      billedAmount: { minorUnits: 12_345, currency: "ILS" },
      reference: "900001",
      tags: [],
      status: "new",
    },
  ],
  warnings: ["a warning worth reading"],
  sourceHash: "b".repeat(64),
  counts: { total: 1, new: 1, duplicates: 0 },
};

export const sampleImports: readonly StoredImport[] = [
  {
    id: 7,
    cardLastDigits: "1234",
    cardLabel: "test card",
    chargeDate: "2026-08-02",
    statedTotalMinorUnits: 12_345,
    currency: "ILS",
    transactionCount: 1,
    importedAt: "2026-08-03T09:00:00.000Z",
  },
];

export const sampleTransactions: readonly StoredTransaction[] = [
  {
    id: 11,
    importId: 7,
    cardLastDigits: "1234",
    purchaseDate: "2026-07-14",
    chargeDate: "2026-08-02",
    merchant: "test merchant",
    kind: "purchase",
    originalMinorUnits: 12_345,
    originalCurrency: "ILS",
    billedMinorUnits: 12_345,
    billedCurrency: "ILS",
    installmentNumber: null,
    installmentTotal: null,
    installmentIsFinal: false,
    discountMinorUnits: null,
    reference: "900001",
    tags: [],
  },
];

export const sampleSummary: readonly MonthlySummary[] = [
  { month: "2026-08", billedMinorUnits: 12_345, currency: "ILS", transactionCount: 1 },
];

export const sampleInsights: InsightsReport = {
  latestChargeMonth: "2026-08",
  importedMonthCount: 3,
  recurringCharges: [],
  recurringAmountChanges: [],
  suspectedDuplicateCharges: [],
  stoppedRecurringCharges: [],
  installmentCommitments: [],
};

export type ServiceCalls = {
  preview: Uint8Array[];
  commit: Uint8Array[];
  listImports: number;
  listTransactions: TransactionFilter[];
  monthlySummary: number[];
  insights: number;
};

export type FakeBehaviour = Partial<ImportService>;

export type FakeImportService = ImportService & { calls: ServiceCalls };

/** Records every call and answers with canned contract values unless overridden. */
export function fakeImportService(behaviour: FakeBehaviour = {}): FakeImportService {
  const calls: ServiceCalls = {
    preview: [],
    commit: [],
    listImports: 0,
    listTransactions: [],
    monthlySummary: [],
    insights: 0,
  };

  const defaultCommit: CommitResult = {
    status: "imported",
    importId: 7,
    inserted: 1,
    skippedDuplicates: 0,
  };

  return {
    calls,
    preview: async (file) => {
      calls.preview.push(file);
      return behaviour.preview === undefined ? samplePreview : await behaviour.preview(file);
    },
    commit: async (file) => {
      calls.commit.push(file);
      return behaviour.commit === undefined ? defaultCommit : await behaviour.commit(file);
    },
    listImports: async () => {
      calls.listImports += 1;
      return behaviour.listImports === undefined ? sampleImports : await behaviour.listImports();
    },
    listTransactions: async (filter) => {
      calls.listTransactions.push(filter);
      return behaviour.listTransactions === undefined
        ? sampleTransactions
        : await behaviour.listTransactions(filter);
    },
    monthlySummary: async (monthLimit) => {
      calls.monthlySummary.push(monthLimit);
      return behaviour.monthlySummary === undefined
        ? sampleSummary
        : await behaviour.monthlySummary(monthLimit);
    },
    insights: async () => {
      calls.insights += 1;
      return behaviour.insights === undefined ? sampleInsights : await behaviour.insights();
    },
  };
}

const BOUNDARY = "----pirutTestBoundary1234";

export type InjectableBody = {
  payload: Buffer;
  headers: Record<string, string>;
};

/**
 * Builds a multipart body by hand so the tests need no extra dependency. `filename`
 * undefined produces a plain form field rather than a file part.
 */
export function multipartBody(parts: {
  fieldName: string;
  filename?: string;
  content: Buffer | string;
}): InjectableBody {
  const disposition =
    parts.filename === undefined
      ? `form-data; name="${parts.fieldName}"`
      : `form-data; name="${parts.fieldName}"; filename="${parts.filename}"`;
  const contentType =
    parts.filename === undefined
      ? ""
      : "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n";

  const head = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: ${disposition}\r\n${contentType}\r\n`,
  );
  const content = typeof parts.content === "string" ? Buffer.from(parts.content) : parts.content;
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);

  return {
    payload: Buffer.concat([head, content, tail]),
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
  };
}

export function statementUpload(content: Buffer | string): InjectableBody {
  return multipartBody({ fieldName: "statement", filename: "statement.xlsx", content });
}
