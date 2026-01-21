import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const { sopIds } = await request.json();

    if (!sopIds || !Array.isArray(sopIds) || sopIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one SOP selection is required' },
        { status: 400 }
      );
    }

    // Find MCQ Banks for the selected SOPs
    const banks = await MCQBank.find({
      sopId: { $in: sopIds }
    }).lean();

    if (!banks || banks.length === 0) {
      return NextResponse.json(
        { error: 'No MCQ Banks found for the selected SOPs' },
        { status: 404 }
      );
    }

    // Collect all questions from all selected banks
    let allQuestions: any[] = [];
    banks.forEach(bank => {
      // Add bank identity to each question so we know its source
      const questionsWithSource = bank.mcqs.map(q => ({
        ...q,
        sopName: bank.sopName,
        sopIdentifier: bank.sopIdentifier
      }));
      allQuestions = [...allQuestions, ...questionsWithSource];
    });

    if (allQuestions.length === 0) {
      return NextResponse.json(
        { error: 'No questions available in the selected banks' },
        { status: 404 }
      );
    }

    // Shuffle questions and take 20
    const shuffled = allQuestions.sort(() => 0.5 - Math.random());
    const testQuestions = shuffled.slice(0, 20);

    return NextResponse.json({
      success: true,
      questions: testQuestions,
      totalAvailable: allQuestions.length
    });

  } catch (error) {
    console.error('Error generating test:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate test',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
