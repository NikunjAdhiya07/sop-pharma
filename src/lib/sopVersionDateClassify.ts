/**
 * Version-Date capsule classifier.
 *
 * For each expected (language, version) slot on a row — the current revision plus
 * every prior revision that appears in versionArtifacts / versionArtifactsGujarati —
 * count whether BOTH reviewDate AND effectiveDate are stored. Missing either flips
 * that slot to "Date Not Found".
 *
 * Source: `row.versionDates` produced by /api/dashboard/sops (joins ArchivedSOP +
 * current SOP collection). Keyed by `${EN|GJ}::${version}`.
 */
import { parseRevisionFromSopIdentifier } from "./sopIdentifierNormalize";
import { expectedDocxSlotsForRow } from "./registryRowDocCounts";

export type VersionDateTier = "found" | "notFound";

export type VersionDateSegment = "dateFoundv" | "dateNotFoundv";

function collectExpectedVersions(row: any): number[] {
  const versions = new Set<number>();
  const currentRev = parseRevisionFromSopIdentifier(String(row?.sopNo || ""));
  if (currentRev != null) versions.add(currentRev);
  const enArt: Array<{ version: number }> = Array.isArray(row?.versionArtifacts) ? row.versionArtifacts : [];
  const gjArt: Array<{ version: number }> = Array.isArray(row?.versionArtifactsGujarati) ? row.versionArtifactsGujarati : [];
  for (const e of enArt) {
    const n = Number(e?.version);
    if (Number.isFinite(n)) versions.add(n);
  }
  for (const e of gjArt) {
    const n = Number(e?.version);
    if (Number.isFinite(n)) versions.add(n);
  }
  return [...versions];
}

function readSlot(row: any, lang: "EN" | "GJ", version: number): { reviewDate?: string; effectiveDate?: string } | null {
  const map = row?.versionDates;
  if (!map || typeof map !== "object") return null;
  return map[`${lang}::${version}`] || null;
}

/** Both reviewDate AND effectiveDate must be present (and parse to a real date). */
function bothDatesPresent(entry: { reviewDate?: string; effectiveDate?: string } | null | undefined): boolean {
  if (!entry) return false;
  const r = entry.reviewDate ? new Date(entry.reviewDate) : null;
  const e = entry.effectiveDate ? new Date(entry.effectiveDate) : null;
  return !!(r && !isNaN(r.getTime()) && e && !isNaN(e.getTime()));
}

/**
 * Classify a single (lang, version) slot. Returns null when the row is not in
 * scope for that language (e.g. English-only row asked about Gujarati).
 */
export function classifyVersionDateSlot(
  row: any,
  lang: "EN" | "GJ",
  version: number,
): VersionDateTier | null {
  const expectsGj = expectedDocxSlotsForRow(row) >= 2;
  if (lang === "GJ" && !expectsGj) return null;
  return bothDatesPresent(readSlot(row, lang, version)) ? "found" : "notFound";
}

/**
 * Aggregate per-language counts for a row across every expected version slot
 * (current + each prior version present in versionArtifacts).
 */
export function countVersionDatesPerLang(
  row: any,
  lang: "EN" | "GJ",
): { found: number; notFound: number } {
  const expectsGj = expectedDocxSlotsForRow(row) >= 2;
  if (lang === "GJ" && !expectsGj) return { found: 0, notFound: 0 };
  let found = 0;
  let notFound = 0;
  for (const v of collectExpectedVersions(row)) {
    if (bothDatesPresent(readSlot(row, lang, v))) found++;
    else notFound++;
  }
  return { found, notFound };
}

/**
 * Row-level summary across BOTH languages. Used by the top-line capsule.
 *
 *  - found:    sum of language-scoped Found slots
 *  - notFound: sum of language-scoped NotFound slots
 *
 * A single-language row contributes only its EN counts; a dual-language row
 * contributes EN + GJ.
 */
export function countVersionDatesAllLangs(
  row: any,
): { found: number; notFound: number } {
  const en = countVersionDatesPerLang(row, "EN");
  const gj = countVersionDatesPerLang(row, "GJ");
  return { found: en.found + gj.found, notFound: en.notFound + gj.notFound };
}

/**
 * True when the row has any (lang, version) slot with at least one missing date.
 * Used by SOPTable when the capsule filter is "dateNotFoundv".
 */
export function rowHasAnyMissingVersionDate(row: any): boolean {
  const en = countVersionDatesPerLang(row, "EN");
  if (en.notFound > 0) return true;
  const gj = countVersionDatesPerLang(row, "GJ");
  return gj.notFound > 0;
}

/** True when EVERY expected slot has both dates. */
export function rowAllVersionDatesFound(row: any): boolean {
  const en = countVersionDatesPerLang(row, "EN");
  const gj = countVersionDatesPerLang(row, "GJ");
  // Only require GJ presence if dual-row (GJ counts will be 0/0 for single rows).
  if (en.notFound > 0) return false;
  if (gj.notFound > 0) return false;
  return en.found + gj.found > 0;
}
