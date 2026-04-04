import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import nodePath from 'path';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import { uploadToBunny, getBunnyCdnUrl, isBunnyPath } from '@/lib/bunnyStorage';
import { resolveFilePath, normalizePath } from '@/lib/filePathResolver';

const BATCH_SIZE = 5; // concurrent uploads

function isLocalPath(url: string): boolean {
  const t = (url || '').trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (isBunnyPath(t)) return false;
  return true;
}

/** Derive a clean Bunny destination path from the original local path.
 *  e.g. uploads/sops/5.+STORE/BSGE/BSGE02-01/file.docx → sop-documents/STORE/file.docx
 *  Keeps the filename; puts it under sop-documents/<dept-segment>/
 */
function buildBunnyDestPath(localPath: string): string {
  const norm = localPath.replace(/^\/+/, '').replace(/\\/g, '/');
  const parts = norm.split('/');
  const filename = parts[parts.length - 1];

  // Try to find a department segment (after uploads/sops/ or uploads/sop-library/)
  const sopIdx = parts.findIndex((p) => /^sops?$/i.test(p) || /^sop-library$/i.test(p) || /^sop-pdfs$/i.test(p));
  const deptSegment = sopIdx >= 0 && parts[sopIdx + 1]
    ? parts[sopIdx + 1].replace(/^\d+\.\+?/, '').replace(/\+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '_').toUpperCase()
    : 'GENERAL';

  return `sop-documents/${deptSegment}/${filename}`;
}

async function readLocalFile(localPath: string): Promise<Buffer | null> {
  const normalized = normalizePath(localPath.replace(/^\/+/, ''));
  const abs = await resolveFilePath(normalized);
  if (abs) {
    try { return await fs.readFile(abs); } catch { /* fall through */ }
  }
  // Try public/ prefix
  try {
    const publicPath = nodePath.join(process.cwd(), 'public', normalized);
    return await fs.readFile(publicPath);
  } catch {
    return null;
  }
}

type MigrateResult = {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  details: { id: string; path: string; result: 'migrated' | 'skipped' | 'failed'; cdnUrl?: string; reason?: string }[];
};

export async function GET(request: NextRequest) {
  // GET = dry run: just count how many local-path records exist
  await connectDB();
  const dryRun = request.nextUrl.searchParams.get('dry') !== '0';

  const sops = await SOP.find({}).select('_id identifier fileUrl fileType language').lean();
  const localSops = sops.filter((s) => isLocalPath((s as any).fileUrl));

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      localPathCount: localSops.length,
      sample: localSops.slice(0, 5).map((s) => ({
        identifier: (s as any).identifier,
        fileUrl: (s as any).fileUrl,
      })),
    });
  }

  return NextResponse.json({ message: 'Use POST to run migration' });
}

export async function POST(request: NextRequest) {
  await connectDB();

  const body = await request.json().catch(() => ({}));
  const limitParam = Number(body?.limit) || 0; // 0 = no limit

  // 1. Collect all SOP records with local paths
  const allSops = await SOP.find({}).select('_id identifier fileUrl fileType language').lean();
  const localSops = allSops.filter((s) => isLocalPath((s as any).fileUrl));
  const toProcess = limitParam > 0 ? localSops.slice(0, limitParam) : localSops;

  const result: MigrateResult = {
    total: toProcess.length,
    migrated: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  // Process in batches
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (sop) => {
        const localUrl = ((sop as any).fileUrl || '').trim();
        const identifier = (sop as any).identifier || String((sop as any)._id);

        // Check if already on Bunny CDN by guessing the dest path first
        const destPath = buildBunnyDestPath(localUrl);
        const candidateCdnUrl = getBunnyCdnUrl(destPath);

        // Quick HEAD to see if already migrated
        try {
          const headRes = await fetch(candidateCdnUrl, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
          if (headRes.ok) {
            // Already on Bunny — just update DB record
            await SOP.updateOne({ _id: (sop as any)._id }, { $set: { fileUrl: `bunny://${destPath}` } });
            result.skipped++;
            result.details.push({ id: identifier, path: localUrl, result: 'skipped', cdnUrl: candidateCdnUrl, reason: 'already on CDN' });
            return;
          }
        } catch { /* file not on CDN yet, proceed to upload */ }

        // Read file from local disk
        const buf = await readLocalFile(localUrl);
        if (!buf) {
          result.failed++;
          result.details.push({ id: identifier, path: localUrl, result: 'failed', reason: 'file not found on disk' });
          return;
        }

        // Upload to Bunny
        const cdnUrl = await uploadToBunny(buf, destPath);
        if (!cdnUrl) {
          result.failed++;
          result.details.push({ id: identifier, path: localUrl, result: 'failed', reason: 'Bunny upload failed' });
          return;
        }

        // Update DB record
        await SOP.updateOne({ _id: (sop as any)._id }, { $set: { fileUrl: `bunny://${destPath}` } });
        result.migrated++;
        result.details.push({ id: identifier, path: localUrl, result: 'migrated', cdnUrl });
      }),
    );
  }

  // Also migrate SOPLibrary sopDocuments with local filePaths
  try {
    const libs = await SOPLibrary.find({}).select('_id sopIdentifier sopDocuments language').lean();
    for (const lib of libs) {
      const docs = ((lib as any).sopDocuments || []) as { filePath?: string; fileType?: string }[];
      let changed = false;
      const updatedDocs = await Promise.all(
        docs.map(async (doc) => {
          const fp = (doc.filePath || '').trim();
          if (!fp || !isLocalPath(fp)) return doc;
          const destPath = buildBunnyDestPath(fp);
          const candidateCdnUrl = getBunnyCdnUrl(destPath);
          try {
            const headRes = await fetch(candidateCdnUrl, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
            if (headRes.ok) {
              changed = true;
              return { ...doc, filePath: `bunny://${destPath}` };
            }
          } catch { /* not on CDN */ }
          const buf = await readLocalFile(fp);
          if (!buf) return doc;
          const cdnUrl = await uploadToBunny(buf, destPath);
          if (!cdnUrl) return doc;
          changed = true;
          return { ...doc, filePath: `bunny://${destPath}` };
        }),
      );
      if (changed) {
        await SOPLibrary.updateOne({ _id: (lib as any)._id }, { $set: { sopDocuments: updatedDocs } });
      }
    }
  } catch (err) {
    console.error('[migrate-to-bunny] SOPLibrary migration error:', err);
  }

  return NextResponse.json(result);
}
