import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import { invalidateMcqCaches } from '@/lib/mcqCacheInvalidate';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { bankId, questionIndex, isChecked, isReviewed, isSimilar } = body;

    if (!bankId || questionIndex === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const updateQuery: any = {};
    if (isChecked !== undefined) {
      updateQuery[`mcqs.${questionIndex}.isChecked`] = isChecked;
    }
    if (isReviewed !== undefined) {
      updateQuery[`mcqs.${questionIndex}.isReviewed`] = isReviewed;
    }
    if (isSimilar !== undefined) {
      updateQuery[`mcqs.${questionIndex}.isSimilar`] = isSimilar;
    }

    if (Object.keys(updateQuery).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No update data provided' },
        { status: 400 }
      );
    }

    console.log(`[StatusUpdate] Bank: ${bankId}, Q${questionIndex}, update:`, updateQuery);

    // Use native MongoDB driver to bypass Mongoose schema filtering
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

    console.log(`[StatusUpdate] Result: matched=${result.matchedCount}, modified=${result.modifiedCount}`);

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'MCQ Bank not found' },
        { status: 404 }
      );
    }

    // Re-fetch using native driver to verify the update
    const updatedBank = await collection.findOne({ _id: objectId });
    if (!updatedBank) {
      return NextResponse.json(
        { success: false, error: 'Re-fetch failed' },
        { status: 500 }
      );
    }

    const updatedMcq = updatedBank.mcqs[questionIndex];
    console.log(`[StatusUpdate] Verified Q${questionIndex}: isChecked=${updatedMcq?.isChecked}, isReviewed=${updatedMcq?.isReviewed}`);

    void invalidateMcqCaches();

    return NextResponse.json({
      success: true,
      message: 'Question status updated successfully',
      question: updatedMcq
    });
  } catch (error: any) {
    console.error('[StatusUpdate] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
