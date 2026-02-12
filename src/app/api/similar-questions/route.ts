import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SimilarQuestion from '@/models/SimilarQuestion';
import MCQBank from '@/models/MCQBank';

/**
 * GET /api/similar-questions
 * Fetch similar questions with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // 'pending' | 'reviewed'
    const sopId = searchParams.get('sopId');
    const department = searchParams.get('department');
    const id = searchParams.get('id'); // Get specific similar question by ID
    
    const query: any = {};
    
    if (id) {
      const similarQuestion = await SimilarQuestion.findById(id);
      if (!similarQuestion) {
        return NextResponse.json({
          success: false,
          error: 'Similar question not found',
        }, { status: 404 });
      }
      
      return NextResponse.json({
        success: true,
        similarQuestion,
      });
    }
    
    if (status) {
      query.reviewStatus = status;
    }
    
    if (sopId) {
      query.sopId = sopId;
    }
    
    if (department) {
      query.department = department;
    }
    
    const similarQuestions = await SimilarQuestion.find(query)
      .sort({ flaggedAt: -1 })
      .lean();
    
    // Get statistics
    const stats = {
      total: await SimilarQuestion.countDocuments(),
      pending: await SimilarQuestion.countDocuments({ reviewStatus: 'pending' }),
      reviewed: await SimilarQuestion.countDocuments({ reviewStatus: 'reviewed' }),
    };
    
    // Group by SOP for folder view
    const groupedBySOP: any = {};
    similarQuestions.forEach((sq: any) => {
      const key = sq.sopIdentifier;
      if (!groupedBySOP[key]) {
        groupedBySOP[key] = {
          sopId: sq.sopId,
          sopName: sq.sopName,
          sopIdentifier: sq.sopIdentifier,
          department: sq.department,
          questions: [],
        };
      }
      groupedBySOP[key].questions.push(sq);
    });
    
    return NextResponse.json({
      success: true,
      similarQuestions,
      groupedBySOP: Object.values(groupedBySOP),
      stats,
    });
  } catch (error: any) {
    console.error('Error fetching similar questions:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch similar questions',
    }, { status: 500 });
  }
}

/**
 * POST /api/similar-questions
 * Flag a question as similar (create new similarity record)
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    
    const body = await request.json();
    const {
      sopId,
      sopName,
      sopIdentifier,
      department,
      pageNumber,
      primaryQuestion,
      similarQuestions,
      flaggedBy,
    } = body;
    
    // Validate required fields
    if (!sopId || !sopName || !sopIdentifier || !primaryQuestion || !similarQuestions) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields',
      }, { status: 400 });
    }
    
    // Check if this question is already flagged
    const existing = await SimilarQuestion.findOne({
      'primaryQuestion.mcqBankId': primaryQuestion.mcqBankId,
      'primaryQuestion.questionIndex': primaryQuestion.questionIndex,
    });
    
    if (existing) {
      return NextResponse.json({
        success: false,
        error: 'This question is already flagged as similar',
      }, { status: 400 });
    }
    
    // Create new similar question record
    const newSimilarQuestion = await SimilarQuestion.create({
      sopId,
      sopName,
      sopIdentifier,
      department,
      pageNumber,
      primaryQuestion,
      similarQuestions,
      flaggedBy: flaggedBy || 'System',
      reviewStatus: 'pending',
    });
    
    // Update the isSimilar flag on the primary question
    await MCQBank.updateOne(
      { _id: primaryQuestion.mcqBankId },
      { $set: { [`mcqs.${primaryQuestion.questionIndex}.isSimilar`]: true } }
    );
    
    // Update the isSimilar flag on all similar questions
    for (const sq of similarQuestions) {
      await MCQBank.updateOne(
        { _id: sq.mcqBankId },
        { $set: { [`mcqs.${sq.questionIndex}.isSimilar`]: true } }
      );
    }
    
    return NextResponse.json({
      success: true,
      similarQuestion: newSimilarQuestion,
      message: 'Question flagged as similar successfully',
    });
  } catch (error: any) {
    console.error('Error creating similar question:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to flag question as similar',
    }, { status: 500 });
  }
}

/**
 * PUT /api/similar-questions
 * Update a similar question (review, take action)
 */
export async function PUT(request: NextRequest) {
  try {
    await dbConnect();
    
    const body = await request.json();
    const {
      id,
      actionTaken,
      keptQuestionIndex,
      mergedQuestion,
      reviewedBy,
      reviewNotes,
    } = body;
    
    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Similar question ID is required',
      }, { status: 400 });
    }
    
    const similarQuestion = await SimilarQuestion.findById(id);
    
    if (!similarQuestion) {
      return NextResponse.json({
        success: false,
        error: 'Similar question not found',
      }, { status: 404 });
    }
    
    // Update the similar question record
    const updateData: any = {
      reviewStatus: 'reviewed',
      reviewedAt: new Date(),
      reviewedBy: reviewedBy || 'Admin',
    };
    
    if (actionTaken) {
      updateData.actionTaken = actionTaken;
    }
    
    if (keptQuestionIndex !== undefined) {
      updateData.keptQuestionIndex = keptQuestionIndex;
    }
    
    if (mergedQuestion) {
      updateData.mergedQuestion = mergedQuestion;
    }
    
    if (reviewNotes) {
      updateData.reviewNotes = reviewNotes;
    }
    
    const updatedSimilarQuestion = await SimilarQuestion.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    
    // Handle the action taken
    if (actionTaken === 'keep_primary') {
      // Remove all similar questions, keep primary
      for (const sq of similarQuestion.similarQuestions) {
        await MCQBank.updateOne(
          { _id: sq.mcqBankId },
          { $pull: { mcqs: { $exists: true } }, $set: { [`mcqs.${sq.questionIndex}`]: null } }
        );
      }
      
      // Remove isSimilar flag from primary
      await MCQBank.updateOne(
        { _id: similarQuestion.primaryQuestion.mcqBankId },
        { $set: { [`mcqs.${similarQuestion.primaryQuestion.questionIndex}.isSimilar`]: false } }
      );
    } else if (actionTaken === 'keep_similar') {
      // Remove primary, keep the selected similar question
      await MCQBank.updateOne(
        { _id: similarQuestion.primaryQuestion.mcqBankId },
        { $pull: { mcqs: { $exists: true } }, $set: { [`mcqs.${similarQuestion.primaryQuestion.questionIndex}`]: null } }
      );
      
      // Remove other similar questions except the kept one
      similarQuestion.similarQuestions.forEach(async (sq: any, index: number) => {
        if (index !== keptQuestionIndex) {
          await MCQBank.updateOne(
            { _id: sq.mcqBankId },
            { $pull: { mcqs: { $exists: true } }, $set: { [`mcqs.${sq.questionIndex}`]: null } }
          );
        } else {
          // Remove isSimilar flag from kept question
          await MCQBank.updateOne(
            { _id: sq.mcqBankId },
            { $set: { [`mcqs.${sq.questionIndex}.isSimilar`]: false } }
          );
        }
      });
    } else if (actionTaken === 'merge') {
      // Replace primary with merged question, remove all others
      if (mergedQuestion) {
        await MCQBank.updateOne(
          { _id: similarQuestion.primaryQuestion.mcqBankId },
          { $set: { [`mcqs.${similarQuestion.primaryQuestion.questionIndex}`]: { ...mergedQuestion, isSimilar: false } } }
        );
        
        // Remove all similar questions
        for (const sq of similarQuestion.similarQuestions) {
          await MCQBank.updateOne(
            { _id: sq.mcqBankId },
            { $pull: { mcqs: { $exists: true } }, $set: { [`mcqs.${sq.questionIndex}`]: null } }
          );
        }
      }
    } else if (actionTaken === 'eliminate_all') {
      // Remove all questions (primary + similar)
      await MCQBank.updateOne(
        { _id: similarQuestion.primaryQuestion.mcqBankId },
        { $pull: { mcqs: { $exists: true } }, $set: { [`mcqs.${similarQuestion.primaryQuestion.questionIndex}`]: null } }
      );
      
      for (const sq of similarQuestion.similarQuestions) {
        await MCQBank.updateOne(
          { _id: sq.mcqBankId },
          { $pull: { mcqs: { $exists: true } }, $set: { [`mcqs.${sq.questionIndex}`]: null } }
        );
      }
    }
    
    return NextResponse.json({
      success: true,
      similarQuestion: updatedSimilarQuestion,
      message: 'Similar question reviewed successfully',
    });
  } catch (error: any) {
    console.error('Error updating similar question:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update similar question',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/similar-questions
 * Delete a similar question record (without taking action on the questions)
 */
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const mcqBankId = searchParams.get('mcqBankId');
    const questionIndex = searchParams.get('questionIndex');
    
    let similarQuestion;
    
    // Support deletion by ID or by mcqBankId + questionIndex
    if (id) {
      similarQuestion = await SimilarQuestion.findById(id);
    } else if (mcqBankId && questionIndex !== null) {
      similarQuestion = await SimilarQuestion.findOne({
        'primaryQuestion.mcqBankId': mcqBankId,
        'primaryQuestion.questionIndex': parseInt(questionIndex),
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Either ID or mcqBankId+questionIndex is required',
      }, { status: 400 });
    }
    
    if (!similarQuestion) {
      return NextResponse.json({
        success: false,
        error: 'Similar question not found',
      }, { status: 404 });
    }
    
    // Remove isSimilar flags from all questions
    await MCQBank.updateOne(
      { _id: similarQuestion.primaryQuestion.mcqBankId },
      { $set: { [`mcqs.${similarQuestion.primaryQuestion.questionIndex}.isSimilar`]: false } }
    );
    
    for (const sq of similarQuestion.similarQuestions) {
      await MCQBank.updateOne(
        { _id: sq.mcqBankId },
        { $set: { [`mcqs.${sq.questionIndex}.isSimilar`]: false } }
      );
    }
    
    await SimilarQuestion.findByIdAndDelete(similarQuestion._id);
    
    return NextResponse.json({
      success: true,
      message: 'Similar question record deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting similar question:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to delete similar question',
    }, { status: 500 });
  }
}
