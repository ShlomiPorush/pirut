import { describe, expect, it } from "vitest";
import type { StoredImport, StoredTransaction } from "../../src/application/import-contracts.ts";
import {
  analyseInsights,
  comparisonAmount,
  normalizeMerchant,
} from "../../src/application/insight-service.ts";

let nextTransactionId = 1;

function transaction(month: string, overrides: Partial<StoredTransaction> = {}): StoredTransaction {
  const id = nextTransactionId++;
  return {
    id,
    importId: Number.parseInt(month.replace("-", ""), 10),
    cardLastDigits: "1234",
    purchaseDate: `${month}-05`,
    chargeDate: `${month}-15`,
    merchant: "Video Service",
    kind: "purchase",
    originalMinorUnits: 5_000,
    originalCurrency: "ILS",
    billedMinorUnits: 5_000,
    billedCurrency: "ILS",
    installmentNumber: null,
    installmentTotal: null,
    installmentIsFinal: false,
    discountMinorUnits: null,
    reference: `REF-${String(id)}`,
    tags: [],
    ...overrides,
  };
}

function imported(month: string, cardLastDigits = "1234"): StoredImport {
  return {
    id: Number.parseInt(`${month.replace("-", "")}01`, 10),
    cardLastDigits,
    cardLabel: "Test card",
    chargeDate: `${month}-15`,
    statedTotalMinorUnits: 0,
    currency: "ILS",
    transactionCount: 0,
    importedAt: `${month}-16T09:00:00.000Z`,
  };
}

describe("merchant and amount identity", () => {
  it("normalizes punctuation, whitespace, and case without discarding digits", () => {
    expect(normalizeMerchant("  ROAD-6 / North  ")).toBe("road 6 north");
  });

  it("compares foreign purchases in their original currency", () => {
    const row = transaction("2026-01", {
      originalMinorUnits: 1_000,
      originalCurrency: "USD",
      billedMinorUnits: 3_650,
    });
    expect(comparisonAmount(row)).toEqual({ minorUnits: 1_000, currency: "USD" });
  });
});

describe("recurring charges", () => {
  it("recognizes a monthly charge after three covered statement months", () => {
    const rows = ["2026-01", "2026-02", "2026-03"].map((month) => transaction(month));
    const report = analyseInsights(
      rows,
      rows.map((row) => imported(row.chargeDate.slice(0, 7))),
    );

    expect(report.recurringCharges).toEqual([
      expect.objectContaining({
        merchant: "Video Service",
        occurrenceCount: 3,
        amountPattern: "stable",
        comparisonAmount: { minorUnits: 5_000, currency: "ILS" },
      }),
    ]);
    expect(report.recurringAmountChanges).toEqual([]);
  });

  it("reports a changed amount only after two equal preceding charges", () => {
    const rows = [
      transaction("2026-01"),
      transaction("2026-02"),
      transaction("2026-03", { originalMinorUnits: 6_000, billedMinorUnits: 6_000 }),
    ];
    const report = analyseInsights(rows, [
      imported("2026-01"),
      imported("2026-02"),
      imported("2026-03"),
    ]);

    expect(report.recurringCharges[0]?.amountPattern).toBe("variable");
    expect(report.recurringAmountChanges).toEqual([
      expect.objectContaining({
        previousAmount: { minorUnits: 5_000, currency: "ILS" },
        currentAmount: { minorUnits: 6_000, currency: "ILS" },
      }),
    ]);
  });

  it("does not mistake exchange-rate movement for a recurring amount change", () => {
    const rows = [3_500, 3_700, 3_900].map((billedMinorUnits, index) =>
      transaction(`2026-0${String(index + 1)}`, {
        originalMinorUnits: 1_000,
        originalCurrency: "USD",
        billedMinorUnits,
      }),
    );
    const report = analyseInsights(rows, [
      imported("2026-01"),
      imported("2026-02"),
      imported("2026-03"),
    ]);

    expect(report.recurringCharges[0]).toMatchObject({
      amountPattern: "stable",
      comparisonAmount: { minorUnits: 1_000, currency: "USD" },
      latestBilledAmount: { minorUnits: 3_900, currency: "ILS" },
    });
    expect(report.recurringAmountChanges).toEqual([]);
  });

  it("marks a series as possibly stopped only after the next card statement exists", () => {
    const rows = ["2026-01", "2026-02", "2026-03"].map((month) => transaction(month));
    const covered = ["2026-01", "2026-02", "2026-03", "2026-04"].map((month) => imported(month));
    const report = analyseInsights(rows, covered);

    expect(report.recurringCharges).toEqual([]);
    expect(report.stoppedRecurringCharges).toEqual([
      expect.objectContaining({ lastChargeDate: "2026-03-15", expectedMonth: "2026-04" }),
    ]);
    expect(analyseInsights(rows, covered.slice(0, 3)).stoppedRecurringCharges).toEqual([]);
  });

  it("does not infer recurrence when a covered month has two matching charges", () => {
    const rows = [
      transaction("2026-01"),
      transaction("2026-02"),
      transaction("2026-02"),
      transaction("2026-03"),
    ];
    const report = analyseInsights(rows, [
      imported("2026-01"),
      imported("2026-02"),
      imported("2026-03"),
    ]);
    expect(report.recurringCharges).toEqual([]);
  });
});

describe("suspected duplicate charges", () => {
  it("groups distinct references with the same card, date, merchant, and comparison amount", () => {
    const first = transaction("2026-03", {
      merchant: "Example.Store",
      originalCurrency: "USD",
      originalMinorUnits: 2_000,
      billedMinorUnits: 7_200,
      reference: "FIRST",
    });
    const second = transaction("2026-03", {
      merchant: "example store",
      originalCurrency: "USD",
      originalMinorUnits: 2_000,
      billedMinorUnits: 7_300,
      reference: "SECOND",
    });

    expect(
      analyseInsights([first, second], [imported("2026-03")]).suspectedDuplicateCharges,
    ).toEqual([
      expect.objectContaining({
        comparisonAmount: { minorUnits: 2_000, currency: "USD" },
        transactionIds: [first.id, second.id],
      }),
    ]);
  });

  it("does not report two rows with the same issuer reference as a merchant duplicate", () => {
    const rows = [
      transaction("2026-03", { reference: "SAME" }),
      transaction("2026-03", { reference: "SAME" }),
    ];
    expect(analyseInsights(rows, [imported("2026-03")]).suspectedDuplicateCharges).toEqual([]);
  });
});

describe("installment commitments", () => {
  it("uses only the latest imported payment and preserves the full purchase amount", () => {
    const older = transaction("2026-02", {
      merchant: "Furniture",
      kind: "installment",
      originalMinorUnits: 240_000,
      billedMinorUnits: 40_000,
      installmentNumber: 1,
      installmentTotal: 6,
    });
    const latest = transaction("2026-03", {
      merchant: "Furniture",
      kind: "installment",
      originalMinorUnits: 240_000,
      billedMinorUnits: 40_000,
      installmentNumber: 2,
      installmentTotal: 6,
    });
    const report = analyseInsights([older, latest], [imported("2026-02"), imported("2026-03")]);

    expect(report.installmentCommitments).toEqual([
      expect.objectContaining({
        transactionId: latest.id,
        originalAmount: { minorUnits: 240_000, currency: "ILS" },
        currentBilledAmount: { minorUnits: 40_000, currency: "ILS" },
        installmentNumber: 2,
        installmentTotal: 6,
        remainingPayments: 4,
        estimatedRemainingAmount: { minorUnits: 160_000, currency: "ILS" },
      }),
    ]);
  });

  it("omits a final installment from future commitments", () => {
    const finalPayment = transaction("2026-03", {
      kind: "installment",
      installmentNumber: 6,
      installmentTotal: 6,
      installmentIsFinal: true,
    });
    expect(analyseInsights([finalPayment], [imported("2026-03")]).installmentCommitments).toEqual(
      [],
    );
  });
});
