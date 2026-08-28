import type { Money } from "./money.ts";

/** A calendar date with no time and no zone. Statements state dates, not instants. */
export type PlainDate = { year: number; month: number; day: number };

export function formatPlainDate({ year, month, day }: PlainDate): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type Installment = {
  /** Which payment this row represents, 1-based. */
  number: number;
  /** How many payments the purchase was split into. */
  total: number;
  /** True when the issuer marked this as the final payment. */
  isFinal: boolean;
};

/**
 * An exchange rate the issuer did not state.
 *
 * Isracard reports a foreign amount and the billed amount in shekels but no rate, so any
 * rate is inferred. It is kept separate from stated values and marked derived, because a
 * number the source never provided must not be presented as evidence from the source.
 */
export type DerivedExchangeRate = {
  derived: true;
  /** Billed minor units per one minor unit of the original currency. */
  ratePerUnit: number;
};

export type TransactionKind =
  | "purchase"
  | "refund"
  /** A payment split across months. The row carries one installment. */
  | "installment";

export type CanonicalTransaction = {
  /** When the cardholder made the purchase. */
  purchaseDate: PlainDate;
  /**
   * When the issuer charges the bank account. Isracard states this once per statement
   * rather than per row, so every transaction in one import shares it.
   */
  chargeDate: PlainDate;
  merchant: string;
  kind: TransactionKind;
  /**
   * What the purchase cost in its original currency. For an installment row this is the
   * full purchase amount, not the amount billed this month.
   */
  originalAmount: Money;
  /** What the issuer bills for this row, in the billing currency. */
  billedAmount: Money;
  exchangeRate?: DerivedExchangeRate;
  installment?: Installment;
  /** A discount the issuer already applied to the billed amount. Informational. */
  discount?: Money;
  /** Issuer reference for this row. Stable enough to detect a reimported row. */
  reference: string;
  /** Issuer-specific markers preserved verbatim, for review and future rules. */
  tags: readonly string[];
};

/** Everything a statement says about itself, independent of its rows. */
export type StatementMetadata = {
  issuer: "isracard";
  /** Final digits of the card. A full card number is never parsed or stored. */
  cardLastDigits: string;
  cardLabel: string;
  chargeDate: PlainDate;
  /** The total the issuer states it will charge, used to check the parsed rows. */
  statedTotal: Money;
};

export type ParsedStatement = {
  metadata: StatementMetadata;
  transactions: readonly CanonicalTransaction[];
  /** Non-fatal observations a person should see before committing an import. */
  warnings: readonly string[];
};
