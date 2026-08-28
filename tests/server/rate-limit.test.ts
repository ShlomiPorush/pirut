import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/server/routes/rate-limit.ts";

/** A clock the test advances by hand, so no test waits on real time. */
function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("allows requests up to the limit and refuses the next one", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000 }, clock.now);

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);

    const refused = limiter.check("a");
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) {
      expect(refused.retryAfterSeconds).toBe(60);
    }
  });

  it("counts each caller separately", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 }, clock.now);

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    // A second caller must be unaffected by the first one's attempts.
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("lets the caller through again once the window has passed", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 }, clock.now);

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);

    clock.advance(59_000);
    expect(limiter.check("a").allowed).toBe(false);

    clock.advance(1_001);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("reports a retry delay that shrinks as the window drains", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 }, clock.now);
    limiter.check("a");

    clock.advance(45_000);
    const refused = limiter.check("a");
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) {
      expect(refused.retryAfterSeconds).toBe(15);
    }
  });
});
