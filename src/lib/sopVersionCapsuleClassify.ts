/**
 * Dashboard version status — exactly 2 user-facing buckets:
 *
 *  - "allTwoFound" : Version-0 SOPs (no prior versions expected), OR every expected
 *                    prior version has BOTH DOCX and PDF for every required language → green
 *  - "notFound"    : At least one required (lang, format) artifact is missing for some
 *                    expected prior version → red
 *
 * Strict semantics: a single-language SOP needs EN DOCX AND EN PDF; a dual-language
 * SOP additionally needs GJ DOCX AND GJ PDF. Any one missing file flips the SOP to red.
 */
import { parseRevisionFromSopIdentifier } from "./sopIdentifierNormalize";
import { expectedDocxSlotsForRow } from "./registryRowDocCounts";

export type SopVersionCapsuleTier = "allTwoFound" | "notFound";

export type SopVersionFilterSegment = "allTwov" | "notFoundv";

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

  // Strict rule: a prior version slot is "found" only when EVERY required
  // (lang, format) artifact has a real file path. Single-lang SOP needs EN DOCX
  // AND EN PDF; dual-lang SOP additionally needs GJ DOCX AND GJ PDF. Any one
  // missing piece flips the whole SOP to "notFound". `previousVersionsStatus`
  // is intentionally not consulted — it can mark slots available purely because
  // a legacy identifier exists in some catalog, which desyncs from the visible
  // Prior Versions DOCX/PDF/X markers.
  let foundCount = 0;
  for (let i = 1; i <= expectedSlots; i++) {
    const prev = currentVer - i;

    const enEntry = enArtifacts.find((e) => Number(e.version) === prev);
    const gjEntry = gjArtifacts.find((e) => Number(e.version) === prev);

    const enDocx = !!enEntry?.docxPath?.trim();
    const enPdf  = !!enEntry?.pdfPath?.trim();
    const gjDocx = !!gjEntry?.docxPath?.trim();
    const gjPdf  = !!gjEntry?.pdfPath?.trim();

    const enComplete = enDocx && enPdf;
    const gjComplete = gjDocx && gjPdf;

    if (isDual) {
      if (enComplete && gjComplete) foundCount++;
    } else {
      if (enComplete) foundCount++;
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
