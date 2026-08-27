// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/web/App.tsx";
import en from "../../src/locales/en/common.json" with { type: "json" };
import he from "../../src/locales/he/common.json" with { type: "json" };

function mockHealth(status: "ready" | "degraded"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ status }), { status: 200 })),
  );
}

beforeEach(() => {
  globalThis.localStorage.clear();
  mockHealth("ready");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("application shell", () => {
  it("renders Hebrew right-to-left by default", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(he.app.name);
    });
    expect(document.documentElement.lang).toBe("he");
    expect(document.documentElement.dir).toBe("rtl");
    await waitFor(() => {
      expect(screen.getByText(he.status.ready)).toBeTruthy();
    });
  });

  it("switches to English left-to-right when the locale is changed", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByRole("combobox", { name: he.settings.language }), "en");

    await waitFor(() => {
      expect(document.documentElement.dir).toBe("ltr");
    });
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(en.app.name);
  });

  it("applies the dark theme when the preference is selected", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: he.settings.theme }),
      he.settings.themeDark,
    );

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
  });

  it("shows the degraded message when the database is unavailable", async () => {
    mockHealth("degraded");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(he.status.degraded)).toBeTruthy();
    });
    expect(screen.getByText(new RegExp(he.status.databaseDisconnected))).toBeTruthy();
  });
});
