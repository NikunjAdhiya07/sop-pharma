import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';
import {
  buildReviewDateMaps,
  expiryDiffDays,
  hasDocxPathHint,
  isSopExpired,
  resolveSopReviewDate,
  startOfToday,
} from '@/lib/sopExpiry';
import { recheckSopDatesFromDocx } from '@/lib/recheckSopDatesFromDocx';

export const maxDuration = 300;

export interface ExpiredSopRow {
  _id: string;
  identifier: string;
  name: string;
  department: string;
  language: string;
  reviewDate: string | null;
  daysOverdue: number;
  hasDocx: boolean;
}

function buildMasterIndex(masters: any[]): Map<string, any[]> {
  const masterByIdentifier = new Map<string, any[]>();
  for (const m of masters) {
    const key = String(m.sopIdentifier || '').trim().toUpperCase();
    if (!key) continue;
    const arr = masterByIdentifier.get(key) || [];
    arr.push(m);
    masterByIdentifier.set(key, arr);
  }
  return masterByIdentifier;
}

function hasDocxAvailable(
  sop: any,
  masterByIdentifier: Map<string, any[]>,
): boolean {
  const idUpper = String(sop.identifier || '').trim().toUpperCase();
  const masters = masterByIdentifier.get(idUpper) || [];
  if (hasDocxPathHint(sop, masters)) return true;
  // Recheck can still resolve via Bunny search by identifier when DB paths are stale.
  return Boolean(idUpper);
}

// GET /api/admin/expired-sops — list SOPs expired per dashboard logic
export async function GET() {
  try {
    await connectDB();

    const today = startOfToday();
    const [sops, masters] = await Promise.all([
      SOP.find({ isObsolete: { $ne: true } })
        .select('_id identifier name department language reviewDate expiryDate fileUrl fileType sopDocuments updatedAt')
        .sort({ identifier: 1, updatedAt: -1 })
        .lean<any[]>(),
      MasterSOPRepository.find({})
        .select('sopIdentifier metadata sopDocument')
        .lean<any[]>(),
    ]);

    const maps = buildReviewDateMaps(masters);
    const masterByIdentifier = buildMasterIndex(masters);

    const byIdentifier = new Map<string, ExpiredSopRow>();

    for (const sop of sops) {
      const identifier = String(sop.identifier || '').trim().toUpperCase();
      if (!identifier) continue;

      const reviewDate = resolveSopReviewDate(sop, maps);
      if (!reviewDate || !isSopExpired(reviewDate, today)) continue;

      const diffDays = expiryDiffDays(reviewDate, today)!;
      const daysOverdue = Math.abs(diffDays);
      const existing = byIdentifier.get(identifier);

      if (existing) continue;

      byIdentifier.set(identifier, {
        _id: String(sop._id),
        identifier,
        name: String(sop.name || identifier),
        department: String(sop.department || ''),
        language: String(sop.language || 'English'),
        reviewDate: reviewDate.toISOString(),
        daysOverdue,
        hasDocx: hasDocxAvailable(sop, masterByIdentifier),
      });
    }

    const expired = Array.from(byIdentifier.values()).sort(
      (a, b) => b.daysOverdue - a.daysOverdue || a.identifier.localeCompare(b.identifier),
    );

    return NextResponse.json({
      success: true,
      total: expired.length,
      expired,
    });
  } catch (error) {
    console.error('[expired-sops] GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load expired SOPs',
      },
      { status: 500 },
    );
  }
}

// POST /api/admin/expired-sops — recheck dates from stored DOCX
// Body: { sopIds?: string[], identifiers?: string[], all?: boolean }
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const { sopIds = [], identifiers = [], all = false } = body as {
      sopIds?: string[];
      identifiers?: string[];
      all?: boolean;
    };

    let targetIds: string[] = [];

    if (all) {
      const today = startOfToday();
      const [sops, masters] = await Promise.all([
        SOP.find({ isObsolete: { $ne: true } })
          .select('_id identifier reviewDate expiryDate')
          .lean<any[]>(),
        MasterSOPRepository.find({}).select('sopIdentifier metadata').lean<any[]>(),
      ]);
      const maps = buildReviewDateMaps(masters);
      const seen = new Set<string>();

      for (const sop of sops) {
        const identifier = String(sop.identifier || '').trim().toUpperCase();
        if (!identifier || seen.has(identifier)) continue;
        const reviewDate = resolveSopReviewDate(sop, maps);
        if (!reviewDate || !isSopExpired(reviewDate, today)) continue;
        seen.add(identifier);
        targetIds.push(String(sop._id));
      }
    } else if (sopIds.length > 0) {
      targetIds = sopIds;
    } else if (identifiers.length > 0) {
      const idUpper = identifiers.map((i) => String(i).trim().toUpperCase()).filter(Boolean);
      const found = await SOP.find({
        isObsolete: { $ne: true },
        identifier: { $in: idUpper },
      })
        .select('_id identifier updatedAt')
        .sort({ updatedAt: -1 })
        .lean<any[]>();

      const seen = new Set<string>();
      for (const sop of found) {
        const key = String(sop.identifier || '').trim().toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        targetIds.push(String(sop._id));
      }
    }

    if (targetIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No SOPs selected for recheck' },
        { status: 400 },
      );
    }

    const masters = await MasterSOPRepository.find({})
      .select('sopIdentifier sopDocument metadata')
      .lean<any[]>();
    const masterByIdentifier = buildMasterIndex(masters);

    const results = [];
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    let errors = 0;

    for (const id of targetIds) {
      const result = await recheckSopDatesFromDocx(id, masterByIdentifier);
      results.push(result);
      if (result.status === 'updated') updated++;
      else if (result.status === 'unchanged') unchanged++;
      else if (result.status === 'skipped') skipped++;
      else errors++;
    }

    if (updated > 0) {
      void invalidateDashboardSopsCache();
    }

    return NextResponse.json({
      success: true,
      summary: { total: targetIds.length, updated, unchanged, skipped, errors },
      results,
    });
  } catch (error) {
    console.error('[expired-sops] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Recheck failed',
      },
      { status: 500 },
    );
  }
}
