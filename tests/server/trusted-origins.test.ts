import { describe, expect, it } from "vitest";
import { trustedOriginsFor } from "../../src/infrastructure/auth/auth.ts";

describe("trustedOriginsFor", () => {
  it("accepts both loopback spellings, since they are one machine but two origins", () => {
    // Configuring one and opening the other is the mistake this exists to prevent:
    // Better Auth answers INVALID_ORIGIN and every sign-in fails for no visible reason.
    expect(trustedOriginsFor(new URL("http://localhost:4610"))).toEqual([
      "http://localhost:4610",
      "http://127.0.0.1:4610",
    ]);
    expect(trustedOriginsFor(new URL("http://127.0.0.1:4610"))).toEqual([
      "http://127.0.0.1:4610",
      "http://localhost:4610",
    ]);
  });

  it("keeps the port when mirroring the loopback name", () => {
    expect(trustedOriginsFor(new URL("http://localhost:8080"))).toContain("http://127.0.0.1:8080");
  });

  it("does not invent aliases for a real host name", () => {
    expect(trustedOriginsFor(new URL("https://pirut.example.com"))).toEqual([
      "https://pirut.example.com",
    ]);
  });

  it("includes explicitly configured origins, such as a reverse proxy name", () => {
    const origins = trustedOriginsFor(new URL("http://localhost:4610"), [
      "https://pirut.example.com",
    ]);
    expect(origins).toContain("https://pirut.example.com");
    expect(origins).toContain("http://localhost:4610");
  });

  it("does not repeat an origin that is already covered", () => {
    const origins = trustedOriginsFor(new URL("http://localhost:4610"), [
      "http://localhost:4610",
      "http://127.0.0.1:4610",
    ]);
    expect(origins).toHaveLength(2);
  });
});
