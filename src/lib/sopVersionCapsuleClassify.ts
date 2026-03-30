/**
 * Dashboard department capsules — version row (green | grey | red).
 * Matches registry “Prior versions” semantics: {@link previousVersionsStatus} slice(0,2), else folder artifacts.
 */
export type SopVersionCapsuleTier = "green" | "grey" | "red";

export type SopVersionFilterSegment = "last2ok" | "zerov" | "missingv";

/** Classify a primary registry row for the Version capsule (mutually exclusive buckets). */
export function classifySopVersionCapsule(row: any): SopVersionCapsuleTier {
  const prev = Array.isArray(row?.previousVersionsStatus)
    ? row.previousVersionsStatus
    : [];
  const top2 = prev.slice(0, 2);

  if (top2.length > 0) {
    // Strict rule:
    // - green only when BOTH latest-two slots are present and available
    // - red when one/both latest-two are missing/unavailable
    const hasTwoSlots = top2.length === 2;
    const bothAvailable =
      hasTwoSlots && top2.every((p: { available?: boolean }) => p.available);
    return bothAvailable ? "green" : "red";
  }

  const en = Array.isArray(row?.versionArtifacts)
    ? row.versionArtifacts.length
    : 0;
  const gj = Array.isArray(row?.versionArtifactsGujarati)
    ? row.versionArtifactsGujarati.length
    : 0;
  const artifactTotal = en + gj;
  // Artifact fallback when previousVersionsStatus is absent.
  if (artifactTotal === 0) return "grey"; // no version data at all
  if (artifactTotal >= 2) return "green"; // latest-two available
  return "red"; // only one latest version slot available
}
