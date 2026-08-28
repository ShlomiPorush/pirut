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

/**
 * Better Auth's storage model.
 *
 * These five tables are not Pirut's design: they are the shape Better Auth core (user,
 * session, account, verification) and the passkey plugin declare, and the Drizzle adapter
 * reads them by property name. Every property below therefore keeps Better Auth's own
 * camelCase field name, while the SQL column stays snake_case like the rest of this file.
 * Renaming a property would silently break the adapter, which looks up
 * `schema[model][field]` and throws only when the query runs.
 *
 * `updatedAt` on `session` and `account` has no default in Better Auth's field
 * definitions, so those columns carry a database default instead of a not-null violation.
 *
 * Deleting a member deletes their sessions, accounts, and passkeys. The application also
 * removes them explicitly, because the cascade is a property of PostgreSQL and the tests
 * run against an in-memory adapter that has no foreign keys.
 */

export const authUsers = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique("user_email_unique"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique("session_token_unique"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const authAccounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    /** Distinguishes the credential issuer; unique together with `accountId`. */
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    /** The password hash for an email-and-password account. Never returned by the API. */
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("account_issuer_account_id_unique").on(table.issuer, table.accountId),
    index("account_user_id_idx").on(table.userId),
  ],
);

export const authVerifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const authPasskeys = pgTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    /** Member-chosen label, so a list of passkeys can name the device. */
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at", { withTimezone: true }),
    /** Identifies the authenticator model, not the device or the member. */
    aaguid: text("aaguid"),
  },
  (table) => [
    index("passkey_user_id_idx").on(table.userId),
    index("passkey_credential_id_idx").on(table.credentialID),
  ],
);
