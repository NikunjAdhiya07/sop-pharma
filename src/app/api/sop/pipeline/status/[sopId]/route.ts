import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPPipeline, { ISOPPipeline } from '@/models/SOPPipeline';

const STAGE_WEIGHTS = {
  mcqGeneration: 0.35,
  similarityCheck: 0.25,
  complianceFix: 0.25,
  platformUpdate: 0.15,
};

const STAGE_AVG_MS = {
  mcqGeneration: 120_000,
  similarityCheck: 90_000,
  complianceFix: 30_000,
  platformUpdate: 5_000,
};

function computeOverallProgress(pipeline: ISOPPipeline): number {
  const stages = pipeline.stages;
  let total = 0;
  total += (stages.mcqGeneration.progress / 100) * STAGE_WEIGHTS.mcqGeneration;
  total += (stages.similarityCheck.progress / 100) * STAGE_WEIGHTS.similarityCheck;
  total += (stages.complianceFix.progress / 100) * STAGE_WEIGHTS.complianceFix;
  total += (stages.platformUpdate.progress / 100) * STAGE_WEIGHTS.platformUpdate;
  return Math.round(total * 100);
}

function computeEstimatedMinutes(pipeline: ISOPPipeline): number | null {
  if (pipeline.pipelineStatus === 'approved' || pipeline.pipelineStatus === 'failed') return null;

  const stages = pipeline.stages;
  let remainingMs = 0;

  if (stages.mcqGeneration.status === 'pending' || stages.mcqGeneration.status === 'running') {
    const pct = stages.mcqGeneration.status === 'running' ? (stages.mcqGeneration.progress / 100) : 0;
    remainingMs += STAGE_AVG_MS.mcqGeneration * (1 - pct);
  }
  if (stages.similarityCheck.status === 'pending' || stages.similarityCheck.status === 'running') {
    const iters = Math.max(1, pipeline.similarityIterations);
    const pct = stages.similarityCheck.status === 'running' ? (stages.similarityCheck.progress / 100) : 0;
    remainingMs += STAGE_AVG_MS.similarityCheck * iters * (1 - pct);
  }
  if (stages.complianceFix.status === 'pending' || stages.complianceFix.status === 'running') {
    const pct = stages.complianceFix.status === 'running' ? (stages.complianceFix.progress / 100) : 0;
    remainingMs += STAGE_AVG_MS.complianceFix * (1 - pct);
  }
  if (stages.platformUpdate.status === 'pending' || stages.platformUpdate.status === 'running') {
    const pct = stages.platformUpdate.status === 'running' ? (stages.platformUpdate.progress / 100) : 0;
    remainingMs += STAGE_AVG_MS.platformUpdate * (1 - pct);
  }

  return Math.ceil(remainingMs / 60_000);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sopId: string }> }
) {
  try {
    await connectDB();
    const { sopId } = await params;

    const pipeline = await SOPPipeline.findOne({ sopId }).lean();

    if (!pipeline) {
      return NextResponse.json({
        pipelineStatus: 'idle',
        overallProgress: 0,
        stages: {
          mcqGeneration: { status: 'pending', progress: 0 },
          similarityCheck: { status: 'pending', progress: 0 },
          complianceFix: { status: 'pending', progress: 0 },
          platformUpdate: { status: 'pending', progress: 0 },
        },
        complianceScore: null,
        unresolvedFindings: 0,
        similarityIterations: 0,
        errorStage: null,
        errorMessage: null,
        estimatedMinutesRemaining: null,
        startedAt: null,
        completedAt: null,
      });
    }

    const p = pipeline as unknown as ISOPPipeline;

    return NextResponse.json({
      pipelineStatus: p.pipelineStatus,
      overallProgress: computeOverallProgress(p),
      stages: {
        mcqGeneration: p.stages.mcqGeneration,
        similarityCheck: p.stages.similarityCheck,
        complianceFix: p.stages.complianceFix,
        platformUpdate: p.stages.platformUpdate,
      },
      complianceScore: p.complianceScore ?? null,
      complianceStatus: p.complianceStatus ?? null,
      unresolvedFindings: p.unresolvedFindings,
      similarityIterations: p.similarityIterations,
      errorStage: p.errorStage ?? null,
      errorMessage: p.errorMessage ?? null,
      estimatedMinutesRemaining: computeEstimatedMinutes(p),
      startedAt: p.startedAt,
      completedAt: p.completedAt ?? null,
    });
  } catch (err) {
    console.error('[PIPELINE STATUS]', err);
    return NextResponse.json({ error: 'Failed to fetch pipeline status' }, { status: 500 });
  }
}
