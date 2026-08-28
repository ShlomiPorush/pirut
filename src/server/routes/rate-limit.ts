/**
 * A small fixed-window rate limiter for Pirut's own credential routes.
 *
 * Better Auth rate-limits the requests its HTTP router serves, but Pirut's setup and
 * household routes call `auth.api.*` directly and therefore bypass that limiter entirely.
 * These are the routes that create accounts and accept passwords, so they are exactly the
 * ones worth bounding.
 *
 * A fixed window is coarse: a caller can spend a full window's attempts at the very end of
 * one window and again at the start of the next. That is acceptable here. This guards a
 * single household's own server against a stuck client or a casual probe, not a
 * distributed attacker, and a sliding window would add state for no real gain at this size.
 *
 * State is in memory, so it resets when the process restarts and is not shared across
 * replicas. Pirut runs as one process for one household, so that matches the deployment.
 */

export type RateLimitRule = {
  /** How many requests one caller may make inside the window. */
  limit: number;
  windowMs: number;
};

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Window = { count: number; resetAt: number };

export class RateLimiter {
  readonly #windows = new Map<string, Window>();
  readonly #rule: RateLimitRule;
  readonly #now: () => number;

  constructor(rule: RateLimitRule, now: () => number = Date.now) {
    this.#rule = rule;
    this.#now = now;
  }

  check(key: string): RateLimitDecision {
    const now = this.#now();
    const existing = this.#windows.get(key);

    if (existing === undefined || existing.resetAt <= now) {
      this.#windows.set(key, { count: 1, resetAt: now + this.#rule.windowMs });
      // Expired entries are only dropped while handling a request, which keeps the map
      // from growing without adding a timer that would hold the process open.
      this.#collect(now);
      return { allowed: true };
    }

    if (existing.count >= this.#rule.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    existing.count += 1;
    return { allowed: true };
  }

  #collect(now: number): void {
    if (this.#windows.size < 1000) return;
    for (const [key, window] of this.#windows) {
      if (window.resetAt <= now) this.#windows.delete(key);
    }
  }
}
