import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  StoredImport,
  StoredTransaction,
  TransactionFilter,
} from "../../src/application/import-contracts.ts";
import {
  chargeMonthOf,
  createImportServiceOver,
  hashUpload,
  resolveMonthWindow,
  summariseByMonth,
  type CardIdentity,
  type ChargeTotalRow,
  type ImportRecord,
  type ImportStorage,
  type ImportWriter,
  type MonthWindow,
  type TransactionRecord,
} from "../../src/application/import-service.ts";
import { FIXTURE, FIXTURE_PATH } from "../fixtures/he/isracard/build-fixture.ts";

const upload = readFileSync(FIXTURE_PATH);

/**
 * An in-memory storage that behaves like a transactional database: `runInTransaction`
 * works on a copy and publishes it only when the unit of work resolves. That is what lets
 * a test prove a failed commit leaves nothing behind.
 */

type Row<T> = T & { id: number };
type CardRow = Row<CardIdentity & { label: string }>;

type State = {
  cards: CardRow[];
  imports: Row<ImportRecord>[];
  transactions: Row<TransactionRecord>[];
};

const IMPORTED_AT = new Date("2026-08-20T09:00:00.000Z");

function emptyState(): State {
  return { cards: [], imports: [], transactions: [] };
}

function copy(state: State): State {
  return {
    cards: state.cards.map((row) => ({ ...row })),
    imports: state.imports.map((row) => ({ ...row })),
    transactions: state.transactions.map((row) => ({ ...row })),
  };
}

function nextId(rows: readonly { id: number }[]): number {
  return rows.reduce((highest, row) => Math.max(highest, row.id), 0) + 1;
}

type FakeOptions = {
  /** Thrown by `insertTransactions`, to exercise a failure part-way through a commit. */
  failTransactionInsert?: boolean;
  chargeTotals?: readonly ChargeTotalRow[];
};

type Fake = {
  storage: ImportStorage;
  state: () => State;
  seedTransaction: (card: CardIdentity & { label: string }, reference: string) => Promise<void>;
};

function createFakeStorage(options: FakeOptions = {}): Fake {
  let committed = emptyState();

  function cardOf(state: State, cardId: number): CardRow {
    const card = state.cards.find((row) => row.id === cardId);
    if (card === undefined) throw new Error(`unknown card ${cardId}`);
    return card;
  }

  function toStoredTransaction(state: State, row: Row<TransactionRecord>): StoredTransaction {
    return {
      id: row.id,
      importId: row.importId,
      cardLastDigits: cardOf(state, row.cardId).lastDigits,
      purchaseDate: row.purchaseDate,
      chargeDate: row.chargeDate,
      merchant: row.merchant,
      kind: row.kind,
      originalMinorUnits: row.originalMinor,
      originalCurrency: row.originalCurrency,
      billedMinorUnits: row.billedMinor,
      billedCurrency: row.billedCurrency,
      installmentNumber: row.installmentNumber,
      installmentTotal: row.installmentTotal,
      installmentIsFinal: row.installmentIsFinal,
      discountMinorUnits: row.discountMinor,
      reference: row.reference,
      tags: row.tags,
    };
  }

  function writerOver(state: State): ImportWriter {
    return {
      findImportIdBySourceHash: (sourceHash) =>
        Promise.resolve(state.imports.find((row) => row.sourceHash === sourceHash)?.id ?? null),

      upsertCard(card) {
        const existing = state.cards.find(
          (row) => row.issuer === card.issuer && row.lastDigits === card.lastDigits,
        );
        if (existing !== undefined) {
          existing.label = card.label;
          return Promise.resolve(existing.id);
        }
        const row: CardRow = { ...card, id: nextId(state.cards) };
        state.cards.push(row);
        return Promise.resolve(row.id);
      },

      findStoredReferencesForCard: (cardId, references) =>
        Promise.resolve(
          state.transactions
            .filter((row) => row.cardId === cardId && references.includes(row.reference))
            .map((row) => row.reference),
        ),

      insertImport(record) {
        const row: Row<ImportRecord> = { ...record, id: nextId(state.imports) };
        state.imports.push(row);
        return Promise.resolve(row.id);
      },

      insertTransactions(records) {
        if (options.failTransactionInsert === true) {
          throw new Error("storage failure while inserting transactions");
        }
        let id = nextId(state.transactions);
        for (const record of records) state.transactions.push({ ...record, id: id++ });
        return Promise.resolve();
      },
    };
  }

  const storage: ImportStorage = {
    findImportIdBySourceHash: (sourceHash) =>
      Promise.resolve(committed.imports.find((row) => row.sourceHash === sourceHash)?.id ?? null),

    findStoredReferences(card, references) {
      const cardIds = committed.cards
        .filter((row) => row.issuer === card.issuer && row.lastDigits === card.lastDigits)
        .map((row) => row.id);
      return Promise.resolve(
        committed.transactions
          .filter((row) => cardIds.includes(row.cardId) && references.includes(row.reference))
          .map((row) => row.reference),
      );
    },

    async runInTransaction(work) {
      const staged = copy(committed);
      const result = await work(writerOver(staged));
      committed = staged;
      return result;
    },

    listImports() {
      const rows: StoredImport[] = committed.imports.map((row) => ({
        id: row.id,
        cardLastDigits: cardOf(committed, row.cardId).lastDigits,
        cardLabel: cardOf(committed, row.cardId).label,
        chargeDate: row.chargeDate,
        statedTotalMinorUnits: row.statedTotalMinor,
        currency: row.currency,
        transactionCount: committed.transactions.filter((item) => item.importId === row.id).length,
        importedAt: IMPORTED_AT.toISOString(),
      }));
      return Promise.resolve(rows);
    },

    listTransactions(window: MonthWindow | undefined) {
      const rows = committed.transactions
        .filter(
          (row) =>
            window === undefined ||
            (row.chargeDate >= window.start && row.chargeDate < window.endExclusive),
        )
        .map((row) => toStoredTransaction(committed, row));
      return Promise.resolve(rows);
    },

    listChargeTotals() {
      return Promise.resolve(
        options.chargeTotals ??
          committed.transactions.map((row) => ({
            chargeDate: row.chargeDate,
            billedMinor: row.billedMinor,
            billedCurrency: row.billedCurrency,
          })),
      );
    },
  };

  return {
    storage,
    state: () => committed,
    async seedTransaction(card, reference) {
      await storage.runInTransaction(async (writer) => {
        const cardId = await writer.upsertCard(card);
        const importId = await writer.insertImport({
          cardId,
          chargeDate: "2026-07-15",
          sourceHash: `seed-${reference}`,
          parser: "isracard",
          parserVersion: "1",
          statedTotalMinor: 0,
          currency: "ILS",
          warnings: [],
        });
        await writer.insertTransactions([
          {
            importId,
            cardId,
            reference,
            purchaseDate: "2026-07-01",
            chargeDate: "2026-07-15",
            merchant: "seeded",
            kind: "purchase",
            originalMinor: 100,
            originalCurrency: "ILS",
            billedMinor: 100,
            billedCurrency: "ILS",
            installmentNumber: null,
            installmentTotal: null,
            installmentIsFinal: false,
            discountMinor: null,
            tags: [],
          },
        ]);
      });
    },
  };
}

const CARD = {
  issuer: "isracard",
  lastDigits: FIXTURE.cardLastDigits,
  label: FIXTURE.cardLabel,
} as const;

function serviceWith(options: FakeOptions = {}) {
  const fake = createFakeStorage(options);
  return { fake, service: createImportServiceOver(fake.storage) };
}

function chargeFilterOf(imports: readonly StoredImport[]): TransactionFilter {
  const record = imports[0];
  if (record === undefined) throw new Error("expected an import");
  const [year, month] = record.chargeDate.split("-");
  return { year: Number.parseInt(year ?? "", 10), month: Number.parseInt(month ?? "", 10) };
}

describe("preview", () => {
  it("hashes the upload and classifies every parsed row as new when nothing is stored", async () => {
    const { service } = serviceWith();
    const preview = await service.preview(upload);

    expect(preview.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(preview.sourceHash).toBe(hashUpload(upload));
    expect(preview.metadata.cardLastDigits).toBe(FIXTURE.cardLastDigits);
    expect(preview.counts).toEqual({
      total: preview.transactions.length,
      new: preview.transactions.length,
      duplicates: 0,
    });
  });

  it("marks a row duplicate when the same card and reference are already stored", async () => {
    const { fake, service } = serviceWith();
    await fake.seedTransaction(CARD, FIXTURE.references.shekelPurchase);

    const preview = await service.preview(upload);
    const duplicates = preview.transactions.filter((row) => row.status === "duplicate");

    expect(duplicates.map((row) => row.reference)).toEqual([FIXTURE.references.shekelPurchase]);
    expect(preview.counts.duplicates).toBe(1);
    expect(preview.counts.new).toBe(preview.counts.total - 1);
  });

  it("persists nothing", async () => {
    const { fake, service } = serviceWith();
    await service.preview(upload);
    expect(fake.state()).toEqual({ cards: [], imports: [], transactions: [] });
  });

  it("rejects a file that is not a statement", async () => {
    const { service } = serviceWith();
    await expect(service.preview(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});

describe("commit", () => {
  it("stores the card, the import, and every row in one unit of work", async () => {
    const { fake, service } = serviceWith();
    const result = await service.commit(upload);

    expect(result.status).toBe("imported");
    if (result.status !== "imported") throw new Error("expected an import");
    expect(result.skippedDuplicates).toBe(0);
    expect(fake.state().cards).toHaveLength(1);
    expect(fake.state().imports).toHaveLength(1);
    expect(fake.state().transactions).toHaveLength(result.inserted);
    expect(fake.state().imports[0]?.parser).toBe("isracard");
    expect(fake.state().imports[0]?.parserVersion).toBe("1");
    expect(fake.state().imports[0]?.sourceHash).toBe(hashUpload(upload));
  });

  it("skips and counts rows whose card and reference are already stored", async () => {
    const { fake, service } = serviceWith();
    await fake.seedTransaction(CARD, FIXTURE.references.midInstallment);
    const before = fake.state().transactions.length;

    const result = await service.commit(upload);

    if (result.status !== "imported") throw new Error("expected an import");
    expect(result.skippedDuplicates).toBe(1);
    expect(fake.state().transactions).toHaveLength(before + result.inserted);
    const references = fake.state().transactions.map((row) => row.reference);
    expect(new Set(references).size).toBe(references.length);
  });

  it("treats identical bytes as already imported and changes nothing", async () => {
    const { fake, service } = serviceWith();
    const first = await service.commit(upload);
    const after = fake.state();

    const second = await service.commit(Uint8Array.from(upload));

    expect(second).toEqual({ status: "already_imported", importId: first.importId });
    expect(fake.state()).toEqual(after);
  });

  it("records nothing when a write fails part-way through", async () => {
    const { fake, service } = serviceWith({ failTransactionInsert: true });

    await expect(service.commit(upload)).rejects.toThrow(/storage failure/);

    expect(fake.state()).toEqual({ cards: [], imports: [], transactions: [] });
    expect(await service.preview(upload)).toMatchObject({ counts: { duplicates: 0 } });
  });

  it("maps installments, discounts, and refunds onto the stored row", async () => {
    const { service } = serviceWith();
    await service.commit(upload);
    const stored = await service.listTransactions({});
    const byReference = new Map(stored.map((row) => [row.reference, row]));

    expect(byReference.get(FIXTURE.references.finalInstallment)).toMatchObject({
      kind: "installment",
      installmentNumber: 2,
      installmentTotal: 2,
      installmentIsFinal: true,
      cardLastDigits: FIXTURE.cardLastDigits,
    });
    expect(byReference.get(FIXTURE.references.midInstallment)).toMatchObject({
      installmentNumber: 2,
      installmentTotal: 3,
      installmentIsFinal: false,
    });
    expect(byReference.get(FIXTURE.references.foreignPurchase)).toMatchObject({
      discountMinorUnits: 60,
      originalCurrency: "USD",
      billedCurrency: "ILS",
    });
    expect(byReference.get(FIXTURE.references.refund)?.kind).toBe("refund");
    expect(byReference.get(FIXTURE.references.refund)?.billedMinorUnits).toBeLessThan(0);
  });
});

describe("listImports", () => {
  it("reports the stated total and the number of stored rows", async () => {
    const { service } = serviceWith();
    const result = await service.commit(upload);
    if (result.status !== "imported") throw new Error("expected an import");

    const [record, ...rest] = await service.listImports();
    expect(rest).toHaveLength(0);
    expect(record?.cardLastDigits).toBe(FIXTURE.cardLastDigits);
    expect(record?.transactionCount).toBe(result.inserted);
    expect(record?.statedTotalMinorUnits).toBe(
      Number.parseInt(FIXTURE.statedTotal.replace(/[,.]/g, ""), 10),
    );
  });
});

describe("listTransactions", () => {
  it("returns everything when no month is given", async () => {
    const { service } = serviceWith();
    const result = await service.commit(upload);
    if (result.status !== "imported") throw new Error("expected an import");

    expect(await service.listTransactions({})).toHaveLength(result.inserted);
  });

  it("filters by the charge month", async () => {
    const { service } = serviceWith();
    const result = await service.commit(upload);
    if (result.status !== "imported") throw new Error("expected an import");
    const filter = chargeFilterOf(await service.listImports());

    expect(await service.listTransactions(filter)).toHaveLength(result.inserted);

    const previousMonth =
      filter.month === 1
        ? { year: (filter.year ?? 0) - 1, month: 12 }
        : { year: filter.year, month: (filter.month ?? 1) - 1 };
    expect(await service.listTransactions(previousMonth)).toHaveLength(0);
  });

  it("rejects a half-filled filter", async () => {
    const { service } = serviceWith();
    await expect(service.listTransactions({ year: 2026 })).rejects.toThrow("invalid_filter");
    await expect(service.listTransactions({ month: 8 })).rejects.toThrow("invalid_filter");
    await expect(service.listTransactions({ year: 2026, month: 13 })).rejects.toThrow(
      "invalid_filter",
    );
  });
});

describe("monthlySummary", () => {
  const totals: readonly ChargeTotalRow[] = [
    { chargeDate: "2026-08-15", billedMinor: 10_000, billedCurrency: "ILS" },
    { chargeDate: "2026-08-15", billedMinor: -2_500, billedCurrency: "ILS" },
    { chargeDate: "2026-07-15", billedMinor: 4_000, billedCurrency: "ILS" },
    { chargeDate: "2026-06-15", billedMinor: 1_000, billedCurrency: "ILS" },
  ];

  it("totals each charge month, newest first", async () => {
    const { service } = serviceWith({ chargeTotals: totals });

    expect(await service.monthlySummary(12)).toEqual([
      { month: "2026-08", billedMinorUnits: 7_500, currency: "ILS", transactionCount: 2 },
      { month: "2026-07", billedMinorUnits: 4_000, currency: "ILS", transactionCount: 1 },
      { month: "2026-06", billedMinorUnits: 1_000, currency: "ILS", transactionCount: 1 },
    ]);
  });

  it("keeps only the newest months up to the limit", async () => {
    const { service } = serviceWith({ chargeTotals: totals });
    expect((await service.monthlySummary(2)).map((entry) => entry.month)).toEqual([
      "2026-08",
      "2026-07",
    ]);
    expect(await service.monthlySummary(0)).toEqual([]);
  });

  it("never adds different currencies together", () => {
    const mixed: readonly ChargeTotalRow[] = [
      { chargeDate: "2026-08-15", billedMinor: 10_000, billedCurrency: "ILS" },
      { chargeDate: "2026-08-15", billedMinor: 2_000, billedCurrency: "USD" },
    ];
    expect(summariseByMonth(mixed, 6)).toEqual([
      { month: "2026-08", billedMinorUnits: 10_000, currency: "ILS", transactionCount: 1 },
      { month: "2026-08", billedMinorUnits: 2_000, currency: "USD", transactionCount: 1 },
    ]);
  });

  it("summarises what was actually committed", async () => {
    const { service } = serviceWith();
    await service.commit(upload);
    const [summary, ...rest] = await service.monthlySummary(12);
    const [record] = await service.listImports();

    expect(rest).toHaveLength(0);
    expect(summary?.month).toBe(chargeMonthOf(record?.chargeDate ?? ""));
    expect(summary?.billedMinorUnits).toBe(record?.statedTotalMinorUnits);
  });
});

describe("resolveMonthWindow", () => {
  it("is undefined when neither bound is given", () => {
    expect(resolveMonthWindow({})).toBeUndefined();
  });

  it("returns a half-open window that rolls over at the end of the year", () => {
    expect(resolveMonthWindow({ year: 2026, month: 8 })).toEqual({
      start: "2026-08-01",
      endExclusive: "2026-09-01",
    });
    expect(resolveMonthWindow({ year: 2026, month: 12 })).toEqual({
      start: "2026-12-01",
      endExclusive: "2027-01-01",
    });
  });

  it("rejects a month outside the calendar", () => {
    expect(() => resolveMonthWindow({ year: 2026, month: 0 })).toThrow("invalid_filter");
    expect(() => resolveMonthWindow({ year: 2026.5, month: 8 })).toThrow("invalid_filter");
  });
});
