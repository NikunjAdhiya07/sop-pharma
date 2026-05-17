import { getRedis, REDIS_TTL } from '@/lib/redis';

const CACHE_KEY = 'training-matrix-overview:v38';
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;

type MemoryCacheEntry = { ts: number; payload: any };

function getMemoryCached(): any | null {
  const store = (globalThis as any).__tm_overview_cache as MemoryCacheEntry | undefined;
  if (!store) return null;
  if (Date.now() - store.ts > MEMORY_CACHE_TTL_MS) return null;
  return store.payload;
}

export function setMemoryCached(payload: any) {
  (globalThis as any).__tm_overview_cache = { ts: Date.now(), payload } satisfies MemoryCacheEntry;
}

export async function getTrainingMatrixCached(): Promise<any | null> {
  const redis = getRedis();
  if (redis) {
    try {
      return await redis.get(CACHE_KEY);
    } catch { /* fall through */ }
  }
  return getMemoryCached();
}

export async function setTrainingMatrixCached(payload: any) {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(CACHE_KEY, payload, { ex: REDIS_TTL.FIVE_MIN });
      return;
    } catch { /* fall through */ }
  }
  setMemoryCached(payload);
}

export async function invalidateTrainingMatrixCache() {
  const redis = getRedis();
  if (redis) {
    try { await redis.del(CACHE_KEY); } catch { /* best effort */ }
  }
  (globalThis as any).__tm_overview_cache = null;
}
