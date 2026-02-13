import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import SOP from '@/models/SOP';
import { generateMCQsFromSOP } from '@/lib/gemini';

/**
 * POST /api/mcq-bank/generate-replacement
 * Generate a replacement question for a deleted question using Gemini
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { mcqBankId, sopId, questionIndex } = body;

    if (!mcqBankId || !sopId || questionIndex === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`\n🔄 Generating replacement question for Q${questionIndex + 1}...`);

    // Find the MCQ bank and SOP
    const [bank, sop] = await Promise.all([
      MCQBank.findById(mcqBankId),
      SOP.findById(sopId),
    ]);

    if (!bank) {
      return NextResponse.json(
        { success: false, error: 'MCQ bank not found' },
        { status: 404 }
      );
    }

    if (!sop) {
      return NextResponse.json(
        { success: false, error: 'SOP not found' },
        { status: 404 }
      );
    }

    console.log(`📝 Using Gemini to generate replacement for SOP: ${sop.name}`);

    // Get existing questions to avoid duplicates
    const existingQuestions = bank.mcqs.map(q => q.question);
    const currentCount = existingQuestions.length;

    console.log(`📊 Current bank has ${currentCount} questions`);

    // Generate 1 new question using the existing gemini library
    // targetCount should be currentCount + 1 to generate 1 additional question
    const result = await generateMCQsFromSOP({
      sopContent: sop.content,
      sopName: sop.name,
      sopIdentifier: sop.identifier || sop.name,
      existingQuestions: existingQuestions,
      targetCount: currentCount + 1, // Generate 1 more than current
      isBulk: false,
      language: sop.language || 'English',
    });

    console.log(`📥 Generation result: ${result.mcqs?.length || 0} questions generated`);

    if (!result.mcqs || result.mcqs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate replacement question' },
        { status: 500 }
      );
    }

    const newQuestion = result.mcqs[0];

    console.log(`🤖 Generated new question: ${newQuestion.question.substring(0, 80)}...`);

    // Insert the new question at the specified position
    bank.mcqs.splice(questionIndex, 0, newQuestion);

    // Save the updated bank
    await bank.save();

    console.log(`✅ Replacement question inserted at position ${questionIndex + 1}`);
    console.log(`📊 Bank now has ${bank.mcqs.length} questions`);

    return NextResponse.json({
      success: true,
      message: `Replacement question generated at position ${questionIndex + 1}`,
      totalQuestions: bank.mcqs.length,
      newQuestion: newQuestion,
    });
  } catch (error) {
    console.error('Error generating replacement:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate replacement question',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
