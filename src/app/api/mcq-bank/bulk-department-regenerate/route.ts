import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import BulkDeptJob from '@/models/BulkDeptJob';
import {
  extractSubcategoryFromIdentifier,
  getDepartmentForSubcategory,
  normalizeDepartmentName,
} from '@/lib/mcqTreeBuilder';

/**
 * POST /api/mcq-bank/bulk-department-regenerate
 * Queue a bulk department regeneration job (returns immediately with jobId)
 * Body: { department: string }
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { department } = body;

    if (!department) {
      return NextResponse.json(
        { success: false, error: 'department is required' },
        { status: 400 }
      );
    }

    // Check for existing active job on this department
    const existingJob = await BulkDeptJob.findOne({
      department,
      status: { $in: ['pending', 'running'] },
    });

    if (existingJob) {
      const jobAge = Date.now() - existingJob.createdAt.getTime();
      const TWO_MINUTES = 2 * 60 * 1000;

      if (jobAge < TWO_MINUTES) {
        // Job is fresh — return its ID so the client can resume polling it
        return NextResponse.json(
          {
            success: false,
            error: 'A bulk regeneration job is already running for this department',
            jobId: existingJob._id,
          },
          { status: 409 }
        );
      }

      // Stale job (>2 min with no completion) — mark as failed and allow a new one
      await BulkDeptJob.findByIdAndUpdate(existingJob._id, {
        status: 'failed',
        error: 'Job timed out — no progress for 2+ minutes',
        completedAt: new Date(),
      });
    }

    // Fetch only lightweight fields — NO mcqs array (that's huge and causes timeouts).
    // We only need sopIdentifier for department matching; detection happens in the worker.
    // Exclude obsolete banks (belonging to superseded SOP versions).
    const banks = await MCQBank.find(
      { $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }] },
      { _id: 1, sopIdentifier: 1, sopName: 1, language: 1 }
    ).lean();

    // Normalise the target department name using the same helper as the tree
    const targetDept = normalizeDepartmentName(department);

    const matchingBanks = banks.filter((bank: any) => {
      if (!bank.sopIdentifier) return false;
      const subcatCode = extractSubcategoryFromIdentifier(bank.sopIdentifier);
      const bankDept = getDepartmentForSubcategory(subcatCode);
      return bankDept === targetDept;
    });

    if (matchingBanks.length === 0) {
      return NextResponse.json(
        { success: false, error: `No MCQ banks found for department: ${department}` },
        { status: 404 }
      );
    }

    // Queue ALL banks — the worker runs auto-detect on each bank before resolving.
    // We do NOT filter by isSimilar here; detection happens fresh per bank in the worker.
    const bankIds = matchingBanks.map((b: any) => b._id.toString());

    // Build initial bank results list
    const bankResults = matchingBanks.map((bank: any) => ({
      bankId: bank._id.toString(),
      sopIdentifier: bank.sopIdentifier || '',
      sopName: bank.sopName || '',
      language: bank.language || 'English',
      status: 'pending' as const,
      questionsReplaced: 0,
      questionsFailed: 0,
      remainingSimilar: 0,
      logs: [],
      replacements: [],
    }));

    // Create the job
    const job = await BulkDeptJob.create({
      department,
      status: 'pending',
      cancelled: false,
      bankIds,
      progress: {
        banksTotal: bankIds.length,
        banksProcessed: 0,
        banksSucceeded: 0,
        banksFailed: 0,
        banksSkipped: 0,
        totalQuestionsReplaced: 0,
        totalQuestionsFailed: 0,
      },
      bankResults,
    });

    // Trigger background worker (fire and forget)
    triggerBulkDeptWorker(job._id.toString()).catch((err) =>
      console.error('[bulk-dept-regen] Worker trigger failed:', err)
    );

    return NextResponse.json({
      success: true,
      jobId: job._id,
      banksQueued: bankIds.length,
      message: `Bulk smart regeneration started for all ${bankIds.length} banks in ${department}. Each bank will be auto-detected and resolved.`,
    });
  } catch (error: any) {
    console.error('[bulk-department-regenerate] POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to queue bulk regeneration' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mcq-bank/bulk-department-regenerate?jobId=xxx
 * Poll job status and per-bank results
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

    const job = await BulkDeptJob.findById(jobId).lean() as any;
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
        department: job.department,
        status: job.status,
        cancelled: job.cancelled,
        progress: job.progress,
        bankResults: job.bankResults,
        error: job.error,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error: any) {
    console.error('[bulk-department-regenerate] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mcq-bank/bulk-department-regenerate?jobId=xxx
 * Cancel a running job
 */
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const jobId = request.nextUrl.searchParams.get('jobId');
    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'jobId is required' },
        { status: 400 }
      );
    }

    const job = await BulkDeptJob.findById(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: `Job is already ${job.status}` },
        { status: 400 }
      );
    }

    await BulkDeptJob.findByIdAndUpdate(jobId, {
      cancelled: true,
      status: 'cancelled',
      completedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: 'Job cancellation requested. The current bank will finish, then processing will stop.',
    });
  } catch (error: any) {
    console.error('[bulk-department-regenerate] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Trigger the background worker via internal fetch (fire and forget)
 */
async function triggerBulkDeptWorker(jobId: string): Promise<void> {
  const baseUrl =
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const endpoint = `${baseUrl}/api/mcq-bank/bulk-department-worker`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(no body)');
    console.error(`[bulk-dept-regen] Worker trigger failed: ${response.status} - ${errorText}`);
  }
}

export const maxDuration = 30;
