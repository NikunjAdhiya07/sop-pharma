import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import AutoResolveJob from '@/models/AutoResolveJob';

/**
 * POST /api/mcq-bank/auto-resolve-similar
 * Queue an auto-resolve job (returns immediately, processing happens in background)
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { mcqBankId, similarities } = body;

    if (!mcqBankId) {
      return NextResponse.json(
        { success: false, error: 'mcqBankId is required' },
        { status: 400 }
      );
    }

    // Check if bank exists
    const bank = await MCQBank.findById(mcqBankId);
    if (!bank) {
      return NextResponse.json(
        { success: false, error: 'MCQ bank not found' },
        { status: 404 }
      );
    }

    // Check if a job is already running for this bank
    // But allow restarting if the existing job is stale (> 10 minutes old)
    const existingJob = await AutoResolveJob.findOne({
      mcqBankId,
      status: { $in: ['pending', 'running'] },
    });

    if (existingJob) {
      const jobAge = Date.now() - existingJob.createdAt.getTime();
      const TEN_MINUTES = 10 * 60 * 1000;

      if (jobAge < TEN_MINUTES) {
        // Job is recent, don't allow another one
        return NextResponse.json(
          {
            success: false,
            error: 'A resolution job is already running for this bank',
            jobId: existingJob._id,
          },
          { status: 409 }
        );
      } else {
        // Job is stale, mark it as failed and allow a new one
        await AutoResolveJob.findByIdAndUpdate(existingJob._id, {
          status: 'failed',
          error: 'Job timeout - no progress for 10+ minutes',
          completedAt: new Date(),
        });
      }
    }

    // Create a new job
    const job = await AutoResolveJob.create({
      mcqBankId,
      status: 'pending',
      logs: [`🚀 Auto-resolve job queued for ${bank.sopIdentifier}`],
    });

    triggerAutoResolveInBackground(mcqBankId, job._id.toString(), similarities)
      .catch((err) => console.error(`[auto-resolve] Background trigger failed:`, err));

    return NextResponse.json({
      success: true,
      jobId: job._id,
      message: 'Auto-resolve job queued. Check status for updates.',
    });
  } catch (error: any) {
    console.error('Error queuing auto-resolve:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to queue auto-resolve job',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mcq-bank/auto-resolve-similar?jobId=xxx
 * Check the status of an auto-resolve job
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const jobId = request.nextUrl.searchParams.get('jobId');
    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'jobId is required' },
        { status: 400 }
      );
    }

    const job = await AutoResolveJob.findById(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job._id,
        status: job.status,
        progress: job.progress,
        summary: job.summary,
        logs: job.logs,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error: any) {
    console.error('Error checking job status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Trigger the actual auto-resolve processing in the background
 * This avoids blocking the HTTP response
 */
async function triggerAutoResolveInBackground(
  mcqBankId: string,
  jobId: string,
  similarities?: any[]
): Promise<void> {
  const baseUrl =
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const endpoint = `${baseUrl}/api/mcq-bank/bulk-resolve-similar`;

  // Do NOT await — the worker runs for up to 5 minutes. Awaiting would block
  // this 30-second route until timeout and leave the job stuck in "pending".
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mcqBankId,
      jobId,
      threshold: 70,
      dryRun: false,
      similarities,
    }),
  }).then(async (res) => {
    if (!res.ok) {
      const errorText = await res.text().catch(() => '(no body)');
      console.error(`[auto-resolve] bulk-resolve failed: ${res.status} - ${errorText}`);
    }
  }).catch((err) => {
    console.error(`[auto-resolve] background trigger failed:`, err);
  });
}

export const maxDuration = 30; // Keep timeout short since we return immediately
