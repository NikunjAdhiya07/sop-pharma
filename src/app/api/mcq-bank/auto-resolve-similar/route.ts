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
    const { mcqBankId } = body;

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
    const existingJob = await AutoResolveJob.findOne({
      mcqBankId,
      status: { $in: ['pending', 'running'] },
    });

    if (existingJob) {
      return NextResponse.json(
        {
          success: false,
          error: 'A resolution job is already running for this bank',
          jobId: existingJob._id,
        },
        { status: 409 }
      );
    }

    // Create a new job
    const job = await AutoResolveJob.create({
      mcqBankId,
      status: 'pending',
      logs: [`🚀 Auto-resolve job queued for ${bank.sopIdentifier}`],
    });

    // Trigger the actual resolution in the background (fire and forget)
    // In production, this would be a proper job queue (Bull, RabbitMQ, etc.)
    // For now, we'll trigger it via a Promise-based background call

    console.log(`\n🚀 QUEUING AUTO-RESOLVE JOB: ${job._id}`);
    console.log(`🏦 Bank ID: ${mcqBankId}`);

    // Start background processing IMMEDIATELY (don't wait)
    // Use Promise without await to allow response to return while processing continues
    triggerAutoResolveInBackground(mcqBankId, job._id.toString())
      .then(() => console.log(`✅ Background auto-resolve completed`))
      .catch((err) => console.error(`🚨 Background auto-resolve failed:`, err));

    console.log(`✅ AUTO-RESOLVE JOB QUEUED, returning to client immediately\n`);

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
      console.warn(`Job not found: ${jobId}`);
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    console.log(`📋 Job status check - ID: ${jobId}, Status: ${job.status}, Completed: ${!!job.completedAt}`);

    return NextResponse.json({
      success: true,
      job: {
        id: job._id,
        status: job.status,
        progress: job.progress,
        summary: job.summary,
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
  jobId: string
): Promise<void> {
  // Fire the background job immediately without setTimeout
  // This allows the HTTP response to return while processing continues in the background

  console.log(`\n🔥 BACKGROUND TRIGGER STARTING (no delay)`);
  console.log(`   mcqBankId: ${mcqBankId}`);
  console.log(`   jobId: ${jobId}`);

  try {
    // Try multiple baseUrl options
    const baseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    console.log(`📍 Using baseUrl: ${baseUrl}`);

    const endpoint = `${baseUrl}/api/mcq-bank/bulk-resolve-similar`;
    console.log(`📡 POST ${endpoint}`);

    const payload = {
      mcqBankId,
      jobId,
      threshold: 50,
      dryRun: false,
    };

    console.log(`📦 Request payload:`, JSON.stringify(payload, null, 2));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log(`📊 Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '(no body)');
      console.error(`❌ Bulk-resolve failed: ${response.status}`);
      console.error(`   Body: ${errorText}`);
    } else {
      try {
        const data = await response.json();
        console.log(`✅ Bulk-resolve started successfully`);
        console.log(`   Summary will update as processing completes`);
      } catch (e) {
        console.log(`✅ Bulk-resolve endpoint responded (non-JSON body)`);
      }
    }
  } catch (error) {
    console.error(`🚨 Background trigger failed:`);
    console.error(error);
  }

  console.log(`\n`);
}

export const maxDuration = 30; // Keep timeout short since we return immediately
