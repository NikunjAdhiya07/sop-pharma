import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import TestResult from '@/models/TestResult';
import User from '@/models/User';
import { getServerSession } from 'next-auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sopId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session || !session.user) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    
    // TODO: Verify trainer is assigned to this SOP (security check)

    // Fetch all test results associated with this SOP
    // Note: TestResult scheme stores `questions` which have `sopId` usually, 
    // OR we can query by `sopIdentifier` if stored. 
    // Ideally we assume an 'SOP Test' linked to this SOP.
    
    // Ideally we query TestAssignments that include this SOP ID
    // But for now let's query TestResults for quick stats.
    
    // Better approach: Find all users. Check their latest result for this SOP.
    // Simplifying: Fetch recent results for this SOP logic.

    // Assuming we want to see WHO has trained on this SOP.
    // We look for TestResults where `questions` contain this SOP's identifier.
    // Use aggregate for performance if large data
    
    const { sopId } = await params;

    // Fetch results
    const results = await TestResult.find({
        'questions.sopId': sopId 
    }).populate('userId', 'name email department').sort({ createdAt: -1 }).limit(100);

    // Format for UI
    const traineeProgress = results.map(result => ({
        id: result._id,
        user: result.userId,
        score: result.score,
        passed: result.isPassed, // Assuming isPassed exists
        date: result.createdAt
    }));

    return NextResponse.json({ success: true, trainees: traineeProgress });

  } catch (error) {
    console.error('Fetch trainee progress error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}
