import { NextRequest, NextResponse } from 'next/server';
import {
  runMcqGenerationStage,
  runSimilarityCheckStage,
  runComplianceCheckStage,
  runPlatformUpdateStage,
} from '@/lib/pipelineOrchestrator';

// Allow up to 5 minutes per stage (MCQ generation and similarity check can be slow)
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let sopId = '';
  let stage = '';

  try {
    const body = await req.json();
    sopId = body.sopId;
    stage = body.stage;

    if (!sopId || !stage) {
      return NextResponse.json({ error: 'sopId and stage are required' }, { status: 400 });
    }

    console.log(`⚙️ [PIPELINE] Running stage "${stage}" for SOP ${sopId}`);

    // Return 200 immediately so the calling fetch doesn't time out waiting for us.
    // The actual work runs after the response is sent (Next.js continues executing
    // the handler body even after NextResponse is returned when using detached promises).
    const workPromise = (async () => {
      switch (stage) {
        case 'mcq_generation':
          await runMcqGenerationStage(sopId);
          break;
        case 'similarity_check':
          await runSimilarityCheckStage(sopId);
          break;
        case 'compliance_check':
          await runComplianceCheckStage(sopId);
          break;
        case 'platform_update':
          await runPlatformUpdateStage(sopId);
          break;
        default:
          console.error(`[PIPELINE] Unknown stage: ${stage}`);
      }
    })();

    // Don't await — let it run detached so this route returns quickly
    workPromise.catch(err =>
      console.error(`[PIPELINE] Unhandled error in stage "${stage}" for ${sopId}:`, err)
    );

    return NextResponse.json({ ok: true, stage, sopId });
  } catch (err) {
    console.error(`[PIPELINE RUN-STAGE] Error dispatching stage "${stage}" for ${sopId}:`, err);
    return NextResponse.json({ error: 'Failed to dispatch stage' }, { status: 500 });
  }
}
