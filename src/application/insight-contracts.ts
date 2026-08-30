import type { Currency } from "../domain/money.ts";

export type InsightAmount = {
  minorUnits: number;
  currency: Currency;
};

export type RecurringChargeInsight = {
  merchant: string;
  cardLastDigits: string;
  occurrenceCount: number;
  latestChargeDate: string;
  amountPattern: "stable" | "variable";
  comparisonAmount: InsightAmount;
  latestBilledAmount: InsightAmount;
};

export type RecurringAmountChangeInsight = {
  merchant: string;
  cardLastDigits: string;
  previousChargeDate: string;
  currentChargeDate: string;
  previousAmount: InsightAmount;
  currentAmount: InsightAmount;
  currentBilledAmount: InsightAmount;
};

export type SuspectedDuplicateChargeInsight = {
  merchant: string;
  cardLastDigits: string;
  purchaseDate: string;
  chargeDate: string;
  comparisonAmount: InsightAmount;
  transactionIds: readonly number[];
};

export type StoppedRecurringChargeInsight = {
  merchant: string;
  cardLastDigits: string;
  lastChargeDate: string;
  expectedMonth: string;
  lastComparisonAmount: InsightAmount;
};

export type InstallmentCommitmentInsight = {
  transactionId: number;
  merchant: string;
  cardLastDigits: string;
  purchaseDate: string;
  chargeDate: string;
  originalAmount: InsightAmount;
  currentBilledAmount: InsightAmount;
  installmentNumber: number;
  installmentTotal: number;
  remainingPayments: number;
  estimatedRemainingAmount: InsightAmount;
};

export type InsightsReport = {
  latestChargeMonth: string | null;
  importedMonthCount: number;
  recurringCharges: readonly RecurringChargeInsight[];
  recurringAmountChanges: readonly RecurringAmountChangeInsight[];
  suspectedDuplicateCharges: readonly SuspectedDuplicateChargeInsight[];
  stoppedRecurringCharges: readonly StoppedRecurringChargeInsight[];
  installmentCommitments: readonly InstallmentCommitmentInsight[];
};
