import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import ArchivedMCQBank from '@/models/ArchivedMCQBank';

const OBSOLETE_FIXED_PASSWORD = 'indiana@132';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { sopIdentifier, password } = body;

    if (!sopIdentifier) {
      return NextResponse.json({ error: 'sopIdentifier is required' }, { status: 400 });
    }
    if (!password || password !== OBSOLETE_FIXED_PASSWORD) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
    }

    let restoredRegistry = false;
    let restoredMCQ = false;

    // ── 1. Restore from isObsolete flag on SOP documents ──────────────────────
    const sopResult = await SOP.updateMany(
      {
        identifier: { $regex: `^${sopIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        isObsolete: true,
      },
      {
        $set: { isObsolete: false },
        $unset: { obsoleteAt: 1, obsoleteReason: 1 },
      },
    );

    if (sopResult.modifiedCount > 0) {
      restoredRegistry = true;
      console.log(`[remove-obsolete] Restored ${sopResult.modifiedCount} SOP registry record(s) for "${sopIdentifier}"`);
    }

    // ── 2. Restore from ArchivedMCQBank (archive-sops flow) ───────────────────
    const archivedBanks = await ArchivedMCQBank.find({ sopIdentifier }).lean() as any[];

    if (archivedBanks.length > 0) {
      // Pick the most recent
      const archived = archivedBanks.sort(
        (a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime()
      )[0];

      // Find or create the SOP document
      let sop: any = await SOP.findOne({
        identifier: { $regex: `^${sopIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      }).lean();

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
          mcqCount: archived.totalQuestions,
          isObsolete: false,
        });
        sop = newSOP.toObject();
        restoredRegistry = true;
        console.log(`[remove-obsolete] Recreated SOP document for "${sopIdentifier}"`);
      } else {
        // Make sure the existing SOP is not obsolete
        await SOP.findByIdAndUpdate(sop._id, { $set: { isObsolete: false }, $unset: { obsoleteAt: 1, obsoleteReason: 1 } });
        restoredRegistry = true;
      }

      // Restore MCQ bank only if no active bank exists
      const existingBank = await MCQBank.findOne({
        $or: [{ sopId: sop._id }, { sopIdentifier }],
      });

      if (!existingBank) {
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
          difficultyDistribution: archived.difficultyDistribution || { easy: 0, medium: 0, hard: 0 },
          aiModel: archived.aiModel,
          language: archived.language || 'English',
        });
        await SOP.findByIdAndUpdate(sop._id, { mcqCount: archived.totalQuestions, status: 'completed' });
        console.log(`[remove-obsolete] Restored MCQ bank with ${archived.totalQuestions} questions for "${sopIdentifier}"`);
      }

      // Remove from archive
      await ArchivedMCQBank.deleteMany({ sopIdentifier });
      restoredMCQ = true;
      console.log(`[remove-obsolete] Removed ${archivedBanks.length} ArchivedMCQBank record(s) for "${sopIdentifier}"`);
    }

    if (!restoredRegistry && !restoredMCQ) {
      return NextResponse.json({
        success: false,
        error: `No obsolete record found for "${sopIdentifier}". It may already be active.`,
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `SOP "${sopIdentifier}" has been restored to the active registry.`,
      restoredRegistry,
      restoredMCQ,
    });
  } catch (error) {
    console.error('remove-obsolete error:', error);
    return NextResponse.json({ error: 'Failed to remove SOP from obsolete' }, { status: 500 });
  }
}
