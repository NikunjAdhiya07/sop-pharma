import { getRedis, REDIS_TTL } from '@/lib/redis';

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

export async function invalidateDashboardSopsCache(): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try { await redis.del(CACHE_KEY); } catch { /* best effort */ }
  }
  g.__dashboardSopsCache = null;
}
