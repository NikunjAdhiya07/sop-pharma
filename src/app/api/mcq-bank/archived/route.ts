import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ArchivedMCQBank from '@/models/ArchivedMCQBank';
import MCQBank from '@/models/MCQBank';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const archivedBanks = await ArchivedMCQBank.find({})
      .select('sopName sopIdentifier department folderDepartment folderSubcategory totalQuestions archivedAt difficultyDistribution language')
      .sort({ archivedAt: -1 })
      .lean();

    // Filter out stale archive entries when an active MCQ bank already exists.
    const archivedIdentifiers = Array.from(
      new Set(
        archivedBanks
          .map((b: any) => String(b?.sopIdentifier || '').trim())
          .filter(Boolean),
      ),
    );
    const activeIdentifiers = new Set<string>(
      (await MCQBank.distinct('sopIdentifier', { sopIdentifier: { $in: archivedIdentifiers } }))
        .map((s: any) => String(s || '').trim()),
    );

    // Group by sopIdentifier
    const grouped: Record<string, any> = {};
    for (const bank of archivedBanks) {
      const key = bank.sopIdentifier;
      if (!key || activeIdentifiers.has(String(key).trim())) continue;
      if (!grouped[key]) {
        grouped[key] = {
          sopName: bank.sopName,
          sopIdentifier: bank.sopIdentifier,
          department: bank.department,
          folderDepartment: bank.folderDepartment,
          folderSubcategory: bank.folderSubcategory,
          totalQuestions: bank.totalQuestions,
          archivedAt: bank.archivedAt,
          language: bank.language,
          difficultyDistribution: bank.difficultyDistribution,
        };
      }
    }

    return NextResponse.json({
      success: true,
      archivedSOPs: Object.values(grouped),
      total: Object.keys(grouped).length,
    });

  } catch (error) {
    console.error('Error fetching archived MCQ banks:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch archived MCQ banks',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
