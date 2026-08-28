import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Currency } from "../domain/money.ts";
import { formatPlainDate } from "../domain/transaction.ts";
import type { CanonicalTransaction, ParsedStatement } from "../domain/transaction.ts";
import { parseIsracardStatement } from "../importers/isracard/parse.ts";
import type { Database } from "../infrastructure/db/client.ts";
import { cards, imports, transactions } from "../infrastructure/db/schema.ts";
import type {
  CommitResult,
  ImportService,
  MonthlySummary,
  PreviewedTransaction,
  StatementPreview,
  StoredImport,
  StoredTransaction,
  TransactionFilter,
} from "./import-contracts.ts";

/**
 * The application service behind the import API.
 *
 * It owns three responsibilities the transport layer must not: parsing an upload,
 * deciding what is already stored, and persisting a statement atomically. The raw bytes
 * are hashed and then dropped; nothing keeps the uploaded file.
 *
 * Everything that can be decided without a database lives in the exported pure functions
 * below, and every read and write goes through {@link ImportStorage}. Tests exercise the
 * service against a fake storage, so correctness does not depend on a live PostgreSQL.
 */

/** Identifies the parser that produced a stored import, so a reparse can be reasoned about. */
export const PARSER = "isracard";
export const PARSER_VERSION = "1";

/** A card as a statement identifies it. */
export type CardIdentity = { issuer: string; lastDigits: string };

export type ImportRecord = {
  cardId: number;
  chargeDate: string;
  sourceHash: string;
  parser: string;
  parserVersion: string;
  statedTotalMinor: number;
  currency: Currency;
  warnings: readonly string[];
};

export type TransactionRecord = {
  importId: number;
  cardId: number;
  reference: string;
  purchaseDate: string;
  chargeDate: string;
  merchant: string;
  kind: CanonicalTransaction["kind"];
  originalMinor: number;
  originalCurrency: Currency;
  billedMinor: number;
  billedCurrency: Currency;
  installmentNumber: number | null;
  installmentTotal: number | null;
  installmentIsFinal: boolean;
  discountMinor: number | null;
  tags: readonly string[];
};

/** One stored row reduced to what a monthly total needs. */
export type ChargeTotalRow = {
  chargeDate: string;
  billedMinor: number;
  billedCurrency: Currency;
};

/** Half-open charge-date window, `[start, endExclusive)`. */
export type MonthWindow = { start: string; endExclusive: string };

/** The writes a single commit performs. Every method runs inside one database transaction. */
export type ImportWriter = {
  findImportIdBySourceHash(sourceHash: string): Promise<number | null>;
  upsertCard(card: CardIdentity & { label: string }): Promise<number>;
  findStoredReferencesForCard(
    cardId: number,
    references: readonly string[],
  ): Promise<readonly string[]>;
  insertImport(record: ImportRecord): Promise<number>;
  insertTransactions(records: readonly TransactionRecord[]): Promise<void>;
};

/** The whole persistence surface the service needs. Faked in tests, backed by drizzle in production. */
export type ImportStorage = {
  findImportIdBySourceHash(sourceHash: string): Promise<number | null>;
  findStoredReferences(
    card: CardIdentity,
    references: readonly string[],
  ): Promise<readonly string[]>;
  /** Runs `work` in one database transaction. It commits only if `work` resolves. */
  runInTransaction<T>(work: (writer: ImportWriter) => Promise<T>): Promise<T>;
  listImports(): Promise<readonly StoredImport[]>;
  listTransactions(window: MonthWindow | undefined): Promise<readonly StoredTransaction[]>;
  listChargeTotals(): Promise<readonly ChargeTotalRow[]>;
};

/** SHA-256 of the uploaded bytes, hex encoded. The bytes themselves are not retained. */
export function hashUpload(file: Uint8Array): string {
  return createHash("sha256").update(file).digest("hex");
}

/** Marks every parsed row that a stored transaction already covers. */
export function classifyTransactions(
  parsed: readonly CanonicalTransaction[],
  storedReferences: Iterable<string>,
): PreviewedTransaction[] {
  const stored = new Set(storedReferences);
  return parsed.map((transaction) => ({
    ...transaction,
    status: stored.has(transaction.reference) ? "duplicate" : "new",
  }));
}

export function countPreview(previewed: readonly PreviewedTransaction[]): {
  total: number;
  new: number;
  duplicates: number;
} {
  const duplicates = previewed.filter((item) => item.status === "duplicate").length;
  return { total: previewed.length, new: previewed.length - duplicates, duplicates };
}

export function toImportRecord(
  statement: ParsedStatement,
  ids: { cardId: number; sourceHash: string },
): ImportRecord {
  return {
    cardId: ids.cardId,
    chargeDate: formatPlainDate(statement.metadata.chargeDate),
    sourceHash: ids.sourceHash,
    parser: PARSER,
    parserVersion: PARSER_VERSION,
    statedTotalMinor: statement.metadata.statedTotal.minorUnits,
    currency: statement.metadata.statedTotal.currency,
    warnings: statement.warnings,
  };
}

export function toTransactionRecord(
  transaction: CanonicalTransaction,
  ids: { importId: number; cardId: number },
): TransactionRecord {
  return {
    importId: ids.importId,
    cardId: ids.cardId,
    reference: transaction.reference,
    purchaseDate: formatPlainDate(transaction.purchaseDate),
    chargeDate: formatPlainDate(transaction.chargeDate),
    merchant: transaction.merchant,
    kind: transaction.kind,
    originalMinor: transaction.originalAmount.minorUnits,
    originalCurrency: transaction.originalAmount.currency,
    billedMinor: transaction.billedAmount.minorUnits,
    billedCurrency: transaction.billedAmount.currency,
    installmentNumber: transaction.installment?.number ?? null,
    installmentTotal: transaction.installment?.total ?? null,
    installmentIsFinal: transaction.installment?.isFinal ?? false,
    discountMinor: transaction.discount?.minorUnits ?? null,
    tags: transaction.tags,
  };
}

/** The `YYYY-MM` prefix of a `YYYY-MM-DD` charge date. */
export function chargeMonthOf(chargeDate: string): string {
  return chargeDate.slice(0, 7);
}

/**
 * Turns a filter into a charge-date window.
 *
 * A half-filled filter is rejected rather than guessed at: silently ignoring a month
 * would answer a different question than the one asked.
 */
export function resolveMonthWindow(filter: TransactionFilter): MonthWindow | undefined {
  const { year, month } = filter;
  if (year === undefined && month === undefined) return undefined;
  if (year === undefined || month === undefined) throw new Error("invalid_filter");
  if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new Error("invalid_filter");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("invalid_filter");

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: formatPlainDate({ year, month, day: 1 }),
    endExclusive: formatPlainDate({ year: nextYear, month: nextMonth, day: 1 }),
  };
}

/**
 * Totals billed amounts per charge month, newest month first.
 *
 * Amounts in different currencies are never added together, so a month that was billed in
 * more than one currency yields one entry per currency. `monthLimit` counts months, not
 * entries.
 */
export function summariseByMonth(
  rows: readonly ChargeTotalRow[],
  monthLimit: number,
): MonthlySummary[] {
  if (!Number.isFinite(monthLimit)) throw new Error("invalid_filter");
  const limit = Math.max(0, Math.trunc(monthLimit));
  if (limit === 0) return [];

  const totals = new Map<string, MonthlySummary>();
  for (const row of rows) {
    const month = chargeMonthOf(row.chargeDate);
    const key = `${month}|${row.billedCurrency}`;
    const existing = totals.get(key);
    if (existing === undefined) {
      totals.set(key, {
        month,
        billedMinorUnits: row.billedMinor,
        currency: row.billedCurrency,
        transactionCount: 1,
      });
      continue;
    }
    totals.set(key, {
      ...existing,
      billedMinorUnits: existing.billedMinorUnits + row.billedMinor,
      transactionCount: existing.transactionCount + 1,
    });
  }

  const months = [...new Set([...totals.values()].map((entry) => entry.month))]
    .sort()
    .reverse()
    .slice(0, limit);
  const kept = new Set(months);
  return [...totals.values()]
    .filter((entry) => kept.has(entry.month))
    .sort((a, b) =>
      a.month === b.month ? a.currency.localeCompare(b.currency) : b.month.localeCompare(a.month),
    );
}

/** Builds the service over any storage. Production wiring uses {@link createImportService}. */
export function createImportServiceOver(storage: ImportStorage): ImportService {
  async function preview(file: Uint8Array): Promise<StatementPreview> {
    const sourceHash = hashUpload(file);
    const statement = parseIsracardStatement(file);
    const references = statement.transactions.map((transaction) => transaction.reference);
    const stored = await storage.findStoredReferences(
      { issuer: statement.metadata.issuer, lastDigits: statement.metadata.cardLastDigits },
      references,
    );
    const previewed = classifyTransactions(statement.transactions, stored);

    return {
      metadata: statement.metadata,
      transactions: previewed,
      warnings: statement.warnings,
      sourceHash,
      counts: countPreview(previewed),
    };
  }

  async function commit(file: Uint8Array): Promise<CommitResult> {
    const sourceHash = hashUpload(file);
    const alreadyImported = await storage.findImportIdBySourceHash(sourceHash);
    if (alreadyImported !== null) {
      return { status: "already_imported", importId: alreadyImported };
    }

    const statement = parseIsracardStatement(file);

    // One transaction covers the card, the import, and every row. A failure anywhere
    // rolls the whole commit back, so a partially imported statement cannot exist.
    return await storage.runInTransaction(async (writer) => {
      // Re-checked inside the transaction: two uploads of the same file can race.
      const raced = await writer.findImportIdBySourceHash(sourceHash);
      if (raced !== null) return { status: "already_imported", importId: raced };

      const cardId = await writer.upsertCard({
        issuer: statement.metadata.issuer,
        lastDigits: statement.metadata.cardLastDigits,
        label: statement.metadata.cardLabel,
      });

      const stored = new Set(
        await writer.findStoredReferencesForCard(
          cardId,
          statement.transactions.map((transaction) => transaction.reference),
        ),
      );
      const fresh = statement.transactions.filter(
        (transaction) => !stored.has(transaction.reference),
      );

      const importId = await writer.insertImport(toImportRecord(statement, { cardId, sourceHash }));
      if (fresh.length > 0) {
        await writer.insertTransactions(
          fresh.map((transaction) => toTransactionRecord(transaction, { importId, cardId })),
        );
      }

      return {
        status: "imported",
        importId,
        inserted: fresh.length,
        skippedDuplicates: statement.transactions.length - fresh.length,
      };
    });
  }

  return {
    preview,
    commit,
    listImports: () => storage.listImports(),
    async listTransactions(filter: TransactionFilter) {
      return await storage.listTransactions(resolveMonthWindow(filter));
    },
    async monthlySummary(monthLimit: number) {
      // Grouping stays in a pure function; the query returns only the three columns a
      // total needs, which is cheap at the scale a personal statement archive reaches.
      return summariseByMonth(await storage.listChargeTotals(), monthLimit);
    },
  };
}

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | DatabaseTransaction;

async function selectStoredReferences(
  executor: Executor,
  cardId: number,
  references: readonly string[],
): Promise<readonly string[]> {
  if (references.length === 0) return [];
  const rows = await executor
    .select({ reference: transactions.reference })
    .from(transactions)
    .where(and(eq(transactions.cardId, cardId), inArray(transactions.reference, [...references])));
  return rows.map((row) => row.reference);
}

async function selectImportIdBySourceHash(
  executor: Executor,
  sourceHash: string,
): Promise<number | null> {
  const rows = await executor
    .select({ id: imports.id })
    .from(imports)
    .where(eq(imports.sourceHash, sourceHash))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** The drizzle-backed storage. Kept private so nothing outside this module depends on the tables. */
function createDrizzleStorage(db: Database): ImportStorage {
  return {
    findImportIdBySourceHash: (sourceHash) => selectImportIdBySourceHash(db, sourceHash),

    async findStoredReferences(card, references) {
      if (references.length === 0) return [];
      const rows = await db
        .select({ reference: transactions.reference })
        .from(transactions)
        .innerJoin(cards, eq(transactions.cardId, cards.id))
        .where(
          and(
            eq(cards.issuer, card.issuer),
            eq(cards.lastDigits, card.lastDigits),
            inArray(transactions.reference, [...references]),
          ),
        );
      return rows.map((row) => row.reference);
    },

    async runInTransaction(work) {
      return await db.transaction(async (tx) => {
        const writer: ImportWriter = {
          findImportIdBySourceHash: (sourceHash) => selectImportIdBySourceHash(tx, sourceHash),
          findStoredReferencesForCard: (cardId, references) =>
            selectStoredReferences(tx, cardId, references),

          async upsertCard(card) {
            const rows = await tx
              .insert(cards)
              .values({ issuer: card.issuer, lastDigits: card.lastDigits, label: card.label })
              .onConflictDoUpdate({
                target: [cards.issuer, cards.lastDigits],
                set: { label: card.label },
              })
              .returning({ id: cards.id });
            const id = rows[0]?.id;
            if (id === undefined) throw new Error("Card upsert returned no row.");
            return id;
          },

          async insertImport(record) {
            const rows = await tx
              .insert(imports)
              .values({ ...record, warnings: [...record.warnings] })
              .returning({ id: imports.id });
            const id = rows[0]?.id;
            if (id === undefined) throw new Error("Import insert returned no row.");
            return id;
          },

          async insertTransactions(records) {
            if (records.length === 0) return;
            await tx
              .insert(transactions)
              .values(records.map((record) => ({ ...record, tags: [...record.tags] })));
          },
        };
        return await work(writer);
      });
    },

    async listImports() {
      const rows = await db
        .select({
          id: imports.id,
          cardLastDigits: cards.lastDigits,
          cardLabel: cards.label,
          chargeDate: imports.chargeDate,
          statedTotalMinorUnits: imports.statedTotalMinor,
          currency: imports.currency,
          transactionCount: sql<number>`count(${transactions.id})::int`,
          importedAt: imports.importedAt,
        })
        .from(imports)
        .innerJoin(cards, eq(imports.cardId, cards.id))
        .leftJoin(transactions, eq(transactions.importId, imports.id))
        .groupBy(imports.id, cards.id)
        .orderBy(desc(imports.importedAt), desc(imports.id));

      return rows.map((row) => ({ ...row, importedAt: row.importedAt.toISOString() }));
    },

    async listTransactions(window) {
      const selection = {
        id: transactions.id,
        importId: transactions.importId,
        cardLastDigits: cards.lastDigits,
        purchaseDate: transactions.purchaseDate,
        chargeDate: transactions.chargeDate,
        merchant: transactions.merchant,
        kind: transactions.kind,
        originalMinorUnits: transactions.originalMinor,
        originalCurrency: transactions.originalCurrency,
        billedMinorUnits: transactions.billedMinor,
        billedCurrency: transactions.billedCurrency,
        installmentNumber: transactions.installmentNumber,
        installmentTotal: transactions.installmentTotal,
        installmentIsFinal: transactions.installmentIsFinal,
        discountMinorUnits: transactions.discountMinor,
        reference: transactions.reference,
        tags: transactions.tags,
      };
      const query = db
        .select(selection)
        .from(transactions)
        .innerJoin(cards, eq(transactions.cardId, cards.id));
      const filtered =
        window === undefined
          ? query
          : query.where(
              and(
                gte(transactions.chargeDate, window.start),
                lt(transactions.chargeDate, window.endExclusive),
              ),
            );

      return await filtered.orderBy(
        desc(transactions.chargeDate),
        desc(transactions.purchaseDate),
        desc(transactions.id),
      );
    },

    async listChargeTotals() {
      return await db
        .select({
          chargeDate: transactions.chargeDate,
          billedMinor: transactions.billedMinor,
          billedCurrency: transactions.billedCurrency,
        })
        .from(transactions);
    },
  };
}

export function createImportService(db: Database): ImportService {
  return createImportServiceOver(createDrizzleStorage(db));
}
