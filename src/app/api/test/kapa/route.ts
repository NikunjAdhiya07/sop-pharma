import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const { mode, difficulty, sopId, questionCount = 20 } = await request.json();

    let query: any = {};

    if (mode === 'manual' || mode === 'ai') {
      if (sopId) {
        query.sopId = sopId;
      }
      
      if (difficulty && difficulty !== 'Any' && mode === 'manual') {
        query['mcqs.difficulty'] = difficulty;
      }
    }

    const bank = await MCQBank.findOne(query).lean();

    if (!bank) {
      return NextResponse.json(
        { error: 'No MCQ Bank found for the selected SOP' },
        { status: 404 }
      );
    }

    let availableMCQs = bank.mcqs;
    
    // Filter by difficulty if in manual mode
    if (mode === 'manual' && difficulty && difficulty !== 'Any') {
      availableMCQs = availableMCQs.filter(m => m.difficulty === difficulty);
    }

    if (availableMCQs.length === 0) {
      return NextResponse.json(
        { error: 'No questions available matching the selected criteria' },
        { status: 404 }
      );
    }

    // Reinforcement Logic: If we need more questions than available, or even if we have enough,
    // we can repeat concepts in different formats (shuffled options).
    let finalQuestions: any[] = [];
    
    // Initial shuffle of available questions
    let pool = availableMCQs.map((q, index) => ({
      ...q,
      mcqBankId: bank._id.toString(),
      questionIndex: index,
      sopName: bank.sopName,
      sopIdentifier: bank.sopIdentifier,
      _id: bank.sopId.toString(),
    })).sort(() => 0.5 - Math.random());
    
    // Apply edited versions from review system to the pool BEFORE repeating
    const { applyEditsToMCQs } = await import('@/lib/mcqReviewHelper');
    const editedPool = await applyEditsToMCQs(pool);
    pool = editedPool;

    // Ensure we meet the question count by cycling through the pool
    while (finalQuestions.length < questionCount) {
      const remainingNeeded = questionCount - finalQuestions.length;
      const batch = pool.slice(0, remainingNeeded).map(q => {
        // Create a variation by shuffling options if it's a "repeat"
        const isRepeat = finalQuestions.some(existing => existing.question === q.question);
        
        let processedOptions = [...q.options];
        if (isRepeat) {
          // Deep shuffle for reinforcement
          processedOptions.sort(() => 0.5 - Math.random());
        }

        return {
          ...q,
          options: processedOptions,
          isReinforcement: isRepeat
        };
      });
      
      finalQuestions = [...finalQuestions, ...batch];
      
      // Reshuffle pool for next cycle if we need to repeat
      pool = [...pool].sort(() => 0.5 - Math.random());
    }

    return NextResponse.json({
      success: true,
      questions: finalQuestions.slice(0, questionCount),
      totalAvailable: availableMCQs.length,
      isTargeted: true
    });

  } catch (error) {
    console.error('Error generating KAPA/Incident training test:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate KAPA/Incident training test',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
