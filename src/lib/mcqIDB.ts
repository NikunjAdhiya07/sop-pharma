/**
 * mcqIDB.ts — IndexedDB cache for large MCQ bank payloads.
 *
 * Why IndexedDB over localStorage?
 *  - localStorage is limited to ~5MB; a full MCQ tree can exceed that.
 *  - IndexedDB has no practical size limit for this use-case.
 *  - Falls back gracefully to no-op when unavailable (SSR, Firefox private mode).
 */

const DB_NAME = 'sop-mcq-cache';
const DB_VERSION = 2;
const STORE_BANKS = 'mcq-banks';
const STORE_TREE  = 'mcq-tree';
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry<T> {
  data: T;
  storedAt: number;
  ttl: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_BANKS)) {
        db.createObjectStore(STORE_BANKS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_TREE)) {
        db.createObjectStore(STORE_TREE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbSet<T>(store: string, key: string, data: T, ttl = DEFAULT_TTL_MS): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  try {
    const db = await openDB();
    const entry: CacheEntry<T> & { key: string } = { key, data, storedAt: Date.now(), ttl };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(entry);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
    db.close();
  } catch {
    // IndexedDB write failure is non-fatal
  }
}

async function idbGet<T>(store: string, key: string): Promise<T | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  try {
    const db = await openDB();
    const entry = await new Promise<(CacheEntry<T> & { key: string }) | undefined>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    db.close();
    if (!entry) return null;
    const age = Date.now() - entry.storedAt;
    if (age > entry.ttl) {
      // Stale — delete in background
      idbDelete(store, key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

async function idbDelete(store: string, key: string): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Cache a full MCQ bank payload. Key = bank._id */
export async function cacheBankToIDB(bankId: string, data: unknown, ttl = DEFAULT_TTL_MS): Promise<void> {
  await idbSet(STORE_BANKS, bankId, data, ttl);
}

/** Read a cached MCQ bank. Returns null on miss or expired. */
export async function getBankFromIDB<T = unknown>(bankId: string): Promise<T | null> {
  return idbGet<T>(STORE_BANKS, bankId);
}

/** Invalidate a specific bank cache entry (e.g. after status update). */
export async function evictBankFromIDB(bankId: string): Promise<void> {
  await idbDelete(STORE_BANKS, bankId);
}

/** Cache the full MCQ tree response. Key = username (or 'guest'). */
export async function cacheTreeToIDB(username: string, data: unknown, ttl = DEFAULT_TTL_MS): Promise<void> {
  await idbSet(STORE_TREE, username || 'guest', data, ttl);
}

/** Read cached tree. Returns null on miss or expired. */
export async function getTreeFromIDB<T = unknown>(username: string): Promise<T | null> {
  return idbGet<T>(STORE_TREE, username || 'guest');
}

/** Nuke all bank entries (e.g. force-refresh). */
export async function clearAllBanksFromIDB(): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BANKS, 'readwrite');
      tx.objectStore(STORE_BANKS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal
  }
}
