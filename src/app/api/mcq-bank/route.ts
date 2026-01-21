import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const sopId = searchParams.get('sopId');
    const difficulty = searchParams.get('difficulty');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    let query: any = {};

    if (sopId) {
      query.sopId = sopId;
    }

    // Fetch MCQ Banks
    const mcqBanks = await MCQBank.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await MCQBank.countDocuments(query);

    // Filter by difficulty if specified
    let filteredMCQBanks = mcqBanks;
    if (difficulty && ['Easy', 'Medium', 'Hard'].includes(difficulty)) {
      filteredMCQBanks = mcqBanks.map(bank => ({
        ...bank.toObject(),
        mcqs: bank.mcqs.filter(mcq => mcq.difficulty === difficulty),
      }));
    }

    return NextResponse.json({
      success: true,
      mcqBanks: filteredMCQBanks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error('Error fetching MCQ Banks:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch MCQ Banks',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'MCQ Bank ID is required' },
        { status: 400 }
      );
    }

    const mcqBank = await MCQBank.findByIdAndDelete(id);

    if (!mcqBank) {
      return NextResponse.json(
        { error: 'MCQ Bank not found' },
        { status: 404 }
      );
    }

    // Optional: Reset SOP mcqCount if link exists
    try {
      const SOP = (await import('@/models/SOP')).default;
      await SOP.findByIdAndUpdate(mcqBank.sopId, { 
        $set: { mcqCount: 0, status: 'pending' } 
      });
    } catch (sopErr) {
      console.warn('Could not reset SOP stats after bank deletion:', sopErr);
    }

    return NextResponse.json({
      success: true,
      message: 'MCQ Bank deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting MCQ Bank:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete MCQ Bank',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
