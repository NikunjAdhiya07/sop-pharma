import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import SOP from '@/models/SOP';

export async function GET() {
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
      // Find SOP (case-insensitive, starts with)
      const sop = await SOP.findOne({ 
        identifier: { $regex: new RegExp(`^${identifier}`, 'i') }
      });

      if (!sop) {
        results.push({
          identifier,
          status: 'SOP not found',
          mcqCount: 0,
        });
        continue;
      }

      // Find MCQ Bank
      const mcqBank = await MCQBank.findOne({ sopId: sop._id });

      if (!mcqBank) {
        results.push({
          identifier,
          status: 'No MCQ bank',
          sopStatus: sop.status,
          mcqCount: 0,
        });
      } else {
        results.push({
          identifier,
          status: mcqBank.mcqs.length < 100 ? 'Partial' : 'Complete',
          mcqCount: mcqBank.mcqs.length,
          distribution: mcqBank.difficultyDistribution,
          sopStatus: sop.status,
        });
      }
    }

    const totalMCQs = results.reduce((sum, r) => sum + r.mcqCount, 0);
    const filesWithMCQs = results.filter(r => r.mcqCount > 0).length;

    return NextResponse.json({
      results,
      summary: {
        totalFiles: failedFiles.length,
        filesWithMCQs,
        totalMCQs,
      }
    });

  } catch (error) {
    console.error('Error checking MCQs:', error);
    return NextResponse.json(
      { error: 'Failed to check MCQs', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
