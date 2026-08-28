import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { Currency } from "../../domain/money.ts";
import type { TransactionKind } from "../../domain/transaction.ts";

/**
 * The canonical storage model.
 *
 * Money is stored as signed integer minor units, never as a floating point value. The
 * columns are `bigint` so a lifetime of agorot cannot overflow, and are read as numbers:
 * every realistic amount stays far inside the safe integer range.
 *
 * Dates are calendar dates. A statement states a day, not an instant, so `date` is used
 * for purchase and charge dates while `imported_at` is a real timestamp.
 *
 * Raw uploads are never stored. `imports.source_hash` is the only trace of the file, and
 * it exists so re-sending identical bytes can be recognised as a no-op.
 */

export const cards = pgTable(
  "cards",
  {
    id: serial("id").primaryKey(),
    issuer: text("issuer").notNull(),
    /** Final digits only. A full card number is never parsed or stored. */
    lastDigits: text("last_digits").notNull(),
    label: text("label").notNull(),
  },
  (table) => [unique("cards_issuer_last_digits_unique").on(table.issuer, table.lastDigits)],
);

export const imports = pgTable("imports", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id")
    .notNull()
    .references(() => cards.id),
  chargeDate: date("charge_date", { mode: "string" }).notNull(),
  /** SHA-256 of the uploaded bytes. Unique, so the same file is committed at most once. */
  sourceHash: text("source_hash").notNull().unique("imports_source_hash_unique"),
  parser: text("parser").notNull(),
  parserVersion: text("parser_version").notNull(),
  statedTotalMinor: bigint("stated_total_minor", { mode: "number" }).notNull(),
  currency: text("currency").$type<Currency>().notNull(),
  /** Non-fatal parser observations, kept so a review can revisit what was accepted. */
  warnings: jsonb("warnings")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    importId: integer("import_id")
      .notNull()
      .references(() => imports.id),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id),
    /** Issuer reference. Unique per card, which is what makes a reimport detectable. */
    reference: text("reference").notNull(),
    purchaseDate: date("purchase_date", { mode: "string" }).notNull(),
    chargeDate: date("charge_date", { mode: "string" }).notNull(),
    merchant: text("merchant").notNull(),
    kind: text("kind").$type<TransactionKind>().notNull(),
    originalMinor: bigint("original_minor", { mode: "number" }).notNull(),
    originalCurrency: text("original_currency").$type<Currency>().notNull(),
    billedMinor: bigint("billed_minor", { mode: "number" }).notNull(),
    billedCurrency: text("billed_currency").$type<Currency>().notNull(),
    installmentNumber: integer("installment_number"),
    installmentTotal: integer("installment_total"),
    installmentIsFinal: boolean("installment_is_final").notNull().default(false),
    discountMinor: bigint("discount_minor", { mode: "number" }),
    tags: jsonb("tags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (table) => [
    unique("transactions_card_id_reference_unique").on(table.cardId, table.reference),
    index("transactions_charge_date_idx").on(table.chargeDate),
    index("transactions_import_id_idx").on(table.importId),
  ],
);
