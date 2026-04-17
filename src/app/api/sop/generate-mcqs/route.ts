import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { mcqQueue } from '@/lib/mcqQueue';
import { logAction } from '@/lib/auditLogger';

// Allow up to 5 minutes for MCQ generation (Gemini API can be slow)
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const { sopId, mcqBankId, targetCount, userInfo, sopIdentifier, language } = await request.json();

    if (!sopId && !sopIdentifier) {
      return NextResponse.json(
        { error: 'SOP ID or identifier is required' },
        { status: 400 }
      );
    }

    // Find SOP — first try by ID, then fall back to identifier if mismatch or not found
    let sop = sopId ? await SOP.findById(sopId).catch(() => null) : null;

    // If sopIdentifier is provided, validate that the found SOP has the right identifier
    if (sop && sopIdentifier &&
        sop.identifier.toUpperCase().trim() !== sopIdentifier.toUpperCase().trim()) {
      console.warn(`⚠️ generate-mcqs: sopId points to SOP "${sop.identifier}" but requested identifier is "${sopIdentifier}". Falling back to identifier lookup.`);
      sop = null;
    }

    // Fallback: find by identifier
    if (!sop && sopIdentifier) {
      sop = await SOP.findOne({ identifier: sopIdentifier });
      if (sop) {
        console.log(`✅ generate-mcqs: Found SOP by identifier "${sopIdentifier}" (_id: ${sop._id})`);
      }
    }

    if (!sop) {
      return NextResponse.json(
        { error: 'SOP not found' },
        { status: 404 }
      );
    }

    // Pre-flight content check: fail fast if content is empty/too short
    if (!sop.content || sop.content.trim().length < 100) {
      console.error(`❌ SOP ${sop.name} has insufficient content (${sop.content?.length || 0} chars). Cannot generate MCQs.`);
      return NextResponse.json(
        { error: `Cannot generate MCQs: SOP content is empty or too short (${sop.content?.length || 0} characters). Please re-upload the SOP file.` },
        { status: 422 }
      );
    }

    // Short-circuit: if a bank already has enough questions, return it immediately
    // without re-running the AI (avoids spurious failures when re-clicking the button)
    const effectiveLang = language || sop.language || 'English';
    const existingBank = await MCQBank.findOne({ sopId: sop._id, language: effectiveLang })
      || await MCQBank.findOne({ sopId: sop._id });
    if (existingBank && existingBank.mcqs.length >= (targetCount || 100)) {
      console.log(`✅ generate-mcqs: Bank already has ${existingBank.mcqs.length} questions for ${sop.identifier}. Returning existing bank.`);
      return NextResponse.json({
        success: true,
        message: 'MCQ bank already exists',
        total: existingBank.mcqs.length,
        mcqBank: existingBank,
      }, { status: 200 });
    }

    // Check if it's already in the queue or being processed
    // If it's already there, we'll just wait for it to complete
    if (mcqQueue.isProcessing(sopId)) {
      console.log(`⏳ SOP ${sopId} is already processing in the queue. Waiting for it...`);
    } else {
      // Add to queue with HIGH priority
      mcqQueue.addTask({
        sopId: sopId,
        targetCount: targetCount || 100,
        mcqBankId: mcqBankId,
        priority: 10, // High priority for user-initiated clicks
        language: language,
      });
      
      // Ensure the queue is running
      mcqQueue.start().catch(err => console.error('Error starting queue:', err));
    }

    // Wait for the task to complete (either the one we added or the one already there)
    await mcqQueue.waitForTask(sopId);

    // Fetch the final state of the bank (prefer language match, fall back to any)
    const finalBank = await MCQBank.findOne({ sopId: sop._id, language: effectiveLang })
      || await MCQBank.findOne({ sopId: sop._id });

    if (!finalBank || finalBank.mcqs.length === 0) {
      // Check if SOP was marked as failed (content issue or AI issue)
      const freshSop = await SOP.findById(sopId).select('status');
      const reason = freshSop?.status === 'failed'
        ? 'SOP content could not be processed by the AI. Please re-upload the SOP or check the content.'
        : 'AI failed to generate questions or task failed.';
      return NextResponse.json(
        { error: reason },
        { status: 500 }
      );
    }

    // Auto-generate Gujarati MCQs if this is English and a paired Gujarati SOP exists
    if (effectiveLang === 'English') {
      try {
        const gujSop = await SOP.findOne({
          identifier: sop.identifier,
          language: 'Gujarati'
        }).select('_id identifier').catch(() => null);

        if (gujSop) {
          const gujBankExists = await MCQBank.exists({
            sopId: gujSop._id,
            language: 'Gujarati'
          });

          if (!gujBankExists && !mcqQueue.isProcessing(gujSop._id.toString())) {
            console.log(`🌐 Auto-queuing Gujarati MCQs for paired SOP: ${gujSop.identifier}`);
            mcqQueue.addTask({
              sopId: gujSop._id.toString(),
              targetCount: targetCount || 100,
              priority: 9, // slightly lower than user-triggered
              language: 'Gujarati',
            });
            mcqQueue.start().catch(err => console.error('Gujarati auto-gen error:', err));
          }
        }
      } catch (autoGenErr) {
        console.warn('Auto-generation of Gujarati MCQs failed silently:', autoGenErr);
        // Don't fail the English response — auto-gen is fire-and-forget
      }
    }

    // Log the MCQ generation activity if userInfo is provided
    if (userInfo) {
      await logAction({
        action: 'MCQ_GENERATION',
        userId: userInfo.id,
        username: userInfo.username,
        userFullName: userInfo.name,
        targetId: finalBank._id,
        targetName: finalBank.sopIdentifier,
        details: {
          sopId: sopId,
          newTotalQuestions: finalBank.totalQuestions,
          targetCount: targetCount
        },
        request: request
      });
    }

    return NextResponse.json({
      success: true,
      message: 'MCQ generation complete',
      total: finalBank.mcqs.length,
      mcqBank: finalBank,
    }, { status: 200 });

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
