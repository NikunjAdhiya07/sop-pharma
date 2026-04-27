import { sopFamilyKeyFromIdentifier } from '@/lib/sopIdentifierNormalize';

/**
 * Dashboard registry: rows that are only version-artifact placeholders (no primary SOP doc)
 * must not inflate capsule counts or department totals.
 */
export function isArtifactOnlyRegistryRow(row: any): boolean {
  if (row?.registryRowKind === 'artifactsOnly') return true;
  const id = row?._id;
  return typeof id === 'string' && id.startsWith('va-');
}

/**
 * True when `sopNo` normalizes to the canonical numbered SOP pattern used across the app:
 * 2–6 letter prefix + document number + hyphen + revision (e.g. MAGE1-8, QAQC01-11).
 * Excludes reference manuals, equipment codes (AP225…), plain words (IND320), incomplete IDs (GD-04-), etc.
 *
 * Uses the same rule as `sopFamilyKeyFromIdentifier` — one source of truth, no ad-hoc title regexes.
 */
export function isStandardRegistrySopNumber(row: any): boolean {
  const sopNo = String(row?.sopNo ?? '').trim();
  if (!sopNo) return false;
  return sopFamilyKeyFromIdentifier(sopNo) !== null;
}

/**
 * Primary registry rows for the dashboard: real SOP documents with a valid SOP number format.
 * Artifact-only placeholders and non–SOP-format rows (junk / manuals / bad IDs) are excluded.
 */
export function filterPrimaryRegistryRows<T extends any>(data: T[] | undefined | null): T[] {
  if (!data?.length) return [];
  return data.filter(
    (row) => !isArtifactOnlyRegistryRow(row) && isStandardRegistrySopNumber(row),
  );
}

/** Extract trailing numeric revision from a sopNo like "MAGE1-8" → 8. Falls back to 0. */
function parseRevisionFromSopNo(sopNo: string): number {
  const m = String(sopNo || '').trim().match(/-(\d+)$/);
  return m ? parseInt(m[1]!, 10) || 0 : 0;
}

/**
 * Primary registry rows deduped to a single row per SOP family (same letters + doc number,
 * regardless of revision). When multiple primary rows exist for the same family, keeps the
 * one with the highest revision number. This is the canonical "one SOP = one row" view the
 * Dashboard shows: its total and every per-department count match the MCQ Bank page's
 * "Unique SOPs" computation.
 */
export function filterPrimaryRegistryRowsUniqueByFamily<T extends any>(
  data: T[] | undefined | null,
): T[] {
  const primary = filterPrimaryRegistryRows(data);
  if (!primary.length) return [];
  const best = new Map<string, T>();
  for (const row of primary) {
    const sopNo = String((row as any)?.sopNo ?? '').trim();
    const fk = sopFamilyKeyFromIdentifier(sopNo);
    if (!fk) continue;
    const existing = best.get(fk);
    if (!existing) {
      best.set(fk, row);
      continue;
    }
    const existingRev = parseRevisionFromSopNo(String((existing as any)?.sopNo ?? ''));
    const currentRev = parseRevisionFromSopNo(sopNo);
    if (currentRev > existingRev) best.set(fk, row);
  }
  return Array.from(best.values());
}
