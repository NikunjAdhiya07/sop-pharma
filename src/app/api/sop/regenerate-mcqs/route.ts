import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import SOPLibrary from '@/models/SOPLibrary';
import { mcqQueue } from '@/lib/mcqQueue';

// Allow up to 5 minutes for MCQ regeneration
export const maxDuration = 300;

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

    const bankLanguage = sop.language || 'English';
    console.log(`🔄 Regenerating ${bankLanguage} MCQs for: ${sop.name} (${sop.language})`);

    // Delete only the MCQ bank for this SOP's language so English and Gujarati banks coexist
    const existingBank = await MCQBank.findOne({ sopId: sop._id, language: bankLanguage });
    if (existingBank) {
      console.log(`🗑️ Deleting existing ${bankLanguage} MCQ bank with ${existingBank.totalQuestions} questions...`);
      await MCQBank.deleteOne({ _id: existingBank._id });
      
      await SOPLibrary.updateOne(
        { sopId: sop._id },
        { $unset: { mcqBankId: "" } }
      );
    }

    // Add to queue for regeneration (same language only)
    console.log(`🚀 Adding to MCQ generation queue (${bankLanguage})...`);
    mcqQueue.addTask({
      sopId: sop._id.toString(),
      targetCount: 100,
      priority: 10,
      language: bankLanguage,
    });

    // Start the queue
    await mcqQueue.start();

    // Wait for completion
    await mcqQueue.waitForTask(sop._id.toString());

    // Fetch the newly generated bank (same language)
    const newBank = await MCQBank.findOne({ sopId: sop._id, language: bankLanguage });

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
