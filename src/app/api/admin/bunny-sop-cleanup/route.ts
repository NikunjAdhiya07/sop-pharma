/**
 * /api/admin/bunny-sop-cleanup
 *
 * GET  – Crawl Bunny storage, group DOCX files by exact normalized identifier + language.
 *         Only returns groups with 2+ files for the SAME identifier (true duplicates of the
 *         same version). Different version numbers (e.g. BSGE1-3 vs BSGE1-5) are separate
 *         groups and are NOT considered duplicates of each other.
 *         Each group is sorted newest-first (by timestamp embedded in the filename).
 *         files[0] = keep (newest), files[1..] = old (to delete).
 *
 * POST – body: one of:
 *   { action: 'delete',  deletePaths: string[] }
 *       → Delete the listed paths from Bunny.
 *   { action: 'fix-dates', refreshEntries: Array<{ cdnUrl, identifier }> }
 *       → Download each DOCX, re-parse the review date, update SOP DB records.
 *   { action: 'delete-and-fix', deletePaths: string[], refreshEntries: Array<{ cdnUrl, identifier }> }
 *       → Both of the above.
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { parseDOCX } from '@/lib/documentParser';
import { extractDatesFromContent } from '@/lib/dateExtractor';
import { normalizeSopIdentifierKey } from '@/lib/sopIdentifierNormalize';
import { crawl, getBunnyConfig, parseStoragePath } from '@/lib/bunnyVersionSync';
import { deleteFromBunny } from '@/lib/bunnyStorage';

export const dynamic = 'force-dynamic';

export interface FileEntry {
  storagePath: string;
  cdnUrl: string;
  identifier: string;   // normalized, e.g. "BSGE1-5"
  version: number;
  language: string;
  department: string;
  filenameTimestamp: number; // ms epoch embedded in filename, 0 if not found
}

export interface DuplicateGroup {
  identifier: string;   // exact normalized identifier, e.g. "BSGE1-5"
  language: string;
  department: string;
  files: FileEntry[];   // sorted newest-first; files[0] = keep
}

/** Extract a Unix-ms timestamp embedded in filenames like QAGE01-01_1730123456789.docx */
function extractTimestampFromFilename(name: string): number {
  const stem = name.replace(/\.(docx?|pdf)$/i, '');
  const parts = stem.split('_');
  for (let i = parts.length - 1; i >= 0; i--) {
    const n = parseInt(parts[i], 10);
    // Valid JS timestamp range: 2020-01-01 → 2050-01-01
    if (!isNaN(n) && n > 1_577_836_800_000 && n < 2_524_608_000_000) return n;
  }
  return 0;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const { storageZone, apiKey, cdnHostname, storageHostname } = getBunnyConfig();
  if (!storageZone || !apiKey || !cdnHostname) {
    return NextResponse.json({ success: false, error: 'Bunny not configured' }, { status: 500 });
  }

  let rawFiles: { storagePath: string; cdnUrl: string; ext: 'docx' | 'pdf' }[];
  try {
    rawFiles = await crawl(storageHostname, storageZone, apiKey, cdnHostname);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: `Bunny crawl failed: ${err.message}` }, { status: 500 });
  }

  const docxFiles = rawFiles.filter((f) => f.ext === 'docx');

  // Group by (exact normalized identifier + language).
  // BSGE1-3, BSGE1-4, BSGE1-5 are THREE separate groups — only within each group
  // do we consider multiple files to be duplicates.
  const groups = new Map<string, FileEntry[]>();

  for (const f of docxFiles) {
    const parsed = parseStoragePath(f.storagePath);
    if (!parsed) continue;

    const normId = normalizeSopIdentifierKey(parsed.identifier);
    const groupKey = `${normId}::${parsed.language}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);

    const fileName = f.storagePath.split('/').pop() || '';
    groups.get(groupKey)!.push({
      storagePath: f.storagePath,
      cdnUrl: f.cdnUrl,
      identifier: normId,
      version: parsed.version,
      language: parsed.language,
      department: parsed.department,
      filenameTimestamp: extractTimestampFromFilename(fileName),
    });
  }

  // Sort each group newest-first: highest timestamp first (same version, multiple uploads)
  for (const entries of groups.values()) {
    entries.sort((a, b) => b.filenameTimestamp - a.filenameTimestamp);
  }

  // Only surface groups with 2+ files (true duplicates of the same identifier)
  const duplicates: DuplicateGroup[] = [];
  for (const [key, entries] of groups.entries()) {
    if (entries.length < 2) continue;
    const [normId, lang] = key.split('::');
    duplicates.push({
      identifier: normId,
      language: lang,
      department: entries[0].department,
      files: entries,
    });
  }

  duplicates.sort((a, b) => a.identifier.localeCompare(b.identifier));

  return NextResponse.json({
    success: true,
    totalGroups: duplicates.length,
    totalDocxFiles: docxFiles.length,
    totalOldFiles: duplicates.reduce((s, g) => s + g.files.length - 1, 0),
    duplicates,
  });
}

// ── POST ──────────────────────────────────────────────────────────────────────

async function doDelete(deletePaths: string[]) {
  const deleted: { path: string; ok: boolean }[] = [];
  const errors: string[] = [];
  for (const path of deletePaths) {
    try {
      const ok = await deleteFromBunny(path);
      deleted.push({ path, ok });
      if (!ok) errors.push(`Delete failed (no error thrown): ${path}`);
    } catch (err: any) {
      errors.push(`Delete ${path}: ${err.message}`);
      deleted.push({ path, ok: false });
    }
  }
  return { deleted, errors };
}

async function doFixDates(refreshEntries: Array<{ cdnUrl: string; identifier: string }>) {
  await connectDB();
  const dateRefresh: { identifier: string; reviewDate: string | null; sopUpdated: number }[] = [];
  const errors: string[] = [];

  for (const entry of refreshEntries) {
    try {
      const res = await fetch(entry.cdnUrl, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${entry.cdnUrl}`);

      const buffer = Buffer.from(await res.arrayBuffer());
      const parsed = await parseDOCX(buffer);
      const dates = extractDatesFromContent(parsed.content);
      const reviewDate = dates.reviewDate ?? null;

      let sopUpdated = 0;
      if (reviewDate) {
        // Match all non-obsolete SOP records whose identifier normalizes to the same key
        const normId = normalizeSopIdentifierKey(entry.identifier.trim().toUpperCase());
        const result = await SOP.updateMany(
          { identifier: { $regex: new RegExp(`^${normId.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') }, isObsolete: { $ne: true } },
          { $set: { reviewDate } },
        );
        sopUpdated = result.modifiedCount;
      }

      dateRefresh.push({
        identifier: entry.identifier,
        reviewDate: reviewDate ? reviewDate.toISOString() : null,
        sopUpdated,
      });
    } catch (err: any) {
      errors.push(`Refresh ${entry.identifier}: ${err.message}`);
      dateRefresh.push({ identifier: entry.identifier, reviewDate: null, sopUpdated: 0 });
    }
  }

  return { dateRefresh, errors };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    action = 'delete-and-fix',
    deletePaths = [],
    refreshEntries = [],
  } = body as {
    action?: 'delete' | 'fix-dates' | 'delete-and-fix';
    deletePaths?: string[];
    refreshEntries?: Array<{ cdnUrl: string; identifier: string }>;
  };

  const out: {
    deleted?: { path: string; ok: boolean }[];
    dateRefresh?: { identifier: string; reviewDate: string | null; sopUpdated: number }[];
    errors: string[];
  } = { errors: [] };

  if (action === 'delete' || action === 'delete-and-fix') {
    const { deleted, errors } = await doDelete(deletePaths);
    out.deleted = deleted;
    out.errors.push(...errors);
  }

  if (action === 'fix-dates' || action === 'delete-and-fix') {
    const { dateRefresh, errors } = await doFixDates(refreshEntries);
    out.dateRefresh = dateRefresh;
    out.errors.push(...errors);
  }

  return NextResponse.json({ success: true, results: out });
}
