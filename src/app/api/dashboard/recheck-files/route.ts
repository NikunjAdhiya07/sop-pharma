import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import SOPVersionArtifacts from '@/models/SOPVersionArtifacts';
import SupersedeSOPVersion from '@/models/SupersedeSOPVersion';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — many files to check

// ── Bunny Storage config ──────────────────────────────────────────────────────
function getBunnyConfig() {
  const storageZone = process.env.BUNNY_STORAGE_ZONE || '';
  const apiKey = process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY || '';
  const storageHostname = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
  const rawCdn = process.env.BUNNY_PULL_ZONE_URL || process.env.BUNNY_CDN_HOSTNAME || '';
  const cdnHostname = rawCdn.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return { storageZone, apiKey, storageHostname, cdnHostname };
}

/** Extract the relative storage path from any Bunny URL or path */
function extractRelativePath(rawPath: string, cdnHostname: string): string | null {
  const t = (rawPath || '').trim();
  if (!t) return null;

  // Full CDN URL: https://sop-pharma-indiana.b-cdn.net/sop-documents/...
  if (t.startsWith('http://') || t.startsWith('https://')) {
    try {
      const url = new URL(t);
      const rel = url.pathname.replace(/^\/+/, '');
      return rel || null;
    } catch {
      return null;
    }
  }

  // bunny:// URI
  if (t.startsWith('bunny://')) {
    return t.replace(/^bunny:\/\//, '') || null;
  }

  // Already a relative path (no protocol)
  return t.replace(/^\/+/, '') || null;
}

/** True if this path points to Bunny (not a local filesystem path) */
function isBunnyPath(rawPath: string, cdnHostname: string): boolean {
  const t = (rawPath || '').trim();
  if (!t) return false;
  if (t.startsWith('bunny://')) return true;
  if (t.includes('b-cdn.net')) return true;
  if (cdnHostname && t.includes(cdnHostname)) return true;
  // Relative CDN paths typically start with sop-documents/, sop-files/, etc.
  if (/^sop-(documents|files|videos|slides)\//i.test(t)) return true;
  return false;
}

/** Check a single file against Bunny Storage API (bypasses CDN edge cache) */
async function checkBunnyExists(
  relPath: string,
  config: ReturnType<typeof getBunnyConfig>,
): Promise<boolean> {
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

/** Concurrently check a list of {raw path → relative path} mappings */
async function checkAllPaths(
  paths: Map<string, string>, // rawPath → relPath
  config: ReturnType<typeof getBunnyConfig>,
  concurrency = 20,
): Promise<{ found: string[]; notFound: string[] }> {
  const entries = Array.from(paths.entries());
  const found: string[] = [];
  const notFound: string[] = [];

  const queue = [...entries];
  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const [rawPath, relPath] = item;
      const exists = await checkBunnyExists(relPath, config);
      if (exists) found.push(rawPath);
      else notFound.push(rawPath);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length || 1) }, () => worker()),
  );

  return { found, notFound };
}

export async function POST() {
  try {
    await connectDB();
    const config = getBunnyConfig();

    // ── 1. Collect all unique Bunny paths from every relevant model ───────────
    const pathMap = new Map<string, string>(); // rawPath → relPath

    const [sops, libs, artifacts, supersedes] = await Promise.all([
      SOP.find({}, { fileUrl: 1 }).lean(),
      SOPLibrary.find({}, { sopDocuments: 1 }).lean(),
      SOPVersionArtifacts.find({}, { entries: 1 }).lean(),
      SupersedeSOPVersion.find({}, { docxPath: 1, pdfPath: 1 }).lean(),
    ]);

    const addPath = (rawPath: string) => {
      if (!rawPath || pathMap.has(rawPath)) return;
      if (!isBunnyPath(rawPath, config.cdnHostname)) return;
      const rel = extractRelativePath(rawPath, config.cdnHostname);
      if (rel) pathMap.set(rawPath, rel);
    };

    for (const sop of sops as any[]) {
      addPath(sop.fileUrl);
    }
    for (const lib of libs as any[]) {
      for (const doc of (lib as any).sopDocuments ?? []) {
        addPath(doc.filePath);
      }
    }
    for (const art of artifacts as any[]) {
      for (const e of (art as any).entries ?? []) {
        addPath(e.docxPath);
        addPath(e.pdfPath);
      }
    }
    for (const sup of supersedes as any[]) {
      addPath((sup as any).docxPath);
      addPath((sup as any).pdfPath);
    }

    if (pathMap.size === 0) {
      return Response.json({
        success: true,
        checked: 0,
        found: 0,
        notFound: 0,
        dbCleared: 0,
        availability: {},
        message: 'No Bunny paths found in database.',
      });
    }

    // ── 2. Check every path against Bunny Storage API ─────────────────────────
    const { found: foundPaths, notFound: notFoundPaths } = await checkAllPaths(pathMap, config);

    // Build availability map (raw path → boolean) for the frontend overlay
    const availability: Record<string, boolean> = {};
    for (const p of foundPaths) availability[p] = true;
    for (const p of notFoundPaths) availability[p] = false;

    // ── 3. Remove missing paths from DB ───────────────────────────────────────
    let dbCleared = 0;

    if (notFoundPaths.length > 0) {
      // SOP.fileUrl — set to empty string (required field)
      const sopRes = await SOP.updateMany(
        { fileUrl: { $in: notFoundPaths } },
        { $set: { fileUrl: '' } },
      );
      dbCleared += sopRes.modifiedCount;

      // SOPLibrary.sopDocuments — PULL the whole subdoc so it's fully removed
      // We need to pull docs whose filePath is in notFoundPaths
      const libRes = await SOPLibrary.updateMany(
        { 'sopDocuments.filePath': { $in: notFoundPaths } },
        { $pull: { sopDocuments: { filePath: { $in: notFoundPaths } } } },
      );
      dbCleared += libRes.modifiedCount;

      // SOPVersionArtifacts.entries[].docxPath — unset the path field
      const artDocxRes = await SOPVersionArtifacts.updateMany(
        { 'entries.docxPath': { $in: notFoundPaths } },
        { $unset: { 'entries.$[elem].docxPath': '' } },
        { arrayFilters: [{ 'elem.docxPath': { $in: notFoundPaths } }] },
      );
      dbCleared += artDocxRes.modifiedCount;

      // SOPVersionArtifacts.entries[].pdfPath
      const artPdfRes = await SOPVersionArtifacts.updateMany(
        { 'entries.pdfPath': { $in: notFoundPaths } },
        { $unset: { 'entries.$[elem].pdfPath': '' } },
        { arrayFilters: [{ 'elem.pdfPath': { $in: notFoundPaths } }] },
      );
      dbCleared += artPdfRes.modifiedCount;

      // SupersedeSOPVersion.docxPath
      const supDocxRes = await SupersedeSOPVersion.updateMany(
        { docxPath: { $in: notFoundPaths } },
        { $unset: { docxPath: '' } },
      );
      dbCleared += supDocxRes.modifiedCount;

      // SupersedeSOPVersion.pdfPath
      const supPdfRes = await SupersedeSOPVersion.updateMany(
        { pdfPath: { $in: notFoundPaths } },
        { $unset: { pdfPath: '' } },
      );
      dbCleared += supPdfRes.modifiedCount;

      // Bust server-side dashboard cache
      void invalidateDashboardSopsCache();
    }

    return Response.json({
      success: true,
      checked: pathMap.size,
      found: foundPaths.length,
      notFound: notFoundPaths.length,
      dbCleared,
      availability,
      notFoundPaths, // return so client can show details
    });
  } catch (err) {
    console.error('[recheck-files]', err);
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// Keep GET for backward compat — just call POST handler
export { POST as GET };
