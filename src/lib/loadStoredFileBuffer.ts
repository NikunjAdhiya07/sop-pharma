import fs from 'fs/promises';
import path from 'path';
import { normalizePath, resolveFilePath } from '@/lib/filePathResolver';
import { fetchBunnyFile, isBunnyPath } from '@/lib/bunnyStorage';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import { sopIdentifierMatchFilter } from '@/lib/sopIdentifierNormalize';
import { fileKindFromStoredPath } from '@/lib/filePathFileKind';
import {
  collectSopIdentifierCandidates,
  extractRawHyphenatedSopCodesFromPath,
} from '@/lib/inferSopIdentifierFromStoredPath';

/** Avoid returning a Mongo path that no longer exists on disk (stale uploads path) so fallbacks can run. */
async function isLocalStoredPathReachable(p: string): Promise<boolean> {
  const t = (p || '').trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (isBunnyPath(t)) return true;
  const abs = await resolveFilePath(normalizePath(t.split(/[?#]/)[0]));
  if (!abs) return false;
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
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

export async function resolveFileUrlFromSopIdentifier(
  identifier: string,
  language: string | undefined,
): Promise<string | null> {
  await connectDB();
  const wantGuj = language === 'Gujarati';
  const all = await SOP.find(sopIdentifierMatchFilter(identifier))
    .select('fileUrl language name originalFileName folderPath')
    .lean();
  const target = wantGuj
    ? all.find((s) => looksGujarati(s))
    : all.find((s) => !looksGujarati(s)) || all[0];
  return (target as { fileUrl?: string } | undefined)?.fileUrl?.trim() || null;
}

function pickLibraryRow<T extends { language?: string }>(rows: T[], wantGuj: boolean): T | null {
  if (!rows.length) return null;
  if (wantGuj) {
    return rows.find((r) => (r.language || 'English') === 'Gujarati') || rows[0];
  }
  return rows.find((r) => (r.language || 'English') !== 'Gujarati') || rows[0];
}

function orderLibraryRowsByLanguage<T extends { language?: string }>(
  libs: T[],
  wantGuj: boolean,
): T[] {
  if (!libs.length) return libs;
  if (wantGuj) {
    const g = libs.filter((r) => (r.language || 'English') === 'Gujarati');
    const e = libs.filter((r) => (r.language || 'English') !== 'Gujarati');
    /** Prefer Gujarati row, but still scan English row for DOCX when GUJ has no Word file (common library shape). */
    return g.length ? [...g, ...e] : libs;
  }
  const e = libs.filter((r) => (r.language || 'English') !== 'Gujarati');
  const g = libs.filter((r) => (r.language || 'English') === 'Gujarati');
  return e.length ? [...e, ...g] : libs;
}

async function resolveLibraryDocumentPath(
  identifier: string,
  language: string | undefined,
  wantKind: 'pdf' | 'docx' | 'doc',
): Promise<string | null> {
  await connectDB();
  const wantGuj = language === 'Gujarati';
  const libs = await SOPLibrary.find(sopIdentifierMatchFilter(identifier, 'sopIdentifier'))
    .select('sopDocuments language')
    .lean();
  const row = pickLibraryRow(libs, wantGuj);
  const docs = row?.sopDocuments;
  if (!docs?.length) return null;
  for (const d of docs) {
    const p = (d as { filePath?: string; fileType?: string }).filePath?.trim();
    if (!p) continue;
    if (fileKindFromStoredPath(p, (d as { fileType?: string }).fileType) === wantKind) return p;
  }
  return null;
}

async function resolveLibraryPathByBasename(
  identifier: string,
  language: string | undefined,
  targetBasename: string,
): Promise<string | null> {
  await connectDB();
  const wantGuj = language === 'Gujarati';
  const tb = targetBasename.trim().toLowerCase();
  if (!tb) return null;
  const libs = await SOPLibrary.find(sopIdentifierMatchFilter(identifier, 'sopIdentifier'))
    .select('sopDocuments language')
    .lean();
  const row = pickLibraryRow(libs, wantGuj);
  const docs = row?.sopDocuments;
  if (!docs?.length) return null;
  for (const d of docs) {
    const p = (d as { filePath?: string }).filePath?.trim();
    if (!p) continue;
    const base = path.posix.basename(p.split(/[?#]/)[0]).toLowerCase();
    if (base === tb) return p;
  }
  return null;
}

async function resolveSopFileUrlMatchingKind(
  identifier: string,
  language: string | undefined,
  wantKind: 'pdf' | 'docx' | 'doc',
): Promise<string | null> {
  await connectDB();
  const wantGuj = language === 'Gujarati';
  const all = await SOP.find(sopIdentifierMatchFilter(identifier))
    .select('fileUrl language name originalFileName folderPath fileType')
    .lean();
  const target = wantGuj
    ? all.find((s) => looksGujarati(s))
    : all.find((s) => !looksGujarati(s)) || all[0];
  const url = (target as { fileUrl?: string; fileType?: string } | undefined)?.fileUrl?.trim();
  if (!url) return null;
  return fileKindFromStoredPath(url, (target as { fileType?: string }).fileType) === wantKind ? url : null;
}

/** When sopIdentifier in Mongo does not match inferred codes, still find the row by exact filename (any path/URL). */
async function resolveLibraryDocumentByFilenameGlobally(
  targetBasename: string,
  wantKind: 'pdf' | 'docx' | 'doc',
  language: string | undefined,
): Promise<string | null> {
  const tb = targetBasename.trim().toLowerCase();
  if (!tb) return null;
  await connectDB();
  const wantGuj = language === 'Gujarati';
  const esc = tb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const libs = await SOPLibrary.find({
    sopDocuments: {
      $elemMatch: {
        filePath: { $regex: `${esc}$`, $options: 'i' },
      },
    },
  })
    .select('sopDocuments language')
    .limit(25)
    .lean();

  for (const row of orderLibraryRowsByLanguage(libs, wantGuj)) {
    for (const d of row.sopDocuments || []) {
      const p = (d as { filePath?: string; fileType?: string }).filePath?.trim();
      if (!p) continue;
      const base = path.posix.basename(p.split(/[?#]/)[0]).toLowerCase();
      if (base !== tb) continue;
      if (fileKindFromStoredPath(p, (d as { fileType?: string }).fileType) === wantKind) return p;
    }
  }
  return null;
}

/** sopIdentifier may not match the code in the stored path/URL; search filePath for PEGE13-05 etc. */
async function resolveLibraryDocumentByPathContainingCode(
  codeSubstring: string,
  wantKind: 'pdf' | 'docx' | 'doc',
  language: string | undefined,
): Promise<string | null> {
  const sub = (codeSubstring || '').trim();
  if (sub.length < 4) return null;
  await connectDB();
  const wantGuj = language === 'Gujarati';
  const esc = sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pathRe = new RegExp(esc, 'i');

  const libs = await SOPLibrary.find({
    sopDocuments: {
      $elemMatch: {
        filePath: pathRe,
      },
    },
  })
    .select('sopDocuments language')
    .limit(25)
    .lean();

  for (const row of orderLibraryRowsByLanguage(libs, wantGuj)) {
    for (const d of row.sopDocuments || []) {
      const p = (d as { filePath?: string; fileType?: string }).filePath?.trim();
      if (!p || !pathRe.test(p)) continue;
      if (fileKindFromStoredPath(p, (d as { fileType?: string }).fileType) === wantKind) return p;
    }
  }
  return null;
}

async function resolveSopFileUrlByPathContainingCode(
  codeSubstring: string,
  wantKind: 'pdf' | 'docx' | 'doc',
  language: string | undefined,
): Promise<string | null> {
  const sub = (codeSubstring || '').trim();
  if (sub.length < 4) return null;
  await connectDB();
  const wantGuj = language === 'Gujarati';
  const esc = sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const urlRe = new RegExp(esc, 'i');

  const all = await SOP.find({ fileUrl: urlRe })
    .select('fileUrl fileType language name originalFileName folderPath')
    .limit(30)
    .lean();

  const target = wantGuj
    ? all.find((s) => looksGujarati(s))
    : all.find((s) => !looksGujarati(s)) || all[0];
  const url = (target as { fileUrl?: string; fileType?: string } | undefined)?.fileUrl?.trim();
  if (!url || !urlRe.test(url)) return null;
  if (fileKindFromStoredPath(url, (target as { fileType?: string }).fileType) !== wantKind) return null;
  return url;
}

async function tryResolveLibraryOrSopByPathCodes(
  trimmedPath: string,
  wantKind: 'pdf' | 'docx' | 'doc',
  language: string | undefined,
): Promise<string | null> {
  const rawCodes = extractRawHyphenatedSopCodesFromPath(trimmedPath);
  rawCodes.sort((a, b) => b.length - a.length);
  for (const code of rawCodes) {
    const lib = await resolveLibraryDocumentByPathContainingCode(code, wantKind, language);
    if (lib && (await isLocalStoredPathReachable(lib))) return lib;
    const sop = await resolveSopFileUrlByPathContainingCode(code, wantKind, language);
    if (sop && (await isLocalStoredPathReachable(sop))) return sop;
  }
  return null;
}

/** Scan all library + SOP rows for identifier variants; return first path of `wantKind` that exists on disk (or https). */
async function findFirstReachablePathForIdentifiers(
  ids: string[],
  language: string | undefined,
  wantKind: 'pdf' | 'docx' | 'doc',
): Promise<string | null> {
  const wantGuj = language === 'Gujarati';
  for (const id of ids) {
    const libs = await SOPLibrary.find(sopIdentifierMatchFilter(id, 'sopIdentifier'))
      .select('sopDocuments language')
      .lean();
    for (const row of orderLibraryRowsByLanguage(libs, wantGuj)) {
      for (const d of row.sopDocuments || []) {
        const p = (d as { filePath?: string; fileType?: string }).filePath?.trim();
        if (!p) continue;
        if (fileKindFromStoredPath(p, (d as { fileType?: string }).fileType) !== wantKind) continue;
        if (await isLocalStoredPathReachable(p)) return p;
      }
    }

    const sops = await SOP.find(sopIdentifierMatchFilter(id))
      .select('fileUrl fileType language name originalFileName folderPath')
      .lean();
    const engFirst = sops.filter((s) => !looksGujarati(s));
    const gujFirst = sops.filter((s) => looksGujarati(s));
    const ordered = wantGuj ? [...gujFirst, ...engFirst] : [...engFirst, ...gujFirst];
    const list = ordered.length ? ordered : sops;
    for (const s of list) {
      const url = (s as { fileUrl?: string; fileType?: string }).fileUrl?.trim();
      if (!url) continue;
      if (fileKindFromStoredPath(url, (s as { fileType?: string }).fileType) !== wantKind) continue;
      if (await isLocalStoredPathReachable(url)) return url;
    }
  }
  return null;
}

/**
 * Resolve a Word file for /dashboard/view-doc: SOPLibrary sopDocuments first (where DOCX usually lives), then SOP.
 * Prefer paths that can actually be loaded (disk, https, bunny://) so preview tokens are not minted for stale /uploads/… only.
 */
export async function resolveDocxPathForViewer(
  identifier: string | null,
  language: string | undefined,
  pathHint: string | null,
): Promise<string | null> {
  const pathTrim = (pathHint || '').trim();
  const ids = collectSopIdentifierCandidates(identifier, pathTrim);

  const reachable =
    (await findFirstReachablePathForIdentifiers(ids, language, 'docx')) ||
    (await findFirstReachablePathForIdentifiers(ids, language, 'doc'));
  if (reachable) return reachable;

  if (pathTrim) {
    const bn = path.posix.basename(normalizePath(pathTrim.split(/[?#]/)[0])).replace(/\\/g, '/');
    if (bn) {
      const g =
        (await resolveLibraryDocumentByFilenameGlobally(bn, 'docx', language)) ||
        (await resolveLibraryDocumentByFilenameGlobally(bn, 'doc', language));
      if (g && (await isLocalStoredPathReachable(g))) return g;
    }
    const byPathCode =
      (await tryResolveLibraryOrSopByPathCodes(pathTrim, 'docx', language)) ||
      (await tryResolveLibraryOrSopByPathCodes(pathTrim, 'doc', language));
    if (byPathCode) return byPathCode;

    // Last resort: if the path hint is a relative local path (uploads/…), try to map it to Bunny CDN.
    // Many older SOP records have a stale local path but the file was migrated to Bunny.
    if (!/^https?:\/\//i.test(pathTrim) && !isBunnyPath(pathTrim)) {
      const { getBunnyCdnUrl } = await import('@/lib/bunnyStorage');
      const cdnUrl = getBunnyCdnUrl(pathTrim.replace(/^\/+/, ''));
      if (cdnUrl) {
        // Validate the CDN URL is reachable before returning it
        try {
          const headRes = await fetch(cdnUrl, { method: 'HEAD' });
          if (headRes.ok) return cdnUrl;
        } catch { /* CDN not reachable, continue */ }
      }
    }
  }

  const ex = (identifier || '').trim();
  if (ex) {
    const fb = await resolveFileUrlFromSopIdentifier(ex, language);
    if (fb) {
      const k = fileKindFromStoredPath(fb);
      if ((k === 'docx' || k === 'doc') && (await isLocalStoredPathReachable(fb))) return fb;
      // If the stored URL is a Bunny CDN URL, return it directly
      if ((k === 'docx' || k === 'doc') && isBunnyPath(fb)) return fb;
    }
  }
  return null;
}

/**
 * When the stored path no longer exists on disk (moved to Bunny, etc.), find the current URL/path
 * from SOPLibrary / SOP using explicit identifier and/or SOP code inferred from the filename.
 */
export type ResolveAlternateStoredLocationOptions = {
  /**
   * When the caller needs a Word file (DOCX preview), ignore a .pdf path hint so we resolve
   * library/SOP DOCX entries instead of only PDF alternates for the same identifier.
   */
  preferWordDocument?: boolean;
};

export async function resolveAlternateStoredLocation(
  filePath: string,
  identifier: string | null,
  language: string | undefined,
  opts?: ResolveAlternateStoredLocationOptions,
): Promise<string | null> {
  const trimmedPath = (filePath || '').trim();
  const hadConcretePath = Boolean(trimmedPath);
  let wantKind: 'pdf' | 'docx' | 'doc' = hadConcretePath ? fileKindFromStoredPath(trimmedPath) : 'docx';
  if (opts?.preferWordDocument && wantKind !== 'docx' && wantKind !== 'doc') {
    wantKind = 'docx';
  }

  const basenameForGlobal = hadConcretePath
    ? path.posix.basename(normalizePath(trimmedPath.split(/[?#]/)[0])).replace(/\\/g, '/')
    : '';

  const ids = collectSopIdentifierCandidates(identifier, trimmedPath);
  if (ids.length === 0) {
    if (basenameForGlobal) {
      const g = await resolveLibraryDocumentByFilenameGlobally(basenameForGlobal, wantKind, language);
      if (g) return g;
    }
    const byCode = await tryResolveLibraryOrSopByPathCodes(trimmedPath, wantKind, language);
    if (byCode) return byCode;
    return null;
  }

  for (const id of ids) {
    const lib = await resolveLibraryDocumentPath(id, language, wantKind);
    if (lib && (await isLocalStoredPathReachable(lib))) return lib;
    const sop = await resolveSopFileUrlMatchingKind(id, language, wantKind);
    if (sop && (await isLocalStoredPathReachable(sop))) return sop;
  }

  if (hadConcretePath) {
    const bn = basenameForGlobal;
    if (bn) {
      for (const id of ids) {
        const hit = await resolveLibraryPathByBasename(id, language, bn);
        if (hit && (await isLocalStoredPathReachable(hit))) return hit;
      }
      const globalHit = await resolveLibraryDocumentByFilenameGlobally(bn, wantKind, language);
      if (globalHit && (await isLocalStoredPathReachable(globalHit))) return globalHit;
    }
  }

  const byPathCodes = await tryResolveLibraryOrSopByPathCodes(trimmedPath, wantKind, language);
  if (byPathCodes) return byPathCodes;

  if (!hadConcretePath) {
    for (const id of ids) {
      const lib =
        (await resolveLibraryDocumentPath(id, language, 'docx')) ||
        (await resolveLibraryDocumentPath(id, language, 'doc'));
      if (lib && (await isLocalStoredPathReachable(lib))) return lib;
      const sop =
        (await resolveSopFileUrlMatchingKind(id, language, 'docx')) ||
        (await resolveSopFileUrlMatchingKind(id, language, 'doc'));
      if (sop && (await isLocalStoredPathReachable(sop))) return sop;
    }
  }

  const allowKindAgnosticFallback =
    !hadConcretePath || wantKind === 'docx' || wantKind === 'doc' || wantKind === 'pdf';
  if (allowKindAgnosticFallback) {
    const ex = (identifier || '').trim();
    if (ex) {
      const fb = await resolveFileUrlFromSopIdentifier(ex, language);
      if (fb && fileKindFromStoredPath(fb) === wantKind && (await isLocalStoredPathReachable(fb))) return fb;
    }
    for (const id of ids) {
      const fb = await resolveFileUrlFromSopIdentifier(id, language);
      if (fb && fileKindFromStoredPath(fb) === wantKind && (await isLocalStoredPathReachable(fb))) return fb;
    }
  }

  const reachable = await findFirstReachablePathForIdentifiers(ids, language, wantKind);
  if (reachable) return reachable;

  return null;
}

export type LoadStoredFileOptions = {
  /** When true, fetch any http(s) URL (used only for paths resolved from Mongo, not raw user ?path=). */
  trustedRemote?: boolean;
};

/**
 * Load DOCX/DOC bytes for preview: same fallbacks as PDF download (alternate paths + CDN),
 * plus Word-focused resolution when the query path points at a PDF or a stale local path.
 * When `identifier` is set, resolves from DB/CDN first so a bad `path` in the viewer token does not block preview.
 */
export async function loadWordDocumentBuffer(
  pathHint: string,
  identifier: string | null,
  language: string | undefined,
): Promise<Buffer | null> {
  const trusted: LoadStoredFileOptions = { trustedRemote: true };
  const raw = (pathHint || '').trim();
  const normalizedHint = /^https?:\/\//i.test(raw) ? raw : raw.replace(/^\/+/, '');

  const tryLoad = async (relOrUrl: string | null | undefined): Promise<Buffer | null> => {
    const s = (relOrUrl || '').trim();
    if (!s) return null;
    const p =
      /^https?:\/\//i.test(s) || s.startsWith('bunny://') ? s : s.replace(/^\/+/, '');
    return loadStoredFileBuffer(p, trusted);
  };

  const id = (identifier || '').trim();
  if (id) {
    const resolved = await resolveDocxPathForViewer(id, language, normalizedHint || null);
    if (resolved) {
      let buf = await tryLoad(resolved);
      if (buf) return buf;
      const alt = await resolveAlternateStoredLocation(
        resolved.replace(/^\/+/, ''),
        id,
        language,
        { preferWordDocument: true },
      );
      if (alt) {
        buf = await tryLoad(alt);
        if (buf) return buf;
      }
    }
  }

  let buf = await tryLoad(normalizedHint);
  if (buf) return buf;

  const alt2 = await resolveAlternateStoredLocation(normalizedHint, id || null, language, {
    preferWordDocument: true,
  });
  if (alt2) {
    buf = await tryLoad(alt2);
    if (buf) return buf;
  }

  return null;
}

const REMOTE_FETCH_TIMEOUT_MS = 120_000;

async function fetchRemoteFileBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      console.error('[loadStoredFileBuffer] remote fetch timed out:', url.slice(0, 120));
    } else {
      console.error('[loadStoredFileBuffer] remote fetch failed:', err);
    }
    return null;
  }
}

/**
 * Load file bytes from a stored path: local (uploads/…), bunny://, or CDN URL.
 * Raw user-supplied URLs only load when they match Bunny heuristics unless `trustedRemote` is set.
 */
export async function loadStoredFileBuffer(
  raw: string,
  opts?: LoadStoredFileOptions,
): Promise<Buffer | null> {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    if (isBunnyPath(trimmed)) {
      return fetchBunnyFile(trimmed);
    }
    if (opts?.trustedRemote) {
      return fetchRemoteFileBuffer(trimmed);
    }
    return null;
  }

  const normalized = normalizePath(trimmed);
  const cwd = process.cwd();

  const tryDisk = async (absCandidate: string): Promise<Buffer | null> => {
    try {
      await fs.access(absCandidate);
      return await fs.readFile(absCandidate);
    } catch {
      return null;
    }
  };

  let abs = await resolveFilePath(normalized);
  if (abs) {
    try {
      return await fs.readFile(abs);
    } catch {
      /* continue */
    }
  }

  const publicUnder = path.join(cwd, 'public', normalized);
  const buf = await tryDisk(publicUnder);
  if (buf) return buf;

  return null;
}
