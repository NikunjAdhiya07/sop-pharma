import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingSopAttempt from '@/models/TrainingSopAttempt';
import TrainingCertificate from '@/models/TrainingCertificate';

// GET /api/training/exam/history?matrixId=xxx
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const matrixId = searchParams.get('matrixId');
    const employeeName = searchParams.get('employeeName');

    const query: any = {};
    if (matrixId) query.matrixId = matrixId;
    else if (employeeName) query.employeeName = employeeName;

    const attempts = await TrainingSopAttempt.find(query)
      .sort({ attemptNumber: 1 })
      .select('-questions'); // Don't send full question data in list view

    // Get any certificate for passed attempts
    const passedAttempt = attempts.find(a => a.status === 'passed');
    let certificate = null;
    if (passedAttempt) {
      certificate = await TrainingCertificate.findOne({ attemptId: passedAttempt._id });
    }

    return NextResponse.json({ success: true, attempts, certificate });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
