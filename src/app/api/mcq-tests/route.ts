import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import MCQBankTestResult from '@/models/MCQBankTestResult';
import User from '@/models/User';

// GET: Fetch available MCQ banks for testing
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Fetch all MCQ banks
    const mcqBanks = await MCQBank.find({})
      .select('sopName sopIdentifier totalQuestions difficultyDistribution department')
      .sort({ createdAt: -1 });

    // Fetch user's test history
    const testHistory = await MCQBankTestResult.find({ userId })
      .select('mcqBankId score isPassed attemptNumber completedAt')
      .sort({ completedAt: -1 });

    // Group test history by MCQ bank
    const testHistoryMap = new Map();
    testHistory.forEach(test => {
      const bankId = test.mcqBankId.toString();
      if (!testHistoryMap.has(bankId)) {
        testHistoryMap.set(bankId, []);
      }
      testHistoryMap.get(bankId).push({
        score: test.score,
        isPassed: test.isPassed,
        attemptNumber: test.attemptNumber,
        completedAt: test.completedAt,
      });
    });

    // Combine MCQ banks with test history
    const banksWithHistory = mcqBanks.map(bank => ({
      _id: bank._id,
      sopName: bank.sopName,
      sopIdentifier: bank.sopIdentifier,
      totalQuestions: bank.totalQuestions,
      difficultyDistribution: bank.difficultyDistribution,
      department: bank.department,
      attempts: testHistoryMap.get(bank._id.toString()) || [],
      totalAttempts: (testHistoryMap.get(bank._id.toString()) || []).length,
      bestScore: Math.max(0, ...(testHistoryMap.get(bank._id.toString()) || []).map((t: any) => t.score)),
    }));

    return NextResponse.json({
      success: true,
      mcqBanks: banksWithHistory,
    });

  } catch (error) {
    console.error('Error fetching MCQ banks for tests:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch MCQ banks',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST: Submit test results
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const {
      userId,
      mcqBankId,
      answers,
      timeTaken,
      startedAt,
    } = body;

    if (!userId || !mcqBankId || !answers) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Fetch user
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Fetch MCQ bank
    const mcqBank = await MCQBank.findById(mcqBankId);
    if (!mcqBank) {
      return NextResponse.json(
        { error: 'MCQ Bank not found' },
        { status: 404 }
      );
    }

    // Calculate attempt number
    const previousAttempts = await MCQBankTestResult.countDocuments({
      userId,
      mcqBankId,
    });
    const attemptNumber = previousAttempts + 1;

    // Process answers and calculate score
    const processedQuestions: Array<{
      questionIndex: number;
      question: string;
      aiIcon: string;
      difficulty: string;
      difficultyStars: string;
      options: string[];
      selectedAnswer: string;
      correctAnswer: string;
      isCorrect: boolean;
      explanation: string;
      sopReference: string;
    }> = [];
    let correctAnswers = 0;
    let incorrectAnswers = 0;
    let skippedQuestions = 0;

    const difficultyBreakdown = {
      easy: { correct: 0, total: 0 },
      medium: { correct: 0, total: 0 },
      hard: { correct: 0, total: 0 },
    };

    answers.forEach((answer: any, index: number) => {
      const mcq = mcqBank.mcqs[answer.questionIndex];
      const isCorrect = answer.selectedAnswer === mcq.correctAnswer;
      const isSkipped = !answer.selectedAnswer;

      if (isSkipped) {
        skippedQuestions++;
      } else if (isCorrect) {
        correctAnswers++;
      } else {
        incorrectAnswers++;
      }

      // Update difficulty breakdown
      const diffKey = mcq.difficulty.toLowerCase() as 'easy' | 'medium' | 'hard';
      difficultyBreakdown[diffKey].total++;
      if (isCorrect) {
        difficultyBreakdown[diffKey].correct++;
      }

      processedQuestions.push({
        questionIndex: answer.questionIndex,
        question: mcq.question,
        aiIcon: mcq.aiIcon,
        difficulty: mcq.difficulty,
        difficultyStars: mcq.difficultyStars,
        options: mcq.options,
        selectedAnswer: answer.selectedAnswer || '',
        correctAnswer: mcq.correctAnswer,
        isCorrect,
        explanation: mcq.explanation,
        sopReference: mcq.sopReference,
      });
    });

    const totalQuestions = answers.length;
    const score = Math.round((correctAnswers / totalQuestions) * 100);
    const passingScore = 70;
    const isPassed = score >= passingScore;

    // Calculate grade
    let grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
    if (score >= 95) grade = 'A+';
    else if (score >= 90) grade = 'A';
    else if (score >= 85) grade = 'B+';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';

    // Create test result
    const testResult = await MCQBankTestResult.create({
      userId,
      username: user.username,
      userFullName: user.name,
      mcqBankId,
      sopName: mcqBank.sopName,
      sopIdentifier: mcqBank.sopIdentifier,
      testName: `${mcqBank.sopIdentifier} - Attempt ${attemptNumber}`,
      questions: processedQuestions,
      totalQuestions,
      correctAnswers,
      incorrectAnswers,
      skippedQuestions,
      score,
      grade,
      isPassed,
      passingScore,
      difficultyBreakdown,
      timeTaken,
      startedAt: new Date(startedAt),
      completedAt: new Date(),
      attemptNumber,
    });

    // Update user statistics
    user.testsCompleted = (user.testsCompleted || 0) + 1;
    const allResults = await MCQBankTestResult.find({ userId });
    const totalScore = allResults.reduce((sum, r) => sum + r.score, 0);
    user.averageScore = Math.round(totalScore / allResults.length);
    await user.save();

    return NextResponse.json({
      success: true,
      testResult: {
        _id: testResult._id,
        score: testResult.score,
        grade: testResult.grade,
        isPassed: testResult.isPassed,
        correctAnswers: testResult.correctAnswers,
        incorrectAnswers: testResult.incorrectAnswers,
        skippedQuestions: testResult.skippedQuestions,
        totalQuestions: testResult.totalQuestions,
        difficultyBreakdown: testResult.difficultyBreakdown,
        attemptNumber: testResult.attemptNumber,
      },
    }, { status: 201 });

  } catch (error) {
    console.error('Error submitting test results:', error);
    return NextResponse.json(
      {
        error: 'Failed to submit test results',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
