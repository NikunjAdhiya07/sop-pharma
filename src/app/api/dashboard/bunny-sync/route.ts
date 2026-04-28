import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import SOPVersionArtifacts from '@/models/SOPVersionArtifacts';
import SupersedeSOPVersion from '@/models/SupersedeSOPVersion';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BunnySyncRow {
  key: string;
  source: 'sop' | 'library' | 'version' | 'supersede';
  docId: string;
  identifier: string;
  name?: string;
  department: string;
  fileType: string;
  version?: number;
  language?: string;
  /** Raw value stored in DB */
  dbPath: string;
  /** Extracted relative storage path (null if not a Bunny path) */
  relPath: string | null;
  /** Result after checking Bunny Storage API */
  status: 'found' | 'missing' | 'not_bunny' | 'empty';
}

// ── Bunny helpers ─────────────────────────────────────────────────────────────

function getBunnyConfig() {
  const storageZone = process.env.BUNNY_STORAGE_ZONE || '';
  const apiKey = process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY || '';
  const storageHostname = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
  const rawCdn = process.env.BUNNY_PULL_ZONE_URL || process.env.BUNNY_CDN_HOSTNAME || '';
  const cdnHostname = rawCdn.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return { storageZone, apiKey, storageHostname, cdnHostname };
}

type BunnyConfig = ReturnType<typeof getBunnyConfig>;

function extractRelPath(rawPath: string, cdnHostname: string): string | null {
  const t = (rawPath || '').trim();
  if (!t) return null;
  if (t.startsWith('http://') || t.startsWith('https://')) {
    try {
      return new URL(t).pathname.replace(/^\/+/, '') || null;
    } catch {
      return null;
    }
  }
  if (t.startsWith('bunny://')) return t.replace(/^bunny:\/\//, '') || null;
  return t.replace(/^\/+/, '') || null;
}

function isBunnyPath(rawPath: string, cdnHostname: string): boolean {
  const t = (rawPath || '').trim();
  if (!t) return false;
  if (t.startsWith('bunny://')) return true;
  if (t.includes('b-cdn.net')) return true;
  if (cdnHostname && t.includes(cdnHostname)) return true;
  if (/^sop-(documents|files|videos|slides)\//i.test(t)) return true;
  return false;
}

async function checkExists(relPath: string, config: BunnyConfig): Promise<boolean> {
  if (!config.storageZone || !config.apiKey) return false;
  const url = `https://${config.storageHostname}/${config.storageZone}/${relPath}`;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { AccessKey: config.apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkAllConcurrently(
  relPaths: Map<string, boolean>, // relPath → placeholder
  config: BunnyConfig,
  concurrency = 20,
): Promise<Map<string, boolean>> { // relPath → exists
  const result = new Map<string, boolean>();
  const queue = Array.from(relPaths.keys());

  const worker = async () => {
    while (queue.length > 0) {
      const relPath = queue.shift();
      if (!relPath) break;
      result.set(relPath, await checkExists(relPath, config));
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => worker()),
  );

  return result;
}

// ── Core scan logic ───────────────────────────────────────────────────────────

async function buildRows(): Promise<{
  rows: BunnySyncRow[];
  relPathSet: Map<string, true>;
  config: BunnyConfig;
}> {
  const config = getBunnyConfig();

  const [sops, libs, artifacts, supersedes] = await Promise.all([
    SOP.find({}, { _id: 1, name: 1, identifier: 1, department: 1, fileUrl: 1, fileType: 1 }).lean(),
    SOPLibrary.find({}, { _id: 1, sopIdentifier: 1, sopName: 1, department: 1, sopDocuments: 1 }).lean(),
    SOPVersionArtifacts.find({}, { _id: 1, identifier: 1, sopName: 1, department: 1, language: 1, entries: 1 }).lean(),
    SupersedeSOPVersion.find({}, { _id: 1, sopNo: 1, language: 1, version: 1, docxPath: 1, pdfPath: 1 }).lean(),
  ]);

  const rows: BunnySyncRow[] = [];
  const relPathSet = new Map<string, true>();

  const addRow = (row: BunnySyncRow) => {
    rows.push(row);
    if (row.relPath) relPathSet.set(row.relPath, true);
  };

  // ── SOP.fileUrl ──────────────────────────────────────────────────────────
  for (const sop of sops as any[]) {
    const dbPath: string = sop.fileUrl || '';
    const empty = !dbPath;
    const isBunny = !empty && isBunnyPath(dbPath, config.cdnHostname);
    const relPath = isBunny ? extractRelPath(dbPath, config.cdnHostname) : null;
    addRow({
      key: `sop-${sop._id}`,
      source: 'sop',
      docId: String(sop._id),
      identifier: sop.identifier || '',
      name: sop.name,
      department: sop.department || '',
      fileType: sop.fileType || 'unknown',
      dbPath,
      relPath,
      status: empty ? 'empty' : isBunny ? 'missing' : 'not_bunny', // will be overwritten after check
    });
  }

  // ── SOPLibrary.sopDocuments ───────────────────────────────────────────────
  for (const lib of libs as any[]) {
    const docs: any[] = lib.sopDocuments ?? [];
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const dbPath: string = doc.filePath || '';
      const empty = !dbPath;
      const isBunny = !empty && isBunnyPath(dbPath, config.cdnHostname);
      const relPath = isBunny ? extractRelPath(dbPath, config.cdnHostname) : null;
      addRow({
        key: `lib-${lib._id}-${i}`,
        source: 'library',
        docId: String(lib._id),
        identifier: lib.sopIdentifier || '',
        name: lib.sopName,
        department: lib.department || '',
        fileType: doc.fileType || 'unknown',
        language: doc.language,
        dbPath,
        relPath,
        status: empty ? 'empty' : isBunny ? 'missing' : 'not_bunny',
      });
    }
  }

  // ── SOPVersionArtifacts.entries ───────────────────────────────────────────
  for (const art of artifacts as any[]) {
    const entries: any[] = art.entries ?? [];
    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei];
      for (const [field, ft] of [['docxPath', 'docx'], ['pdfPath', 'pdf']] as const) {
        const dbPath: string = entry[field] || '';
        const empty = !dbPath;
        const isBunny = !empty && isBunnyPath(dbPath, config.cdnHostname);
        const relPath = isBunny ? extractRelPath(dbPath, config.cdnHostname) : null;
        addRow({
          key: `art-${art._id}-${ei}-v${entry.version}-${ft}`,
          source: 'version',
          docId: String(art._id),
          identifier: art.identifier || '',
          name: art.sopName,
          department: art.department || '',
          fileType: ft,
          version: entry.version,
          language: art.language,
          dbPath,
          relPath,
          status: empty ? 'empty' : isBunny ? 'missing' : 'not_bunny',
        });
      }
    }
  }

  // ── SupersedeSOPVersion ───────────────────────────────────────────────────
  for (const sup of supersedes as any[]) {
    for (const [field, ft] of [['docxPath', 'docx'], ['pdfPath', 'pdf']] as const) {
      const dbPath: string = sup[field] || '';
      const empty = !dbPath;
      const isBunny = !empty && isBunnyPath(dbPath, config.cdnHostname);
      const relPath = isBunny ? extractRelPath(dbPath, config.cdnHostname) : null;
      addRow({
        key: `sup-${sup._id}-${ft}`,
        source: 'supersede',
        docId: String(sup._id),
        identifier: sup.sopNo || '',
        department: '',
        fileType: ft,
        version: sup.version,
        language: sup.language,
        dbPath,
        relPath,
        status: empty ? 'empty' : isBunny ? 'missing' : 'not_bunny',
      });
    }
  }

  return { rows, relPathSet, config };
}

async function runScan(): Promise<{
  rows: BunnySyncRow[];
  config: BunnyConfig;
  missingRelPaths: string[];
  missingRawPaths: string[];
  summary: {
    total: number;
    bunnyPaths: number;
    found: number;
    missing: number;
    notBunny: number;
    empty: number;
  };
}> {
  const { rows, relPathSet, config } = await buildRows();

  // Check only rows that have a Bunny rel path
  const checkResults = await checkAllConcurrently(relPathSet, config);

  // Map relPath existence back onto rows
  const missingRelPaths: string[] = [];
  const missingRawPaths: string[] = [];

  for (const row of rows) {
    if (row.relPath) {
      const exists = checkResults.get(row.relPath) ?? false;
      row.status = exists ? 'found' : 'missing';
      if (!exists) {
        if (!missingRelPaths.includes(row.relPath)) missingRelPaths.push(row.relPath);
        if (row.dbPath && !missingRawPaths.includes(row.dbPath)) missingRawPaths.push(row.dbPath);
      }
    }
  }

  const bunnyRows = rows.filter((r) => r.relPath !== null);
  const summary = {
    total: rows.length,
    bunnyPaths: bunnyRows.length,
    found: rows.filter((r) => r.status === 'found').length,
    missing: rows.filter((r) => r.status === 'missing').length,
    notBunny: rows.filter((r) => r.status === 'not_bunny').length,
    empty: rows.filter((r) => r.status === 'empty').length,
  };

  return { rows, config, missingRelPaths, missingRawPaths, summary };
}

// ── GET — preview scan (no DB writes) ─────────────────────────────────────────

export async function GET() {
  try {
    await connectDB();
    const { rows, summary } = await runScan();
    return Response.json({ success: true, ...summary, rows });
  } catch (err) {
    console.error('[bunny-sync GET]', err);
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// ── POST — scan + sync DB ─────────────────────────────────────────────────────

export async function POST() {
  try {
    await connectDB();
    const { rows, missingRelPaths, missingRawPaths, summary } = await runScan();

    let dbCleared = 0;

    if (missingRawPaths.length > 0) {
      // SOP.fileUrl
      const sopRes = await SOP.updateMany(
        { fileUrl: { $in: missingRawPaths } },
        { $set: { fileUrl: '' } },
      );
      dbCleared += sopRes.modifiedCount;

      // SOPLibrary.sopDocuments — pull entire subdoc
      const libRes = await SOPLibrary.updateMany(
        { 'sopDocuments.filePath': { $in: missingRawPaths } },
        { $pull: { sopDocuments: { filePath: { $in: missingRawPaths } } } },
      );
      dbCleared += libRes.modifiedCount;

      // SOPVersionArtifacts.entries[].docxPath
      const artDocxRes = await SOPVersionArtifacts.updateMany(
        { 'entries.docxPath': { $in: missingRawPaths } },
        { $unset: { 'entries.$[elem].docxPath': '' } },
        { arrayFilters: [{ 'elem.docxPath': { $in: missingRawPaths } }] },
      );
      dbCleared += artDocxRes.modifiedCount;

      // SOPVersionArtifacts.entries[].pdfPath
      const artPdfRes = await SOPVersionArtifacts.updateMany(
        { 'entries.pdfPath': { $in: missingRawPaths } },
        { $unset: { 'entries.$[elem].pdfPath': '' } },
        { arrayFilters: [{ 'elem.pdfPath': { $in: missingRawPaths } }] },
      );
      dbCleared += artPdfRes.modifiedCount;

      // SupersedeSOPVersion.docxPath
      const supDocxRes = await SupersedeSOPVersion.updateMany(
        { docxPath: { $in: missingRawPaths } },
        { $unset: { docxPath: '' } },
      );
      dbCleared += supDocxRes.modifiedCount;

      // SupersedeSOPVersion.pdfPath
      const supPdfRes = await SupersedeSOPVersion.updateMany(
        { pdfPath: { $in: missingRawPaths } },
        { $unset: { pdfPath: '' } },
      );
      dbCleared += supPdfRes.modifiedCount;

      invalidateDashboardSopsCache();
    }

    return Response.json({
      success: true,
      ...summary,
      dbCleared,
      missingRelPaths,
      rows,
    });
  } catch (err) {
    console.error('[bunny-sync POST]', err);
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
