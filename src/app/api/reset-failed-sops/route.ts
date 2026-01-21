import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';

export async function POST() {
  try {
    await connectDB();

    const failedFiles = [
      'QAMI43-04',
      'QAMI45-02',
      'QAMI46-02',
      'QAMI47-03',
      'QAMI48-02',
      'QAMI49-02',
      'QAMI53-02',
      'QAMI54-02',
      'QAMI55-02',
    ];

    const results = [];

    for (const identifier of failedFiles) {
      const sop = await SOP.findOne({ 
        identifier: { $regex: new RegExp(`^${identifier}`, 'i') }
      });

      if (!sop) {
        results.push({ identifier, status: 'not_found' });
        continue;
      }

      // Delete existing MCQ bank if it exists (it's empty anyway)
      await MCQBank.deleteOne({ sopId: sop._id });

      // Reset SOP status
      const oldStatus = sop.status;
      sop.status = 'pending';
      sop.mcqCount = 0;
      sop.processedAt = undefined;
      await sop.save();

      results.push({ 
        identifier, 
        status: 'reset',
        previousStatus: oldStatus,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Failed SOPs have been reset and are ready for reprocessing',
      results,
      nextSteps: [
        'Go to your bulk processing page',
        'Process these files again',
        'Watch the console for partial MCQ saves',
        'Check /api/check-saved-mcqs to verify results'
      ]
    });

  } catch (error) {
    console.error('Error resetting SOPs:', error);
    return NextResponse.json(
      { error: 'Failed to reset SOPs', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
