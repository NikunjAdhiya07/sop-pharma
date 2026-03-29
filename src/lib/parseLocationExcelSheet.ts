import * as XLSX from 'xlsx';
import { normalizeSopIdentifierKey } from '@/lib/sopIdentifierNormalize';

function cellToString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v).trim();
  return String(v).trim();
}

function normCell(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Header cell like "SOP No. / Annexure No." */
function isSopColumnHeader(text: string): boolean {
  const n = normCell(text);
  if (!n) return false;
  if (/^sr\.?\s*no/.test(n)) return false;
  if (/title|document title/.test(n) && !/sop/.test(n)) return false;
  if (/sop/.test(n) && (/no|number|code|annexure/.test(n) || /\/\s*annexure/.test(n))) return true;
  if (/annexure/.test(n) && /no/.test(n)) return true;
  return false;
}

/** "DP No." = distribution / storage point (location group) */
function isDpColumnHeader(text: string): boolean {
  const n = normCell(text);
  if (!n) return false;
  if (/^dp\s*no/.test(n)) return true;
  if (n === 'dp no.' || n === 'dp no') return true;
  if (/distribution\s*point/.test(n)) return true;
  return false;
}

function isNaSopCell(text: string): boolean {
  const t = text.trim().toUpperCase();
  return !t || /^N\/?A$/.test(t) || /^[-–—]+$/.test(t) || /^NIL$/i.test(t);
}

/** Typical codes: STGE08-02, QAGE103-04, PRGE01-05 */
function looksLikeSopIdentifier(text: string): boolean {
  const t = text.trim().toUpperCase().replace(/\s+/g, '');
  if (isNaSopCell(t)) return false;
  if (t.length > 40) return false;
  return /^[A-Z]{2,8}\d+[A-Z]?-\d+$/i.test(t) || /^[A-Z]{2,8}\d+-\d{2,4}$/i.test(t);
}

export type LocationSheetParseResult = {
  pairs: { sopRaw: string; location: string }[];
  headerRowIndex: number;
  facilityPrefix: string;
  parseNote?: string;
};

/**
 * Reads site layout sheets: optional facility title row(s), header with Sr / DP No. / SOP No. / Title,
 * merged DP cells (only first row of block has text — forward-filled).
 */
export function parseLocationExcelSheet(ws: XLSX.WorkSheet): LocationSheetParseResult {
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  if (!rawRows.length) {
    return { pairs: [], headerRowIndex: -1, facilityPrefix: '' };
  }

  let headerRowIndex = -1;
  let sopCol = -1;
  let dpCol = -1;

  for (let r = 0; r < Math.min(rawRows.length, 80); r++) {
    const row = rawRows[r] || [];
    const cells = row.map((c) => cellToString(c));
    let sopIdx = -1;
    let dpIdx = -1;
    for (let c = 0; c < cells.length; c++) {
      if (isSopColumnHeader(cells[c])) sopIdx = c;
      if (isDpColumnHeader(cells[c])) dpIdx = c;
    }
    if (sopIdx >= 0 && dpIdx >= 0) {
      headerRowIndex = r;
      sopCol = sopIdx;
      dpCol = dpIdx;
      break;
    }
  }

  if (headerRowIndex < 0) {
    return { pairs: [], headerRowIndex: -1, facilityPrefix: '', parseNote: 'No header row with SOP and DP No. columns found.' };
  }

  let facilityPrefix = '';
  for (let r = 0; r < headerRowIndex; r++) {
    const row = rawRows[r] || [];
    const nonEmpty = row.map((c) => cellToString(c)).filter(Boolean);
    if (nonEmpty.length === 0) continue;
    const joined = nonEmpty.join(' ').trim();
    if (/sop|annexure|dp\s*no|sr\.?\s*no|serial/i.test(joined)) continue;
    if (joined.length < 2 || joined.length > 120) continue;
    if (!facilityPrefix) facilityPrefix = joined;
  }

  let currentDp = '';
  const pairs: { sopRaw: string; location: string }[] = [];

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r] || [];
    const dpVal = cellToString(row[dpCol]);
    if (dpVal && !isDpColumnHeader(dpVal)) {
      currentDp = dpVal;
    }

    const sopVal = cellToString(row[sopCol]);
    if (isNaSopCell(sopVal) || !looksLikeSopIdentifier(sopVal)) continue;
    if (!currentDp) continue;

    const location = facilityPrefix ? `${facilityPrefix} / ${currentDp}` : currentDp;
    pairs.push({ sopRaw: sopVal.trim(), location });
  }

  return { pairs, headerRowIndex, facilityPrefix };
}

/** Merge rows for same normalized SOP; multiple DPs → "loc1 | loc2". */
export function aggregateLocationsBySop(
  pairs: { sopRaw: string; location: string }[],
): Map<string, string> {
  const byNorm = new Map<string, string[]>();
  for (const { sopRaw, location } of pairs) {
    const norm = normalizeSopIdentifierKey(sopRaw.toUpperCase());
    if (!norm) continue;
    if (!byNorm.has(norm)) byNorm.set(norm, []);
    byNorm.get(norm)!.push(location);
  }
  const out = new Map<string, string>();
  for (const [norm, locs] of byNorm) {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const L of locs) {
      const k = L.trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      ordered.push(k);
    }
    out.set(norm, ordered.join(' | '));
  }
  return out;
}
