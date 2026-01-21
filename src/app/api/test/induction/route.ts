import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const { mode, difficulty, sopIds, departments, questionCount = 20 } = await request.json();

    let query: any = {};

    if (mode === 'manual') {
      if (difficulty && difficulty !== 'Any') {
        query['mcqs.difficulty'] = difficulty;
      }
      if (sopIds && Array.isArray(sopIds) && sopIds.length > 0) {
        query.sopId = { $in: sopIds };
      }
      if (departments && Array.isArray(departments) && departments.length > 0) {
        // Max 2 departments requirement
        const targetDepts = departments.slice(0, 2);
        query.department = { $in: targetDepts };
      }
    } else if (mode === 'ai') {
      if (departments && Array.isArray(departments) && departments.length > 0) {
        const targetDepts = departments.slice(0, 2);
        query.department = { $in: targetDepts };
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

      const questionsWithSource = filteredMCQs.map((q, index) => ({
        ...q,
        mcqBankId: bank._id.toString(),
        questionIndex: index,
        sopName: bank.sopName,
        sopIdentifier: bank.sopIdentifier,
        _id: bank.sopId.toString(),
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
    const selectedQuestions = shuffled.slice(0, questionCount);
    
    // Apply edited versions from review system
    const { applyEditsToMCQs } = await import('@/lib/mcqReviewHelper');
    const testQuestions = await applyEditsToMCQs(selectedQuestions);

    return NextResponse.json({
      success: true,
      questions: testQuestions,
      totalAvailable: allQuestions.length
    });

  } catch (error) {
    console.error('Error generating induction test:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate induction test',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
