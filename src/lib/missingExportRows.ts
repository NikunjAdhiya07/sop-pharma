import {
  countRowDocxPdfAttached,
  expectedDocxSlotsForRow,
  expectedPdfSlotsForRow,
  scanRowLanguageFileSlots,
} from "./registryRowDocCounts";
import { parseRevisionFromSopIdentifier } from "./sopIdentifierNormalize";

export type MissingCategory = {
  key:
    | "docx-all"
    | "docx-eng"
    | "docx-guj"
    | "pdf-all"
    | "pdf-eng"
    | "pdf-guj"
    | "video"
    | "slides"
    | "version-all"
    | "version-eng"
    | "version-guj";
  label: string;
  sheetName: string;
  fileName: string;
};

type FilterState = {
  filterFileType: "all" | "DOCX" | "NO_DOCX" | "PDF" | "NO_PDF";
  filterMedia: string;
  filterVersionStatus: string;
  filterLanguage: "all" | "ENG" | "GUJ" | "BOTH";
};

export function detectMissingCategory(s: FilterState): MissingCategory | null {
  const lang = s.filterLanguage;
  const langSuffix = lang === "ENG" ? " (EN)" : lang === "GUJ" ? " (GUJ)" : "";
  const langKey = lang === "ENG" ? "eng" : lang === "GUJ" ? "guj" : "all";

  if (s.filterFileType === "NO_DOCX") {
    return {
      key: `docx-${langKey}` as MissingCategory["key"],
      label: `Missing DOCX${langSuffix}`,
      sheetName: `Missing DOCX${langSuffix}`,
      fileName: `Missing_Files_DOCX${lang !== "all" ? "_" + lang : ""}.xlsx`,
    };
  }
  if (s.filterFileType === "NO_PDF") {
    return {
      key: `pdf-${langKey}` as MissingCategory["key"],
      label: `Missing PDF${langSuffix}`,
      sheetName: `Missing PDF${langSuffix}`,
      fileName: `Missing_Files_PDF${lang !== "all" ? "_" + lang : ""}.xlsx`,
    };
  }
  if (s.filterMedia === "no-video") {
    return {
      key: "video",
      label: "Missing Videos",
      sheetName: "Missing Videos",
      fileName: "Missing_Files_Videos.xlsx",
    };
  }
  if (s.filterMedia === "no-slides") {
    return {
      key: "slides",
      label: "Missing Slides",
      sheetName: "Missing Slides",
      fileName: "Missing_Files_Slides.xlsx",
    };
  }
  if (s.filterVersionStatus === "notFoundv") {
    return {
      key: `version-${langKey}` as MissingCategory["key"],
      label: `Missing Versions${langSuffix}`,
      sheetName: `Missing Versions${langSuffix}`,
      fileName: `Missing_Files_Versions${lang !== "all" ? "_" + lang : ""}.xlsx`,
    };
  }
  return null;
}

const baseCols = (d: any) => ({
  "SOP Number": d.sopNo || "",
  "SOP Name": d.englishName || d.sopName || "",
  "Gujarati Name": d.gujaratiName || "",
  "Department": d.department || "",
  "Location": d.location || "",
  "Version": d.version ?? "",
  "Language": d.language || (d.isDualLanguage ? "Dual" : ""),
});

function attachmentLang(d: any, row: any): "English" | "Gujarati" {
  const raw = String(d.language || d.lang || "").toLowerCase();
  if (raw.startsWith("guj")) return "Gujarati";
  if (raw.startsWith("eng")) return "English";
  return row?.isDualLanguage ? "English" : "English";
}
function fileKind(path: string, hintType?: string): "docx" | "pdf" | "other" {
  const t = String(hintType || "").toLowerCase();
  if (t === "docx" || t === "doc") return "docx";
  if (t === "pdf") return "pdf";
  const p = path.toLowerCase();
  if (p.endsWith(".docx") || p.endsWith(".doc")) return "docx";
  if (p.endsWith(".pdf")) return "pdf";
  return "other";
}
function gatherCurrentPaths(row: any): { engDocx: string[]; gujDocx: string[]; engPdf: string[]; gujPdf: string[] } {
  const out = { engDocx: [] as string[], gujDocx: [] as string[], engPdf: [] as string[], gujPdf: [] as string[] };
  const list = [...(row.sopFile ? [row.sopFile] : []), ...(row.sopDocuments || [])];
  for (const d of list) {
    const p = String(d.filePath || d.fileUrl || "").trim();
    if (!p) continue;
    const k = fileKind(p, d.fileType);
    const lang = attachmentLang(d, row);
    if (k === "docx") (lang === "Gujarati" ? out.gujDocx : out.engDocx).push(p);
    else if (k === "pdf") (lang === "Gujarati" ? out.gujPdf : out.engPdf).push(p);
  }
  return out;
}

function describeMissingDocx(d: any): { langs: string; existing: string } {
  const slots = scanRowLanguageFileSlots(d);
  const need = expectedDocxSlotsForRow(d);
  const paths = gatherCurrentPaths(d);
  const missing: string[] = [];
  const existing: string[] = [];
  if (!slots.engDocx) missing.push("EN DOCX"); else existing.push(`EN: ${paths.engDocx.join(", ")}`);
  if (need === 2) {
    if (!slots.gujDocx) missing.push("GUJ DOCX"); else existing.push(`GUJ: ${paths.gujDocx.join(", ")}`);
  }
  return { langs: missing.join(", "), existing: existing.join(" | ") };
}
function describeMissingPdf(d: any): { langs: string; existing: string } {
  const slots = scanRowLanguageFileSlots(d);
  const need = expectedPdfSlotsForRow(d);
  const paths = gatherCurrentPaths(d);
  const missing: string[] = [];
  const existing: string[] = [];
  if (!slots.engPdf) missing.push("EN PDF"); else existing.push(`EN: ${paths.engPdf.join(", ")}`);
  if (need === 2) {
    if (!slots.gujPdf) missing.push("GUJ PDF"); else existing.push(`GUJ: ${paths.gujPdf.join(", ")}`);
  }
  return { langs: missing.join(", "), existing: existing.join(" | ") };
}

/**
 * Enumerate expected prior versions for this row and report which specific
 * version + language + format combinations have no file path. Matches the
 * classifier in sopVersionCapsuleClassify.ts: expects up to 2 priors (currVer-1, currVer-2).
 * langScope filters by language; formatScope filters by docx/pdf (or both).
 */
function describeMissingVersions(
  d: any,
  langScope: "all" | "eng" | "guj",
): { missing: string; present: string } {
  const currVer = parseRevisionFromSopIdentifier(String(d?.sopNo || ""));
  if (currVer === null || currVer === 0) return { missing: "", present: "" };
  const expectedSlots = currVer >= 2 ? 2 : 1;
  const expectsGj = expectedDocxSlotsForRow(d) >= 2;

  const enArts: any[] = Array.isArray(d?.versionArtifacts) ? d.versionArtifacts : [];
  const gjArts: any[] = Array.isArray(d?.versionArtifactsGujarati) ? d.versionArtifactsGujarati : [];

  const missing: string[] = [];
  const present: string[] = [];

  for (let i = 1; i <= expectedSlots; i++) {
    const prev = currVer - i;
    // English side
    if (langScope !== "guj") {
      const e = enArts.find((a) => Number(a?.version) === prev);
      const docx = e?.docxPath?.trim();
      const pdf = e?.pdfPath?.trim();
      if (!docx) missing.push(`EN v${prev} DOCX`);
      else present.push(`EN v${prev} DOCX: ${docx}`);
      if (!pdf) missing.push(`EN v${prev} PDF`);
      else present.push(`EN v${prev} PDF: ${pdf}`);
    }
    // Gujarati side — only if row expects GJ
    if (langScope !== "eng" && expectsGj) {
      const g = gjArts.find((a) => Number(a?.version) === prev);
      const docx = g?.docxPath?.trim();
      const pdf = g?.pdfPath?.trim();
      if (!docx) missing.push(`GUJ v${prev} DOCX`);
      else present.push(`GUJ v${prev} DOCX: ${docx}`);
      if (!pdf) missing.push(`GUJ v${prev} PDF`);
      else present.push(`GUJ v${prev} PDF: ${pdf}`);
    }
  }
  return { missing: missing.join("; "), present: present.join(" | ") };
}

export function buildMissingExportRows(
  rows: any[],
  category: MissingCategory,
): Record<string, any>[] {
  return rows.map((d) => {
    const base = baseCols(d);
    switch (category.key) {
      case "docx-all":
      case "docx-eng":
      case "docx-guj": {
        const counts = countRowDocxPdfAttached(d);
        const desc = describeMissingDocx(d);
        return {
          ...base,
          "DOCX Slots Expected": expectedDocxSlotsForRow(d),
          "DOCX Slots Filled": counts.docx,
          "Missing DOCX": desc.langs,
          "Existing DOCX Files": desc.existing,
          "Missing Reason": category.label,
        };
      }
      case "pdf-all":
      case "pdf-eng":
      case "pdf-guj": {
        const counts = countRowDocxPdfAttached(d);
        const desc = describeMissingPdf(d);
        return {
          ...base,
          "PDF Slots Expected": expectedPdfSlotsForRow(d),
          "PDF Slots Filled": counts.pdf,
          "Missing PDF": desc.langs,
          "Existing PDF Files": desc.existing,
          "Missing Reason": category.label,
        };
      }
      case "video": {
        const ms = d.mediaStatus || {};
        return {
          ...base,
          "Videos Required": ms.videoRequired ?? 0,
          "Videos Available": ms.videoAvailable ?? 0,
          "Videos Missing": Math.max(0, (ms.videoRequired ?? 0) - (ms.videoAvailable ?? 0)),
          "Missing Reason": "No video uploaded",
        };
      }
      case "slides": {
        const ms = d.mediaStatus || {};
        return {
          ...base,
          "Slides Required": ms.slideRequired ?? 0,
          "Slides Available": ms.slideAvailable ?? 0,
          "Slides Missing": Math.max(0, (ms.slideRequired ?? 0) - (ms.slideAvailable ?? 0)),
          "Missing Reason": "No slides uploaded",
        };
      }
      case "version-all":
      case "version-eng":
      case "version-guj": {
        const langFilter =
          category.key === "version-eng" ? "eng" :
          category.key === "version-guj" ? "guj" : "all";
        const v = describeMissingVersions(d, langFilter);
        return {
          ...base,
          "Current Version": d.version ?? "",
          "Missing Prior Versions (which version + which file)": v.missing,
          "Existing Prior Version Files": v.present,
          "Missing Reason": category.label,
        };
      }
      default:
        return base;
    }
  });
}
