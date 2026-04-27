import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ArchivedMCQBank from '@/models/ArchivedMCQBank';
import MCQBank from '@/models/MCQBank';
import SOP from '@/models/SOP';

/**
 * POST /api/mcq-bank/restore-all
 *
 * Bulk recovery endpoint: restores all SOPs currently in ArchivedMCQBank back to MCQBank.
 *
 * Behavior (temporary "retrieve all" feature):
 * - Restores ONE MCQ bank per sopIdentifier (the most recently archived record).
 * - Skips identifiers that already have an active MCQ bank (prevents duplicates).
 * - Deletes ALL ArchivedMCQBank records for a successfully restored sopIdentifier.
 */
export async function POST(_request: NextRequest) {
  try {
    await connectDB();

    const identifiers: string[] = (await ArchivedMCQBank.distinct('sopIdentifier')) as any;
    const unique = identifiers
      .map((s) => String(s || '').trim())
      .filter(Boolean);

    const results: {
      restored: string[];
      skippedExisting: string[];
      failed: { sopIdentifier: string; error: string }[];
      total: number;
    } = { restored: [], skippedExisting: [], failed: [], total: unique.length };

    for (const sopIdentifier of unique) {
      try {
        const existing = await MCQBank.findOne({ sopIdentifier }).select('_id').lean();
        if (existing) {
          results.skippedExisting.push(sopIdentifier);
          // Archive entry is stale if an active bank exists — delete it so "Retrieve" doesn't loop forever.
          await ArchivedMCQBank.deleteMany({ sopIdentifier });
          continue;
        }

        const archivedBanks = await ArchivedMCQBank.find({ sopIdentifier }).lean();
        if (!archivedBanks || archivedBanks.length === 0) {
          results.failed.push({ sopIdentifier, error: 'No archived record found' });
          continue;
        }

        const archived = [...archivedBanks].sort(
          (a: any, b: any) =>
            new Date(b.archivedAt || 0).getTime() - new Date(a.archivedAt || 0).getTime(),
        )[0] as any;

        let sop: any = await SOP.findOne({ identifier: sopIdentifier }).lean();
        if (!sop) {
          const newSOP = await SOP.create({
            name: archived.sopName,
            identifier: sopIdentifier,
            department: archived.department || 'General',
            fileUrl: 'archived-restored.pdf',
            fileType: 'pdf',
            content: `Restored SOP - ${archived.sopName}`,
            language: archived.language || 'English',
            uploadedAt: new Date(),
            status: 'completed',
            mcqCount: archived.totalQuestions || 0,
          });
          sop = newSOP.toObject();
        }

        await MCQBank.create({
          sopId: sop._id,
          sopName: archived.sopName,
          sopIdentifier,
          department: archived.department || 'General',
          folderDepartment: archived.folderDepartment,
          folderSubcategory: archived.folderSubcategory,
          mcqs: archived.mcqs,
          generatedAt: archived.generatedAt || new Date(),
          totalQuestions: archived.totalQuestions,
          difficultyDistribution: archived.difficultyDistribution || {
            easy: 0,
            medium: 0,
            hard: 0,
          },
          aiModel: archived.aiModel,
          language: archived.language || 'English',
        });

        await SOP.findByIdAndUpdate(sop._id, {
          mcqCount: archived.totalQuestions || 0,
          status: 'completed',
        });

        await ArchivedMCQBank.deleteMany({ sopIdentifier });
        results.restored.push(sopIdentifier);
      } catch (e: any) {
        results.failed.push({
          sopIdentifier,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Restored ${results.restored.length} SOP(s) from archive.`,
      results,
    });
  } catch (error: any) {
    console.error('[restore-all] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to restore all archived SOPs',
        details: error?.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}

