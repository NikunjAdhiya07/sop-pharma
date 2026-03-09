import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';

// POST /api/training/acknowledge — record acknowledgement after passing test
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { matrixId, acknowledgedBy } = await request.json();

    if (!matrixId) {
      return NextResponse.json({ error: 'matrixId is required' }, { status: 400 });
    }

    const record = await TrainingMatrix.findByIdAndUpdate(
      matrixId,
      {
        $set: {
          acknowledgedAt: new Date(),
          acknowledgedBy: acknowledgedBy || 'Self',
          status: 'Trained',
        }
      },
      { new: true }
    );

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, record });
  } catch (error: any) {
    console.error('Acknowledge error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
