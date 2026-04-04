"use client";

import { useMemo, ReactNode } from "react";
import { Video, Presentation, FileText } from "lucide-react";
import { countRowDocxPdfForCapsules } from "@/lib/registryRowDocCounts";
import { isArtifactOnlyRegistryRow } from "@/lib/registryPrimaryRows";
import { CAPSULE_DEPARTMENTS } from "@/lib/capsuleDepartments";
import {
  classifySopVersionCapsule,
  type SopVersionFilterSegment,
} from "@/lib/sopVersionCapsuleClassify";

export { CAPSULE_DEPARTMENTS } from "@/lib/capsuleDepartments";

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
  eng: number;
  guj: number;
  videos: number;
  slides: number;
  versionLast2Ok: number;
  versionPartial: number;
  versionZero: number;
  versionMissing: number;
  missingExpiry: number;
}

function computeDepartmentStats(data: any[]): DeptCapsuleStats[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = 1000 * 60 * 60 * 24;

  const byDept = new Map<
    string,
    {
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
      eng: number;
      guj: number;
      videos: number;
      slides: number;
      versionLast2Ok: number;
      versionPartial: number;
      versionZero: number;
      versionMissing: number;
      missingExpiry: number;
    }
  >();

  const order = [...CAPSULE_DEPARTMENTS];
  order.forEach((dept) => {
    byDept.set(dept, {
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
      eng: 0,
      guj: 0,
      videos: 0,
      slides: 0,
      versionLast2Ok: 0,
      versionPartial: 0,
      versionZero: 0,
      versionMissing: 0,
      missingExpiry: 0,
    });
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
    s.total++;

    if (row.isDualLanguage === true) s.dualLang++;

    if (row.expiryDate) {
      const exp = new Date(row.expiryDate).getTime();
      const diffDays = (exp - today.getTime()) / day;
      if (diffDays < 0) s.expired++;
      else if (diffDays <= 90) s.nearExpiry++;
    }

    const { docx: nDocxFiles, pdf: nPdfFiles } =
      countRowDocxPdfForCapsules(row);
    s.docxFiles += nDocxFiles;
    s.pdfFiles += nPdfFiles;
    if (nDocxFiles > 0) s.docxSOPs++;
    if (nPdfFiles > 0) s.pdfSOPs++;

    // Expecting 2 files if dual-language, 1 otherwise
    const expectedForThisRow = row.isDualLanguage ? 2 : 1;
    s.expectedDocx += expectedForThisRow;
    s.expectedPdf += expectedForThisRow;

    if (row.englishVersion) s.eng++;
    if (row.gujaratiVersion) s.guj++;
    if (row.mediaStatus?.videos) s.videos++;
    if (row.mediaStatus?.slides) s.slides++;

    const vt = classifySopVersionCapsule(row);
    if (vt === "green") s.versionLast2Ok++;
    else if (vt === "grey") s.versionZero++;
    else s.versionMissing++;

    if (!row.expiryDate) s.missingExpiry++;
  });

  return order.map((department) => {
    const s = byDept.get(department)!;
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
      eng: s.eng,
      guj: s.guj,
      videos: s.videos,
      slides: s.slides,
      versionLast2Ok: s.versionLast2Ok,
      versionPartial: s.versionPartial,
      versionZero: s.versionZero,
      versionMissing: s.versionMissing,
      missingExpiry: s.missingExpiry,
    };
  });
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
      className={`flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-[4px] px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-purple-100/80 active:bg-purple-200/60 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:ring-offset-0 ${
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

/** Label = same filter as green (has asset); green = rows with asset + sort desc; red = rows missing + sort asc. */
function CapsuleMetricAvailMissing({
  label,
  totalExpected,
  available,
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
  onFilterClick: () => void;
  onAvailableClick: () => void;
  onMissingClick: () => void;
  highlightAvailable: boolean;
  highlightMissing: boolean;
  filterRowActive: boolean;
  titleSummary: string;
}) {
  const missing = Math.max(0, totalExpected - available);

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
        aria-label={`${available} with attachment, ${missing} missing of ${totalExpected} expected`}>
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

function CapsuleMetricVersionTriple({
  totalSOPs,
  last2Ok,
  partialV,
  zeroV,
  missingV,
  onLabelClick,
  onGreenClick,
  onYellowClick,
  onGreyClick,
  onRedClick,
  highlightGreen,
  highlightYellow,
  highlightGrey,
  highlightRed,
  filterRowActive,
  titleSummary,
}: {
  totalSOPs: number;
  last2Ok: number;
  partialV: number;
  zeroV: number;
  missingV: number;
  onLabelClick: () => void;
  onGreenClick: () => void;
  onYellowClick: () => void;
  onGreyClick: () => void;
  onRedClick: () => void;
  highlightGreen: boolean;
  highlightYellow: boolean;
  highlightGrey: boolean;
  highlightRed: boolean;
  filterRowActive: boolean;
  titleSummary: string;
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
        Version
      </button>
      <div
        className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm tabular-nums"
        aria-label={`Version status: ${last2Ok} both available, ${partialV} partial, ${missingV} missing both, ${zeroV} no prior data of ${totalSOPs} SOPs`}>
        {/* 1st: Green — both last-2 prior versions available */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onGreenClick(); }}
          title="Both last-2 prior revisions available"
          aria-pressed={highlightGreen ? true : undefined}
          className={`min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-emerald-500/70 ${
            highlightGreen ? "bg-emerald-100 ring-1 ring-emerald-400/80" : ""
          }`}>
          {last2Ok}
        </button>
        <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
        {/* 2nd: Amber — only 1 of the last-2 prior revisions available */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onYellowClick(); }}
          title="Only 1 of the last-2 prior revisions is available"
          aria-pressed={highlightYellow ? true : undefined}
          className={`min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-amber-600 transition-colors hover:bg-amber-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-amber-400/70 ${
            highlightYellow ? "bg-amber-100 ring-1 ring-amber-400/80" : ""
          }`}>
          {partialV}
        </button>
        <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
        {/* 3rd: Red — both last-2 prior revisions missing */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRedClick(); }}
          title="Both last-2 prior revisions missing — no prior-version files stored"
          aria-pressed={highlightRed ? true : undefined}
          className={`min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-red-600 transition-colors hover:bg-red-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-red-400/70 ${
            highlightRed ? "bg-red-100 ring-1 ring-red-400/80" : ""
          }`}>
          {missingV}
        </button>
        <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
        {/* 4th: Grey — no prior-version data at all */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onGreyClick(); }}
          title="No prior-version data found for this SOP"
          aria-pressed={highlightGrey ? true : undefined}
          className={`min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-gray-500 transition-colors hover:bg-gray-100 focus:z-10 focus:outline-none focus:ring-1 focus:ring-gray-400/70 ${
            highlightGrey ? "bg-gray-200 ring-1 ring-gray-400/80" : ""
          }`}>
          {zeroV}
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
        className={`mb-2 flex w-full items-center gap-1.5 rounded-md border-b pb-2 ${
          isGrand
            ? "cursor-default border-purple-200"
            : `cursor-pointer border-gray-100 hover:bg-purple-50/80 focus:outline-none focus:ring-2 focus:ring-purple-400 ${
                headerActive
                  ? "border-purple-300 bg-purple-100/70 ring-1 ring-purple-300"
                  : ""
              }`
        }`}
        title={
          isGrand
            ? "Totals for the seven named departments only (rows with no/unmapped department are excluded). Use metric rows below to filter."
            : `Show all ${label} SOPs in the registry`
        }>
        <FileText className="h-3.5 w-3.5 shrink-0 text-purple-600" />
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
              ? "All departments: rows with both English and Gujarati files."
              : "Rows with both English and Gujarati files."
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
          label="No Expiry"
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
        <CapsuleMetricAvailMissing
          label="DOCX"
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
              ? `${stat.docxSOPs} rows with ≥1 DOCX · ${stat.docxFiles} paths · green = with DOCX, red = missing DOCX`
              : `${stat.docxSOPs} with DOCX in ${label} · green = with DOCX, red = missing`
          }
        />
        <CapsuleMetricAvailMissing
          label="PDF"
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
              ? `${stat.pdfSOPs} rows with ≥1 PDF · ${stat.pdfFiles} paths · green = with PDF, red = missing PDF`
              : `${stat.pdfSOPs} with PDF in ${label} · green = with PDF, red = missing`
          }
        />
        <CapsuleMetricVersionTriple
          totalSOPs={stat.totalSOPs}
          last2Ok={stat.versionLast2Ok}
          partialV={stat.versionPartial}
          zeroV={stat.versionZero}
          missingV={stat.versionMissing}
          onLabelClick={() =>
            applyCapsuleVersionSegment(deptForFilter, "missingv")
          }
          onGreenClick={() =>
            applyCapsuleVersionSegment(deptForFilter, "last2ok")
          }
          onYellowClick={() =>
            applyCapsuleVersionSegment(deptForFilter, "missingv")
          }
          onGreyClick={() =>
            applyCapsuleVersionSegment(deptForFilter, "zerov")
          }
          onRedClick={() =>
            applyCapsuleVersionSegment(deptForFilter, "missingv")
          }
          highlightGreen={capsuleVersionSegmentMatches(
            deptForFilter,
            "last2ok",
            filterSnapshot,
          )}
          highlightYellow={capsuleVersionSegmentMatches(
            deptForFilter,
            "missingv",
            filterSnapshot,
          )}
          highlightGrey={capsuleVersionSegmentMatches(
            deptForFilter,
            "zerov",
            filterSnapshot,
          )}
          highlightRed={capsuleVersionSegmentMatches(
            deptForFilter,
            "missingv",
            filterSnapshot,
          )}
          filterRowActive={
            capsuleVersionSegmentMatches(deptForFilter, "last2ok", filterSnapshot) ||
            false ||
            capsuleVersionSegmentMatches(deptForFilter, "zerov", filterSnapshot) ||
            capsuleVersionSegmentMatches(deptForFilter, "missingv", filterSnapshot)
          }
          titleSummary={
            isGrand
              ? "Red = one/both of last two missing; grey = no prior data; green = last-two complete"
              : `Version in ${scopeHint} · red / amber / grey / green`
          }
        />
        <CapsuleMetricAvailMissing
          label={
            <>
              <Video className="mr-0.5 inline h-3 w-3" aria-hidden />
              Videos
            </>
          }
          totalExpected={stat.videos > 0 ? stat.totalSOPs : 0}
          available={stat.videos}
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
              ? `${stat.videos} rows with video attachments · green = with video, red = no video`
              : `Videos in ${scopeHint} · green = with video, red = no video`
          }
        />
        <CapsuleMetricAvailMissing
          label={
            <>
              <Presentation className="mr-0.5 inline h-3 w-3" aria-hidden />
              Slides
            </>
          }
          totalExpected={stat.slides > 0 ? stat.totalSOPs : 0}
          available={stat.slides}
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
              ? `${stat.slides} rows with slide attachments · green = with slides, red = no slides`
              : `Slides in ${scopeHint} · green = with slides, red = no slides`
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
  ) => void;
  applyCapsuleVersionSegment: (
    dept: string,
    segment: SopVersionFilterSegment,
  ) => void;
  filterSnapshot: CapsuleFilterSnapshot;
}) {
  const stats = useMemo(() => computeDepartmentStats(data), [data]);

  const totalStats = useMemo((): DeptCapsuleStats => {
    return stats.reduce(
      (acc, s) => ({
        department: "Total",
        totalSOPs: acc.totalSOPs + s.totalSOPs,
        dualLangRows: acc.dualLangRows + s.dualLangRows,
        expired: acc.expired + s.expired,
        nearExpiry: acc.nearExpiry + s.nearExpiry,
        docxSOPs: acc.docxSOPs + s.docxSOPs,
        pdfSOPs: acc.pdfSOPs + s.pdfSOPs,
        expectedDocx: acc.expectedDocx + s.expectedDocx,
        expectedPdf: acc.expectedPdf + s.expectedPdf,
        docxFiles: acc.docxFiles + s.docxFiles,
        pdfFiles: acc.pdfFiles + s.pdfFiles,
        eng: acc.eng + s.eng,
        guj: acc.guj + s.guj,
        videos: acc.videos + s.videos,
        slides: acc.slides + s.slides,
        versionLast2Ok: acc.versionLast2Ok + s.versionLast2Ok,
        versionPartial: acc.versionPartial + s.versionPartial,
        versionZero: acc.versionZero + s.versionZero,
        versionMissing: acc.versionMissing + s.versionMissing,
        missingExpiry: acc.missingExpiry + s.missingExpiry,
      }),
      {
        department: "Total",
        totalSOPs: 0,
        dualLangRows: 0,
        expired: 0,
        nearExpiry: 0,
        docxSOPs: 0,
        pdfSOPs: 0,
        expectedDocx: 0,
        expectedPdf: 0,
        docxFiles: 0,
        pdfFiles: 0,
        eng: 0,
        guj: 0,
        videos: 0,
        slides: 0,
        versionLast2Ok: 0,
        versionPartial: 0,
        versionZero: 0,
        versionMissing: 0,
        missingExpiry: 0,
      },
    );
  }, [stats]);

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
