import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';
import MCQBank from '@/models/MCQBank';
import TestSession from '@/models/TestSession';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    
    const department = searchParams.get('department');
    const trainer = searchParams.get('trainer');
    const sop = searchParams.get('sop');
    const month = searchParams.get('month');
    const status = searchParams.get('status');

    let query: any = {};
    if (department && department !== 'all') query.department = department;
    if (trainer && trainer !== 'all') query.trainerName = trainer;
    if (sop && sop !== 'all') query.sopIdentifier = sop;
    if (status && status !== 'all') query.status = status;

    if (month && month !== 'all') {
      // month format: YYYY-MM
      const startDate = new Date(`${month}-01T00:00:00.000Z`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      
      query.trainingDate = {
        $gte: startDate,
        $lt: endDate
      };
    }

    const data = await TrainingMatrix.find(query).sort({ createdAt: -1 });

    const monthAgg = await TrainingMatrix.aggregate([
      { $match: { trainingDate: { $exists: true } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$trainingDate' } } } },
      { $sort: { _id: 1 } }
    ]);
    const months = monthAgg.map(m => m._id).filter(Boolean);

    // Get filter options for UI
    const filters = {
      departments: await TrainingMatrix.distinct('department'),
      trainers: await TrainingMatrix.distinct('trainerName'),
      sops: await TrainingMatrix.distinct('sopIdentifier'),
      months: months,
    };

    return NextResponse.json({ success: true, data, filters });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Assign Test
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { matrixId, questionCount = 10 } = await request.json();

    const matrix = await TrainingMatrix.findById(matrixId);
    if (!matrix) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

    // Find questions from MCQ Bank
    const mBank = await MCQBank.findOne({ sopIdentifier: matrix.sopIdentifier });
    if (!mBank || mBank.mcqs.length === 0) {
      return NextResponse.json({ error: 'No MCQ Bank found for this SOP. Please generate MCQs first.' }, { status: 400 });
    }

    // Pick random questions
    const shuffled = [...mBank.mcqs].sort(() => 0.5 - Math.random());
    const selectedMcqs = shuffled.slice(0, Math.min(questionCount, shuffled.length));

    // Create Test Session
    const session = await TestSession.create({
      matrixId: matrix._id,
      employeeName: matrix.employeeName,
      sopIdentifier: matrix.sopIdentifier,
      sopName: matrix.sopName || matrix.sopIdentifier,
      totalQuestions: selectedMcqs.length,
      questions: selectedMcqs.map(q => ({
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer
      })),
      status: 'Started'
    });

    // Update Matrix record
    matrix.testSessionId = session._id as any;
    matrix.status = 'In Progress';
    await matrix.save();

    return NextResponse.json({ success: true, sessionId: session._id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
