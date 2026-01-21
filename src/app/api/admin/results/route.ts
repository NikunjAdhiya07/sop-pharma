import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import TestResult from '@/models/TestResult';

export async function GET() {
  try {
    await dbConnect();

    const results = await TestResult.find({})
      .populate('userId', 'name username employeeId department')
      .populate('assignmentId')
      .sort({ completedAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Error fetching test results:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch test results' },
      { status: 500 }
    );
  }
}
