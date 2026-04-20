import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPPipeline from '@/models/SOPPipeline';
import SOP from '@/models/SOP';
import mongoose from 'mongoose';

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  );
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { sopId, sopIdentifier, sopName, department, language } = body;

    if (!sopId || !sopIdentifier) {
      return NextResponse.json({ error: 'sopId and sopIdentifier are required' }, { status: 400 });
    }

    // Upsert the pipeline document — re-uploads cleanly reset state
    const pipeline = await SOPPipeline.findOneAndUpdate(
      { sopId: new mongoose.Types.ObjectId(sopId) },
      {
        $set: {
          sopId: new mongoose.Types.ObjectId(sopId),
          sopIdentifier,
          sopName: sopName || sopIdentifier,
          department: department || 'General',
          language: language || 'English',
          pipelineStatus: 'mcq_generating',
          stages: {
            mcqGeneration: { status: 'pending', progress: 0 },
            similarityCheck: { status: 'pending', progress: 0 },
            complianceFix: { status: 'pending', progress: 0 },
            platformUpdate: { status: 'pending', progress: 0 },
          },
          mcqBankId: undefined,
          complianceReportId: undefined,
          similarityIterations: 0,
          complianceScore: undefined,
          complianceStatus: undefined,
          unresolvedFindings: 0,
          errorStage: undefined,
          errorMessage: undefined,
          errorAt: undefined,
          startedAt: new Date(),
          completedAt: undefined,
          lastHeartbeat: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // Mark the SOP's pipelineStatus immediately
    await SOP.findByIdAndUpdate(sopId, { pipelineStatus: 'mcq_generating' });

    // Fire Stage 1 as a detached request — do not await
    const baseUrl = getBaseUrl();
    fetch(`${baseUrl}/api/sop/pipeline/run-stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sopId, stage: 'mcq_generation' }),
    }).catch(err => console.error('[PIPELINE] run-stage trigger failed:', err));

    console.log(`🚀 [PIPELINE] Started for ${sopIdentifier} (${sopId})`);

    return NextResponse.json({ pipelineId: pipeline._id.toString(), status: 'started' });
  } catch (err) {
    console.error('[PIPELINE START]', err);
    return NextResponse.json({ error: 'Failed to start pipeline' }, { status: 500 });
  }
}
