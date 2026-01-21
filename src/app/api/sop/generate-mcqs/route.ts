import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { generateMCQsFromSOP } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const { sopId, mcqBankId, targetCount } = await request.json();

    if (!sopId) {
      return NextResponse.json(
        { error: 'SOP ID is required' },
        { status: 400 }
      );
    }

    // Find SOP
    const sop = await SOP.findById(sopId);
    if (!sop) {
      return NextResponse.json(
        { error: 'SOP not found' },
        { status: 404 }
      );
    }

    let existingBank = null;
    let existingQuestions: string[] = [];

    if (mcqBankId) {
      existingBank = await MCQBank.findById(mcqBankId);
      if (existingBank) {
        existingQuestions = existingBank.mcqs.map(m => m.question);
        console.log(`🔄 Generating MORE questions for bank: ${mcqBankId}. Current count: ${existingQuestions.length}`);
      }
    }

    // Update SOP status to processing
    sop.status = 'processing';
    await sop.save();

    try {
      // Generate MCQs using Gemini with incremental saving
      const result = await generateMCQsFromSOP({
        sopContent: sop.content,
        sopName: sop.name,
        sopIdentifier: sop.identifier,
        existingQuestions: existingQuestions,
        targetCount: targetCount,
        isBulk: false,
        onBatchComplete: async (batchMcqs: any[]) => {
          if (batchMcqs.length > 0) {
            // Get the freshest bank state to avoid duplicates and race conditions
            const currentBank = await MCQBank.findOne({ sopId: sop._id });
            
            if (!currentBank) {
              // Create new bank if it doesn't exist
              await MCQBank.create({
                sopId: sop._id,
                sopName: sop.name,
                sopIdentifier: sop.identifier,
                department: sop.department,
                mcqs: batchMcqs,
                totalQuestions: batchMcqs.length,
                difficultyDistribution: {
                  easy: batchMcqs.filter(m => m.difficulty === 'Easy').length,
                  medium: batchMcqs.filter(m => m.difficulty === 'Medium').length,
                  hard: batchMcqs.filter(m => m.difficulty === 'Hard').length,
                },
                aiModel: 'gemini-3-flash-preview',
              });
              console.log(`💾 Created NEW bank with first batch of ${batchMcqs.length} questions`);
            } else {
              // Get current question texts to filter out any accidental duplicates
              const currentQuestions = new Set(currentBank.mcqs.map(m => m.question.replace(/^⭐\s*/, '').trim()));
              
              // Filter out duplicates from the new batch
              const uniqueNewMcqs = batchMcqs.filter(m => {
                const questionText = m.question.replace(/^⭐\s*/, '').trim();
                return !currentQuestions.has(questionText);
              });

              if (uniqueNewMcqs.length > 0) {
                // Append only unique questions
                currentBank.mcqs = [...currentBank.mcqs, ...uniqueNewMcqs];
                currentBank.totalQuestions = currentBank.mcqs.length;
                
                // Recalculate distribution
                currentBank.difficultyDistribution = {
                  easy: currentBank.mcqs.filter(m => m.difficulty === 'Easy').length,
                  medium: currentBank.mcqs.filter(m => m.difficulty === 'Medium').length,
                  hard: currentBank.mcqs.filter(m => m.difficulty === 'Hard').length,
                };
                
                await currentBank.save();
                console.log(`💾 Appended ${uniqueNewMcqs.length} unique questions to existing bank. Total: ${currentBank.mcqs.length}`);
              }
            }
          }
        }
      });

      // Fetch the final state of the bank
      const finalBank = await MCQBank.findOne({ sopId: sop._id });

      // If no questions were generated at all AND no bank exists, THEN it's a failure
      if ((!finalBank || finalBank.mcqs.length === 0) && result.mcqs.length === 0) {
        sop.status = 'failed';
        await sop.save();
        return NextResponse.json(
          { error: 'AI failed to generate any questions. Please try again when the service is less busy.' },
          { status: 503 }
        );
      }

      // Always update SOP status to completed if at least some questions exist now
      sop.status = 'completed';
      sop.processedAt = new Date();
      sop.mcqCount = finalBank ? finalBank.mcqs.length : 0;
      await sop.save();

      return NextResponse.json({
        success: true,
        message: result.mcqs.length > 0 
          ? (existingBank ? 'Additional MCQs generated' : 'MCQ Bank generated') 
          : 'No additional MCQs could be generated at this time',
        count: result.mcqs.length,
        total: finalBank ? finalBank.mcqs.length : 0,
        mcqBank: finalBank,
      }, { status: 201 });

    } catch (error) {
      // Only set to failed if we don't have any questions yet
      const currentBank = await MCQBank.findOne({ sopId: sop._id });
      if (!currentBank || currentBank.mcqs.length === 0) {
        sop.status = 'failed';
        await sop.save();
      } else {
        // If we already had questions, keep it as completed
        sop.status = 'completed';
        await sop.save();
      }
      throw error;
    }

  } catch (error) {
    console.error('Error generating MCQs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate MCQs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const sopId = searchParams.get('sopId');

    if (!sopId) {
      return NextResponse.json(
        { error: 'SOP ID is required' },
        { status: 400 }
      );
    }

    const mcqBank = await MCQBank.findOne({ sopId });

    if (!mcqBank) {
      return NextResponse.json(
        { error: 'MCQ Bank not found for this SOP' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      mcqBank,
    });

  } catch (error) {
    console.error('Error fetching MCQ Bank:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch MCQ Bank',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
