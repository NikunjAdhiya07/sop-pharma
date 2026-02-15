import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import MCQReview from '@/models/MCQReview';

/**
 * Get MCQs for a test, using edited versions from reviews when available
 * 
 * @param sopIds - Array of SOP IDs to fetch questions from
 * @param count - Number of questions to fetch
 * @returns Array of MCQs with edited versions applied
 */
export async function getMCQsWithReviewEdits(
  sopIds: string[],
  count: number = 20
): Promise<any[]> {
  await connectDB();

  // Fetch MCQ banks for the specified SOPs
  const mcqBanks = await MCQBank.find({
    sopId: { $in: sopIds }
  }).lean();

  if (!mcqBanks || mcqBanks.length === 0) {
    return [];
  }

  // Collect all MCQs from all banks
  let allMCQs: any[] = [];
  
  for (const bank of mcqBanks) {
    const mcqsWithMetadata = bank.mcqs.map((mcq: any, index: number) => ({
      ...mcq,
      mcqBankId: bank._id.toString(),
      questionIndex: index,
      sopName: bank.sopName,
      sopIdentifier: bank.sopIdentifier,
      _id: bank.sopId.toString(),
    }));
    
    allMCQs = [...allMCQs, ...mcqsWithMetadata];
  }

  // Shuffle the questions
  const shuffled = allMCQs.sort(() => Math.random() - 0.5);
  
  // Take the required count
  const selectedMCQs = shuffled.slice(0, count);

  // Fetch all reviews that are marked as "done" and have edited versions
  // Optimize: Only fetch reviews for the relevant MCQ banks
  const mcqBankIds = mcqBanks.map(b => b._id);
  
  const reviews = await MCQReview.find({
    reviewStatus: 'done',
    editedQuestion: { $exists: true, $ne: null },
    originalMcqBankId: { $in: mcqBankIds }
  }).lean();

  // Create a map for quick lookup: "mcqBankId:questionIndex" -> editedQuestion
  const editMap = new Map<string, any>();
  
  for (const review of reviews) {
    // @ts-ignore
    const key = `${review.originalMcqBankId}:${review.originalQuestionIndex}`;
    // @ts-ignore
    editMap.set(key, review.editedQuestion);
  }

  // Apply edits to selected MCQs
  const finalMCQs = selectedMCQs.map(mcq => {
    const key = `${mcq.mcqBankId}:${mcq.questionIndex}`;
    
    if (editMap.has(key)) {
      const editedQuestion = editMap.get(key);
      console.log(`✏️ Using edited version for question: ${mcq.question.substring(0, 50)}...`);
      
      // Merge edited question data with metadata
      return {
        ...mcq,
        ...editedQuestion,
        _isEdited: true, // Flag to indicate this is an edited version
      };
    }
    
    return mcq;
  });

  return finalMCQs;
}

/**
 * Get statistics about reviewed questions
 */
export async function getReviewStats() {
  await connectDB();

  const totalReviews = await MCQReview.countDocuments();
  const pendingReviews = await MCQReview.countDocuments({ reviewStatus: 'pending' });
  const doneReviews = await MCQReview.countDocuments({ reviewStatus: 'done' });
  const editedReviews = await MCQReview.countDocuments({ 
    reviewStatus: 'done',
    editedQuestion: { $exists: true, $ne: null }
  });

  return {
    total: totalReviews,
    pending: pendingReviews,
    done: doneReviews,
    edited: editedReviews,
    percentageEdited: totalReviews > 0 ? Math.round((editedReviews / totalReviews) * 100) : 0,
  };
}

/**
 * Check if a specific question has been edited
 */
export async function hasEditedVersion(
  mcqBankId: string,
  questionIndex: number
): Promise<boolean> {
  await connectDB();

  const review = await MCQReview.findOne({
    originalMcqBankId: mcqBankId,
    originalQuestionIndex: questionIndex,
    reviewStatus: 'done',
    editedQuestion: { $exists: true, $ne: null }
  });

  return !!review;
}

/**
 * Get the edited version of a specific question
 */
export async function getEditedQuestion(
  mcqBankId: string,
  questionIndex: number
): Promise<any | null> {
  await connectDB();

  const review = await MCQReview.findOne({
    originalMcqBankId: mcqBankId,
    originalQuestionIndex: questionIndex,
    reviewStatus: 'done',
    editedQuestion: { $exists: true, $ne: null }
  }).lean();

  return review?.editedQuestion || null;
}

/**
 * Apply edits to a single MCQ
 */
export function applyEditToMCQ(mcq: any, editedQuestion: any): any {
  if (!editedQuestion) return mcq;

  return {
    ...mcq,
    ...editedQuestion,
    _isEdited: true,
  };
}

/**
 * Bulk apply edits to an array of MCQs
 */
export async function applyEditsToMCQs(mcqs: any[]): Promise<any[]> {
  await connectDB();

  // Fetch all relevant reviews
  const mcqKeys = mcqs
    .filter(mcq => mcq.mcqBankId && mcq.questionIndex !== undefined)
    .map(mcq => ({
      mcqBankId: mcq.mcqBankId,
      questionIndex: mcq.questionIndex
    }));

  if (mcqKeys.length === 0) return mcqs;

  const reviews = await MCQReview.find({
    reviewStatus: 'done',
    editedQuestion: { $exists: true, $ne: null }
  }).lean();

  // Create edit map
  const editMap = new Map<string, any>();
  for (const review of reviews) {
    const key = `${review.originalMcqBankId}:${review.originalQuestionIndex}`;
    editMap.set(key, review.editedQuestion);
  }

  // Apply edits
  return mcqs.map(mcq => {
    if (!mcq.mcqBankId || mcq.questionIndex === undefined) return mcq;
    
    const key = `${mcq.mcqBankId}:${mcq.questionIndex}`;
    const editedQuestion = editMap.get(key);
    
    return applyEditToMCQ(mcq, editedQuestion);
  });
}
