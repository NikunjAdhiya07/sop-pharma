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

    const banks = await MCQBank.find(query).lean();

    if (!banks || banks.length === 0) {
      return NextResponse.json(
        { error: 'No MCQ Banks found matching the criteria' },
        { status: 404 }
      );
    }

    let allQuestions: any[] = [];
    banks.forEach(bank => {
      let filteredMCQs = bank.mcqs;
      
      if (mode === 'manual' && difficulty && difficulty !== 'Any') {
        filteredMCQs = bank.mcqs.filter(m => m.difficulty === difficulty);
      }

      const questionsWithSource = filteredMCQs.map(q => ({
        ...q,
        sopName: bank.sopName,
        sopIdentifier: bank.sopIdentifier
      }));
      allQuestions = [...allQuestions, ...questionsWithSource];
    });

    if (allQuestions.length === 0) {
      return NextResponse.json(
        { error: 'No questions available matching the selected criteria' },
        { status: 404 }
      );
    }

    const shuffled = allQuestions.sort(() => 0.5 - Math.random());
    const testQuestions = shuffled.slice(0, questionCount);

    return NextResponse.json({
      success: true,
      questions: testQuestions,
      totalAvailable: allQuestions.length
    });

  } catch (error) {
    console.error('Error generating change control test:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate change control test',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
