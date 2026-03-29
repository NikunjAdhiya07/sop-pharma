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

/** Department capsules + DOCX/PDF filters: same as {@link countRowDocxPdfAttached} (aligned with Files column). */
export function countRowDocxPdfForCapsules(row: any): { docx: number; pdf: number } {
  return countRowDocxPdfAttached(row);
}
