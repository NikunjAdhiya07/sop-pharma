import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQReview from '@/models/MCQReview';
import MCQBank from '@/models/MCQBank';

// GET: Fetch all review items or filter by status
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // 'pending' or 'done'
    const sopId = searchParams.get('sopId');

    let query: any = {};
    
    if (status) {
      query.reviewStatus = status;
    }
    
    if (sopId) {
      query.sopId = sopId;
    }

    const reviews = await MCQReview.find(query)
      .sort({ flaggedAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      reviews,
      count: reviews.length,
    });
  } catch (error: any) {
    console.error('Error fetching MCQ reviews:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST: Flag a question for review
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const {
      mcqBankId,
      questionIndex,
      sopId,
      sopName,
      sopIdentifier,
      question,
      flaggedBy,
      reviewNotes,
    } = body;

    // Validate required fields
    if (!mcqBankId || questionIndex === undefined || !sopId || !question) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if this question is already flagged
    const existingReview = await MCQReview.findOne({
      originalMcqBankId: mcqBankId,
      originalQuestionIndex: questionIndex,
    });

    if (existingReview) {
      return NextResponse.json(
        { success: false, error: 'This question is already flagged for review' },
        { status: 400 }
      );
    }

    // Create new review item
    const review = await MCQReview.create({
      originalMcqBankId: mcqBankId,
      originalQuestionIndex: questionIndex,
      sopId,
      sopName,
      sopIdentifier,
      originalQuestion: question,
      reviewStatus: 'pending',
      flaggedBy,
      reviewNotes,
      flaggedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      review,
      message: 'Question flagged for review successfully',
    });
  } catch (error: any) {
    console.error('Error flagging question for review:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PUT: Update a review item (edit question or mark as done)
export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const {
      reviewId,
      editedQuestion,
      reviewStatus,
      editedBy,
      markedDoneBy,
    } = body;

    if (!reviewId) {
      return NextResponse.json(
        { success: false, error: 'Review ID is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};

    // If editing the question
    if (editedQuestion) {
      updateData.editedQuestion = editedQuestion;
      updateData.editedBy = editedBy;
      updateData.editedAt = new Date();
    }

    // If marking as done
    if (reviewStatus === 'done') {
      updateData.reviewStatus = 'done';
      updateData.markedDoneBy = markedDoneBy;
      updateData.markedDoneAt = new Date();
    }

    // If reopening (marking as pending)
    if (reviewStatus === 'pending') {
      updateData.reviewStatus = 'pending';
      updateData.markedDoneBy = undefined;
      updateData.markedDoneAt = undefined;
    }

    const updatedReview = await MCQReview.findByIdAndUpdate(
      reviewId,
      { $set: updateData },
      { new: true }
    );

    if (!updatedReview) {
      return NextResponse.json(
        { success: false, error: 'Review not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      review: updatedReview,
      message: 'Review updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating review:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Remove a review item
export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const reviewId = searchParams.get('reviewId');

    if (!reviewId) {
      return NextResponse.json(
        { success: false, error: 'Review ID is required' },
        { status: 400 }
      );
    }

    const deletedReview = await MCQReview.findByIdAndDelete(reviewId);

    if (!deletedReview) {
      return NextResponse.json(
        { success: false, error: 'Review not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Review deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting review:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
