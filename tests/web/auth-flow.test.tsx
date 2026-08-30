// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/web/App.tsx";
import { MIN_PASSWORD_LENGTH } from "../../src/application/auth-contracts.ts";
import he from "../../src/locales/he/common.json" with { type: "json" };

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

/** Long enough to pass the client-side rule without hard-coding the number. */
const PASSWORD = "a".repeat(MIN_PASSWORD_LENGTH);

type Route = { url: string; init?: RequestInit };

let routes: Route[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubApi(handler: (url: string, init?: RequestInit) => Response): void {
  routes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      routes.push({ url, init });
      return handler(url, init);
    }),
  );
}

function baseHandler(url: string): Response {
  if (url.startsWith("/api/health")) {
    return json({ status: "ready" });
  }
  if (url.startsWith("/api/summary")) {
    return json({ months: [] });
  }
  return json({ error: "internal" }, 500);
}

function signedIn(url: string): Response {
  return url.startsWith("/api/setup/status")
    ? json({ needsFirstUser: false, user: MEMBER })
    : baseHandler(url);
}

function signedOut(url: string): Response {
  return url.startsWith("/api/setup/status")
    ? json({ needsFirstUser: false, user: null })
    : baseHandler(url);
}

function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, value),
    template,
  );
}

beforeEach(() => {
  globalThis.localStorage.clear();
  vi.clearAllMocks();
  authClient.passkeyAutofillAvailable.mockResolvedValue(false);
  authClient.listPasskeys.mockResolvedValue({ ok: true, value: [] });
  stubApi(signedIn);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("first-run setup", () => {
  it("creates the first account and lets the new member straight in", async () => {
    let created = false;
    stubApi((url) => {
      if (url.startsWith("/api/setup/status")) {
        return created
          ? json({ needsFirstUser: false, user: MEMBER })
          : json({ needsFirstUser: true, user: null });
      }
      if (url === "/api/setup/first-user") {
        created = true;
        return json({ user: MEMBER });
      }
      return baseHandler(url);
    });
    const user = userEvent.setup();
    render(<App />);

    // The screen says what the form is for before anything is typed into it.
    await screen.findByText(he.auth.setupIntro);

    await user.type(screen.getByLabelText(he.auth.nameLabel), MEMBER.name);
    await user.type(screen.getByLabelText(he.auth.emailLabel), MEMBER.email);
    await user.type(screen.getByLabelText(he.auth.passwordLabel), PASSWORD);
    await user.type(screen.getByLabelText(he.auth.confirmLabel), PASSWORD);
    await user.click(screen.getByRole("button", { name: he.auth.createAccount }));

    await waitFor(() => {
      expect(screen.getByText(interpolate(he.auth.signedInAs, { name: MEMBER.name }))).toBeTruthy();
    });

    const call = routes.find((route) => route.url === "/api/setup/first-user");
    expect(call?.init?.method).toBe("POST");
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      name: MEMBER.name,
      email: MEMBER.email,
      password: PASSWORD,
    });
  });

  it("refuses a password the server would reject anyway", async () => {
    stubApi((url) =>
      url.startsWith("/api/setup/status")
        ? json({ needsFirstUser: true, user: null })
        : baseHandler(url),
    );
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(he.auth.setupIntro);
    await user.type(screen.getByLabelText(he.auth.nameLabel), MEMBER.name);
    await user.type(screen.getByLabelText(he.auth.emailLabel), MEMBER.email);
    await user.type(screen.getByLabelText(he.auth.passwordLabel), "short");
    await user.type(screen.getByLabelText(he.auth.confirmLabel), "short");
    await user.click(screen.getByRole("button", { name: he.auth.createAccount }));

    expect(screen.getByRole("alert").textContent).toBe(
      interpolate(he.errors.weakPassword, { min: String(MIN_PASSWORD_LENGTH) }),
    );
    expect(routes.some((route) => route.url === "/api/setup/first-user")).toBe(false);
  });
});

describe("sign-in", () => {
  it("opens on the sign-in form when no session exists", async () => {
    stubApi(signedOut);
    render(<App />);

    await screen.findByText(he.auth.loginIntro);
    // The public health panel keeps working on the sign-in screen.
    await waitFor(() => {
      expect(screen.getByText(he.status.ready)).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: he.nav.import })).toBeNull();
  });

  it("says what to do when the password is wrong, in the viewer's language", async () => {
    stubApi(signedOut);
    authClient.signInWithPassword.mockResolvedValue({
      ok: false,
      failure: { code: "INVALID_EMAIL_OR_PASSWORD", status: 401 },
    });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(he.auth.loginIntro);
    await user.type(screen.getByLabelText(he.auth.emailLabel), MEMBER.email);
    await user.type(screen.getByLabelText(he.auth.passwordLabel), "wrong-password");
    await user.click(screen.getByRole("button", { name: he.auth.signIn }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(he.errors.invalidCredentials);
    });
    expect(authClient.signInWithPassword).toHaveBeenCalledWith(MEMBER.email, "wrong-password");
  });

  it("signs in with a passkey and shows the application", async () => {
    let session: typeof MEMBER | null = null;
    stubApi((url) =>
      url.startsWith("/api/setup/status")
        ? json({ needsFirstUser: false, user: session })
        : baseHandler(url),
    );
    authClient.signInWithPasskey.mockImplementation(async () => {
      session = MEMBER;
      return { ok: true, value: undefined };
    });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(he.auth.loginIntro);
    await user.click(screen.getByRole("button", { name: he.auth.passkeySignIn }));

    await waitFor(() => {
      expect(screen.getByText(interpolate(he.auth.signedInAs, { name: MEMBER.name }))).toBeTruthy();
    });
  });

  it("explains a cancelled passkey prompt rather than showing the library message", async () => {
    stubApi(signedOut);
    authClient.signInWithPasskey.mockResolvedValue({
      ok: false,
      failure: { code: "AUTH_CANCELLED", status: 400 },
    });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(he.auth.loginIntro);
    await user.click(screen.getByRole("button", { name: he.auth.passkeySignIn }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(he.errors.passkeyCancelled);
    });
  });
});

describe("an expired session", () => {
  it("returns the viewer to sign-in when a data call is refused", async () => {
    stubApi((url) =>
      url.startsWith("/api/insights") ? json({ error: "unauthorized" }, 401) : signedIn(url),
    );
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(he.auth.loginIntro)).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: he.nav.import })).toBeNull();
  });
});
