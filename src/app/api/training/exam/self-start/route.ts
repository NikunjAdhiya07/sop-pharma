import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MatrixEntry from '@/models/MatrixEntry';
import TrainingMatrix from '@/models/TrainingMatrix';
import TrainingSopAttempt from '@/models/TrainingSopAttempt';
import MCQBank from '@/models/MCQBank';

const MAX_ATTEMPTS = 5;

/**
 * POST /api/training/exam/self-start
 * Starts (or resumes) an exam for a self-service trainer.
 * Creates a TrainingMatrix record if one doesn't exist yet.
 * Body: { employeeName, department, sopCode, month, year }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { employeeName, department, sopCode, month, year } = await request.json();

    if (!employeeName || !department || !sopCode) {
      return NextResponse.json(
        { success: false, error: 'employeeName, department, and sopCode are required' },
        { status: 400 }
      );
    }

    // Verify this SOP is actually assigned to this employee in MatrixEntry
    const matrixEntryQuery: any = { employeeName, department, sopCode };
    if (month) matrixEntryQuery.month = parseInt(month);
    if (year)  matrixEntryQuery.year  = parseInt(year);

    const matrixEntry = await MatrixEntry.findOne(matrixEntryQuery).lean();
    if (!matrixEntry) {
      return NextResponse.json(
        { success: false, error: `SOP ${sopCode} is not assigned to ${employeeName} in ${department}.` },
        { status: 400 }
      );
    }

    // Find or create a TrainingMatrix record to tie into the existing attempt/cert system
    const trainingDate = new Date(
      matrixEntry.year,
      matrixEntry.month - 1,  // JS month is 0-indexed
      1
    );

    let matrix = await TrainingMatrix.findOne({
      employeeName,
      department,
      sopIdentifier: sopCode,
      trainingDate,
    });

    if (!matrix) {
      // Find MCQ bank for sopName
      const mcqBank = await MCQBank.findOne({
        sopIdentifier: { $regex: `^${sopCode}([-_]|$)`, $options: 'i' },
      }).select('sopName').lean();

      matrix = await TrainingMatrix.create({
        employeeName,
        department,
        sopIdentifier: sopCode,
        sopName: (mcqBank as any)?.sopName || sopCode,
        trainingDate,
        sourceFile: matrixEntry.sourceFile,
        extractedAt: matrixEntry.extractedAt || new Date(),
        status: 'Pending',
        passStatus: 'Not Taken',
        attemptCount: 0,
        retestRequired: false,
      });
    }

    // ── Attempt logic (mirrors exam/start) ──────────────────────────────────
    const existingAttempts = await TrainingSopAttempt.find({ matrixId: matrix._id })
      .sort({ attemptNumber: 1 });
    const attemptCount = existingAttempts.length;

    const passed = existingAttempts.find(a => a.status === 'passed');
    if (passed) {
      return NextResponse.json(
        { success: false, error: 'You have already passed this exam!', alreadyPassed: true, matrixId: matrix._id },
        { status: 400 }
      );
    }

    if (attemptCount >= MAX_ATTEMPTS) {
      return NextResponse.json(
        {
          success: false,
          error: `Maximum of ${MAX_ATTEMPTS} attempts reached for ${sopCode}.`,
          maxedOut: true,
          attemptsUsed: attemptCount,
        },
        { status: 400 }
      );
    }

    // Check for in-progress attempt (resume)
    const inProgress = existingAttempts.find(a => a.status === 'in_progress');
    if (inProgress) {
      return NextResponse.json({
        success: true,
        attemptId: inProgress._id,
        matrixId: matrix._id,
        attemptNumber: inProgress.attemptNumber,
        attemptsUsed: attemptCount,
        attemptsRemaining: MAX_ATTEMPTS - attemptCount,
        questions: inProgress.questions.map(q => ({
          question: q.question,
          options: q.options,
        })),
        totalQuestions: inProgress.totalQuestions,
        sopName: matrix.sopName,
        monthName: matrixEntry.monthName,
        month: matrixEntry.month,
        year: matrixEntry.year,
        resumed: true,
      });
    }

    // Find MCQ bank
    const mcqBank = await MCQBank.findOne({
      sopIdentifier: { $regex: `^${sopCode}([-_]|$)`, $options: 'i' },
    });

    if (!mcqBank || mcqBank.mcqs.length === 0) {
      return NextResponse.json(
        { success: false, error: `No exam questions found for ${sopCode}. Please contact your administrator.` },
        { status: 404 }
      );
    }

    const newAttemptNumber = attemptCount + 1;
    let selectedQuestions: any[];

    if (newAttemptNumber === 1) {
      // First attempt: random pool, up to 20 questions
      const pool = [...mcqBank.mcqs].sort(() => 0.5 - Math.random());
      selectedQuestions = pool.slice(0, Math.min(20, pool.length));
    } else {
      // Subsequent attempts: only wrong answers from previous attempt
      const prevAttempt = existingAttempts[existingAttempts.length - 1];
      const wrongQs = prevAttempt.questions.filter(q => q.isCorrect === false);
      if (wrongQs.length === 0) {
        return NextResponse.json(
          { success: false, error: 'All previous questions were correct.' },
          { status: 400 }
        );
      }
      selectedQuestions = wrongQs.map(wq => {
        const bankQ = mcqBank.mcqs.find((bq: any) => bq.question === wq.question);
        return bankQ || wq;
      });
    }

    // Create attempt
    const attempt = await TrainingSopAttempt.create({
      matrixId: matrix._id,
      employeeName,
      department,
      sopIdentifier: sopCode,
      sopName: matrix.sopName || sopCode,
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

    matrix.status = 'In Progress';
    matrix.attemptCount = newAttemptNumber;
    await matrix.save();

    return NextResponse.json({
      success: true,
      attemptId: attempt._id,
      matrixId: matrix._id,
      attemptNumber: newAttemptNumber,
      attemptsUsed: newAttemptNumber,
      attemptsRemaining: MAX_ATTEMPTS - newAttemptNumber,
      totalQuestions: selectedQuestions.length,
      sopName: matrix.sopName,
      monthName: matrixEntry.monthName,
      month: matrixEntry.month,
      year: matrixEntry.year,
      questions: selectedQuestions.map((q: any) => ({
        question: q.question,
        options: q.options,
      })),
      resumed: false,
    });
  } catch (error: any) {
    console.error('[self-start] error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
