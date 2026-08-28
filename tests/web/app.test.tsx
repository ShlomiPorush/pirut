// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/web/App.tsx";
import en from "../../src/locales/en/common.json" with { type: "json" };
import he from "../../src/locales/he/common.json" with { type: "json" };

// The shell imports the Better Auth client for sign-out, so the library is replaced here to
// keep the shell tests about the shell.
const authClient = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithPasskey: vi.fn(),
  signOut: vi.fn(async () => undefined),
  passkeyAutofillAvailable: vi.fn(async () => false),
  listPasskeys: vi.fn(async () => ({ ok: true, value: [] })),
  addPasskey: vi.fn(),
  removePasskey: vi.fn(),
}));

vi.mock("../../src/web/auth-client.ts", () => authClient);

const MEMBER = { id: "member-1", name: "Dana", email: "dana@example.test" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A signed-in shell with an answer for every call the first screen makes. */
function mockApi(health: "ready" | "degraded"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith("/api/setup/status")) {
        return json({ needsFirstUser: false, user: MEMBER });
      }
      if (url.startsWith("/api/health")) {
        return json({ status: health });
      }
      return json({ months: [] });
    }),
  );
}

beforeEach(() => {
  globalThis.localStorage.clear();
  mockApi("ready");
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
    mockApi("degraded");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(he.status.degraded)).toBeTruthy();
    });
    expect(screen.getByText(new RegExp(he.status.databaseDisconnected))).toBeTruthy();
  });

  it("names the signed-in member and offers a way out", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(he.auth.signedInAs.replace("{{name}}", MEMBER.name))).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: he.nav.settings })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: he.auth.signOut }));

    await waitFor(() => {
      expect(screen.getByText(he.auth.loginIntro)).toBeTruthy();
    });
    expect(authClient.signOut).toHaveBeenCalled();
  });
});
