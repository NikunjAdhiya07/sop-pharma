import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TestSession from '@/models/TestSession';
import TrainingMatrix from '@/models/TrainingMatrix';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
    
    const session = await TestSession.findById(id);
    return NextResponse.json({ success: true, data: session });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Submit Test
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { sessionId, answers } = await request.json(); // answers: { [index]: value }

    const session = await TestSession.findById(sessionId);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    // Evaluate
    let correctCount = 0;
    session.questions.forEach((q, idx) => {
      const uAnswer = answers[idx];
      q.userAnswer = uAnswer;
      q.isCorrect = uAnswer === q.correctAnswer;
      if (q.isCorrect) correctCount++;
    });

    const scorePercent = (correctCount / session.totalQuestions) * 100;
    session.correctCount = correctCount;
    session.score = scorePercent;
    session.completedAt = new Date();
    
    const isPassed = scorePercent === 100; // Requirement: Clear all questions
    session.status = isPassed ? 'Completed' : 'Re-test Required';
    await session.save();

    // Update Master Matrix
    const matrix = await TrainingMatrix.findById(session.matrixId);
    if (matrix) {
      matrix.score = scorePercent;
      matrix.passStatus = isPassed ? 'Pass' : 'Fail';
      if (isPassed) {
        matrix.status = 'Completed';
      }
      await matrix.save();
    }

    return NextResponse.json({ 
      success: true, 
      isPassed, 
      score: scorePercent,
      correctCount,
      totalCount: session.totalQuestions 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Create Retest
export async function PUT(request: NextRequest) {
  try {
    await connectDB();
    const { parentSessionId } = await request.json();

    const parent = await TestSession.findById(parentSessionId);
    if (!parent) return NextResponse.json({ error: 'Parent session not found' }, { status: 404 });

    // Filter only wrong answers
    const wrongQuestions = parent.questions.filter(q => !q.isCorrect);
    
    if (wrongQuestions.length === 0) {
      return NextResponse.json({ error: 'No wrong answers found to retest' }, { status: 400 });
    }

    // Create new retest session
    const session = await TestSession.create({
      matrixId: parent.matrixId,
      employeeName: parent.employeeName,
      sopIdentifier: parent.sopIdentifier,
      sopName: parent.sopName,
      totalQuestions: wrongQuestions.length,
      isRetest: true,
      parentSessionId: parent._id,
      attemptNumber: parent.attemptNumber + 1,
      questions: wrongQuestions.map(q => ({
        question: q.question,
        options: [...q.options].sort(() => 0.5 - Math.random()), // Shuffle options
        correctAnswer: q.correctAnswer
      })),
      status: 'Started'
    });

    // Update Matrix record to point to new session
    await TrainingMatrix.findByIdAndUpdate(parent.matrixId, {
      testSessionId: session._id,
      status: 'In Progress'
    });

    return NextResponse.json({ success: true, sessionId: session._id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
