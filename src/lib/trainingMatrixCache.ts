import { getRedis, REDIS_TTL } from '@/lib/redis';

// Bump this version whenever the overview payload shape or aggregation rules
// change so stale Redis AND in-memory caches are both ignored. The in-memory
// fallback now stores the version alongside the payload — a key-only Redis
// invalidation isn't enough, otherwise long-running dev servers kept serving
// the previous compute logic from the in-memory map (which was the cause of
// the "MCQ (100+ created)" top number drifting away from its ENG+GUJ rows).
const CACHE_KEY = 'training-matrix-overview:v43';
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;

type MemoryCacheEntry = { ts: number; key: string; payload: any };

function getMemoryCached(): any | null {
  const store = (globalThis as any).__tm_overview_cache as MemoryCacheEntry | undefined;
  if (!store) return null;
  if (store.key !== CACHE_KEY) return null;
  if (Date.now() - store.ts > MEMORY_CACHE_TTL_MS) return null;
  return store.payload;
}

export function setMemoryCached(payload: any) {
  (globalThis as any).__tm_overview_cache = {
    ts: Date.now(),
    key: CACHE_KEY,
    payload,
  } satisfies MemoryCacheEntry;
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
