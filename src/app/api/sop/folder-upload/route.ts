import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import connectDB from '@/lib/mongodb';
import SOPVersionArtifacts from '@/models/SOPVersionArtifacts';
import SOP from '@/models/SOP';
import { uploadToBunny } from '@/lib/bunnyStorage';
import {
  normalizeSopIdentifierKey,
  normalizeUnicodeHyphens,
  parseRevisionFromSopIdentifier,
} from '@/lib/sopIdentifierNormalize';
import { getMaxPriorVersionsStored } from '@/lib/sopFolderUploadLimits';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

const debugSopUpload =
  process.env.SOP_UPLOAD_DEBUG_LOGS === '1' || process.env.SOP_UPLOAD_DEBUG_LOGS === 'true';

function sopUploadLog(msg: string, data?: Record<string, unknown>) {
  if (!debugSopUpload) return;
  if (data) console.log(`[sop-folder-upload] ${msg}`, data);
  else console.log(`[sop-folder-upload] ${msg}`);
}

/** Prior revisions: unlimited by default; optional env `SOP_FOLDER_UPLOAD_MAX_PRIOR_VERSIONS` caps newest N. */
const MAX_VERSIONS_PER_SOP = getMaxPriorVersionsStored();

type Acc = Map<number, { docxPath?: string; pdfPath?: string }>;

function isAnnexureLikePath(relativePath: string): boolean {
  const raw = normalizeUnicodeHyphens(String(relativePath || ''));
  if (!raw) return false;
  // Only inspect the file basename, not the parent path — folder segments like
  // "QAGE08 - Vendor Audit" don't carry annexure semantics for the file inside.
  const fileName = raw.split(/[/\\]/).pop() || raw;
  // A main SOP version file's name starts with the SOP code (e.g.
  // `QAGE08-09_VENDOR QUALITY AUDIT.docx`). Even if its descriptive title later
  // contains "annex" or "appendix" the file IS the SOP version and must not be
  // filtered out — otherwise the prior version is silently dropped from the upload.
  // Negative lookahead instead of \b so `_` counts as a separator after the code
  // (e.g. `QAGE74-2_FORMAT, ANNEXURE, …docx` is a main file, not an annexure).
  if (/^[A-Z]{2,6}\d{1,4}-\d{1,3}(?![A-Za-z0-9])/i.test(fileName)) return false;
  // Skip annexure/appendix/support docs; keep only main SOP version DOCX/PDF files.
  return /\b(annexure|annex|appendix)\b/i.test(fileName);
}

function asIntVersion(v: unknown): number {
  const n = typeof v === 'number' && !Number.isNaN(v) ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Merge DB + this batch so chunked uploads don’t drop versions from earlier batches. */
function mergeVersionMaps(
  existing: { version: number; docxPath?: string; pdfPath?: string }[] | undefined,
  batch: Map<number, { docxPath?: string; pdfPath?: string }>,
): { version: number; docxPath?: string; pdfPath?: string }[] {
  const merged = new Map<number, { docxPath?: string; pdfPath?: string }>();
  for (const e of existing || []) {
    const v = asIntVersion(e.version);
    if (v < 0) continue;
    merged.set(v, { docxPath: e.docxPath, pdfPath: e.pdfPath });
  }
  for (const [v0, paths] of batch) {
    const v = asIntVersion(v0);
    if (v < 0) continue;
    const cur = merged.get(v) || {};
    merged.set(v, {
      docxPath: paths.docxPath !== undefined ? paths.docxPath : cur.docxPath,
      pdfPath: paths.pdfPath !== undefined ? paths.pdfPath : cur.pdfPath,
    });
  }
  return Array.from(merged.entries())
    .map(([version, p]) => ({ version, ...p }))
    .filter((e) => e.docxPath || e.pdfPath)
    .sort((a, b) => b.version - a.version); // numeric newest first
}

function mergeAccMaps(a: Acc, b: Acc): Acc {
  const out = new Map<number, { docxPath?: string; pdfPath?: string }>();
  for (const [v, paths] of a) {
    out.set(v, { ...paths });
  }
  for (const [v, paths] of b) {
    if (!out.has(v)) out.set(v, {});
    const slot = out.get(v)!;
    if (paths.docxPath !== undefined) slot.docxPath = paths.docxPath;
    if (paths.pdfPath !== undefined) slot.pdfPath = paths.pdfPath;
  }
  return out;
}

/** Merge QAQC01-010 and QAQC01-10 style keys so one logical SOP has one map entry. */
function collapseIdentifierMap(
  map: Map<string, { department: string; versions: Acc }>,
): Map<string, { department: string; versions: Acc }> {
  const out = new Map<string, { department: string; versions: Acc }>();
  for (const [k, v] of map) {
    const nk = normalizeSopIdentifierKey(k);
    const existing = out.get(nk);
    if (!existing) {
      out.set(nk, { department: v.department, versions: new Map(v.versions) });
    } else {
      existing.department = v.department || existing.department;
      existing.versions = mergeAccMaps(existing.versions, v.versions);
    }
  }
  return out;
}

function entriesArrayToAcc(
  entries: { version: number; docxPath?: string; pdfPath?: string }[] | undefined,
): Acc {
  const m = new Map<number, { docxPath?: string; pdfPath?: string }>();
  for (const e of entries || []) {
    const v = asIntVersion(e.version);
    if (v < 0) continue;
    m.set(v, { docxPath: e.docxPath, pdfPath: e.pdfPath });
  }
  return m;
}

/** One cache entry per logical SOP so QAQC01-10 and QAQC1-10 in Mongo merge correctly. */
async function buildArtifactCacheByNorm(language: string) {
  const allExisting = await SOPVersionArtifacts.find({ language }).lean();
  const map = new Map<
    string,
    {
      _id: unknown;
      entries: { version: number; docxPath?: string; pdfPath?: string }[];
      sopName?: string;
    }
  >();
  for (const d of allExisting as any[]) {
    const nk = normalizeSopIdentifierKey(String(d.identifier || ''));
    const prev = map.get(nk);
    const sn = d.sopName ? String(d.sopName).trim() : undefined;
    if (!prev) {
      map.set(nk, { _id: d._id, entries: [...(d.entries || [])], sopName: sn });
    } else {
      const merged = mergeVersionMaps(prev.entries, entriesArrayToAcc(d.entries));
      const prevN = (prev.entries || []).length;
      const nextN = ((d as any).entries || []).length;
      map.set(nk, {
        _id: nextN > prevN ? d._id : prev._id,
        entries: merged,
        sopName: pickLongerTitle(prev.sopName, sn),
      });
    }
  }
  return map;
}

/**
 * Which folder revision numbers to upload/store vs the registry SOP id (e.g. …-10 → current rev 10).
 * Keeps versions **≤ currentRev** (includes the current-revision folder, e.g. V10/ under …-10).
 * Drops only versions **strictly newer** than the id (draft folders above the approved revision).
 * Revision `0` on the canonical id → no cutoff (same as unknown current).
 */
function topPriorVersionNumbersAllowed(
  existing: { version: number; docxPath?: string; pdfPath?: string }[] | undefined,
  batchVersions: Acc,
  max: number,
  currentRev: number | null,
): Set<number> {
  const cutoff = currentRev != null && currentRev > 0 ? currentRev : null;
  const nums = new Set<number>();
  const consider = (v0: unknown) => {
    const v = asIntVersion(v0);
    if (v < 0) return;
    if (cutoff != null && v > cutoff) return;
    nums.add(v);
  };
  for (const e of existing || []) consider(e.version);
  for (const v0 of batchVersions.keys()) consider(v0);
  const sorted = [...nums].sort((a, b) => b - a);
  if (!Number.isFinite(max) || max <= 0) return new Set(sorted);
  return new Set(sorted.slice(0, max));
}

/**
 * Prefer …/QAGE01-10/V10/file over a deeper …/QAGE01-01/… hit from code–version parsing
 * (numeric V10 > V9 > V8, not string order).
 */
function tryParseExplicitVersionFolder(
  parts: string[],
  department: string,
  ext: 'docx' | 'pdf',
  relativePath: string,
): Parsed | null {
  for (let vi = parts.length - 2; vi >= 1; vi--) {
    const versionNum = parseVersionFolderName(parts[vi]);
    if (versionNum === null) continue;
    const vNum = asIntVersion(versionNum);
    if (vNum < 0) continue;
    const sopFolder = parts[vi - 1];
    let identifier = extractIdentifier(sopFolder);
    if (!identifier) {
      const cv = parseSopCodeVersionFromSegment(sopFolder);
      if (cv) identifier = `${cv.base}-${padVersionSuffix(cv.version)}`;
    }
    if (!identifier) {
      const docOnly = parseSopDocNumberPrefix(sopFolder);
      if (docOnly) identifier = docOnly;
    }
    if (!identifier) continue;
    return {
      identifier,
      department,
      version: vNum,
      ext,
      relativePath,
      sopTitle: extractSopTitleFromFolderName(sopFolder),
    };
  }
  return null;
}

/** One _id per normalized SOP for updates (handles QAGE01-10 vs QAGE1-10 duplicates). */
async function buildPrimaryArtifactIdByNorm(language: string): Promise<Map<string, unknown>> {
  const all = await SOPVersionArtifacts.find({ language }).select('_id identifier entries updatedAt').lean();
  const best = new Map<string, { _id: unknown; n: number; t: number }>();
  for (const d of all as any[]) {
    const nk = normalizeSopIdentifierKey(String(d.identifier || ''));
    const n = (d.entries || []).length;
    const t = new Date(d.updatedAt || 0).getTime();
    const prev = best.get(nk);
    if (!prev || n > prev.n || (n === prev.n && t > prev.t)) {
      best.set(nk, { _id: d._id, n, t });
    }
  }
  return new Map([...best.entries()].map(([k, v]) => [k, v._id]));
}

/**
 * Fallback parser: when parseRelativePath fails, try to extract identifier from file name.
 * Supports files like MAGE01-06.pdf, MAGE01-07.docx, or any DOCX/PDF with optional version in stem.
 * Falls back to using sanitized filename as identifier with version=1.
 */
function fallbackParseRelativePath(relativePath: string): Parsed | null {
  const relNorm = normalizeUnicodeHyphens(relativePath);
  const parts = relNorm.split(/[/\\]/).filter(Boolean);
  if (parts.length === 0) return null;

  const fileName = parts[parts.length - 1];
  const ext = fileName.toLowerCase().endsWith('.pdf')
    ? 'pdf'
    : fileName.toLowerCase().endsWith('.docx') || fileName.toLowerCase().endsWith('.doc')
      ? 'docx'
      : null;
  if (!ext) return null;

  const stem = fileName.replace(/\.(docx|doc|pdf)$/i, '');
  // Hint for department detection: pull the SOP code prefix from the stem so a flat
  // layout like `Gujarati SOP/QAGE85/…docx` still resolves to the right department.
  const codeHint =
    parseSopCodeVersionPrefix(stem)?.base || parseSopDocNumberPrefix(stem) || null;
  const department = detectDepartmentFromPathParts(parts, codeHint ?? undefined);

  // Try code-version prefix from stem (e.g. MAGE01-07, PRED02-3_…).
  // Use versionGroupBase (NOT a hardcoded identifier) so `resolveCanonicalIdentifier`
  // can upgrade the base to the registry's current revision. Otherwise a single
  // file uploaded via "Select files" stores under the OLD revision id (e.g.
  // PRED02-03) and the dashboard, which looks up artifacts under the current
  // revision (PRED02-05), never sees the upload.
  const fromStem = parseSopCodeVersionPrefix(stem);
  if (fromStem) {
    return {
      department,
      version: fromStem.version,
      ext,
      relativePath,
      versionGroupPath: (parts[parts.length - 1] || stem).toLowerCase(),
      versionGroupBase: fromStem.base,
    };
  }

  // Try extracting full identifier from stem (e.g. MAGE01-07 with spaces)
  const idFromStem = extractIdentifier(stem);
  if (idFromStem) {
    const split = splitCodeVersionIdentifier(idFromStem);
    return {
      identifier: idFromStem,
      department,
      version: split ? split.version : 1,
      ext,
      relativePath,
    };
  }

  // Last resort: use stem as-is, version 1
  const sanitized = stem.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!sanitized) return null;
  return {
    identifier: sanitized.toUpperCase(),
    department,
    version: 1,
    ext,
    relativePath,
  };
}

/** Next.js / proxies: allow long runs for big folder jobs (e.g. Vercel). */
export const maxDuration = 300;

const APPROVED_DEPARTMENTS = [
  'QA',
  'QC',
  'MICROBIOLOGY',
  'PRODUCTION',
  'STORE',
  'ENGINEERING AND MAINTENANCE',
  'PERSONNEL',
];

function useBunny() {
  return Boolean(
    (process.env.BUNNY_STORAGE_ZONE || process.env.BUNNY_STORAGE_ZONE_NAME) &&
    (process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY) &&
    (process.env.BUNNY_PULL_ZONE_URL || process.env.BUNNY_CDN_HOSTNAME),
  );
}

function detectDepartment(firstFolder: string): string {
  const u = firstFolder.toUpperCase();
  for (const dept of APPROVED_DEPARTMENTS) {
    if (u.includes(dept)) return dept === 'ENGINEERING AND MAINTENANCE' ? 'Engineering and Maintenance' : dept;
  }
  return 'General';
}

/**
 * Map an SOP code prefix to its department. Keeps folder uploads working when the
 * user's path doesn't include a department keyword (e.g. `Gujarati SOP/QAGE85/…`).
 * Mirrors the conventions in `KNOWN_SOP_FAMILY_PREFIXES`.
 */
function departmentFromSopCodePrefix(code: string): string | null {
  const m = String(code || '').toUpperCase().match(/^([A-Z]{2,6})\d/);
  if (!m) return null;
  const p = m[1];
  if (p.startsWith('QAGE') || p === 'QAGX' || p === 'QAG' || p === 'QADE') return 'QA';
  if (p === 'QAIO' || p === 'QAWO' || p === 'QASY' || p.startsWith('QAP') || p.startsWith('QAM')) return 'QA';
  if (p === 'QC' || p.startsWith('QCGE') || p.startsWith('QCM') || p.startsWith('QCRM') ||
      p.startsWith('QCPM') || p.startsWith('QCBL') || p.startsWith('QCCH') ||
      p.startsWith('QCRE') || p.startsWith('QCRG') || p.startsWith('QCTR') || p.startsWith('QCIO')) return 'QC';
  if (p.startsWith('QCMI') || p.startsWith('QMPI') || p.startsWith('QMBI') || p.startsWith('QAMI')) return 'MICROBIOLOGY';
  if (p.startsWith('PR') || p === 'PROD' || p === 'PREP' || p === 'PREG' || p === 'PRGE' ||
      p === 'PRMA' || p === 'PRPA' || p === 'PRCL' || p === 'PRED' || p === 'PREO' ||
      p === 'PRAA' || p === 'MAGE') return 'PRODUCTION';
  if (p.startsWith('ST') || p === 'STORE' || p.startsWith('BSGE') || p === 'WH') return 'STORE';
  if (p.startsWith('PEGE') || p === 'HR' || p === 'PERS') return 'PERSONNEL';
  if (p === 'EM' || p === 'PM' || p === 'UT' || p === 'MT' || p === 'AT') return 'Engineering and Maintenance';
  return null;
}

/**
 * First path segments often include a company root (e.g. SOPs/QA/…); scan a few
 * levels for QA/QC/Store. Falls back to the SOP code prefix mapping so flat
 * layouts like `Gujarati SOP/QAGE85/file.docx` still pick up the right department.
 */
function detectDepartmentFromPathParts(parts: string[], sopCodeHint?: string): string {
  const limit = Math.min(parts.length, 5);
  for (let i = 0; i < limit; i++) {
    const d = detectDepartment(parts[i] || '');
    if (d !== 'General') return d;
  }
  if (sopCodeHint) {
    const fromCode = departmentFromSopCodePrefix(sopCodeHint);
    if (fromCode) return fromCode;
  }
  return 'General';
}

/** QAGE01-10 / QAGE99-2 from folder or file name (allows spaces around hyphen) */
function extractIdentifier(segment: string): string | null {
  const seg = normalizeUnicodeHyphens(segment);
  const m = seg.match(/([A-Z]{2,6}[\s_-]?\d{1,4}\s*-\s*\d{1,3})/i);
  if (!m) return null;
  return normalizeUnicodeHyphens(m[1]).toUpperCase().replace(/\s+/g, '');
}

/** Text after the SOP code in a folder like `QAGE01-10 – Title` or `QAGE01-10 - Title`. */
function extractSopTitleFromFolderName(segment: string): string | undefined {
  const id = extractIdentifier(segment);
  if (!id) return undefined;
  const upper = segment.toUpperCase();
  const idx = upper.indexOf(id);
  if (idx < 0) return undefined;
  let rest = segment.slice(idx + id.length).trim();
  rest = rest.replace(/^[-–—\s:_]+/, '').trim();
  return rest.length >= 2 ? rest : undefined;
}

function pickLongerTitle(a?: string, b?: string): string | undefined {
  const ta = (a || '').trim();
  const tb = (b || '').trim();
  if (!ta.length) return tb || undefined;
  if (!tb.length) return ta;
  return ta.length >= tb.length ? ta : tb;
}

function parseVersionFolderName(name: string): number | null {
  const n = normalizeUnicodeHyphens(name.trim());
  let m = n.match(/^v\.?\s*(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  m = n.match(/^version[-\s._]?(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  m = n.match(/^(?:ver|version)\s*[-._]?\s*(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  m = n.match(/^rev\.?\s*(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  m = n.match(/^r[-\s]?(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  m = n.match(/^(\d+)$/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/**
 * Folders like QAGE01-08, QAGE01-09, QAGE01-10 → base QAGE01 + document version 8 / 9 / 10 (shown as V8, V9, V10).
 */
function parseSopCodeVersionFolder(name: string): { base: string; version: number } | null {
  const n = normalizeUnicodeHyphens(name.trim());
  const m = n.match(/^([A-Z]{2,6}\d{1,4})-(\d{1,4})$/i);
  if (!m) return null;
  return { base: m[1].toUpperCase(), version: parseInt(m[2], 10) };
}

/**
 * Same code–version as strict folder names, but allows a descriptive suffix:
 * QAGE91-03 - Procedure for….docx, QAGE01-08 Annex, etc.
 */
function parseSopCodeVersionPrefix(name: string): { base: string; version: number } | null {
  const n = normalizeUnicodeHyphens(name.trim());
  // After the version digits, accept any non-digit separator (underscore, space, hyphen,
  // dot, Unicode/Gujarati text, end-of-string). Using `\b` was wrong because `_` is a
  // word character — files named `QAGE85-05_<gujarati title>.docx` failed to match
  // and fell through to a v=1 fallback, breaking Gujarati version uploads.
  const m = n.match(/^([A-Z]{2,6}\d{1,4})-(\d{1,4})(?=[^\d]|$)/i);
  if (!m) return null;
  return { base: m[1].toUpperCase(), version: parseInt(m[2], 10) };
}

function parseSopCodeVersionFromSegment(name: string): { base: string; version: number } | null {
  return parseSopCodeVersionFolder(name) || parseSopCodeVersionPrefix(name);
}

/** Full identifier like QAGE91-03 → base + version (for DB grouping). */
function splitCodeVersionIdentifier(id: string): { base: string; version: number } | null {
  const m = normalizeUnicodeHyphens(id.trim()).match(/^([A-Z]{2,6}\d{1,4})-(\d{1,4})$/i);
  if (!m) return null;
  return { base: m[1].toUpperCase(), version: parseInt(m[2], 10) };
}

/**
 * Letter prefix before digits (QAGE from QAGE136). Restricted list avoids matching
 * arbitrary words like "Stage123 - Title".
 */
const KNOWN_SOP_FAMILY_PREFIXES = new Set([
  'QAGE',
  'PREG',
  'MAGE',
  'QC',
  'QA',
  'STORE',
  'REG',
  'QADE',
  'QCP',
  'QMS',
  'QRM',
  'QAP',
  'QPP',
  'QRP',
  'QEP',
  'QAGX',
  'QAG',
  'WH',
  'PM',
  'EM',
  'ST',
  'IT',
  'HR',
  'AD',
  'PR',
  'IN',
  'EX',
  'LAB',
  'MT',
  'UT',
  'AT',
  'DOC',
  'ANN',
  'PL',
  'AP',
  'FP',
  'BP',
  'CP',
  'DP',
  'EP',
  'GP',
  'HP',
  'JP',
  'KP',
  'LP',
  'MP',
  'NP',
  'OP',
  'RP',
  'SP',
  'TP',
  'UP',
  'VP',
  'WP',
  'XP',
  'YP',
  'ZP',
  'RAG',
  'PAG',
  'SOP',
  'WPS',
  'URS',
  'CAP',
  /** QC lab instrument / general SOP numbering (folder e.g. QCGE04 - Title, QAIO42 - …) */
  'QCGE',
  'QAIO',
  'QCIO',
  'QAWO',
  'QASY',
  'QCM',
  'QCRM',
  'QCPM',
  'QCBL',
  'QCCH',
  'QCRE',
  'QCRG',
  'QCTR',
  /** Microbiology instrument / method SOPs (e.g. QCMI06 - Title / Annexure.docx) */
  'QCMI',
  'QMPI',
  'QMBI',
  /** Production doc numbers (folder e.g. PRPA11 - Title / Prepared for Audit / Annexure-I.docx) */
  'PRAA',
  'PRCL',
  'PRED',
  'PREO',
  'PREP',
  'PRGE',
  'PRMA',
  'PRPA',
  'PREG',
  'PROD',
]);

/**
 * Doc number only (no hyphen version): QAGE136 - Temporary Change Control Procedure/
 * Annexure-I….docx → QAGE136. Requires known family prefix + optional " - Title" tail.
 */
function parseSopDocNumberPrefix(name: string): string | null {
  const n = normalizeUnicodeHyphens(name.trim());
  const m = n.match(/^([A-Z]{2,6}\d{1,4})\b/i);
  if (!m) return null;
  const full = m[0];
  const letters = full.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() ?? '';
  if (!KNOWN_SOP_FAMILY_PREFIXES.has(letters)) return null;
  const rest = n.slice(full.length).trim();
  if (rest.length === 0) return full.toUpperCase();
  if (/^\s*[-–]/.test(rest)) return full.toUpperCase();
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One registry row per logical SOP: use highest numeric suffix across THREE sources —
 *  1. revisions in this batch (e.g. user uploaded V3, V4 → maxBatch = 4)
 *  2. existing SOPVersionArtifacts rows for this base
 *  3. the SOP registry itself — the registry's revision IS the current SOP version (e.g. BSGE01-05 → 5).
 *
 * Sources 1+2 alone would let an upload of V3+V4 store under "BSGE01-04" even when the
 * registry already lists the SOP at revision 5 — the dashboard then can't match the
 * artifacts to the registry row and shows the priors as missing.
 *
 * Bases like "BSGE01" and "BSGE1" must be treated as the same family — the registry
 * commonly stores zero-padded identifiers ("BSGE01-05") while folder parsers emit the
 * unpadded base ("BSGE1"). We match both forms when querying the SOP collection.
 */
async function resolveCanonicalIdentifier(
  base: string,
  versionNumsInBatch: number[],
  language: string,
): Promise<string> {
  const maxBatch = versionNumsInBatch.length ? Math.max(...versionNumsInBatch) : 0;
  const b = base.toUpperCase();

  // Build a regex that matches both "BSGE01-NN" and "BSGE1-NN" forms by allowing
  // any leading zeros on the numeric portion of the base.
  const baseLetters = b.match(/^([A-Z]+)/)?.[1] ?? b;
  const baseDigits = b.slice(baseLetters.length);
  const baseDigitsInt = parseInt(baseDigits, 10);
  const baseRx = Number.isFinite(baseDigitsInt)
    ? new RegExp(`^${escapeRegex(baseLetters)}0*${baseDigitsInt}-\\d+$`, 'i')
    : new RegExp(`^${escapeRegex(b)}-\\d+$`, 'i');

  let maxS = maxBatch;

  const docs = await SOPVersionArtifacts.find({ language, identifier: { $regex: baseRx } })
    .select('identifier')
    .lean();
  for (const d of docs) {
    const id = String((d as { identifier?: string }).identifier || '');
    const mm = id.match(/-(\d+)$/i);
    if (mm) maxS = Math.max(maxS, parseInt(mm[1], 10));
  }

  // Also consult the SOP registry — the registry's revision is the "current" version
  // and should drive the canonical key so uploaded priors attach to that row.
  const registryRows = await SOP.find({ identifier: { $regex: baseRx } })
    .select('identifier')
    .lean();
  for (const r of registryRows) {
    const id = String((r as { identifier?: string }).identifier || '');
    const mm = id.match(/-(\d+)$/i);
    if (mm) maxS = Math.max(maxS, parseInt(mm[1], 10));
  }

  const w = Math.max(2, String(maxS).length, ...versionNumsInBatch.map((n) => String(n).length));
  return `${b}-${String(maxS).padStart(w, '0')}`;
}

function normalizeDeptFolder(dept: string): string {
  return dept.replace(/[^a-zA-Z0-9-_]/g, '_');
}

/** Storage folder segment: 8 → 08, 10 → 10, 100 → 100 */
function padVersionSuffix(v: number): string {
  const w = Math.max(2, String(v).length);
  return String(v).padStart(w, '0');
}

interface Parsed {
  /** Set when path uses explicit V8 / 8 folders under a titled SOP folder */
  identifier?: string;
  department: string;
  version: number;
  ext: 'docx' | 'pdf';
  relativePath: string;
  /** Human title from folder name after the SOP code (e.g. `QAGE01-10 – Title`) */
  sopTitle?: string;
  /** QAGE01-08 / QAGE01-09 / QAGE01-10 siblings → same canonical SOP row */
  versionGroupPath?: string;
  versionGroupBase?: string;
}

/**
 * Accepts:
 * - …/QAGE01-08/file.pdf (folder name = code + version suffix → V8, V9, V10 style)
 * - …/SOPFolder/V8/file.ext (or 8, v8, Version 8, Rev 3, …)
 * - …/SOPFolder/V8/Annex/file.ext
 * - …/…/QAGE99-2/Annexure.docx when parent matches code-version pattern (else flat code folder → v1)
 * - …/QAGE136 - Title/Annexure-I….docx (doc number in folder only; annex inherits QAGE136)
 * - …/QCGE04 - Title/Annexure-I.docx, …/QAIO42 - …/Reference/file.pdf (QCGE/QAIO doc numbers in folder)
 * - …/QCMI06 - Title/Annexure….docx (Microbiology QCMI* doc numbers)
 * - …/PRPA11 - Title/Prepared for Audit/Annexure-I.docx (Production PR* doc numbers in folder)
 * - QCGE04 - Title/Annexure.docx (two segments: folder + file)
 */
function parseRelativePath(relativePath: string): Parsed | null {
  const relativeNorm = normalizeUnicodeHyphens(relativePath);
  const parts = relativeNorm.split(/[/\\]/).filter(Boolean);
  if (parts.length < 2) return null;

  const fileName = parts[parts.length - 1];
  if (fileName.startsWith('~$')) return null;

  const ext = fileName.toLowerCase().endsWith('.pdf')
    ? 'pdf'
    : fileName.toLowerCase().endsWith('.docx') || fileName.toLowerCase().endsWith('.doc')
      ? 'docx'
      : null;
  if (!ext) return null;

  // Hint for department detection: pull SOP code from filename so flat layouts like
  // `Gujarati SOP/QAGE85/QAGE85-05_…docx` route to the right department instead of "General".
  const stemForHint = fileName.replace(/\.(docx|doc|pdf)$/i, '');
  const codeHint =
    parseSopCodeVersionPrefix(stemForHint)?.base ||
    parseSopDocNumberPrefix(stemForHint) ||
    null;
  const department = detectDepartmentFromPathParts(parts, codeHint ?? undefined);

  /** Dept/Code.pdf — version from file stem when no nested folders */
  if (parts.length === 2) {
    const folderSeg = parts[0];
    // Code-version folders like `PRAA05-3` MUST be parsed as base=PRAA05 + rev=3
    // BEFORE the doc-number-only fallback. Otherwise `parseSopDocNumberPrefix`
    // strips the `-3` and stores everything as `PRAA05` v1 — the canonical lookup
    // never matches the registry's `PRAA05-05` row and uploads appear to do nothing.
    const folderCodeVer = parseSopCodeVersionFromSegment(folderSeg);
    if (folderCodeVer) {
      return {
        department,
        version: folderCodeVer.version,
        ext,
        relativePath,
        versionGroupPath: parts[0].toLowerCase(),
        versionGroupBase: folderCodeVer.base,
        sopTitle: extractSopTitleFromFolderName(folderSeg),
      };
    }
    const folderDocId = parseSopDocNumberPrefix(folderSeg);
    if (folderDocId) {
      return {
        identifier: folderDocId,
        department,
        version: 1,
        ext,
        relativePath,
        sopTitle: extractSopTitleFromFolderName(folderSeg),
      };
    }

    const stem = fileName.replace(/\.(docx|doc|pdf)$/i, '');
    const fromStem = parseSopCodeVersionPrefix(stem);
    if (fromStem) {
      return {
        department,
        version: fromStem.version,
        ext,
        relativePath,
        versionGroupPath: parts[0].toLowerCase(),
        versionGroupBase: fromStem.base,
        sopTitle: extractSopTitleFromFolderName(parts[0]),
      };
    }
    const flatStemId = extractIdentifier(stem);
    if (flatStemId) {
      const split = splitCodeVersionIdentifier(flatStemId);
      if (split) {
        return {
          department,
          version: split.version,
          ext,
          relativePath,
          versionGroupPath: parts[0].toLowerCase(),
          versionGroupBase: split.base,
        };
      }
    }
    return null;
  }

  if (parts.length < 3) return null;

  /** V8 / V10 / 8 / Version 2 folders win over deeper CODE-01 style segments (fixes wrong V1–V3). */
  const fromExplicitV = tryParseExplicitVersionFolder(parts, department, ext, relativePath);
  if (fromExplicitV) return fromExplicitV;

  /** Walk up from file: code–version folders (QAGE01-08), then …/SopFolder/V#/… */
  for (let vi = parts.length - 2; vi >= 1; vi--) {
    const seg = parts[vi];
    const segL = seg.trim().toLowerCase();
    if (segL === 'reference' || segL === 'references' || segL === 'attachments') continue;
    const codeVer = parseSopCodeVersionFromSegment(seg);
    if (codeVer) {
      const groupPath = parts.slice(0, vi).join('/').toLowerCase();
      const parentSeg = vi >= 2 ? parts[vi - 1] : '';
      return {
        department,
        version: codeVer.version,
        ext,
        relativePath,
        versionGroupPath: groupPath,
        versionGroupBase: codeVer.base,
        sopTitle: parentSeg ? extractSopTitleFromFolderName(parentSeg) : undefined,
      };
    }

    const versionNum = parseVersionFolderName(seg);
    if (versionNum === null) continue;
    const sopFolder = parts[vi - 1];
    let identifier = extractIdentifier(sopFolder);
    if (!identifier) {
      const cv = parseSopCodeVersionFromSegment(sopFolder);
      if (cv) identifier = `${cv.base}-${padVersionSuffix(cv.version)}`;
    }
    if (!identifier) {
      const docOnly = parseSopDocNumberPrefix(sopFolder);
      if (docOnly) identifier = docOnly;
    }
    if (!identifier) continue;
    return {
      identifier,
      department,
      version: versionNum,
      ext,
      relativePath,
      sopTitle: extractSopTitleFromFolderName(sopFolder),
    };
  }

  /** Code–version at start of file name (e.g. …/QAGE91 - Procedure/QAGE91-03 - Title.docx) */
  const stem = fileName.replace(/\.(docx|doc|pdf)$/i, '');
  const fromFileName = parseSopCodeVersionPrefix(stem);
  if (fromFileName) {
    const groupPath = parts.slice(0, -1).join('/').toLowerCase();
    const parentDir = parts.length >= 2 ? parts[parts.length - 2] : '';
    return {
      department,
      version: fromFileName.version,
      ext,
      relativePath,
      versionGroupPath: groupPath,
      versionGroupBase: fromFileName.base,
      sopTitle: parentDir ? extractSopTitleFromFolderName(parentDir) : undefined,
    };
  }

  /**
   * Inherit SOP code from an ancestor folder when the file name has no code
   * (e.g. …/QAGE01-10 – Title/Annex….docx → use revision 10 from the folder code, not V1).
   */
  for (let vi = parts.length - 2; vi >= 1; vi--) {
    const seg = parts[vi];
    const segLower = seg.trim().toLowerCase();
    if (segLower === 'reference' || segLower === 'references' || segLower === 'attachments') {
      continue;
    }
    if (parseSopCodeVersionFromSegment(seg)) continue;
    const idFromSeg = extractIdentifier(seg);
    if (idFromSeg) {
      const spl = splitCodeVersionIdentifier(idFromSeg);
      if (spl) {
        return {
          identifier: idFromSeg,
          department,
          version: asIntVersion(spl.version),
          ext,
          relativePath,
          sopTitle: extractSopTitleFromFolderName(seg),
        };
      }
    }
    const docOnly = parseSopDocNumberPrefix(seg);
    if (docOnly) {
      return {
        identifier: docOnly,
        department,
        version: 1,
        ext,
        relativePath,
        sopTitle: extractSopTitleFromFolderName(seg),
      };
    }
  }

  /** Flat layout: parent is a single code folder (not CODE-NN pattern handled above) */
  const parent = parts[parts.length - 2];
  if (parseSopCodeVersionFromSegment(parent)) return null;
  const flatId = extractIdentifier(parent) || extractIdentifier(stem);
  if (flatId) {
    const split = splitCodeVersionIdentifier(flatId);
    if (split) {
      const groupPath = parts.slice(0, -1).join('/').toLowerCase();
      return {
        department,
        version: split.version,
        ext,
        relativePath,
        versionGroupPath: groupPath,
        versionGroupBase: split.base,
        sopTitle: extractSopTitleFromFolderName(parent),
      };
    }
    const flatSplit = splitCodeVersionIdentifier(flatId);
    return {
      identifier: flatId,
      department,
      version: flatSplit ? asIntVersion(flatSplit.version) : 1,
      ext,
      relativePath,
      sopTitle: extractSopTitleFromFolderName(parent),
    };
  }

  return null;
}

function accumulateParsedIntoMaps(
  parsed: Parsed,
  byIdentifier: Map<string, { department: string; versions: Acc }>,
  byGroup: Map<string, { department: string; base: string; groupPath: string; versions: Acc }>,
): void {
  const v = asIntVersion(parsed.version);
  if (v < 0) return;
  if (parsed.versionGroupPath != null && parsed.versionGroupBase) {
    const gkey = `${parsed.versionGroupPath}|||${parsed.versionGroupBase}`;
    if (!byGroup.has(gkey)) {
      byGroup.set(gkey, {
        department: parsed.department,
        base: parsed.versionGroupBase,
        groupPath: parsed.versionGroupPath,
        versions: new Map(),
      });
    }
    const acc = byGroup.get(gkey)!.versions;
    if (!acc.has(v)) acc.set(v, {});
  } else if (parsed.identifier) {
    if (!byIdentifier.has(parsed.identifier)) {
      byIdentifier.set(parsed.identifier, { department: parsed.department, versions: new Map() });
    }
    const rec = byIdentifier.get(parsed.identifier)!;
    rec.department = parsed.department;
    if (!rec.versions.has(v)) rec.versions.set(v, {});
  }
}

function canonicalIdentifierFor(parsed: Parsed, canonicalByBase: Map<string, string>): string | null {
  if (parsed.versionGroupBase != null) {
    return canonicalByBase.get(parsed.versionGroupBase.toUpperCase()) ?? null;
  }
  return parsed.identifier ?? null;
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const len = request.headers.get('content-length');
    if (len && parseInt(len, 10) > 10 * 1024 * 1024) {
      console.warn(`[sop-folder-upload] Large request detected: ${Math.round(parseInt(len, 10) / (1024 * 1024))} MB`);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (parseErr) {
      console.error('Failed to parse multipart/form-data:', parseErr);
      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to parse body as FormData. This often happens if the batch size is too large or the request timed out. (Content-Length: ${len || 'unknown'})` 
        },
        { status: 400 }
      );
    }

    const language = (formData.get('language') as string) === 'Gujarati' ? 'Gujarati' : 'English';
    const wantDebug =
      formData.get('debug') === '1' || formData.get('debug') === 'true' || debugSopUpload;
    if (!useBunny()) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Bunny Storage is not configured. Set BUNNY_STORAGE_ZONE (or BUNNY_STORAGE_ZONE_NAME), BUNNY_STORAGE_PASSWORD (or BUNNY_API_KEY), and BUNNY_PULL_ZONE_URL (or BUNNY_CDN_HOSTNAME).',
        },
        { status: 503 },
      );
    }

    let byIdentifier = new Map<string, { department: string; versions: Acc }>();
    const byGroup = new Map<
      string,
      { department: string; base: string; groupPath: string; versions: Acc }
    >();
    const errors: { path: string; error: string }[] = [];
    const items: { relativePath: string; parsed: Parsed; buffer: Buffer }[] = [];
    let skippedAnnexureFiles = 0;
    let versionTrace:
      | Array<{
          identifier: string;
          versionsInUpload: number[];
          versionsInDbBeforeUpload: number[];
          allowedTop3: number[];
        }>
      | undefined;

    for (const [key, value] of formData.entries()) {
      if (!(value instanceof File) || value.size === 0) continue;
      const m = key.match(/^files\[(.*)\]$/);
      if (!m) continue;
      const relativePath = m[1];
      if (isAnnexureLikePath(relativePath)) {
        skippedAnnexureFiles++;
        continue;
      }
      let parsed = parseRelativePath(relativePath);
      if (!parsed) {
        // Fallback: try to extract identifier from file name stem
        parsed = fallbackParseRelativePath(relativePath);
        if (!parsed) {
          errors.push({
            path: relativePath,
            error:
              'Could not determine SOP identifier from file name. Use e.g. MAGE01-06.pdf, MAGE01-07.docx, or any DOCX/PDF in a folder with an SOP code.',
          });
          continue;
        }
      }

      const buffer = Buffer.from(await value.arrayBuffer());
      items.push({ relativePath, parsed, buffer });
      accumulateParsedIntoMaps(parsed, byIdentifier, byGroup);
    }

    /** Merge all folder groups with the same letter+digit base (QAGE01) before choosing canonical suffix. */
    const mergedByBase = new Map<string, { department: string; versions: Acc }>();
    for (const [, grec] of byGroup) {
      const b = grec.base.toUpperCase();
      if (!mergedByBase.has(b)) {
        mergedByBase.set(b, { department: grec.department, versions: new Map() });
      }
      const agg = mergedByBase.get(b)!;
      agg.department = grec.department;
      for (const [v, paths] of grec.versions) {
        if (!agg.versions.has(v)) agg.versions.set(v, {});
        const slot = agg.versions.get(v)!;
        if (paths.docxPath !== undefined) slot.docxPath = paths.docxPath;
        if (paths.pdfPath !== undefined) slot.pdfPath = paths.pdfPath;
      }
    }

    const canonicalByBase = new Map<string, string>();
    for (const [base, agg] of mergedByBase) {
      const versionNums = [...agg.versions.keys()];
      const canonical = normalizeSopIdentifierKey(
        await resolveCanonicalIdentifier(base, versionNums, language),
      );
      canonicalByBase.set(base, canonical);

      if (!byIdentifier.has(canonical)) {
        byIdentifier.set(canonical, { department: agg.department, versions: new Map() });
      }
      const dest = byIdentifier.get(canonical)!;
      dest.department = agg.department;
      for (const [v, paths] of agg.versions) {
        if (!dest.versions.has(v)) dest.versions.set(v, {});
        const slot = dest.versions.get(v)!;
        if (paths.docxPath !== undefined) slot.docxPath = paths.docxPath;
        if (paths.pdfPath !== undefined) slot.pdfPath = paths.pdfPath;
      }
    }

    /** One key per logical SOP (matches dashboard lookup + Mongo unique index). */
    byIdentifier = collapseIdentifierMap(byIdentifier);

    /** Best folder-derived title per normalized SOP id (longest wins). */
    const sopNameByNorm = new Map<string, string>();
    for (const { parsed } of items) {
      const cid = canonicalIdentifierFor(parsed, canonicalByBase);
      if (!cid || !parsed.sopTitle?.trim()) continue;
      const nk = normalizeSopIdentifierKey(cid);
      const t = parsed.sopTitle.trim();
      const prev = sopNameByNorm.get(nk);
      if (!prev || t.length > prev.length) sopNameByNorm.set(nk, t);
    }

    /**
     * Remove obsolete artifact *documents* for this letter+digit base whose normalized id ≠ canonical
     * (e.g. keep QAGE1-10, drop QAGE01-08 / QAGE01-09 rows). Using $nin: [canonical] alone was WRONG:
     * Mongo stores QAGE01-10 but canonical is QAGE1-10 → the main row was deleted every upload.
     */
    let artifactByNorm = await buildArtifactCacheByNorm(language);

    for (const [base, canonical] of canonicalByBase) {
      const rx = new RegExp(`^${escapeRegex(base)}-\\d+$`, 'i');
      const candidates = await SOPVersionArtifacts.find({ language, identifier: { $regex: rx } })
        .select('_id identifier')
        .lean();
      const staleIds = candidates
        .filter((d: any) => normalizeSopIdentifierKey(String(d.identifier || '')) !== canonical)
        .map((d: any) => d._id);
      if (staleIds.length > 0) {
        await SOPVersionArtifacts.deleteMany({ _id: { $in: staleIds } });
        sopUploadLog('removed stale artifact docs for base', {
          base,
          canonical,
          count: staleIds.length,
        });
      }
    }

    artifactByNorm = await buildArtifactCacheByNorm(language);

    const primaryIdByNorm = await buildPrimaryArtifactIdByNorm(language);

    /** Which prior revision numbers to upload + store (capped by MAX_VERSIONS_PER_SOP, merged with DB). */
    const allowedByIdentifier = new Map<string, Set<number>>();
    for (const [identifier, { versions: batchVersions }] of byIdentifier) {
      const nk = normalizeSopIdentifierKey(identifier);
      const existingEntries = artifactByNorm.get(nk)?.entries;
      const currentRev = parseRevisionFromSopIdentifier(nk);
      allowedByIdentifier.set(
        nk,
        topPriorVersionNumbersAllowed(existingEntries, batchVersions, MAX_VERSIONS_PER_SOP, currentRev),
      );
    }

    if (wantDebug) {
      versionTrace = [...byIdentifier.entries()].map(([identifier, { versions: bv }]) => {
        const nk = normalizeSopIdentifierKey(identifier);
        const allowed = allowedByIdentifier.get(nk);
        const existing = artifactByNorm.get(nk)?.entries || [];
        return {
          identifier: nk,
          versionsInUpload: [...bv.keys()].sort((a, b) => b - a),
          versionsInDbBeforeUpload: existing.map((e) => e.version).sort((a, b) => b - a),
          allowedTop3: allowed ? [...allowed].sort((a, b) => b - a) : [],
        };
      });
      sopUploadLog('version trace (upload vs DB vs allowed cap)', {
        sopCount: versionTrace.length,
        sample: versionTrace.slice(0, 20),
      });
    }

    const filteredByIdentifier = new Map<string, { department: string; versions: Acc }>();
    let processed = 0;
    let skippedOlderVersions = 0;
    const uploadConcurrency = (() => {
      const raw = String(process.env.SOP_FOLDER_UPLOAD_FILE_CONCURRENCY || '').trim();
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n >= 1 ? Math.min(6, n) : 3;
    })();

    const perFileResults = await (async () => {
      const out: Array<
        | { ok: true; cidNorm: string; department: string; version: number; ext: 'docx' | 'pdf'; storedPath: string }
        | { ok: false; skipOlder?: boolean; error?: { path: string; error: string } }
      > = [];
      let next = 0;
      const runOne = async (it: (typeof items)[number]) => {
        const { relativePath, parsed, buffer } = it;
        const cid = canonicalIdentifierFor(parsed, canonicalByBase);
        if (!cid) {
          return {
            ok: false as const,
            error: { path: relativePath, error: 'Internal parse state: missing identifier / group.' },
          };
        }
        const cidNorm = normalizeSopIdentifierKey(cid);
        const allowed = allowedByIdentifier.get(cidNorm);
        const pv = asIntVersion(parsed.version);
        if (pv < 0 || !allowed?.has(pv)) {
          return { ok: false as const, skipOlder: true };
        }
        const safeName = path.basename(relativePath).replace(/[^a-zA-Z0-9.-]/g, '_');
        const deptSeg = normalizeDeptFolder(parsed.department);
        const idSeg = parsed.identifier ? normalizeSopIdentifierKey(parsed.identifier) : cidNorm;
        const vNum = asIntVersion(parsed.version);
        const subFolder =
          parsed.versionGroupBase != null
            ? `${deptSeg}/${parsed.versionGroupBase}-${padVersionSuffix(vNum)}`
            : `${deptSeg}/${idSeg}/V${vNum}`;
        const bunnyPath = `${subFolder.replace(/\\/g, '/')}/${safeName}`;
        const cdn = await uploadToBunny(buffer, bunnyPath);
        if (!cdn) {
          return {
            ok: false as const,
            error: {
              path: relativePath,
              error: 'Bunny upload failed for this file (check credentials and zone).',
            },
          };
        }
        const meta = byIdentifier.get(cidNorm);
        if (!meta) {
          return {
            ok: false as const,
            error: { path: relativePath, error: 'Internal: canonical SOP row missing.' },
          };
        }
        return {
          ok: true as const,
          cidNorm,
          department: meta.department,
          version: vNum,
          ext: parsed.ext,
          storedPath: cdn.startsWith('http') ? cdn : cdn.replace(/^\/+/, ''),
        };
      };
      const worker = async () => {
        while (next < items.length) {
          const idx = next++;
          out[idx] = await runOne(items[idx]);
        }
      };
      const workers = Array.from(
        { length: Math.min(uploadConcurrency, Math.max(1, items.length)) },
        () => worker(),
      );
      await Promise.all(workers);
      return out;
    })();

    for (const r of perFileResults) {
      if (!r) continue;
      if (!r.ok) {
        if (r.skipOlder) {
          skippedOlderVersions++;
        } else if (r.error) {
          errors.push(r.error);
        }
        continue;
      }
      if (!filteredByIdentifier.has(r.cidNorm)) {
        filteredByIdentifier.set(r.cidNorm, { department: r.department, versions: new Map() });
      }
      const rec = filteredByIdentifier.get(r.cidNorm)!;
      rec.department = r.department;
      if (!rec.versions.has(r.version)) rec.versions.set(r.version, {});
      const slot = rec.versions.get(r.version)!;
      if (r.ext === 'docx') slot.docxPath = r.storedPath;
      else slot.pdfPath = r.storedPath;
      processed++;
    }

    const results: {
      identifier: string;
      entries: { version: number; docxPath?: string; pdfPath?: string }[];
      sopName?: string;
    }[] = [];

    for (const [identifier, { department, versions: batchAll }] of byIdentifier) {
      const normId = normalizeSopIdentifierKey(identifier);
      const cached = artifactByNorm.get(normId);
      const filteredBatch = filteredByIdentifier.get(normId)?.versions ?? new Map();
      const currentRev = parseRevisionFromSopIdentifier(normId);
      const cutoff = currentRev != null && currentRev > 0 ? currentRev : null;

      // Read the LATEST DB state for this SOP right before merging — `artifactByNorm`
      // is a request-start snapshot, so when 4 parallel batches touch the same SOP
      // (e.g. the user dragged folders that all map to QAGE8-10) each would otherwise
      // overwrite the others' writes. Re-reading here turns the cache into a
      // fast-path hint and the DB read into the source of truth at write time.
      const existingId = primaryIdByNorm.get(normId) ?? cached?._id;
      let liveEntries: { version: number; docxPath?: string; pdfPath?: string }[] | undefined;
      if (existingId) {
        const live = await SOPVersionArtifacts.findById(existingId).select('entries sopName').lean<any>();
        if (live?.entries) liveEntries = live.entries;
      }
      if (!liveEntries) {
        const live = await SOPVersionArtifacts.findOne({ identifier: normId, language })
          .select('entries sopName')
          .lean<any>();
        if (live?.entries) liveEntries = live.entries;
      }
      const existingEntries = liveEntries ?? cached?.entries;

      const entries = mergeVersionMaps(existingEntries, filteredBatch)
        .filter((e) => cutoff == null || asIntVersion(e.version) <= cutoff)
        .slice(0, MAX_VERSIONS_PER_SOP);

      if (entries.length === 0 && !existingId) continue;

      const mergedSopName = pickLongerTitle(sopNameByNorm.get(normId), cached?.sopName);
      const $set: Record<string, unknown> = {
        identifier: normId,
        department,
        language,
        entries,
      };
      if (mergedSopName) $set.sopName = mergedSopName;
      let saved: any = null;
      if (existingId) {
        saved = await SOPVersionArtifacts.findOneAndUpdate({ _id: existingId }, { $set }, { new: true }).lean();
      } else {
        saved = await SOPVersionArtifacts.findOneAndUpdate(
          { identifier: normId, language },
          { $set },
          { upsert: true, new: true },
        ).lean();
      }
      if (saved?._id) primaryIdByNorm.set(normId, saved._id);

      if (saved?._id) {
        const sn = saved.sopName ? String(saved.sopName).trim() : undefined;
        artifactByNorm.set(normId, {
          _id: saved._id,
          entries: (saved.entries || []) as typeof entries,
          sopName: pickLongerTitle(sn, mergedSopName),
        });
      }

      results.push({ identifier: normId, entries, sopName: mergedSopName });
    }

    for (const [base, canonical] of canonicalByBase) {
      const rx = new RegExp(`^${escapeRegex(base)}-\\d+$`, 'i');
      const dupCandidates = await SOPVersionArtifacts.find({ language, identifier: { $regex: rx } })
        .select('_id identifier updatedAt')
        .lean();
      const sameNorm = dupCandidates.filter(
        (d: any) => normalizeSopIdentifierKey(String(d.identifier || '')) === canonical,
      );
      if (sameNorm.length <= 1) continue;
      sameNorm.sort(
        (a: any, b: any) =>
          new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
      );
      const dropIds = sameNorm.slice(1).map((d: any) => d._id);
      if (dropIds.length > 0) {
        await SOPVersionArtifacts.deleteMany({ _id: { $in: dropIds } });
        sopUploadLog('deduped duplicate Mongo rows for same normalized SOP', {
          base,
          canonical,
          removed: dropIds.length,
        });
      }
    }

    if (items.length === 0 && errors.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No files received. Use folder upload with an SOP code in the path (e.g. Dept/…/QAGE01-08/doc.pdf, or file names starting with QAGE91-03 - …), or V8-style folders.',
        },
        { status: 400 },
      );
    }

    const versionsStored = results.reduce((sum, r) => sum + r.entries.length, 0);

    // Bust the dashboard's 5-min cache so Versions / DOCX / PDF capsule counts reflect this upload immediately.
    if (results.length > 0 || processed > 0) {
      try { await invalidateDashboardSopsCache(); } catch { /* best effort */ }
    }

    const detectedSummary = [...byIdentifier.entries()].map(([identifier, { versions: vs }]) => ({
      id: normalizeSopIdentifierKey(identifier),
      detectedV: [...vs.keys()].map(asIntVersion).filter((n) => n >= 0).sort((a, b) => b - a),
    }));
    const storedSummary = results.map((r) => ({
      id: r.identifier,
      storedV: r.entries.map((e) => asIntVersion(e.version)).sort((a, b) => b - a),
    }));
    console.log(
      `[sop-folder-upload] summary lang=${language} files=${items.length} processed=${processed} skippedOlder=${skippedOlderVersions} mongoRows=${results.length} versionSlots=${versionsStored}`,
    );
    console.log('[sop-folder-upload] detectedVersionsBySop', JSON.stringify(detectedSummary));
    console.log('[sop-folder-upload] storedVersionsBySop', JSON.stringify(storedSummary));

    const integrity = {
      inputFiles: items.length,
      parseErrorCount: errors.filter((e) => e.path && e.path.length > 0).length,
      uniqueSopsInRequest: byIdentifier.size,
      mongoRowsWritten: results.length,
      filesUploaded: processed,
      skippedAnnexureFiles,
      skippedNotInTop3Versions: skippedOlderVersions,
      versionEntrySlotsInDb: versionsStored,
    };

    return NextResponse.json({
      success: true,
      processed,
      skippedAnnexureFiles,
      skippedOlderVersions,
      maxPriorVersions: Number.isFinite(MAX_VERSIONS_PER_SOP) ? MAX_VERSIONS_PER_SOP : 0,
      priorVersionsUnlimited: !Number.isFinite(MAX_VERSIONS_PER_SOP),
      identifiers: results.length,
      versionsStored,
      results,
      errors,
      storage: 'bunny',
      integrity,
      ...(wantDebug && versionTrace?.length
        ? {
            debug: {
              versionTrace: versionTrace.slice(0, 250),
              storedPerSop: results.map((r) => ({
                identifier: r.identifier,
                versions: r.entries.map((e) => e.version).sort((a, b) => b - a),
                hasDocx: r.entries.map((e) => !!e.docxPath),
                hasPdf: r.entries.map((e) => !!e.pdfPath),
              })),
            },
          }
        : {}),
    });
  } catch (e) {
    console.error('folder-upload:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
