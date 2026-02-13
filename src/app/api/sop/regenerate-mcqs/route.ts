import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import SOPLibrary from '@/models/SOPLibrary';
import { mcqQueue } from '@/lib/mcqQueue';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const { sopId } = await request.json();

    if (!sopId) {
      return NextResponse.json(
        { error: 'SOP ID is required' },
        { status: 400 }
      );
    }

    // Find the SOP
    const sop = await SOP.findById(sopId);
    if (!sop) {
      return NextResponse.json(
        { error: 'SOP not found' },
        { status: 404 }
      );
    }

    console.log(`🔄 Regenerating MCQs for: ${sop.name} (${sop.language})`);

    // Delete existing MCQ bank
    const existingBank = await MCQBank.findOne({ sopId: sop._id });
    if (existingBank) {
      console.log(`🗑️ Deleting existing MCQ bank with ${existingBank.totalQuestions} questions...`);
      await MCQBank.deleteOne({ _id: existingBank._id });
      
      // Also update SOPLibrary to remove the MCQ bank reference
      await SOPLibrary.updateOne(
        { sopId: sop._id },
        { $unset: { mcqBankId: "" } }
      );
    }

    // Add to queue for regeneration
    console.log('🚀 Adding to MCQ generation queue...');
    mcqQueue.addTask({
      sopId: sop._id.toString(),
      targetCount: 100,
      priority: 10,
    });

    // Start the queue
    await mcqQueue.start();

    // Wait for completion
    await mcqQueue.waitForTask(sop._id.toString());

    // Fetch the newly generated bank
    const newBank = await MCQBank.findOne({ sopId: sop._id });

    if (!newBank) {
      return NextResponse.json(
        { error: 'Failed to generate MCQs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully regenerated ${newBank.totalQuestions} MCQs in ${sop.language}`,
      mcqBank: {
        id: newBank._id,
        totalQuestions: newBank.totalQuestions,
        language: newBank.language,
        sopName: newBank.sopName,
      },
    });

  } catch (error) {
    console.error('Error regenerating MCQs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to regenerate MCQs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
