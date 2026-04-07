/**
 * Distinct DOCX/PDF paths on a registry row. Uses path extension first (same as FILES column / view-doc),
 * because SOPLibrary often declares fileType=pdf while filePath still points at a .docx.
 */

import { fileKindFromStoredPath } from '@/lib/filePathFileKind';

/** Same heuristics as dashboard SOP API — Gujarati assets often lack `language: Gujarati`. */
function pathSuggestsGujarati(rawPath: string): boolean {
  const u = String(rawPath || '')
    .toLowerCase()
    .replace(/\\/g, '/');
  if (!u) return false;
  if (/\bgujarati\b/.test(u)) return true;
  if (/\/guj(\/|$|[_.-])/i.test(u)) return true;
  if (/[_-]guj([._/\-]|arati)/i.test(u)) return true;
  if (/gujarati\s+sop/i.test(u)) return true;
  return false;
}

function attachmentLanguage(doc: any, row: any): 'English' | 'Gujarati' {
  const ex = String(doc?.language || '').trim().toLowerCase();
  if (ex === 'gujarati') return 'Gujarati';
  const p = String(doc?.filePath || doc?.fileUrl || '');
  if (ex === 'english' && pathSuggestsGujarati(p)) return 'Gujarati';
  if (pathSuggestsGujarati(p)) return 'Gujarati';
  if (String(row?.language || '').trim().toLowerCase() === 'gujarati') return 'Gujarati';
  return 'English';
}

export type RowLanguageFileSlots = {
  engDocx: boolean;
  gujDocx: boolean;
  engPdf: boolean;
  gujPdf: boolean;
};

/** Per-language file presence (same rules as {@link countRowDocxPdfForCapsules}). */
export function scanRowLanguageFileSlots(row: any): RowLanguageFileSlots {
  let engDocx = false;
  let gujDocx = false;
  let engPdf = false;
  let gujPdf = false;

  const docList = [...(row.sopFile ? [row.sopFile] : []), ...(row.sopDocuments || [])];
  for (const d of docList) {
    const p = (d.filePath || d.fileUrl || '').trim();
    if (!p) continue;
    const k = fileKindFromStoredPath(p, d.fileType);
    const lang = attachmentLanguage(d, row);
    if (k === 'docx' || k === 'doc') {
      if (lang === 'Gujarati') gujDocx = true;
      else engDocx = true;
    } else if (k === 'pdf') {
      if (lang === 'Gujarati') gujPdf = true;
      else engPdf = true;
    }
  }

  const artifactKeys = ['versionArtifacts', 'versionArtifactsGujarati'] as const;
  for (const key of artifactKeys) {
    const entries = row[key];
    if (!Array.isArray(entries)) continue;
    const bucketGuj = key === 'versionArtifactsGujarati';
    for (const e of entries) {
      for (const rawPath of [e?.docxPath, e?.pdfPath] as const) {
        const pathStr = String(rawPath || '').trim();
        if (!pathStr) continue;
        const fk = fileKindFromStoredPath(pathStr, undefined);
        const lang: 'English' | 'Gujarati' = (bucketGuj || pathSuggestsGujarati(pathStr))
          ? 'Gujarati'
          : 'English';
        if (fk === 'docx' || fk === 'doc') {
          if (lang === 'Gujarati') gujDocx = true;
          else engDocx = true;
        } else if (fk === 'pdf') {
          if (lang === 'Gujarati') gujPdf = true;
          else engPdf = true;
        }
      }
    }
  }

  return { engDocx, gujDocx, engPdf, gujPdf };
}

/** Expected DOCX language slots (1 = single-language row, 2 = EN+GU both need a DOCX). */
export function expectedDocxSlotsForRow(row: any): number {
  if (row?.isDualLanguage === true) return 2;
  if (row?.englishVersion && row?.gujaratiVersion) return 2;
  const s = scanRowLanguageFileSlots(row);
  if (s.engDocx && s.gujDocx) return 2;
  return 1;
}

/** Expected PDF language slots (independent of DOCX — bilingual PDF may be missing while DOCX exists). */
export function expectedPdfSlotsForRow(row: any): number {
  if (row?.isDualLanguage === true) return 2;
  if (row?.englishVersion && row?.gujaratiVersion) return 2;
  const s = scanRowLanguageFileSlots(row);
  if (s.engPdf && s.gujPdf) return 2;
  return 1;
}

function normPathKey(p: string): string {
  return (p || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '').toLowerCase();
}

const ARTIFACT_KEYS_ALL = [
  'versionArtifacts',
  'versionArtifactsGujarati',
  'versionArtifactsSuperseded',
  'versionArtifactsGujaratiSuperseded',
] as const;

const ARTIFACT_KEYS_MAIN_ONLY = ['versionArtifacts', 'versionArtifactsGujarati'] as const;

function addPath(
  seenDocx: Set<string>,
  seenPdf: Set<string>,
  path: string | undefined,
  kind: 'docx' | 'pdf',
) {
  const p = (path || '').trim();
  if (!p) return;
  const k = normPathKey(p);
  if (kind === 'docx') seenDocx.add(k);
  else seenPdf.add(k);
}

function ingestAttachedDocs(row: any, seenDocx: Set<string>, seenPdf: Set<string>) {
  const docList = [...(row.sopFile ? [row.sopFile] : []), ...(row.sopDocuments || [])];
  for (const d of docList) {
    const p = (d.filePath || d.fileUrl || '').trim();
    if (!p) continue;
    const k = fileKindFromStoredPath(p, d.fileType);
    if (k === 'docx' || k === 'doc') addPath(seenDocx, seenPdf, p, 'docx');
    else if (k === 'pdf') addPath(seenDocx, seenPdf, p, 'pdf');
  }
}

function ingestArtifactKeys(
  row: any,
  keys: readonly string[],
  seenDocx: Set<string>,
  seenPdf: Set<string>,
) {
  for (const key of keys) {
    const entries = row[key];
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (e?.docxPath?.trim()) addPath(seenDocx, seenPdf, e.docxPath, 'docx');
      if (e?.pdfPath?.trim()) addPath(seenDocx, seenPdf, e.pdfPath, 'pdf');
    }
  }
}

/**
 * Distinct DOCX/PDF on **sopFile + sopDocuments only** — matches what the registry **Files** column lists
 * (current attachments from library + SOP merge, not prior-version-only artifact slots).
 */
export function countRowDocxPdfAttached(row: any): { docx: number; pdf: number } {
  const seenDocx = new Set<string>();
  const seenPdf = new Set<string>();
  ingestAttachedDocs(row, seenDocx, seenPdf);
  return { docx: seenDocx.size, pdf: seenPdf.size };
}

/**
 * Distinct DOCX/PDF storage paths on a registry row, optionally including version-artifact buckets.
 * @param opts.includeSuperseded — default `true` (full inventory). Set `false` to count main + main-GUJ artifact slots only.
 */
export function countRowDocxPdf(row: any, opts?: { includeSuperseded?: boolean }): { docx: number; pdf: number } {
  const includeSuperseded = opts?.includeSuperseded !== false;
  const seenDocx = new Set<string>();
  const seenPdf = new Set<string>();

  ingestAttachedDocs(row, seenDocx, seenPdf);

  const keys = includeSuperseded ? ARTIFACT_KEYS_ALL : ARTIFACT_KEYS_MAIN_ONLY;
  ingestArtifactKeys(row, keys, seenDocx, seenPdf);

  return { docx: seenDocx.size, pdf: seenPdf.size };
}

/**
 * Department capsules: count available "slots" per row (English, Gujarati).
 * For a Dual-Language SOP, we expect 2 slots (English, Gujarati).
 * Available = how many of those slots have at least one file.
 * This ensures the total reaches 470 (427 rows + 43 dual) and accurately reports gaps.
 */
export function countRowDocxPdfForCapsules(row: any): { docx: number; pdf: number } {
  const s = scanRowLanguageFileSlots(row);
  return {
    docx: (s.engDocx ? 1 : 0) + (s.gujDocx ? 1 : 0),
    pdf: (s.engPdf ? 1 : 0) + (s.gujPdf ? 1 : 0),
  };
}
