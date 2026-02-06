import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import GuestAccess from '@/models/GuestAccess';
import TestResult from '@/models/TestResult';
import TestAssignment from '@/models/TestAssignment';
import User from '@/models/User';

export async function POST(request: Request) {
  try {
    await dbConnect();
    const { token, assignmentId, answers, score, userId, timeTaken } = await request.json();

    // Verify Token
    const guestAccess = await GuestAccess.findOne({ token });
    if (!guestAccess) {
        return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 401 });
    }

    // Verify Assignment
    const assignment = await TestAssignment.findById(assignmentId);
    if (!assignment || assignment.userId.toString() !== userId) {
         return NextResponse.json({ success: false, message: 'Invalid assignment' }, { status: 400 });
    }

    // Update Assignment
    assignment.status = 'completed';
    assignment.completedAt = new Date();
    assignment.score = score;
    assignment.isPassed = score >= 80; // Hardcoded passing score for now
    assignment.attempts += 1;
    await assignment.save();

    // Create TestResult
    const result = await TestResult.create({
        assignmentId: assignment._id,
        userId: userId,
        testType: assignment.testType,
        questions: answers, // Assumes answers format matches TestResult schema
        score: score,
        totalQuestions: answers.length,
        correctAnswers: answers.filter((a: any) => a.isCorrect).length,
        isPassed: score >= 80,
        passingScore: 80,
        startedAt: assignment.assignedAt, 
        completedAt: new Date(),
        timeTaken: timeTaken || 0,
        attemptNumber: 1
    });

    // Update GuestAccess
    guestAccess.status = 'completed';
    await guestAccess.save();

    // Update User Stats (Shadow User)
    await User.findByIdAndUpdate(userId, {
        $inc: { testsCompleted: 1 },
        lastLogin: new Date()
    });

    return NextResponse.json({
        success: true,
        resultId: result._id
    });

  } catch (error) {
    console.error('Guest submission error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}
