import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import EliminatedQuestion from '@/models/EliminatedQuestion';

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const bankId = searchParams.get('bankId');
    const questionIndex = searchParams.get('index');

    if (!bankId || questionIndex === null) {
      return NextResponse.json(
        { error: 'Missing bankId or index' },
        { status: 400 }
      );
    }

    const index = parseInt(questionIndex);

    // Find the MCQ bank
    const bank = await MCQBank.findById(bankId);
    
    if (!bank) {
      return NextResponse.json(
        { error: 'MCQ bank not found' },
        { status: 404 }
      );
    }

    if (isNaN(index) || index < 0 || index >= bank.mcqs.length) {
      return NextResponse.json(
        { error: 'Invalid question index' },
        { status: 400 }
      );
    }
    
    // Store the question before deletion
    const deletedQuestion = bank.mcqs[index];
    
    // Try to get user info from request headers
    const userInfo = request.headers.get('x-user-info');
    let eliminatedByUser = 'Unknown User';
    
    if (userInfo) {
      try {
        // Handle if userInfo is a JSON string or a plain string
        let parsed: any;
        try {
          parsed = JSON.parse(userInfo);
        } catch {
          parsed = userInfo;
        }

        if (typeof parsed === 'object' && parsed !== null) {
          eliminatedByUser = parsed.username || parsed.name || parsed.displayName || parsed.email || 'Unknown User';
          // If name is "admin" but we have a username, prioritize username
          if (eliminatedByUser === 'admin' && parsed.username) {
            eliminatedByUser = parsed.username;
          }
        } else if (typeof parsed === 'string') {
          eliminatedByUser = parsed;
        }
      } catch {
        eliminatedByUser = 'Unknown User';
      }
    }
    
    await EliminatedQuestion.create({
      sopId: bank.sopId,
      sopName: bank.sopName,
      sopIdentifier: bank.sopIdentifier,
      question: deletedQuestion,
      originalQuestionIndex: index, // Main field
      originalIndex: index,         // Fallback field
      eliminationReason: 'manual',
      eliminatedAt: new Date(),
      eliminatedBy: eliminatedByUser,
    });

    // Remove the question
    bank.mcqs.splice(index, 1);
    
    // Update counts
    bank.totalQuestions = bank.mcqs.length;
    bank.difficultyDistribution = {
      easy: bank.mcqs.filter(m => m.difficulty === 'Easy').length,
      medium: bank.mcqs.filter(m => m.difficulty === 'Medium').length,
      hard: bank.mcqs.filter(m => m.difficulty === 'Hard').length,
    };

    await bank.save();

    return NextResponse.json({
      success: true,
      message: 'Question deleted successfully',
      newTotal: bank.mcqs.length,
    });

  } catch (error) {
    console.error('Delete MCQ error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete question',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
