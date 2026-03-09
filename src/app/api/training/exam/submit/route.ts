import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';
import TrainingSopAttempt from '@/models/TrainingSopAttempt';
import TrainingCertificate from '@/models/TrainingCertificate';

const MAX_ATTEMPTS = 5;

function generateCertNumber(employeeName: string, sopId: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const empCode = employeeName.replace(/\s+/g, '').substring(0, 3).toUpperCase();
  const sopCode = sopId.replace(/[^A-Z0-9]/gi, '').substring(0, 4).toUpperCase();
  return `CERT-${empCode}-${sopCode}-${ts}`;
}

// POST /api/training/exam/submit
// Body: { attemptId, answers: [{ question: string, userAnswer: string }] }
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { attemptId, answers } = await request.json();

    if (!attemptId || !Array.isArray(answers)) {
      return NextResponse.json({ success: false, error: 'attemptId and answers are required' }, { status: 400 });
    }

    const attempt = await TrainingSopAttempt.findById(attemptId);
    if (!attempt) {
      return NextResponse.json({ success: false, error: 'Attempt not found' }, { status: 404 });
    }
    if (attempt.status !== 'in_progress') {
      return NextResponse.json({ success: false, error: 'Attempt already submitted' }, { status: 400 });
    }

    const matrix = await TrainingMatrix.findById(attempt.matrixId);
    if (!matrix) {
      return NextResponse.json({ success: false, error: 'Training record not found' }, { status: 404 });
    }

    // Build answer map
    const answerMap = new Map<string, string>();
    for (const a of answers) {
      answerMap.set(a.question, a.userAnswer);
    }

    // Grade each question
    let correctCount = 0;
    const gradedQuestions = attempt.questions.map(q => {
      const userAnswer = answerMap.get(q.question) || '';
      const isCorrect = userAnswer.trim() === q.correctAnswer.trim();
      if (isCorrect) correctCount++;
      return { ...((q as any).toObject ? (q as any).toObject() : q), userAnswer, isCorrect };
    });

    const totalQuestions = attempt.totalQuestions;
    const wrongCount = totalQuestions - correctCount;
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const passed = correctCount === totalQuestions; // 100% pass requirement

    // Count total attempts for this matrix record
    const totalAttemptsSoFar = await TrainingSopAttempt.countDocuments({ matrixId: attempt.matrixId });
    const isMaxedOut = !passed && totalAttemptsSoFar >= MAX_ATTEMPTS;

    const attemptStatus = passed ? 'passed' : isMaxedOut ? 'maxed_out' : 'failed';

    // Update attempt
    attempt.questions = gradedQuestions as any;
    attempt.score = score;
    attempt.correctCount = correctCount;
    attempt.wrongCount = wrongCount;
    attempt.status = attemptStatus;
    attempt.completedAt = new Date();
    await attempt.save();

    // Update matrix record
    matrix.score = score;
    matrix.attemptCount = totalAttemptsSoFar;

    let certificate: any = null;

    if (passed) {
      matrix.passStatus = 'Pass';
      matrix.status = 'Completed';
      matrix.retestRequired = false;

      // Auto-generate certificate
      const certNumber = generateCertNumber(attempt.employeeName, attempt.sopIdentifier);
      certificate = await TrainingCertificate.create({
        matrixId: matrix._id,
        attemptId: attempt._id,
        employeeName: attempt.employeeName,
        employeeCode: attempt.employeeCode,
        department: attempt.department,
        sopIdentifier: attempt.sopIdentifier,
        sopName: attempt.sopName,
        attemptNumber: attempt.attemptNumber,
        score: score,
        completedAt: new Date(),
        certificateNumber: certNumber,
      });
    } else if (isMaxedOut) {
      matrix.passStatus = 'Fail';
      matrix.status = 'Retest Required';
      matrix.retestRequired = true;
    } else {
      // Still has attempts remaining
      matrix.passStatus = 'Fail';
      matrix.status = 'In Progress';
      matrix.retestRequired = true;
      // Store wrong answers for reference
      matrix.wrongAnswers = gradedQuestions
        .filter(q => !q.isCorrect)
        .map(q => ({
          question: q.question,
          selectedAnswer: q.userAnswer || '',
          correctAnswer: q.correctAnswer,
        }));
    }

    await matrix.save();

    const attemptsRemaining = passed || isMaxedOut ? 0 : MAX_ATTEMPTS - totalAttemptsSoFar;

    return NextResponse.json({
      success: true,
      score,
      correctCount,
      wrongCount,
      totalQuestions,
      passed,
      maxedOut: isMaxedOut,
      attemptsRemaining,
      attemptNumber: attempt.attemptNumber,
      certificateId: certificate?._id,
      certificateNumber: certificate?.certificateNumber,
      wrongQuestions: gradedQuestions
        .filter(q => !q.isCorrect)
        .map(q => ({ question: q.question, correctAnswer: q.correctAnswer, userAnswer: q.userAnswer })),
    });
  } catch (error: any) {
    console.error('Exam submit error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
