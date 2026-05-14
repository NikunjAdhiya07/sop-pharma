/**
 * Dashboard version status — exactly 2 user-facing buckets:
 *
 *  - "allTwoFound" : Version-0 SOPs (no prior versions expected), OR all
 *                    expected prior versions have actual files (DOCX or PDF) → green
 *  - "notFound"    : Expected prior versions exist but not all have files → red
 *
 * "Available" means the version slot has at least one actual file (docxPath or pdfPath).
 * A prior SOP record that exists in the DB but has no files is NOT counted as found.
 * For dual-language rows, a version is only fully found when BOTH ENG and GUJ have files.
 */
import { parseRevisionFromSopIdentifier } from "./sopIdentifierNormalize";
import { expectedDocxSlotsForRow } from "./registryRowDocCounts";

export type SopVersionCapsuleTier = "allTwoFound" | "notFound";

export type SopVersionFilterSegment = "allTwov" | "notFoundv";

/** Returns true if a VersionArtifactEntry has at least one actual file path. */
function artifactHasFiles(e: { docxPath?: string; pdfPath?: string }): boolean {
  return !!(e.docxPath?.trim()) || !!(e.pdfPath?.trim());
}

/**
 * Classify a primary registry row for the Version capsule (2 mutually exclusive buckets).
 *
 * Uses versionArtifacts / versionArtifactsGujarati (the actual file paths) as the sole
 * source of truth — matching exactly what the Prior Versions column renders. We do NOT
 * fall back to previousVersionsStatus, since that field flags slots as available when a
 * legacy SOP identifier exists in any catalog (even without an uploaded file), which
 * desynced the capsule counts from the visible Prior Versions DOCX/PDF/X markers.
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

  // "Found" must mean **a real file is attached for that prior version** — the same
  // source the registry "Prior Versions" column uses to render DOCX/PDF links vs the
  // red X. We never fall back to `previousVersionsStatus` here because that field
  // marks slots available whenever a legacy SOP identifier exists in any catalog,
  // even when no file artifact has been uploaded — which made the green bucket pull
  // in rows whose Prior Versions column was clearly showing missing files.
  let foundCount = 0;
  for (let i = 1; i <= expectedSlots; i++) {
    const prev = currentVer - i;

    const enEntry = enArtifacts.find((e) => Number(e.version) === prev);
    const gjEntry = gjArtifacts.find((e) => Number(e.version) === prev);

    const enHasFiles = !!(enEntry && artifactHasFiles(enEntry));
    const gjHasFiles = !!(gjEntry && artifactHasFiles(gjEntry));

    if (isDual) {
      if (enHasFiles && gjHasFiles) foundCount++;
    } else {
      if (enHasFiles || gjHasFiles) foundCount++;
    }
  }

  if (foundCount >= expectedSlots) return "allTwoFound";
  return "notFound";
}

export type SopVersionScope = {
  /** "EN" reads versionArtifacts; "GJ" reads versionArtifactsGujarati. */
  lang: "EN" | "GJ";
  /** "docx" checks docxPath; "pdf" checks pdfPath. */
  format: "docx" | "pdf";
};

/**
 * Per-language, per-format classification for the version sub-rows.
 *
 * Returns "allTwoFound" when:
 *  - Row is version-0 or has no `-NN` revision suffix (nothing prior to check), AND the row
 *    is actually expected to have that language slot.
 *  - All expected prior versions have a file of the requested format in the requested language.
 *
 * Returns "notFound" when:
 *  - Row expects this language slot but at least one prior version is missing the requested format.
 *
 * Returns `null` when the row is **not in scope** (e.g. EN-only row asked about Gujarati). The caller
 * should exclude these rows from both buckets so the EN+GJ totals never exceed the row count.
 */
export function classifySopVersionPerLangFormat(
  row: any,
  scope: SopVersionScope,
): SopVersionCapsuleTier | null {
  const expectsEn = true; // every primary row expects English by definition
  const expectsGj = expectedDocxSlotsForRow(row) >= 2;

  if (scope.lang === "GJ" && !expectsGj) return null;
  if (scope.lang === "EN" && !expectsEn) return null;

  const currentVer = parseRevisionFromSopIdentifier(String(row?.sopNo || ""));
  if (currentVer === null) return "allTwoFound";
  if (currentVer === 0) return "allTwoFound";

  const expectedSlots = currentVer >= 2 ? 2 : 1;

  const artifacts: { version: number; docxPath?: string; pdfPath?: string }[] =
    scope.lang === "EN"
      ? Array.isArray(row?.versionArtifacts)
        ? row.versionArtifacts
        : []
      : Array.isArray(row?.versionArtifactsGujarati)
        ? row.versionArtifactsGujarati
        : [];

  // "Found" = the requested format/language artifact has a real file path. We do not
  // fall back to `previousVersionsStatus`: it can mark slots available purely because
  // a prior identifier exists somewhere, which decoupled this classifier from the
  // table's DOCX/PDF X-mark rendering and made green/red counts disagree with the
  // visible Prior Versions column.
  let foundCount = 0;
  for (let i = 1; i <= expectedSlots; i++) {
    const prev = currentVer - i;
    const entry = artifacts.find((e) => Number(e.version) === prev);
    if (!entry) continue;
    const hasFile =
      scope.format === "docx"
        ? !!entry.docxPath?.trim()
        : !!entry.pdfPath?.trim();
    if (hasFile) foundCount++;
  }

  return foundCount >= expectedSlots ? "allTwoFound" : "notFound";
}
