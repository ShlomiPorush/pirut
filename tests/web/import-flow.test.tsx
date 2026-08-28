// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/web/App.tsx";
import he from "../../src/locales/he/common.json" with { type: "json" };

// The shell imports the Better Auth client, which has no place in an import test.
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

type Route = { url: string; init?: RequestInit };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CHARGE_DATE = { year: 2026, month: 8, day: 2 };

const PREVIEW = {
  metadata: {
    issuer: "isracard",
    cardLastDigits: "1234",
    cardLabel: "Direct",
    chargeDate: CHARGE_DATE,
    statedTotal: { minorUnits: 123456, currency: "ILS" },
  },
  transactions: [
    {
      purchaseDate: { year: 2026, month: 7, day: 14 },
      chargeDate: CHARGE_DATE,
      merchant: "Coffee Bar",
      kind: "purchase",
      originalAmount: { minorUnits: 1850, currency: "ILS" },
      billedAmount: { minorUnits: 1850, currency: "ILS" },
      reference: "REF-1",
      tags: [],
      status: "new",
    },
    {
      purchaseDate: { year: 2026, month: 7, day: 20 },
      chargeDate: CHARGE_DATE,
      merchant: "Airline",
      kind: "installment",
      originalAmount: { minorUnits: 240000, currency: "ILS" },
      billedAmount: { minorUnits: 40000, currency: "ILS" },
      installment: { number: 2, total: 6, isFinal: false },
      reference: "REF-2",
      tags: ["installments"],
      status: "duplicate",
    },
  ],
  warnings: ["Exchange rate was inferred"],
  sourceHash: "9f2c",
  counts: { total: 2, new: 1, duplicates: 1 },
};

let routes: Route[] = [];

/** Routes every request by URL so one stub serves health, summary, and the upload endpoints. */
function stubApi(handler: (url: string) => Response): void {
  routes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      routes.push({ url, init });
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
    return json({ months: [] });
  }
  if (url === "/api/imports/preview") {
    return json(PREVIEW);
  }
  if (url === "/api/imports/commit") {
    return json({ status: "imported", importId: 7, inserted: 1, skippedDuplicates: 1 });
  }
  return json({ error: "internal" }, 500);
}

function statementFile(): File {
  return new File(["statement-bytes"], "statement.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function openImportView(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  render(<App />);
  // The navigation appears only once the shell knows a member is signed in.
  await user.click(await screen.findByRole("button", { name: he.nav.import }));
  return user;
}

function summaryValue(term: string): string {
  const definition = screen.getByText(term).parentElement?.querySelector("dd");
  return definition?.textContent ?? "";
}

beforeEach(() => {
  globalThis.localStorage.clear();
  stubApi(defaultHandler);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("statement import", () => {
  it("previews a chosen file and imports it", async () => {
    const user = await openImportView();

    await user.upload(screen.getByLabelText(he.import.fileLabel), statementFile());

    await waitFor(() => {
      expect(screen.getByText(he.import.previewHeading)).toBeTruthy();
    });

    // The upload travels as multipart under the field the API reads.
    const previewCall = routes.find((route) => route.url === "/api/imports/preview");
    expect(previewCall).toBeTruthy();
    const body = previewCall?.init?.body;
    expect(body instanceof FormData).toBe(true);
    expect((body as FormData).get("statement")).toBeInstanceOf(File);

    expect(summaryValue(he.import.newCount)).toBe("1");
    expect(summaryValue(he.import.duplicateCount)).toBe("1");
    expect(summaryValue(he.import.totalCount)).toBe("2");
    expect(screen.getByText("Coffee Bar")).toBeTruthy();
    expect(screen.getByText("2/6")).toBeTruthy();
    expect(screen.getByText(PREVIEW.warnings[0] as string)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: he.import.commit }));

    await waitFor(() => {
      expect(
        screen.getByText(
          he.import.importedResult.replace("{{inserted}}", "1").replace("{{skipped}}", "1"),
        ),
      ).toBeTruthy();
    });
    expect(routes.some((route) => route.url === "/api/imports/commit")).toBe(true);
  });

  it("marks an already stored row as a duplicate and mutes it", async () => {
    const user = await openImportView();

    await user.upload(screen.getByLabelText(he.import.fileLabel), statementFile());

    await waitFor(() => {
      expect(screen.getByText(he.import.statusDuplicate)).toBeTruthy();
    });
    expect(screen.getByText(he.import.statusNew)).toBeTruthy();

    const duplicateRow = screen.getByText("Airline").closest("tr");
    expect(duplicateRow?.className).toContain("table__row--muted");
    const newRow = screen.getByText("Coffee Bar").closest("tr");
    expect(newRow?.className ?? "").not.toContain("table__row--muted");
  });

  it("reports that the same file was already imported", async () => {
    stubApi((url) =>
      url === "/api/imports/commit"
        ? json({ status: "already_imported", importId: 7 })
        : defaultHandler(url),
    );
    const user = await openImportView();

    await user.upload(screen.getByLabelText(he.import.fileLabel), statementFile());
    await waitFor(() => {
      expect(screen.getByText(he.import.previewHeading)).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: he.import.commit }));

    await waitFor(() => {
      expect(screen.getByText(he.import.alreadyImportedResult)).toBeTruthy();
    });
  });

  it("refuses to commit when every row is already stored", async () => {
    stubApi((url) =>
      url === "/api/imports/preview"
        ? json({ ...PREVIEW, counts: { total: 2, new: 0, duplicates: 2 } })
        : defaultHandler(url),
    );
    const user = await openImportView();

    await user.upload(screen.getByLabelText(he.import.fileLabel), statementFile());

    await waitFor(() => {
      expect(screen.getByText(he.import.nothingToImport)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: he.import.commit }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("turns an API error code into a localized explanation", async () => {
    stubApi((url) =>
      url === "/api/imports/preview"
        ? json({ error: "statement_does_not_reconcile", detail: "sum mismatch" }, 422)
        : defaultHandler(url),
    );
    const user = await openImportView();

    await user.upload(screen.getByLabelText(he.import.fileLabel), statementFile());

    await waitFor(() => {
      expect(within(screen.getByRole("alert")).getByText(he.errors.statementDoesNotReconcile));
    });
    expect(screen.queryByText(he.import.previewHeading)).toBeNull();
  });

  it("explains an unreachable server instead of failing silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url === "/api/imports/preview") {
          throw new TypeError("Failed to fetch");
        }
        return defaultHandler(url);
      }),
    );
    const user = await openImportView();

    await user.upload(screen.getByLabelText(he.import.fileLabel), statementFile());

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(he.errors.network);
    });
  });
});
