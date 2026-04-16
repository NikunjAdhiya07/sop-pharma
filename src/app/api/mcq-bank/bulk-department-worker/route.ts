import { NextRequest, NextResponse } from 'next/server';
import { runBulkDeptJob, ACTIVE_WORKERS } from '@/lib/bulkDeptWorkerLogic';

/**
 * POST /api/mcq-bank/bulk-department-worker
 *
 * HTTP shim around runBulkDeptJob — kept for backwards-compatibility and
 * manual invocation, but the main route now calls runBulkDeptJob() directly
 * (no network hop) so this endpoint is no longer used in normal operation.
 *
 * Body: { jobId: string }
 */
export async function POST(request: NextRequest) {
  let jobId: string | null = null;

  try {
    const body = await request.json();
    jobId = body.jobId;

    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId is required' }, { status: 400 });
    }

    if (ACTIVE_WORKERS.has(jobId)) {
      return NextResponse.json({ success: false, error: 'Worker already running for this job' }, { status: 409 });
    }

    // Run synchronously (awaited) — this endpoint is only used for manual calls;
    // normal operation triggers runBulkDeptJob() inline from the main route.
    await runBulkDeptJob(jobId);

    return NextResponse.json({ success: true, message: 'Job completed' });
  } catch (error: any) {
    console.error('[bulk-department-worker] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const maxDuration = 300;
