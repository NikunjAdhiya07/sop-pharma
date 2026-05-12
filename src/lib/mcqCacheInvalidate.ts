import { getRedis } from '@/lib/redis';

const MCQ_CACHE_KEYS = [
  'mcq-stats:v1',
  'mcq-dept-stats:v1',
];

// Tree cache uses per-user keys — wipe all with a pattern scan would require SCAN,
// so we use a version-bump approach: store a global version number and include it
// in every tree cache key. Incrementing the version effectively invalidates all user trees.
const MCQ_TREE_VERSION_KEY = 'mcq-tree-version';

export async function invalidateMcqCaches(): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      // Increment the tree version — all per-user tree cache keys become stale
      await redis.incr(MCQ_TREE_VERSION_KEY);
      // Delete the global stats caches directly
      await Promise.all(MCQ_CACHE_KEYS.map(k => redis.del(k)));
    } catch { /* best effort */ }
  }
  // Clear in-memory fallbacks (no-op for tree since it has no in-memory cache)
}

export async function getMcqTreeVersion(): Promise<string> {
  const redis = getRedis();
  if (redis) {
    try {
      const v = await redis.get<number>(MCQ_TREE_VERSION_KEY);
      return String(v ?? 0);
    } catch { /* fall through */ }
  }
  return '0';
}
