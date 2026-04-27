import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { sopFamilyKeyFromIdentifier } from '@/lib/sopIdentifierNormalize';

export const dynamic = 'force-dynamic';

// GET /api/admin/sop-duplicates
// Returns groups of SOPs that share the same family key (letters+docNum) and language,
// with 2+ entries. Each group is sorted newest-first. The first entry is the "keep" candidate.
export async function GET() {
  try {
    await connectDB();

    const allSops = await SOP.find(
      { isObsolete: { $ne: true } },
      { _id: 1, name: 1, identifier: 1, department: 1, language: 1, reviewDate: 1, uploadedAt: 1, createdAt: 1, version: 1 }
    )
      .sort({ uploadedAt: -1 })
      .lean();

    // Group by familyKey + language
    const groups = new Map<string, any[]>();
    for (const sop of allSops as any[]) {
      const id = String(sop.identifier || '').trim();
      const fk = sopFamilyKeyFromIdentifier(id);
      if (!fk) continue;
      const lang = String(sop.language || 'English').trim();
      const key = `${fk}::${lang}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(sop);
    }

    // Keep only groups with 2+ entries (true duplicates)
    const duplicates: Array<{
      familyKey: string;
      language: string;
      entries: any[];
    }> = [];

    for (const [key, entries] of groups.entries()) {
      if (entries.length < 2) continue;
      const [fk, lang] = key.split('::');
      duplicates.push({
        familyKey: fk,
        language: lang,
        // already sorted newest-first (from the DB query sort)
        entries: entries.map((e) => ({
          _id: String(e._id),
          name: e.name,
          identifier: e.identifier,
          department: e.department,
          language: e.language,
          reviewDate: e.reviewDate ?? null,
          uploadedAt: e.uploadedAt ?? e.createdAt ?? null,
          version: e.version ?? null,
        })),
      });
    }

    // Sort duplicate groups alphabetically by familyKey for readability
    duplicates.sort((a, b) => a.familyKey.localeCompare(b.familyKey));

    return NextResponse.json({
      success: true,
      totalDuplicateGroups: duplicates.length,
      totalOldEntries: duplicates.reduce((sum, g) => sum + g.entries.length - 1, 0),
      duplicates,
    });
  } catch (err: any) {
    console.error('[sop-duplicates GET]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/admin/sop-duplicates
// Body: { action: 'obsolete' | 'delete', ids: string[] }
// Marks the given SOP IDs as obsolete (or deletes them if action=delete).
// Only acts on non-newest entries — the caller should never pass the newest ID in a group.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action = 'obsolete', ids } = body as { action?: string; ids: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: 'ids must be a non-empty array' }, { status: 400 });
    }

    await connectDB();

    if (action === 'delete') {
      const result = await SOP.deleteMany({ _id: { $in: ids } });
      return NextResponse.json({ success: true, action: 'deleted', count: result.deletedCount });
    }

    // Default: mark as obsolete
    const result = await SOP.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          isObsolete: true,
          obsoleteAt: new Date(),
          obsoleteReason: 'Superseded by newer upload with corrected review date',
        },
      }
    );

    return NextResponse.json({ success: true, action: 'obsoleted', count: result.modifiedCount });
  } catch (err: any) {
    console.error('[sop-duplicates POST]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
