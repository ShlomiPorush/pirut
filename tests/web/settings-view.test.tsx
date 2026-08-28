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
  listPasskeys: vi.fn(),
  addPasskey: vi.fn(),
  removePasskey: vi.fn(),
}));

vi.mock("../../src/web/auth-client.ts", () => authClient);

const MEMBER = { id: "member-1", name: "Dana", email: "dana@example.test" };

const MEMBERS = [
  {
    id: "member-1",
    name: "Dana",
    email: "dana@example.test",
    createdAt: "2026-08-01T09:00:00.000Z",
    passkeyCount: 1,
  },
  {
    id: "member-2",
    name: "Yossi",
    email: "yossi@example.test",
    createdAt: "2026-08-02T09:00:00.000Z",
    passkeyCount: 0,
  },
];

const PASSKEY_CREATED = "2026-08-01T10:00:00.000Z";

const PASSKEYS = [{ id: "passkey-1", name: "Laptop", createdAt: PASSKEY_CREATED }];

type Route = { url: string; init?: RequestInit };

let routes: Route[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
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
  if (url === "/api/household/members") {
    return json({ members: MEMBERS });
  }
  return json({ error: "internal" }, 500);
}

function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, value),
    template,
  );
}

/** Built through Intl rather than written out, so this file stays free of Hebrew. */
function hebrewDate(value: string): string {
  return new Intl.DateTimeFormat("he", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

async function openSettings(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: he.nav.settings }));
  return user;
}

beforeEach(() => {
  globalThis.localStorage.clear();
  vi.clearAllMocks();
  authClient.passkeyAutofillAvailable.mockResolvedValue(false);
  authClient.listPasskeys.mockResolvedValue({ ok: true, value: PASSKEYS });
  authClient.addPasskey.mockResolvedValue({ ok: true, value: undefined });
  authClient.removePasskey.mockResolvedValue({ ok: true, value: undefined });
  stubApi(defaultHandler);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("passkey settings", () => {
  it("lists the registered passkeys with the date they were added", async () => {
    await openSettings();

    await waitFor(() => {
      expect(screen.getByText("Laptop")).toBeTruthy();
    });
    expect(
      screen.getByText(
        interpolate(he.settings.passkeyCreated, { date: hebrewDate(PASSKEY_CREATED) }),
      ),
    ).toBeTruthy();
    // The requirement that passkeys need a secure origin is stated, not left to be discovered.
    expect(screen.getAllByText(he.settings.passkeysNote).length).toBeGreaterThan(0);
  });

  it("registers a passkey under the name the member chose", async () => {
    const user = await openSettings();
    await screen.findByText("Laptop");

    await user.type(screen.getByLabelText(he.settings.passkeyNameLabel), "Phone");
    await user.click(screen.getByRole("button", { name: he.settings.addPasskey }));

    await waitFor(() => {
      expect(screen.getByText(he.settings.passkeyAdded)).toBeTruthy();
    });
    expect(authClient.addPasskey).toHaveBeenCalledWith("Phone");
  });

  it("explains a refused registration in the viewer's language", async () => {
    authClient.addPasskey.mockResolvedValue({
      ok: false,
      failure: { code: "PREVIOUSLY_REGISTERED", status: 400 },
    });
    const user = await openSettings();
    await screen.findByText("Laptop");

    await user.type(screen.getByLabelText(he.settings.passkeyNameLabel), "Phone");
    await user.click(screen.getByRole("button", { name: he.settings.addPasskey }));

    await waitFor(() => {
      expect(screen.getByText(he.errors.passkeyAlreadyRegistered)).toBeTruthy();
    });
  });

  it("removes a passkey through its own labelled button", async () => {
    const user = await openSettings();
    await screen.findByText("Laptop");

    await user.click(
      screen.getByRole("button", {
        name: interpolate(he.settings.removePasskeyLabel, { name: "Laptop" }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(he.settings.passkeyRemoved)).toBeTruthy();
    });
    expect(authClient.removePasskey).toHaveBeenCalledWith("passkey-1");
  });
});

describe("household settings", () => {
  it("lists every member with how many passkeys they registered", async () => {
    await openSettings();

    await waitFor(() => {
      expect(screen.getByText("Yossi")).toBeTruthy();
    });
    expect(screen.getByText(MEMBERS[0]!.email)).toBeTruthy();
    expect(screen.getByText(interpolate(he.settings.memberPasskeys, { value: "1" }))).toBeTruthy();
    expect(screen.getByText(interpolate(he.settings.memberPasskeys, { value: "0" }))).toBeTruthy();
  });

  it("adds a member and reports that they can now sign in", async () => {
    const user = await openSettings();
    await screen.findByText("Yossi");

    const form = screen
      .getByRole("heading", { name: he.settings.addMemberHeading })
      .closest("form");
    expect(form).toBeTruthy();
    await user.type(screen.getByLabelText(he.auth.nameLabel), "Noa");
    await user.type(screen.getByLabelText(he.auth.emailLabel), "noa@example.test");
    await user.type(screen.getByLabelText(he.auth.passwordLabel), "x".repeat(MIN_PASSWORD_LENGTH));
    await user.click(screen.getByRole("button", { name: he.settings.addMember }));

    await waitFor(() => {
      expect(screen.getByText(interpolate(he.settings.memberAdded, { name: "Noa" }))).toBeTruthy();
    });
    const call = routes.find(
      (route) => route.url === "/api/household/members" && route.init?.method === "POST",
    );
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      name: "Noa",
      email: "noa@example.test",
      password: "x".repeat(MIN_PASSWORD_LENGTH),
    });
  });

  it("maps a taken email address to a localized message", async () => {
    stubApi((url, init) =>
      url === "/api/household/members" && init?.method === "POST"
        ? json({ error: "member_exists" }, 409)
        : defaultHandler(url),
    );
    const user = await openSettings();
    await screen.findByText("Yossi");

    await user.type(screen.getByLabelText(he.auth.nameLabel), "Noa");
    await user.type(screen.getByLabelText(he.auth.emailLabel), MEMBER.email);
    await user.type(screen.getByLabelText(he.auth.passwordLabel), "x".repeat(MIN_PASSWORD_LENGTH));
    await user.click(screen.getByRole("button", { name: he.settings.addMember }));

    await waitFor(() => {
      expect(screen.getByText(he.errors.memberExists)).toBeTruthy();
    });
  });

  it("confirms a removal first and explains why the last member has to stay", async () => {
    stubApi((url, init) =>
      url.startsWith("/api/household/members/") && init?.method === "DELETE"
        ? json({ error: "last_member" }, 409)
        : defaultHandler(url),
    );
    const user = await openSettings();
    await screen.findByText("Dana");

    await user.click(
      screen.getByRole("button", {
        name: interpolate(he.settings.removeMemberLabel, { name: "Dana" }),
      }),
    );

    // Nothing is sent until the removal is confirmed.
    expect(
      screen.getByText(interpolate(he.settings.removeMemberConfirm, { name: "Dana" })),
    ).toBeTruthy();
    expect(routes.some((route) => route.init?.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: he.settings.confirmRemove }));

    await waitFor(() => {
      expect(screen.getByText(he.errors.lastMember)).toBeTruthy();
    });
    expect(routes.some((route) => route.url === "/api/household/members/member-1")).toBe(true);
  });

  it("removes a member once the removal is confirmed", async () => {
    stubApi((url, init) =>
      url.startsWith("/api/household/members/") && init?.method === "DELETE"
        ? noContent()
        : defaultHandler(url),
    );
    const user = await openSettings();
    await screen.findByText("Yossi");

    await user.click(
      screen.getByRole("button", {
        name: interpolate(he.settings.removeMemberLabel, { name: "Yossi" }),
      }),
    );
    await user.click(screen.getByRole("button", { name: he.settings.confirmRemove }));

    await waitFor(() => {
      expect(
        screen.getByText(interpolate(he.settings.memberRemoved, { name: "Yossi" })),
      ).toBeTruthy();
    });
  });
});
