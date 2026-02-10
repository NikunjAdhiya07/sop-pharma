import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ComplianceAnalysisJob from '@/models/ComplianceAnalysisJob';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * JOB TRACKING API - Real-Time Progress Monitoring
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * GET /api/compliance/job/[jobId]
 * Returns current status of a compliance analysis job
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await dbConnect();
    
    const { jobId } = await params;
    
    if (!jobId) {
      return NextResponse.json({
        success: false,
        error: 'Job ID is required',
      }, { status: 400 });
    }
    
    const job = await ComplianceAnalysisJob.findOne({ jobId })
      .populate('sopId', 'name identifier department')
      .populate('triggeredBy', 'name email')
      .lean();
    
    if (!job) {
      return NextResponse.json({
        success: false,
        error: 'Job not found',
        userMessage: `No analysis job found with ID: ${jobId}`,
      }, { status: 404 });
    }
    
    // Calculate estimated time remaining
    let estimatedTimeRemaining = null;
    if (job.status === 'processing' && job.clausesAnalyzed > 0) {
      const elapsedTime = Date.now() - new Date(job.startedAt || job.queuedAt).getTime();
      const avgTimePerClause = elapsedTime / job.clausesAnalyzed;
      const remainingClauses = job.totalClauses - job.clausesAnalyzed;
      estimatedTimeRemaining = Math.round(avgTimePerClause * remainingClauses);
    }
    
    // Format response based on status
    if (job.status === 'completed') {
      return NextResponse.json({
        success: true,
        job: {
          jobId: job.jobId,
          sopId: job.sopId,
          sopName: job.sopName,
          sopIdentifier: job.sopIdentifier,
          department: job.department,
          status: job.status,
          progress: 100,
          complianceReportId: job.complianceReportId,
          overallScore: job.overallScore,
          complianceStatus: job.complianceStatus,
          processingTimeMs: job.processingTimeMs,
          completedAt: job.completedAt,
        },
      });
    }
    
    if (job.status === 'failed') {
      return NextResponse.json({
        success: false,
        job: {
          jobId: job.jobId,
          sopName: job.sopName,
          sopIdentifier: job.sopIdentifier,
          status: job.status,
          currentStep: job.currentStep,
          progress: job.progress,
          jobErrors: job.jobErrors,
          canRetry: job.canRetry,
          config: job.config,
        },
        userMessage: 'Analysis failed. Please review the errors below.',
      });
    }
    
    // In progress
    return NextResponse.json({
      success: true,
      job: {
        jobId: job.jobId,
        sopId: job.sopId,
        sopName: job.sopName,
        sopIdentifier: job.sopIdentifier,
        department: job.department,
        status: job.status,
        currentStep: job.currentStep,
        progress: job.progress,
        totalClauses: job.totalClauses,
        clausesAnalyzed: job.clausesAnalyzed,
        clausesFailed: job.clausesFailed,
        currentClause: job.currentClause,
        steps: job.steps,
        estimatedTimeRemaining,
        queuedAt: job.queuedAt,
        startedAt: job.startedAt,
      },
    });
    
  } catch (error) {
    console.error('Error fetching job status:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch job status',
      technicalDetails: (error as Error).message,
    }, { status: 500 });
  }
}
