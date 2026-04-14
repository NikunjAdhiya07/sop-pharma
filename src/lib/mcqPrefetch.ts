/**
 * mcqPrefetch.ts — Background preloading of adjacent SOP MCQ banks.
 *
 * When a user opens SOP N, we silently fetch N+1 and N+2 (the next siblings
 * in the same subcategory) and persist them to IndexedDB so subsequent opens
 * are near-instant.
 *
 * Also handles background tree refresh: show stale-while-revalidate pattern
 * so the UI is never blocked waiting for fresh data.
 */

import { cacheBankToIDB, getBankFromIDB } from './mcqIDB';

/** Represents a minimal SOP node needed for prefetch lookups */
interface SOPRef {
  sopId: string;
  mcqBanks: Array<{ _id: string }>;
}

/** Time to wait before prefetching adjacent SOPs (gives current SOP time to fully render) */
const PREFETCH_DELAY_MS = 2500;

/**
 * Prefetch the MCQ banks of adjacent SOPs in the same subcategory.
 * Works in the background — will not throw, logs to console on failure.
 */
export function prefetchAdjacentSOPs(
  currentSopId: string,
  subcategorySops: SOPRef[],
  lookahead = 2,
): void {
  if (typeof window === 'undefined') return;

  const currentIdx = subcategorySops.findIndex(s => s.sopId === currentSopId);
  if (currentIdx === -1) return;

  // The next `lookahead` SOPs after the current one
  const toPreload = subcategorySops
    .slice(currentIdx + 1, currentIdx + 1 + lookahead)
    .filter(s => s.mcqBanks?.length > 0);

  setTimeout(async () => {
    for (const sop of toPreload) {
      for (const bank of sop.mcqBanks) {
        // Only fetch if not already cached
        const cached = await getBankFromIDB(bank._id);
        if (cached) {
          console.debug(`[PREFETCH] ${bank._id} already cached — skipping`);
          continue;
        }

        try {
          const ids = sop.mcqBanks.map(b => b._id).join(',');
          const res = await fetch(`/api/mcq-bank?ids=${ids}`, { cache: 'no-store' });
          const data = await res.json();
          if (data.success && data.mcqBanks?.length) {
            for (const fetchedBank of data.mcqBanks) {
              await cacheBankToIDB(fetchedBank._id, fetchedBank);
              console.debug(`[PREFETCH] Cached bank ${fetchedBank._id} (${fetchedBank.sopIdentifier})`);
            }
          }
          break; // fetched all banks for this SOP in one call
        } catch (err) {
          console.warn('[PREFETCH] Failed to prefetch SOP:', sop.sopId, err);
        }
      }
    }
  }, PREFETCH_DELAY_MS);
}

/**
 * Background tree refresh — stale while revalidate.
 * Shows cached data immediately, then silently polls the API.
 * Calls `onUpdate` only if the new data differs (by stats checksum).
 */
export function backgroundRefreshTree(
  username: string,
  onUpdate: (freshData: unknown) => void,
  delayMs = 3000,
): void {
  if (typeof window === 'undefined') return;

  setTimeout(async () => {
    try {
      const url = username
        ? `/api/mcq-bank/tree?username=${encodeURIComponent(username)}&bgRefresh=1`
        : '/api/mcq-bank/tree?bgRefresh=1';

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const fresh = await res.json();
      if (fresh.success) {
        onUpdate(fresh);
      }
    } catch {
      // Background refresh failure is silent
    }
  }, delayMs);
}
