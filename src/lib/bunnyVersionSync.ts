/**
 * Fetches all DOCX/PDF files from Bunny CDN storage, parses each file's path to extract
 * SOP identifier + version number, and returns a map keyed by `<normIdentifier>::<language>`
 * → entries array. This is merged into the dashboard's in-memory versionArtifactsByKey so
 * versions already in Bunny show up on the dashboard without any manual upload step.
 */

import {
  normalizeSopIdentifierKey,
  normalizeUnicodeHyphens,
  parseRevisionFromSopIdentifier,
  versionArtifactsLookupKey,
} from '@/lib/sopIdentifierNormalize';

export interface BunnyVersionEntry {
  version: number;
  docxPath?: string;
  pdfPath?: string;
}

// ── Bunny listing ─────────────────────────────────────────────────────────

export function getBunnyConfig() {
  const storageZone = process.env.BUNNY_STORAGE_ZONE || process.env.BUNNY_STORAGE_ZONE_NAME || '';
  const apiKey = process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY || '';
  const rawCdn = process.env.BUNNY_PULL_ZONE_URL || process.env.BUNNY_CDN_HOSTNAME || '';
  const cdnHostname = rawCdn.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const storageHostname = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
  return { storageZone, apiKey, cdnHostname, storageHostname };
}

export async function listDir(
  storageHostname: string,
  storageZone: string,
  apiKey: string,
  path: string,
): Promise<{ ObjectName: string; IsDirectory: boolean }[]> {
  const clean = path.replace(/^\/+|\/+$/g, '');
  const url = clean
    ? `https://${storageHostname}/${storageZone}/${clean}/`
    : `https://${storageHostname}/${storageZone}/`;
  const res = await fetch(url, {
    headers: { AccessKey: apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Bunny list ${url} → ${res.status}`);
  }
  return res.json();
}

export async function crawl(
  storageHostname: string,
  storageZone: string,
  apiKey: string,
  cdnHostname: string,
  path = '',
  depth = 0,
): Promise<{ storagePath: string; cdnUrl: string; ext: 'docx' | 'pdf' }[]> {
  if (depth > 8) return [];
  let entries: { ObjectName: string; IsDirectory: boolean }[];
  try {
    entries = await listDir(storageHostname, storageZone, apiKey, path);
  } catch {
    return [];
  }
  const files: { storagePath: string; cdnUrl: string; ext: 'docx' | 'pdf' }[] = [];
  const subdirs: Promise<typeof files>[] = [];
  for (const e of entries) {
    const entryPath = path ? `${path.replace(/\/$/, '')}/${e.ObjectName}` : e.ObjectName;
    if (e.IsDirectory) {
      subdirs.push(crawl(storageHostname, storageZone, apiKey, cdnHostname, entryPath, depth + 1));
    } else {
      const lo = e.ObjectName.toLowerCase();
      const ext = lo.endsWith('.pdf') ? 'pdf' : (lo.endsWith('.docx') || lo.endsWith('.doc')) ? 'docx' : null;
      if (!ext || e.ObjectName.startsWith('~$')) continue;
      files.push({ storagePath: entryPath, cdnUrl: `https://${cdnHostname}/${entryPath}`, ext });
    }
  }
  for (const child of await Promise.all(subdirs)) files.push(...child);
  return files;
}

// ── Path parsing ──────────────────────────────────────────────────────────

function isAnnexure(p: string) {
  return /\b(annexure|annex|appendix)\b/i.test(p);
}

function pathSuggestsGujarati(p: string): boolean {
  const u = p.toLowerCase();
  if (/[઀-૿]/.test(p)) return true;
  if (/\bgujarati\b/.test(u)) return true;
  if (/\/guj(\/|$|[_.\-])/i.test(u)) return true;
  if (/[_\-]guj([._/\-]|arati)/i.test(u)) return true;
  return false;
}

function detectDept(parts: string[]): string {
  const DEPTS: [string, string][] = [
    ['ENGINEERING AND MAINTENANCE', 'Engineering and Maintenance'],
    ['MICROBIOLOGY', 'Microbiology'],
    ['PRODUCTION', 'Production'],
    ['PERSONNEL', 'Personnel'],
    ['STORE', 'Store'],
    ['QC', 'QC'],
    ['QA', 'QA'],
  ];
  for (let i = 0; i < Math.min(parts.length, 5); i++) {
    const u = parts[i].toUpperCase();
    for (const [needle, label] of DEPTS) {
      if (u.includes(needle)) return label;
    }
  }
  return 'General';
}

function extractIdentifier(seg: string): string | null {
  const s = normalizeUnicodeHyphens(seg);
  const m = s.match(/([A-Z]{2,6}[\s_-]?\d{1,4}\s*-\s*\d{1,3})/i);
  if (!m) return null;
  return normalizeUnicodeHyphens(m[1]).toUpperCase().replace(/\s+/g, '');
}

function parseSopCodeVersionFromSegment(seg: string): { base: string; version: number } | null {
  const n = normalizeUnicodeHyphens(seg.trim());
  const m = n.match(/^([A-Z]{2,6}\d{1,4})-(\d{1,4})(?:\b|$)/i);
  if (!m) return null;
  return { base: m[1].toUpperCase(), version: parseInt(m[2], 10) };
}

function parseVersionFolder(name: string): number | null {
  const n = normalizeUnicodeHyphens(name.trim());
  let m;
  if ((m = n.match(/^v\.?\s*(\d+)$/i))) return parseInt(m[1], 10);
  if ((m = n.match(/^version[-\s._]?(\d+)$/i))) return parseInt(m[1], 10);
  if ((m = n.match(/^(?:ver|version)\s*[-._]?\s*(\d+)$/i))) return parseInt(m[1], 10);
  if ((m = n.match(/^rev\.?\s*(\d+)$/i))) return parseInt(m[1], 10);
  if ((m = n.match(/^r[-\s]?(\d+)$/i))) return parseInt(m[1], 10);
  if ((m = n.match(/^(\d+)$/))) return parseInt(m[1], 10);
  return null;
}

interface Parsed {
  identifier: string;
  version: number;
  language: 'English' | 'Gujarati';
  department: string;
}

export function parseStoragePath(storagePath: string): Parsed | null {
  if (isAnnexure(storagePath)) return null;
  const norm = normalizeUnicodeHyphens(storagePath);
  const parts = norm.split(/[/\\]/).filter(Boolean);
  if (parts.length < 1) return null;
  const fileName = parts[parts.length - 1];
  if (fileName.startsWith('~$')) return null;
  const lo = fileName.toLowerCase();
  if (!lo.endsWith('.docx') && !lo.endsWith('.doc') && !lo.endsWith('.pdf')) return null;

  const language: 'English' | 'Gujarati' = pathSuggestsGujarati(storagePath) ? 'Gujarati' : 'English';
  const department = detectDept(parts);

  // 1. Explicit version folder (V8, 8, Version 8, Rev 3, …)
  for (let vi = parts.length - 2; vi >= 1; vi--) {
    const vNum = parseVersionFolder(parts[vi]);
    if (vNum === null) continue;
    const sopSeg = parts[vi - 1];
    const id = extractIdentifier(sopSeg);
    if (!id) continue;
    return { identifier: normalizeSopIdentifierKey(id), version: vNum, language, department };
  }

  // 2. Code-version folder (QAGE01-08 style)
  for (let vi = parts.length - 2; vi >= 0; vi--) {
    const seg = parts[vi];
    const segLo = seg.trim().toLowerCase();
    if (segLo === 'reference' || segLo === 'references' || segLo === 'attachments') continue;
    const cv = parseSopCodeVersionFromSegment(seg);
    if (!cv) continue;
    const id = normalizeSopIdentifierKey(`${cv.base}-${String(cv.version).padStart(2, '0')}`);
    return { identifier: id, version: cv.version, language, department };
  }

  // 3. Identifier in file stem (QAGE01-08.docx)
  const stem = fileName.replace(/\.(docx|doc|pdf)$/i, '');
  const cvStem = parseSopCodeVersionFromSegment(stem);
  if (cvStem) {
    const id = normalizeSopIdentifierKey(`${cvStem.base}-${String(cvStem.version).padStart(2, '0')}`);
    return { identifier: id, version: cvStem.version, language, department };
  }
  const idStem = extractIdentifier(stem);
  if (idStem) {
    const rev = parseRevisionFromSopIdentifier(idStem);
    if (rev != null) return { identifier: normalizeSopIdentifierKey(idStem), version: rev, language, department };
  }

  // 4. Identifier in any ancestor folder
  for (let vi = parts.length - 2; vi >= 0; vi--) {
    const id = extractIdentifier(parts[vi]);
    if (!id) continue;
    const rev = parseRevisionFromSopIdentifier(id);
    if (rev != null) return { identifier: normalizeSopIdentifierKey(id), version: rev, language, department };
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────

// In-memory cache for the parsed Bunny version map. Independent of the
// dashboard-sops payload cache so we don't re-crawl the entire CDN every time
// the dashboard payload is rebuilt. Busted on any upload via
// invalidateBunnyVersionMapCache(), which invalidateDashboardSopsCache() calls.
const BUNNY_MAP_TTL_MS = (() => {
  const raw = process.env.BUNNY_VERSION_MAP_TTL_MS;
  if (raw === undefined || raw === '') return 5 * 60 * 1000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 5 * 60 * 1000;
})();

interface BunnyMapCacheEntry {
  map: Map<string, BunnyVersionEntry[]>;
  cachedAt: number;
}

const bg = global as typeof global & { __bunnyVersionMapCache?: BunnyMapCacheEntry | null; __bunnyVersionMapInFlight?: Promise<Map<string, BunnyVersionEntry[]>> | null };

export function invalidateBunnyVersionMapCache(): void {
  bg.__bunnyVersionMapCache = null;
}

/**
 * Returns a map of `versionArtifactsLookupKey(identifier)::language` → BunnyVersionEntry[].
 * Identical key format to `versionArtifactsByKey` used in the dashboard route, so the caller
 * can merge the two maps with `mergeVersionArtifactEntries`.
 *
 * Cached in-memory for BUNNY_MAP_TTL_MS (default 5 min). Concurrent callers share one
 * in-flight crawl. Busted on any upload via invalidateBunnyVersionMapCache().
 *
 * Returns an empty map (never throws) if Bunny is not configured or the crawl fails.
 */
export async function fetchBunnyVersionMap(): Promise<Map<string, BunnyVersionEntry[]>> {
  if (BUNNY_MAP_TTL_MS > 0) {
    const entry = bg.__bunnyVersionMapCache;
    if (entry && Date.now() - entry.cachedAt <= BUNNY_MAP_TTL_MS) {
      return entry.map;
    }
    if (bg.__bunnyVersionMapInFlight) return bg.__bunnyVersionMapInFlight;
  }

  const promise = (async () => {
    const { storageZone, apiKey, cdnHostname, storageHostname } = getBunnyConfig();
    if (!storageZone || !apiKey || !cdnHostname) return new Map<string, BunnyVersionEntry[]>();

    let rawFiles: { storagePath: string; cdnUrl: string; ext: 'docx' | 'pdf' }[];
    try {
      rawFiles = await crawl(storageHostname, storageZone, apiKey, cdnHostname);
    } catch {
      return new Map<string, BunnyVersionEntry[]>();
    }
    return buildVersionMapFromFiles(rawFiles);
  })();

  if (BUNNY_MAP_TTL_MS > 0) {
    bg.__bunnyVersionMapInFlight = promise;
    try {
      const map = await promise;
      bg.__bunnyVersionMapCache = { map, cachedAt: Date.now() };
      return map;
    } finally {
      bg.__bunnyVersionMapInFlight = null;
    }
  }
  return promise;
}

function buildVersionMapFromFiles(
  rawFiles: { storagePath: string; cdnUrl: string; ext: 'docx' | 'pdf' }[],
): Map<string, BunnyVersionEntry[]> {
  // Accumulate per (identifier, language, version)
  const acc = new Map<
    string,
    Map<number, { docxPath?: string; pdfPath?: string }>
  >();

  for (const file of rawFiles) {
    const parsed = parseStoragePath(file.storagePath);
    if (!parsed) continue;
    const mapKey = `${versionArtifactsLookupKey(parsed.identifier)}::${parsed.language}`;
    if (!acc.has(mapKey)) acc.set(mapKey, new Map());
    const vMap = acc.get(mapKey)!;
    if (!vMap.has(parsed.version)) vMap.set(parsed.version, {});
    const slot = vMap.get(parsed.version)!;
    if (file.ext === 'docx' && !slot.docxPath) slot.docxPath = file.cdnUrl;
    else if (file.ext === 'pdf' && !slot.pdfPath) slot.pdfPath = file.cdnUrl;
  }

  const result = new Map<string, BunnyVersionEntry[]>();
  for (const [key, vMap] of acc) {
    const entries: BunnyVersionEntry[] = Array.from(vMap.entries())
      .map(([version, p]) => ({ version, ...p }))
      .filter((e) => e.docxPath || e.pdfPath)
      .sort((a, b) => b.version - a.version);
    if (entries.length) result.set(key, entries);
  }
  return result;
}
