import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';

/**
 * POST /api/mcq-bank/sync-similar-flags
 *
 * Clears ALL isSimilar:true flags on every question in every active MCQ bank
 * using a single bulk MongoDB operation. This fixes stale flags left over from
 * old cross-bank detect runs that bulk-regen never cleaned up.
 *
 * After this runs, the capsule "Similar" count will be 0 for banks that have
 * been fully resolved. Run the detect route again if you want to re-flag genuinely
 * similar questions.
 */
export async function POST() {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const collection = db.collection('mcqbanks');

    // Single bulk write: for every active bank, set isSimilar=false on every
    // element in the mcqs array that currently has isSimilar:true.
    // Uses MongoDB arrayFilters for an efficient in-place update.
    const result = await collection.updateMany(
      {
        // Only active (non-obsolete) banks
        $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }],
        // Only banks that actually have at least one flagged question
        'mcqs.isSimilar': true,
      },
      {
        $set: { 'mcqs.$[elem].isSimilar': false },
      },
      {
        arrayFilters: [{ 'elem.isSimilar': true }],
      }
    );

    return NextResponse.json({
      success: true,
      banksUpdated: result.modifiedCount,
      message: `Cleared isSimilar flags on ${result.modifiedCount} banks. All similar counts are now accurate.`,
    });
  } catch (error: any) {
    console.error('[sync-similar-flags] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
