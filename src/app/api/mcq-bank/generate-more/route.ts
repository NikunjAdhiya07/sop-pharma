import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import SOP from '@/models/SOP';
import { generateMCQsFromSOP } from '@/lib/gemini';
import mongoose from 'mongoose';

/**
 * POST /api/mcq-bank/generate-more
 * Generate additional questions for an existing MCQ bank to reach the target of 100.
 * Body: { bankId: string, sopId: string }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { bankId, sopId } = body;

    if (!bankId || !sopId) {
      return NextResponse.json(
        { success: false, error: 'Missing bankId or sopId' },
        { status: 400 }
      );
    }

    const TARGET_COUNT = 100;

    // Use native driver to get full data
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ success: false, error: 'Database not connected' }, { status: 500 });
    }

    const bankCollection = db.collection('mcqbanks');
    const bank = await bankCollection.findOne({ _id: new mongoose.Types.ObjectId(bankId) });

    if (!bank) {
      return NextResponse.json(
        { success: false, error: 'MCQ bank not found' },
        { status: 404 }
      );
    }

    const currentCount = bank.mcqs?.length || 0;
    if (currentCount >= TARGET_COUNT) {
      return NextResponse.json({
        success: true,
        message: `Bank already has ${currentCount} questions (target: ${TARGET_COUNT})`,
        totalQuestions: currentCount,
        generated: 0,
      });
    }

    const remaining = TARGET_COUNT - currentCount;
    console.log(`\n🚀 Generating ${remaining} more questions for ${bank.sopIdentifier} (${currentCount}/${TARGET_COUNT})...`);

    // Find the SOP for content
    const sop = await SOP.findById(sopId);
    if (!sop) {
      return NextResponse.json(
        { success: false, error: 'SOP not found — cannot generate questions without SOP content' },
        { status: 404 }
      );
    }

    // Get existing questions to avoid duplicates
    const existingQuestions = (bank.mcqs || []).map((m: any) => m.question);

    // Generate new questions using Gemini
    const result = await generateMCQsFromSOP({
      sopContent: sop.content,
      sopName: sop.name,
      sopIdentifier: sop.identifier || sop.name,
      existingQuestions: existingQuestions,
      targetCount: TARGET_COUNT,
      isBulk: remaining > 10,
      language: sop.language || 'English',
    });

    if (!result.mcqs || result.mcqs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate additional questions' },
        { status: 500 }
      );
    }

    const newQuestions = result.mcqs;
    console.log(`📥 Generated ${newQuestions.length} new questions for ${bank.sopIdentifier}`);

    // Append new questions to existing bank
    const updatedMcqs = [...(bank.mcqs || []), ...newQuestions];
    const newTotal = updatedMcqs.length;

    // Recalculate difficulty distribution
    const difficultyDistribution = {
      easy: updatedMcqs.filter((m: any) => m.difficulty === 'Easy').length,
      medium: updatedMcqs.filter((m: any) => m.difficulty === 'Medium').length,
      hard: updatedMcqs.filter((m: any) => m.difficulty === 'Hard').length,
    };

    await bankCollection.updateOne(
      { _id: bank._id },
      {
        $set: {
          mcqs: updatedMcqs,
          totalQuestions: newTotal,
          difficultyDistribution,
        },
      }
    );

    // Update SOP mcqCount
    try {
      await SOP.findByIdAndUpdate(sopId, { $set: { mcqCount: newTotal } });
    } catch (sopErr) {
      console.warn('Could not update SOP mcqCount:', sopErr);
    }

    console.log(`✅ ${bank.sopIdentifier}: ${currentCount} → ${newTotal} questions`);

    return NextResponse.json({
      success: true,
      message: `Generated ${newQuestions.length} additional questions`,
      totalQuestions: newTotal,
      generated: newQuestions.length,
      previousCount: currentCount,
    });

  } catch (error) {
    console.error('Error generating more questions:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate additional questions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
