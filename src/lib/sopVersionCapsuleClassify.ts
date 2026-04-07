/**
 * Dashboard version status — exactly 3 user-facing buckets:
 *
 *  - "allTwoFound"  : Version-0 SOPs (no prior versions expected), OR all
 *                     expected prior versions have actual files (DOCX or PDF) → green
 *  - "onlyOneFound" : Some expected prior versions have files but at least one is missing → amber
 *  - "notFound"     : No expected prior versions have any files at all → red
 *
 * "Available" means the version slot has at least one actual file (docxPath or pdfPath).
 * A prior SOP record that exists in the DB but has no files is NOT counted as found.
 * For dual-language rows, a version is only fully found when BOTH ENG and GUJ have files.
 */
import { parseRevisionFromSopIdentifier } from "./sopIdentifierNormalize";
import { expectedDocxSlotsForRow } from "./registryRowDocCounts";

export type SopVersionCapsuleTier = "allTwoFound" | "onlyOneFound" | "notFound";

export type SopVersionFilterSegment = "allTwov" | "onlyOnev" | "notFoundv";

/** Returns true if a VersionArtifactEntry has at least one actual file path. */
function artifactHasFiles(e: { docxPath?: string; pdfPath?: string }): boolean {
  return !!(e.docxPath?.trim()) || !!(e.pdfPath?.trim());
}

/**
 * Classify a primary registry row for the Version capsule (mutually exclusive 3-bucket).
 *
 * Uses versionArtifacts / versionArtifactsGujarati (which hold actual file paths) as the
 * primary source of truth — matching exactly what the Prior Versions column renders.
 * Falls back to previousVersionsStatus only when no artifact arrays are present.
 */
export function classifySopVersionCapsule(row: any): SopVersionCapsuleTier {
  const currentVer = parseRevisionFromSopIdentifier(String(row?.sopNo || ""));
  /** No `-NN` suffix (e.g. family key only) — do not mark as "not found" red */
  if (currentVer === null) return "allTwoFound";
  if (currentVer === 0) return "allTwoFound";

  const expectedSlots = currentVer >= 2 ? 2 : 1;
  const isDual = expectedDocxSlotsForRow(row) >= 2;

  const enArtifacts: { version: number; docxPath?: string; pdfPath?: string }[] =
    Array.isArray(row?.versionArtifacts) ? row.versionArtifacts : [];
  const gjArtifacts: { version: number; docxPath?: string; pdfPath?: string }[] =
    Array.isArray(row?.versionArtifactsGujarati) ? row.versionArtifactsGujarati : [];

  const hasArtifactData = enArtifacts.length > 0 || gjArtifacts.length > 0;

  if (hasArtifactData) {
    // For each expected prior version slot, check whether it has actual files.
    // For dual-language rows: need files in BOTH ENG and GUJ to be "fully found".
    // For single-language rows: need files in at least one language.
    let foundCount = 0;

    for (let i = 1; i <= expectedSlots; i++) {
      const prev = currentVer - i;

      const enEntry = enArtifacts.find((e) => e.version === prev);
      const gjEntry = gjArtifacts.find((e) => e.version === prev);

      const enHasFiles = !!(enEntry && artifactHasFiles(enEntry));
      const gjHasFiles = !!(gjEntry && artifactHasFiles(gjEntry));

      if (isDual) {
        // Dual-language: both ENG and GUJ must have files for the slot to be "found"
        if (enHasFiles && gjHasFiles) foundCount++;
      } else {
        // Single-language: either language having files counts
        if (enHasFiles || gjHasFiles) foundCount++;
      }
    }

    if (foundCount >= expectedSlots) return "allTwoFound";
    if (foundCount >= 1) return "onlyOneFound";
    return "notFound";
  }

  // Fallback: no artifact arrays on this row — use previousVersionsStatus.
  // This covers legacy rows that pre-date the artifact upload system.
  const prev = Array.isArray(row?.previousVersionsStatus)
    ? row.previousVersionsStatus
    : [];

  if (prev.length > 0) {
    const top = prev.slice(0, expectedSlots);
    const availableCount = top.filter((p: { available?: boolean }) => p.available).length;

    if (availableCount >= expectedSlots) return "allTwoFound";
    if (availableCount === 1) return "onlyOneFound";
    return "notFound";
  }

  return "notFound";
}
