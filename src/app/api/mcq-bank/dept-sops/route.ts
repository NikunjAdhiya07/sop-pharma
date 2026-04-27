import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

/**
 * GET /api/mcq-bank/dept-sops?dept=QA%20Department
 *
 * Returns a lightweight list of SOPs for a single department without loading
 * the entire tree. Each SOP entry contains:
 *   - sopId, sopCode (identifier), sopName
 *   - totalQuestions, checkedCount, reviewedCount, similarCount
 *   - mcqBanks: [{ _id }] — just the bank IDs so the client can lazy-fetch full data
 *
 * This endpoint is used by the dept-modal to populate the SOP table lazily,
 * instead of the monolithic /api/mcq-bank/tree call.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const dept = searchParams.get('dept');
    const includeObsolete = searchParams.get('includeObsolete') === '1';

    if (!dept) {
      return NextResponse.json({ error: 'dept query param required' }, { status: 400 });
    }

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const mcqBankCollection = db.collection('mcqbanks');

    // Single pipeline: match dept, project only counts (no mcqs array content)
    const banks = await mcqBankCollection.aggregate([
      {
        $match: includeObsolete
          ? { department: dept }
          : { department: dept, isObsolete: { $ne: true } },
      },
      {
        $project: {
          _id: 1,
          sopId: 1,
          sopIdentifier: 1,
          sopName: 1,
          department: 1,
          totalQuestions: 1,
          language: 1,
          checkedCount: {
            $size: {
              $filter: {
                input: { $ifNull: ['$mcqs', []] },
                as: 'mcq',
                cond: { $eq: ['$$mcq.isChecked', true] },
              },
            },
          },
          reviewedCount: {
            $size: {
              $filter: {
                input: { $ifNull: ['$mcqs', []] },
                as: 'mcq',
                cond: { $eq: ['$$mcq.isReviewed', true] },
              },
            },
          },
          similarCount: {
            $size: {
              $filter: {
                input: { $ifNull: ['$mcqs', []] },
                as: 'mcq',
                cond: { $eq: ['$$mcq.isSimilar', true] },
              },
            },
          },
        },
      },
      { $sort: { sopIdentifier: 1 } },
    ]).toArray();

    // Also pull SOP model for fileUrl / fileType (needed for the SOP download button)
    const sopIds = [...new Set(banks.map((b: any) => b.sopId).filter(Boolean))];
    const sops = sopIds.length
      ? await SOP.find({ _id: { $in: sopIds } })
          .select('_id name identifier department fileUrl fileType')
          .lean()
      : [];

    const sopMap = new Map(sops.map((s: any) => [String(s._id), s]));

    // Group banks by sopId so multi-language SOPs are merged
    const grouped: Record<string, any> = {};
    for (const bank of banks as any[]) {
      const key = bank.sopId?.toString() ?? bank._id.toString();
      if (!grouped[key]) {
        const sopDoc = sopMap.get(key);
        grouped[key] = {
          sopId: key,
          sopCode: bank.sopIdentifier ?? sopDoc?.identifier ?? '',
          sopName: bank.sopName ?? sopDoc?.name ?? '',
          sopFileUrl: sopDoc?.fileUrl ?? '',
          sopFileType: sopDoc?.fileType ?? 'pdf',
          department: bank.department,
          totalQuestions: 0,
          checkedCount: 0,
          reviewedCount: 0,
          similarCount: 0,
          mcqBanks: [],
        };
      }
      const g = grouped[key];
      g.totalQuestions += bank.totalQuestions ?? 0;
      g.checkedCount   += bank.checkedCount   ?? 0;
      g.reviewedCount  += bank.reviewedCount  ?? 0;
      g.similarCount   += bank.similarCount   ?? 0;
      g.mcqBanks.push({ _id: bank._id.toString(), language: bank.language });
    }

    const sopsArray = Object.values(grouped);

    return NextResponse.json(
      {
        success: true,
        dept,
        sops: sopsArray,
        total: sopsArray.length,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      },
    );
  } catch (error) {
    console.error('[dept-sops] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch department SOPs',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
