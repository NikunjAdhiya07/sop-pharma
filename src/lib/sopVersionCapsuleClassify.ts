/**
 * Dashboard version status — exactly 3 user-facing buckets:
 *
 *  - "allTwoFound"  : Version-0 SOPs (no prior versions expected), OR all
 *                     expected prior versions are available → green
 *  - "onlyOneFound" : Exactly 1 of 2 expected prior versions is available → amber
 *  - "notFound"     : There ARE expected prior versions but NONE were found → red
 */
import { parseRevisionFromSopIdentifier } from "./sopIdentifierNormalize";

export type SopVersionCapsuleTier = "allTwoFound" | "onlyOneFound" | "notFound";

export type SopVersionFilterSegment = "allTwov" | "onlyOnev" | "notFoundv";

/** Classify a primary registry row for the Version capsule (mutually exclusive 3-bucket). */
export function classifySopVersionCapsule(row: any): SopVersionCapsuleTier {
  const currentVer = parseRevisionFromSopIdentifier(String(row?.sopNo || ""));
  /** No `-NN` suffix (e.g. family key only) — do not mark as “not found” red */
  if (currentVer === null) return "allTwoFound";
  if (currentVer === 0) return "allTwoFound";

  const expectedSlots = currentVer >= 2 ? 2 : 1;

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

  // Fallback: use artifact files when previousVersionsStatus was not computed.
  // Count unique prior version NUMBERS across English + Gujarati artifacts.
  // 1 English + 1 Gujarati at same version number = 1 unique prior version.
  const enArtifacts: { version: number }[] = Array.isArray(row?.versionArtifacts)
    ? row.versionArtifacts
    : [];
  const gjArtifacts: { version: number }[] = Array.isArray(row?.versionArtifactsGujarati)
    ? row.versionArtifactsGujarati
    : [];
  const allArtifactVersions = new Set<number>([
    ...enArtifacts.map((e) => Number(e.version)),
    ...gjArtifacts.map((e) => Number(e.version)),
  ]);
  allArtifactVersions.delete(currentVer);

  const uniquePriorCount = allArtifactVersions.size;

  if (uniquePriorCount >= expectedSlots) return "allTwoFound";
  if (uniquePriorCount === 1) return "onlyOneFound";
  return "notFound";
}
