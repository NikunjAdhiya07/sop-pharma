import { getRedis, REDIS_TTL } from '@/lib/redis';

const CACHE_PREFIX = 'manage-sop-view:v4';
const VERSION_KEY = `${CACHE_PREFIX}:version`;
const DEFAULT_VERSION = 1;
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;

type MemoryEntry = { cachedAt: number; payload: unknown };

const g = global as typeof global & {
  __manageSopViewCacheVersion?: number;
  __manageSopViewCache?: Map<string, MemoryEntry>;
};

function normalizeYear(year: number | 'all'): string {
  return year === 'all' ? 'all' : String(year);
}

function normalizeSearch(search: string): string {
  return String(search || '').trim().toLowerCase();
}

async function getActiveVersion(): Promise<number> {
  if (typeof g.__manageSopViewCacheVersion === 'number') {
    return g.__manageSopViewCacheVersion;
  }

  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get<number | string | null>(VERSION_KEY);
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        g.__manageSopViewCacheVersion = parsed;
        return parsed;
      }
      await redis.set(VERSION_KEY, DEFAULT_VERSION);
      g.__manageSopViewCacheVersion = DEFAULT_VERSION;
      return DEFAULT_VERSION;
    } catch {
      // fall through to memory-only version
    }
  }

  g.__manageSopViewCacheVersion = DEFAULT_VERSION;
  return DEFAULT_VERSION;
}

function buildCacheKey(version: number, year: number | 'all', search: string): string {
  const y = normalizeYear(year);
  const q = normalizeSearch(search);
  return `${CACHE_PREFIX}:${version}:${y}:${encodeURIComponent(q)}`;
}

function getMemoryStore(): Map<string, MemoryEntry> {
  if (!g.__manageSopViewCache) g.__manageSopViewCache = new Map();
  return g.__manageSopViewCache;
}

function pruneMemoryStore(store: Map<string, MemoryEntry>) {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.cachedAt > MEMORY_CACHE_TTL_MS) {
      store.delete(key);
    }
  }
}

export async function getManageSopViewCached(
  year: number | 'all',
  search: string,
): Promise<unknown | null> {
  const version = await getActiveVersion();
  const key = buildCacheKey(version, year, search);

  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached !== null) return cached;
    } catch {
      // fall through
    }
  }

  const store = getMemoryStore();
  pruneMemoryStore(store);
  const memory = store.get(key);
  return memory ? memory.payload : null;
}

export async function setManageSopViewCached(
  year: number | 'all',
  search: string,
  payload: unknown,
): Promise<void> {
  const version = await getActiveVersion();
  const key = buildCacheKey(version, year, search);

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key, payload, { ex: REDIS_TTL.FIVE_MIN });
      return;
    } catch {
      // fall through
    }
  }

  const store = getMemoryStore();
  pruneMemoryStore(store);
  store.set(key, { cachedAt: Date.now(), payload });
}

export async function invalidateManageSopViewCache(): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const nextVersion = await redis.incr(VERSION_KEY);
      if (Number.isFinite(Number(nextVersion))) {
        g.__manageSopViewCacheVersion = Number(nextVersion);
      } else {
        g.__manageSopViewCacheVersion = (g.__manageSopViewCacheVersion || DEFAULT_VERSION) + 1;
      }
    } catch {
      g.__manageSopViewCacheVersion = (g.__manageSopViewCacheVersion || DEFAULT_VERSION) + 1;
    }
  } else {
    g.__manageSopViewCacheVersion = (g.__manageSopViewCacheVersion || DEFAULT_VERSION) + 1;
  }

  g.__manageSopViewCache = new Map();
}
