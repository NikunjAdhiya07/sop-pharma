import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import SOPVersionArtifacts from '@/models/SOPVersionArtifacts';
import { normalizeSopIdentifierKey, sopIdentifierMatchFilter } from '@/lib/sopIdentifierNormalize';

function normPathKey(p: string): string {
  const base = (p || '').trim().split(/[?#]/)[0];
  return base.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '').toLowerCase();
}

function looksGujarati(sop: {
  language?: string;
  name?: string;
  originalFileName?: string;
  fileUrl?: string;
  folderPath?: string;
}): boolean {
  if (sop.language === 'Gujarati') return true;
  const name = (sop.name || '') + (sop.originalFileName || '');
  const url = sop.fileUrl || '';
  const folder = sop.folderPath || '';
  if (/[\u0A80-\u0AFF]{4,}/.test(name)) return true;
  if (/(^|[/\\\s_-])guj([/\\\s_-]|$)/i.test(url) || /gujarati/i.test(url)) return true;
  if (/(^|[/\\\s_-])guj([/\\\s_-]|$)/i.test(folder) || /gujarati/i.test(folder)) return true;
  return false;
}

function isDocxRecord(fileUrl?: string, fileType?: string): boolean {
  if (!fileUrl) return false;
  const u = fileUrl.toLowerCase();
  const t = (fileType || '').toLowerCase();
  if (t === 'docx' || t === 'doc') return true;
  return u.endsWith('.docx') || u.endsWith('.doc');
}

function pickBestDocxFromArtifacts(
  docs: any[],
  lang: 'English' | 'Gujarati',
  excludeNormPaths: Set<string>,
): string | null {
  let bestPath: string | null = null;
  let bestVer = -1;
  for (const doc of docs) {
    if (String(doc.language || '') !== lang) continue;
    for (const e of doc.entries || []) {
      const p = e.docxPath?.trim();
      if (!p || !isDocxRecord(p, 'docx')) continue;
      const nk = normPathKey(p);
      if (excludeNormPaths.has(nk)) continue;
      const v = typeof e.version === 'number' ? e.version : parseInt(String(e.version), 10);
      if (!Number.isFinite(v)) continue;
      if (v > bestVer) {
        bestVer = v;
        bestPath = p;
      }
    }
  }
  return bestPath;
}

export type DualDocxPaths = {
  identifier: string;
  englishPath: string | null;
  gujaratiPath: string | null;
};

/**
 * Resolve primary English vs Gujarati DOCX paths for split preview (SOP + SOPLibrary + version artifacts).
 */
export async function resolveDualDocxPaths(identifier: string): Promise<DualDocxPaths | null> {
  const id = String(identifier || '').trim();
  if (!id) return null;

  const displayId = normalizeSopIdentifierKey(id.toUpperCase());

  const sopQ = sopIdentifierMatchFilter(id);
  const sops = await SOP.find(sopQ)
    .select('identifier fileUrl fileType language name originalFileName folderPath updatedAt')
    .sort({ updatedAt: -1 })
    .lean();

  const libQ = sopIdentifierMatchFilter(id, 'sopIdentifier');
  const libs = await SOPLibrary.find(libQ).select('sopIdentifier sopDocuments language').lean();

  type Cand = { path: string; lang: 'English' | 'Gujarati'; priority: number };

  const cands: Cand[] = [];

  for (const s of sops as any[]) {
    if (!isDocxRecord(s.fileUrl, s.fileType)) continue;
    const lang: 'English' | 'Gujarati' =
      s.language === 'Gujarati' || looksGujarati(s) ? 'Gujarati' : 'English';
    cands.push({ path: s.fileUrl, lang, priority: 0 });
  }

  for (const lib of libs as any[]) {
    const libLang = lib.language === 'Gujarati' ? 'Gujarati' : 'English';
    for (const doc of lib.sopDocuments || []) {
      if (!doc?.filePath || !isDocxRecord(doc.filePath, doc.fileType)) continue;
      const lang: 'English' | 'Gujarati' =
        doc.language === 'Gujarati' ? 'Gujarati' : doc.language === 'English' ? 'English' : libLang;
      cands.push({ path: doc.filePath, lang, priority: 1 });
    }
  }

  const engPaths: string[] = [];
  const gujPaths: string[] = [];
  cands.sort((a, b) => a.priority - b.priority);
  for (const c of cands) {
    if (c.lang === 'Gujarati') gujPaths.push(c.path);
    else engPaths.push(c.path);
  }

  const engNorms = new Set(engPaths.map(normPathKey));

  let englishPath: string | null = null;
  for (const p of engPaths) {
    const n = normPathKey(p);
    if (!englishPath) {
      englishPath = p;
      continue;
    }
    if (n === normPathKey(englishPath)) continue;
  }

  let gujaratiPath: string | null = null;
  for (const p of gujPaths) {
    const n = normPathKey(p);
    if (engNorms.has(n)) continue;
    if (englishPath && n === normPathKey(englishPath)) continue;
    gujaratiPath = p;
    break;
  }

  // Folder-upload history: fill gaps from SOPVersionArtifacts (best available DOCX per language)
  if (!englishPath || !gujaratiPath) {
    const artQ = sopIdentifierMatchFilter(id);
    const arts = await SOPVersionArtifacts.find(artQ).select('identifier language entries').lean();

    const excl = new Set(engNorms);
    if (englishPath) excl.add(normPathKey(englishPath));
    if (gujaratiPath) excl.add(normPathKey(gujaratiPath));

    if (!englishPath) {
      const p = pickBestDocxFromArtifacts(arts as any[], 'English', excl);
      if (p) {
        englishPath = p;
        excl.add(normPathKey(p));
      }
    }
    if (!gujaratiPath) {
      const p = pickBestDocxFromArtifacts(arts as any[], 'Gujarati', excl);
      if (p) gujaratiPath = p;
    }
  }

  return {
    identifier: displayId,
    englishPath,
    gujaratiPath,
  };
}
