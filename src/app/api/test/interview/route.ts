import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const { mode, difficulty, sopIds, questionCount = 20 } = await request.json();

    let query: any = {};

    if (mode === 'manual') {
      if (difficulty && difficulty !== 'Any') {
        query['mcqs.difficulty'] = difficulty;
      }
      if (sopIds && Array.isArray(sopIds) && sopIds.length > 0) {
        query.sopId = { $in: sopIds };
      }
    }

    // Find MCQ Banks
    // Note: If mode is AI, we fetch from ALL banks
    const banks = await MCQBank.find(query).lean();

    if (!banks || banks.length === 0) {
      return NextResponse.json(
        { error: 'No MCQ Banks found matching the criteria' },
        { status: 404 }
      );
    }

    // Collect all qualifying questions
    let allQuestions: any[] = [];
    banks.forEach(bank => {
      let filteredMCQs = bank.mcqs;
      
      // If manual mode, we also filter the individual questions by difficulty inside the bank
      if (mode === 'manual' && difficulty && difficulty !== 'Any') {
        filteredMCQs = bank.mcqs.filter(m => m.difficulty === difficulty);
      }

      const questionsWithSource = filteredMCQs.map((q, index) => ({
        ...q,
        mcqBankId: bank._id.toString(),
        questionIndex: index,
        sopName: bank.sopName,
        sopIdentifier: bank.sopIdentifier,
        _id: bank.sopId.toString(), // Store SOP ID for ref
      }));
      allQuestions = [...allQuestions, ...questionsWithSource];
    });

    if (allQuestions.length === 0) {
      return NextResponse.json(
        { error: 'No questions available matching the selected criteria' },
        { status: 404 }
      );
    }

    // Shuffle and slice
    const shuffled = allQuestions.sort(() => 0.5 - Math.random());
    const selectedQuestions = shuffled.slice(0, questionCount);

    // Apply edited versions from the review system
    const { applyEditsToMCQs } = await import('@/lib/mcqReviewHelper');
    const testQuestions = await applyEditsToMCQs(selectedQuestions);

    return NextResponse.json({
      success: true,
      questions: testQuestions,
      totalAvailable: allQuestions.length
    });

  } catch (error) {
    console.error('Error generating interview test:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate interview test',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
