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
