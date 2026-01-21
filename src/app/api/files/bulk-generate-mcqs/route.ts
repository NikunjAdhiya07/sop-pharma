import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { generateMCQsFromSOP } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Get all uploaded SOPs that don't have MCQs yet or need regeneration
    const sops = await SOP.find({ status: { $in: ['uploaded', 'failed'] } });

    if (sops.length === 0) {
      return NextResponse.json(
        { error: 'No files available for MCQ generation' },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let completed = 0;
        let failed = 0;
        const errors: Array<{ fileName: string; error: string }> = [];

        for (const sop of sops) {
          try {
            // Send progress update
            const progress = {
              total: sops.length,
              completed,
              failed,
              current: sop.name,
              errors,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(progress)}\n\n`)
            );

            // Update SOP status to processing
            sop.status = 'processing';
            await sop.save();

            // Check if MCQ bank already exists
            let existingBank = await MCQBank.findOne({ sopId: sop._id });
            let existingQuestions: string[] = [];

            if (existingBank) {
              existingQuestions = existingBank.mcqs.map(m => m.question);
              console.log(`🔄 Regenerating MCQs for: ${sop.name}. Current count: ${existingQuestions.length}`);
            }

            // Generate MCQs using Gemini
            const result = await generateMCQsFromSOP({
              sopContent: sop.content,
              sopName: sop.name,
              sopIdentifier: sop.identifier,
              existingQuestions: existingQuestions,
            });

            let mcqBank;
            if (existingBank) {
              // Append to existing bank
              existingBank.mcqs = [...existingBank.mcqs, ...result.mcqs];
              existingBank.totalQuestions = existingBank.mcqs.length;

              // Recalculate distribution
              existingBank.difficultyDistribution = {
                easy: existingBank.mcqs.filter(m => m.difficulty === 'Easy').length,
                medium: existingBank.mcqs.filter(m => m.difficulty === 'Medium').length,
                hard: existingBank.mcqs.filter(m => m.difficulty === 'Hard').length,
              };

              await existingBank.save();
              mcqBank = existingBank;
              console.log(`✅ Appended ${result.mcqs.length} new questions to existing bank for ${sop.name}`);
            } else {
              // Create new MCQ Bank
              mcqBank = await MCQBank.create({
                sopId: sop._id,
                sopName: sop.name,
                sopIdentifier: sop.identifier,
                department: sop.department,
                mcqs: result.mcqs,
                totalQuestions: result.mcqs.length,
                difficultyDistribution: result.difficultyDistribution,
                aiModel: result.aiModel,
              });
              console.log(`✅ Created NEW bank with ${result.mcqs.length} questions for ${sop.name}`);
            }

            // Update SOP status
            sop.status = 'completed';
            sop.processedAt = new Date();
            sop.mcqCount = mcqBank.mcqs.length;
            await sop.save();

            completed++;

          } catch (error) {
            console.error(`Error generating MCQs for ${sop.name}:`, error);
            
            // Update SOP status to failed
            sop.status = 'failed';
            await sop.save();

            failed++;
            errors.push({
              fileName: sop.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // Send final progress update
        const finalProgress = {
          total: sops.length,
          completed,
          failed,
          current: '',
          errors,
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(finalProgress)}\n\n`)
        );

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Bulk MCQ generation error:', error);
    return NextResponse.json(
      {
        error: 'Bulk MCQ generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
