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
    const { mcqBankId, sopId, questionIndex, dryRun, acceptedQuestion } = body;

    if (!mcqBankId || !sopId || questionIndex === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // If a pre-validated candidate is provided, skip generation and just save it
    if (acceptedQuestion && !dryRun) {
      const bankToSave = await MCQBank.findById(mcqBankId);
      if (!bankToSave) {
        return NextResponse.json({ success: false, error: 'MCQ bank not found' }, { status: 404 });
      }
      bankToSave.mcqs.splice(questionIndex, 1, { ...acceptedQuestion, isSimilar: false });
      await bankToSave.save();
      return NextResponse.json({
        success: true,
        message: `Replacement saved at position ${questionIndex + 1}`,
        totalQuestions: bankToSave.mcqs.length,
        newQuestion: acceptedQuestion,
      });
    }

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
      sop = null;
    }
    if (!sop) {
      sop = await SOP.findOne({ identifier: bank.sopIdentifier });
      if (sop) {
        bank.sopId = sop._id as any;
        await bank.save();
      }
    }

    if (!sop) {
      return NextResponse.json(
        { success: false, error: `SOP not found for identifier "${bank.sopIdentifier}"` },
        { status: 404 }
      );
    }


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

    if (!result.mcqs || result.mcqs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'AI failed to generate a replacement question'
        },
        { status: 500 }
      );
    }

    const newQuestion = result.mcqs[0];

    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `Replacement question generated (dry-run, not inserted)`,
        totalQuestions: 0, // Placeholder since we didn't insert
        newQuestion: newQuestion,
        dryRun: true,
      });
    }

    const freshBank = await MCQBank.findById(mcqBankId);
    if (!freshBank) {
      return NextResponse.json(
        { success: false, error: 'MCQ bank was deleted during generation' },
        { status: 404 }
      );
    }

    freshBank.mcqs.splice(questionIndex, 1, { ...newQuestion, isSimilar: false });

    let saveAttempts = 0;
    const MAX_SAVE_ATTEMPTS = 3;
    let saveError: any = null;

    while (saveAttempts < MAX_SAVE_ATTEMPTS) {
      try {
        await freshBank.save();
        saveError = null;
        break;
      } catch (versionError: any) {
        saveAttempts++;

        if (saveAttempts >= MAX_SAVE_ATTEMPTS) {
          saveError = versionError;
          break;
        }

        // Refresh again and retry
        console.log(`🔄 Refreshing and retrying save...`);
        const retryBank = await MCQBank.findById(mcqBankId);
        if (retryBank) {
          retryBank.mcqs.splice(questionIndex, 1, { ...newQuestion, isSimilar: false });
          Object.assign(freshBank, retryBank.toObject());
        } else {
          saveError = new Error('MCQ bank no longer exists');
          break;
        }
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
