import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBankTestResult from '@/models/MCQBankTestResult';

// GET: Fetch test result details
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const resultId = searchParams.get('resultId');
    const userId = searchParams.get('userId');

    if (resultId) {
      // Fetch specific test result
      const result = await MCQBankTestResult.findById(resultId);
      
      if (!result) {
        return NextResponse.json(
          { error: 'Test result not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        result,
      });
    } else if (userId) {
      // Fetch all test results for a user
      const results = await MCQBankTestResult.find({ userId })
        .sort({ completedAt: -1 })
        .limit(50);

      return NextResponse.json({
        success: true,
        results,
        total: results.length,
      });
    } else {
      return NextResponse.json(
        { error: 'Either resultId or userId is required' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Error fetching test results:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch test results',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PATCH: Mark test as reviewed
export async function PATCH(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { resultId } = body;

    if (!resultId) {
      return NextResponse.json(
        { error: 'Result ID is required' },
        { status: 400 }
      );
    }

    const result = await MCQBankTestResult.findByIdAndUpdate(
      resultId,
      {
        reviewed: true,
        reviewedAt: new Date(),
      },
      { new: true }
    );

    if (!result) {
      return NextResponse.json(
        { error: 'Test result not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error) {
    console.error('Error updating test result:', error);
    return NextResponse.json(
      {
        error: 'Failed to update test result',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
