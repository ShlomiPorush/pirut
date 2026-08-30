// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InsightsReport } from "../../src/application/insight-contracts.ts";
import he from "../../src/locales/he/common.json" with { type: "json" };
import App from "../../src/web/App.tsx";
import { formatMoney } from "../../src/web/format.ts";

vi.mock("../../src/web/auth-client.ts", () => ({
  signInWithPassword: vi.fn(),
  signInWithPasskey: vi.fn(),
  signOut: vi.fn(async () => undefined),
  passkeyAutofillAvailable: vi.fn(async () => false),
  listPasskeys: vi.fn(async () => ({ ok: true, value: [] })),
  addPasskey: vi.fn(),
  removePasskey: vi.fn(),
}));

const MEMBER = { id: "member-1", name: "Dana", email: "dana@example.test" };

const REPORT: InsightsReport = {
  latestChargeMonth: "2026-08",
  importedMonthCount: 4,
  recurringCharges: [
    {
      merchant: "Cloud Storage",
      cardLastDigits: "1234",
      occurrenceCount: 4,
      latestChargeDate: "2026-08-15",
      amountPattern: "stable",
      comparisonAmount: { minorUnits: 999, currency: "USD" },
      latestBilledAmount: { minorUnits: 3_650, currency: "ILS" },
    },
  ],
  recurringAmountChanges: [
    {
      merchant: "Music Service",
      cardLastDigits: "1234",
      previousChargeDate: "2026-07-15",
      currentChargeDate: "2026-08-15",
      previousAmount: { minorUnits: 2_000, currency: "ILS" },
      currentAmount: { minorUnits: 2_500, currency: "ILS" },
      currentBilledAmount: { minorUnits: 2_500, currency: "ILS" },
    },
  ],
  suspectedDuplicateCharges: [
    {
      merchant: "Online Shop",
      cardLastDigits: "1234",
      purchaseDate: "2026-08-04",
      chargeDate: "2026-08-15",
      comparisonAmount: { minorUnits: 12_000, currency: "ILS" },
      transactionIds: [41, 42],
    },
  ],
  stoppedRecurringCharges: [
    {
      merchant: "Old Subscription",
      cardLastDigits: "1234",
      lastChargeDate: "2026-07-15",
      expectedMonth: "2026-08",
      lastComparisonAmount: { minorUnits: 4_500, currency: "ILS" },
    },
  ],
  installmentCommitments: [
    {
      transactionId: 51,
      merchant: "Furniture Store",
      cardLastDigits: "1234",
      purchaseDate: "2026-06-08",
      chargeDate: "2026-08-15",
      originalAmount: { minorUnits: 240_000, currency: "ILS" },
      currentBilledAmount: { minorUnits: 40_000, currency: "ILS" },
      installmentNumber: 2,
      installmentTotal: 6,
      remainingPayments: 4,
      estimatedRemainingAmount: { minorUnits: 160_000, currency: "ILS" },
    },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubApi(report: InsightsReport, insightStatus = 200): string[] {
  const requested: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      requested.push(url);
      if (url.startsWith("/api/setup/status")) {
        return json({ needsFirstUser: false, user: MEMBER });
      }
      if (url.startsWith("/api/health")) return json({ status: "ready" });
      if (url.startsWith("/api/insights")) return json(report, insightStatus);
      return json({ error: "internal" }, 500);
    }),
  );
  return requested;
}

beforeEach(() => {
  globalThis.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("insights view", () => {
  it("is the landing view and presents review items, recurring charges, and commitments", async () => {
    const requested = stubApi(REPORT);
    render(<App />);

    expect(await screen.findByRole("heading", { name: he.insights.heading })).toBeTruthy();
    expect(requested).toContain("/api/insights");

    expect(await screen.findByText("Music Service")).toBeTruthy();
    expect(screen.getByText(he.insights.suspectedDuplicate)).toBeTruthy();
    expect(screen.getByText("Old Subscription")).toBeTruthy();
    const recurring = screen.getByText("Cloud Storage").closest("article");
    expect(recurring?.textContent).toContain(formatMoney("he", 999, "USD"));
    expect(recurring?.textContent).toContain(formatMoney("he", 3_650, "ILS"));

    const commitment = screen.getByText("Furniture Store").closest("article");
    expect(commitment?.textContent).toContain(formatMoney("he", 240_000, "ILS"));
    expect(commitment?.textContent).toContain(formatMoney("he", 40_000, "ILS"));
    expect(commitment?.textContent).toContain(formatMoney("he", 160_000, "ILS"));
    expect(commitment?.textContent).toContain("4");
  });

  it("explains that recurring analysis needs more history", async () => {
    stubApi({
      ...REPORT,
      importedMonthCount: 1,
      recurringCharges: [],
      recurringAmountChanges: [],
      suspectedDuplicateCharges: [],
      stoppedRecurringCharges: [],
      installmentCommitments: [],
    });
    render(<App />);

    expect(await screen.findByText(he.insights.moreHistoryNeeded)).toBeTruthy();
    expect(screen.getByText(he.insights.recurringNeedsHistory)).toBeTruthy();
  });

  it("takes an empty household directly to statement import", async () => {
    stubApi({
      ...REPORT,
      latestChargeMonth: null,
      importedMonthCount: 0,
      recurringCharges: [],
      recurringAmountChanges: [],
      suspectedDuplicateCharges: [],
      stoppedRecurringCharges: [],
      installmentCommitments: [],
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: he.insights.goToImport }));
    await waitFor(() => {
      expect(screen.getByText(he.import.fileHint)).toBeTruthy();
    });
  });

  it("uses a truthful localized message when insights cannot be loaded", async () => {
    stubApi(REPORT, 500);
    render(<App />);

    expect((await screen.findByRole("alert")).textContent).toBe(he.insights.loadError);
  });
});
