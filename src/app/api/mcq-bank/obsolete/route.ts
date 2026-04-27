import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

// Extract family prefix: "QAGE01-10" → "QAGE01", else return identifier as-is
function familyPrefix(identifier: string): string {
  const m = identifier.match(/^([A-Za-z]{2,6}\d+)-\d+$/);
  return m ? m[1] : identifier;
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    // Same source of truth as Dashboard obsolete list: SOP.isObsolete
    const obsoleteSops = await SOP.find({ isObsolete: true })
      .select('name identifier department language obsoleteAt obsoleteReason')
      .lean() as any[];

    // Group by family key (QAGE01) so all revisions collapse into one entry
    const byFamily = new Map<string, any>();
    for (const sop of obsoleteSops) {
      const id = String(sop.identifier || '').trim();
      if (!id) continue;
      const fk = familyPrefix(id);
      if (!byFamily.has(fk)) {
        byFamily.set(fk, {
          sopIdentifier: id, // representative, will pick highest rev below
          familyKey: fk,
          sopName: sop.name || '',
          department: sop.department || '',
          language: sop.language || '',
          obsoleteAt: sop.obsoleteAt || null,
          obsoleteReason: sop.obsoleteReason || null,
          _revisions: [id],
        });
      } else {
        const entry = byFamily.get(fk);
        entry._revisions.push(id);
        // choose highest revision identifier for display
        const currentRev = parseInt((String(entry.sopIdentifier).match(/-(\d+)$/) || [])[1] || '0', 10);
        const thisRev = parseInt((id.match(/-(\d+)$/) || [])[1] || '0', 10);
        if (thisRev > currentRev) {
          entry.sopIdentifier = id;
          entry.sopName = sop.name || entry.sopName;
          entry.obsoleteAt = sop.obsoleteAt || entry.obsoleteAt;
          entry.obsoleteReason = sop.obsoleteReason || entry.obsoleteReason;
          entry.department = sop.department || entry.department;
          entry.language = sop.language || entry.language;
        }
      }
    }

    // Aggregate totalQuestions per sopIdentifier (all revisions), then roll up into families
    const allRevisionIds = Array.from(byFamily.values()).flatMap((e: any) => e._revisions);
    const totalsByIdentifier = allRevisionIds.length
      ? await db.collection('mcqbanks').aggregate([
          { $match: { sopIdentifier: { $in: allRevisionIds } } },
          {
            $project: {
              sopIdentifier: 1,
              totalQuestions: { $size: { $ifNull: ['$mcqs', []] } },
            },
          },
          { $group: { _id: '$sopIdentifier', totalQuestions: { $sum: '$totalQuestions' } } },
        ]).toArray()
      : [];
    const totalByIdentifier = new Map<string, number>(
      totalsByIdentifier.map((t: any) => [String(t._id || '').trim(), Number(t.totalQuestions || 0)]),
    );

    const obsoleteSOPs = Array.from(byFamily.values())
      .map(({ _revisions, familyKey, ...rest }: any) => {
        const totalQuestions = (_revisions || []).reduce(
          (sum: number, id: string) => sum + (totalByIdentifier.get(String(id).trim()) ?? 0),
          0,
        );
        return { ...rest, totalQuestions };
      })
      .sort((a: any, b: any) => String(a.sopIdentifier || '').localeCompare(String(b.sopIdentifier || '')));

    return NextResponse.json({
      success: true,
      obsoleteSOPs,
      total: obsoleteSOPs.length,
    });
  } catch (error) {
    console.error('[mcq-bank/obsolete] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch obsolete SOPs',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

