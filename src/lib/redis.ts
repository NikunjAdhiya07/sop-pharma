import { Redis } from '@upstash/redis';

// Returns null when env vars are not configured (local dev without Redis).
// All callers must handle the null case by falling back to in-memory or no cache.
function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// Singleton — one client per serverless instance.
let _client: Redis | null | undefined;
export function getRedis(): Redis | null {
  if (_client === undefined) _client = createRedisClient();
  return _client;
}

export const REDIS_TTL = {
  FIVE_MIN: 5 * 60,
  TEN_MIN: 10 * 60,
  ONE_HOUR: 60 * 60,
} as const;
