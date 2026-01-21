import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import TestAssignment from '@/models/TestAssignment';
import TestResult from '@/models/TestResult';

export async function POST() {
  try {
    await dbConnect();

    // Create sample users
    const sampleUsers = [
      {
        username: 'john.doe',
        password: 'password123',
        name: 'John Doe',
        role: 'user',
        employeeId: 'EMP001',
        department: 'Quality Assurance',
        email: 'john.doe@company.com',
      },
      {
        username: 'jane.smith',
        password: 'password123',
        name: 'Jane Smith',
        role: 'user',
        employeeId: 'EMP002',
        department: 'Production',
        email: 'jane.smith@company.com',
      },
      {
        username: 'bob.wilson',
        password: 'password123',
        name: 'Bob Wilson',
        role: 'user',
        employeeId: 'EMP003',
        department: 'Quality Assurance',
        email: 'bob.wilson@company.com',
      },
      {
        username: 'alice.brown',
        password: 'password123',
        name: 'Alice Brown',
        role: 'user',
        employeeId: 'EMP004',
        department: 'Training',
        email: 'alice.brown@company.com',
      },
    ];

    const createdUsers = [];
    for (const userData of sampleUsers) {
      const existingUser = await User.findOne({ username: userData.username });
      if (!existingUser) {
        const user = new User(userData);
        await user.save();
        createdUsers.push(user);
      } else {
        createdUsers.push(existingUser);
      }
    }

    // Get admin user (demo)
    const adminUser = await User.findOne({ username: 'demo' });
    if (!adminUser) {
      return NextResponse.json({
        success: false,
        message: 'Admin user not found. Please run /api/auth/seed first.',
      });
    }

    // Create sample test assignments
    const sampleAssignments = [
      {
        userId: createdUsers[0]._id,
        testType: 'induction',
        testName: 'Quality Assurance Induction Test',
        departments: ['Quality Assurance'],
        questionCount: 20,
        assignedBy: adminUser._id,
        status: 'completed',
        score: 95,
        isPassed: true,
        attempts: 1,
        completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      },
      {
        userId: createdUsers[0]._id,
        testType: 'regular',
        testName: 'Monthly QA Assessment',
        departments: ['Quality Assurance'],
        questionCount: 20,
        assignedBy: adminUser._id,
        status: 'completed',
        score: 88,
        isPassed: true,
        attempts: 1,
        completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      },
      {
        userId: createdUsers[1]._id,
        testType: 'induction',
        testName: 'Production Department Induction',
        departments: ['Production'],
        questionCount: 20,
        assignedBy: adminUser._id,
        status: 'in-progress',
        attempts: 0,
      },
      {
        userId: createdUsers[2]._id,
        testType: 'kapa',
        testName: 'KAPA Training Assessment',
        departments: ['Quality Assurance'],
        questionCount: 20,
        assignedBy: adminUser._id,
        status: 'pending',
        attempts: 0,
      },
    ];

    for (const assignmentData of sampleAssignments) {
      const existingAssignment = await TestAssignment.findOne({
        userId: assignmentData.userId,
        testName: assignmentData.testName,
      });
      
      if (!existingAssignment) {
        const assignment = new TestAssignment(assignmentData);
        await assignment.save();

        // Update user stats
        await User.findByIdAndUpdate(assignmentData.userId, {
          $inc: { testsAssigned: 1 },
        });

        if (assignmentData.status === 'completed') {
          await User.findByIdAndUpdate(assignmentData.userId, {
            $inc: { testsCompleted: 1 },
          });

          // Create a test result
          const testResult = new TestResult({
            assignmentId: assignment._id,
            userId: assignmentData.userId,
            testType: assignmentData.testType,
            questions: [], // Empty for demo
            score: assignmentData.score || 0,
            totalQuestions: assignmentData.questionCount,
            correctAnswers: Math.round((assignmentData.score || 0) * assignmentData.questionCount / 100),
            isPassed: assignmentData.isPassed || false,
            passingScore: 80,
            startedAt: new Date(assignmentData.completedAt!.getTime() - 30 * 60 * 1000), // 30 mins before completion
            completedAt: assignmentData.completedAt!,
            timeTaken: 1800, // 30 minutes in seconds
            attemptNumber: 1,
          });
          await testResult.save();
        }
      }
    }

    // Update user statistics
    for (const user of createdUsers) {
      const assignments = await TestAssignment.find({ userId: user._id });
      const results = await TestResult.find({ userId: user._id });

      const testsAssigned = assignments.length;
      const testsCompleted = assignments.filter(a => a.status === 'completed').length;
      const avgScore = results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;
      const completionRate = testsAssigned > 0 ? (testsCompleted / testsAssigned) * 100 : 0;
      const isTrainerEligible = completionRate === 100 && avgScore >= 80 && testsAssigned > 0;

      await User.findByIdAndUpdate(user._id, {
        testsAssigned,
        testsCompleted,
        averageScore: Math.round(avgScore),
        isTrainerEligible,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Sample data seeded successfully',
      data: {
        usersCreated: createdUsers.length,
        assignmentsCreated: sampleAssignments.length,
      },
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to seed data', error: String(error) },
      { status: 500 }
    );
  }
}
