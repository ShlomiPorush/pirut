// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/web/App.tsx";
import he from "../../src/locales/he/common.json" with { type: "json" };

// The shell imports the Better Auth client, which has no place in a transactions test.
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const MONTHS = [
  { month: "2026-08", billedMinorUnits: 452310, currency: "ILS", transactionCount: 24 },
  { month: "2026-07", billedMinorUnits: 388050, currency: "ILS", transactionCount: 19 },
];

const AUGUST_ROWS = [
  {
    id: 1,
    importId: 3,
    cardLastDigits: "1234",
    purchaseDate: "2026-07-14",
    chargeDate: "2026-08-02",
    merchant: "Coffee Bar",
    kind: "purchase",
    originalMinorUnits: 1850,
    originalCurrency: "ILS",
    billedMinorUnits: 1850,
    billedCurrency: "ILS",
    installmentNumber: null,
    installmentTotal: null,
    installmentIsFinal: false,
    discountMinorUnits: null,
    reference: "REF-1",
    tags: ["contactless"],
  },
  {
    id: 2,
    importId: 3,
    cardLastDigits: "1234",
    purchaseDate: "2026-07-20",
    chargeDate: "2026-08-02",
    merchant: "Airline",
    kind: "installment",
    originalMinorUnits: 240000,
    originalCurrency: "ILS",
    billedMinorUnits: 40000,
    billedCurrency: "ILS",
    installmentNumber: 2,
    installmentTotal: 6,
    installmentIsFinal: false,
    discountMinorUnits: null,
    reference: "REF-2",
    tags: [],
  },
  {
    id: 3,
    importId: 3,
    cardLastDigits: "1234",
    purchaseDate: "2026-07-22",
    chargeDate: "2026-08-02",
    merchant: "Electronics Store",
    kind: "refund",
    originalMinorUnits: -12000,
    originalCurrency: "ILS",
    billedMinorUnits: -12000,
    billedCurrency: "ILS",
    installmentNumber: null,
    installmentTotal: null,
    installmentIsFinal: false,
    discountMinorUnits: null,
    reference: "REF-3",
    tags: ["refund-marker"],
  },
];

let requested: string[] = [];

function stubApi(handler: (url: string) => Response): void {
  requested = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      requested.push(url);
      return handler(url);
    }),
  );
}

function defaultHandler(url: string): Response {
  if (url.startsWith("/api/setup/status")) {
    return json({ needsFirstUser: false, user: MEMBER });
  }
  if (url.startsWith("/api/health")) {
    return json({ status: "ready" });
  }
  if (url.startsWith("/api/summary")) {
    return json({ months: MONTHS });
  }
  if (url.startsWith("/api/transactions")) {
    return json({ transactions: url.includes("month=8") ? AUGUST_ROWS : [] });
  }
  return json({ error: "internal" }, 500);
}

/** Built through Intl rather than written out, so this file stays free of Hebrew. */
function hebrewMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat("he", { year: "numeric", month: "long" }).format(
    new Date(year, month - 1, 1),
  );
}

beforeEach(() => {
  globalThis.localStorage.clear();
  stubApi(defaultHandler);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("transactions view", () => {
  it("opens on the recent months and drills into one", async () => {
    const user = userEvent.setup();
    render(<App />);

    const august = await screen.findByRole("button", {
      name: new RegExp(hebrewMonth(2026, 8)),
    });
    expect(screen.getByText(he.transactions.selectMonth)).toBeTruthy();
    expect(requested.some((url) => url === "/api/summary?months=12")).toBe(true);

    await user.click(august);

    await waitFor(() => {
      expect(screen.getByText("Coffee Bar")).toBeTruthy();
    });
    expect(requested.some((url) => url === "/api/transactions?year=2026&month=8")).toBe(true);
    expect(august.getAttribute("aria-pressed")).toBe("true");

    // Installments and issuer tags reach the table as they arrived.
    expect(screen.getByText("2/6")).toBeTruthy();
    expect(screen.getByText("contactless")).toBeTruthy();

    // A refund is set apart from a charge rather than reading as another expense.
    const refundCell = screen
      .getByText("Electronics Store")
      .closest("tr")
      ?.querySelector("td + td + td");
    expect(refundCell?.className).toContain("table__amount--refund");
  });

  it("formats a charge date without shifting it across time zones", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: new RegExp(hebrewMonth(2026, 8)) }));

    const expected = new Intl.DateTimeFormat("he", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(2026, 6, 14));
    await waitFor(() => {
      expect(screen.getByText(expected)).toBeTruthy();
    });
  });

  it("invites an import when nothing has been imported yet", async () => {
    stubApi((url) => (url.startsWith("/api/summary") ? json({ months: [] }) : defaultHandler(url)));
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(he.transactions.noDataYet)).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: he.transactions.goToImport }));
    expect(screen.getByText(he.import.fileHint)).toBeTruthy();
  });

  it("says a month is empty rather than showing a blank table", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: new RegExp(hebrewMonth(2026, 7)) }));

    await waitFor(() => {
      expect(screen.getByText(he.transactions.emptyMonth)).toBeTruthy();
    });
  });

  it("explains a failed month load with a localized message", async () => {
    stubApi((url) =>
      url.startsWith("/api/transactions")
        ? json({ error: "invalid_filter" }, 400)
        : defaultHandler(url),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: new RegExp(hebrewMonth(2026, 8)) }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(he.errors.invalidFilter);
    });
  });
});
