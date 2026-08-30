import type { StoredImport, StoredTransaction } from "./import-contracts.ts";
import type {
  InsightAmount,
  InsightsReport,
  InstallmentCommitmentInsight,
  RecurringAmountChangeInsight,
  RecurringChargeInsight,
  StoppedRecurringChargeInsight,
  SuspectedDuplicateChargeInsight,
} from "./insight-contracts.ts";

const RECURRING_MONTHS = 3;

type MerchantSeries = {
  merchant: string;
  cardLastDigits: string;
  rowsByMonth: Map<string, StoredTransaction[]>;
  allRows: StoredTransaction[];
};

/** A conservative merchant key: punctuation and spacing vary, while letters and digits remain evidence. */
export function normalizeMerchant(merchant: string): string {
  return merchant
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chargeMonth(row: Pick<StoredTransaction, "chargeDate">): string {
  return row.chargeDate.slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [yearText, monthText] = month.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const monthIndex = Number.parseInt(monthText ?? "", 10) - 1 + delta;
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Foreign charges are compared before conversion; ILS charges are compared by what was billed. */
export function comparisonAmount(row: StoredTransaction): InsightAmount {
  return row.originalCurrency === "ILS"
    ? { minorUnits: row.billedMinorUnits, currency: row.billedCurrency }
    : { minorUnits: row.originalMinorUnits, currency: row.originalCurrency };
}

function billedAmount(row: StoredTransaction): InsightAmount {
  return { minorUnits: row.billedMinorUnits, currency: row.billedCurrency };
}

function sameAmount(first: InsightAmount, second: InsightAmount): boolean {
  return first.currency === second.currency && first.minorUnits === second.minorUnits;
}

function sortByMerchant<T extends { merchant: string; cardLastDigits: string }>(rows: T[]): T[] {
  return rows.sort(
    (first, second) =>
      first.merchant.localeCompare(second.merchant) ||
      first.cardLastDigits.localeCompare(second.cardLastDigits),
  );
}

function importedMonthsByCard(imports: readonly StoredImport[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const record of imports) {
    const months = result.get(record.cardLastDigits) ?? new Set<string>();
    months.add(record.chargeDate.slice(0, 7));
    result.set(record.cardLastDigits, months);
  }
  return result;
}

function recurringSeries(transactions: readonly StoredTransaction[]): MerchantSeries[] {
  const groups = new Map<string, MerchantSeries>();
  for (const row of transactions) {
    if (row.kind === "refund" || row.kind === "installment" || row.billedMinorUnits <= 0) continue;
    const merchantKey = normalizeMerchant(row.merchant);
    if (merchantKey === "") continue;
    const key = `${row.cardLastDigits}\u0000${merchantKey}`;
    const series = groups.get(key) ?? {
      merchant: row.merchant,
      cardLastDigits: row.cardLastDigits,
      rowsByMonth: new Map<string, StoredTransaction[]>(),
      allRows: [],
    };
    const month = chargeMonth(row);
    const monthRows = series.rowsByMonth.get(month) ?? [];
    monthRows.push(row);
    series.rowsByMonth.set(month, monthRows);
    series.allRows.push(row);
    if (row.chargeDate >= (series.allRows.at(-2)?.chargeDate ?? "")) series.merchant = row.merchant;
    groups.set(key, series);
  }
  return [...groups.values()];
}

function singleRow(series: MerchantSeries, month: string): StoredTransaction | undefined {
  const rows = series.rowsByMonth.get(month);
  return rows?.length === 1 ? rows[0] : undefined;
}

function activeRecurrence(
  series: MerchantSeries,
  coveredMonths: ReadonlySet<string>,
  latestMonth: string,
): StoredTransaction[] | undefined {
  const months = Array.from({ length: RECURRING_MONTHS }, (_, index) =>
    shiftMonth(latestMonth, index - (RECURRING_MONTHS - 1)),
  );
  if (!months.every((month) => coveredMonths.has(month))) return undefined;
  const rows = months.map((month) => singleRow(series, month));
  return rows.every((row) => row !== undefined) ? (rows as StoredTransaction[]) : undefined;
}

function findStoppedRecurrence(
  series: MerchantSeries,
  coveredMonths: ReadonlySet<string>,
): { last: StoredTransaction; expectedMonth: string } | undefined {
  const occurrenceMonths = [...series.rowsByMonth.entries()]
    .filter(([, rows]) => rows.length === 1)
    .map(([month]) => month)
    .sort();
  const lastMonth = occurrenceMonths.at(-1);
  if (lastMonth === undefined) return undefined;
  const expectedMonth = shiftMonth(lastMonth, 1);
  if (!coveredMonths.has(expectedMonth) || series.rowsByMonth.has(expectedMonth)) return undefined;

  for (let offset = 0; offset < RECURRING_MONTHS; offset += 1) {
    const month = shiftMonth(lastMonth, -offset);
    if (!coveredMonths.has(month) || singleRow(series, month) === undefined) return undefined;
  }
  const last = singleRow(series, lastMonth);
  return last === undefined ? undefined : { last, expectedMonth };
}

function recurringInsights(
  transactions: readonly StoredTransaction[],
  coverage: ReadonlyMap<string, Set<string>>,
): {
  recurring: RecurringChargeInsight[];
  changes: RecurringAmountChangeInsight[];
  stopped: StoppedRecurringChargeInsight[];
} {
  const recurring: RecurringChargeInsight[] = [];
  const changes: RecurringAmountChangeInsight[] = [];
  const stopped: StoppedRecurringChargeInsight[] = [];

  for (const series of recurringSeries(transactions)) {
    const coveredMonths = coverage.get(series.cardLastDigits);
    const latestMonth = coveredMonths === undefined ? undefined : [...coveredMonths].sort().at(-1);
    if (coveredMonths === undefined || latestMonth === undefined) continue;
    const window = activeRecurrence(series, coveredMonths, latestMonth);
    if (window !== undefined) {
      const [beforePrevious, previous, current] = window;
      if (beforePrevious === undefined || previous === undefined || current === undefined) continue;
      const amounts = window.map(comparisonAmount);
      recurring.push({
        merchant: current.merchant,
        cardLastDigits: current.cardLastDigits,
        occurrenceCount: series.allRows.length,
        latestChargeDate: current.chargeDate,
        amountPattern: amounts.every((amount) => sameAmount(amount, amounts[0] as InsightAmount))
          ? "stable"
          : "variable",
        comparisonAmount: comparisonAmount(current),
        latestBilledAmount: billedAmount(current),
      });
      if (
        sameAmount(comparisonAmount(beforePrevious), comparisonAmount(previous)) &&
        !sameAmount(comparisonAmount(previous), comparisonAmount(current))
      ) {
        changes.push({
          merchant: current.merchant,
          cardLastDigits: current.cardLastDigits,
          previousChargeDate: previous.chargeDate,
          currentChargeDate: current.chargeDate,
          previousAmount: comparisonAmount(previous),
          currentAmount: comparisonAmount(current),
          currentBilledAmount: billedAmount(current),
        });
      }
      continue;
    }

    const ended = findStoppedRecurrence(series, coveredMonths);
    if (ended !== undefined) {
      stopped.push({
        merchant: ended.last.merchant,
        cardLastDigits: ended.last.cardLastDigits,
        lastChargeDate: ended.last.chargeDate,
        expectedMonth: ended.expectedMonth,
        lastComparisonAmount: comparisonAmount(ended.last),
      });
    }
  }

  return {
    recurring: sortByMerchant(recurring),
    changes: sortByMerchant(changes),
    stopped: sortByMerchant(stopped),
  };
}

function suspectedDuplicates(
  transactions: readonly StoredTransaction[],
): SuspectedDuplicateChargeInsight[] {
  const groups = new Map<string, StoredTransaction[]>();
  for (const row of transactions) {
    if (row.kind === "refund" || row.billedMinorUnits <= 0) continue;
    const amount = comparisonAmount(row);
    const key = [
      row.cardLastDigits,
      row.purchaseDate,
      chargeMonth(row),
      normalizeMerchant(row.merchant),
      amount.currency,
      String(amount.minorUnits),
    ].join("\u0000");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const result: SuspectedDuplicateChargeInsight[] = [];
  for (const rows of groups.values()) {
    if (rows.length < 2 || new Set(rows.map((row) => row.reference)).size < 2) continue;
    const first = rows[0];
    if (first === undefined) continue;
    result.push({
      merchant: first.merchant,
      cardLastDigits: first.cardLastDigits,
      purchaseDate: first.purchaseDate,
      chargeDate: first.chargeDate,
      comparisonAmount: comparisonAmount(first),
      transactionIds: rows.map((row) => row.id).sort((a, b) => a - b),
    });
  }
  return sortByMerchant(result);
}

function installmentCommitments(
  transactions: readonly StoredTransaction[],
  coverage: ReadonlyMap<string, Set<string>>,
): InstallmentCommitmentInsight[] {
  const latestByCard = new Map<string, string>();
  for (const [card, months] of coverage) {
    const latest = [...months].sort().at(-1);
    if (latest !== undefined) latestByCard.set(card, latest);
  }

  return sortByMerchant(
    transactions
      .filter(
        (row) =>
          row.kind === "installment" &&
          row.installmentNumber !== null &&
          row.installmentTotal !== null &&
          row.installmentNumber < row.installmentTotal &&
          chargeMonth(row) === latestByCard.get(row.cardLastDigits),
      )
      .map((row) => {
        const installmentNumber = row.installmentNumber as number;
        const installmentTotal = row.installmentTotal as number;
        const remainingPayments = installmentTotal - installmentNumber;
        return {
          transactionId: row.id,
          merchant: row.merchant,
          cardLastDigits: row.cardLastDigits,
          purchaseDate: row.purchaseDate,
          chargeDate: row.chargeDate,
          originalAmount: {
            minorUnits: row.originalMinorUnits,
            currency: row.originalCurrency,
          },
          currentBilledAmount: billedAmount(row),
          installmentNumber,
          installmentTotal,
          remainingPayments,
          estimatedRemainingAmount: {
            minorUnits: row.billedMinorUnits * remainingPayments,
            currency: row.billedCurrency,
          },
        };
      }),
  );
}

/** Derives reviewable insights from stored history without persisting guesses as facts. */
export function analyseInsights(
  transactions: readonly StoredTransaction[],
  imports: readonly StoredImport[],
): InsightsReport {
  const coverage = importedMonthsByCard(imports);
  const importedMonths = new Set(imports.map((record) => record.chargeDate.slice(0, 7)));
  const recurrence = recurringInsights(transactions, coverage);
  return {
    latestChargeMonth: [...importedMonths].sort().at(-1) ?? null,
    importedMonthCount: importedMonths.size,
    recurringCharges: recurrence.recurring,
    recurringAmountChanges: recurrence.changes,
    suspectedDuplicateCharges: suspectedDuplicates(transactions),
    stoppedRecurringCharges: recurrence.stopped,
    installmentCommitments: installmentCommitments(transactions, coverage),
  };
}
