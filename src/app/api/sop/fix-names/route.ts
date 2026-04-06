import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { loadStoredFileBuffer } from '@/lib/loadStoredFileBuffer';
import { extractTitleFromDocx, extractTitleFromPdf } from '@/lib/extractSopTitleFromFile';
import { fileKindFromStoredPath } from '@/lib/filePathFileKind';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Returns true when the stored name is junk:
 * - contains a slash (path stored as name)
 * - is a single generic word like "sops", "documents", etc.
 * - looks like just the SOP code
 * - is very short
 */
function nameIsJunk(name: string, identifier: string): boolean {
  const t = (name || '').trim();
  if (!t || t.length < 3) return true;
  if (/[/\\]/.test(t)) return true;

  const genericWords = [
    'sops', 'sop', 'documents', 'document', 'doc', 'docs',
    'files', 'file', 'folder', 'folders', 'archive', 'archives',
    'production', 'qa', 'qc', 'quality assurance', 'quality control',
    'personnel', 'hr', 'stores', 'store', 'microbiology', 'micro',
    'engineering', 'maintenance', 'warehouse', 'dispatch',
  ];
  if (genericWords.includes(t.toLowerCase())) return true;

  // Just the SOP code
  const idKey = identifier.toUpperCase().replace(/[-\s]/g, '');
  if (t.toUpperCase().replace(/[-\s]/g, '') === idKey) return true;

  return false;
}

/**
 * POST /api/sop/fix-names
 * Scans all SOP records whose `name` field is junk (path, generic word, SOP code),
 * reads the actual DOCX/PDF file, extracts the real title from inside, and updates Mongo.
 *
 * Optionally scope to a single SOP: body { identifier: "QAGE40-04" }
 * Or fix all at once:              body {} or body { all: true }
 *
 * Returns: { fixed: number, skipped: number, failed: number, results: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json().catch(() => ({}));
    const { identifier, all, dryRun } = body as {
      identifier?: string;
      all?: boolean;
      dryRun?: boolean;
    };

    // Build query — if identifier given, target that SOP; else find all with junk names
    let query: any = {};
    if (identifier) {
      query = { identifier: { $regex: `^${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } };
    } else if (all) {
      // Target SOPs whose names look like paths or generic words
      query = {
        $or: [
          { name: { $regex: '[/\\\\]' } },                  // contains slash
          { name: { $regex: '^sops?$', $options: 'i' } },   // "sop" or "sops"
          { name: { $regex: '^documents?$', $options: 'i' } },
          { name: { $regex: '^files?$', $options: 'i' } },
          { name: { $regex: '^folders?$', $options: 'i' } },
          { name: { $regex: '^(qa|qc|production|stores?|hr|micro|engineering|maintenance)$', $options: 'i' } },
          { name: { $exists: false } },
          { name: '' },
        ],
      };
    } else {
      return NextResponse.json(
        { error: 'Provide { identifier } to fix one SOP, or { all: true } to fix all with junk names.' },
        { status: 400 },
      );
    }

    const sops = await SOP.find(query)
      .select('_id identifier name fileUrl fileType originalFileName')
      .lean();

    const results: { identifier: string; oldName: string; newName: string | null; status: string }[] = [];
    let fixed = 0, skipped = 0, failed = 0;

    for (const sop of sops as any[]) {
      const id = String(sop.identifier || '').trim();
      const oldName = String(sop.name || '').trim();

      if (!nameIsJunk(oldName, id)) {
        skipped++;
        results.push({ identifier: id, oldName, newName: null, status: 'skipped (name looks ok)' });
        continue;
      }

      const fileUrl = String(sop.fileUrl || '').trim();
      if (!fileUrl) {
        failed++;
        results.push({ identifier: id, oldName, newName: null, status: 'failed (no fileUrl)' });
        continue;
      }

      try {
        const buffer = await loadStoredFileBuffer(
          fileUrl.replace(/^\/+/, ''),
          { trustedRemote: true },
        );

        if (!buffer) {
          failed++;
          results.push({ identifier: id, oldName, newName: null, status: 'failed (could not load file)' });
          continue;
        }

        const kind = fileKindFromStoredPath(fileUrl, sop.fileType);
        let extractedTitle: string | null = null;

        if (kind === 'docx' || kind === 'doc') {
          extractedTitle = await extractTitleFromDocx(buffer, id);
        } else if (kind === 'pdf') {
          extractedTitle = await extractTitleFromPdf(buffer, id);
        }

        if (!extractedTitle || extractedTitle.length < 4) {
          // Fallback: use originalFileName cleaned up
          const fn = String(sop.originalFileName || '').trim();
          if (fn && fn.length > 4) {
            extractedTitle = fn
              .replace(/\.(docx|doc|pdf)$/i, '')
              .replace(/[_-]+/g, ' ')
              .replace(/[\s,\-–—]*[A-Za-z]{1,8}\d{1,4}[-\u2013\u2014]\d{1,4}\s*$/i, '')
              .trim();
          }
        }

        if (!extractedTitle || extractedTitle.length < 4 || nameIsJunk(extractedTitle, id)) {
          failed++;
          results.push({ identifier: id, oldName, newName: null, status: 'failed (could not extract title from file)' });
          continue;
        }

        if (!dryRun) {
          await SOP.updateOne({ _id: sop._id }, { $set: { name: extractedTitle } });
        }

        fixed++;
        results.push({ identifier: id, oldName, newName: extractedTitle, status: dryRun ? 'dry-run' : 'fixed' });
      } catch (err: any) {
        failed++;
        results.push({ identifier: id, oldName, newName: null, status: `failed (${err?.message || 'error'})` });
      }
    }

    return NextResponse.json({
      success: true,
      total: sops.length,
      fixed,
      skipped,
      failed,
      dryRun: Boolean(dryRun),
      results,
    });
  } catch (err: any) {
    console.error('[fix-names]', err);
    return NextResponse.json({ error: 'Failed to fix SOP names', detail: err?.message }, { status: 500 });
  }
}
