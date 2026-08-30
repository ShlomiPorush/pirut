import type { Currency } from "../domain/money.ts";
import type {
  CanonicalTransaction,
  ParsedStatement,
  StatementMetadata,
} from "../domain/transaction.ts";
import type { InsightsReport } from "./insight-contracts.ts";

/**
 * The contract between the import service, the HTTP API, and the interface.
 *
 * The web client consumes the JSON shapes below verbatim, so every field is serialisable.
 * Amounts travel as integer minor units with a currency. Stored records carry dates as
 * `YYYY-MM-DD` strings; preview rows inherit `PlainDate` objects from the parser, and the
 * client's date formatter accepts both shapes.
 */

/** A parsed row plus what committing it would do. */
export type PreviewedTransaction = CanonicalTransaction & {
  /** "duplicate" when a transaction with the same card and reference is already stored. */
  status: "new" | "duplicate";
};

export type StatementPreview = {
  metadata: StatementMetadata;
  transactions: readonly PreviewedTransaction[];
  warnings: readonly string[];
  /** SHA-256 of the uploaded bytes. Committing the same bytes twice is a no-op. */
  sourceHash: string;
  counts: { total: number; new: number; duplicates: number };
};

export type CommitResult =
  | {
      status: "imported";
      importId: number;
      inserted: number;
      /** Rows skipped because their card and reference were already stored. */
      skippedDuplicates: number;
    }
  | {
      /** The exact same file bytes were committed before. Nothing changed. */
      status: "already_imported";
      importId: number;
    };

/** A stored transaction as the API returns it. */
export type StoredTransaction = {
  id: number;
  importId: number;
  cardLastDigits: string;
  purchaseDate: string;
  chargeDate: string;
  merchant: string;
  kind: "purchase" | "refund" | "installment";
  originalMinorUnits: number;
  originalCurrency: Currency;
  billedMinorUnits: number;
  billedCurrency: Currency;
  installmentNumber: number | null;
  installmentTotal: number | null;
  installmentIsFinal: boolean;
  discountMinorUnits: number | null;
  reference: string;
  tags: readonly string[];
};

export type MonthlySummary = {
  /** The charge month, as `YYYY-MM`. */
  month: string;
  billedMinorUnits: number;
  currency: Currency;
  transactionCount: number;
};

export type StoredImport = {
  id: number;
  cardLastDigits: string;
  cardLabel: string;
  chargeDate: string;
  statedTotalMinorUnits: number;
  currency: Currency;
  transactionCount: number;
  importedAt: string;
};

export type TransactionFilter = {
  /** Filter by charge month. Both present or both absent. */
  year?: number;
  month?: number;
};

/**
 * The application-layer service the HTTP routes call. The implementation owns parsing,
 * duplicate detection, and atomic persistence; routes own nothing but transport.
 */
export interface ImportService {
  /** Parses and classifies without persisting anything. */
  preview(file: Uint8Array): Promise<StatementPreview>;
  /**
   * Commits an upload in one database transaction. Re-sending identical bytes is a
   * no-op; rows whose card and reference already exist are skipped, never duplicated.
   * The raw upload is not retained.
   */
  commit(file: Uint8Array): Promise<CommitResult>;
  listImports(): Promise<readonly StoredImport[]>;
  listTransactions(filter: TransactionFilter): Promise<readonly StoredTransaction[]>;
  monthlySummary(monthLimit: number): Promise<readonly MonthlySummary[]>;
  insights(): Promise<InsightsReport>;
}

/** Stable machine-readable error codes carried across the API boundary. */
export type ImportErrorCode =
  | "not_a_statement"
  | "statement_does_not_reconcile"
  | "unsupported_file"
  | "file_too_large"
  | "invalid_filter";

/** Error envelope every API error response uses. */
export type ApiError = {
  error: ImportErrorCode | "internal";
  /** Debug detail. Never shown to a user; the client localises by `error` code. */
  detail?: string;
};

export type { CanonicalTransaction, ParsedStatement, StatementMetadata };
