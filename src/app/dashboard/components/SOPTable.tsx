"use client";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  FileText,
  Video,
  Presentation,
  File,
  Calendar,
  User as UserIcon,
  Users,
  Eye,
  Download,
  BookOpen,
  Sparkles,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { useState, Fragment, useEffect, useRef, type ReactNode } from "react";
import {
  fileKindFromStoredPath,
  fileKindToLabel,
} from "@/lib/filePathFileKind";
import {
  buildViewDocHref,
  buildDocxDownloadHref,
  buildPdfDownloadHref,
} from "@/lib/viewDocLinks";
import { cleanSOPName } from "@/lib/sopLibraryHelper";

const DEPT_ALL = "All";

export default function SOPTable({
  data,
  sortConfig,
  onSort,
  onRowClick,
  filterDeptFromParent,
  onOpenGuidelineWizard,
  complianceCache,
  onViewCompliance,
  onMarkObsolete,
  onMarkVersionSuperseded,
}: any) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);


  // Obsolete confirm modal state
  const [obsoleteTarget, setObsoleteTarget] = useState<{ sopNo: string; sopName: string } | null>(null);
  const [obsoletePassword, setObsoletePassword] = useState("");
  const [obsoleteBusy, setObsoleteBusy] = useState(false);
  const [obsoleteError, setObsoleteError] = useState("");
  const obsoleteInputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState({
    department: "",
    language: "",
    fileType: "",
    videos: "",
    presentations: "",
    expiryStatus: "",
  });

  useEffect(() => {
    if (filterDeptFromParent === undefined) return;
    const next =
      filterDeptFromParent === DEPT_ALL || !filterDeptFromParent
        ? ""
        : filterDeptFromParent;
    setFilters((prev) =>
      prev.department === next ? prev : { ...prev, department: next },
    );
  }, [filterDeptFromParent]);

  const getRawLanguage = (row: any) => {
    if (row.isDualLanguage) return "ENG/GUJ";
    if (row.gujaratiFileMissing) return "ENG (GUJ missing)";
    return row.language === "Gujarati" ? "GUJ" : "ENG";
  };

  const getRawFileTypes = (row: any) => {
    const types = new Set<string>();
    if (row.sopFile?.filePath)
      types.add(
        fileKindToLabel(
          fileKindFromStoredPath(row.sopFile.filePath, row.sopFile.fileType),
        ),
      );
    (row.sopDocuments || []).forEach((doc: any) => {
      if (doc.filePath)
        types.add(
          fileKindToLabel(fileKindFromStoredPath(doc.filePath, doc.fileType)),
        );
    });
    const arr = Array.from(types).sort();
    return arr.length === 0 ? "None" : arr.join(" / ");
  };

  const getRawVideos = (row: any) =>
    (row.mediaStatus?.videoCount ?? (row.mediaStatus?.videos ? 1 : 0)) > 0
      ? "Yes"
      : "No";
  const getRawPresentations = (row: any) =>
    (row.mediaStatus?.slideCount ?? (row.mediaStatus?.slides ? 1 : 0)) > 0
      ? "Yes"
      : "No";

  const getRawExpiryStatus = (row: any) => {
    if (!row.expiryDate) return "Not Set";
    const expiry = new Date(row.expiryDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil(
      (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays < 0) return "Expired";
    if (diffDays <= 30) return "High Priority";
    if (diffDays <= 60) return "Medium Priority";
    return "Active";
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortConfig.key !== field)
      return (
        <ArrowUpDown className="h-3 w-3 text-gray-400 ml-0.5 inline opacity-60" />
      );
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-3 w-3 text-purple-600 ml-0.5 inline" />
    ) : (
      <ArrowDown className="h-3 w-3 text-purple-600 ml-0.5 inline" />
    );
  };

  const toggleRow = (rowId: string) =>
    setExpandedRow(expandedRow === rowId ? null : rowId);

  /** In-app preview for DOCX/PDF (including CDN https paths). Other URLs fall back to download/open. */
  const buildPreviewHref = (
    path: string,
    fileType?: string,
    identifier?: string,
    language?: string,
  ) => {
    const trimmed = (path || "").trim();
    const kind = fileKindFromStoredPath(trimmed, fileType);
    if (kind === "docx" || kind === "doc") {
      return buildViewDocHref(path, identifier, language);
    }
    if (kind === "pdf") {
      const dl = new URLSearchParams();
      dl.set("path", path);
      if (identifier) dl.set("identifier", identifier);
      if (language) dl.set("language", language);
      return `/api/files/download?${dl.toString()}`;
    }
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const dl = new URLSearchParams();
    dl.set("path", path);
    dl.set("open", "1");
    if (identifier) dl.set("identifier", identifier);
    if (language) dl.set("language", language);
    return `/api/files/download?${dl.toString()}`;
  };

  type VersionArtifactEntry = {
    version: number;
    docxPath?: string;
    pdfPath?: string;
  };

  /** Registry: show v09, v10 (two-digit) for single-digit revs; three-digit left as-is */
  const formatPriorVersionLabel = (v: number) => {
    const n =
      typeof v === "number" && !Number.isNaN(v) ? v : parseInt(String(v), 10);
    if (!Number.isFinite(n)) return "V?";
    return `V${n}`;
  };

  const renderVersionArtifactLinks = (
    entries: VersionArtifactEntry[] | undefined,
    row: any,
    lang: "English" | "Gujarati",
    subLabel?: string,
    maxRows = 2,
    allowSupersede = false,
  ): ReactNode => {
    if (!entries?.length) return null;

    // Build a consecutive sequence of prior versions so gaps show as "N/A"
    // e.g. current=V6, stored=[V6,V4] → show V5(N/A), V4
    const currentRev = getDisplayCurrentRevision(row);
    const entryByVersion = new Map<number, VersionArtifactEntry>(
      entries.map((e) => [e.version, e]),
    );
    const highestStored = Math.max(...entries.map((e) => e.version));
    const lowestStored = Math.min(...entries.map((e) => e.version));
    /** Top of the prior chain: one below current revision, or highest stored when SOP No has no rev */
    const startFrom =
      currentRev != null ? currentRev - 1 : highestStored;
    const rangeSlots: (VersionArtifactEntry | { version: number; missing: true })[] =
      [];
    if (currentRev != null) {
      // Always show the newest `maxRows` prior revision numbers (fill gaps as missing),
      // e.g. current V5 with only V4 on disk → V4 + V3 missing.
      for (let i = 0; i < maxRows; i++) {
        const v = startFrom - i;
        if (v < 1) break;
        const entry = entryByVersion.get(v);
        rangeSlots.push(entry ?? { version: v, missing: true });
      }
    } else {
      // No revision in SOP No: walk downward from highest stored through consecutive slots
      for (
        let v = startFrom;
        v >= lowestStored && rangeSlots.length < maxRows;
        v--
      ) {
        const entry = entryByVersion.get(v);
        rangeSlots.push(entry ?? { version: v, missing: true });
      }
    }

    /** Newest prior revision first (V5 above V4) everywhere */
    const rowsSorted = [...rangeSlots].sort((a, b) => b.version - a.version);

    return (
      <table className="w-full border-collapse text-[9px] leading-tight table-fixed">
        <colgroup>
          <col className="w-[2.25rem]" />
          <col />
        </colgroup>
        <tbody>
          {subLabel ? (
            <tr>
              <td
                colSpan={2}
                className="pb-0.5 align-middle text-[8px] font-bold uppercase tracking-wide text-gray-500">
                {subLabel}
              </td>
            </tr>
          ) : null}
          {rowsSorted.map((e) => (
            <tr key={`${lang}-v${e.version}`}>
              <td className="py-px pr-1 align-middle font-bold text-gray-900 tabular-nums whitespace-nowrap">
                {formatPriorVersionLabel(e.version)}
              </td>
              <td className="py-px align-middle">
                {"missing" in e ? (
                  <span
                    className="text-[8px] font-bold text-red-500 leading-none"
                    title="This version was not uploaded — not available">
                    ✗
                  </span>
                ) : (
                  <div className="inline-flex flex-row flex-wrap items-center gap-x-1 gap-y-0 leading-none text-[8px] font-bold">
                    {e.docxPath ? (
                      <a
                        href={buildPreviewHref(e.docxPath, "docx", row.sopNo, lang)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(ev) => ev.stopPropagation()}
                        className="text-purple-600 hover:underline whitespace-nowrap">
                        DOCX
                      </a>
                    ) : null}
                    {e.docxPath && e.pdfPath ? (
                      <span className="text-gray-300 select-none">/</span>
                    ) : null}
                    {e.pdfPath ? (
                      <a
                        href={buildPreviewHref(e.pdfPath, "pdf", row.sopNo, lang)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(ev) => ev.stopPropagation()}
                        className="text-blue-600 hover:underline whitespace-nowrap">
                        PDF
                      </a>
                    ) : null}
                    {!e.docxPath && !e.pdfPath ? (
                      <span className="text-gray-400">—</span>
                    ) : null}
                    {allowSupersede ? (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onMarkVersionSuperseded?.({
                            sopNo: String(row.sopNo || ""),
                            lang,
                            version: Number(e.version),
                            docxPath: e.docxPath,
                            pdfPath: e.pdfPath,
                          });
                        }}
                        className="ml-0.5 rounded border border-amber-300 bg-amber-50 px-1 py-px text-[7px] font-bold text-amber-900 hover:bg-amber-100"
                        title="Move this version to Supersede SOP section">
                        Supersede
                      </button>
                    ) : null}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const getFirstPathByType = (row: any, type: string): string | null => {
    const t = type.toLowerCase() as "pdf" | "docx" | "doc";
    const matches = (path: string, declared?: string) =>
      fileKindFromStoredPath(path, declared) === t;
    if (
      row.sopFile?.filePath &&
      matches(row.sopFile.filePath, row.sopFile.fileType)
    )
      return row.sopFile.filePath;
    const doc = (row.sopDocuments || []).find(
      (d: any) => d.filePath && matches(d.filePath, d.fileType),
    );
    return doc?.filePath || null;
  };

  /** Same physical file may appear with/without leading slash or mixed separators */
  const normalizePathKey = (p: string) => {
    const base = (p || "").trim().split(/[?#]/)[0];
    return base
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/^\/+/, "")
      .toLowerCase();
  };

  const getFileTypes = (row: any) => {
    const rawDocs: Array<{ type: string; path: string; lang: string }> = [];

    (row.sopDocuments || []).forEach((doc: any) => {
      if (doc.filePath) {
        rawDocs.push({
          type: fileKindToLabel(
            fileKindFromStoredPath(doc.filePath, doc.fileType),
          ),
          path: doc.filePath,
          lang: doc.language === "Gujarati" ? "GUJ" : "ENG",
        });
      }
    });

    // Primary sopFile only if not already listed (avoids duplicate DOCX line when library + row share the same path)
    if (row.sopFile?.filePath) {
      const k = normalizePathKey(row.sopFile.filePath);
      const dup = rawDocs.some((d) => normalizePathKey(d.path) === k);
      if (!dup) {
        rawDocs.push({
          type: fileKindToLabel(
            fileKindFromStoredPath(row.sopFile.filePath, row.sopFile.fileType),
          ),
          path: row.sopFile.filePath,
          lang: row.sopFile.language === "Gujarati" ? "GUJ" : "ENG",
        });
      }
    }
    if (rawDocs.length === 0)
      return <span className="text-gray-400 text-[9px]">—</span>;

    const pathsSeenAsEng = new Set<string>();
    rawDocs.forEach((d) => {
      if (d.lang === "ENG") pathsSeenAsEng.add(normalizePathKey(d.path));
    });

    /** Same physical path as an English doc → one link only (ENG). Otherwise trust SOPLibrary `language` even if the path has no "guj" in the filename. */
    const validatedDocs = rawDocs.map((d) => {
      if (d.lang !== "GUJ") return d;
      if (pathsSeenAsEng.has(normalizePathKey(d.path)))
        return { ...d, lang: "ENG" };
      return d;
    });

    // One row per unique file (normalized path); prefer ENG if both tagged
    const byNormPath = new Map<string, (typeof validatedDocs)[number]>();
    validatedDocs.forEach((d) => {
      const key = normalizePathKey(d.path);
      const existing = byNormPath.get(key);
      if (!existing) {
        byNormPath.set(key, d);
        return;
      }
      if (existing.lang === "GUJ" && d.lang === "ENG") byNormPath.set(key, d);
    });
    const cleanedDocs = Array.from(byNormPath.values());

    /** At most one link per language + file type (avoids DOCX DOCX PDF PDF from duplicate library rows) */
    const byLangType = new Map<string, (typeof cleanedDocs)[number]>();
    for (const d of cleanedDocs) {
      const key = `${d.lang}:${(d.type || "").toUpperCase()}`;
      if (!byLangType.has(key)) byLangType.set(key, d);
    }
    const uniqueDocs = Array.from(byLangType.values());

    const typeOrder = (t: string) =>
      t === "DOCX" || t === "DOC" ? 0 : t === "PDF" ? 1 : 2;
    const engDocs = uniqueDocs
      .filter((d) => d.lang === "ENG")
      .sort((a, b) => typeOrder(a.type) - typeOrder(b.type));
    const gujDocs = uniqueDocs
      .filter((d) => d.lang === "GUJ")
      .sort((a, b) => typeOrder(a.type) - typeOrder(b.type));
    const hasBothFileLangs = engDocs.length > 0 && gujDocs.length > 0;
    /** Same layout as before: ENG row + GUJ row for true dual-file rows, or when registry expects GUJ but file is missing */
    const useLangRows =
      Boolean(row.isDualLanguage) ||
      hasBothFileLangs ||
      Boolean(row.gujaratiFileMissing);

    const isWordType = (t: string) => t === "DOCX" || t === "DOC";

    const renderSlot = (doc: (typeof uniqueDocs)[number] | undefined) => {
      if (!doc) return <div />;

      const langParam = doc.lang === "GUJ" ? "Gujarati" : "English";
      const previewHref = buildPreviewHref(
        doc.path,
        doc.type,
        row.sopNo,
        langParam,
      );
      const pathKind = fileKindFromStoredPath(doc.path, doc.type);
      const docxDlHref =
        pathKind === "docx" || pathKind === "doc"
          ? buildDocxDownloadHref(doc.path, row.sopNo, langParam)
          : null;
      const pdfDlHref =
        pathKind === "pdf"
          ? buildPdfDownloadHref(doc.path, row.sopNo, langParam)
          : null;
      const isWord = isWordType(doc.type);
      const linkColor = isWord ? "text-purple-600" : "text-blue-600";
      const fileLinkClass = `font-bold text-[9px] ${linkColor} hover:underline whitespace-nowrap shrink-0`;

      return (
        <div className="flex flex-nowrap items-center gap-0.5 overflow-visible">
          {isWord ? (
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              title={`Preview ${doc.type} in browser`}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 rounded p-px text-violet-600 hover:bg-violet-100 hover:text-violet-900">
              <Eye className="h-2.5 w-2.5" />
            </a>
          ) : null}
          <a
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
            className={fileLinkClass}
            title={isWord ? "Preview document" : "Preview PDF"}
            onClick={(e) => e.stopPropagation()}>
            {doc.type}
          </a>
          {docxDlHref ? (
            <a
              href={docxDlHref}
              className="shrink-0 rounded p-px text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title={`Download ${doc.type}`}
              onClick={(e) => e.stopPropagation()}>
              <Download className="h-2.5 w-2.5" />
            </a>
          ) : pdfDlHref ? (
            <a
              href={pdfDlHref}
              target="_blank"
              rel="noopener noreferrer"
              title={`Download ${doc.type}`}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 rounded p-px text-slate-600 hover:bg-slate-100"
              aria-label={`Download ${doc.type}`}>
              <Download className="h-2.5 w-2.5" />
            </a>
          ) : null}
        </div>
      );
    };

    const renderLangRow = (docs: typeof cleanedDocs, langLabel: string) => {
      const wordDoc = docs.find((d) => isWordType(d.type));
      const pdfDoc = docs.find((d) => d.type === "PDF");

      return (
        <div className="grid grid-cols-[24px_58px_6px_50px] items-center gap-x-0.5 text-left leading-none min-h-[16px]">
          <span className="text-[8px] font-bold text-gray-500">
            {langLabel}
          </span>
          {docs.length === 0 ? (
            <span className="text-gray-400 text-[9px] translate-y-px">—</span>
          ) : (
            <>
              {renderSlot(wordDoc)}
              <div className="flex justify-center text-gray-300 text-[9px] select-none">
                {wordDoc && pdfDoc ? "·" : ""}
              </div>
              {renderSlot(pdfDoc)}
            </>
          )}
        </div>
      );
    };

    return (
      <div className="flex w-max flex-col gap-0.5 text-left">
        {engDocs.length > 0 || useLangRows
          ? renderLangRow(engDocs, "ENG")
          : null}
        {gujDocs.length > 0 || useLangRows
          ? renderLangRow(gujDocs, "GUJ")
          : null}
      </div>
    );
  };

  /** e.g. 1028 days (34 months 8 days) — months = floor(days/30), remainder days */
  const formatExpiryVerbose = (dateStr: any): ReactNode => {
    if (!dateStr) return (
      <span className="inline-block rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-[8px] font-semibold text-gray-400">
        No Date
      </span>
    );
    const review = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil(
      (review.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    const absDays = Math.abs(diffDays);
    const dayBasis = diffDays >= 0 ? diffDays : absDays;
    const months = Math.floor(dayBasis / 30);
    const remDays = dayBasis - months * 30;
    const moLabel = months === 1 ? "month" : "months";
    const dayLabel = remDays === 1 ? "day" : "days";
    const breakdown =
      months > 0 && remDays > 0
        ? ` (${months} ${moLabel} ${remDays} ${dayLabel})`
        : months > 0
          ? ` (${months} ${moLabel})`
          : remDays > 0 && absDays < 30
            ? ""
            : absDays > 0
              ? ` (${remDays} ${dayLabel})`
              : "";

    let label = "";
    let colorClass = "";
    const topDayWord = (d: number) => (d === 1 ? "day" : "days");
    if (diffDays < 0) {
      label = `Expired · ${absDays} ${topDayWord(absDays)} ago${breakdown}`;
      colorClass = "text-red-700 bg-red-50 border-red-200";
    } else if (diffDays <= 30) {
      label = `${diffDays} ${topDayWord(diffDays)}${breakdown}`;
      colorClass = "text-orange-700 bg-orange-50 border-orange-200";
    } else {
      label = `${diffDays} ${topDayWord(diffDays)}${breakdown}`;
      colorClass =
        diffDays <= 90
          ? "text-yellow-800 bg-yellow-50 border-yellow-200"
          : "text-emerald-800 bg-emerald-50 border-emerald-200";
    }
    return (
      <span
        className={`inline-block max-w-[200px] rounded border px-1 py-0.5 text-[8px] font-semibold leading-snug ${colorClass}`}
        title={typeof dateStr === "string" ? dateStr : review.toISOString()}>
        {label}
      </span>
    );
  };

  const getVersionNum = (sopNo: string) => {
    if (typeof sopNo !== "string") return null;
    const m = sopNo.match(/-0*(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  };

  /** Current revision from SOP No (QAGE01-11 → 11); folder-only rows may only have row.version */
  const getDisplayCurrentRevision = (row: any): number | null => {
    const fromNo = getVersionNum(row.sopNo);
    if (fromNo != null) return fromNo;
    const rv = row.version;
    if (typeof rv === "number" && Number.isFinite(rv)) return rv;
    if (typeof rv === "string" && /^\d+$/.test(rv.trim()))
      return parseInt(rv.trim(), 10);
    return null;
  };


  const deriveGujaratiSubtitle = (row: any): string => {
    const direct = String(row?.gujaratiName || "").trim();
    if (direct && /[\u0A80-\u0AFF]/.test(direct)) return direct;

    // Fallback: Gujarati file entries often carry the real title in fileName/path.
    const gujDoc = (row?.sopDocuments || []).find((d: any) => {
      const lang = String(d?.language || "").toLowerCase();
      if (lang !== "gujarati") return false;
      const raw = String(d?.fileName || d?.filePath || "");
      return /[\u0A80-\u0AFF]/.test(raw);
    });
    if (!gujDoc) return "";

    const raw = String(gujDoc.fileName || gujDoc.filePath || "");
    const cleaned = cleanSOPName(raw, row?.sopNo);
    return /[\u0A80-\u0AFF]/.test(cleaned) ? cleaned : "";
  };

  const uniqueDepartments = Array.from(
    new Set([
      ...data.map((r: any) => r.department),
      "Engineering and Maintenance",
      "Microbiology",
      "Personnel",
      "Production",
      "QA",
      "QC",
      "Store",
    ]),
  )
    .filter(Boolean)
    .sort();
  const uniqueLanguages = Array.from(new Set(data.map(getRawLanguage)))
    .filter(Boolean)
    .sort();
  const uniqueFileTypes = Array.from(new Set(data.map(getRawFileTypes)))
    .filter(Boolean)
    .sort();
  const uniqueVideos = Array.from(new Set(data.map(getRawVideos)))
    .filter(Boolean)
    .sort();
  const uniquePresentations = Array.from(new Set(data.map(getRawPresentations)))
    .filter(Boolean)
    .sort();
  const uniqueExpiryStatus = Array.from(new Set(data.map(getRawExpiryStatus)))
    .filter(Boolean)
    .sort();

  const displayedData = data.filter((row: any) => {
    if (filters.department && row.department !== filters.department)
      return false;
    if (filters.language && getRawLanguage(row) !== filters.language)
      return false;
    if (filters.fileType && getRawFileTypes(row) !== filters.fileType)
      return false;
    if (filters.videos && getRawVideos(row) !== filters.videos) return false;
    if (
      filters.presentations &&
      getRawPresentations(row) !== filters.presentations
    )
      return false;
    if (
      filters.expiryStatus &&
      getRawExpiryStatus(row) !== filters.expiryStatus
    )
      return false;
    return true;
  });


  const thBase =
    "px-1 py-0.5 align-top text-[9px] font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap";
  const selBase =
    "w-full text-[8px] p-px border border-gray-300 rounded bg-white focus:outline-none focus:border-purple-500 cursor-pointer leading-tight";
  const sortBtn =
    "flex w-full items-center gap-0.5 rounded px-0.5 py-1 text-left font-bold uppercase tracking-wide text-gray-600 hover:bg-purple-50/80 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-400";

  return (
    <div className="flex flex-col w-full bg-gray-50">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse min-w-[1180px]">
          <thead className="bg-gray-100 border-b border-gray-300 sticky top-0 z-10">
            <tr>
              <th className={thBase}>
                <button
                  type="button"
                  className={sortBtn}
                  onClick={() => onSort("sopNo")}>
                  SOP No <SortIcon field="sopNo" />
                </button>
              </th>
              <th
                className={`${thBase} text-center w-10`}
                title="Current revision from SOP number (e.g. QAGE01-11 → 11)">
                <button
                  type="button"
                  className={sortBtn}
                  onClick={() => onSort("version")}>
                  Ver <SortIcon field="version" />
                </button>
              </th>
              <th className={`${thBase} w-full min-w-[200px]`}>
                <button
                  type="button"
                  className={sortBtn}
                  onClick={() => onSort("sopName")}>
                  SOP Name <SortIcon field="sopName" />
                </button>
              </th>
              <th className={`${thBase} min-w-[100px] max-w-[160px]`}>
                <button
                  type="button"
                  className={sortBtn}
                  onClick={() => onSort("location")}>
                  Location <SortIcon field="location" />
                </button>
              </th>
              <th
                className={`${thBase} min-w-[160px] max-w-[260px]`}
                title="Up to two prior revisions (DOCX/PDF links) per language. Older files: Supersede SOP.">
                <button
                  type="button"
                  className={sortBtn}
                  onClick={() => onSort("priorVersionCount")}>
                  Prior versions <SortIcon field="priorVersionCount" />
                </button>
              </th>
              <th className={thBase}>
                <div className="flex flex-col gap-px min-w-[80px]">
                  <button
                    type="button"
                    className={sortBtn}
                    onClick={() => onSort("department")}>
                    Department <SortIcon field="department" />
                  </button>
                  <select
                    className={selBase}
                    value={filters.department}
                    onChange={(e) =>
                      setFilters({ ...filters, department: e.target.value })
                    }>
                    <option value="">All</option>
                    {uniqueDepartments.map((v: any) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </th>
              <th className={thBase}>
                <div className="flex flex-col gap-px min-w-[56px]">
                  <button
                    type="button"
                    className={sortBtn}
                    onClick={() => onSort("language")}>
                    Lang <SortIcon field="language" />
                  </button>
                  <select
                    className={selBase}
                    value={filters.language}
                    onChange={(e) =>
                      setFilters({ ...filters, language: e.target.value })
                    }>
                    <option value="">All</option>
                    {uniqueLanguages.map((v: any) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </th>
              <th
                className={thBase}
                title="Current approved files: English first, then Gujarati when dual">
                <div className="flex flex-col gap-px min-w-[56px]">
                  <button
                    type="button"
                    className={sortBtn}
                    onClick={() => onSort("fileType")}>
                    Files <SortIcon field="fileType" />
                  </button>
                  <select
                    className={selBase}
                    value={filters.fileType}
                    onChange={(e) =>
                      setFilters({ ...filters, fileType: e.target.value })
                    }>
                    <option value="">All</option>
                    {uniqueFileTypes.map((v: any) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </th>
              <th className={thBase}>
                <div className="flex flex-col gap-px min-w-[40px]">
                  <button
                    type="button"
                    className={sortBtn}
                    onClick={() => onSort("videos")}
                    title="Sort by video attachments">
                    Video <SortIcon field="videos" />
                  </button>
                  <select
                    className={selBase}
                    value={filters.videos}
                    onChange={(e) =>
                      setFilters({ ...filters, videos: e.target.value })
                    }>
                    <option value="">All</option>
                    {uniqueVideos.map((v: any) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </th>
              <th className={thBase}>
                <div className="flex flex-col gap-px min-w-[40px]">
                  <button
                    type="button"
                    className={sortBtn}
                    onClick={() => onSort("slides")}
                    title="Sort by slide decks">
                    Slides <SortIcon field="slides" />
                  </button>
                  <select
                    className={selBase}
                    value={filters.presentations}
                    onChange={(e) =>
                      setFilters({ ...filters, presentations: e.target.value })
                    }>
                    <option value="">All</option>
                    {uniquePresentations.map((v: any) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </th>
              <th className={thBase}>
                <div className="flex flex-col gap-px min-w-[130px]">
                  <button
                    type="button"
                    className={sortBtn}
                    onClick={() => onSort("expiryDate")}>
                    Expiry <SortIcon field="expiryDate" />
                  </button>
                  <select
                    className={selBase}
                    value={filters.expiryStatus}
                    onChange={(e) =>
                      setFilters({ ...filters, expiryStatus: e.target.value })
                    }>
                    <option value="">All</option>
                    {uniqueExpiryStatus.map((v: any) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="text-[10px] text-gray-700">
            {displayedData.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-6 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-1">
                    <FileText className="h-5 w-5 text-gray-300" />
                    <p className="text-xs">No SOPs found</p>
                  </div>
                </td>
              </tr>
            ) : (
              displayedData.map((row: any, idx: number) => {
                const isExpanded = expandedRow === row._id;
                const vNum = getVersionNum(row.sopNo);
                const displayRev = getDisplayCurrentRevision(row);
                const videoCount =
                  row.mediaStatus?.videoCount ?? (row.mediaStatus?.videos ? 1 : 0);
                const slideCount =
                  row.mediaStatus?.slideCount ?? (row.mediaStatus?.slides ? 1 : 0);
                const mediaTags = [
                  videoCount > 0 ? "VIDEO_READY" : "VIDEO_PENDING",
                  slideCount > 0 ? "SLIDE_READY" : "SLIDE_PENDING",
                  row.isDualLanguage ? "LANG_BOTH" : row.language === "Gujarati" ? "LANG_GUJ" : "LANG_ENG",
                  `TYPE_${String(row.sopNo || "").replace(/[^A-Za-z].*$/, "").toUpperCase() || "GEN"}`,
                ];
                return (
                  <Fragment key={row._id ?? `row-${idx}`}>
                    <tr
                      onClick={() => toggleRow(row._id)}
                      className={`hover:bg-purple-50/80 cursor-pointer transition-colors group border-b border-gray-100/80 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"} ${isExpanded ? "bg-purple-50" : ""}`}>
                      {/* SOP No */}
                      <td className="px-1 py-px font-mono text-[14px] font-bold tracking-wider text-purple-700 group-hover:underline whitespace-nowrap align-middle">
                        <span className="inline-flex items-center gap-1">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-purple-600" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                          {row.sopNo}
                        </span>
                      </td>
                      {/* Current revision (from SOP No or folder-upload row) */}
                      <td className="px-1 py-px text-center align-middle">
                        {displayRev != null ? (
                          <span className="text-[11px] font-bold text-gray-800 tabular-nums">
                            {displayRev}
                          </span>
                        ) : (
                          <span className="text-[9px] text-gray-400">—</span>
                        )}
                      </td>
                      {/* SOP Name — English first, Gujarati second */}
                      <td className="px-1 py-px font-medium text-gray-800 max-w-[280px] align-middle">
                        {(() => {
                          const norm = (s: string) =>
                            String(s || "")
                              .replace(/\s+/g, " ")
                              .trim()
                              .toLowerCase();
                          // English on top, Gujarati below
                          const line1 = cleanSOPName(row.englishName || row.sopName, row.sopNo);
                          const line2 = deriveGujaratiSubtitle(row);
                          const showLine2 =
                            line2 && norm(line2) !== norm(line1);
                          const title = showLine2
                            ? `${line1}\n${line2}`
                            : line1;
                          const hasResult =
                            complianceCache && complianceCache[row.sopNo];
                          return (
                            <div
                              className="flex items-center gap-1.5"
                              title={title}>
                              <div className="flex flex-col gap-0 leading-tight min-w-0">
                                <span className="text-[12px] font-bold leading-tight text-gray-900 truncate">
                                  {line1}
                                </span>
                                {showLine2 ? (
                                  <span className="text-[10px] font-bold leading-tight text-indigo-700 truncate">
                                    {cleanSOPName(line2, row.sopNo)}
                                  </span>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                title="Create guideline recommendation"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenGuidelineWizard?.({ _id: String(row._id), sopNo: String(row.sopNo) });
                                }}
                                className="shrink-0 rounded-full p-0.5 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors">
                                <Sparkles className="h-3 w-3" />
                              </button>
                              {hasResult && (
                                <button
                                  type="button"
                                  title="View last compliance check result"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onViewCompliance?.(row.sopNo);
                                  }}
                                  className="shrink-0 rounded-full p-0.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                                  <BookOpen className="h-3 w-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                title="Print this SOP row"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.print();
                                }}
                                className="shrink-0 rounded-full p-0.5 text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors">
                                <Printer className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-1 py-px align-middle max-w-[160px]">
                        <span
                          className="line-clamp-2 text-[9px] leading-snug text-gray-700"
                          title={row.location || undefined}>
                          {row.location ? (
                            row.location
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </span>
                      </td>
                      {/* Versions: uploaded last-3 PDF/DOCX, else legacy AV availability */}
                      <td className="px-0.5 py-px align-top min-w-[160px] max-w-[260px]">
                        {(() => {
                          const eng = Array.isArray(row.versionArtifacts)
                            ? row.versionArtifacts
                            : [];
                          const guj = Array.isArray(
                            row.versionArtifactsGujarati,
                          )
                            ? row.versionArtifactsGujarati
                            : [];
                          if (eng.length > 0 || guj.length > 0) {
                            return (
                              <div className="flex flex-col gap-1 py-0.5 min-w-0">
                                {eng.length > 0 &&
                                  renderVersionArtifactLinks(
                                    eng,
                                    row,
                                    "English",
                                    row.isDualLanguage ? "ENG" : undefined,
                                  )}
                                {guj.length > 0 &&
                                  renderVersionArtifactLinks(
                                    guj,
                                    row,
                                    "Gujarati",
                                    row.isDualLanguage ? "GUJ" : undefined,
                                  )}
                              </div>
                            );
                          }
                          const items: {
                            label: string;
                            ok: boolean;
                            key: string;
                            version: number;
                          }[] = [];
                          if (Array.isArray(row.previousVersionsStatus)) {
                            row.previousVersionsStatus
                              .slice(0, 2)
                              .forEach((v: any) => {
                                items.push({
                                  label: formatPriorVersionLabel(v.version),
                                  ok: !!v.available,
                                  key: `p-${v.version}`,
                                  version: Number(v.version),
                                });
                              });
                          }
                          items.sort((a, b) => b.version - a.version);
                          if (items.length === 0)
                            return (
                              <span className="text-[8px] text-gray-400">
                                —
                              </span>
                            );
                          return (
                            <table className="w-full border-collapse text-[10px] leading-tight text-gray-600 table-fixed">
                              <colgroup>
                                <col className="w-[2.25rem]" />
                                <col />
                              </colgroup>
                              <tbody>
                                {items.map((it) => (
                                  <tr key={it.key}>
                                    <td className="py-px pr-1 align-middle font-semibold whitespace-nowrap">
                                      {it.label}
                                    </td>
                                    <td className="py-px align-middle">
                                      <span
                                        className={
                                          it.ok
                                            ? "text-emerald-600"
                                            : "text-red-500"
                                        }>
                                        {it.ok ? "✓" : "✗"}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        })()}
                      </td>
                      {/* Dept */}
                      <td className="px-1 py-px text-gray-700 whitespace-nowrap align-middle">
                        <span className="bg-gray-200 text-gray-700 px-1 py-px rounded text-[9px] font-semibold leading-tight">
                          {row.department || "Other"}
                        </span>
                      </td>
                      {/* Lang */}
                      <td className="px-1 py-px text-center whitespace-nowrap align-middle">
                        {row.isDualLanguage ? (
                          <div className="inline-flex flex-col items-center gap-0 leading-none">
                            <span className="text-[9px] font-bold text-gray-800">
                              ENG
                            </span>
                            <span className="text-[9px] font-bold text-indigo-800">
                              GUJ
                            </span>
                          </div>
                        ) : row.gujaratiFileMissing ? (
                          <span
                            className="inline-flex flex-col items-center gap-0 leading-none"
                            title="There is a Gujarati SOP record in the database, but it points to the same file as English (or no separate Gujarati path). Upload/link a Gujarati DOCX/PDF in SOP Library or the Gujarati SOP record.">
                            <span className="text-[9px] font-semibold text-gray-700 leading-tight">
                              ENG
                            </span>
                            <span className="text-[7px] font-bold leading-none text-amber-700 bg-amber-50 border border-amber-200 rounded px-0.5">
                              no GUJ
                            </span>
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold text-gray-700">
                            {row.language === "Gujarati" ? "GUJ" : "ENG"}
                          </span>
                        )}
                      </td>
                      {/* File */}
                      <td className="px-1 py-px align-middle text-left">
                        {getFileTypes(row)}
                      </td>
                      {/* Video count */}
                      <td className="px-1 py-px text-center whitespace-nowrap align-middle">
                        {(() => {
                          const n =
                            row.mediaStatus?.videoCount ??
                            (row.mediaStatus?.videos ? 1 : 0);
                          return n > 0 ? (
                            <span className="text-[10px] font-bold tabular-nums text-emerald-700">
                              {n}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-[9px]">0</span>
                          );
                        })()}
                      </td>
                      {/* Slides count */}
                      <td className="px-1 py-px text-center whitespace-nowrap align-middle">
                        {(() => {
                          const n =
                            row.mediaStatus?.slideCount ??
                            (row.mediaStatus?.slides ? 1 : 0);
                          return n > 0 ? (
                            <span className="text-[10px] font-bold tabular-nums text-indigo-700">
                              {n}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-[9px]">0</span>
                          );
                        })()}
                      </td>
                      {/* Expiry */}
                      <td className="px-1 py-px text-left align-middle">
                        {formatExpiryVerbose(row.expiryDate)}
                      </td>
                    </tr>

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <tr className="bg-purple-50 border-b border-purple-200">
                        <td colSpan={11} className="px-4 py-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-2">
                              <h4 className="text-[10px] font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 pb-0.5">
                                Basic Information
                              </h4>
                              <div className="space-y-1 text-[10px]">
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-semibold">
                                    SOP Number:
                                  </span>
                                  <span className="text-gray-800 font-bold">
                                    {row.sopNo}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-semibold">
                                    Version:
                                  </span>
                                  <span className="text-gray-800 font-bold">
                                    {displayRev != null
                                      ? displayRev
                                      : row.version || "—"}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-semibold">
                                    Department:
                                  </span>
                                  <span className="text-gray-800 font-bold">
                                    {row.department || "Other"}
                                  </span>
                                </div>
                                {row.location ? (
                                  <div className="flex justify-between gap-2">
                                    <span className="text-gray-600 font-semibold shrink-0">
                                      Location:
                                    </span>
                                    <span className="text-gray-800 font-bold text-right">
                                      {row.location}
                                    </span>
                                  </div>
                                ) : null}
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-semibold">
                                    Language:
                                  </span>
                                  <span className="text-gray-800 font-bold">
                                    {row.isDualLanguage
                                      ? "English & Gujarati"
                                      : row.language === "Gujarati"
                                        ? "Gujarati"
                                        : "English"}
                                  </span>
                                </div>
                                {row.gujaratiFileMissing && (
                                  <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] text-amber-900 leading-snug">
                                    <span className="font-bold">
                                      Gujarati file not linked:
                                    </span>{" "}
                                    A Gujarati SOP entry exists for this code,
                                    but its file URL matches the English file
                                    (or no Gujarati path was found). Upload the
                                    Gujarati document and attach it to the
                                    Gujarati SOP or SOPLibrary entry so ENG /
                                    GUJ can show here.
                                  </div>
                                )}
                                {row.englishName && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 font-semibold">
                                      English Name:
                                    </span>
                                    <span
                                      className="text-gray-800 font-bold truncate max-w-[180px]"
                                      title={row.englishName}>
                                      {row.englishName}
                                    </span>
                                  </div>
                                )}
                                {row.gujaratiName && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 font-semibold">
                                      Gujarati Name:
                                    </span>
                                    <span
                                      className="text-gray-800 font-bold truncate max-w-[180px]"
                                      title={row.gujaratiName}>
                                      {row.gujaratiName}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-[10px] font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 pb-0.5">
                                Files & Media
                              </h4>
                              <div className="space-y-1.5 text-[10px]">
                                <div className="flex items-start gap-1.5">
                                  <File className="h-3 w-3 text-gray-500 mt-0.5 shrink-0" />
                                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                                    <span className="text-gray-600 font-semibold">
                                      Documents:
                                    </span>
                                    {(() => {
                                      const allDocs: Array<{
                                        fileName: string;
                                        filePath: string;
                                        fileType?: string;
                                        language?: string;
                                      }> = [];
                                      if (row.sopFile?.filePath) {
                                        allDocs.push({
                                          fileName: row.sopFile.fileName,
                                          filePath: row.sopFile.filePath,
                                          fileType: row.sopFile.fileType,
                                          language: "English",
                                        });
                                      }
                                      (row.sopDocuments || []).forEach(
                                        (doc: any) => {
                                          if (!doc.filePath) return;
                                          if (
                                            !allDocs.some(
                                              (d) =>
                                                d.filePath === doc.filePath,
                                            )
                                          ) {
                                            allDocs.push({
                                              fileName: doc.fileName,
                                              filePath: doc.filePath,
                                              fileType: doc.fileType,
                                              language:
                                                doc.language || "English",
                                            });
                                          }
                                        },
                                      );
                                      if (allDocs.length === 0)
                                        return (
                                          <span className="font-medium text-gray-500">
                                            No documents
                                          </span>
                                        );
                                      return (
                                        <div className="flex flex-col gap-0.5">
                                          {allDocs.map((doc, i) => {
                                            const docLang =
                                              doc.language === "Gujarati"
                                                ? "Gujarati"
                                                : "English";
                                            const prevHref = buildPreviewHref(
                                              doc.filePath,
                                              doc.fileType,
                                              row.sopNo,
                                              docLang,
                                            );
                                            const dk = fileKindFromStoredPath(
                                              doc.filePath,
                                              doc.fileType,
                                            );
                                            const dDocx =
                                              dk === "docx" || dk === "doc"
                                                ? buildDocxDownloadHref(
                                                    doc.filePath,
                                                    row.sopNo,
                                                    docLang,
                                                  )
                                                : null;
                                            const dPdf =
                                              dk === "pdf"
                                                ? buildPdfDownloadHref(
                                                    doc.filePath,
                                                    row.sopNo,
                                                    docLang,
                                                  )
                                                : null;
                                            return (
                                              <div
                                                key={`doc-${i}`}
                                                className="flex items-center gap-0.5 rounded border border-purple-100 bg-purple-50 pr-0.5">
                                                <a
                                                  href={prevHref}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="flex min-w-0 flex-1 items-center gap-1 px-1.5 py-1 text-[10px] font-medium text-purple-700 hover:bg-purple-100 hover:underline"
                                                  title="Preview">
                                                  <FileText className="h-2.5 w-2.5 shrink-0" />
                                                  <span
                                                    className="truncate"
                                                    title={doc.fileName}>
                                                    {doc.fileName}
                                                  </span>
                                                  {doc.language ===
                                                    "Gujarati" && (
                                                    <span className="text-[8px] text-indigo-600 font-bold ml-auto shrink-0">
                                                      GUJ
                                                    </span>
                                                  )}
                                                </a>
                                                <a
                                                  href={prevHref}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="shrink-0 rounded p-1 text-violet-600 hover:bg-violet-100"
                                                  title="Preview">
                                                  <Eye className="h-3 w-3" />
                                                </a>
                                                {dDocx ? (
                                                  <a
                                                    href={dDocx}
                                                    className="shrink-0 rounded p-1 text-blue-600 hover:bg-blue-50"
                                                    title="Download DOCX"
                                                    onClick={(e) =>
                                                      e.stopPropagation()
                                                    }>
                                                    <Download className="h-3 w-3" />
                                                  </a>
                                                ) : null}
                                                {dPdf ? (
                                                  <a
                                                    href={dPdf}
                                                    className="shrink-0 rounded p-1 text-slate-600 hover:bg-slate-100"
                                                    title="Download PDF"
                                                    onClick={(e) =>
                                                      e.stopPropagation()
                                                    }>
                                                    <Download className="h-3 w-3" />
                                                  </a>
                                                ) : null}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                    })()}
                                    {((Array.isArray(row.versionArtifacts) &&
                                      row.versionArtifacts.length > 0) ||
                                      (Array.isArray(
                                        row.versionArtifactsGujarati,
                                      ) &&
                                        row.versionArtifactsGujarati.length >
                                          0)) && (
                                      <div className="mt-2 rounded border border-teal-200 bg-teal-50/60 px-2 py-1.5">
                                        <span className="text-[9px] font-bold uppercase tracking-wide text-teal-900">
                                          All uploaded versions
                                        </span>
                                        <div className="mt-1 flex flex-col gap-1.5">
                                          {Array.isArray(
                                            row.versionArtifacts,
                                          ) &&
                                            row.versionArtifacts.length > 0 && (
                                              <div>
                                                {row.isDualLanguage && (
                                                  <span className="text-[8px] font-bold text-gray-600">
                                                    English
                                                  </span>
                                                )}
                                                {renderVersionArtifactLinks(
                                                  row.versionArtifacts,
                                                  row,
                                                  "English",
                                                  undefined,
                                                  2,
                                                  true,
                                                )}
                                              </div>
                                            )}
                                          {Array.isArray(
                                            row.versionArtifactsGujarati,
                                          ) &&
                                            row.versionArtifactsGujarati
                                              .length > 0 && (
                                              <div>
                                                {row.isDualLanguage && (
                                                  <span className="text-[8px] font-bold text-gray-600">
                                                    Gujarati
                                                  </span>
                                                )}
                                                {renderVersionArtifactLinks(
                                                  row.versionArtifactsGujarati,
                                                  row,
                                                  "Gujarati",
                                                  undefined,
                                                  2,
                                                  true,
                                                )}
                                              </div>
                                            )}
                                        </div>
                                      </div>
                                    )}
                                    {((Array.isArray(
                                      row.versionArtifactsSuperseded,
                                    ) &&
                                      row.versionArtifactsSuperseded.length >
                                        0) ||
                                      (Array.isArray(
                                        row.versionArtifactsGujaratiSuperseded,
                                      ) &&
                                        row.versionArtifactsGujaratiSuperseded
                                          .length > 0)) && (
                                      <div className="mt-2 rounded border border-amber-200 bg-amber-50/70 px-2 py-1.5">
                                        <span className="text-[9px] font-bold uppercase tracking-wide text-amber-900">
                                          Superseded older versions
                                        </span>
                                        <p className="mt-0.5 text-[8px] leading-snug text-amber-800/90">
                                          Not listed in the main &quot;Prior
                                          versions&quot; column. Open the
                                          dashboard{" "}
                                          <strong>Prior Ver. Archive</strong>{" "}
                                          button for the full list.
                                        </p>
                                        <div className="mt-1 flex flex-col gap-1.5 opacity-90">
                                          {Array.isArray(
                                            row.versionArtifactsSuperseded,
                                          ) &&
                                            row.versionArtifactsSuperseded
                                              .length > 0 && (
                                              <div>
                                                <span className="text-[8px] font-bold text-gray-600">
                                                  English
                                                </span>
                                                {renderVersionArtifactLinks(
                                                  row.versionArtifactsSuperseded,
                                                  row,
                                                  "English",
                                                )}
                                              </div>
                                            )}
                                          {Array.isArray(
                                            row.versionArtifactsGujaratiSuperseded,
                                          ) &&
                                            row
                                              .versionArtifactsGujaratiSuperseded
                                              .length > 0 && (
                                              <div>
                                                <span className="text-[8px] font-bold text-gray-600">
                                                  Gujarati
                                                </span>
                                                {renderVersionArtifactLinks(
                                                  row.versionArtifactsGujaratiSuperseded,
                                                  row,
                                                  "Gujarati",
                                                )}
                                              </div>
                                            )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Video className="h-3 w-3 text-blue-600" />
                                  <span className="text-gray-600 font-semibold">
                                    Videos:
                                  </span>
                                  <span className="text-gray-800 font-bold tabular-nums">
                                    {videoCount}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Presentation className="h-3 w-3 text-indigo-600" />
                                  <span className="text-gray-600 font-semibold">
                                    Slides:
                                  </span>
                                  <span className="text-gray-800 font-bold tabular-nums">
                                    {slideCount}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                  {mediaTags.map((t) => (
                                    <span
                                      key={t}
                                      className="rounded border border-gray-200 bg-white px-1 py-px text-[8px] font-bold text-gray-600">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-[10px] font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 pb-0.5">
                                Review & Assignment
                              </h4>
                              <div className="space-y-1 text-[10px]">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="h-3 w-3 text-gray-500" />
                                  <span className="text-gray-600 font-semibold">
                                    Expiry:
                                  </span>
                                  <span>
                                    {formatExpiryVerbose(row.expiryDate)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <UserIcon className="h-3 w-3 text-gray-500" />
                                  <span className="text-gray-600 font-semibold">
                                    Trainer:
                                  </span>
                                  <span
                                    className="text-gray-800 font-bold truncate"
                                    title={row.assignedTrainer}>
                                    {row.assignedTrainer || "Unassigned"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Users className="h-3 w-3 text-gray-500" />
                                  <span className="text-gray-600 font-semibold">
                                    Users:
                                  </span>
                                  <span className="text-gray-800 font-bold">
                                    {row.assignedUsers?.length || 0}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenGuidelineWizard?.({
                                      _id: String(row._id),
                                      sopNo: String(row.sopNo),
                                    });
                                  }}
                                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[10px] font-bold text-indigo-800 shadow-sm transition-colors hover:bg-indigo-100"
                                  title="Compare this SOP to stored guidelines (select documents in the dialog)">
                                  <BookOpen className="h-3.5 w-3.5 shrink-0" />
                                  Guideline check
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.print();
                                  }}
                                  className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
                                  title="Print this SOP record (GRM support)">
                                  <Printer className="h-3.5 w-3.5 shrink-0" />
                                  Print (GRM)
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setObsoleteTarget({
                                      sopNo: String(row.sopNo),
                                      sopName: String(row.englishName || row.sopName || row.sopNo),
                                    });
                                    setObsoletePassword("");
                                    setObsoleteError("");
                                    setTimeout(() => obsoleteInputRef.current?.focus(), 50);
                                  }}
                                  className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] font-bold text-red-700 shadow-sm transition-colors hover:bg-red-100"
                                  title="Mark this SOP as obsolete — removes it from registry and capsule data">
                                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                                  Mark Obsolete
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>


      {/* Obsolete confirmation modal */}
      {obsoleteTarget && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setObsoleteTarget(null)}>
          <div
            className="mx-4 w-full max-w-sm rounded-xl border border-red-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Mark as Obsolete</h3>
                  <p className="text-[10px] text-gray-500">This action cannot be undone</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setObsoleteTarget(null)}
                className="rounded p-0.5 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 rounded bg-red-50 border border-red-100 px-3 py-2 text-[11px] font-semibold text-red-900 leading-snug">
              <span className="block font-bold text-red-800">{obsoleteTarget.sopNo}</span>
              {obsoleteTarget.sopName}
            </p>
            <p className="mb-2 text-[10px] text-gray-600 leading-snug">
              This SOP will be removed from the registry and capsule data and moved to the Obsolete SOPs section.
              Enter the obsolete password to confirm.
            </p>
            <input
              ref={obsoleteInputRef}
              type="password"
              placeholder="Enter password"
              value={obsoletePassword}
              onChange={(e) => { setObsoletePassword(e.target.value); setObsoleteError(""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && obsoletePassword && !obsoleteBusy) handleObsoleteConfirm();
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-800 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300 mb-1"
            />
            {obsoleteError && (
              <p className="text-[10px] text-red-600 font-semibold mb-2">{obsoleteError}</p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setObsoleteTarget(null)}
                className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={!obsoletePassword || obsoleteBusy}
                onClick={handleObsoleteConfirm}
                className="flex-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {obsoleteBusy ? "Processing…" : "Confirm Obsolete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function handleObsoleteConfirm() {
    if (!obsoleteTarget || !obsoletePassword) return;
    setObsoleteBusy(true);
    setObsoleteError("");
    try {
      const user = (() => {
        try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
      })();
      const res = await fetch("/api/sop/mark-obsolete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sopIdentifier: obsoleteTarget.sopNo,
          password: obsoletePassword,
          username: user?.username,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setObsoleteError(json.error || "Failed to mark obsolete");
        return;
      }
      setObsoleteTarget(null);
      setObsoletePassword("");
      onMarkObsolete?.(obsoleteTarget.sopNo);
    } catch {
      setObsoleteError("Network error — please try again");
    } finally {
      setObsoleteBusy(false);
    }
  }
}
