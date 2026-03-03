import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';

/**
 * POST /api/mcq-bank/edit-question
 * Edit the content of a specific question in an MCQ bank.
 * Body: { bankId, questionIndex, question?, options?, correctAnswer?, explanation? }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { bankId, questionIndex, question, options, correctAnswer, explanation } = body;

    if (!bankId || questionIndex === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing bankId or questionIndex' },
        { status: 400 }
      );
    }

    const updateQuery: Record<string, any> = {};

    if (question !== undefined) {
      updateQuery[`mcqs.${questionIndex}.question`] = question.trim();
    }
    if (options !== undefined && Array.isArray(options)) {
      options.forEach((opt: string, i: number) => {
        updateQuery[`mcqs.${questionIndex}.options.${i}`] = opt.trim();
      });
    }
    if (correctAnswer !== undefined) {
      updateQuery[`mcqs.${questionIndex}.correctAnswer`] = correctAnswer.trim();
    }
    if (explanation !== undefined) {
      updateQuery[`mcqs.${questionIndex}.explanation`] = explanation.trim();
    }

    if (Object.keys(updateQuery).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No update data provided' },
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

    const result = await collection.updateOne(
      { _id: objectId },
      { $set: updateQuery }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'MCQ Bank not found' },
        { status: 404 }
      );
    }

    // Re-fetch to verify
    const updatedBank = await collection.findOne({ _id: objectId });
    const updatedMcq = updatedBank?.mcqs?.[questionIndex];

    console.log(`[EditQuestion] Bank: ${bankId}, Q${questionIndex} edited successfully`);

    return NextResponse.json({
      success: true,
      message: 'Question updated successfully',
      question: updatedMcq,
    });
  } catch (error: any) {
    console.error('[EditQuestion] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
