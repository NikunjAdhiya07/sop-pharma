import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import mongoose from 'mongoose';

/**
 * POST /api/mcq-bank/restore-obsolete
 *
 * Recovery endpoint: un-marks ALL isObsolete = true MCQ banks and SOPs
 * that were incorrectly flagged by the version-shift bug (the familyLetterDoc
 * regex matched ALL SOPs of the same prefix, e.g. ALL QAGE*, instead of
 * only the same doc number family, e.g. QAGE28-*).
 *
 * Only clears the `isObsolete` flag — no data is deleted or modified.
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database not connected' }, { status: 500 });
    }

    const mcqCollection = db.collection('mcqbanks');

    // Count how many are affected before restoring
    const obsoleteMCQCount = await mcqCollection.countDocuments({ isObsolete: true });
    const obsoleteSOPCount = await SOP.countDocuments({ isObsolete: true } as any);

    console.log(`🔧 RESTORE: Found ${obsoleteMCQCount} obsolete MCQ banks and ${obsoleteSOPCount} obsolete SOPs to restore`);

    // Restore all MCQ banks — unset the obsolete flags
    const mcqResult = await mcqCollection.updateMany(
      { isObsolete: true },
      {
        $unset: { isObsolete: '', obsoleteAt: '', obsoleteReason: '' },
      }
    );

    // Restore all SOPs — unset the obsolete flags
    const sopResult = await SOP.updateMany(
      { isObsolete: true } as any,
      {
        $unset: { isObsolete: '', obsoleteAt: '', obsoleteReason: '' },
      }
    );

    console.log(`✅ RESTORE: Restored ${mcqResult.modifiedCount} MCQ banks and ${sopResult.modifiedCount} SOPs`);

    return NextResponse.json({
      success: true,
      message: `Restored ${mcqResult.modifiedCount} MCQ banks and ${sopResult.modifiedCount} SOPs`,
      details: {
        mcqBanksFound: obsoleteMCQCount,
        mcqBanksRestored: mcqResult.modifiedCount,
        sopsFound: obsoleteSOPCount,
        sopsRestored: sopResult.modifiedCount,
      },
    });
  } catch (error) {
    console.error('Error restoring obsolete records:', error);
    return NextResponse.json(
      {
        error: 'Failed to restore',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET: just count how many obsolete records exist (dry-run preview)
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database not connected' }, { status: 500 });
    }

    const mcqCollection = db.collection('mcqbanks');

    const obsoleteMCQCount = await mcqCollection.countDocuments({ isObsolete: true });
    const obsoleteSOPCount = await SOP.countDocuments({ isObsolete: true } as any);

    // Sample a few to show what would be restored
    const sampleMCQs = await mcqCollection
      .find({ isObsolete: true })
      .project({ sopIdentifier: 1, sopName: 1, obsoleteReason: 1, obsoleteAt: 1, language: 1 })
      .limit(20)
      .toArray();

    return NextResponse.json({
      success: true,
      obsoleteMCQBanks: obsoleteMCQCount,
      obsoleteSOPs: obsoleteSOPCount,
      sampleAffected: sampleMCQs,
    });
  } catch (error) {
    console.error('Error counting obsolete records:', error);
    return NextResponse.json(
      { error: 'Failed to count', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
