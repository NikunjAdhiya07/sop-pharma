import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';
import MCQBank from '@/models/MCQBank';
import TestSession from '@/models/TestSession';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { questionCount = 10, month } = await request.json().catch(() => ({}));

    let query: any = { status: 'Pending' };

    if (month && month !== 'all') {
      const startDate = new Date(`${month}-01T00:00:00.000Z`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      
      query.trainingDate = {
        $gte: startDate,
        $lt: endDate
      };
    }

    // Find all 'Pending' training matrix records (optionally filtered by month)
    const pendingRecords = await TrainingMatrix.find(query);

    if (!pendingRecords || pendingRecords.length === 0) {
      return NextResponse.json({ success: true, message: 'No pending records to schedule.', scheduledCount: 0 });
    }

    let scheduledCount = 0;
    let errors: string[] = [];

    for (const matrix of pendingRecords) {
      try {
        // Find questions from MCQ Bank for this SOP
        const mBank = await MCQBank.findOne({ sopIdentifier: matrix.sopIdentifier });
        
        if (!mBank || mBank.mcqs.length === 0) {
          if (!errors.includes(matrix.sopIdentifier)) {
             errors.push(matrix.sopIdentifier);
          }
          continue; // Skip if no MCQs available
        }

        // Pick random questions
        const shuffled = [...mBank.mcqs].sort(() => 0.5 - Math.random());
        const selectedMcqs = shuffled.slice(0, Math.min(questionCount, shuffled.length));

        if (selectedMcqs.length === 0) continue;

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

        scheduledCount++;
      } catch (err: any) {
        console.error(`Error scheduling test for matrix ${matrix._id}:`, err);
      }
    }

    let resultMessage = `Successfully scheduled ${scheduledCount} tests.`;
    if (errors.length > 0) {
      resultMessage += ` Warning: Could not schedule tests for these SOPs due to missing MCQs: ${errors.join(', ')}`;
    }

    return NextResponse.json({ 
      success: true, 
      scheduledCount, 
      skippedCount: pendingRecords.length - scheduledCount,
      message: resultMessage 
    });

  } catch (error: any) {
    console.error('Bulk assign error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
