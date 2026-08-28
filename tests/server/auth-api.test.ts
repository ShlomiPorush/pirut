import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { AuthStatus, HouseholdMember } from "../../src/application/auth-contracts.ts";
import { buildApp } from "../../src/server/app.ts";
import { fakeDatabase, fakeImportService, memoryAuth, testConfig } from "./helpers.ts";

/**
 * The authentication surface, end to end over HTTP.
 *
 * These tests run against a real Better Auth instance on the in-memory adapter, so the
 * policy hook, the cookie relay, and the session guard are the real ones. Nothing here
 * needs PostgreSQL.
 */

const OWNER = {
  name: "Household Owner",
  email: "owner@example.test",
  password: "a-long-enough-password",
};

const SECOND_MEMBER = {
  name: "Second Member",
  email: "second@example.test",
  password: "another-long-password",
};

let running: FastifyInstance | undefined;

async function startApp(): Promise<FastifyInstance> {
  const app = await buildApp(testConfig, fakeDatabase(true), fakeImportService(), memoryAuth());
  running = app;
  return app;
}

afterEach(async () => {
  await running?.close();
  running = undefined;
});

/** The cookie header a browser would send back after a `Set-Cookie` response. */
function cookieHeader(setCookie: string[]): string {
  return setCookie.map((cookie) => cookie.split(";")[0]).join("; ");
}

function setCookiesOf(headers: Record<string, unknown>): string[] {
  const raw = headers["set-cookie"];
  if (raw === undefined) return [];
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}

/** Creates the first account and returns the cookie its response set. */
async function createFirstUser(app: FastifyInstance): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/setup/first-user",
    payload: OWNER,
  });

  expect(response.statusCode).toBe(200);
  const cookies = setCookiesOf(response.headers);
  expect(cookies.length).toBeGreaterThan(0);
  return cookieHeader(cookies);
}

describe("session guard", () => {
  it("refuses a guarded route without a session and lets health through", async () => {
    const app = await startApp();

    const guarded = await app.inject({ method: "GET", url: "/api/transactions" });
    expect(guarded.statusCode).toBe(401);
    expect(guarded.json()).toEqual({ error: "unauthorized" });

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
  });

  it("does not let a query string turn a guarded route into a public one", async () => {
    const app = await startApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/transactions?next=/api/health",
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("GET /api/setup/status", () => {
  it("asks for a first user until one exists, then reports the signed-in member", async () => {
    const app = await startApp();

    const before = await app.inject({ method: "GET", url: "/api/setup/status" });
    expect(before.statusCode).toBe(200);
    expect(before.json<AuthStatus>()).toEqual({ needsFirstUser: true, user: null });

    const cookie = await createFirstUser(app);

    const after = await app.inject({
      method: "GET",
      url: "/api/setup/status",
      headers: { cookie },
    });
    const status = after.json<AuthStatus>();
    expect(status.needsFirstUser).toBe(false);
    expect(status.user).toEqual({
      id: expect.any(String),
      name: OWNER.name,
      email: OWNER.email,
    });
  });

  it("reports no user when the request carries no session", async () => {
    const app = await startApp();
    await createFirstUser(app);

    const response = await app.inject({ method: "GET", url: "/api/setup/status" });
    expect(response.json<AuthStatus>()).toEqual({ needsFirstUser: false, user: null });
  });
});

describe("POST /api/setup/first-user", () => {
  it("sets a session cookie that opens a guarded route", async () => {
    const app = await startApp();
    const cookie = await createFirstUser(app);

    const guarded = await app.inject({
      method: "GET",
      url: "/api/transactions",
      headers: { cookie },
    });
    expect(guarded.statusCode).toBe(200);
  });

  it("refuses a second setup once the household exists", async () => {
    const app = await startApp();
    await createFirstUser(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/setup/first-user",
      payload: SECOND_MEMBER,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "setup_already_completed" });
  });

  it("rejects a missing field and a short password with distinct codes", async () => {
    const app = await startApp();

    const missing = await app.inject({
      method: "POST",
      url: "/api/setup/first-user",
      payload: { email: OWNER.email, password: OWNER.password },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ error: "invalid_member" });

    const weak = await app.inject({
      method: "POST",
      url: "/api/setup/first-user",
      payload: { ...OWNER, password: "short" },
    });
    expect(weak.statusCode).toBe(400);
    expect(weak.json()).toMatchObject({ error: "weak_password" });
  });
});

describe("Better Auth routes under /api/auth", () => {
  it("signs in with the relayed cookie and opens a guarded route", async () => {
    const app = await startApp();
    await createFirstUser(app);

    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: OWNER.email, password: OWNER.password },
    });
    expect(signIn.statusCode).toBe(200);

    const cookies = setCookiesOf(signIn.headers);
    expect(cookies.length).toBeGreaterThan(0);

    const guarded = await app.inject({
      method: "GET",
      url: "/api/transactions",
      headers: { cookie: cookieHeader(cookies) },
    });
    expect(guarded.statusCode).toBe(200);
  });

  it("refuses a public sign-up once the household exists", async () => {
    const app = await startApp();
    await createFirstUser(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: SECOND_MEMBER,
    });
    expect(response.statusCode).toBe(401);

    const members = await app.inject({ method: "GET", url: "/api/setup/status" });
    expect(members.json<AuthStatus>().needsFirstUser).toBe(false);
  });
});

describe("household members", () => {
  it("requires a session to list or add a member", async () => {
    const app = await startApp();
    await createFirstUser(app);

    const list = await app.inject({ method: "GET", url: "/api/household/members" });
    expect(list.statusCode).toBe(401);

    const add = await app.inject({
      method: "POST",
      url: "/api/household/members",
      payload: SECOND_MEMBER,
    });
    expect(add.statusCode).toBe(401);
  });

  it("adds a member without moving the caller's session to them", async () => {
    const app = await startApp();
    const cookie = await createFirstUser(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/household/members",
      headers: { cookie },
      payload: SECOND_MEMBER,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<{ member: HouseholdMember }>().member).toMatchObject({
      name: SECOND_MEMBER.name,
      email: SECOND_MEMBER.email,
      passkeyCount: 0,
    });
    // The caller keeps their own session: nothing may be handed back that replaces it.
    expect(setCookiesOf(created.headers)).toEqual([]);

    const status = await app.inject({
      method: "GET",
      url: "/api/setup/status",
      headers: { cookie },
    });
    expect(status.json<AuthStatus>().user?.email).toBe(OWNER.email);
  });

  it("lists every member with a passkey count", async () => {
    const app = await startApp();
    const cookie = await createFirstUser(app);
    await app.inject({
      method: "POST",
      url: "/api/household/members",
      headers: { cookie },
      payload: SECOND_MEMBER,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/household/members",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);

    const { members } = response.json<{ members: HouseholdMember[] }>();
    expect(members.map((member) => member.email).sort()).toEqual([
      OWNER.email,
      SECOND_MEMBER.email,
    ]);
    for (const member of members) {
      expect(member.passkeyCount).toBe(0);
      expect(Number.isNaN(Date.parse(member.createdAt))).toBe(false);
    }
  });

  it("rejects a duplicate address and a weak password", async () => {
    const app = await startApp();
    const cookie = await createFirstUser(app);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/household/members",
      headers: { cookie },
      payload: { ...SECOND_MEMBER, email: OWNER.email },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ error: "member_exists" });

    const weak = await app.inject({
      method: "POST",
      url: "/api/household/members",
      headers: { cookie },
      payload: { ...SECOND_MEMBER, password: "short" },
    });
    expect(weak.statusCode).toBe(400);
    expect(weak.json()).toMatchObject({ error: "weak_password" });
  });
});

describe("DELETE /api/household/members/:id", () => {
  it("refuses to empty the household", async () => {
    const app = await startApp();
    const cookie = await createFirstUser(app);

    const status = await app.inject({
      method: "GET",
      url: "/api/setup/status",
      headers: { cookie },
    });
    const ownerId = status.json<AuthStatus>().user?.id ?? "";

    const response = await app.inject({
      method: "DELETE",
      url: `/api/household/members/${ownerId}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "last_member" });
  });

  it("refuses to remove the caller once another member exists", async () => {
    const app = await startApp();
    const cookie = await createFirstUser(app);
    await app.inject({
      method: "POST",
      url: "/api/household/members",
      headers: { cookie },
      payload: SECOND_MEMBER,
    });

    const status = await app.inject({
      method: "GET",
      url: "/api/setup/status",
      headers: { cookie },
    });
    const ownerId = status.json<AuthStatus>().user?.id ?? "";

    const response = await app.inject({
      method: "DELETE",
      url: `/api/household/members/${ownerId}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "cannot_remove_self" });
  });

  it("removes another member along with their sign-in credentials", async () => {
    const app = await startApp();
    const cookie = await createFirstUser(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/household/members",
      headers: { cookie },
      payload: SECOND_MEMBER,
    });
    const memberId = created.json<{ member: HouseholdMember }>().member.id;

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/household/members/${memberId}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(204);

    const list = await app.inject({
      method: "GET",
      url: "/api/household/members",
      headers: { cookie },
    });
    expect(list.json<{ members: HouseholdMember[] }>().members).toHaveLength(1);

    // The account went with the member, so their password no longer signs anyone in.
    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: SECOND_MEMBER.email, password: SECOND_MEMBER.password },
    });
    expect(signIn.statusCode).toBeGreaterThanOrEqual(400);
  });
});
