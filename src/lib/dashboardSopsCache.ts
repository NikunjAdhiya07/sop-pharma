/**
 * Server-side in-memory cache for /api/dashboard/sops.
 *
 * Because Next.js route handlers run in the same Node.js process across requests,
 * module-level variables survive between requests (when not restarted).
 * This gives us a zero-dependency, sub-millisecond cache that dramatically reduces
 * MongoDB query load on dashboard startup.
 *
 * TTL: 5 minutes by default. Set DASHBOARD_SOPS_CACHE_TTL_MS (milliseconds) to tune;
 * use 0 to disable server caching (every GET recomputes; dev-friendly).
 * Any upload/mutation should call invalidateDashboardSopsCache() so the next request
 * re-runs the full DB query and serves fresh data.
 */

const CACHE_TTL_MS = (() => {
  const raw = process.env.DASHBOARD_SOPS_CACHE_TTL_MS;
  if (raw === undefined || raw === '') return 5 * 60 * 1000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 5 * 60 * 1000;
})();

interface CacheEntry {
  payload: unknown;
  cachedAt: number;
}

// Use a global so hot-module-reload in dev doesn't drop the cache object.
const g = global as typeof global & { __dashboardSopsCache?: CacheEntry | null };

export function getDashboardSopsCache(): CacheEntry | null {
  if (CACHE_TTL_MS === 0) {
    g.__dashboardSopsCache = null;
    return null;
  }
  const entry = g.__dashboardSopsCache ?? null;
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    g.__dashboardSopsCache = null;
    return null;
  }
  return entry;
}

export function setDashboardSopsCache(payload: unknown): void {
  g.__dashboardSopsCache = { payload, cachedAt: Date.now() };
}

export function invalidateDashboardSopsCache(): void {
  g.__dashboardSopsCache = null;
}
