import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import SOP from '@/models/SOP';
import User from '@/models/User';
import MatrixEntry from '@/models/MatrixEntry';
import TrainingMatrix from '@/models/TrainingMatrix';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import SOPVersionArtifacts from '@/models/SOPVersionArtifacts';
import SupersedeSOPVersion from '@/models/SupersedeSOPVersion';
import MCQBank from '@/models/MCQBank';
import { fileKindFromStoredPath } from '@/lib/filePathFileKind';
import { inferSopIdentifiersFromStoredPath } from '@/lib/inferSopIdentifierFromStoredPath';
import { getDepartmentForSubcategory, extractSubcategoryFromIdentifier } from '@/lib/mcqTreeBuilder';
import {
  expandSopIdentifierVariants,
  formatSopNoDisplay,
  normalizeSopIdentifierKey,
  parseRevisionFromSopIdentifier,
  sopFamilyKeyFromIdentifier,
  versionArtifactsLookupKey,
} from '@/lib/sopIdentifierNormalize';
import { getMaxPriorVersionsStored } from '@/lib/sopFolderUploadLimits';
import { filterPrimaryRegistryRows, isArtifactOnlyRegistryRow } from '@/lib/registryPrimaryRows';

/** Avoid stale JSON when users re-upload version artifacts and refresh the registry. */
export const dynamic = 'force-dynamic';

type VersionArtifactEntry = { version: number; docxPath?: string; pdfPath?: string };

/** Registry + folder upload: same cap as folder upload (unlimited by default; env may cap). */
const MAX_REGISTRY_PRIOR_VERSIONS = getMaxPriorVersionsStored();

function mergeVersionArtifactEntries(a: VersionArtifactEntry[], b: VersionArtifactEntry[]): VersionArtifactEntry[] {
  const merged = new Map<number, { docxPath?: string; pdfPath?: string }>();
  for (const e of [...a, ...b]) {
    const cur = merged.get(e.version) || {};
    merged.set(e.version, {
      docxPath: e.docxPath || cur.docxPath,
      pdfPath: e.pdfPath || cur.pdfPath,
    });
  }
  return Array.from(merged.entries())
    .map(([version, p]) => ({ version, ...p }))
    .filter((e) => (e.docxPath && String(e.docxPath).trim()) || (e.pdfPath && String(e.pdfPath).trim()))
    .sort((x, y) => y.version - x.version);
}

/**
 * Merge version artifacts for all identifier spellings + same document family (e.g. …-10 and …-11 Mongo docs).
 */
function versionArtifactsForRow(
  idUpper: string,
  lang: 'English' | 'Gujarati',
  map: Map<string, VersionArtifactEntry[]>,
  artifactsMergedByFamilyLang?: Map<string, VersionArtifactEntry[]>,
): VersionArtifactEntry[] {
  let merged: VersionArtifactEntry[] = [];
  const tried = new Set<string>();
  for (const id of expandSopIdentifierVariants(idUpper)) {
    const key = `${versionArtifactsLookupKey(id)}::${lang}`;
    if (tried.has(key)) continue;
    tried.add(key);
    const list = map.get(key);
    if (list?.length) merged = mergeVersionArtifactEntries(merged, list);
  }
  const fk = sopFamilyKeyFromIdentifier(idUpper);
  if (fk && artifactsMergedByFamilyLang) {
    const fam = artifactsMergedByFamilyLang.get(`${fk}::${lang}`);
    if (fam?.length) merged = mergeVersionArtifactEntries(merged, fam);
  }
  return merged;
}

function normalizeDeptForDisplay(d: string): string {
  if (!d) return 'Other';
  const lower = d.toLowerCase();
  if (lower.includes('micro')) return 'Microbiology';
  if (lower.includes('engineer')) return 'Engineering and Maintenance';
  if (lower.includes('person') || lower.includes('hr')) return 'Personnel';
  if (lower.includes('store')) return 'Store';
  if (lower.includes('prod')) return 'Production';
  if (lower === 'qa' || lower.includes('quality assurance')) return 'QA';
  if (lower === 'qc' || lower.includes('quality control')) return 'QC';
  return d;
}

function stripFolderPath(name: string): string {
  if (!name) return name;
  let n = name.trim();
  n = n.replace(/^Word\s+files\s+only[\/\\]*/i, '');
  // Greedily strip everything up to the last slash
  n = n.replace(/^.*[\/\\]/, '');
  return n.trim();
}

/** If a string contains both English and Gujarati separated by delimiters or spaces, split them */
function splitDualName(name: string): { eng: string; guj: string } | null {
  if (!name || !/[\u0A80-\u0AFF]/.test(name)) return null;

  // Pattern: English text followed by optional delimiter, followed by Gujarati text
  const match1 = name.match(/^([A-Za-z0-9_\s()\[\]&*%$#@!.,:;'"\-\/]+?)[\/\-\|]?\s*([\u0A80-\u0AFF].*)$/);
  if (match1 && match1[1].trim().length > 2 && match1[2].trim().length > 2) {
    return { eng: match1[1].replace(/[\/\-\|]+$/, '').trim(), guj: match1[2].trim() };
  }

  // Pattern: Gujarati text followed by optional delimiter, followed by English text
  const match2 = name.match(/^([\u0A80-\u0AFF\s()\[\]&*%$#@!.,:;'"\-\/]+?)[\/\-\|]?\s*([A-Za-z]+[A-Za-z0-9_\s()\[\]&*%$#@!.,:;'"\-\/]*)$/);
  if (match2 && match2[1].trim().length > 2 && match2[2].trim().length > 2) {
    return { eng: match2[2].trim(), guj: match2[1].replace(/[\/\-\|]+$/, '').trim() };
  }

  return null;
}

function cleanSopName(rawName: string, identifier: string): string {
  if (!rawName) return identifier || 'Untitled SOP';
  let name = String(rawName).trim();
  name = name.replace(/\.(docx|doc|pdf)$/i, '');
  name = stripFolderPath(name);

  const nameAfterFolderStrip = name;
  const id = (identifier || '').trim();

  if (id) {
    // 1. Exact match with loose separators
    const escaped = id.replace(/[-]/g, '[-_\\s]?');
    const prefixRe = new RegExp(`^${escaped}[\\s_\\-–—:,]*`, 'i');
    name = name.replace(prefixRe, '');

    // 2. Revision-insensitive strip (e.g. strip QAMI01-08 when identifier is QAMI01-6)
    const idNorm = normalizeSopIdentifierKey(id.toUpperCase());
    const famM = idNorm.match(/^([A-Z]{1,6})(\d+)-(\d+)$/);
    if (famM) {
      const letters = famM[1];
      const docNum = parseInt(famM[2], 10);
      const looseRevPrefix = new RegExp(
        `^${letters}[0\\s_\\-]*${docNum}[\\s_\\-]*\\d+[\\s_\\-–—:,]*`,
        'i',
      );
      name = name.replace(looseRevPrefix, '');
    }
  }

  // Strip leading digits followed by spaces or separators (common in file lists, e.g. "0 BATCH...")
  name = name.replace(/^[0-9]+[\s\-_:\.]+/, '').trim();
  name = name.replace(/_/g, ' ');
  name = name.replace(/^[\s\-–—:.]+/, '').replace(/[\s\-–—:.]+$/, '').trim();

  // Special case: if name matches code exactly without the revision (e.g. name was "PREG10", ID is "PREG10-4")
  if (id && name.toUpperCase() === id.replace(/-.*/, '').toUpperCase()) {
    name = '';
  }

  // Fallback if empty or purely numeric
  const isPurelyNumeric = /^[0-9\s\-_:\.]+$/.test(name);
  if (!name || name.length < 2 || isPurelyNumeric) {
    if (nameAfterFolderStrip && nameAfterFolderStrip.length > 2 && !/^[0-9\s\-_:\.]+$/.test(nameAfterFolderStrip)) {
      // If original nameAfterFolderStrip was descriptive, use it
      return nameAfterFolderStrip;
    }
    return identifier || 'Untitled SOP';
  }
  return name;
}

/** True when the basename looks like SOPCODE-REV (don’t use as human title over library/master names). */
function looksLikeSopCodeFilename(s: string): boolean {
  const t = (s || '').trim();
  return /^[A-Z]{1,6}0*\d+-\d+/i.test(t);
}

function registryDisplayTitleKey(s: string): string {
  return normalizeSopIdentifierKey(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function englishTitleIsUsableForRegistry(s: string, idUpper: string): boolean {
  const x = String(s || '').trim();
  if (x.length < 3) return false;
  
  // Is it Gujarati only?
  const isGujOnly = /[\u0A80-\u0AFF]/.test(x) && !/[A-Za-z]{3,}/.test(x);
  if (isGujOnly) return false;

  // Is it just the SOP code?
  if (registryDisplayTitleKey(x) === registryDisplayTitleKey(idUpper)) return false;
  if (looksLikeSopCodeFilename(x)) return false;

  // Is it just a generic department name?
  const lower = x.toLowerCase();
  const genericDepts = [
    'production', 'qa', 'qc', 'quality assurance', 'quality control', 
    'personnel', 'hr', 'stores', 'store', 'microbiology', 'micro', 
    'engineering', 'maintenance', 'engineering and maintenance',
    'it', 'information technology', 'warehouse', 'dispatch'
  ];
  if (genericDepts.includes(lower)) return false;

  return true;
}

/** When Mongo English row has GUJ-only or code-like title, recover English from SOPLibrary / Master / folder-upload artifacts. */
function resolveDualEnglishTitleFromStores(
  idUpper: string,
  libEngNameByIdentifier: Map<string, string>,
  libNameByIdentifier: Map<string, string>,
  masterNameByIdentifier: Map<string, string>,
  masterEngNameByIdentifier: Map<string, string>,
  versionArtifactNameByKey: Map<string, string>,
): string | null {
  for (const vid of expandSopIdentifierVariants(idUpper)) {
    const fbEn =
      libEngNameByIdentifier.get(vid) ||
      masterEngNameByIdentifier.get(vid) ||
      libNameByIdentifier.get(vid) ||
      masterNameByIdentifier.get(vid) ||
      versionArtifactNameByKey.get(`${versionArtifactsLookupKey(vid)}::English`);
    if (!fbEn || String(fbEn).trim().length < 3) continue;
    const t = cleanSopName(String(fbEn), idUpper);
    if (englishTitleIsUsableForRegistry(t, idUpper)) return t;
  }
  return null;
}

function resolveGujaratiTitleFromStores(
  idUpper: string,
  libGujNameByIdentifier: Map<string, string>,
  libNameByIdentifier: Map<string, string>,
  masterGujNameByIdentifier: Map<string, string>,
  versionArtifactNameByKey: Map<string, string>,
): string | null {
  for (const vid of expandSopIdentifierVariants(idUpper)) {
    const t =
      libGujNameByIdentifier.get(vid) ||
      masterGujNameByIdentifier.get(vid) ||
      libNameByIdentifier.get(vid) ||
      versionArtifactNameByKey.get(`${versionArtifactsLookupKey(vid)}::Gujarati`);
    if (t && /[\u0A80-\u0AFF]/.test(t) && t.length > 2) {
      return cleanSopName(t, idUpper);
    }
  }
  return null;
}

function basenameOrParentFromPath(fullPath: string): [string, string | null] {
  const s = (fullPath || '').trim().split(/[?#]/)[0];
  const parts = s.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length === 0) return ['', null];
  const base = parts[parts.length - 1]!;
  const parent = parts.length >= 2 ? parts[parts.length - 2]! : null;
  return [base, parent];
}

/**
 * English DOCX/PDF are linked (Files column) but DB/library/artifact.sopName may be empty — derive title from
 * filename or parent folder (e.g. …/PREVENTIVE MAINTENANCE/MAGE01-07.docx).
 */
function resolveEnglishTitleFromArtifactAndDocPaths(
  idUpper: string,
  artifactEntries: VersionArtifactEntry[],
  sopDocuments: any[],
): string | null {
  const tryOneRawSegment = (seg: string): string | null => {
    const raw = fileNameDisplay(seg);
    if (!raw || raw.length < 3) return null;
    const t = cleanSopName(raw, idUpper);
    if (englishTitleIsUsableForRegistry(t, idUpper)) return t;
    return null;
  };

  const tryStoragePath = (p: string): string | null => {
    const [base, parent] = basenameOrParentFromPath(p);
    const hitBase = tryOneRawSegment(base);
    if (hitBase) return hitBase;
    if (parent) {
      const hitParent = tryOneRawSegment(parent);
      if (hitParent) return hitParent;
    }
    return null;
  };

  const sorted = [...(artifactEntries || [])].sort((a, b) => b.version - a.version);
  for (const e of sorted) {
    for (const p of [e.docxPath, e.pdfPath]) {
      if (!p || !String(p).trim()) continue;
      const hit = tryStoragePath(String(p));
      if (hit) return hit;
    }
  }

  const engDocs = (sopDocuments || []).filter((d: any) => (d.language || '') !== 'Gujarati');
  for (const d of engDocs) {
    const fn = d?.fileName ? String(d.fileName).trim() : '';
    if (fn && !/^v\d+\s+(DOCX|PDF)$/i.test(fn)) {
      const hit = tryOneRawSegment(fn);
      if (hit) return hit;
    }
    const hit = tryStoragePath(String(d?.filePath || ''));
    if (hit) return hit;
  }
  return null;
}

function pickBestName(
  sopName: string,
  identifier: string,
  libName?: string,
  masterName?: string,
  originalFileName?: string,
  /** Title from folder-upload (SOPVersionArtifacts.sopName) */
  artifactFolderName?: string,
  targetLang?: 'English' | 'Gujarati',
): string {
  // Priority: master > library > artifact folder name > originalFileName > sopName
  // Reject empty, path-like (contains slashes or > 120 chars), and SOP-code-only names.
  const isPathLike = (s: string) => {
    if (!s || s.length > 140) return true;
    if (/Word files only/i.test(s)) return true;
    if ((s.match(/[\/\\]/g) || []).length >= 2) return true;
    return false;
  };
  
  const isGujarati = (s: string) => /[\u0A80-\u0AFF]/.test(s);
  let candidates = [masterName, libName, artifactFolderName, originalFileName, sopName].filter(Boolean) as string[];

  if (targetLang === 'English') {
    const engCandidates = candidates.filter((c) => !isGujarati(c));
    if (engCandidates.length > 0) candidates = engCandidates;
  } else if (targetLang === 'Gujarati') {
    const gujCandidates = candidates.filter((c) => isGujarati(c));
    if (gujCandidates.length > 0) candidates = gujCandidates;
  }

  for (const c of candidates) {
    if (isPathLike(c)) continue;
    const cleaned = cleanSopName(c, identifier);
    if (cleaned.length < 3) continue;
    if (cleaned.toUpperCase().replace(/[-_\s]/g, '') === identifier.toUpperCase().replace(/[-_\s]/g, '')) continue;
    return cleaned;
  }
  return cleanSopName(sopName || identifier, identifier) || identifier;
}

function fileNameDisplay(rawName: string): string {
  if (!rawName) return '';
  let name = rawName.trim();
  name = name.replace(/\.(docx|doc|pdf)$/i, '');
  name = stripFolderPath(name);
  return name.trim();
}

/** Same physical file may be stored with different slashes / leading slash — used to compare paths */
function normPathKey(p: string): string {
  const base = (p || '').trim().split(/[?#]/)[0];
  return base.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '').toLowerCase();
}

/** One entry per storage path — keeps the Files column from listing the same DOCX/PDF twice */
function dedupeSopDocumentsByPath(docs: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const d of docs || []) {
    if (!d?.filePath || !String(d.filePath).trim()) continue;
    const k = normPathKey(d.filePath);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

function sopDocumentsHaveWordDocForLanguage(docs: any[], language: 'English' | 'Gujarati'): boolean {
  return (docs || []).some((d) => {
    if (!d?.filePath) return false;
    const docLang = d.language === 'Gujarati' ? 'Gujarati' : 'English';
    if (docLang !== language) return false;
    const k = fileKindFromStoredPath(String(d.filePath), d.fileType);
    return k === 'docx' || k === 'doc';
  });
}

function sopDocumentsHavePdfForLanguage(docs: any[], language: 'English' | 'Gujarati'): boolean {
  return (docs || []).some((d) => {
    if (!d?.filePath) return false;
    const docLang = d.language === 'Gujarati' ? 'Gujarati' : 'English';
    if (docLang !== language) return false;
    return fileKindFromStoredPath(String(d.filePath), d.fileType) === 'pdf';
  });
}

function extractRevisionFromDocRef(filePath: string, fileName?: string): number | null {
  const candidates = new Set<string>();
  for (const c of inferSopIdentifiersFromStoredPath(filePath || '')) candidates.add(c);
  if (fileName) {
    for (const c of inferSopIdentifiersFromStoredPath(fileName)) candidates.add(c);
  }
  let best: number | null = null;
  for (const c of candidates) {
    const rev = parseRevisionFromSopIdentifier(c);
    if (rev == null) continue;
    if (best == null || rev > best) best = rev;
  }
  return best;
}

function isAnnexureLikeDoc(filePath: string, fileName?: string): boolean {
  const t = `${fileName || ''} ${filePath || ''}`.toLowerCase();
  return /\bannex(?:ure)?\b/.test(t);
}

function docBelongsToSopFamily(sopNo: string, filePath: string, fileName?: string): boolean {
  const family = sopFamilyKeyFromIdentifier(sopNo);
  if (!family) return true;
  const candidates = new Set<string>();
  for (const c of inferSopIdentifiersFromStoredPath(filePath || '')) candidates.add(c);
  if (fileName) {
    for (const c of inferSopIdentifiersFromStoredPath(fileName)) candidates.add(c);
  }
  if (candidates.size === 0) return false;
  for (const c of candidates) {
    if (sopFamilyKeyFromIdentifier(c) === family) return true;
  }
  return false;
}

function filterDocsToCurrentRevision(sopNo: string, docs: any[]): any[] {
  const cur = parseRevisionFromSopIdentifier(sopNo);
  return (docs || []).filter((d: any) => {
    const filePath = String(d?.filePath || '');
    const fileName = String(d?.fileName || '');
    if (isAnnexureLikeDoc(filePath, fileName)) return false;
    if (!docBelongsToSopFamily(sopNo, filePath, fileName)) return false;
    if (cur == null) return true;
    const rev = extractRevisionFromDocRef(filePath, fileName);
    // If revision cannot be inferred from path/name, do not use it as current mapping.
    if (rev == null) return false;
    return rev === cur;
  });
}

/**
 * Folder/version-artifact uploads often store the live DOCX on the newest artifact version while SOPLibrary
 * was skipped (e.g. annexure in title) or only PDF was linked on the SOP row — surface DOCX in Files.
 * Scoped per language so English DOCX does not block appending Gujarati DOCX (and vice versa).
 */
function appendLatestArtifactWordIfMissing(
  sopDocuments: any[],
  entries: VersionArtifactEntry[],
  language: 'English' | 'Gujarati',
  currentRevision?: number | null,
): void {
  if (sopDocumentsHaveWordDocForLanguage(sopDocuments, language) || !entries?.length) return;
  const sorted = currentRevision != null
    ? [...entries].filter((e) => e.version === currentRevision)
    : [...entries].sort((a, b) => b.version - a.version);
  for (const e of sorted) {
    const p = e.docxPath?.trim();
    if (!p) continue;
    if (sopDocuments.some((d) => normPathKey(d.filePath) === normPathKey(p))) return;
    sopDocuments.push({
      fileName: `V${e.version} DOCX`,
      filePath: p,
      fileType: 'docx',
      language,
    });
    return;
  }
}

/** Same as DOCX helper: surface PDF for each language when the row/library only linked Word (or vice versa). */
function appendLatestArtifactPdfIfMissing(
  sopDocuments: any[],
  entries: VersionArtifactEntry[],
  language: 'English' | 'Gujarati',
  currentRevision?: number | null,
): void {
  if (sopDocumentsHavePdfForLanguage(sopDocuments, language) || !entries?.length) return;
  const sorted = currentRevision != null
    ? [...entries].filter((e) => e.version === currentRevision)
    : [...entries].sort((a, b) => b.version - a.version);
  for (const e of sorted) {
    const p = e.pdfPath?.trim();
    if (!p) continue;
    if (sopDocuments.some((d) => normPathKey(d.filePath) === normPathKey(p))) return;
    sopDocuments.push({
      fileName: `V${e.version} PDF`,
      filePath: p,
      fileType: 'pdf',
      language,
    });
    return;
  }
}

/**
 * One dashboard row per SOP family (e.g. QAGE01-10 + QAGE01-11 → single row QAGE01-11).
 * Prior-version files stay in versionArtifacts only, not duplicated in sopDocuments.
 */
/** Convert Mongo SOP records into version-artifact entries for the registry "Prior versions" column. */
function extractArtifactsFromSopRows(
  rows: any[],
  excludeWinnerId?: string,
): { en: VersionArtifactEntry[]; gj: VersionArtifactEntry[] } {
  const enMap = new Map<number, VersionArtifactEntry>();
  const gjMap = new Map<number, VersionArtifactEntry>();

  rows.forEach((r) => {
    if (excludeWinnerId && String(r._id) === String(excludeWinnerId)) return;
    const revNum = parseRevisionFromSopIdentifier(String(r.sopNo || r.identifier || ''));
    if (revNum == null) return;

    const docs = [...(r.sopFile ? [r.sopFile] : []), ...(r.sopDocuments || [])];
    docs.forEach((d: any) => {
      if (!d?.filePath || !String(d.filePath).trim()) return;
      const lang = d.language === 'Gujarati' ? 'Gujarati' : 'English';
      const k = fileKindFromStoredPath(String(d.filePath), d.fileType);
      const targetMap = lang === 'Gujarati' ? gjMap : enMap;

      const entry = targetMap.get(revNum) || { version: revNum };
      if ((k === 'docx' || k === 'doc') && !entry.docxPath) entry.docxPath = d.filePath;
      else if (k === 'pdf' && !entry.pdfPath) entry.pdfPath = d.filePath;
      targetMap.set(revNum, entry);
    });
  });

  return {
    en: Array.from(enMap.values()),
    gj: Array.from(gjMap.values()),
  };
}

function collapsePrimaryRegistryRowsByFamily(
  rows: any[],
  versionArtifactsByKey: Map<string, VersionArtifactEntry[]>,
  artifactsMergedByFamilyLang: Map<string, VersionArtifactEntry[]>,
): any[] {
  const byFamily = new Map<string, any[]>();
  const ungrouped: any[] = [];
  for (const row of rows) {
    const fk = sopFamilyKeyFromIdentifier(String(row.sopNo || ''));
    if (!fk) {
      const nk0 = normalizeSopIdentifierKey(String(row.sopNo || '').trim().toUpperCase());
      ungrouped.push(
        applyRegistryPriorSplits(
          {
            ...row,
            sopNo: nk0,
            sopDocuments: dedupeSopDocumentsByPath(row.sopDocuments || []),
          },
          versionArtifactsForRow(nk0, 'English', versionArtifactsByKey, artifactsMergedByFamilyLang),
          versionArtifactsForRow(nk0, 'Gujarati', versionArtifactsByKey, artifactsMergedByFamilyLang),
          nk0,
        ),
      );
      continue;
    }
    if (!byFamily.has(fk)) byFamily.set(fk, []);
    byFamily.get(fk)!.push(row);
  }

  const collapsed: any[] = [...ungrouped];
  for (const [, group] of byFamily) {
    const nkFirst = normalizeSopIdentifierKey(String(group[0].sopNo || '').trim().toUpperCase());
    if (group.length === 1) {
      const only = group[0];
      collapsed.push(
        applyRegistryPriorSplits(
          {
            ...only,
            sopNo: nkFirst,
            sopDocuments: dedupeSopDocumentsByPath(only.sopDocuments || []),
          },
          versionArtifactsForRow(nkFirst, 'English', versionArtifactsByKey, artifactsMergedByFamilyLang),
          versionArtifactsForRow(nkFirst, 'Gujarati', versionArtifactsByKey, artifactsMergedByFamilyLang),
          nkFirst,
        ),
      );
      continue;
    }

    const scored = group.map((r) => ({
      row: r,
      rev: parseRevisionFromSopIdentifier(String(r.sopNo || '')) ?? -1,
    }));
    scored.sort((a, b) => b.rev - a.rev);
    const winner = scored[0].row;
    const nk = normalizeSopIdentifierKey(String(winner.sopNo || '').trim().toUpperCase());

    const mergedEn = versionArtifactsForRow(nk, 'English', versionArtifactsByKey, artifactsMergedByFamilyLang);
    const mergedGj = versionArtifactsForRow(nk, 'Gujarati', versionArtifactsByKey, artifactsMergedByFamilyLang);
    
    /** Prior versions: also collect files from any non-winner Mongo rows in this group (e.g. user uploaded V00, V01 separately). */
    const { en: extraEn, gj: extraGj } = extractArtifactsFromSopRows(group, winner._id);
    const finalEn = mergeVersionArtifactEntries(mergedEn, extraEn);
    const finalGj = mergeVersionArtifactEntries(mergedGj, extraGj);

    const userSet = new Set<string>();
    for (const r of group) {
      for (const u of r.assignedUsers || []) {
        if (u) userSet.add(u);
      }
    }

    let assignedTrainer = winner.assignedTrainer;
    for (const s of scored.map((x) => x.row)) {
      if (s.assignedTrainer && s.assignedTrainer !== 'Unassigned') {
        assignedTrainer = s.assignedTrainer;
        break;
      }
    }
    
    let bestExpiryDate = winner.expiryDate;
    let bestExpired = winner._expired;
    let bestNearExpiry = winner._nearExpiry;
    if (!bestExpiryDate) {
      for (const s of scored.map((x) => x.row)) {
        if (s.expiryDate) {
          bestExpiryDate = s.expiryDate;
          bestExpired = s._expired;
          bestNearExpiry = s._nearExpiry;
          break;
        }
      }
    }

    collapsed.push(
      applyRegistryPriorSplits(
        {
          ...winner,
          sopNo: nk,
          sopDocuments: dedupeSopDocumentsByPath(winner.sopDocuments || []),
          assignedUsers: userSet.size ? [...userSet] : winner.assignedUsers,
          assignedTrainer,
          expiryDate: bestExpiryDate,
          _expired: bestExpired,
          _nearExpiry: bestNearExpiry,
        },
        finalEn,
        finalGj,
        nk,
      ),
    );
  }

  return collapsed;
}

/**
 * After folder-upload artifact rows are appended, merge any rows that share the same document family
 * (e.g. Mongo QAMI34-6 + artifacts-only QAMI34-8 → one row QAMI34-8 with combined files).
 */
function mergeRegistryRowsByDocumentFamily(
  rows: any[],
  versionArtifactsByKey: Map<string, VersionArtifactEntry[]>,
  artifactsMergedByFamilyLang: Map<string, VersionArtifactEntry[]>,
): any[] {
  const byFamily = new Map<string, any[]>();
  const ungrouped: any[] = [];
  for (const row of rows) {
    const fk = sopFamilyKeyFromIdentifier(String(row.sopNo || ''));
    if (!fk) {
      ungrouped.push(row);
      continue;
    }
    if (!byFamily.has(fk)) byFamily.set(fk, []);
    byFamily.get(fk)!.push(row);
  }

  const out: any[] = [...ungrouped];
  for (const [, group] of byFamily) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }

    const scored = group.map((r) => ({
      row: r,
      rev: parseRevisionFromSopIdentifier(String(r.sopNo || '')) ?? -1,
      isPrimary: r.registryRowKind === 'primary',
    }));
    scored.sort((a, b) => {
      if (b.rev !== a.rev) return b.rev - a.rev;
      if (a.isPrimary && !b.isPrimary) return 1;
      if (!a.isPrimary && b.isPrimary) return -1;
      return 0;
    });

    const winner = scored[0].row;
    const nk = normalizeSopIdentifierKey(String(winner.sopNo || '').trim().toUpperCase());
    const primaryRow = group.find((r) => r.registryRowKind === 'primary');

    /** Current docs for the Files column: take only from the primary row (or winner if no primary). */
    const winningRowForDocs = primaryRow || winner;
    const mergedDocs = dedupeSopDocumentsByPath(winningRowForDocs.sopDocuments || []);

    const rawEn = versionArtifactsForRow(nk, 'English', versionArtifactsByKey, artifactsMergedByFamilyLang);
    const rawGj = versionArtifactsForRow(nk, 'Gujarati', versionArtifactsByKey, artifactsMergedByFamilyLang);
    
    /** Prior versions: also collect files from any non-winner Mongo rows in this group. */
    const { en: extraEn, gj: extraGj } = extractArtifactsFromSopRows(group, winningRowForDocs._id);
    const finalEn = mergeVersionArtifactEntries(rawEn, extraEn);
    const finalGj = mergeVersionArtifactEntries(rawGj, extraGj);
    const currentRevision = parseRevisionFromSopIdentifier(nk);
    appendLatestArtifactWordIfMissing(mergedDocs, finalEn, 'English', currentRevision);
    appendLatestArtifactWordIfMissing(mergedDocs, finalGj, 'Gujarati', currentRevision);
    appendLatestArtifactPdfIfMissing(mergedDocs, finalEn, 'English', currentRevision);
    appendLatestArtifactPdfIfMissing(mergedDocs, finalGj, 'Gujarati', currentRevision);

    let bestEnglish: string | null = null;
    let bestGujarati: string | null = null;
    for (const r of group) {
      for (const [raw, lang] of [
        [r.englishName || r.sopName, 'en'] as const,
        [r.gujaratiName || r._gujRawName || r._gujOriginalFileName, 'gj'] as const,
      ]) {
        if (!raw || String(raw).length < 3) continue;
        const cleaned = cleanSopName(String(raw), nk);
        if (cleaned.length < 3 || registryDisplayTitleKey(cleaned) === registryDisplayTitleKey(nk)) continue;
        if (lang === 'en') {
          if (!bestEnglish || cleaned.length > bestEnglish.length) bestEnglish = cleaned;
        } else if (
          /[\u0A80-\u0AFF]/.test(cleaned) &&
          (!bestGujarati || cleaned.length > bestGujarati.length)
        ) {
          bestGujarati = cleaned;
        }
      }
    }

    if (!bestGujarati) {
      for (const r of group) {
        const candidate = String(r.gujaratiName || '').trim();
        if (candidate && /[\u0A80-\u0AFF]/.test(candidate)) {
          bestGujarati = candidate;
          break;
        }
      }
    }

    const englishPathKeys = new Set<string>();
    mergedDocs.forEach((d: any) => {
      if (d.filePath && d.language !== 'Gujarati') englishPathKeys.add(normPathKey(d.filePath));
    });
    const hasGujaratiFile = mergedDocs.some(
      (d: any) =>
        d.language === 'Gujarati' && d.filePath && !englishPathKeys.has(normPathKey(d.filePath)),
    );
    const registrySaysDual = group.some((r: any) => r.isDualLanguage === true);
    /** Dual = DB/registry says both languages — do not clear dual when GUJ path matches EN (use gujaratiFileMissing instead). */
    const isDualLanguage = registrySaysDual;
    const gujaratiFileMissing = registrySaysDual && !hasGujaratiFile;

    const userSet = new Set<string>();
    for (const r of group) {
      for (const u of r.assignedUsers || []) {
        if (u) userSet.add(u);
      }
    }

    let assignedTrainer = 'Unassigned';
    for (const r of group) {
      if (r.assignedTrainer && r.assignedTrainer !== 'Unassigned') {
        assignedTrainer = r.assignedTrainer;
        break;
      }
    }

    const base = primaryRow || winner;
    const displayName =
      bestEnglish ||
      bestGujarati ||
      cleanSopName(String(base.sopName || winner.sopName || nk), nk);

    let mergedLocation = '';
    for (const r of [primaryRow, winner, base, ...group]) {
      const L = r && String(r.location || '').trim();
      if (L) {
        mergedLocation = L;
        break;
      }
    }

    const merged = applyRegistryPriorSplits(
      {
        ...base,
        _id: primaryRow?._id ?? winner._id,
        registryRowKind: (primaryRow ? 'primary' : winner.registryRowKind) as 'primary' | 'artifactsOnly',
        sopNo: nk,
        sopName: displayName,
        englishName: bestEnglish,
        gujaratiName: bestGujarati,
        sopDocuments: filterDocsToCurrentRevision(nk, mergedDocs),
        sopFile: winner.sopFile || primaryRow?.sopFile || base.sopFile,
        expiryDate: primaryRow?.expiryDate ?? winner.expiryDate ?? base.expiryDate,
        department: primaryRow?.department || winner.department || base.department,
        location: mergedLocation || null,
        version: parseRevisionFromSopIdentifier(nk) != null ? String(parseRevisionFromSopIdentifier(nk)) : winner.version,
        assignedTrainer,
        assignedUsers: userSet.size ? [...userSet] : base.assignedUsers || winner.assignedUsers,
        isDualLanguage,
        gujaratiFileMissing,
        englishVersion: group.some((r: any) => r.englishVersion),
        gujaratiVersion: group.some((r: any) => r.gujaratiVersion),
        language: isDualLanguage ? 'Both' : base.language || winner.language,
        mediaStatus: {
          videos: group.some((r: any) => r.mediaStatus?.videos),
          slides: group.some((r: any) => r.mediaStatus?.slides),
          videoCount: group.reduce((n, r) => Math.max(n, r.mediaStatus?.videoCount || 0), 0),
          slideCount: group.reduce((n, r) => Math.max(n, r.mediaStatus?.slideCount || 0), 0),
        },
        createdAt: primaryRow?.createdAt || winner.createdAt || base.createdAt,
        previousVersionsStatus: primaryRow?.previousVersionsStatus?.length
          ? primaryRow.previousVersionsStatus
          : winner.previousVersionsStatus || [],
      },
      finalEn,
      finalGj,
      nk,
    );

    out.push(merged);
  }

  return out;
}

function sopDocumentsFromVersionArtifacts(
  entries: VersionArtifactEntry[],
  lang: 'English' | 'Gujarati',
): { fileName: string; filePath: string; fileType: string; language: string }[] {
  const sorted = [...entries].sort((a, b) => b.version - a.version);
  const out: { fileName: string; filePath: string; fileType: string; language: string }[] = [];
  for (const e of sorted) {
    const pv = e.version;
    if (e.pdfPath?.trim()) {
      out.push({
        fileName: `V${pv} PDF`,
        filePath: e.pdfPath.trim(),
        fileType: 'pdf',
        language: lang,
      });
    }
    if (e.docxPath?.trim()) {
      out.push({
        fileName: `V${pv} DOCX`,
        filePath: e.docxPath.trim(),
        fileType: 'docx',
        language: lang,
      });
    }
  }
  return out;
}

/** SOPs that only exist in SOPVersionArtifacts (folder upload) never had a row in MERGED_DATA — surface them in the registry. */
/**
 * Registry “Prior versions” column: strictly older revisions than the current SOP No. revision (not the live file).
 * Identifiers without a numeric revision: all stored versions (newest first), capped by MAX_REGISTRY_PRIOR_VERSIONS.
 */
function priorVersionArtifactEntries(entries: VersionArtifactEntry[], sopNo: string): VersionArtifactEntry[] {
  /** FILLED-2022-style IDs: suffix is a year, not a revision — folder artifacts may still carry v2018/v2019; hide bogus “prior versions”. */
  const fk = sopFamilyKeyFromIdentifier(sopNo);
  const revHint = parseRevisionFromSopIdentifier(sopNo);
  if (!fk && revHint != null && revHint >= 1900 && revHint <= 2099) {
    return [];
  }

  const cur = parseRevisionFromSopIdentifier(sopNo);
  // Version 0: no prior versions can exist — return empty immediately
  if (cur === 0) return [];
  const cutoff = cur != null ? cur : null;
  let filtered =
    cutoff == null
      ? [...entries]
      : entries.filter((e) => {
          const n =
            typeof e.version === 'number' && !Number.isNaN(e.version) ? e.version : parseInt(String(e.version), 10);
          return Number.isFinite(n) && n < cutoff;
        });
  return filtered.sort((a, b) => b.version - a.version).slice(0, MAX_REGISTRY_PRIOR_VERSIONS);
}

/** Registry “Prior versions” column: newest two only; older slots → superseded section. */
function splitMainVersusSuperseded(entries: VersionArtifactEntry[]): {
  main: VersionArtifactEntry[];
  superseded: VersionArtifactEntry[];
} {
  const sorted = [...entries].sort((a, b) => b.version - a.version);
  return { main: sorted.slice(0, 2), superseded: sorted.slice(2) };
}

function applyRegistryPriorSplits(
  row: any,
  rawEn: VersionArtifactEntry[],
  rawGj: VersionArtifactEntry[],
  sopNo: string,
): any {
  const enF = priorVersionArtifactEntries(rawEn, sopNo);
  const gjF = priorVersionArtifactEntries(rawGj, sopNo);
  const enS = splitMainVersusSuperseded(enF);
  const gjS = splitMainVersusSuperseded(gjF);
  return {
    ...row,
    versionArtifacts: enS.main,
    versionArtifactsGujarati: gjS.main,
    versionArtifactsSuperseded: enS.superseded,
    versionArtifactsGujaratiSuperseded: gjS.superseded,
  };
}

function applySupersedeOverrides(
  rows: any[],
  overrides: Array<{
    sopNo: string;
    language: 'English' | 'Gujarati';
    version: number;
    docxPath?: string;
    pdfPath?: string;
  }>,
): any[] {
  if (!overrides.length) return rows;
  const keyOf = (sopNo: string, lang: 'English' | 'Gujarati', version: number) =>
    `${normalizeSopIdentifierKey(String(sopNo || '').toUpperCase())}::${lang}::${Number(version)}`;
  const moveSet = new Set(overrides.map((o) => keyOf(o.sopNo, o.language, o.version)));
  const overrideByKey = new Map(overrides.map((o) => [keyOf(o.sopNo, o.language, o.version), o]));

  return (rows || []).map((row: any) => {
    const sopNo = normalizeSopIdentifierKey(String(row.sopNo || '').toUpperCase());
    const enMain = Array.isArray(row.versionArtifacts) ? [...row.versionArtifacts] : [];
    const guMain = Array.isArray(row.versionArtifactsGujarati) ? [...row.versionArtifactsGujarati] : [];
    const enSup = Array.isArray(row.versionArtifactsSuperseded) ? [...row.versionArtifactsSuperseded] : [];
    const guSup = Array.isArray(row.versionArtifactsGujaratiSuperseded)
      ? [...row.versionArtifactsGujaratiSuperseded]
      : [];

    const moveFromMain = (main: any[], sup: any[], lang: 'English' | 'Gujarati') => {
      for (let i = main.length - 1; i >= 0; i--) {
        const v = Number(main[i]?.version);
        const k = keyOf(sopNo, lang, v);
        if (!moveSet.has(k)) continue;
        const existsInSup = sup.some((x: any) => Number(x.version) === v);
        if (!existsInSup) sup.push(main[i]);
        main.splice(i, 1);
      }
      for (const [k, ov] of overrideByKey) {
        if (!k.startsWith(`${sopNo}::${lang}::`)) continue;
        const v = Number(ov.version);
        const exists = sup.some((x: any) => Number(x.version) === v);
        if (!exists && (ov.docxPath || ov.pdfPath)) {
          sup.push({ version: v, docxPath: ov.docxPath, pdfPath: ov.pdfPath });
        }
      }
      sup.sort((a: any, b: any) => Number(b.version) - Number(a.version));
    };

    moveFromMain(enMain, enSup, 'English');
    moveFromMain(guMain, guSup, 'Gujarati');

    return {
      ...row,
      versionArtifacts: enMain,
      versionArtifactsGujarati: guMain,
      versionArtifactsSuperseded: enSup,
      versionArtifactsGujaratiSuperseded: guSup,
    };
  });
}

function mergeKeysOnlyInArtifacts(docs: any[], registryNormKeys: Set<string>): string[] {
  const keys = new Set<string>();
  for (const va of docs) {
    const mk = normalizeSopIdentifierKey(String(va.identifier || '').trim().toUpperCase());
    if (!mk || registryNormKeys.has(mk)) continue;
    const entries = va.entries || [];
    const hasFile = entries.some(
      (e: any) =>
        (e.docxPath && String(e.docxPath).trim()) || (e.pdfPath && String(e.pdfPath).trim()),
    );
    if (hasFile) keys.add(mk);
  }
  return [...keys];
}

export async function GET() {
  try {
    await connectDB();

    const allSOPs = await SOP.find({ $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }] })
      .select('_id name identifier department fileUrl fileType originalFileName folderPath location metadata reviewDate expiryDate version language content createdAt')
      .lean();

    // Fetch ALL SOP records including obsolete ones — used only for prior-version availability checks.
    // Older revisions are typically marked isObsolete:true but must still count as "available".
    const allSOPsIncludingObsolete = await SOP.find({})
      .select('_id identifier fileUrl fileType language sopDocuments')
      .lean();

    const masterSOPs = await MasterSOPRepository.find({})
      .select('sopIdentifier sopName englishName gujaratiName metadata.reviewDate metadata.expiryDate')
      .lean();

    const reviewDateByIdentifier = new Map<string, Date>();
    const reviewDateByFamily = new Map<string, { date: Date; rev: number }>();
    const masterNameByIdentifier = new Map<string, string>();
    const masterEngNameByIdentifier = new Map<string, string>();
    const masterGujNameByIdentifier = new Map<string, string>();

    masterSOPs.forEach((sop: any) => {
      const id = String(sop.sopIdentifier || sop.identifier || '').trim().toUpperCase();
      if (!id) return;
      const norm = normalizeSopIdentifierKey(id);
      const dateRaw = sop.metadata?.reviewDate || sop.metadata?.expiryDate;
      const mName = String(sop.sopName || '').trim();
      const mEng = String(sop.englishName || '').trim();
      const mGuj = String(sop.gujaratiName || '').trim();
      const dual = splitDualName(mName);

      if (dateRaw) {
        const dateDate = new Date(dateRaw);
        const fk = sopFamilyKeyFromIdentifier(id);
        const rev = parseRevisionFromSopIdentifier(id);
        for (const key of norm !== id ? [id, norm] : [id]) {
          reviewDateByIdentifier.set(key, dateDate);
          if (fk && rev != null) {
            const existing = reviewDateByFamily.get(fk);
            if (!existing || rev > existing.rev) {
              reviewDateByFamily.set(fk, { date: dateDate, rev });
            }
          }
        }
      }

      for (const key of norm !== id ? [id, norm] : [id]) {
        if (mName && !masterNameByIdentifier.has(key)) masterNameByIdentifier.set(key, mName);
        if (mEng && !masterEngNameByIdentifier.has(key)) masterEngNameByIdentifier.set(key, mEng);
        if (mGuj && !masterGujNameByIdentifier.has(key)) masterGujNameByIdentifier.set(key, mGuj);
        if (dual) {
          if (!masterEngNameByIdentifier.has(key)) masterEngNameByIdentifier.set(key, dual.eng);
          if (!masterGujNameByIdentifier.has(key)) masterGujNameByIdentifier.set(key, dual.guj);
        }
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 1000 * 60 * 60 * 24;

    const SOP_DATA = allSOPs.map((sop: any) => {
      const identifier = (sop.identifier || '').trim().toUpperCase();
      const subcategoryCode = extractSubcategoryFromIdentifier(sop.identifier);
      const department = getDepartmentForSubcategory(subcategoryCode);

      let reviewDate: Date | null = null;
      if (identifier && reviewDateByIdentifier.has(identifier)) {
        reviewDate = reviewDateByIdentifier.get(identifier)!;
      } else if (identifier) {
        const fk = sopFamilyKeyFromIdentifier(identifier);
        if (fk && reviewDateByFamily.has(fk)) {
          reviewDate = reviewDateByFamily.get(fk)!.date;
        }
      }
      
      if (!reviewDate && sop.reviewDate) {
        reviewDate = new Date(sop.reviewDate);
      } else if (sop.expiryDate) {
        reviewDate = new Date(sop.expiryDate);
      }

      const expiryDateIso = reviewDate ? reviewDate.toISOString() : null;
      let expired = false;
      let nearExpiry = false;
      if (reviewDate) {
        const diffDays = (reviewDate.getTime() - today.getTime()) / dayMs;
        expired = diffDays < 0;
        nearExpiry = diffDays >= 0 && diffDays <= 90;
      }

      const nameStr = sop.name || '';
      const contentStr = sop.content || '';
      const originalNameStr = sop.originalFileName || '';
      const urlStr = sop.fileUrl || '';
      const folderStr = sop.folderPath || '';

      const countMatches = (re: RegExp, s: string) => {
        if (!s) return 0;
        const m = s.match(re);
        return m ? m.length : 0;
      };

      const gujCountName = countMatches(/[\u0A80-\u0AFF]/g, nameStr);
      const gujCountContent = countMatches(/[\u0A80-\u0AFF]/g, contentStr);
      const latinCountContent = countMatches(/[A-Za-z]/g, contentStr);

      const contentLooksGujarati =
        gujCountContent >= 40 ||
        (gujCountContent >= 20 && gujCountContent >= Math.max(8, Math.floor(latinCountContent * 0.4)));

      const nameLooksGujarati = gujCountName >= 4;
      const hasGujaratiInFileHints =
        /[\u0A80-\u0AFF]/.test(originalNameStr) ||
        /(^|[\/\\\s_-])guj([\/\\\s_-]|$)/i.test(urlStr) ||
        /gujarati/i.test(urlStr) ||
        /(^|[\/\\\s_-])guj([\/\\\s_-]|$)/i.test(folderStr) ||
        /gujarati/i.test(folderStr);

      const hasContent = contentStr.trim().length > 0;
      const effectiveLanguage: 'English' | 'Gujarati' = hasContent
        ? (contentLooksGujarati ? 'Gujarati' : 'English')
        : (nameLooksGujarati || hasGujaratiInFileHints || sop.language === 'Gujarati' ? 'Gujarati' : 'English');

      return {
        _id: sop._id,
        sopNo: sop.identifier,
        sopName: sop.name,
        originalFileName: sop.originalFileName,
        department: normalizeDeptForDisplay(department),
        version: sop.version || '1',
        language: effectiveLanguage,
        expiryDate: expiryDateIso,
        _expired: expired,
        _nearExpiry: nearExpiry,
        createdAt: sop.createdAt,
        location: String(sop.location || '').trim(),
        sopFile: sop.fileUrl
          ? {
              fileName: sop.originalFileName || sop.fileUrl?.split('/').pop() || sop.name || 'SOP Document',
              filePath: sop.fileUrl,
              fileType: (sop.fileType || 'docx').toLowerCase(),
              fileSize: sop.metadata?.fileSize || 0,
              language: effectiveLanguage,
            }
          : null,
      };
    });

    // ── FILTER: exclude pure-annexure SOP records from registry rows (they may still inform library lookups above) ──
    const SOP_DATA_FILTERED = SOP_DATA.filter((row: any) => {
      const id = String(row.sopNo || '').trim();
      const name = String(row.sopName || '').trim();
      // Only exclude if the SOP record itself looks like a standalone annexure
      // (annexure files within library docs are fine — those don't go through here)
      return !/^annexure$/i.test(name) && !/\bannexure\b/i.test(id);
    });

    // ── DEDUP: one row per (identifier, language) ──
    function isPathLikeName(name: string): boolean {
      if (!name || typeof name !== 'string') return false;
      const n = name.trim();
      if (n.length > 120) return true;
      if (/Word files only/i.test(n) || /^[\d.]+\s*[\/\\]/.test(n)) return true;
      if ((n.match(/[\/\\]/g) || []).length >= 2) return true;
      return false;
    }

    const byKey = new Map<string, (typeof SOP_DATA)[number]>();
    SOP_DATA_FILTERED.forEach((row: any) => {
      const idNorm = normalizeSopIdentifierKey((row.sopNo || '').trim().toUpperCase());
      const key = `${idNorm}::${row.language || 'English'}`;
      const existing = byKey.get(key);
      if (!existing) { byKey.set(key, row); return; }
      const existingPathLike = isPathLikeName(existing.sopName);
      const currentPathLike = isPathLikeName(row.sopName);
      if (currentPathLike && !existingPathLike) return;
      if (!currentPathLike && existingPathLike) { byKey.set(key, row); return; }
      if (new Date(row.createdAt || 0).getTime() > new Date(existing.createdAt || 0).getTime()) byKey.set(key, row);
    });
    const SOP_DATA_DEDUPED = Array.from(byKey.values());

    // ── MERGE DUAL-LANGUAGE: one row per logical identifier (QAQC01-11 + QAQC1-11 → one row) ──
    const mergedMap = new Map<string, any>();
    SOP_DATA_DEDUPED.forEach((row: any) => {
      const rawId = (row.sopNo || '').trim().toUpperCase();
      const mergeKey = normalizeSopIdentifierKey(rawId);
      const lang = row.language || 'English';

      if (!mergedMap.has(mergeKey)) {
        mergedMap.set(mergeKey, {
          ...row,
          sopNo: mergeKey,
          _engRow: lang === 'English' ? row : null,
          _gujRow: lang === 'Gujarati' ? row : null,
        });
      } else {
        const existing = mergedMap.get(mergeKey)!;
        if (lang === 'English') {
          existing._engRow = row;
          if (isPathLikeName(existing.sopName)) {
            existing.sopName = row.sopName;
            existing._id = row._id;
          }
          if (row.sopFile) existing.sopFile = row.sopFile;
        } else {
          existing._gujRow = existing._gujRow || row;
        }
        if (!existing.expiryDate && row.expiryDate) {
          existing.expiryDate = row.expiryDate;
          existing._expired = row._expired;
          existing._nearExpiry = row._nearExpiry;
        }
        if (!existing.sopFile && row.sopFile) existing.sopFile = row.sopFile;
        const loc = String(row.location || '').trim();
        if (loc && !String(existing.location || '').trim()) existing.location = loc;
      }
    });

    const MERGED_DATA = Array.from(mergedMap.values()).map((row: any) => {
      const hasEng = !!row._engRow;
      const hasGuj = !!row._gujRow;
      const isDualLanguage = hasEng && hasGuj;

      const engRawName = hasEng ? (row._engRow.sopName || row._engRow.originalFileName || '') : '';
      const gujRawName = hasGuj ? (row._gujRow.sopName || row._gujRow.originalFileName || '') : '';
      const gujOriginalFileName = hasGuj ? (row._gujRow.originalFileName || '') : '';

      const engSopFile = hasEng ? row._engRow.sopFile : null;
      const gujSopFile = hasGuj ? row._gujRow.sopFile : null;
      const primaryFile = engSopFile || row.sopFile;

      const extraFile = isDualLanguage && gujSopFile &&
        gujSopFile.filePath !== primaryFile?.filePath
        ? { ...gujSopFile, language: 'Gujarati' } : null;

      const mergedLoc =
        String(row._engRow?.location || '').trim() ||
        String(row._gujRow?.location || '').trim() ||
        String(row.location || '').trim();

      return {
        _id: row._id,
        sopNo: row.sopNo,
        sopName: row.sopName,
        _engRawName: engRawName,
        _gujRawName: gujRawName,
        _gujOriginalFileName: gujOriginalFileName,
        originalFileName: row.originalFileName,
        department: row.department,
        version: row.version,
        language: isDualLanguage ? 'Both' : (hasGuj ? 'Gujarati' : 'English'),
        isDualLanguage,
        expiryDate: row.expiryDate,
        _expired: row._expired,
        _nearExpiry: row._nearExpiry,
        createdAt: row.createdAt,
        location: mergedLoc,
        sopFile: primaryFile,
        _engSopFile: engSopFile,
        _extraSopFile: extraFile,
      };
    });

    // ── COUNTS ──
    const totalSOPs = MERGED_DATA.length;
    const deptCounts: Record<string, number> = {};
    MERGED_DATA.forEach((row: any) => {
      const d = row.department || 'Other';
      deptCounts[d] = (deptCounts[d] || 0) + 1;
    });
    const withExpiry = MERGED_DATA.filter((r: any) => r.expiryDate).length;
    const expiredCount = MERGED_DATA.filter((r: any) => r._expired).length;
    const nearExpiryCount = MERGED_DATA.filter((r: any) => r._nearExpiry).length;

    // ── ENRICH ──
    const allUsers = await User.find({}).lean();
    const departmentToTrainersMap = new Map<string, Set<string>>();
    allUsers.forEach((user: any) => {
      const isTrainer = user.role === 'trainer' || user.isTrainerEligible === true;
      if (!isTrainer) return;
      const deptList = user.allowedDepartments?.length ? user.allowedDepartments : user.department ? [user.department] : [];
      deptList.forEach((rawDept: string) => {
        const dept = normalizeDeptForDisplay(rawDept);
        if (!departmentToTrainersMap.has(dept)) departmentToTrainersMap.set(dept, new Set());
        departmentToTrainersMap.get(dept)!.add(user.name);
      });
    });

    const trainingMatrixEntries = await TrainingMatrix.find({
      trainerName: { $exists: true, $nin: [null, ''] },
    }).select('sopIdentifier department trainerName').lean();
    const sopToTrainersMap = new Map<string, Set<string>>();
    trainingMatrixEntries.forEach((entry: any) => {
      if (!entry.sopIdentifier || !entry.trainerName) return;
      const code = normalizeSopIdentifierKey(entry.sopIdentifier.trim().toUpperCase());
      if (!sopToTrainersMap.has(code)) sopToTrainersMap.set(code, new Set());
      sopToTrainersMap.get(code)!.add(entry.trainerName);
    });

    const matrixEntries = await MatrixEntry.find({}).select('sopCode employeeName').lean();
    const sopToUsersMap = new Map<string, Set<string>>();
    matrixEntries.forEach((entry: any) => {
      if (entry.sopCode && entry.employeeName) {
        const code = normalizeSopIdentifierKey(entry.sopCode.trim().toUpperCase());
        if (!sopToUsersMap.has(code)) sopToUsersMap.set(code, new Set());
        sopToUsersMap.get(code)!.add(entry.employeeName);
      }
    });

    const fallbackTrainerMap: Record<string, string[]> = {
      QA: ['Abhishek Dave'],
      QC: ['Jayesh Aal'],
      Microbiology: ['Ulhas Mahajan'],
      Store: ['Sanjay Chauhan'],
      Production: ['Darshan Parmar', 'Nirav Morasiya'],
      Personnel: ['Jignesh Trivedi'],
      'Engineering and Maintenance': ['Devang Rathod'],
    };

    /** Do not exclude sopName matching "annexure": QA bulk paths often include Annexure in the title, which
     *  removed the whole library row from this query — Files showed PDF only (SOP fileUrl / artifacts) with no DOCX. */
    const sopLibraries = await SOPLibrary.find({
      sopIdentifier: { $regex: /^[A-Z]{1,6}\d{1,4}[-_]\d{1,3}$/i },
    }).select('sopIdentifier sopName sopDocuments slides videos completionStatus language location').lean();

    const libByIdentifier = new Map<string, any[]>();
    const libNameByIdentifier = new Map<string, string>();
    /** First non-empty library title per identifier, split by row language (avoid using English title for Gujarati names). */
    const libEngNameByIdentifier = new Map<string, string>();
    const libGujNameByIdentifier = new Map<string, string>();
    const locationByIdentifier = new Map<string, string>();
    sopLibraries.forEach((lib: any) => {
      const id = (lib.sopIdentifier || '').trim().toUpperCase();
      const idNorm = normalizeSopIdentifierKey(id);
      const loc = String(lib.location || '').trim();
      const rawLibLang = String(lib.language || '').trim().toLowerCase();
      const isGujLib =
        rawLibLang === 'gujarati' ||
        (rawLibLang === '' && /[\u0A80-\u0AFF]/.test(String(lib.sopName || '')));
      const langNameMap = isGujLib ? libGujNameByIdentifier : libEngNameByIdentifier;
      const dual = splitDualName(String(lib.sopName || ''));

      // Use all identifier variants so prior-version lookups never miss due to padding differences
      const allKeys = [...new Set([id, idNorm, ...expandSopIdentifierVariants(id)])];
      for (const key of allKeys) {
        if (!libByIdentifier.has(key)) libByIdentifier.set(key, []);
        libByIdentifier.get(key)!.push(lib);
        const sn = String(lib.sopName || '').trim();
        if (sn && !libNameByIdentifier.has(key)) libNameByIdentifier.set(key, sn);
        
        if (dual) {
          if (!libEngNameByIdentifier.has(key)) libEngNameByIdentifier.set(key, dual.eng);
          if (!libGujNameByIdentifier.has(key)) libGujNameByIdentifier.set(key, dual.guj);
        } else {
          if (sn && !langNameMap.has(key)) langNameMap.set(key, sn);
        }
        if (loc && !locationByIdentifier.has(key)) locationByIdentifier.set(key, loc);
      }
    });
    allSOPs.forEach((sop: any) => {
      const loc = String(sop.location || '').trim();
      if (!loc) return;
      const id = (sop.identifier || '').trim().toUpperCase();
      const idNorm = normalizeSopIdentifierKey(id);
      for (const key of idNorm !== id ? [id, idNorm] : [id]) {
        if (!locationByIdentifier.has(key)) locationByIdentifier.set(key, loc);
      }
    });
    // Use the full set (including obsolete) so prior versions aren't falsely marked missing.
    const allSopIdentifiers = new Set(allSOPsIncludingObsolete.map((s: any) => (s.identifier || '').trim().toUpperCase()));
    const allSopIdentifiersNorm = new Set(
      allSOPsIncludingObsolete.map((s: any) => normalizeSopIdentifierKey((s.identifier || '').trim().toUpperCase())),
    );

    /**
     * Prior-version SOP file map: normKey → [{version, docxPath?, pdfPath?, lang}]
     * Built from all SOP records so the "Prior Versions" column and version capsule
     * can surface files that were uploaded for older revisions but are no longer
     * the "current" version.  This supplements SOPVersionArtifacts folder-uploads.
     */
    const priorSopFilesByNormKey = new Map<string, { version: number; docxPath?: string; pdfPath?: string; lang: 'English' | 'Gujarati' }[]>();
    for (const sop of allSOPsIncludingObsolete as any[]) {
      const sopId = (sop.identifier || '').trim().toUpperCase();
      const rev = parseRevisionFromSopIdentifier(sopId);
      if (rev == null) continue;
      const familyKey = sopFamilyKeyFromIdentifier(sopId);
      if (!familyKey) continue;
      const lang = String(sop.language || '').toLowerCase() === 'gujarati' ? 'Gujarati' : 'English';
      const docs = [...(sop.fileUrl ? [{ filePath: sop.fileUrl, fileType: 'pdf', language: sop.language }] : []), ...(sop.sopDocuments || [])];
      let docxPath: string | undefined;
      let pdfPath: string | undefined;
      for (const d of docs) {
        const p = (d.filePath || d.fileUrl || '').trim();
        if (!p) continue;
        const k = fileKindFromStoredPath(p, d.fileType);
        if ((k === 'docx' || k === 'doc') && !docxPath) docxPath = p;
        else if (k === 'pdf' && !pdfPath) pdfPath = p;
      }
      if (!docxPath && !pdfPath) continue;
      const mapKey = `${familyKey}::${lang}`;
      if (!priorSopFilesByNormKey.has(mapKey)) priorSopFilesByNormKey.set(mapKey, []);
      priorSopFilesByNormKey.get(mapKey)!.push({ version: rev, docxPath, pdfPath, lang });
    }

    const versionArtifactsDocs = await SOPVersionArtifacts.find({})
      .select('identifier language entries sopName department updatedAt')
      .lean();
    const versionArtifactsByKey = new Map<string, VersionArtifactEntry[]>();
    const versionArtifactNameByKey = new Map<string, string>();
    for (const va of versionArtifactsDocs as any[]) {
      const id = (va.identifier || '').trim().toUpperCase();
      const lang = String(va.language || '').toLowerCase() === 'gujarati' ? 'Gujarati' : 'English';
      const sorted = [...(va.entries || [])].sort((a: any, b: any) => b.version - a.version);
      const key = `${versionArtifactsLookupKey(va.identifier || id)}::${lang}`;
      const prev = versionArtifactsByKey.get(key);
      versionArtifactsByKey.set(key, prev ? mergeVersionArtifactEntries(prev, sorted) : sorted);
      const sn = va.sopName ? String(va.sopName).trim() : '';
      if (sn.length >= 2) {
        const prevN = versionArtifactNameByKey.get(key);
        if (!prevN || sn.length > prevN.length) versionArtifactNameByKey.set(key, sn);
      }
    }

    /** Merge all Mongo artifact docs in the same SOP family (…-10 + …-11) per language for registry + prior column */
    const artifactsMergedByFamilyLang = new Map<string, VersionArtifactEntry[]>();
    for (const va of versionArtifactsDocs as any[]) {
      const fk = sopFamilyKeyFromIdentifier(String(va.identifier || ''));
      if (!fk) continue;
      const lang = String(va.language || '').toLowerCase() === 'gujarati' ? 'Gujarati' : 'English';
      const sorted = [...(va.entries || [])].sort((a: any, b: any) => b.version - a.version);
      const k = `${fk}::${lang}`;
      artifactsMergedByFamilyLang.set(
        k,
        mergeVersionArtifactEntries(artifactsMergedByFamilyLang.get(k) || [], sorted),
      );
    }

    let data: any[] = MERGED_DATA.map((row: any) => {
      const idUpper = (row.sopNo || '').trim().toUpperCase();
      const matchBase = idUpper.match(/^(.*?)-\d+$/);
      const baseCode = matchBase ? matchBase[1].trim() : idUpper;

      const seenLibId = new Set<string>();
      const libs: any[] = [];
      for (const vid of expandSopIdentifierVariants(idUpper)) {
        for (const l of libByIdentifier.get(vid) || []) {
          const lid = String((l as any)._id ?? `${(l as any).sopIdentifier}-${(l as any).language ?? ''}`);
          if (seenLibId.has(lid)) continue;
          seenLibId.add(lid);
          libs.push(l);
        }
      }
      const rawVideoCount = libs.reduce((n: number, l: any) => n + (Array.isArray(l.videos) ? l.videos.length : 0), 0);
      const rawSlideCount = libs.reduce((n: number, l: any) => n + (Array.isArray(l.slides) ? l.slides.length : 0), 0);
      const flagVideos = libs.some((l: any) => l.completionStatus?.hasVideos);
      const flagSlides = libs.some((l: any) => l.completionStatus?.hasSlides);
      const hasVideos = rawVideoCount > 0 || flagVideos;
      const hasSlides = rawSlideCount > 0 || flagSlides;
      const videoCount = rawVideoCount > 0 ? rawVideoCount : flagVideos ? 1 : 0;
      const slideCount = rawSlideCount > 0 ? rawSlideCount : flagSlides ? 1 : 0;
      const sopDocuments = libs.flatMap((l: any) =>
        (l.sopDocuments || []).map((doc: any) => ({
          ...doc,
          language: doc.language || l.language || 'English',
        }))
      );

      // Add English SOP file if not already in library docs
      if (row._engSopFile?.filePath && !sopDocuments.some((d: any) => d.filePath === row._engSopFile.filePath)) {
        sopDocuments.push({ ...row._engSopFile });
      }

      // Gujarati SOP file from SOP collection is the actual uploaded file — it overrides
      // library Gujarati docs of the same type (library may have wrong file paths)
      if (row._extraSopFile?.filePath) {
        const extraType = (row._extraSopFile.fileType || 'docx').toLowerCase();
        for (let i = sopDocuments.length - 1; i >= 0; i--) {
          const d = sopDocuments[i];
          if (d.language === 'Gujarati' && (d.fileType || 'docx').toLowerCase() === extraType && d.filePath !== row._extraSopFile.filePath) {
            sopDocuments.splice(i, 1);
          }
        }
        if (!sopDocuments.some((d: any) => d.filePath === row._extraSopFile.filePath)) {
          sopDocuments.push(row._extraSopFile);
        }
      }

      const rawEnFull = versionArtifactsForRow(idUpper, 'English', versionArtifactsByKey, artifactsMergedByFamilyLang);
      const rawGjFull = versionArtifactsForRow(idUpper, 'Gujarati', versionArtifactsByKey, artifactsMergedByFamilyLang);
      const currentRevision = parseRevisionFromSopIdentifier(idUpper);

      // Supplement rawEnFull / rawGjFull with prior-version SOP records from the SOP collection.
      // This surfaces files for older revisions that were never uploaded via folder-upload.
      const familyKey = sopFamilyKeyFromIdentifier(idUpper);
      if (familyKey && currentRevision != null) {
        for (const [lang, arr] of [['English', rawEnFull], ['Gujarati', rawGjFull]] as ['English' | 'Gujarati', VersionArtifactEntry[]][]) {
          const priorEntries = priorSopFilesByNormKey.get(`${familyKey}::${lang}`) || [];
          for (const pe of priorEntries) {
            // Only add versions strictly less than current (these are genuinely prior versions)
            if (pe.version >= currentRevision) continue;
            // Only add if not already present from SOPVersionArtifacts
            if (!arr.some((e) => e.version === pe.version)) {
              arr.push({ version: pe.version, docxPath: pe.docxPath, pdfPath: pe.pdfPath });
            }
          }
        }
      }
      appendLatestArtifactWordIfMissing(sopDocuments, rawEnFull, 'English', currentRevision);
      appendLatestArtifactWordIfMissing(sopDocuments, rawGjFull, 'Gujarati', currentRevision);
      appendLatestArtifactPdfIfMissing(sopDocuments, rawEnFull, 'English', currentRevision);
      appendLatestArtifactPdfIfMissing(sopDocuments, rawGjFull, 'Gujarati', currentRevision);
      const currentRevisionDocs = filterDocsToCurrentRevision(idUpper, sopDocuments);

      // Dual-language in DB = two SOP records (ENG + GUJ). That does NOT guarantee a separate Gujarati file.
      const englishPathKeys = new Set<string>();
      currentRevisionDocs.forEach((d: any) => {
        if (d.filePath && d.language !== 'Gujarati') englishPathKeys.add(normPathKey(d.filePath));
      });
      const hasGujaratiFile = currentRevisionDocs.some(
        (d: any) =>
          d.language === 'Gujarati' &&
          d.filePath &&
          !englishPathKeys.has(normPathKey(d.filePath)),
      );

      const registrySaysDual = row.isDualLanguage === true;
      /** Dual follows merged SOP rows (ENG + GUJ in Mongo). Separate Gujarati file link is informational only. */
      const isDualLanguage = registrySaysDual;
      const gujaratiFileMissing = registrySaysDual && !hasGujaratiFile;

      const displayLanguage = isDualLanguage
        ? 'Both'
        : row._gujRow && !row._engRow
          ? 'Gujarati'
          : 'English';
      const hasEnglishDocs =
        currentRevisionDocs.some((d: any) => (d.language || 'English') !== 'Gujarati') ||
        rawEnFull.length > 0 ||
        Boolean(row._engRow);
      const hasGujaratiDocs =
        currentRevisionDocs.some((d: any) => d.language === 'Gujarati') ||
        rawGjFull.length > 0 ||
        Boolean(row._gujRow);

      let resolvedLocation = String(row.location || '').trim();
      if (!resolvedLocation) {
        for (const vid of expandSopIdentifierVariants(idUpper)) {
          const L = locationByIdentifier.get(vid);
          if (L) {
            resolvedLocation = L;
            break;
          }
        }
      }

      const rawEngFileName = fileNameDisplay(row.originalFileName || row._engRawName || '');
      const rawGujFileName = row._gujRawName ? fileNameDisplay(row._gujRawName) : null;

      const artifactFolderName =
        versionArtifactNameByKey.get(`${versionArtifactsLookupKey(idUpper)}::English`) ||
        versionArtifactNameByKey.get(`${versionArtifactsLookupKey(idUpper)}::Gujarati`);

      const engLibTitle =
        libEngNameByIdentifier.get(idUpper) || libNameByIdentifier.get(idUpper);
      const engNameCleaned = pickBestName(
        row._engRawName || '', idUpper,
        engLibTitle,
        masterNameByIdentifier.get(idUpper),
        row.originalFileName,
        artifactFolderName,
        'English'
      );
      const gujNameCleaned = row._gujRawName
        ? pickBestName(
            row._gujRawName,
            idUpper,
            libGujNameByIdentifier.get(idUpper),
            undefined,
            row._gujOriginalFileName,
            versionArtifactNameByKey.get(`${versionArtifactsLookupKey(idUpper)}::Gujarati`),
            'Gujarati'
          )
        : null;

      // Use the best cleaned name from authoritative sources; raw filename is last resort only
      const engName =
        engNameCleaned && engNameCleaned.length > 3 && !looksLikeSopCodeFilename(engNameCleaned)
          ? engNameCleaned
          : rawEngFileName && rawEngFileName.length > 3 && !looksLikeSopCodeFilename(rawEngFileName)
            ? rawEngFileName
            : engNameCleaned;
      const gujName =
        gujNameCleaned && gujNameCleaned.length > 3 && !looksLikeSopCodeFilename(gujNameCleaned)
          ? gujNameCleaned
          : rawGujFileName && rawGujFileName.length > 3 && !looksLikeSopCodeFilename(rawGujFileName)
            ? rawGujFileName
            : gujNameCleaned;

      let engTitle = engName ? cleanSopName(engName, idUpper) : '';
      let gujTitle = gujName ? cleanSopName(gujName, idUpper) : '';

      const isGujOnly = (s: string) => /[\u0A80-\u0AFF]/.test(s) && !/[A-Za-z]{3,}/.test(s);

      // Dual-language rows: fill from library / master / artifacts (try identifier variants — DB may use MAGE02-06 vs MAGE2-6)
      if (row.isDualLanguage === true) {
        if (!englishTitleIsUsableForRegistry(engTitle, idUpper)) {
          const resolved = resolveDualEnglishTitleFromStores(
            idUpper,
            libEngNameByIdentifier,
            libNameByIdentifier,
            masterNameByIdentifier,
            masterEngNameByIdentifier,
            versionArtifactNameByKey,
          );
          if (resolved) engTitle = resolved;
        }
        if (!gujTitle || gujTitle.length < 2) {
          const resolved = resolveGujaratiTitleFromStores(
            idUpper,
            libGujNameByIdentifier,
            libNameByIdentifier,
            masterGujNameByIdentifier,
            versionArtifactNameByKey,
          );
          if (resolved) gujTitle = resolved;
        }
      }

      // If engTitle mistakenly contains only Gujarati characters
      if (isGujOnly(engTitle)) {
        if (!gujTitle) gujTitle = engTitle;
        engTitle = '';
      }

      const splitEng = splitDualName(engTitle);
      if (splitEng) {
        engTitle = splitEng.eng;
        if (!gujTitle || registryDisplayTitleKey(gujTitle) === registryDisplayTitleKey(idUpper)) {
          gujTitle = splitEng.guj;
        }
      } else {
        const splitGuj = splitDualName(gujTitle);
        if (splitGuj) {
          gujTitle = splitGuj.guj;
          if (!engTitle || registryDisplayTitleKey(engTitle) === registryDisplayTitleKey(idUpper)) {
            engTitle = splitGuj.eng;
          }
        }
      }

      // GUJ-as-ENG correction clears engTitle; splitDualName may not extract English — re-resolve from library/artifacts
      if (row.isDualLanguage === true && !englishTitleIsUsableForRegistry(engTitle, idUpper)) {
        const resolved = resolveDualEnglishTitleFromStores(
          idUpper,
          libEngNameByIdentifier,
          libNameByIdentifier,
          masterNameByIdentifier,
          masterEngNameByIdentifier,
          versionArtifactNameByKey,
        );
        if (resolved) engTitle = resolved;
      }

      // English files exist in Files column but sopName was never stored — parse title from DOCX/PDF path or fileName
      if (!englishTitleIsUsableForRegistry(engTitle, idUpper)) {
        const fromPath = resolveEnglishTitleFromArtifactAndDocPaths(idUpper, rawEnFull, sopDocuments);
        if (fromPath) engTitle = fromPath;
      }

      /** Omit Gujarati subtitle when it duplicates English (bad filename / missing GUJ library title). Keep if script differs. */
      const gujTitleDistinct =
        gujTitle &&
        (!engTitle ||
          registryDisplayTitleKey(gujTitle) !== registryDisplayTitleKey(engTitle) ||
          /[\u0A80-\u0AFF]/.test(gujTitle))
          ? gujTitle
          : '';

      // For English-only SOPs (no separate Gujarati row): never show Gujarati-script text as the display name.
      // The Gujarati text in gujTitle/gujTitleDistinct came from the English row's name field containing Gujarati
      // characters (e.g. SOP was uploaded with Gujarati text stored as the name). Show identifier instead.
      const isEnglishOnlySop = row.language === 'English'; // no Gujarati row in Mongo
      const displayName =
        englishTitleIsUsableForRegistry(engTitle, idUpper)
          ? engTitle
          : !isEnglishOnlySop && gujTitleDistinct && gujTitleDistinct.length > 2 && registryDisplayTitleKey(gujTitleDistinct) !== registryDisplayTitleKey(idUpper)
            ? gujTitleDistinct
            : engTitle || (!isEnglishOnlySop ? gujTitleDistinct || gujTitle : null) || idUpper;

      const gujaratiNameResolved =
        gujTitleDistinct &&
        gujTitleDistinct.length > 2 &&
        registryDisplayTitleKey(gujTitleDistinct) !== registryDisplayTitleKey(idUpper)
          ? gujTitleDistinct
          : resolveGujaratiTitleFromStores(
              idUpper,
              libGujNameByIdentifier,
              libNameByIdentifier,
              masterGujNameByIdentifier,
              versionArtifactNameByKey,
            );

      // Last fallback for dual rows: use Gujarati SOP row title if it contains Gujarati script.
      const gujaratiNameFromDualRow =
        row.isDualLanguage === true &&
        row._gujRawName &&
        /[\u0A80-\u0AFF]/.test(String(row._gujRawName))
          ? cleanSopName(String(row._gujRawName), idUpper)
          : null;

      let assignedTrainer = 'Unassigned';
      const dept = row.department;
      if (sopToTrainersMap.has(idUpper) && sopToTrainersMap.get(idUpper)!.size > 0) {
        assignedTrainer = Array.from(sopToTrainersMap.get(idUpper)!).join(', ');
      } else if (departmentToTrainersMap.has(dept) && departmentToTrainersMap.get(dept)!.size > 0) {
        assignedTrainer = Array.from(departmentToTrainersMap.get(dept)!).join(', ');
      } else if (fallbackTrainerMap[dept]) {
        assignedTrainer = fallbackTrainerMap[dept].join(', ');
      }

      let assignedUsers: string[] = [];
      if (sopToUsersMap.has(idUpper) && sopToUsersMap.get(idUpper)!.size > 0) {
        assignedUsers = Array.from(sopToUsersMap.get(idUpper)!);
      } else if (matchBase && sopToUsersMap.has(baseCode) && sopToUsersMap.get(baseCode)!.size > 0) {
        assignedUsers = Array.from(sopToUsersMap.get(baseCode)!);
      }

      /** Build previousVersionsStatus: only for SOPs with currentVer >= 1.
       *  Version 0 has no prior versions → leave array empty (classifySopVersionCapsule handles grey).
       *  Version 1 → 1 slot (V0 only).
       *  Version >= 2 → 2 slots (V(n-1), V(n-2)).
       */
      const previousVersionsStatus: { version: number; available: boolean }[] = [];
      const verMatch = idUpper.match(/^(.*?)-(\d+)$/);
      if (verMatch && sopFamilyKeyFromIdentifier(idUpper)) {
        const base = verMatch[1];
        const currentVer = parseInt(verMatch[2], 10);
        // Version 0: no prior versions possible — skip entirely
        if (currentVer >= 1) {
          const slotsToCheck = Math.min(2, currentVer); // 1 slot for V1, 2 slots for V2+
          for (let i = 1; i <= slotsToCheck; i++) {
            const prev = currentVer - i;
            const prevId = `${base}-${prev}`;
            const prevIdPadded = `${base}-${String(prev).padStart(2, '0')}`;
            const prevN = normalizeSopIdentifierKey(prevId);
            const prevPN = normalizeSopIdentifierKey(prevIdPadded);
            // Check prior-SOP-file map (from SOP collection itself — older revision records)
            const familyKeyForPrev = sopFamilyKeyFromIdentifier(idUpper);
            const hasPriorSopFile = familyKeyForPrev
              ? (!!(priorSopFilesByNormKey.get(`${familyKeyForPrev}::English`)?.some((e) => e.version === prev)) ||
                 !!(priorSopFilesByNormKey.get(`${familyKeyForPrev}::Gujarati`)?.some((e) => e.version === prev)))
              : false;
            // Check all variant spellings of the prev identifier to avoid missed lookups due to padding
            const prevVariants = expandSopIdentifierVariants(prevId);
            const prevVariantInSopIds = prevVariants.some((v) => allSopIdentifiers.has(v) || allSopIdentifiersNorm.has(normalizeSopIdentifierKey(v)));
            const prevVariantInLib = prevVariants.some((v) => libByIdentifier.has(v) || libByIdentifier.has(normalizeSopIdentifierKey(v)));
            const available =
              allSopIdentifiers.has(prevId) ||
              allSopIdentifiers.has(prevIdPadded) ||
              allSopIdentifiersNorm.has(prevN) ||
              allSopIdentifiersNorm.has(prevPN) ||
              prevVariantInSopIds ||
              libByIdentifier.has(prevId) ||
              libByIdentifier.has(prevIdPadded) ||
              libByIdentifier.has(prevN) ||
              libByIdentifier.has(prevPN) ||
              prevVariantInLib ||
              // Also check version artifacts — prior version files uploaded via folder upload count as available
              rawEnFull.some((e) => e.version === prev) ||
              rawGjFull.some((e) => e.version === prev) ||
              // Check prior SOP records from SOP collection (older revisions stored as separate SOP records)
              hasPriorSopFile;
            previousVersionsStatus.push({ version: prev, available });
          }
        }
      }

      return {
        _id: row._id,
        sopNo: row.sopNo,
        sopName: displayName,
        englishName: englishTitleIsUsableForRegistry(engTitle, idUpper)
          ? engTitle
          : resolveDualEnglishTitleFromStores(
              idUpper,
              libEngNameByIdentifier,
              libNameByIdentifier,
              masterNameByIdentifier,
              masterEngNameByIdentifier,
              versionArtifactNameByKey,
            ),
        gujaratiName: gujaratiNameResolved || gujaratiNameFromDualRow,
        location: resolvedLocation || null,
        isDualLanguage,
        /** True when Mongo has ENG+GUJ rows but no separate Gujarati file path (same URL or only English paths) */
        gujaratiFileMissing,
        department: row.department || 'Other',
        version: row.version,
        language: displayLanguage,
        englishVersion: hasEnglishDocs,
        gujaratiVersion: hasGujaratiDocs,
        assignedTrainer,
        assignedUsers,
        mediaStatus: {
          videos: hasVideos,
          slides: hasSlides,
          videoCount,
          slideCount,
        },
        expiryDate: row.expiryDate,
        sopDocuments: currentRevisionDocs,
        sopFile: row.sopFile,
        previousVersionsStatus,
        ...(() => {
          const enF = priorVersionArtifactEntries(rawEnFull, row.sopNo);
          const gjF = priorVersionArtifactEntries(rawGjFull, row.sopNo);
          const enS = splitMainVersusSuperseded(enF);
          const gjS = splitMainVersusSuperseded(gjF);
          return {
            versionArtifacts: enS.main,
            versionArtifactsGujarati: gjS.main,
            versionArtifactsSuperseded: enS.superseded,
            versionArtifactsGujaratiSuperseded: gjS.superseded,
          };
        })(),
        createdAt: row.createdAt,
        registryRowKind: 'primary' as const,
      };
    });

    /** One row per SOP family; prior-version PDFs/DOCX stay under Prior versions, not in Files */
    data = collapsePrimaryRegistryRowsByFamily(data, versionArtifactsByKey, artifactsMergedByFamilyLang);

    const registryNormKeys = new Set(
      data.map((r: any) => normalizeSopIdentifierKey(String(r.sopNo || '').trim().toUpperCase())),
    );
    const artifactOnlyKeys = mergeKeysOnlyInArtifacts(versionArtifactsDocs, registryNormKeys);

    const primaryFamilyMaxRev = new Map<string, number>();
    for (const r of data) {
      const fk = sopFamilyKeyFromIdentifier(String(r.sopNo || ''));
      const rev = parseRevisionFromSopIdentifier(String(r.sopNo || ''));
      if (!fk || rev == null) continue;
      primaryFamilyMaxRev.set(fk, Math.max(primaryFamilyMaxRev.get(fk) ?? -1, rev));
    }

    let artifactOnlyRowsAdded = 0;
    for (const mk of artifactOnlyKeys) {
      const mkNorm = normalizeSopIdentifierKey(String(mk).trim().toUpperCase());
      if (registryNormKeys.has(mkNorm)) continue;
      const fk = sopFamilyKeyFromIdentifier(mk);
      const ar = parseRevisionFromSopIdentifier(mk);
      if (fk && primaryFamilyMaxRev.has(fk)) {
        const pr = primaryFamilyMaxRev.get(fk)!;
        if (ar == null || ar <= pr) continue;
      }
      const vaEnFull = priorVersionArtifactEntries(
        versionArtifactsForRow(mk, 'English', versionArtifactsByKey, artifactsMergedByFamilyLang),
        mk,
      );
      const vaGjFull = priorVersionArtifactEntries(
        versionArtifactsForRow(mk, 'Gujarati', versionArtifactsByKey, artifactsMergedByFamilyLang),
        mk,
      );
      const vaEnSplit = splitMainVersusSuperseded(vaEnFull);
      const vaGjSplit = splitMainVersusSuperseded(vaGjFull);
      const vaEn = vaEnSplit.main;
      const vaGj = vaGjSplit.main;
      if (
        vaEn.length === 0 &&
        vaGj.length === 0 &&
        vaEnSplit.superseded.length === 0 &&
        vaGjSplit.superseded.length === 0
      )
        continue;

      let deptRaw = 'General';
      let updatedMs = 0;
      for (const va of versionArtifactsDocs as any[]) {
        if (normalizeSopIdentifierKey(String(va.identifier || '').trim().toUpperCase()) !== mk) continue;
        const t = new Date(va.updatedAt || 0).getTime();
        if (t >= updatedMs) {
          updatedMs = t;
          if (va.department && String(va.department).trim()) deptRaw = String(va.department).trim();
        }
      }
      const dept = normalizeDeptForDisplay(deptRaw);

      const nameEn = versionArtifactNameByKey.get(`${versionArtifactsLookupKey(mk)}::English`);
      const nameGj = versionArtifactNameByKey.get(`${versionArtifactsLookupKey(mk)}::Gujarati`);
      const displayName = pickBestName(
        '',
        mk,
        libNameByIdentifier.get(mk),
        masterNameByIdentifier.get(mk),
        undefined,
        nameEn || nameGj,
      );

      const sopDocuments = dedupeSopDocumentsByPath([
        ...sopDocumentsFromVersionArtifacts(vaEn, 'English'),
        ...sopDocumentsFromVersionArtifacts(vaGj, 'Gujarati'),
      ]);

      const englishPathKeys = new Set<string>();
      sopDocuments.forEach((d: any) => {
        if (d.filePath && d.language !== 'Gujarati') englishPathKeys.add(normPathKey(d.filePath));
      });
      const hasGujaratiFile = sopDocuments.some(
        (d: any) =>
          d.language === 'Gujarati' &&
          d.filePath &&
          !englishPathKeys.has(normPathKey(d.filePath)),
      );
      const isDualLanguage = vaEn.length > 0 && vaGj.length > 0;
      const gujaratiFileMissing = vaEn.length > 0 && vaGj.length > 0 && !hasGujaratiFile;

      const displayLanguage = isDualLanguage
        ? 'Both'
        : vaGj.length > 0 && vaEn.length === 0
          ? 'Gujarati'
          : 'English';
      const hasEnglishDocs =
        sopDocuments.some((d: any) => (d.language || 'English') !== 'Gujarati') ||
        vaEn.length > 0;
      const hasGujaratiDocs =
        sopDocuments.some((d: any) => d.language === 'Gujarati') ||
        vaGj.length > 0;

      const verNums = [...vaEn, ...vaGj].map((e) => e.version);
      const maxVer = verNums.length ? Math.max(...verNums) : null;
      const versionStr = maxVer != null ? String(maxVer) : '—';

      const primaryEn = [...vaEn].sort((a, b) => b.version - a.version)[0];
      const primaryGj = [...vaGj].sort((a, b) => b.version - a.version)[0];
      let sopFile: any = null;
      if (primaryEn) {
        const path = primaryEn.docxPath?.trim() || primaryEn.pdfPath?.trim();
        if (path) {
          sopFile = {
            fileName: `V${primaryEn.version} ${primaryEn.docxPath ? 'DOCX' : 'PDF'}`,
            filePath: path,
            fileType: (primaryEn.docxPath ? 'docx' : 'pdf').toLowerCase(),
            language: 'English',
          };
        }
      }
      if (!sopFile && primaryGj) {
        const path = primaryGj.docxPath?.trim() || primaryGj.pdfPath?.trim();
        if (path) {
          sopFile = {
            fileName: `V${primaryGj.version} ${primaryGj.docxPath ? 'DOCX' : 'PDF'}`,
            filePath: path,
            fileType: (primaryGj.docxPath ? 'docx' : 'pdf').toLowerCase(),
            language: 'Gujarati',
          };
        }
      }

      let assignedTrainer = 'Unassigned';
      if (sopToTrainersMap.has(mk) && sopToTrainersMap.get(mk)!.size > 0) {
        assignedTrainer = Array.from(sopToTrainersMap.get(mk)!).join(', ');
      } else if (departmentToTrainersMap.has(dept) && departmentToTrainersMap.get(dept)!.size > 0) {
        assignedTrainer = Array.from(departmentToTrainersMap.get(dept)!).join(', ');
      } else if (fallbackTrainerMap[dept]) {
        assignedTrainer = fallbackTrainerMap[dept].join(', ');
      }

      const idUpper = mk;
      const matchBase = idUpper.match(/^(.*?)-\d+$/);
      const baseCode = matchBase ? matchBase[1].trim() : idUpper;
      let assignedUsers: string[] = [];
      if (sopToUsersMap.has(idUpper) && sopToUsersMap.get(idUpper)!.size > 0) {
        assignedUsers = Array.from(sopToUsersMap.get(idUpper)!);
      } else if (matchBase && sopToUsersMap.has(baseCode) && sopToUsersMap.get(baseCode)!.size > 0) {
        assignedUsers = Array.from(sopToUsersMap.get(baseCode)!);
      }

      let artifactLocation = '';
      for (const vid of expandSopIdentifierVariants(idUpper)) {
        const L = locationByIdentifier.get(vid);
        if (L) {
          artifactLocation = L;
          break;
        }
      }

      let expiryDateIso: string | null = null;
      for (const vid of expandSopIdentifierVariants(idUpper)) {
        if (reviewDateByIdentifier.has(vid)) {
          expiryDateIso = reviewDateByIdentifier.get(vid)!.toISOString();
          break;
        }
      }
      if (!expiryDateIso) {
        const fk = sopFamilyKeyFromIdentifier(idUpper);
        if (fk && reviewDateByFamily.has(fk)) {
          expiryDateIso = reviewDateByFamily.get(fk)!.date.toISOString();
        }
      }

      data.push({
        _id: `va-${mk}`,
        registryRowKind: 'artifactsOnly' as const,
        sopNo: mk,
        sopName: displayName,
        location: artifactLocation || null,
        englishName: (() => {
          const cleaned = nameEn && nameEn.length > 2 ? cleanSopName(nameEn, mk) : null;
          if (cleaned && englishTitleIsUsableForRegistry(cleaned, mk)) return cleaned;
          return resolveDualEnglishTitleFromStores(
            mk,
            libEngNameByIdentifier,
            libNameByIdentifier,
            masterNameByIdentifier,
            masterEngNameByIdentifier,
            versionArtifactNameByKey,
          );
        })(),
        gujaratiName: (() => {
          const cleaned = nameGj && nameGj.length > 2 ? cleanSopName(nameGj, mk) : null;
          if (cleaned && /[\u0A80-\u0AFF]/.test(cleaned)) return cleaned;
          return resolveGujaratiTitleFromStores(mk, libGujNameByIdentifier, libNameByIdentifier, masterGujNameByIdentifier, versionArtifactNameByKey);
        })(),
        isDualLanguage,
        gujaratiFileMissing,
        department: dept || 'Other',
        version: versionStr,
        language: displayLanguage,
        englishVersion: hasEnglishDocs,
        gujaratiVersion: hasGujaratiDocs,
        assignedTrainer,
        assignedUsers,
        mediaStatus: { videos: false, slides: false, videoCount: 0, slideCount: 0 },
        expiryDate: expiryDateIso,
        sopDocuments: filterDocsToCurrentRevision(mk, sopDocuments),
        sopFile,
        previousVersionsStatus: [],
        versionArtifacts: vaEn,
        versionArtifactsGujarati: vaGj,
        versionArtifactsSuperseded: vaEnSplit.superseded,
        versionArtifactsGujaratiSuperseded: vaGjSplit.superseded,
        createdAt: updatedMs ? new Date(updatedMs).toISOString() : null,
      });
      artifactOnlyRowsAdded++;
    }

    data = mergeRegistryRowsByDocumentFamily(data, versionArtifactsByKey, artifactsMergedByFamilyLang);

    const supersedeOverridesRaw = await SupersedeSOPVersion.find({})
      .select('sopNo language version docxPath pdfPath')
      .lean();
    const supersedeOverrides = (supersedeOverridesRaw as any[]).map((o) => ({
      sopNo: normalizeSopIdentifierKey(String(o.sopNo || '').toUpperCase()),
      language: (String(o.language || '').toLowerCase() === 'gujarati' ? 'Gujarati' : 'English') as
        | 'English'
        | 'Gujarati',
      version: Number(o.version),
      docxPath: o.docxPath ? String(o.docxPath) : undefined,
      pdfPath: o.pdfPath ? String(o.pdfPath) : undefined,
    }));
    data = applySupersedeOverrides(data, supersedeOverrides);

    data.sort((a: any, b: any) => {
      const c = String(a.department || '').localeCompare(String(b.department || ''), undefined, {
        sensitivity: 'base',
      });
      if (c !== 0) return c;
      return String(a.sopNo || '').localeCompare(String(b.sopNo || ''), undefined, { numeric: true });
    });

    // ── MCQ banks: optional display-title enrichment only (never hide registry rows — folder SOPs without MCQs must still count)
    const mcqBanks = await MCQBank.find({}).select('sopIdentifier sopName').lean();
    const mcqNormKeys = new Set<string>();
    const mcqNameByNorm = new Map<string, string>();
    for (const b of mcqBanks as any[]) {
      const id = String(b.sopIdentifier || '').trim().toUpperCase();
      if (!id) continue;
      const nk = normalizeSopIdentifierKey(id);
      mcqNormKeys.add(nk);
      const nm = String(b.sopName || '').trim();
      if (nm.length >= 2) {
        const prev = mcqNameByNorm.get(nk);
        if (!prev || nm.length > prev.length) mcqNameByNorm.set(nk, nm);
      }
    }

    if (mcqNormKeys.size > 0) {
      data = data.map((r: any) => {
        const nk = normalizeSopIdentifierKey(String(r.sopNo || '').trim().toUpperCase());
        const bankTitleRaw = mcqNameByNorm.get(nk);
        if (!bankTitleRaw) return r;
        const titled = cleanSopName(bankTitleRaw, nk);
        if (!englishTitleIsUsableForRegistry(titled, nk)) return r;
        return {
          ...r,
          sopName: titled,
          englishName: (r.englishName && englishTitleIsUsableForRegistry(r.englishName, nk)) ? r.englishName : titled,
        };
      });
    }

    const dualLanguageCount = data.filter((r: any) => r.isDualLanguage).length;
    const rowsWithVersionArtifacts = data.filter(
      (r: any) =>
        (Array.isArray(r.versionArtifacts) && r.versionArtifacts.length > 0) ||
        (Array.isArray(r.versionArtifactsGujarati) && r.versionArtifactsGujarati.length > 0),
    ).length;
    let supersededVersionSlotCount = 0;
    for (const r of data) {
      supersededVersionSlotCount +=
        (Array.isArray(r.versionArtifactsSuperseded) ? r.versionArtifactsSuperseded.length : 0) +
        (Array.isArray(r.versionArtifactsGujaratiSuperseded) ? r.versionArtifactsGujaratiSuperseded.length : 0);
    }

    const finalDeptCounts: Record<string, number> = {};
    data.forEach((r: any) => {
      const d = r.department || 'Other';
      finalDeptCounts[d] = (finalDeptCounts[d] || 0) + 1;
    });

    /** Rows shown in capsules / main table (excludes folder-artifact placeholder rows). */
    const primaryRegistryRowCount = filterPrimaryRegistryRows(data).length;
    const artifactOnlyRegistryRowCount = data.filter((r: any) => isArtifactOnlyRegistryRow(r)).length;

    // Format sopNo for display with leading zeros (e.g. BSGE1-5 → BSGE01-05)
    data = data.map((r: any) => ({
      ...r,
      sopNo: r.sopNo ? formatSopNoDisplay(String(r.sopNo)) : r.sopNo,
    }));

    return NextResponse.json({
      success: true,
      data,
      metadata: {
        dualLanguageCount,
        /** All registry rows returned (primary + artifact-only placeholders). */
        totalRecords: data.length,
        /** Same as totalRecords; kept for older clients. */
        totalUniqueSOPs: data.length,
        /** Use this for “how many SOPs” on the dashboard — matches capsule / table primary rows. */
        primaryRegistryRowCount,
        /** Rows that exist only to surface version files (not a real Mongo SOP doc). */
        artifactOnlyRegistryRowCount,
        registryRowsFromVersionArtifactsOnly: artifactOnlyRowsAdded,
        versionArtifactsMongoCount: versionArtifactsDocs.length,
        registryRowsWithVersionArtifacts: rowsWithVersionArtifacts,
        supersededVersionSlotCount,
        /** Always false: registry is no longer filtered to MCQ-bank SOPs only (that caused undercounts vs folder uploads). */
        mcqBankFilterActive: false,
        mcqBankRowCount: mcqNormKeys.size,
        debug: {
          source: 'SOP',
          departmentDistribution: finalDeptCounts,
          withExpiryDate: withExpiry,
          expiredCount,
          nearExpiryCount,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard sops:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard sops' },
      { status: 500 }
    );
  }
}
