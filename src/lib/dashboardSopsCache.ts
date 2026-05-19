import { getRedis, REDIS_TTL } from '@/lib/redis';
import { invalidateBunnyVersionMapCache } from '@/lib/bunnyVersionSync';

const CACHE_KEY = 'dashboard-sops:v1';

const MEMORY_CACHE_TTL_MS = (() => {
  const raw = process.env.DASHBOARD_SOPS_CACHE_TTL_MS;
  if (raw === undefined || raw === '') return 5 * 60 * 1000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 5 * 60 * 1000;
})();

interface MemoryCacheEntry {
  payload: unknown;
  cachedAt: number;
}

const g = global as typeof global & { __dashboardSopsCache?: MemoryCacheEntry | null };

function getMemoryCache(): MemoryCacheEntry | null {
  if (MEMORY_CACHE_TTL_MS === 0) { g.__dashboardSopsCache = null; return null; }
  const entry = g.__dashboardSopsCache ?? null;
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > MEMORY_CACHE_TTL_MS) { g.__dashboardSopsCache = null; return null; }
  return entry;
}

export async function getDashboardSopsCache(): Promise<{ payload: unknown; cachedAt: number } | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const payload = await redis.get(CACHE_KEY);
      if (payload !== null) return { payload, cachedAt: Date.now() };
    } catch { /* fall through */ }
  }
  return getMemoryCache();
}

export async function setDashboardSopsCache(payload: unknown): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(CACHE_KEY, payload, { ex: REDIS_TTL.FIVE_MIN });
      return;
    } catch { /* fall through */ }
  }
  g.__dashboardSopsCache = { payload, cachedAt: Date.now() };
}

// In-flight request deduplication: when a cold rebuild is in progress, concurrent
// callers share the same promise instead of each kicking off their own rebuild.
// Without this, a single `?refresh=1` + a couple of background polls can stack
// 5+ parallel 100s rebuilds (observed in prod logs), saturating Mongo/Bunny.
const gFlight = global as typeof global & {
  __dashboardSopsRebuildInflight?: Promise<unknown> | null;
};

export function getInflightDashboardSopsRebuild(): Promise<unknown> | null {
  return gFlight.__dashboardSopsRebuildInflight ?? null;
}

export async function runDashboardSopsRebuildSingleflight<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const existing = gFlight.__dashboardSopsRebuildInflight as Promise<T> | undefined;
  if (existing) return existing;
  let p: Promise<T>;
  p = (async () => {
    try {
      return await fn();
    } finally {
      if (gFlight.__dashboardSopsRebuildInflight === p!) {
        gFlight.__dashboardSopsRebuildInflight = null;
      }
    }
  })();
  gFlight.__dashboardSopsRebuildInflight = p;
  return p;
}

export async function invalidateDashboardSopsCache(): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try { await redis.del(CACHE_KEY); } catch { /* best effort */ }
  }
  g.__dashboardSopsCache = null;
  // Bunny crawl result is cached independently — bust it too so the next rebuild
  // picks up any files that were just uploaded to the CDN.
  invalidateBunnyVersionMapCache();
}
