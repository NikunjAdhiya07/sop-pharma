import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import ArchivedMCQBank from '@/models/ArchivedMCQBank';
import mongoose from 'mongoose';
import { invalidateMcqCaches } from '@/lib/mcqCacheInvalidate';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { sopIdentifiers, reason } = body;

    if (!sopIdentifiers || !Array.isArray(sopIdentifiers) || sopIdentifiers.length === 0) {
      return NextResponse.json(
        { error: 'sopIdentifiers array is required' },
        { status: 400 }
      );
    }

    const archiveReason = reason || 'Obsolete / Removed';

    const results = {
      archived: [] as string[],
      notFound: [] as string[],
      failed: [] as string[],
    };

    for (const identifier of sopIdentifiers) {
      try {
        // Use native driver to get full data including isChecked/isReviewed fields
        const db = mongoose.connection.db;
        if (!db) {
          results.failed.push(identifier);
          continue;
        }
        const collection = db.collection('mcqbanks');
        const bank = await collection.findOne({ sopIdentifier: identifier });

        if (!bank) {
          results.notFound.push(identifier);
          continue;
        }

        // Create archived copy
        await ArchivedMCQBank.create({
          archivedSOPId: bank.sopId || bank._id,
          originalSOPId: bank.sopId || bank._id,
          sopName: bank.sopName,
          sopIdentifier: bank.sopIdentifier,
          sopVersion: '1.0',
          department: bank.department || 'General',
          folderDepartment: bank.folderDepartment,
          folderSubcategory: bank.folderSubcategory,
          mcqs: bank.mcqs,
          generatedAt: bank.generatedAt || bank.createdAt,
          totalQuestions: bank.totalQuestions || bank.mcqs?.length || 0,
          difficultyDistribution: bank.difficultyDistribution || { easy: 0, medium: 0, hard: 0 },
          aiModel: bank.aiModel,
          language: bank.language || 'English',
          archivedAt: new Date(),
        });

        // Delete the original
        await collection.deleteOne({ _id: bank._id });

        results.archived.push(identifier);
        console.log(`📦 Archived MCQ bank: ${identifier} (${archiveReason})`);

      } catch (err) {
        console.error(`Failed to archive ${identifier}:`, err);
        results.failed.push(identifier);
      }
    }

    // Also try to update/reset the SOP status for archived banks
    try {
      const SOP = (await import('@/models/SOP')).default;
      for (const identifier of results.archived) {
        await SOP.updateMany(
          { identifier },
          { $set: { mcqCount: 0 } }
        );
      }
    } catch (sopErr) {
      console.warn('Could not reset SOP stats after archiving:', sopErr);
    }

    void invalidateMcqCaches();

    return NextResponse.json({
      success: true,
      message: `Archived ${results.archived.length} MCQ banks`,
      results,
    });

  } catch (error) {
    console.error('Error archiving SOPs:', error);
    return NextResponse.json(
      {
        error: 'Failed to archive SOPs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
