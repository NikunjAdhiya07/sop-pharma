/**
 * Dashboard version status (green | grey | red).
 *
 * Rules:
 *  - green : latest two prior versions are available
 *  - red   : one/both latest two prior versions are missing
 *  - grey  : no usable prior version data
 */
export type SopVersionCapsuleTier = "green" | "grey" | "red";

export type SopVersionFilterSegment = "last2ok" | "zerov" | "missingv";

/** Classify a primary registry row for the Version capsule (mutually exclusive buckets). */
export function classifySopVersionCapsule(row: any): SopVersionCapsuleTier {
  // Extract current version number from SOP identifier (e.g. "PREP2-0" -> 0, "MAGE1-8" -> 8)
  const sopNo = String(row?.sopNo || "");
  const verMatch = sopNo.match(/-0*(\d+)$/);
  const currentVer = verMatch ? parseInt(verMatch[1], 10) : null;

  // Version 0: no prior versions can logically exist -> grey bucket
  if (currentVer === 0) return "grey";
  // No version info at all -> grey
  if (currentVer === null) return "grey";

  const prev = Array.isArray(row?.previousVersionsStatus)
    ? row.previousVersionsStatus
    : [];

  if (prev.length > 0) {
    const expectedSlots = currentVer >= 2 ? 2 : 1;
    const top = prev.slice(0, expectedSlots);
    const availableCount = top.filter((p: { available?: boolean }) => p.available).length;

    if (top.length === 0) return "grey";
    return availableCount >= expectedSlots ? "green" : "red";
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
  const allArtifactVersions = new Set([
    ...enArtifacts.map((e) => e.version),
    ...gjArtifacts.map((e) => e.version),
  ]);
  // Remove current version itself -- only count actual prior versions
  allArtifactVersions.delete(currentVer);

  const uniquePriorCount = allArtifactVersions.size;
  const expectedSlots = currentVer >= 2 ? 2 : 1;

  if (uniquePriorCount === 0) {
    return "grey";
  }
  if (uniquePriorCount >= expectedSlots) return "green";
  return "red";
}
