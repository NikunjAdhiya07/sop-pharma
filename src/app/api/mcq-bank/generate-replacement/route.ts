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
    const [bank, sopById] = await Promise.all([
      MCQBank.findById(mcqBankId),
      SOP.findById(sopId),
    ]);

    if (!bank) {
      return NextResponse.json(
        { success: false, error: 'MCQ bank not found' },
        { status: 404 }
      );
    }

    // CRITICAL: validate that the SOP found by sopId actually matches the bank's sopIdentifier.
    // If there is a mismatch (stale sopId), fall back to finding the SOP by identifier.
    let sop = sopById;
    if (sop && bank.sopIdentifier && sop.identifier &&
        sop.identifier.toUpperCase().trim() !== bank.sopIdentifier.toUpperCase().trim()) {
      console.warn(`⚠️ SOP mismatch in generate-replacement! Bank sopIdentifier: ${bank.sopIdentifier}, SOP-by-id identifier: ${sop.identifier}. Falling back to identifier lookup.`);
      sop = null;
    }
    if (!sop) {
      sop = await SOP.findOne({ identifier: bank.sopIdentifier });
      if (sop) {
        console.log(`✅ Found correct SOP by identifier: ${bank.sopIdentifier} (_id: ${sop._id})`);
        // Fix the stale sopId in the bank
        bank.sopId = sop._id as any;
        await bank.save();
        console.log(`🔧 Fixed stale sopId in MCQ bank ${bank._id}`);
      }
    }

    if (!sop) {
      return NextResponse.json(
        { success: false, error: `SOP not found for identifier "${bank.sopIdentifier}"` },
        { status: 404 }
      );
    }

    console.log(`📄 Using SOP: ${sop.identifier} for replacement in bank: ${bank.sopIdentifier}`);
    console.log(`📝 Using Gemini to generate replacement for SOP: ${sop.name}`);

    // Get existing questions to avoid duplicates
    const existingQuestions = bank.mcqs.map(q => q.question);
    const currentCount = existingQuestions.length;

    console.log(`📊 Current bank has ${currentCount} questions`);

    // Generate 1 new question using the existing gemini library
    const result = await generateMCQsFromSOP({
      sopContent: sop.content,
      sopName: sop.name,
      sopIdentifier: sop.identifier || sop.name,
      existingQuestions: existingQuestions,
      targetCount: currentCount + 1,
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
