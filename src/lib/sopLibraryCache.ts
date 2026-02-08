'use client';

/**
 * SOP Library Cache Manager
 * 
 * Provides in-memory caching for SOP Library data to improve performance
 * and prevent repeated unnecessary reloads.
 * 
 * Cache Invalidation Events:
 * - SOP folder upload
 * - SOP sync
 * - SOP update/delete
 * - TTL expiry (5 minutes)
 */

interface CachedTreeData {
  tree: any[];
  stats: any;
  department: string;
}

interface CachedListData {
  sopLibraries: any[];
  organized: Record<string, any[]>;
  departments: string[];
  department: string;
}

interface SOPLibraryCache {
  treeCache: Map<string, CachedTreeData>;
  listCache: Map<string, CachedListData>;
  timestamp: number;
  version: number;
}

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

// Global cache instance (persists across component remounts within the same session)
let cache: SOPLibraryCache = {
  treeCache: new Map(),
  listCache: new Map(),
  timestamp: 0,
  version: 1
};

/**
 * Check if the cache is still valid based on TTL
 */
export function isCacheValid(): boolean {
  if (cache.timestamp === 0) return false;
  const now = Date.now();
  return (now - cache.timestamp) < CACHE_TTL;
}

/**
 * Get cached tree data for a specific department
 */
export function getCachedTree(department: string = 'all'): CachedTreeData | null {
  if (!isCacheValid()) return null;
  return cache.treeCache.get(department) || null;
}

/**
 * Set cached tree data for a specific department
 */
export function setCachedTree(data: { tree: any[]; stats?: any }, department: string = 'all'): void {
  cache.treeCache.set(department, {
    tree: data.tree,
    stats: data.stats || {},
    department
  });
  cache.timestamp = Date.now();
}

/**
 * Get cached list data for a specific department
 */
export function getCachedList(department: string = 'all'): CachedListData | null {
  if (!isCacheValid()) return null;
  return cache.listCache.get(department) || null;
}

/**
 * Set cached list data for a specific department
 */
export function setCachedList(
  data: { sopLibraries: any[]; organized: Record<string, any[]>; departments: string[] },
  department: string = 'all'
): void {
  cache.listCache.set(department, {
    sopLibraries: data.sopLibraries,
    organized: data.organized,
    departments: data.departments,
    department
  });
  cache.timestamp = Date.now();
}

/**
 * Invalidate all cached data
 * Call this when SOPs are uploaded, synced, updated, or deleted
 */
export function invalidateSOPLibraryCache(): void {
  cache.treeCache.clear();
  cache.listCache.clear();
  cache.timestamp = 0;
  cache.version++;
  console.log('📚 SOP Library cache invalidated (version:', cache.version, ')');
}

/**
 * Get cache status for debugging/display
 */
export function getCacheStatus(): { 
  isValid: boolean; 
  age: number; 
  version: number;
  treeCount: number;
  listCount: number;
} {
  const now = Date.now();
  return {
    isValid: isCacheValid(),
    age: cache.timestamp ? Math.round((now - cache.timestamp) / 1000) : 0,
    version: cache.version,
    treeCount: cache.treeCache.size,
    listCount: cache.listCache.size
  };
}

/**
 * Check if this is the first load (no cache exists)
 */
export function isFirstLoad(): boolean {
  return cache.timestamp === 0;
}

/**
 * Get time remaining until cache expires (in seconds)
 */
export function getCacheTTLRemaining(): number {
  if (!isCacheValid()) return 0;
  const remaining = CACHE_TTL - (Date.now() - cache.timestamp);
  return Math.max(0, Math.round(remaining / 1000));
}
