import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';
import TrainingSopAttempt from '@/models/TrainingSopAttempt';
import MCQBank from '@/models/MCQBank';

const MAX_ATTEMPTS = 5;
const EXAM_QUESTION_COUNT = 100;

// POST /api/training/exam/start
// Body: { matrixId }
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { matrixId } = await request.json();

    if (!matrixId) {
      return NextResponse.json({ success: false, error: 'matrixId is required' }, { status: 400 });
    }

    const matrix = await TrainingMatrix.findById(matrixId);
    if (!matrix) {
      return NextResponse.json({ success: false, error: 'Training record not found' }, { status: 404 });
    }

    // Check existing attempts
    const existingAttempts = await TrainingSopAttempt.find({ matrixId }).sort({ attemptNumber: 1 });
    const attemptCount = existingAttempts.length;

    // Check if already passed
    const passed = existingAttempts.find(a => a.status === 'passed');
    if (passed) {
      return NextResponse.json({ success: false, error: 'This SOP exam has already been passed.' }, { status: 400 });
    }

    // Check if maxed out
    if (attemptCount >= MAX_ATTEMPTS) {
      return NextResponse.json({ success: false, error: `Maximum ${MAX_ATTEMPTS} attempts reached.` }, { status: 400 });
    }

    // Check for an in-progress attempt
    const inProgress = existingAttempts.find(a => a.status === 'in_progress');
    if (inProgress) {
      // Return the existing in-progress attempt (resume)
      return NextResponse.json({
        success: true,
        attemptId: inProgress._id,
        attemptNumber: inProgress.attemptNumber,
        questions: inProgress.questions.map(q => ({
          question: q.question,
          options: q.options,
          // Do NOT send correctAnswer to client
        })),
        totalQuestions: inProgress.totalQuestions,
        resumed: true,
      });
    }

    // Find MCQ Bank for this SOP
    const mcqBank = await MCQBank.findOne({ sopIdentifier: matrix.sopIdentifier });
    if (!mcqBank || mcqBank.mcqs.length === 0) {
      return NextResponse.json({
        success: false,
        error: `No MCQ bank found for ${matrix.sopIdentifier}. Please generate MCQs first.`
      }, { status: 400 });
    }

    const newAttemptNumber = attemptCount + 1;
    let selectedQuestions: any[];

    if (newAttemptNumber === 1) {
      // First attempt: pick up to 100 random questions from the bank
      const pool = [...mcqBank.mcqs].sort(() => 0.5 - Math.random());
      selectedQuestions = pool.slice(0, Math.min(EXAM_QUESTION_COUNT, pool.length));
    } else {
      // Subsequent attempts: use ONLY the wrong questions from the previous attempt
      const prevAttempt = existingAttempts[existingAttempts.length - 1];
      const wrongQs = prevAttempt.questions.filter(q => q.isCorrect === false);

      if (wrongQs.length === 0) {
        // All were correct in prev — shouldn't happen since passed would be set, but guard it
        return NextResponse.json({ success: false, error: 'All previous questions were answered correctly.' }, { status: 400 });
      }

      // Match wrong questions back to MCQ bank to get fresh options (in case bank was updated)
      selectedQuestions = wrongQs.map(wq => {
        const bankQ = mcqBank.mcqs.find((bq: any) => bq.question === wq.question);
        return bankQ || wq; // fallback to stored question if not found
      });
    }

    // Build attempt document
    const attempt = await TrainingSopAttempt.create({
      matrixId: matrix._id,
      employeeName: matrix.employeeName,
      employeeCode: matrix.employeeCode,
      department: matrix.department,
      sopIdentifier: matrix.sopIdentifier,
      sopName: matrix.sopName || matrix.sopIdentifier,
      attemptNumber: newAttemptNumber,
      totalQuestions: selectedQuestions.length,
      questions: selectedQuestions.map((q: any) => ({
        questionId: q._id?.toString() || '',
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
      })),
      status: 'in_progress',
    });

    // Update matrix status
    matrix.status = 'In Progress';
    matrix.attemptCount = newAttemptNumber;
    await matrix.save();

    return NextResponse.json({
      success: true,
      attemptId: attempt._id,
      attemptNumber: newAttemptNumber,
      totalQuestions: selectedQuestions.length,
      questions: selectedQuestions.map((q: any) => ({
        question: q.question,
        options: q.options,
        // correctAnswer NOT sent to client
      })),
      resumed: false,
    });
  } catch (error: any) {
    console.error('Exam start error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
