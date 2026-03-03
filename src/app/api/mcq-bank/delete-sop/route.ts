import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import ArchivedMCQBank from '@/models/ArchivedMCQBank';
import mongoose from 'mongoose';

const DELETE_PASSWORD = 'Nik1234';

/**
 * POST /api/mcq-bank/delete-sop
 * Delete an SOP and its MCQ bank permanently (with password authentication).
 * Body: { sopId: string, password: string }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { sopId, password } = body;

    if (!sopId || !password) {
      return NextResponse.json(
        { success: false, error: 'sopId and password are required' },
        { status: 400 }
      );
    }

    // Password authentication
    if (password !== DELETE_PASSWORD) {
      return NextResponse.json(
        { success: false, error: 'Incorrect password' },
        { status: 403 }
      );
    }

    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ success: false, error: 'Database not connected' }, { status: 500 });
    }

    // Get SOP info before deleting
    let sop: any = null;
    try {
      sop = await SOP.findById(sopId).lean();
    } catch {
      // sopId might not be a valid ObjectId, try raw collection
    }
    
    // Fallback: try raw collection with string match
    if (!sop) {
      const sopsCollection = db.collection('sops');
      try {
        sop = await sopsCollection.findOne({ _id: new mongoose.Types.ObjectId(sopId) });
      } catch {
        // Try string match
        sop = await sopsCollection.findOne({ _id: sopId as any });
      }
    }
    
    const sopIdentifier = sop?.identifier || sop?.name || 'Unknown';
    const sopName = sop?.name || 'Unknown';

    console.log(`\n🗑️ Deleting SOP: ${sopIdentifier} - ${sopName} (ID: ${sopId})`);

    // Archive MCQ banks first (if any exist)
    const mcqBanks = await MCQBank.find({ sopId }).lean();
    // Also check by identifier match on the raw mcqbanks collection
    let rawBanks: any[] = [];
    if (mcqBanks.length === 0 && sop?.identifier) {
      const mcqCollection = db.collection('mcqbanks');
      rawBanks = await mcqCollection.find({ sopIdentifier: sop.identifier }).toArray();
    }
    const allBanks = mcqBanks.length > 0 ? mcqBanks : rawBanks;
    
    if (allBanks.length > 0) {
      for (const bank of allBanks) {
        try {
          await ArchivedMCQBank.create({
            archivedSOPId: bank.sopId || bank._id,
            originalSOPId: bank.sopId || bank._id,
            sopName: bank.sopName,
            sopIdentifier: bank.sopIdentifier,
            sopVersion: '1.0',
            department: bank.department || 'General',
            mcqs: bank.mcqs,
            generatedAt: bank.generatedAt || bank.createdAt,
            totalQuestions: bank.totalQuestions || bank.mcqs?.length || 0,
            difficultyDistribution: bank.difficultyDistribution || { easy: 0, medium: 0, hard: 0 },
            aiModel: bank.aiModel,
            language: bank.language || 'English',
            archivedAt: new Date(),
            archiveReason: 'Manually deleted',
          });
        } catch (archiveErr) {
          console.warn(`Could not archive MCQ bank for ${sopIdentifier}:`, archiveErr);
        }
      }
      // Delete MCQ banks
      if (mcqBanks.length > 0) {
        await MCQBank.deleteMany({ sopId });
      }
      if (rawBanks.length > 0) {
        const mcqCollection = db.collection('mcqbanks');
        for (const bank of rawBanks) {
          await mcqCollection.deleteOne({ _id: bank._id });
        }
      }
      console.log(`  📦 Archived & deleted ${allBanks.length} MCQ bank(s)`);
    }

    // Delete the SOP document
    let deleteResult = null;
    try {
      deleteResult = await SOP.findByIdAndDelete(sopId);
    } catch {
      // Try raw collection
    }
    if (!deleteResult) {
      const sopsCollection = db.collection('sops');
      try {
        const res = await sopsCollection.deleteOne({ _id: new mongoose.Types.ObjectId(sopId) });
        if (res.deletedCount > 0) deleteResult = sop;
      } catch {
        const res = await sopsCollection.deleteOne({ _id: sopId as any });
        if (res.deletedCount > 0) deleteResult = sop;
      }
    }

    if (!deleteResult && allBanks.length === 0) {
      return NextResponse.json(
        { success: false, error: 'SOP not found' },
        { status: 404 }
      );
    }

    // Also try to delete from SOPLibrary
    try {
      const SOPLibrary = (await import('@/models/SOPLibrary')).default;
      await SOPLibrary.deleteMany({ sopId });
    } catch (libErr) {
      console.warn('Could not clean up SOPLibrary entry:', libErr);
    }

    console.log(`  ✅ SOP ${sopIdentifier} deleted successfully`);

    return NextResponse.json({
      success: true,
      message: `SOP "${sopIdentifier}" has been deleted and archived`,
      deletedSOP: {
        sopId,
        identifier: sopIdentifier,
        name: sopName,
        mcqBanksArchived: mcqBanks.length,
      },
    });

  } catch (error) {
    console.error('Error deleting SOP:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete SOP',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
