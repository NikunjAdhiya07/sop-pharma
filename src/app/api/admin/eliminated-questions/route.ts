import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EliminatedQuestion from '@/models/EliminatedQuestion';
import MCQBank from '@/models/MCQBank';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const sopId = searchParams.get('sopId');
    const reason = searchParams.get('reason');
    const limit = parseInt(searchParams.get('limit') || '100');
    const skip = parseInt(searchParams.get('skip') || '0');

    // Build query
    const query: any = {};
    if (sopId) query.sopId = sopId;
    if (reason) query.eliminationReason = reason;

    // Fetch eliminated questions
    const eliminated = await EliminatedQuestion.find(query)
      .sort({ eliminatedAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await EliminatedQuestion.countDocuments(query);

    // Get statistics
    const stats = await EliminatedQuestion.aggregate([
      ...(sopId ? [{ $match: { sopId } }] : []),
      {
        $group: {
          _id: '$eliminationReason',
          count: { $sum: 1 },
        },
      },
    ]);

    return NextResponse.json({
      success: true,
      eliminated,
      total,
      stats: stats.reduce((acc, s) => {
        acc[s._id] = s.count;
        return acc;
      }, {} as Record<string, number>),
      pagination: {
        limit,
        skip,
        hasMore: skip + eliminated.length < total,
      },
    });

  } catch (error) {
    console.error('Fetch eliminated questions error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch eliminated questions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { eliminatedId, action } = body;

    if (action === 'restore') {
      // Find the eliminated question
      const eliminated = await EliminatedQuestion.findById(eliminatedId);
      
      if (!eliminated) {
        return NextResponse.json(
          { error: 'Eliminated question not found' },
          { status: 404 }
        );
      }

      // Find the MCQ bank
      const bank = await MCQBank.findOne({ sopId: eliminated.sopId });
      
      if (!bank) {
        return NextResponse.json(
          { error: 'MCQ bank not found' },
          { status: 404 }
        );
      }

      // Check if question already exists (avoid re-adding duplicates)
      const exists = bank.mcqs.some(m => 
        m.question.toLowerCase().trim() === eliminated.question.question.toLowerCase().trim()
      );

      if (exists) {
        return NextResponse.json(
          { error: 'Question already exists in MCQ bank' },
          { status: 400 }
        );
      }

      // Restore the question
      bank.mcqs.push(eliminated.question);
      bank.totalQuestions = bank.mcqs.length;
      bank.difficultyDistribution = {
        easy: bank.mcqs.filter(m => m.difficulty === 'Easy').length,
        medium: bank.mcqs.filter(m => m.difficulty === 'Medium').length,
        hard: bank.mcqs.filter(m => m.difficulty === 'Hard').length,
      };

      await bank.save();

      // Optionally delete the eliminated question record
      await EliminatedQuestion.findByIdAndDelete(eliminatedId);

      return NextResponse.json({
        success: true,
        message: 'Question restored successfully',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Restore eliminated question error:', error);
    return NextResponse.json(
      {
        error: 'Failed to restore question',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
