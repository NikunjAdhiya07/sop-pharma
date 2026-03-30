/**
 * Distinct DOCX/PDF paths on a registry row. Uses path extension first (same as FILES column / view-doc),
 * because SOPLibrary often declares fileType=pdf while filePath still points at a .docx.
 */

import { fileKindFromStoredPath } from '@/lib/filePathFileKind';

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
  let hasEngDocx = false;
  let hasEngPdf = false;
  let hasGjDocx = false;
  let hasGjPdf = false;

  const docList = [...(row.sopFile ? [row.sopFile] : []), ...(row.sopDocuments || [])];
  
  for (const d of docList) {
    const p = (d.filePath || d.fileUrl || '').trim();
    if (!p) continue;
    const k = fileKindFromStoredPath(p, d.fileType);
    // sopFile is usually English; sopDocuments has explicit language
    const lang = d.language === 'Gujarati' ? 'Gujarati' : 'English';
    
    if (k === 'docx' || k === 'doc') {
      if (lang === 'Gujarati') hasGjDocx = true;
      else hasEngDocx = true;
    } else if (k === 'pdf') {
      if (lang === 'Gujarati') hasGjPdf = true;
      else hasEngPdf = true;
    }
  }

  // Also check artifact-rows if this row is an artifact-only kind
  // or if we want to include artifacts as "available" (main registry uses artifacts for the Files column)
  const artifactKeys = ['versionArtifacts', 'versionArtifactsGujarati'] as const;
  for (const key of artifactKeys) {
    const entries = row[key];
    if (!Array.isArray(entries)) continue;
    const lang = key === 'versionArtifactsGujarati' ? 'Gujarati' : 'English';
    for (const e of entries) {
      if (e?.docxPath?.trim()) {
        if (lang === 'Gujarati') hasGjDocx = true;
        else hasEngDocx = true;
      }
      if (e?.pdfPath?.trim()) {
        if (lang === 'Gujarati') hasGjPdf = true;
        else hasEngPdf = true;
      }
    }
  }

  return {
    docx: (hasEngDocx ? 1 : 0) + (hasGjDocx ? 1 : 0),
    pdf: (hasEngPdf ? 1 : 0) + (hasGjPdf ? 1 : 0),
  };
}
