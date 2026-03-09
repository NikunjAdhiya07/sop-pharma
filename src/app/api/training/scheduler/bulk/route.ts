import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';
import MCQBank from '@/models/MCQBank';
import TestSession from '@/models/TestSession';

// POST /api/training/scheduler/bulk — schedule tests for a filtered subset
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { trainer, sopIdentifier, month, department, questionCount = 10 } = await request.json();

    const query: any = { status: 'Pending' };
    if (trainer) query.trainerName = trainer;
    if (sopIdentifier) query.sopIdentifier = sopIdentifier;
    if (department) query.department = department;
    if (month && month !== 'all') {
      const [y, m] = month.split('-').map(Number);
      query.trainingDate = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) };
    }

    const pendingRecords = await TrainingMatrix.find(query);
    if (!pendingRecords.length) {
      return NextResponse.json({ success: true, scheduledCount: 0, message: 'No pending records match the filter.' });
    }

    let scheduledCount = 0;
    const skippedSOPs = new Set<string>();

    for (const matrix of pendingRecords) {
      try {
        const mBank = await MCQBank.findOne({ sopIdentifier: matrix.sopIdentifier });
        if (!mBank || mBank.mcqs.length === 0) {
          skippedSOPs.add(matrix.sopIdentifier);
          continue;
        }

        const shuffled = [...mBank.mcqs].sort(() => 0.5 - Math.random());
        const selectedMcqs = shuffled.slice(0, Math.min(questionCount, shuffled.length));
        if (!selectedMcqs.length) continue;

        const session = await TestSession.create({
          matrixId: matrix._id,
          employeeName: matrix.employeeName,
          sopIdentifier: matrix.sopIdentifier,
          sopName: matrix.sopName || matrix.sopIdentifier,
          trainerName: matrix.trainerName,
          department: matrix.department,
          totalQuestions: selectedMcqs.length,
          questions: selectedMcqs.map((q: any) => ({
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
          })),
          status: 'Started',
        });

        matrix.testSessionId = session._id as any;
        matrix.status = 'In Progress';
        await matrix.save();
        scheduledCount++;
      } catch (err) {
        console.error('Error scheduling record', matrix._id, err);
      }
    }

    const skippedMsg = skippedSOPs.size > 0
      ? ` Skipped ${skippedSOPs.size} SOP(s) with no MCQ bank: ${[...skippedSOPs].join(', ')}`
      : '';

    return NextResponse.json({
      success: true,
      scheduledCount,
      skippedCount: pendingRecords.length - scheduledCount,
      message: `Scheduled ${scheduledCount} tests.${skippedMsg}`,
    });
  } catch (error: any) {
    console.error('Scheduler bulk error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
