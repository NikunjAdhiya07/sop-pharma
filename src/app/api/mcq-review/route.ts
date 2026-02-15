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

    // Update isReviewed flag in MCQBank
    await MCQBank.findByIdAndUpdate(
      mcqBankId,
      { $set: { [`mcqs.${questionIndex}.isReviewed`]: true } }
    );

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

// PUT: Update a review item (edit question, mark as done, or delete)
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
      moveToRecycle, // Flag to indicate if old version should be recycled
      deleteQuestion, // NEW: Flag to delete question from review
      deletedBy, // NEW: User who deleted the question
    } = body;

    if (!reviewId) {
      return NextResponse.json(
        { success: false, error: 'Review ID is required' },
        { status: 400 }
      );
    }

    // Get the current review to access old data
    const currentReview = await MCQReview.findById(reviewId);
    
    if (!currentReview) {
      return NextResponse.json(
        { success: false, error: 'Review not found' },
        { status: 404 }
      );
    }

    // NEW: Handle question deletion from review center
    if (deleteQuestion) {
      const EliminatedQuestion = (await import('@/models/EliminatedQuestion')).default;
      
      // Move question to EliminatedQuestion with reason 'review-deleted'
      await EliminatedQuestion.create({
        sopId: currentReview.sopId,
        sopName: currentReview.sopName,
        sopIdentifier: currentReview.sopIdentifier,
        question: currentReview.editedQuestion || currentReview.originalQuestion,
        originalQuestionIndex: currentReview.originalQuestionIndex,
        eliminationReason: 'manual', // Using 'manual' as it's a deliberate deletion
        eliminatedAt: new Date(),
        eliminatedBy: deletedBy || 'Unknown',
        replacedWith: 'Deleted from Review Center',
      });

      // Remove from MCQBank
      const mcqBank = await MCQBank.findById(currentReview.originalMcqBankId);
      if (mcqBank) {
        mcqBank.mcqs.splice(currentReview.originalQuestionIndex, 1);
        mcqBank.totalQuestions = mcqBank.mcqs.length;
        mcqBank.difficultyDistribution = {
          easy: mcqBank.mcqs.filter((m: any) => m.difficulty === 'Easy').length,
          medium: mcqBank.mcqs.filter((m: any) => m.difficulty === 'Medium').length,
          hard: mcqBank.mcqs.filter((m: any) => m.difficulty === 'Hard').length,
        };
        await mcqBank.save();
      }

      // Delete the review record
      await MCQReview.findByIdAndDelete(reviewId);

      return NextResponse.json({
        success: true,
        message: 'Question deleted from review and moved to eliminated questions',
      });
    }

    const updateData: any = {};

    // If editing the question
    if (editedQuestion) {
      updateData.editedQuestion = editedQuestion;
      updateData.editedBy = editedBy;
      updateData.editedAt = new Date();
    }

    // If marking as done with changes - move old version to recycle
    if (reviewStatus === 'done' && moveToRecycle && currentReview.editedQuestion) {
      // Import MCQRecycle dynamically to avoid circular dependencies
      const MCQRecycle = (await import('@/models/MCQRecycle')).default;
      
      // Determine which version is "old" - if there was already an edited version, that's the old one
      // Otherwise, the original question is the old one
      const oldVersion = currentReview.editedQuestion || currentReview.originalQuestion;
      const newVersion = editedQuestion || currentReview.editedQuestion;
      
      // Create folder path
      const parts = currentReview.sopIdentifier.split('-');
      const department = parts.length >= 2 ? parts[1] : 'General';
      const folderPath = `${department}/${currentReview.sopIdentifier}`;
      
      // Move to recycle
      await MCQRecycle.create({
        originalReviewId: currentReview._id,
        originalMcqBankId: currentReview.originalMcqBankId,
        originalQuestionIndex: currentReview.originalQuestionIndex,
        sopId: currentReview.sopId,
        sopName: currentReview.sopName,
        sopIdentifier: currentReview.sopIdentifier,
        oldVersion,
        newVersion,
        replacedBy: markedDoneBy || 'Unknown',
        replacedAt: new Date(),
        recycleReason: 'Question updated and marked as completed in Review Center',
        folderPath,
        isRestored: false,
      });
      
      // Update version tracking
      updateData.versionNumber = (currentReview.versionNumber || 1) + 1;
      updateData.lastUpdatedVersion = new Date();
      updateData.hasBeenRecycled = true;
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
      message: moveToRecycle 
        ? 'Review updated and old version moved to recycle' 
        : 'Review updated successfully',
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
    const mcqBankId = searchParams.get('mcqBankId');
    const questionIndex = searchParams.get('questionIndex');

    let deletedReview;

    if (reviewId) {
      deletedReview = await MCQReview.findByIdAndDelete(reviewId);
    } else if (mcqBankId && questionIndex !== null) {
      deletedReview = await MCQReview.findOneAndDelete({
        originalMcqBankId: mcqBankId,
        originalQuestionIndex: parseInt(questionIndex as string)
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Review ID or MCQ Bank info is required' },
        { status: 400 }
      );
    }

    if (!deletedReview) {
      return NextResponse.json(
        { success: false, error: 'Review not found' },
        { status: 404 }
      );
    }

    // Update isReviewed flag in MCQBank
    await MCQBank.findByIdAndUpdate(
      deletedReview.originalMcqBankId,
      { $set: { [`mcqs.${deletedReview.originalQuestionIndex}.isReviewed`]: false } }
    );

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
