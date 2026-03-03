import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import ArchivedMCQBank from '@/models/ArchivedMCQBank';
import SOP from '@/models/SOP';
import mongoose from 'mongoose';

/**
 * POST /api/mcq-bank/restore-sop
 * Restore an archived SOP back to the active MCQ bank.
 * Body: { sopIdentifier: string }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { sopIdentifier } = body;

    if (!sopIdentifier) {
      return NextResponse.json(
        { success: false, error: 'sopIdentifier is required' },
        { status: 400 }
      );
    }

    // Find the archived MCQ bank(s) for this SOP
    const archivedBanks = await ArchivedMCQBank.find({ sopIdentifier }).lean();

    if (!archivedBanks || archivedBanks.length === 0) {
      return NextResponse.json(
        { success: false, error: `No archived MCQ bank found for "${sopIdentifier}"` },
        { status: 404 }
      );
    }

    // Use the most recent archived bank
    const archived = archivedBanks.sort((a, b) => 
      new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime()
    )[0];

    console.log(`\n♻️ Restoring SOP: ${sopIdentifier} - ${archived.sopName}`);
    console.log(`  📋 ${archived.totalQuestions} questions to restore`);

    // Step 1: Check if the SOP document still exists
    let sop: any = await SOP.findOne({ identifier: sopIdentifier }).lean();

    // Step 2: If SOP doesn't exist, recreate it
    if (!sop) {
      console.log(`  📄 SOP document not found, recreating...`);
      const newSOP = await SOP.create({
        name: archived.sopName,
        identifier: sopIdentifier,
        department: archived.department || 'General',
        fileUrl: 'archived-restored.pdf', // Dummy URL to satisfy validation
        fileType: 'pdf',
        content: `Restored SOP - ${archived.sopName}`,
        language: archived.language || 'English',
        uploadedAt: new Date(),
        status: 'completed',
        mcqCount: archived.totalQuestions,
      });
      sop = newSOP.toObject();
      console.log(`  ✅ SOP document recreated with ID: ${sop._id}`);
    } else {
      console.log(`  📄 SOP document found with ID: ${sop._id}`);
    }

    // Step 3: Check if an active MCQ bank already exists for this SOP
    const existingBank = await MCQBank.findOne({ 
      $or: [
        { sopId: sop._id },
        { sopIdentifier: sopIdentifier }
      ]
    });

    if (existingBank) {
      return NextResponse.json(
        { success: false, error: `MCQ bank already exists for "${sopIdentifier}" with ${existingBank.totalQuestions} questions. Cannot restore duplicate.` },
        { status: 409 }
      );
    }

    // Step 4: Recreate the MCQ bank from the archived data
    const restoredBank = await MCQBank.create({
      sopId: sop._id,
      sopName: archived.sopName,
      sopIdentifier: sopIdentifier,
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

    console.log(`  ✅ MCQ bank restored with ${restoredBank.totalQuestions} questions`);

    // Step 5: Update the SOP's mcqCount
    await SOP.findByIdAndUpdate(sop._id, { 
      mcqCount: archived.totalQuestions,
      status: 'completed',
    });

    // Step 6: Remove from archived collection
    await ArchivedMCQBank.deleteMany({ sopIdentifier });
    console.log(`  🗑️ Removed ${archivedBanks.length} archived record(s)`);

    return NextResponse.json({
      success: true,
      message: `SOP "${sopIdentifier}" has been restored with ${restoredBank.totalQuestions} questions`,
      restored: {
        sopId: sop._id,
        sopIdentifier,
        sopName: archived.sopName,
        totalQuestions: restoredBank.totalQuestions,
        department: archived.department,
      },
    });

  } catch (error) {
    console.error('Error restoring SOP:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to restore SOP',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
