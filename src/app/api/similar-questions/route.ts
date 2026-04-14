import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SimilarQuestion from '@/models/SimilarQuestion';
import MCQBank from '@/models/MCQBank';
import mongoose from 'mongoose';

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
    const mcqBankId = searchParams.get('mcqBankId'); // Filter to single bank (performance)

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

    // When filtering by a specific bank, query only records where the primary
    // question belongs to that bank — avoids loading the entire collection.
    // Must convert to ObjectId to match how MongoDB stores it.
    if (mcqBankId) {
      try {
        query['primaryQuestion.mcqBankId'] = new mongoose.Types.ObjectId(mcqBankId);
      } catch {
        query['primaryQuestion.mcqBankId'] = mcqBankId; // fallback to string if invalid
      }
    }

    const similarQuestions = await SimilarQuestion.find(query)
      .sort({ flaggedAt: -1 })
      .lean();

    // Only compute global stats when not filtering by bank (expensive count queries)
    const stats = mcqBankId ? null : {
      total: await SimilarQuestion.countDocuments(),
      pending: await SimilarQuestion.countDocuments({ reviewStatus: 'pending' }),
      reviewed: await SimilarQuestion.countDocuments({ reviewStatus: 'reviewed' }),
    };

    // Group by SOP for folder view (skip when bank-scoped request)
    let groupedBySOP: any[] = [];
    if (!mcqBankId) {
      const grouped: any = {};
      similarQuestions.forEach((sq: any) => {
        const key = sq.sopIdentifier;
        if (!grouped[key]) {
          grouped[key] = {
            sopId: sq.sopId,
            sopName: sq.sopName,
            sopIdentifier: sq.sopIdentifier,
            department: sq.department,
            questions: [],
          };
        }
        grouped[key].questions.push(sq);
      });
      groupedBySOP = Object.values(grouped);
    }

    return NextResponse.json({
      success: true,
      similarQuestions,
      groupedBySOP,
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

    // Import EliminatedQuestion for tracking
    const EliminatedQuestion = (await import('@/models/EliminatedQuestion')).default;

    // Helper function to move question to eliminated
    const moveToEliminated = async (question: any, mcqBankId: any, questionIndex: number, similarityScore?: number, duplicateOf?: string) => {
      try {
        console.log('Moving question to eliminated:', {
          sopId: similarQuestion.sopId,
          sopIdentifier: similarQuestion.sopIdentifier,
          questionIndex,
          similarityScore,
        });

        const eliminatedDoc = await EliminatedQuestion.create({
          sopId: similarQuestion.sopId,
          sopName: similarQuestion.sopName,
          sopIdentifier: similarQuestion.sopIdentifier,
          question: question,
          originalQuestionIndex: questionIndex,
          eliminationReason: 'duplicate',
          eliminatedAt: new Date(),
          eliminatedBy: reviewedBy || 'System',
          duplicateOf: duplicateOf,
          similarityScore: similarityScore,
          replacedWith: 'Resolved via Similar Questions workflow',
        });

        console.log('Successfully created eliminated question:', eliminatedDoc._id);
        return eliminatedDoc;
      } catch (error) {
        console.error('Error moving question to eliminated:', error);
        throw error;
      }
    };

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

    // Track eliminated questions count
    let eliminatedCount = 0;

    // Handle the action taken
    if (actionTaken === 'keep_primary') {
      // Remove all similar questions, keep primary
      // Move similar questions to eliminated
      for (const sq of similarQuestion.similarQuestions) {
        await moveToEliminated(
          sq.question,
          sq.mcqBankId,
          sq.questionIndex,
          sq.similarityScore,
          `Primary: ${similarQuestion.primaryQuestion.question.question.substring(0, 100)}...`
        );
        eliminatedCount++;

        // Remove from MCQ Bank
        const bank = await MCQBank.findById(sq.mcqBankId);
        if (bank) {
          bank.mcqs.splice(sq.questionIndex, 1);
          bank.totalQuestions = bank.mcqs.length;
          await bank.save();
        }
      }

      // Remove isSimilar flag from primary
      await MCQBank.updateOne(
        { _id: similarQuestion.primaryQuestion.mcqBankId },
        { $set: { [`mcqs.${similarQuestion.primaryQuestion.questionIndex}.isSimilar`]: false } }
      );
    } else if (actionTaken === 'keep_similar') {
      // Remove primary, keep the selected similar question
      // Move primary to eliminated
      await moveToEliminated(
        similarQuestion.primaryQuestion.question,
        similarQuestion.primaryQuestion.mcqBankId,
        similarQuestion.primaryQuestion.questionIndex,
        100,
        `Kept Similar: ${similarQuestion.similarQuestions[keptQuestionIndex]?.question?.question?.substring(0, 100)}...`
      );
      eliminatedCount++;

      const primaryBank = await MCQBank.findById(similarQuestion.primaryQuestion.mcqBankId);
      if (primaryBank) {
        primaryBank.mcqs.splice(similarQuestion.primaryQuestion.questionIndex, 1);
        primaryBank.totalQuestions = primaryBank.mcqs.length;
        await primaryBank.save();
      }

      // Remove other similar questions except the kept one
      for (let index = 0; index < similarQuestion.similarQuestions.length; index++) {
        const sq = similarQuestion.similarQuestions[index];
        if (index !== keptQuestionIndex) {
          await moveToEliminated(
            sq.question,
            sq.mcqBankId,
            sq.questionIndex,
            sq.similarityScore,
            `Kept Similar: ${similarQuestion.similarQuestions[keptQuestionIndex]?.question?.question?.substring(0, 100)}...`
          );
          eliminatedCount++;

          const bank = await MCQBank.findById(sq.mcqBankId);
          if (bank) {
            bank.mcqs.splice(sq.questionIndex, 1);
            bank.totalQuestions = bank.mcqs.length;
            await bank.save();
          }
        } else {
          // Remove isSimilar flag from kept question
          await MCQBank.updateOne(
            { _id: sq.mcqBankId },
            { $set: { [`mcqs.${sq.questionIndex}.isSimilar`]: false } }
          );
        }
      }
    } else if (actionTaken === 'merge') {
      // Replace primary with merged question, remove all others
      if (mergedQuestion) {
        // Move original primary to eliminated
        await moveToEliminated(
          similarQuestion.primaryQuestion.question,
          similarQuestion.primaryQuestion.mcqBankId,
          similarQuestion.primaryQuestion.questionIndex,
          100,
          'Merged into new question'
        );
        eliminatedCount++;

        await MCQBank.updateOne(
          { _id: similarQuestion.primaryQuestion.mcqBankId },
          { $set: { [`mcqs.${similarQuestion.primaryQuestion.questionIndex}`]: { ...mergedQuestion, isSimilar: false } } }
        );

        // Remove all similar questions
        for (const sq of similarQuestion.similarQuestions) {
          await moveToEliminated(
            sq.question,
            sq.mcqBankId,
            sq.questionIndex,
            sq.similarityScore,
            'Merged into new question'
          );
          eliminatedCount++;

          const bank = await MCQBank.findById(sq.mcqBankId);
          if (bank) {
            bank.mcqs.splice(sq.questionIndex, 1);
            bank.totalQuestions = bank.mcqs.length;
            await bank.save();
          }
        }
      }
    } else if (actionTaken === 'eliminate_all') {
      // Remove all questions (primary + similar)
      // Move primary to eliminated
      await moveToEliminated(
        similarQuestion.primaryQuestion.question,
        similarQuestion.primaryQuestion.mcqBankId,
        similarQuestion.primaryQuestion.questionIndex,
        100,
        'All similar questions eliminated'
      );
      eliminatedCount++;

      const primaryBank = await MCQBank.findById(similarQuestion.primaryQuestion.mcqBankId);
      if (primaryBank) {
        primaryBank.mcqs.splice(similarQuestion.primaryQuestion.questionIndex, 1);
        primaryBank.totalQuestions = primaryBank.mcqs.length;
        await primaryBank.save();
      }

      for (const sq of similarQuestion.similarQuestions) {
        await moveToEliminated(
          sq.question,
          sq.mcqBankId,
          sq.questionIndex,
          sq.similarityScore,
          'All similar questions eliminated'
        );
        eliminatedCount++;

        const bank = await MCQBank.findById(sq.mcqBankId);
        if (bank) {
          bank.mcqs.splice(sq.questionIndex, 1);
          bank.totalQuestions = bank.mcqs.length;
          await bank.save();
        }
      }
    }

    console.log(`Similar questions resolved. Eliminated ${eliminatedCount} questions.`);

    return NextResponse.json({
      success: true,
      similarQuestion: updatedSimilarQuestion,
      eliminatedCount,
      message: `Similar question reviewed successfully. ${eliminatedCount} question(s) moved to eliminated.`,
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
