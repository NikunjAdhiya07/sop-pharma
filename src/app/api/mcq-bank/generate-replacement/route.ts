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
    const { mcqBankId, sopId, questionIndex, dryRun } = body;

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
    console.log(`📋 SOP content length: ${sop.content?.length || 0} characters`);

    // Validate SOP has content
    if (!sop.content || sop.content.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'SOP has no content - cannot generate questions',
          details: `SOP "${sop.name}" (${sop.identifier}) has empty content`
        },
        { status: 400 }
      );
    }

    // Get existing questions to avoid duplicates
    const existingQuestions = bank.mcqs.map(q => q.question);
    const currentCount = existingQuestions.length;

    console.log(`📊 Current bank has ${currentCount} questions`);
    console.log(`📋 SOP content preview: ${sop.content.substring(0, 150)}...`);

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
    console.log(`📊 Result structure:`, {
      mcqsArray: !!result.mcqs,
      mcqsLength: result.mcqs?.length,
      hasMcqs: result.mcqs && result.mcqs.length > 0,
      difficultyDistribution: result.difficultyDistribution,
      totalQuestions: result.totalQuestions
    });

    if (!result.mcqs || result.mcqs.length === 0) {
      console.error('❌ Generation returned no questions');
      console.error('Full result:', JSON.stringify(result, null, 2));
      console.error('📊 Existing questions count:', existingQuestions.length);
      console.error('📊 Target was:', currentCount + 1);
      return NextResponse.json(
        {
          success: false,
          error: 'AI failed to generate questions - likely due to API limits or empty SOP content',
          details: `Generated 0 questions. Tried to generate ${currentCount + 1 - currentCount} question(s). Existing: ${currentCount}. Result: ${JSON.stringify({
            hasArray: !!result.mcqs,
            length: result.mcqs?.length,
            distribution: result.difficultyDistribution
          })}`
        },
        { status: 500 }
      );
    }

    const newQuestion = result.mcqs[0];

    console.log(`🤖 Generated new question: ${newQuestion.question.substring(0, 80)}...`);

    // If this is a dry-run (validation only), return success without inserting
    if (dryRun) {
      console.log(`🔄 Dry-run mode: returning success without inserting question`);
      return NextResponse.json({
        success: true,
        message: `Replacement question generated (dry-run, not inserted)`,
        totalQuestions: 0, // Placeholder since we didn't insert
        newQuestion: newQuestion,
        dryRun: true,
      });
    }

    // Refresh the bank document to avoid version conflicts
    // (another process may have modified it during generation)
    console.log(`🔄 Refreshing bank document to avoid version conflicts...`);
    const freshBank = await MCQBank.findById(mcqBankId);
    if (!freshBank) {
      return NextResponse.json(
        { success: false, error: 'MCQ bank was deleted during generation' },
        { status: 404 }
      );
    }

    // Insert the new question at the specified position in the fresh copy
    freshBank.mcqs.splice(questionIndex, 0, newQuestion);

    // Save with retry logic for version conflicts
    let saveAttempts = 0;
    const MAX_SAVE_ATTEMPTS = 3;
    let saveError: any = null;

    while (saveAttempts < MAX_SAVE_ATTEMPTS) {
      try {
        await freshBank.save();
        console.log(`✅ Replacement question inserted at position ${questionIndex + 1}`);
        console.log(`📊 Bank now has ${freshBank.mcqs.length} questions`);
        saveError = null;
        break; // Success!
      } catch (versionError: any) {
        saveAttempts++;
        console.warn(`⚠️ Save attempt ${saveAttempts}/${MAX_SAVE_ATTEMPTS} failed: ${versionError.message}`);

        if (saveAttempts >= MAX_SAVE_ATTEMPTS) {
          saveError = versionError;
          break;
        }

        // Refresh again and retry
        console.log(`🔄 Refreshing and retrying save...`);
        const retryBank = await MCQBank.findById(mcqBankId);
        if (retryBank) {
          // Re-apply the new question to the fresh copy
          retryBank.mcqs.splice(questionIndex, 0, newQuestion);
          Object.assign(freshBank, retryBank.toObject());
        } else {
          saveError = new Error('MCQ bank no longer exists');
          break;
        }

        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (saveError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to save replacement question after retries',
          details: saveError.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Replacement question generated at position ${questionIndex + 1}`,
      totalQuestions: freshBank.mcqs.length,
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
