import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SimilarQuestion from '@/models/SimilarQuestion';
import MCQBank from '@/models/MCQBank';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    
    const { id, action, reviewNotes } = await request.json();
    
    if (!id || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Find the similar question
    const similarQuestion = await SimilarQuestion.findById(id);
    
    if (!similarQuestion) {
      return NextResponse.json(
        { success: false, error: 'Similar question not found' },
        { status: 404 }
      );
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
          eliminatedBy: 'System',
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
    
    let eliminatedCount = 0;
    
    // Handle the action
    if (action === 'keep_primary') {
      // Remove all similar questions, keep primary
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
    }
    
    // Update the similar question record
    await SimilarQuestion.findByIdAndUpdate(id, {
      reviewStatus: 'reviewed',
      actionTaken: action,
      reviewedAt: new Date(),
      reviewedBy: 'System',
      reviewNotes: reviewNotes || 'Marked as reviewed',
    });
    
    console.log(`Similar questions resolved. Eliminated ${eliminatedCount} questions.`);
    
    return NextResponse.json({
      success: true,
      eliminatedCount,
      message: `Similar question reviewed successfully. ${eliminatedCount} question(s) moved to eliminated.`,
    });

  } catch (error: any) {
    console.error('Error reviewing similar question:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to review similar question' },
      { status: 500 }
    );
  }
}
