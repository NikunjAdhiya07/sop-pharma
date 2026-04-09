"use client";

import { useMemo, ReactNode } from "react";
import { Video, Presentation, FileText } from "lucide-react";
import {
  countRowDocxPdfForCapsules,
  expectedDocxSlotsForRow,
  expectedPdfSlotsForRow,
  scanRowLanguageFileSlots,
} from "@/lib/registryRowDocCounts";
import { isArtifactOnlyRegistryRow, isStandardRegistrySopNumber } from "@/lib/registryPrimaryRows";
import { CAPSULE_DEPARTMENTS } from "@/lib/capsuleDepartments";
import {
  classifySopVersionCapsule,
  type SopVersionFilterSegment,
} from "@/lib/sopVersionCapsuleClassify";

export { CAPSULE_DEPARTMENTS } from "@/lib/capsuleDepartments";

type CapsuleAcc = {
  total: number;
  dualLang: number;
  expired: number;
  nearExpiry: number;
  docxSOPs: number;
  pdfSOPs: number;
  expectedDocx: number;
  expectedPdf: number;
  docxFiles: number;
  pdfFiles: number;
  missingDocxRows: number;
  missingPdfRows: number;
  eng: number;
  guj: number;
  videos: number;
  slides: number;
  videoRequired: number;
  slideRequired: number;
  videoAvailable: number;
  slideAvailable: number;
  versionAllTwoFound: number;
  versionOnlyOneFound: number;
  versionNotFound: number;
  missingExpiry: number;
  langDocx: Map<string, { found: number; missing: number }>;
  langPdf: Map<string, { found: number; missing: number }>;
  langDocxVersion: Map<string, { allTwoFound: number; onlyOneFound: number; notFound: number }>;
  langPdfVersion: Map<string, { allTwoFound: number; onlyOneFound: number; notFound: number }>;
  docxVersionAllTwoFound: number;
  docxVersionOnlyOneFound: number;
  docxVersionNotFound: number;
  pdfVersionAllTwoFound: number;
  pdfVersionOnlyOneFound: number;
  pdfVersionNotFound: number;
};

function emptyCapsuleAcc(): CapsuleAcc {
  return {
    total: 0,
    dualLang: 0,
    expired: 0,
    nearExpiry: 0,
    docxSOPs: 0,
    pdfSOPs: 0,
    expectedDocx: 0,
    expectedPdf: 0,
    docxFiles: 0,
    pdfFiles: 0,
    missingDocxRows: 0,
    missingPdfRows: 0,
    eng: 0,
    guj: 0,
    videos: 0,
    slides: 0,
    videoRequired: 0,
    slideRequired: 0,
    videoAvailable: 0,
    slideAvailable: 0,
    versionAllTwoFound: 0,
    versionOnlyOneFound: 0,
    versionNotFound: 0,
    missingExpiry: 0,
    langDocx: new Map(),
    langPdf: new Map(),
    langDocxVersion: new Map(),
    langPdfVersion: new Map(),
    docxVersionAllTwoFound: 0,
    docxVersionOnlyOneFound: 0,
    docxVersionNotFound: 0,
    pdfVersionAllTwoFound: 0,
    pdfVersionOnlyOneFound: 0,
    pdfVersionNotFound: 0,
  };
}

function langShortCode(lang: string): string {
  if (lang === "English") return "EN";
  if (lang === "Gujarati") return "GJ";
  return lang.substring(0, 2).toUpperCase();
}

function sortLangCodes(codes: string[]): string[] {
  return [...codes].sort((a, b) => {
    if (a === "EN") return -1;
    if (b === "EN") return 1;
    if (a === "GJ") return -1;
    if (b === "GJ") return 1;
    return a.localeCompare(b);
  });
}

function foldRegistryRowIntoCapsuleAcc(
  s: CapsuleAcc,
  row: any,
  today: Date,
  dayMs: number,
) {
  s.total++;

  /** Bilingual for registry math: expect EN + GU document slots (not only DB `isDualLanguage`). */
  if (expectedDocxSlotsForRow(row) >= 2) s.dualLang++;

  if (row.expiryDate) {
    const exp = new Date(row.expiryDate).getTime();
    // Use Math.floor so that a SOP whose date is fractionally past midnight is
    // counted the same way the parent expiry filter counts it (diffDays < 0 → expired).
    const diffDays = Math.floor((exp - today.getTime()) / dayMs);
    if (diffDays < 0) s.expired++;
    else if (diffDays <= 30) s.nearExpiry++; // "Near" matches the "high" filter (0-30 days)
  }

  const { docx: nDocxFiles, pdf: nPdfFiles } = countRowDocxPdfForCapsules(row);
  s.docxFiles += nDocxFiles;
  s.pdfFiles += nPdfFiles;
  if (nDocxFiles > 0) s.docxSOPs++;
  if (nPdfFiles > 0) s.pdfSOPs++;

  const expDocx = expectedDocxSlotsForRow(row);
  const expPdf = expectedPdfSlotsForRow(row);
  s.expectedDocx += expDocx;
  s.expectedPdf += expPdf;

  if (nDocxFiles < expDocx) s.missingDocxRows++;
  if (nPdfFiles < expPdf) s.missingPdfRows++;

  if (row.englishVersion) s.eng++;
  if (row.gujaratiVersion) s.guj++;
  if (row.mediaStatus?.videos) s.videos++;
  if (row.mediaStatus?.slides) s.slides++;

  s.videoRequired += row.mediaStatus?.videoRequired ?? (row.isDualLanguage ? 4 : 2);
  s.slideRequired += row.mediaStatus?.slideRequired ?? (row.isDualLanguage ? 2 : 1);
  s.videoAvailable += row.mediaStatus?.videoAvailable ?? 0;
  s.slideAvailable += row.mediaStatus?.slideAvailable ?? 0;

  const vt = classifySopVersionCapsule(row);
  if (vt === "allTwoFound") s.versionAllTwoFound++;
  else if (vt === "onlyOneFound") s.versionOnlyOneFound++;
  else s.versionNotFound++;

  if (!row.expiryDate) s.missingExpiry++;

  // Per-language breakdown
  const slots = scanRowLanguageFileSlots(row);
  const isDualDocx = expectedDocxSlotsForRow(row) >= 2;
  const isDualPdf = expectedPdfSlotsForRow(row) >= 2;

  const langPairs: Array<{
    code: string;
    docxFound: boolean;
    pdfFound: boolean;
    expectDocx: boolean;
    expectPdf: boolean;
  }> = [
    {
      code: "EN",
      docxFound: slots.engDocx,
      pdfFound: slots.engPdf,
      expectDocx: true,
      expectPdf: true,
    },
  ];

  if (isDualDocx || isDualPdf) {
    langPairs.push({
      code: "GJ",
      docxFound: slots.gujDocx,
      pdfFound: slots.gujPdf,
      expectDocx: isDualDocx,
      expectPdf: isDualPdf,
    });
  }

  for (const lp of langPairs) {
    // DOCX per-language
    if (lp.expectDocx) {
      if (!s.langDocx.has(lp.code)) {
        s.langDocx.set(lp.code, { found: 0, missing: 0 });
      }
      const ld = s.langDocx.get(lp.code)!;
      if (lp.docxFound) ld.found++;
      else ld.missing++;

      // DOCX versions per-language
      if (!s.langDocxVersion.has(lp.code)) {
        s.langDocxVersion.set(lp.code, { allTwoFound: 0, onlyOneFound: 0, notFound: 0 });
      }
      const ldv = s.langDocxVersion.get(lp.code)!;
      if (vt === "allTwoFound") ldv.allTwoFound++;
      else if (vt === "onlyOneFound") ldv.onlyOneFound++;
      else ldv.notFound++;
    }

    // PDF per-language
    if (lp.expectPdf) {
      if (!s.langPdf.has(lp.code)) {
        s.langPdf.set(lp.code, { found: 0, missing: 0 });
      }
      const lp2 = s.langPdf.get(lp.code)!;
      if (lp.pdfFound) lp2.found++;
      else lp2.missing++;

      // PDF versions per-language
      if (!s.langPdfVersion.has(lp.code)) {
        s.langPdfVersion.set(lp.code, { allTwoFound: 0, onlyOneFound: 0, notFound: 0 });
      }
      const lpv = s.langPdfVersion.get(lp.code)!;
      if (vt === "allTwoFound") lpv.allTwoFound++;
      else if (vt === "onlyOneFound") lpv.onlyOneFound++;
      else lpv.notFound++;
    }
  }

  // Aggregate version counts by file type
  if (nDocxFiles > 0) {
    if (vt === "allTwoFound") s.docxVersionAllTwoFound++;
    else if (vt === "onlyOneFound") s.docxVersionOnlyOneFound++;
    else s.docxVersionNotFound++;
  }

  if (nPdfFiles > 0) {
    if (vt === "allTwoFound") s.pdfVersionAllTwoFound++;
    else if (vt === "onlyOneFound") s.pdfVersionOnlyOneFound++;
    else s.pdfVersionNotFound++;
  }
}

function accToDeptCapsuleStats(department: string, s: CapsuleAcc): DeptCapsuleStats {
  return {
    department,
    totalSOPs: s.total,
    dualLangRows: s.dualLang,
    expired: s.expired,
    nearExpiry: s.nearExpiry,
    docxSOPs: s.docxSOPs,
    pdfSOPs: s.pdfSOPs,
    expectedDocx: s.expectedDocx,
    expectedPdf: s.expectedPdf,
    docxFiles: s.docxFiles,
    pdfFiles: s.pdfFiles,
    missingDocxRows: s.missingDocxRows,
    missingPdfRows: s.missingPdfRows,
    eng: s.eng,
    guj: s.guj,
    videos: s.videos,
    slides: s.slides,
    videoRequired: s.videoRequired,
    slideRequired: s.slideRequired,
    videoAvailable: s.videoAvailable,
    slideAvailable: s.slideAvailable,
    versionAllTwoFound: s.versionAllTwoFound,
    versionOnlyOneFound: s.versionOnlyOneFound,
    versionNotFound: s.versionNotFound,
    missingExpiry: s.missingExpiry,
    langDocx: s.langDocx,
    langPdf: s.langPdf,
    langDocxVersion: s.langDocxVersion,
    langPdfVersion: s.langPdfVersion,
    docxVersionAllTwoFound: s.docxVersionAllTwoFound,
    docxVersionOnlyOneFound: s.docxVersionOnlyOneFound,
    docxVersionNotFound: s.docxVersionNotFound,
    pdfVersionAllTwoFound: s.pdfVersionAllTwoFound,
    pdfVersionOnlyOneFound: s.pdfVersionOnlyOneFound,
    pdfVersionNotFound: s.pdfVersionNotFound,
  };
}

/** Total row: every primary-format registry row (same scope as `filterPrimaryRegistryRows`), not only the 7 named departments. */
export function computeCapsuleGrandTotalStat(data: any[]): DeptCapsuleStats {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 1000 * 60 * 60 * 24;
  const s = emptyCapsuleAcc();
  for (const row of data || []) {
    if (isArtifactOnlyRegistryRow(row)) continue;
    if (!isStandardRegistrySopNumber(row)) continue;
    foldRegistryRowIntoCapsuleAcc(s, row, today, dayMs);
  }
  return accToDeptCapsuleStats("Total", s);
}

export interface DeptCapsuleStats {
  department: string;
  totalSOPs: number;
  dualLangRows: number;
  expired: number;
  nearExpiry: number;
  docxSOPs: number;
  pdfSOPs: number;
  expectedDocx: number;
  expectedPdf: number;
  docxFiles: number;
  pdfFiles: number;
  missingDocxRows: number;
  missingPdfRows: number;
  eng: number;
  guj: number;
  videos: number;
  slides: number;
  videoRequired: number;
  slideRequired: number;
  videoAvailable: number;
  slideAvailable: number;
  /** All Two Found: version-0 SOPs or all expected prior versions available */
  versionAllTwoFound: number;
  /** Only One Found: exactly 1 of 2 expected prior versions available */
  versionOnlyOneFound: number;
  /** Not Found: expected prior versions exist but none were found */
  versionNotFound: number;
  missingExpiry: number;
  langDocx: Map<string, { found: number; missing: number }>;
  langPdf: Map<string, { found: number; missing: number }>;
  langDocxVersion: Map<string, { allTwoFound: number; onlyOneFound: number; notFound: number }>;
  langPdfVersion: Map<string, { allTwoFound: number; onlyOneFound: number; notFound: number }>;
  docxVersionAllTwoFound: number;
  docxVersionOnlyOneFound: number;
  docxVersionNotFound: number;
  pdfVersionAllTwoFound: number;
  pdfVersionOnlyOneFound: number;
  pdfVersionNotFound: number;
}

function computeDepartmentStats(data: any[]): DeptCapsuleStats[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = 1000 * 60 * 60 * 24;

  const byDept = new Map<string, CapsuleAcc>();

  const order = [...CAPSULE_DEPARTMENTS];
  order.forEach((dept) => {
    byDept.set(dept, emptyCapsuleAcc());
  });

  const normalizeDept = (raw: string): string => {
    if (!raw) return "";
    const lower = raw.toLowerCase().trim();
    if (lower === "total") return "";
    if (lower === "qa" || lower.includes("quality assurance")) return "QA";
    if (lower === "qc" || lower.includes("quality control")) return "QC";
    if (lower.includes("micro")) return "Microbiology";
    if (lower.includes("engineer")) return "Engineering and Maintenance";
    if (lower.includes("person") || lower.includes("hr")) return "Personnel";
    if (lower.includes("store")) return "Store";
    if (lower.includes("prod")) return "Production";
    const exact = order.find((d) => d === raw);
    if (exact) return exact;
    return raw;
  };

  data.forEach((row: any) => {
    if (isArtifactOnlyRegistryRow(row)) return;

    const rawDept = row.department || "";
    const dept = normalizeDept(rawDept);
    if (!dept || !(order as readonly string[]).includes(dept)) return;

    const s = byDept.get(dept)!;
    foldRegistryRowIntoCapsuleAcc(s, row, today, day);
  });

  return order.map((department) =>
    accToDeptCapsuleStats(department, byDept.get(department)!),
  );
}

function CapsuleMetric({
  label,
  value,
  valueClass,
  onClick,
  title,
  isActive,
}: {
  label: ReactNode;
  value: number;
  valueClass?: string;
  onClick: () => void;
  title: string;
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      title={title}
      aria-pressed={isActive ? true : undefined}
      className={`flex w-full min-h-[24px] cursor-pointer items-center justify-between gap-1.5 rounded-[4px] px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-purple-100/80 active:bg-purple-200/60 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:ring-offset-0 ${
        isActive
          ? "border border-purple-400 bg-purple-100/90"
          : "border border-transparent"
      }`}>
      <span className="min-w-0 shrink text-gray-600">{label}</span>
      <span
        className={`font-bold tabular-nums shrink-0 leading-tight ${valueClass ?? "text-gray-900"}`}>
        {value}
      </span>
    </button>
  );
}

export type CapsuleAvailMetric = "docx" | "pdf" | "video" | "slides";

/** Green = filled slots (DOCX/PDF); red = missing slots; click filters still use row-level “has any” / “has gap”. */
function CapsuleMetricAvailMissing({
  label,
  totalExpected,
  available,
  missingCount,
  onFilterClick,
  onAvailableClick,
  onMissingClick,
  highlightAvailable,
  highlightMissing,
  filterRowActive,
  titleSummary,
}: {
  label: ReactNode;
  totalExpected: number;
  available: number;
  missingCount?: number;
  onFilterClick: () => void;
  onAvailableClick: () => void;
  onMissingClick: () => void;
  highlightAvailable: boolean;
  highlightMissing: boolean;
  filterRowActive: boolean;
  titleSummary: string;
}) {
  const missing = missingCount !== undefined ? missingCount : Math.max(0, totalExpected - available);

  return (
    <div
      className={`grid min-h-[26px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[5px] px-1 py-px text-[10px] transition-colors ${
        filterRowActive
          ? "bg-purple-50/90 ring-1 ring-purple-300/80"
          : "border border-transparent"
      }`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onFilterClick();
        }}
        title={`Filter: ${titleSummary}`}
        aria-pressed={filterRowActive ? true : undefined}
        className="min-w-0 cursor-pointer truncate text-left text-gray-600 transition-colors hover:text-purple-800 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400 rounded px-0.5 -mx-0.5">
        {label}
      </button>
      <div
        className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm tabular-nums"
        aria-label={`${available} slots filled, ${missing} missing of ${totalExpected} expected`}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAvailableClick();
          }}
          title="Show only rows that have this attachment; sort by count (highest first)"
          aria-pressed={highlightAvailable ? true : undefined}
          className={`min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-emerald-500/70 ${
            highlightAvailable
              ? "bg-emerald-100 ring-1 ring-emerald-400/80"
              : ""
          }`}>
          {available}
        </button>
        <span
          className="select-none text-[8px] font-light text-gray-300"
          aria-hidden>
          |
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMissingClick();
          }}
          title="Show only rows missing this attachment; sort by count (lowest first)"
          aria-pressed={highlightMissing ? true : undefined}
          className={`min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-red-600 transition-colors hover:bg-red-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-red-400/70 ${
            highlightMissing ? "bg-red-100 ring-1 ring-red-400/80" : ""
          }`}>
          {missing}
        </button>
      </div>
    </div>
  );
}

/** Two language sub-rows (EN, GUJ) on same horizontal line with aligned counts */
function CompactLanguagePairRow({
  langDataMap,
  onAvailableClick,
  onMissingClick,
  filterSnapshot,
}: {
  langDataMap: Map<string, { found: number; missing: number; filter: "ENG" | "GUJ" }>;
  onAvailableClick: (lang: "ENG" | "GUJ") => void;
  onMissingClick: (lang: "ENG" | "GUJ") => void;
  filterSnapshot: CapsuleFilterSnapshot;
}) {
  const langs = sortLangCodes([...langDataMap.keys()]);

  return (
    <div className="flex w-full min-h-[22px] items-center justify-between gap-1 px-1 py-0 text-[9px]">
      {langs.map((lang) => {
        const data = langDataMap.get(lang)!;
        const langFilter = data.filter;
        const isAvailActive =
          filterSnapshot.filterLanguage === langFilter &&
          filterSnapshot.filterFileType !== "NO_DOCX" &&
          filterSnapshot.filterFileType !== "NO_PDF" &&
          !filterSnapshot.filterDualLang &&
          filterSnapshot.filterExpiry === "all" &&
          filterSnapshot.filterMedia === "all" &&
          filterSnapshot.filterVersionStatus === "all";
        const isMissingActive =
          filterSnapshot.filterLanguage === langFilter &&
          (filterSnapshot.filterFileType === "NO_DOCX" || filterSnapshot.filterFileType === "NO_PDF") &&
          !filterSnapshot.filterDualLang &&
          filterSnapshot.filterExpiry === "all" &&
          filterSnapshot.filterMedia === "all" &&
          filterSnapshot.filterVersionStatus === "all";

        return (
          <div key={lang} className="flex items-center gap-0.5">
            <span className="text-gray-500 text-[9px] font-medium min-w-fit">{lang}</span>
            <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/80 bg-white/90 px-0.5 py-0.5 shadow-sm tabular-nums">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAvailableClick(langFilter); }}
                className={`min-w-[1.3rem] cursor-pointer rounded px-0.5 py-0 text-center text-[10px] font-bold leading-tight text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400 ${
                  isAvailActive ? "bg-emerald-100 ring-1 ring-emerald-400/80" : ""
                }`}>
                {data.found}
              </button>
              <span className="select-none text-[7px] text-gray-300 leading-tight">|</span>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMissingClick(langFilter); }}
                className={`min-w-[1.3rem] cursor-pointer rounded px-0.5 py-0 text-center text-[10px] font-bold leading-tight text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-400 ${
                  isMissingActive ? "bg-red-100 ring-1 ring-red-400/80" : ""
                }`}>
                {data.missing}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Version row: 3 buckets.
 * Green = All Two Found (version-0 SOPs or all expected prior versions present)
 * Amber = Only One Found (exactly 1 of 2 expected prior versions present)
 * Red   = Not Found (expected prior versions exist but none were found)
 */
function CapsuleMetricVersionTriple({
  totalSOPs,
  allTwoFoundV,
  onlyOneFoundV,
  notFoundV,
  onLabelClick,
  onGreenClick,
  onAmberClick,
  onRedClick,
  highlightGreen,
  highlightAmber,
  highlightRed,
  filterRowActive,
  titleSummary,
  label = "Versions",
}: {
  totalSOPs: number;
  allTwoFoundV: number;
  onlyOneFoundV: number;
  notFoundV: number;
  onLabelClick: () => void;
  onGreenClick: () => void;
  onAmberClick: () => void;
  onRedClick: () => void;
  highlightGreen: boolean;
  highlightAmber: boolean;
  highlightRed: boolean;
  filterRowActive: boolean;
  titleSummary: string;
  label?: ReactNode;
}) {
  return (
    <div
      className={`grid min-h-[26px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[5px] px-1 py-px text-[10px] transition-colors ${
        filterRowActive
          ? "bg-purple-50/90 ring-1 ring-purple-300/80"
          : "border border-transparent"
      }`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onLabelClick();
        }}
        title={`Filter: ${titleSummary}`}
        aria-pressed={filterRowActive ? true : undefined}
        className="min-w-0 cursor-pointer truncate text-left text-gray-600 transition-colors hover:text-purple-800 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400 rounded px-0.5 -mx-0.5">
        {label}
      </button>
      <div
        className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm tabular-nums"
        aria-label={`Version status: ${allTwoFoundV} all two found, ${onlyOneFoundV} only one found, ${notFoundV} not found of ${totalSOPs} SOPs`}>
        {/* All Two Found — version-0 SOPs or all expected prior versions available */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onGreenClick(); }}
          title={`All Two Found: ${allTwoFoundV} SOPs (version-0 or all expected prior versions available)`}
          aria-pressed={highlightGreen ? true : undefined}
          className={`min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-emerald-500/70 ${
            highlightGreen ? "bg-emerald-100 ring-1 ring-emerald-400/80" : ""
          }`}>
          {allTwoFoundV}
        </button>
        <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
        {/* Only One Found — exactly 1 of 2 expected prior versions available */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAmberClick(); }}
          title={`Only One Found: ${onlyOneFoundV} SOPs with exactly 1 of 2 prior versions available`}
          aria-pressed={highlightAmber ? true : undefined}
          className={`min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-amber-600 transition-colors hover:bg-amber-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-amber-400/70 ${
            highlightAmber ? "bg-amber-100 ring-1 ring-amber-400/80" : ""
          }`}>
          {onlyOneFoundV}
        </button>
        <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
        {/* Not Found — expected prior versions but none found */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRedClick(); }}
          title={`Not Found: ${notFoundV} SOPs with expected prior versions but none stored`}
          aria-pressed={highlightRed ? true : undefined}
          className={`min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-red-600 transition-colors hover:bg-red-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-red-400/70 ${
            highlightRed ? "bg-red-100 ring-1 ring-red-400/80" : ""
          }`}>
          {notFoundV}
        </button>
      </div>
    </div>
  );
}

/** One preset per metric row — parent applies full filter state (avoids stale Dual/lang/etc. stacking). */
export type CapsuleFilterMode =
  | "all"
  | "dual"
  | "eng"
  | "guj"
  | "expired"
  | "near"
  | "nodate"
  | "docx"
  | "pdf"
  | "video"
  | "slides";

export type CapsuleFilterSnapshot = {
  filterDept: string;
  filterDualLang: boolean;
  filterExpiry: string;
  filterFileType: "all" | "DOCX" | "NO_DOCX" | "PDF" | "NO_PDF";
  filterLanguage: "all" | "ENG" | "GUJ" | "BOTH";
  filterMedia: string;
  filterVersionStatus: "all" | SopVersionFilterSegment;
};

function capsuleVersionSegmentMatches(
  deptScope: string,
  segment: SopVersionFilterSegment,
  f: CapsuleFilterSnapshot,
): boolean {
  if (f.filterDept !== deptScope) return false;
  if (
    f.filterDualLang ||
    f.filterExpiry !== "all" ||
    f.filterLanguage !== "all" ||
    f.filterFileType !== "all" ||
    f.filterMedia !== "all"
  )
    return false;
  return f.filterVersionStatus === segment;
}

function capsuleAvailMissMatches(
  deptScope: string,
  metric: CapsuleAvailMetric,
  side: "available" | "missing",
  f: CapsuleFilterSnapshot,
): boolean {
  if (f.filterDept !== deptScope) return false;
  if (
    f.filterDualLang ||
    f.filterExpiry !== "all" ||
    f.filterLanguage !== "all" ||
    f.filterVersionStatus !== "all"
  )
    return false;

  if (metric === "docx") {
    if (f.filterMedia !== "all") return false;
    return side === "available"
      ? f.filterFileType === "DOCX"
      : f.filterFileType === "NO_DOCX";
  }
  if (metric === "pdf") {
    if (f.filterMedia !== "all") return false;
    return side === "available"
      ? f.filterFileType === "PDF"
      : f.filterFileType === "NO_PDF";
  }
  if (metric === "video") {
    if (f.filterFileType !== "all") return false;
    return side === "available"
      ? f.filterMedia === "video"
      : f.filterMedia === "no-video";
  }
  if (metric === "slides") {
    if (f.filterFileType !== "all") return false;
    return side === "available"
      ? f.filterMedia === "slides"
      : f.filterMedia === "no-slides";
  }
  return false;
}

function capsuleMetricMatches(
  deptScope: string,
  mode: CapsuleFilterMode,
  f: CapsuleFilterSnapshot,
): boolean {
  if (f.filterDept !== deptScope) return false;
  const neutral =
    !f.filterDualLang &&
    f.filterExpiry === "all" &&
    f.filterFileType === "all" &&
    f.filterLanguage === "all" &&
    f.filterMedia === "all" &&
    f.filterVersionStatus === "all";
  switch (mode) {
    case "all":
      return neutral;
    case "dual":
      return (
        f.filterDualLang &&
        f.filterExpiry === "all" &&
        f.filterFileType === "all" &&
        f.filterLanguage === "all" &&
        f.filterMedia === "all" &&
        f.filterVersionStatus === "all"
      );
    case "eng":
      return (
        !f.filterDualLang &&
        f.filterExpiry === "all" &&
        f.filterFileType === "all" &&
        f.filterLanguage === "ENG" &&
        f.filterMedia === "all" &&
        f.filterVersionStatus === "all"
      );
    case "guj":
      return (
        !f.filterDualLang &&
        f.filterExpiry === "all" &&
        f.filterFileType === "all" &&
        f.filterLanguage === "GUJ" &&
        f.filterMedia === "all" &&
        f.filterVersionStatus === "all"
      );
    case "expired":
      return (
        !f.filterDualLang &&
        f.filterExpiry === "expired" &&
        f.filterFileType === "all" &&
        f.filterLanguage === "all" &&
        f.filterMedia === "all" &&
        f.filterVersionStatus === "all"
      );
    case "near":
      return (
        !f.filterDualLang &&
        f.filterExpiry === "high" &&
        f.filterFileType === "all" &&
        f.filterLanguage === "all" &&
        f.filterMedia === "all" &&
        f.filterVersionStatus === "all"
      );
    case "nodate":
      return (
        !f.filterDualLang &&
        f.filterExpiry === "nodate" &&
        f.filterFileType === "all" &&
        f.filterLanguage === "all" &&
        f.filterMedia === "all" &&
        f.filterVersionStatus === "all"
      );
    case "docx":
      return (
        !f.filterDualLang &&
        f.filterExpiry === "all" &&
        f.filterFileType === "DOCX" &&
        f.filterLanguage === "all" &&
        f.filterMedia === "all" &&
        f.filterVersionStatus === "all"
      );
    case "pdf":
      return (
        !f.filterDualLang &&
        f.filterExpiry === "all" &&
        f.filterFileType === "PDF" &&
        f.filterLanguage === "all" &&
        f.filterMedia === "all" &&
        f.filterVersionStatus === "all"
      );
    case "video":
      return (
        !f.filterDualLang &&
        f.filterExpiry === "all" &&
        f.filterFileType === "all" &&
        f.filterLanguage === "all" &&
        f.filterMedia === "video" &&
        f.filterVersionStatus === "all"
      );
    case "slides":
      return (
        !f.filterDualLang &&
        f.filterExpiry === "all" &&
        f.filterFileType === "all" &&
        f.filterLanguage === "all" &&
        f.filterMedia === "slides" &&
        f.filterVersionStatus === "all"
      );
    default:
      return false;
  }
}

function DepartmentCapsuleCard({
  stat,
  applyCapsuleFilter,
  applyCapsuleAvailMiss,
  applyCapsuleVersionSegment,
  filterSnapshot,
  variant = "department",
}: {
  stat: DeptCapsuleStats;
  applyCapsuleFilter: (dept: string, mode: CapsuleFilterMode) => void;
  applyCapsuleAvailMiss: (
    dept: string,
    metric: CapsuleAvailMetric,
    side: "available" | "missing",
    lang?: "ENG" | "GUJ",
  ) => void;
  applyCapsuleVersionSegment: (
    dept: string,
    segment: SopVersionFilterSegment,
  ) => void;
  filterSnapshot: CapsuleFilterSnapshot;
  variant?: "department" | "grand";
}) {
  const isGrand = variant === "grand";
  const label = isGrand ? "Total" : (stat.department ?? "Other");
  const deptForFilter = isGrand ? "All" : label;
  const scopeHint = isGrand ? "All departments" : label;

  const apply = (mode: CapsuleFilterMode) =>
    applyCapsuleFilter(deptForFilter, mode);

  const headerActive =
    !isGrand && capsuleMetricMatches(deptForFilter, "all", filterSnapshot);

  return (
    <div
      className={`flex w-full min-w-0 flex-col rounded-[10px] border px-2 py-1.5 text-left shadow-sm ${
        isGrand ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white"
      }`}>
      <div
        role="button"
        tabIndex={isGrand ? -1 : 0}
        onClick={() => !isGrand && apply("all")}
        onKeyDown={(e) => {
          if (isGrand) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            apply("all");
          }
        }}
        className={`mb-2 flex w-full min-h-[40px] items-start gap-1.5 rounded-md border-b pb-2 ${
          isGrand
            ? "cursor-default border-purple-200"
            : `cursor-pointer border-gray-100 hover:bg-purple-50/80 focus:outline-none focus:ring-2 focus:ring-purple-400 ${
                headerActive
                  ? "border-purple-300 bg-purple-100/70 ring-1 ring-purple-300"
                  : ""
              }`
        }`}        title={
          isGrand
            ? "Totals for the seven named departments only (rows with no/unmapped department are excluded). Use metric rows below to filter."
            : `Show all ${label} SOPs in the registry`
        }>
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-600" />
        <span className="min-w-0 flex-1 text-[11px] font-bold leading-tight text-gray-800 break-words">
          {label}
        </span>
      </div>
      <div className="flex flex-col gap-0 border-t border-transparent pt-0.5">
        <CapsuleMetric
          label="SOPs"
          value={stat.totalSOPs}
          onClick={() => apply("all")}
          isActive={capsuleMetricMatches(deptForFilter, "all", filterSnapshot)}
          title={
            isGrand
              ? `${stat.totalSOPs} primary SOP rows in named departments (excludes folder-only artifact rows and unmapped departments).`
              : `Primary SOP rows in ${label} (main registry records).`
          }
        />
        <CapsuleMetric
          label="Dual"
          value={stat.dualLangRows}
          onClick={() => apply("dual")}
          isActive={capsuleMetricMatches(deptForFilter, "dual", filterSnapshot)}
          title={
            isGrand
              ? "All departments: SOP rows that expect two language document slots (English + Gujarati), including bilingual pairs detected from files or version flags—not only the DB dual-language flag."
              : "Rows that expect English + Gujarati document slots (two-slot bilingual rows)."
          }
        />
        <CapsuleMetric
          label="w/ EN"
          value={stat.eng}
          onClick={() => apply("eng")}
          isActive={capsuleMetricMatches(deptForFilter, "eng", filterSnapshot)}
          title={
            isGrand
              ? "All departments: rows with an English document."
              : `Rows with an English document in ${label}`
          }
        />
        <CapsuleMetric
          label="w/ GU"
          value={stat.guj}
          onClick={() => apply("guj")}
          isActive={capsuleMetricMatches(deptForFilter, "guj", filterSnapshot)}
          title={
            isGrand
              ? "All departments: rows with Gujarati (overlaps w/ EN for dual)."
              : `Rows with Gujarati in ${label} (overlaps w/ EN for dual)`
          }
        />
        <CapsuleMetric
          label="Expired"
          value={stat.expired}
          valueClass={stat.expired > 0 ? "text-red-600" : "text-gray-700"}
          onClick={() => apply("expired")}
          isActive={capsuleMetricMatches(
            deptForFilter,
            "expired",
            filterSnapshot,
          )}
          title={
            isGrand ? "All departments: expired." : `Expired in ${scopeHint}`
          }
        />
        <CapsuleMetric
          label="Near"
          value={stat.nearExpiry}
          valueClass={stat.nearExpiry > 0 ? "text-amber-600" : "text-gray-700"}
          onClick={() => apply("near")}
          isActive={capsuleMetricMatches(deptForFilter, "near", filterSnapshot)}
          title={
            isGrand
              ? "All departments: near expiry (≤30 days)."
              : `Near expiry in ${scopeHint}`
          }
        />
        <CapsuleMetric
          label="No Date"
          value={stat.missingExpiry}
          valueClass={stat.missingExpiry > 0 ? "text-slate-700" : "text-gray-700"}
          onClick={() => apply("nodate")}
          isActive={capsuleMetricMatches(
            deptForFilter,
            "nodate",
            filterSnapshot,
          )}
          title={
            isGrand
              ? "All departments: SOPs with null/empty expiry date."
              : `SOPs with no expiry date in ${scopeHint}`
          }
        />
        {/* DOCX Section */}
        <CapsuleMetricAvailMissing
          label={`DOCX (${stat.docxFiles})`}
          totalExpected={stat.expectedDocx}
          available={stat.docxFiles}
          onFilterClick={() => apply("docx")}
          onAvailableClick={() =>
            applyCapsuleAvailMiss(deptForFilter, "docx", "available")
          }
          onMissingClick={() =>
            applyCapsuleAvailMiss(deptForFilter, "docx", "missing")
          }
          highlightAvailable={capsuleAvailMissMatches(
            deptForFilter,
            "docx",
            "available",
            filterSnapshot,
          )}
          highlightMissing={capsuleAvailMissMatches(
            deptForFilter,
            "docx",
            "missing",
            filterSnapshot,
          )}
          filterRowActive={
            capsuleAvailMissMatches(
              deptForFilter,
              "docx",
              "available",
              filterSnapshot,
            ) ||
            capsuleAvailMissMatches(
              deptForFilter,
              "docx",
              "missing",
              filterSnapshot,
            )
          }
          titleSummary={
            isGrand
              ? `${stat.docxFiles} DOCX slots filled · ${Math.max(0, stat.expectedDocx - stat.docxFiles)} missing of ${stat.expectedDocx} expected (EN+GU per bilingual row) · green = filled slots, red = missing slots`
              : `${stat.docxFiles} DOCX slots in ${label} · green = filled, red = missing`
          }
        />
        {/* DOCX Language Sub-rows (EN and GUJ side-by-side) */}
        {stat.langDocx.size > 0 && (
          <CompactLanguagePairRow
            langDataMap={new Map(
              sortLangCodes([...stat.langDocx.keys()]).map((lang) => [
                lang,
                {
                  found: stat.langDocx.get(lang)!.found,
                  missing: stat.langDocx.get(lang)!.missing,
                  filter: (lang === "EN" ? "ENG" : lang === "GJ" ? "GUJ" : lang.toUpperCase()) as "ENG" | "GUJ",
                },
              ])
            )}
            onAvailableClick={(langFilter) => {
              applyCapsuleAvailMiss(deptForFilter, "docx", "available", langFilter);
            }}
            onMissingClick={(langFilter) => {
              applyCapsuleAvailMiss(deptForFilter, "docx", "missing", langFilter);
            }}
            filterSnapshot={filterSnapshot}
          />
        )}

        {/* PDF Section — with minimal spacing */}
        <div className="h-0.5" />
        <CapsuleMetricAvailMissing
          label={`PDF (${stat.pdfFiles})`}
          totalExpected={stat.expectedPdf}
          available={stat.pdfFiles}
          onFilterClick={() => apply("pdf")}
          onAvailableClick={() =>
            applyCapsuleAvailMiss(deptForFilter, "pdf", "available")
          }
          onMissingClick={() =>
            applyCapsuleAvailMiss(deptForFilter, "pdf", "missing")
          }
          highlightAvailable={capsuleAvailMissMatches(
            deptForFilter,
            "pdf",
            "available",
            filterSnapshot,
          )}
          highlightMissing={capsuleAvailMissMatches(
            deptForFilter,
            "pdf",
            "missing",
            filterSnapshot,
          )}
          filterRowActive={
            capsuleAvailMissMatches(
              deptForFilter,
              "pdf",
              "available",
              filterSnapshot,
            ) ||
            capsuleAvailMissMatches(
              deptForFilter,
              "pdf",
              "missing",
              filterSnapshot,
            )
          }
          titleSummary={
            isGrand
              ? `${stat.pdfFiles} PDF slots filled · ${Math.max(0, stat.expectedPdf - stat.pdfFiles)} missing of ${stat.expectedPdf} expected · green = filled slots, red = missing slots`
              : `${stat.pdfFiles} PDF slots in ${label} · green = filled, red = missing`
          }
        />
        {/* PDF Language Sub-rows (EN and GUJ side-by-side) */}
        {stat.langPdf.size > 0 && (
          <CompactLanguagePairRow
            langDataMap={new Map(
              sortLangCodes([...stat.langPdf.keys()]).map((lang) => [
                lang,
                {
                  found: stat.langPdf.get(lang)!.found,
                  missing: stat.langPdf.get(lang)!.missing,
                  filter: (lang === "EN" ? "ENG" : lang === "GJ" ? "GUJ" : lang.toUpperCase()) as "ENG" | "GUJ",
                },
              ])
            )}
            onAvailableClick={(langFilter) => {
              applyCapsuleAvailMiss(deptForFilter, "pdf", "available", langFilter);
            }}
            onMissingClick={(langFilter) => {
              applyCapsuleAvailMiss(deptForFilter, "pdf", "missing", langFilter);
            }}
            filterSnapshot={filterSnapshot}
          />
        )}

        {/* Versions Section — with spacing */}
        <div className="h-1" />
        <CapsuleMetricVersionTriple
          totalSOPs={stat.totalSOPs}
          allTwoFoundV={stat.versionAllTwoFound}
          onlyOneFoundV={stat.versionOnlyOneFound}
          notFoundV={stat.versionNotFound}
          onLabelClick={() =>
            applyCapsuleVersionSegment(deptForFilter, "notFoundv")
          }
          onGreenClick={() =>
            applyCapsuleVersionSegment(deptForFilter, "allTwov")
          }
          onAmberClick={() =>
            applyCapsuleVersionSegment(deptForFilter, "onlyOnev")
          }
          onRedClick={() =>
            applyCapsuleVersionSegment(deptForFilter, "notFoundv")
          }
          highlightGreen={capsuleVersionSegmentMatches(
            deptForFilter,
            "allTwov",
            filterSnapshot,
          )}
          highlightAmber={capsuleVersionSegmentMatches(
            deptForFilter,
            "onlyOnev",
            filterSnapshot,
          )}
          highlightRed={capsuleVersionSegmentMatches(
            deptForFilter,
            "notFoundv",
            filterSnapshot,
          )}
          filterRowActive={
            capsuleVersionSegmentMatches(deptForFilter, "allTwov", filterSnapshot) ||
            capsuleVersionSegmentMatches(deptForFilter, "onlyOnev", filterSnapshot) ||
            capsuleVersionSegmentMatches(deptForFilter, "notFoundv", filterSnapshot)
          }
          titleSummary={
            isGrand
              ? "Green = All Two Found (version-0 or all prior versions present); amber = Only One Found; red = Not Found"
              : `Version in ${scopeHint} · green = All Two Found, amber = Only One Found, red = Not Found`
          }
        />
        {/* DOCX Versions Sub-section */}
        {stat.docxVersionAllTwoFound > 0 || stat.docxVersionOnlyOneFound > 0 || stat.docxVersionNotFound > 0 ? (
          <>
            <div className="text-[9px] text-gray-400 font-medium pl-1 pt-0.5">DOCX</div>
            {sortLangCodes([...stat.langDocxVersion.keys()]).map((lang) => {
              const ldv = stat.langDocxVersion.get(lang)!;
              return (
                <CapsuleMetricVersionTriple
                  key={`docx-version-${lang}`}
                  totalSOPs={stat.totalSOPs}
                  allTwoFoundV={ldv.allTwoFound}
                  onlyOneFoundV={ldv.onlyOneFound}
                  notFoundV={ldv.notFound}
                  onLabelClick={() => {}}
                  onGreenClick={() => {}}
                  onAmberClick={() => {}}
                  onRedClick={() => {}}
                  highlightGreen={false}
                  highlightAmber={false}
                  highlightRed={false}
                  filterRowActive={false}
                  titleSummary={`${lang} DOCX versions`}
                  label={<span className="text-gray-500 text-[9px]">{lang}</span>}
                />
              );
            })}
          </>
        ) : null}
        {/* PDF Versions Sub-section */}
        {stat.pdfVersionAllTwoFound > 0 || stat.pdfVersionOnlyOneFound > 0 || stat.pdfVersionNotFound > 0 ? (
          <>
            <div className="text-[9px] text-gray-400 font-medium pl-1 pt-0.5">PDF</div>
            {sortLangCodes([...stat.langPdfVersion.keys()]).map((lang) => {
              const lpv = stat.langPdfVersion.get(lang)!;
              return (
                <CapsuleMetricVersionTriple
                  key={`pdf-version-${lang}`}
                  totalSOPs={stat.totalSOPs}
                  allTwoFoundV={lpv.allTwoFound}
                  onlyOneFoundV={lpv.onlyOneFound}
                  notFoundV={lpv.notFound}
                  onLabelClick={() => {}}
                  onGreenClick={() => {}}
                  onAmberClick={() => {}}
                  onRedClick={() => {}}
                  highlightGreen={false}
                  highlightAmber={false}
                  highlightRed={false}
                  filterRowActive={false}
                  titleSummary={`${lang} PDF versions`}
                  label={<span className="text-gray-500 text-[9px]">{lang}</span>}
                />
              );
            })}
          </>
        ) : null}

        {/* Videos Section — with spacing */}
        <div className="h-1" />
        <CapsuleMetricAvailMissing
          label={
            <>
              <Video className="mr-0.5 inline h-3 w-3" aria-hidden />
              Videos
            </>
          }
          totalExpected={stat.videoRequired}
          available={stat.videoAvailable}
          missingCount={stat.videoRequired - stat.videoAvailable}
          onFilterClick={() => apply("video")}
          onAvailableClick={() =>
            applyCapsuleAvailMiss(deptForFilter, "video", "available")
          }
          onMissingClick={() =>
            applyCapsuleAvailMiss(deptForFilter, "video", "missing")
          }
          highlightAvailable={capsuleAvailMissMatches(
            deptForFilter,
            "video",
            "available",
            filterSnapshot,
          )}
          highlightMissing={capsuleAvailMissMatches(
            deptForFilter,
            "video",
            "missing",
            filterSnapshot,
          )}
          filterRowActive={
            capsuleAvailMissMatches(
              deptForFilter,
              "video",
              "available",
              filterSnapshot,
            ) ||
            capsuleAvailMissMatches(
              deptForFilter,
              "video",
              "missing",
              filterSnapshot,
            )
          }
          titleSummary={
            isGrand
              ? `${stat.videoAvailable} of ${stat.videoRequired} required video slots filled · green = filled, red = missing`
              : `Videos in ${scopeHint} · ${stat.videoAvailable} of ${stat.videoRequired} slots · green = filled, red = missing`
          }
        />

        {/* Slides Section — with spacing */}
        <div className="h-1" />
        <CapsuleMetricAvailMissing
          label={
            <>
              <Presentation className="mr-0.5 inline h-3 w-3" aria-hidden />
              Slides
            </>
          }
          totalExpected={stat.slideRequired}
          available={stat.slideAvailable}
          missingCount={stat.slideRequired - stat.slideAvailable}
          onFilterClick={() => apply("slides")}
          onAvailableClick={() =>
            applyCapsuleAvailMiss(deptForFilter, "slides", "available")
          }
          onMissingClick={() =>
            applyCapsuleAvailMiss(deptForFilter, "slides", "missing")
          }
          highlightAvailable={capsuleAvailMissMatches(
            deptForFilter,
            "slides",
            "available",
            filterSnapshot,
          )}
          highlightMissing={capsuleAvailMissMatches(
            deptForFilter,
            "slides",
            "missing",
            filterSnapshot,
          )}
          filterRowActive={
            capsuleAvailMissMatches(
              deptForFilter,
              "slides",
              "available",
              filterSnapshot,
            ) ||
            capsuleAvailMissMatches(
              deptForFilter,
              "slides",
              "missing",
              filterSnapshot,
            )
          }
          titleSummary={
            isGrand
              ? `${stat.slideAvailable} of ${stat.slideRequired} required slide sets filled · green = filled, red = missing`
              : `Slides in ${scopeHint} · ${stat.slideAvailable} of ${stat.slideRequired} sets · green = filled, red = missing`
          }
        />
      </div>
    </div>
  );
}

export default function DepartmentCapsules({
  data,
  showTotalCapsule = true,
  applyCapsuleFilter,
  applyCapsuleAvailMiss,
  applyCapsuleVersionSegment,
  filterSnapshot,
}: {
  data: any[];
  showTotalCapsule?: boolean;
  applyCapsuleFilter: (dept: string, mode: CapsuleFilterMode) => void;
  applyCapsuleAvailMiss: (
    dept: string,
    metric: CapsuleAvailMetric,
    side: "available" | "missing",
    lang?: "ENG" | "GUJ",
  ) => void;
  applyCapsuleVersionSegment: (
    dept: string,
    segment: SopVersionFilterSegment,
  ) => void;
  filterSnapshot: CapsuleFilterSnapshot;
}) {
  const stats = useMemo(() => computeDepartmentStats(data), [data]);

  /** Sum of department capsules skipped “Other” rows; grand total uses every primary registry row. */
  const totalStats = useMemo(
    () => computeCapsuleGrandTotalStat(data),
    [data],
  );

  return (
    <div className="w-full px-1 py-2 sm:px-2">
      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 2xl:grid-cols-8">
        {showTotalCapsule ? (
          <DepartmentCapsuleCard
            key="grand-total-capsule"
            stat={totalStats}
            applyCapsuleFilter={applyCapsuleFilter}
            applyCapsuleAvailMiss={applyCapsuleAvailMiss}
            applyCapsuleVersionSegment={applyCapsuleVersionSegment}
            filterSnapshot={filterSnapshot}
            variant="grand"
          />
        ) : null}
        {stats.map((s, idx) => (
          <DepartmentCapsuleCard
            key={`dept-capsule-${idx}-${s.department}`}
            stat={s}
            applyCapsuleFilter={applyCapsuleFilter}
            applyCapsuleAvailMiss={applyCapsuleAvailMiss}
            applyCapsuleVersionSegment={applyCapsuleVersionSegment}
            filterSnapshot={filterSnapshot}
          />
        ))}
      </div>
    </div>
  );
}
