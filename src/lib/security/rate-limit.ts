/**
 * Fixed-window, in-memory rate limiter. Adequate for a single app instance;
 * swap for a Postgres/Redis-backed store when running several instances.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const globalForLimits = globalThis as typeof globalThis & {
  __plabixRateLimits?: Map<string, Bucket>;
};
const buckets: Map<string, Bucket> = (globalForLimits.__plabixRateLimits ??= new Map());

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/**
 * Client IP from a trusted reverse proxy, or null when unknown. Route handlers
 * can't see the socket address, and proxy headers are spoofable unless a proxy
 * you control sets them, so they are only read when TRUST_PROXY=true. Callers
 * must skip per-IP limits on null: a shared fallback key would let one client
 * lock everyone out.
 */
export function clientIp(req: Request): string | null {
  if (process.env.TRUST_PROXY !== "true") return null;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || null;
}
