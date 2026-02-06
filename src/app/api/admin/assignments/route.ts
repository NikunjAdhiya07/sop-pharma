import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import TestAssignment from '@/models/TestAssignment';
import User from '@/models/User';
import SOP from '@/models/SOP';
import { Notification } from '@/models/Notification';

export async function GET() {
  try {
    await dbConnect();

    const assignments = await TestAssignment.find({})
      .populate('userId', 'name username employeeId department')
      .populate('assignedBy', 'name')
      .populate('sopIds', 'name identifier')
      .sort({ assignedAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      assignments,
    });
  } catch (error) {
    console.error('Error fetching test assignments:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch test assignments' },
      { status: 500 }
    );
  }
}

// Create a new test assignment
export async function POST(request: Request) {
  try {
    await dbConnect();

    const {
      userId,
      testType,
      testName,
      sopIds,
      departments,
      difficulty,
      questionCount,
      assignedBy,
      deadline,
      maxAttempts,
    } = await request.json();

    if (!userId || !testType || !testName || !assignedBy) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const assignment = new TestAssignment({
      userId,
      testType,
      testName,
      sopIds: sopIds || [],
      departments: departments || [],
      difficulty,
      questionCount: questionCount || 20,
      assignedBy,
      deadline,
      maxAttempts: maxAttempts || 3,
    });

    await assignment.save();

    // Update user's testsAssigned count
    await User.findByIdAndUpdate(userId, {
      $inc: { testsAssigned: 1 },
    });

    // Create Notification
    try {
      await Notification.create({
        recipient: userId,
        type: 'assignment',
        title: 'New Test Assigned',
        message: `You have been assigned a new test: "${testName}". Please complete it by ${deadline ? new Date(deadline).toLocaleDateString() : 'the deadline'}.`,
        link: '/mcq-tests', // Assuming this is where tests are listed
        read: false,
        createdAt: new Date()
      });
    } catch (notifError) {
      console.error('Failed to create assignment notification:', notifError);
    }

    const populatedAssignment = await TestAssignment.findById(assignment._id)
      .populate('userId', 'name username employeeId department')
      .populate('assignedBy', 'name')
      .populate('sopIds', 'name identifier')
      .lean();

    return NextResponse.json({
      success: true,
      message: 'Test assigned successfully',
      assignment: populatedAssignment,
    });
  } catch (error) {
    console.error('Error creating test assignment:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create test assignment' },
      { status: 500 }
    );
  }
}
