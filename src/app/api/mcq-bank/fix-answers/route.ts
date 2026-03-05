import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';

/**
 * POST /api/mcq-bank/fix-answers
 * Bulk-repair wrong correctAnswer values in an MCQ bank.
 * When the AI returns correctAnswer as a single letter ("B", "C", "D")
 * but options are full text strings, the old code always defaulted to option A.
 * This endpoint re-resolves correctAnswer for every question in the bank.
 *
 * Body: { bankId: string }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const { bankId } = await request.json();

    if (!bankId) {
      return NextResponse.json(
        { success: false, error: 'bankId is required' },
        { status: 400 }
      );
    }

    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'Database not connected' },
        { status: 500 }
      );
    }

    const collection = db.collection('mcqbanks');
    const objectId = new mongoose.Types.ObjectId(bankId);
    const bank = await collection.findOne({ _id: objectId });

    if (!bank) {
      return NextResponse.json(
        { success: false, error: 'MCQ Bank not found' },
        { status: 404 }
      );
    }

    const mcqs: any[] = bank.mcqs || [];
    let fixedCount = 0;
    let alreadyCorrectCount = 0;

    /**
     * Resolve the correct answer text from the options array.
     * Handles all patterns the AI might return.
     */
    function resolveCorrectAnswer(rawAnswer: string, options: string[]): string {
      const trimmed = rawAnswer.trim();

      // Case 1: Exact match (already correct)
      const exactMatch = options.find(opt => opt.trim().toLowerCase() === trimmed.toLowerCase());
      if (exactMatch) return exactMatch;

      // Case 2: Single letter A/B/C/D → use as index
      if (/^[A-Da-d]$/.test(trimmed)) {
        const idx = trimmed.toUpperCase().charCodeAt(0) - 65;
        if (options[idx]) return options[idx];
      }

      // Case 3: "A. text" / "B. text" format → strip prefix letter
      if (/^[A-Da-d]\.\s/.test(trimmed)) {
        const letterIdx = trimmed.toUpperCase().charCodeAt(0) - 65;
        if (options[letterIdx]) return options[letterIdx];
        const withoutPrefix = trimmed.replace(/^[A-Da-d]\.\s*/, '').toLowerCase();
        const found = options.find(opt => opt.replace(/^[A-Da-d]\.\s*/, '').trim().toLowerCase() === withoutPrefix);
        if (found) return found;
      }

      // No resolution found - return original (will not overwrite)
      return '';
    }

    const updatedMcqs = mcqs.map((mcq: any, idx: number) => {
      const options: string[] = mcq.options || [];
      const rawAnswer: string = (mcq.correctAnswer || '').trim();

      const resolved = resolveCorrectAnswer(rawAnswer, options);

      if (!resolved || resolved === rawAnswer) {
        // Already correct or can't resolve — don't touch
        alreadyCorrectCount++;
        return mcq;
      }

      fixedCount++;
      console.log(`🔧 Q${idx + 1}: "${rawAnswer}" → "${resolved}"`);

      // Rebuild optionVariants with correct isCorrect flags
      const optionVariants = options.map((opt: string) => ({
        text: opt,
        isCorrect: opt === resolved,
      }));

      return { ...mcq, correctAnswer: resolved, optionVariants };
    });

    if (fixedCount === 0) {
      return NextResponse.json({
        success: true,
        message: 'No questions needed fixing — all correctAnswers are already valid.',
        fixed: 0,
        alreadyCorrect: alreadyCorrectCount,
      });
    }

    await collection.updateOne(
      { _id: objectId },
      { $set: { mcqs: updatedMcqs } }
    );

    console.log(`✅ Fixed ${fixedCount} questions in bank ${bankId}`);

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixedCount} question(s). ${alreadyCorrectCount} were already correct.`,
      fixed: fixedCount,
      alreadyCorrect: alreadyCorrectCount,
    });

  } catch (error: any) {
    console.error('[FixAnswers] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
