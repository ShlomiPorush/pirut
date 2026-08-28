import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { formatAmount } from "../../src/domain/money.ts";
import { formatPlainDate } from "../../src/domain/transaction.ts";
import { parseIsracardStatement } from "../../src/importers/isracard/parse.ts";

import { FIXTURE, FIXTURE_PATH } from "../fixtures/he/isracard/build-fixture.ts";

const fixture = FIXTURE_PATH;

function load() {
  return parseIsracardStatement(readFileSync(fixture));
}

/** Rebuilds the workbook with an altered worksheet, so damage survives compression. */
function rewriteSheet(file: Uint8Array, change: (xml: string) => string): Uint8Array {
  const entries = unzipSync(file);
  const sheet = entries["xl/worksheets/sheet1.xml"];
  if (sheet === undefined) throw new Error("fixture has no worksheet");
  return zipSync({ ...entries, "xl/worksheets/sheet1.xml": strToU8(change(strFromU8(sheet))) });
}

function byReference(reference: string) {
  const transaction = load().transactions.find((item) => item.reference === reference);
  if (transaction === undefined) throw new Error(`fixture is missing reference ${reference}`);
  return transaction;
}

describe("Isracard statement metadata", () => {
  it("identifies the card without keeping a full number", () => {
    const { metadata } = load();
    expect(metadata.issuer).toBe("isracard");
    expect(metadata.cardLastDigits).toBe(FIXTURE.cardLastDigits);
    // Bidirectional control characters around the label must not survive parsing.
    expect(metadata.cardLabel).toBe(FIXTURE.cardLabel);
    expect([...metadata.cardLabel].map((c) => c.codePointAt(0))).not.toContain(0x202b);
  });

  it("reads the charge date from the statement, taking its year from the period", () => {
    expect(formatPlainDate(load().metadata.chargeDate)).toBe("2026-08-15");
  });

  it("reads the stated total", () => {
    expect(formatAmount(load().metadata.statedTotal)).toBe("1021.60 ILS");
    expect(FIXTURE.statedTotal).toBe("1,021.60");
  });
});

describe("Isracard transactions", () => {
  it("parses every transaction row and nothing else", () => {
    const { transactions, warnings } = load();
    expect(transactions).toHaveLength(5);
    expect(warnings).toEqual([]);
  });

  it("gives every transaction the statement's charge date and its own purchase date", () => {
    const transaction = byReference(FIXTURE.references.shekelPurchase);
    expect(formatPlainDate(transaction.purchaseDate)).toBe("2026-08-14");
    expect(formatPlainDate(transaction.chargeDate)).toBe("2026-08-15");
  });

  it("trims trailing spaces from merchant names", () => {
    expect(byReference(FIXTURE.references.foreignPurchase).merchant).toBe(
      FIXTURE.merchants.hosting,
    );
  });

  it("keeps a shekel purchase in shekels with no exchange rate", () => {
    const transaction = byReference(FIXTURE.references.shekelPurchase);
    expect(transaction.kind).toBe("purchase");
    expect(formatAmount(transaction.originalAmount)).toBe("214.00 ILS");
    expect(formatAmount(transaction.billedAmount)).toBe("214.00 ILS");
    expect(transaction.exchangeRate).toBeUndefined();
  });
});

describe("foreign currency", () => {
  it("keeps the original currency and the billed shekel amount separately", () => {
    const transaction = byReference(FIXTURE.references.foreignPurchase);
    expect(formatAmount(transaction.originalAmount)).toBe("10.00 USD");
    expect(formatAmount(transaction.billedAmount)).toBe("33.10 ILS");
  });

  it("marks the exchange rate as derived, because the statement never states one", () => {
    const rate = byReference(FIXTURE.references.foreignPurchase).exchangeRate;
    expect(rate?.derived).toBe(true);
    expect(rate?.ratePerUnit).toBeCloseTo(3.31, 10);
  });

  it("records a discount the issuer already applied", () => {
    expect(formatAmount(byReference(FIXTURE.references.foreignPurchase).discount!)).toBe(
      "0.60 ILS",
    );
  });

  it("preserves issuer markers that carry no parsed meaning yet", () => {
    expect(byReference(FIXTURE.references.foreignPurchase).tags).toEqual(FIXTURE.foreignTags);
  });
});

describe("installments", () => {
  it("reads the original purchase amount and this month's payment separately", () => {
    const transaction = byReference(FIXTURE.references.midInstallment);
    expect(transaction.kind).toBe("installment");
    expect(transaction.installment).toEqual({ number: 2, total: 3, isFinal: false });
    // The purchase cost 1200; only 400 is billed this month.
    expect(formatAmount(transaction.originalAmount)).toBe("1200.00 ILS");
    expect(formatAmount(transaction.billedAmount)).toBe("400.00 ILS");
  });

  it("marks a final payment", () => {
    expect(byReference(FIXTURE.references.finalInstallment).installment).toEqual({
      number: 2,
      total: 2,
      isFinal: true,
    });
  });

  it("does not invent an exchange rate for a shekel installment", () => {
    expect(byReference(FIXTURE.references.midInstallment).exchangeRate).toBeUndefined();
  });
});

describe("refunds", () => {
  it("treats a negative amount as a refund without rewriting the original purchase", () => {
    const transaction = byReference(FIXTURE.references.refund);
    expect(transaction.kind).toBe("refund");
    expect(formatAmount(transaction.billedAmount)).toBe("-75.50 ILS");
    expect(transaction.billedAmount.minorUnits).toBe(-7550);
  });
});

describe("reconciliation", () => {
  it("accepts a statement whose rows match the stated total", () => {
    const { transactions, metadata } = load();
    const sum = transactions.reduce((total, item) => total + item.billedAmount.minorUnits, 0);
    expect(sum).toBe(metadata.statedTotal.minorUnits);
  });

  it("rejects a statement whose rows do not add up", () => {
    // A single altered billed amount must fail the import rather than persist a wrong
    // balance. Column E is the billed amount; column C is what the purchase cost.
    const damaged = rewriteSheet(readFileSync(fixture), (xml) =>
      xml.replace(
        '<x:c r="E11" s="4"><x:v>214</x:v></x:c>',
        '<x:c r="E11" s="4"><x:v>215</x:v></x:c>',
      ),
    );
    expect(() => parseIsracardStatement(damaged)).toThrow(
      /transactions total 1022.60 ILS but the statement states 1021.60 ILS/,
    );
  });

  it("does not reconcile against the purchase amount, only the billed amount", () => {
    // Changing what a purchase originally cost does not change what is billed this month,
    // so this must still import cleanly. Installments depend on the two differing.
    const altered = rewriteSheet(readFileSync(fixture), (xml) =>
      xml.replace(
        '<x:c r="C11" s="4"><x:v>214</x:v></x:c>',
        '<x:c r="C11" s="4"><x:v>999</x:v></x:c>',
      ),
    );
    expect(parseIsracardStatement(altered).transactions).toHaveLength(5);
  });

  it("reports the discrepancy rather than silently dropping an unreadable row", () => {
    const damaged = rewriteSheet(readFileSync(fixture), (xml) =>
      xml.replace(/<x:row r="13">[\s\S]*?<\/x:row>/, ""),
    );
    expect(() => parseIsracardStatement(damaged)).toThrow(/but the statement states/);
  });
});

describe("rejecting files that are not statements", () => {
  it("refuses a file that is not a spreadsheet", () => {
    expect(() => parseIsracardStatement(new TextEncoder().encode("not a spreadsheet"))).toThrow(
      /not a readable spreadsheet/,
    );
  });
});
