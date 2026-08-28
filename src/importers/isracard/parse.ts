import {
  addAmounts,
  amountsEqual,
  formatAmount,
  isCurrency,
  parseAmount,
  type Currency,
  type Money,
} from "../../domain/money.ts";
import type {
  CanonicalTransaction,
  Installment,
  ParsedStatement,
  PlainDate,
  StatementMetadata,
} from "../../domain/transaction.ts";
import { readFirstSheet, type Sheet, type SheetRow } from "../xlsx/read.ts";
import { CHARGE_DATE, CURRENCY_SYMBOLS, HEADERS, MARKERS, MONTH_NAMES } from "./format.ts";

/**
 * Reads an Isracard transaction-detail export.
 *
 * The layout was established from a real August 2026 export: metadata above the table,
 * a header row, transaction rows, and a stated total below them. Column meanings are
 * issuer-specific and deliberately do not leak past this module.
 */

/** Bidirectional control characters appear around mixed Hebrew and Latin text. */
function clean(value: string): string {
  return value.replace(/[‎‏‪-‮⁦-⁩]/g, "").trim();
}

function textOf(row: SheetRow | undefined, column: string): string | undefined {
  const cell = row?.get(column);
  if (cell === undefined) return undefined;
  return clean(cell.kind === "text" ? cell.text : cell.raw);
}

/**
 * Reads a `dd.mm.yy` date.
 *
 * The issuer writes a two-digit year. This parser is specific to Isracard statements,
 * which are contemporary documents, so a two-digit year is read as 20xx. A year far
 * outside that expectation is rejected rather than silently accepted.
 */
function parseStatementDate(value: string, context: string): PlainDate {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(clean(value));
  if (match === null) {
    throw new Error(`${context}: unrecognised date ${JSON.stringify(value)}`);
  }
  const day = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const yearText = match[3] ?? "";
  const year =
    yearText.length === 4 ? Number.parseInt(yearText, 10) : 2000 + Number.parseInt(yearText, 10);

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2099) {
    throw new Error(`${context}: implausible date ${JSON.stringify(value)}`);
  }
  // Reject a day the month does not have, such as 31.02.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error(`${context}: date does not exist ${JSON.stringify(value)}`);
  }
  return { year, month, day };
}

function parseCurrency(symbol: string, context: string): Currency {
  const cleaned = clean(symbol);
  const symbols: Record<string, Currency> = CURRENCY_SYMBOLS;
  const currency = symbols[cleaned] ?? (isCurrency(cleaned) ? cleaned : undefined);
  if (currency === undefined) {
    throw new Error(`${context}: unrecognised currency ${JSON.stringify(symbol)}`);
  }
  return currency;
}

/** Finds the header row so the parser does not depend on the metadata block's height. */
function locateHeaderRow(sheet: Sheet): { rowNumber: number; columns: Map<string, string> } {
  for (const [rowNumber, row] of [...sheet.rows].sort((a, b) => a[0] - b[0])) {
    const columns = new Map<string, string>();
    for (const [column, cell] of row) {
      if (cell.kind === "text") columns.set(clean(cell.text), column);
    }
    if (columns.has(HEADERS.purchaseDate) && columns.has(HEADERS.billedAmount)) {
      const resolved = new Map<string, string>();
      for (const [key, header] of Object.entries(HEADERS)) {
        const column = columns.get(header);
        if (column === undefined) {
          throw new Error(`The statement is missing the "${header}" column.`);
        }
        resolved.set(key, column);
      }
      return { rowNumber, columns: resolved };
    }
  }
  throw new Error("This does not look like an Isracard statement: no transaction header row.");
}

function columnFor(columns: Map<string, string>, key: keyof typeof HEADERS): string {
  const column = columns.get(key);
  if (column === undefined) throw new Error(`Missing column mapping for ${key}`);
  return column;
}

type Details = {
  installment?: Installment;
  discount?: Money;
  tags: string[];
};

/** The details column stacks independent markers on separate lines. */
function parseDetails(text: string | undefined, billedCurrency: Currency): Details {
  const details: Details = { tags: [] };
  if (text === undefined) return details;

  let number: number | undefined;
  let total: number | undefined;
  let isFinal = false;

  for (const rawLine of text.split("\n")) {
    const line = clean(rawLine);
    if (line === "") continue;

    const installment = MARKERS.installment.exec(line);
    if (installment !== null) {
      number = Number.parseInt(installment[1] ?? "", 10);
      total = Number.parseInt(installment[2] ?? "", 10);
      continue;
    }
    if (line === MARKERS.finalInstallment) {
      isFinal = true;
      continue;
    }
    const discount = MARKERS.discount.exec(line);
    if (discount !== null) {
      const amount = clean(discount[1] ?? "");
      const symbol = amount.replace(/[\d.,\s]/g, "");
      details.discount = parseAmount(
        amount.replace(symbol, ""),
        symbol === "" ? billedCurrency : parseCurrency(symbol, "discount"),
      );
      continue;
    }
    details.tags.push(line);
  }

  if (number !== undefined && total !== undefined) {
    details.installment = { number, total, isFinal };
  } else if (isFinal) {
    // "Final payment" without a count still means this row is part of a plan.
    details.tags.push(MARKERS.finalInstallment);
  }
  return details;
}

function parseMetadata(sheet: Sheet, headerRow: number): StatementMetadata {
  let cardLabel = "";
  let cardLastDigits = "";
  let statedTotal: Money | undefined;
  let chargeDay: { day: number; month: number } | undefined;
  let periodYear: number | undefined;

  for (const [rowNumber, row] of [...sheet.rows].sort((a, b) => a[0] - b[0])) {
    if (rowNumber >= headerRow) break;
    for (const cell of row.values()) {
      const text = clean(cell.kind === "text" ? cell.text : cell.raw);

      const card = /^(.*?)\s*-\s*(\d{4})$/.exec(text);
      if (card !== null && cardLastDigits === "") {
        cardLabel = clean(card[1] ?? "");
        cardLastDigits = card[2] ?? "";
        continue;
      }

      const charge = CHARGE_DATE.exec(text);
      if (charge !== null) {
        chargeDay = {
          day: Number.parseInt(charge[1] ?? "", 10),
          month: Number.parseInt(charge[2] ?? "", 10),
        };
        continue;
      }

      const period = new RegExp(`^(${MONTH_NAMES.join("|")})\\s+(\\d{4})$`).exec(text);
      if (period !== null) {
        periodYear = Number.parseInt(period[2] ?? "", 10);
        continue;
      }

      const total = /^([₪$€£])\s*([\d,]+(?:\.\d{1,2})?)$/.exec(text);
      if (total !== null && statedTotal === undefined) {
        statedTotal = parseAmount(total[2] ?? "", parseCurrency(total[1] ?? "", "stated total"));
      }
    }
  }

  if (cardLastDigits === "") {
    throw new Error("The statement does not identify a card.");
  }
  if (chargeDay === undefined) {
    throw new Error("The statement does not state a charge date.");
  }
  if (periodYear === undefined) {
    throw new Error("The statement does not state its period.");
  }
  if (statedTotal === undefined) {
    throw new Error("The statement does not state a total.");
  }

  return {
    issuer: "isracard",
    cardLabel,
    cardLastDigits,
    chargeDate: { year: periodYear, month: chargeDay.month, day: chargeDay.day },
    statedTotal,
  };
}

export function parseIsracardStatement(file: Uint8Array): ParsedStatement {
  const sheet = readFirstSheet(file);
  const { rowNumber: headerRow, columns } = locateHeaderRow(sheet);
  const metadata = parseMetadata(sheet, headerRow);
  const warnings: string[] = [];

  const transactions: CanonicalTransaction[] = [];
  const seenReferences = new Set<string>();

  for (const [rowNumber, row] of [...sheet.rows].sort((a, b) => a[0] - b[0])) {
    if (rowNumber <= headerRow) continue;

    const purchaseDateText = textOf(row, columnFor(columns, "purchaseDate"));
    const billedAmountText = textOf(row, columnFor(columns, "billedAmount"));
    // The stated-total row carries an amount but no date, and ends the transactions.
    if (purchaseDateText === undefined) continue;
    if (billedAmountText === undefined) continue;

    const where = `row ${rowNumber}`;
    const billedCurrency = parseCurrency(
      textOf(row, columnFor(columns, "billedCurrency")) ?? "",
      where,
    );
    const originalCurrency = parseCurrency(
      textOf(row, columnFor(columns, "originalCurrency")) ?? "",
      where,
    );

    const billedAmount = parseAmount(billedAmountText, billedCurrency);
    const originalAmount = parseAmount(
      textOf(row, columnFor(columns, "originalAmount")) ?? billedAmountText,
      originalCurrency,
    );

    // The details cell keeps its line breaks, so it is read unclean here.
    const detailsCell = row.get(columnFor(columns, "details"));
    const details = parseDetails(
      detailsCell?.kind === "text" ? detailsCell.text : undefined,
      billedCurrency,
    );

    const reference = textOf(row, columnFor(columns, "reference")) ?? "";
    if (reference === "") {
      throw new Error(`${where}: the transaction has no reference number.`);
    }
    if (seenReferences.has(reference)) {
      warnings.push(`Reference ${reference} appears more than once in this statement.`);
    }
    seenReferences.add(reference);

    const isRefund = billedAmount.minorUnits < 0;
    const kind = isRefund
      ? "refund"
      : details.installment !== undefined
        ? "installment"
        : "purchase";

    const transaction: CanonicalTransaction = {
      purchaseDate: parseStatementDate(purchaseDateText, where),
      chargeDate: metadata.chargeDate,
      merchant: clean(textOf(row, columnFor(columns, "merchant")) ?? ""),
      kind,
      originalAmount,
      billedAmount,
      reference,
      tags: details.tags,
      ...(details.installment === undefined ? {} : { installment: details.installment }),
      ...(details.discount === undefined ? {} : { discount: details.discount }),
      ...(originalCurrency === billedCurrency || originalAmount.minorUnits === 0
        ? {}
        : {
            exchangeRate: {
              derived: true as const,
              ratePerUnit: billedAmount.minorUnits / originalAmount.minorUnits,
            },
          }),
    };

    if (transaction.merchant === "") {
      warnings.push(`${where}: the transaction has no merchant name.`);
    }
    transactions.push(transaction);
  }

  if (transactions.length === 0) {
    throw new Error("The statement contains no transactions.");
  }

  // The issuer states what it will charge. If the rows do not add up to it, something was
  // misread, and importing a statement that does not reconcile is worse than refusing it.
  const billed = transactions.map((transaction) => transaction.billedAmount);
  const computed = addAmounts(billed, metadata.statedTotal.currency);
  if (!amountsEqual(computed, metadata.statedTotal)) {
    throw new Error(
      `The transactions total ${formatAmount(computed)} but the statement states ${formatAmount(metadata.statedTotal)}.`,
    );
  }

  return { metadata, transactions, warnings };
}
