// lib/rateLimit.ts
// Small in-memory sliding-window rate limiter for the public endpoints.
//
// LIMITATION (docs/PRD.md risk R1): state lives in one server instance. On
// serverless hosting (Vercel) each instance has its own window, so this is
// best-effort abuse protection; move to a shared store (Redis/Upstash) in R2.

const hits = new Map<string, number[]>();
let lastSweep = 0;

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const windowStart = now - windowMs;

  // Periodically drop idle keys so the map cannot grow without bound.
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, times] of hits) {
      if (times.length === 0 || times[times.length - 1] < windowStart) hits.delete(k);
    }
  }

  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfterSec: 0 };
}

/** Test helper. */
export function resetRateLimits(): void {
  hits.clear();
  lastSweep = 0;
}
