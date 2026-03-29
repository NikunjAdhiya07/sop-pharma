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
    return top2.every((p: { available?: boolean }) => p.available)
      ? "green"
      : "red";
  }

  const en = Array.isArray(row?.versionArtifacts)
    ? row.versionArtifacts.length
    : 0;
  const gj = Array.isArray(row?.versionArtifactsGujarati)
    ? row.versionArtifactsGujarati.length
    : 0;
  const artifactTotal = en + gj;
  if (artifactTotal === 0) return "grey";
  if (artifactTotal >= 2) return "green";
  return "red";
}
