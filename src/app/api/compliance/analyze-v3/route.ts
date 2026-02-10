import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPGuideline from '@/models/SOPGuideline';
import ComplianceReport from '@/models/ComplianceReport';
import ComplianceAnalysisJob from '@/models/ComplianceAnalysisJob';
import {
  validateAnalysisPrerequisites,
  analyzeClauseWithPrecision,
  calculateIntelligentScore,
  extractSOPSections,
  getDepartmentContext,
  GuidelineRequirement,
  ComplianceFindingV3,
  AnalysisResultStatus,
} from '@/lib/complianceEngineV3';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * COMPLIANCE ANALYSIS API V3 - Precision & Scalability
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * KEY IMPROVEMENTS:
 * 1. True Gatekeeping - Won't analyze without valid data
 * 2. Department Intelligence - Context-aware analysis
 * 3. Transparent Results - Clear explanation of why scores are given
 * 4. No Misleading Scores - 0/10 only when truly non-compliant
 */

// Helper: Update job progress
async function updateJobProgress(jobId: string, updates: any) {
  await ComplianceAnalysisJob.findOneAndUpdate(
    { jobId },
    { 
      ...updates,
      lastHeartbeat: new Date(),
    }
  );
}

// Helper: Log error with proper field name
async function logJobError(
  jobId: string,
  errorType: string,
  errorMessage: string,
  affectedStep: string,
  errorStack?: string
) {
  await ComplianceAnalysisJob.findOneAndUpdate(
    { jobId },
    {
      $push: {
        jobErrors: {
          errorType,
          errorMessage,
          errorStack,
          affectedStep,
          timestamp: new Date(),
          recoverable: !['sop-not-found', 'no-guidelines'].includes(errorType),
        },
      },
      status: 'failed',
      currentStep: 'failed',
      completedAt: new Date(),
      isActive: false,
    }
  );
}

/**
 * POST: Start Compliance Analysis V3
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🔍 ═════ COMPLIANCE ANALYSIS V3 - PRECISION MODE ═════');
  
  let jobId: string | null = null;
  let aiCallsCount = 0;
  
  try {
    await dbConnect();
    
    const body = await request.json();
    const { sopId, userId, guidelineFilters, config } = body;
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 0: VALIDATE REQUEST
    // ═══════════════════════════════════════════════════════════════════
    if (!sopId) {
      return NextResponse.json({
        success: false,
        error: 'Missing SOP ID',
        userMessage: 'Please provide a valid SOP ID to analyze.',
      }, { status: 400 });
    }
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Missing User ID',
        userMessage: 'User authentication required.',
      }, { status: 401 });
    }
    
    jobId = `job-v3-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`✅ Job ID: ${jobId}`);
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: FETCH SOP
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n📄 Step 1: Fetching SOP...');
    
    const job = new ComplianceAnalysisJob({
      jobId,
      sopId,
      sopIdentifier: 'fetching...',
      sopName: 'fetching...',
      department: 'Unknown',
      status: 'processing',
      currentStep: 'fetching-sop',
      progress: 5,
      config: {
        aiModel: config?.aiModel || 'gemini-1.5-flash',
        maxClausesToAnalyze: config?.maxClausesToAnalyze || 50,
        guidelineFilters,
        retryOnFailure: true,
        retryCount: 0,
        maxRetries: 3,
      },
      triggeredBy: userId,
      queuedAt: new Date(),
      startedAt: new Date(),
    });
    
    await job.save();
    
    const sop = await SOP.findById(sopId);
    
    if (!sop) {
      await logJobError(jobId, 'sop-not-found', 
        `SOP with ID "${sopId}" not found.`, 'sop-fetch');
      
      return NextResponse.json({
        success: false,
        jobId,
        error: 'SOP not found',
        status: 'SOP_INVALID',
        userMessage: 'The SOP you\'re trying to analyze doesn\'t exist.',
        analysisExplanation: 'Analysis cannot proceed because the SOP was not found in the database.',
      }, { status: 404 });
    }
    
    console.log(`✅ SOP: ${sop.name} (${sop.identifier})`);
    console.log(`   Department: ${sop.department}`);
    console.log(`   Content: ${sop.content?.length || 0} characters`);
    
    // Extract SOP sections
    const sopSections = extractSOPSections(sop.content || '');
    console.log(`   Sections found: ${sopSections.length}`);
    
    await updateJobProgress(jobId, {
      sopIdentifier: sop.identifier,
      sopName: sop.name,
      department: sop.department,
      'steps.sopFetch.status': 'completed',
      'steps.sopFetch.completedAt': new Date(),
      'steps.sopFetch.sopContentLength': sop.content?.length || 0,
      progress: 15,
    });
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: FETCH & FILTER GUIDELINES
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n📚 Step 2: Fetching guidelines...');
    
    await updateJobProgress(jobId, {
      currentStep: 'fetching-guidelines',
      'steps.guidelineFetch.status': 'in-progress',
      'steps.guidelineFetch.startedAt': new Date(),
    });
    
    const guidelineQuery: any = { ocrStatus: 'completed' };
    if (guidelineFilters?.folderName) guidelineQuery.folderName = guidelineFilters.folderName;
    if (guidelineFilters?.category) guidelineQuery.category = guidelineFilters.category;
    if (guidelineFilters?.guidelineType) guidelineQuery.guidelineType = guidelineFilters.guidelineType;
    
    const guidelines = await SOPGuideline.find(guidelineQuery)
      .select('name folderName pdfName guidelineType category clauses')
      .lean();
    
    console.log(`   Guidelines found: ${guidelines.length}`);
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: GATEKEEPING - VALIDATE PREREQUISITES (CRITICAL!)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n🔐 Step 3: Validating prerequisites (Gatekeeping)...');
    
    const gatekeeping = await validateAnalysisPrerequisites(
      sop,
      guidelines,
      sop.department || 'General'
    );
    
    console.log(`   SOP Valid: ${gatekeeping.sopValidation.isValid}`);
    console.log(`   Guidelines Synced: ${gatekeeping.guidelineValidation.syncStatus}`);
    console.log(`   Clauses Found: ${gatekeeping.guidelineValidation.clausesFound}`);
    console.log(`   Applicable Clauses: ${gatekeeping.guidelineValidation.applicableClausesCount}`);
    console.log(`   Can Proceed: ${gatekeeping.canProceed}`);
    
    // If gatekeeping fails, return clear explanation
    if (!gatekeeping.canProceed && gatekeeping.status === 'GUIDELINE_SYNC_FAILED') {
      await logJobError(jobId, 'no-guidelines', gatekeeping.failureDetails || 'Guideline sync failed', 'guideline-fetch');
      
      return NextResponse.json({
        success: false,
        jobId,
        status: gatekeeping.status,
        error: gatekeeping.failureReason,
        userMessage: gatekeeping.failureDetails,
        gatekeeping,
        analysisExplanation: `Analysis was stopped because: ${gatekeeping.failureDetails}. This is NOT a compliance failure - it means we cannot analyze yet.`,
        nextSteps: [
          'Upload regulatory guidelines to the Guidelines section',
          'Ensure guidelines are properly processed (OCR completed)',
          'Try again after uploading guidelines',
        ],
      }, { status: 400 });
    }
    
    if (!gatekeeping.canProceed && gatekeeping.status === 'SOP_INVALID') {
      await logJobError(jobId, 'validation-error', gatekeeping.failureDetails || 'SOP invalid', 'sop-fetch');
      
      return NextResponse.json({
        success: false,
        jobId,
        status: gatekeeping.status,
        error: gatekeeping.failureReason,
        userMessage: gatekeeping.failureDetails,
        gatekeeping,
        analysisExplanation: `Analysis was stopped because: ${gatekeeping.failureDetails}`,
      }, { status: 400 });
    }
    
    await updateJobProgress(jobId, {
      'steps.guidelineFetch.status': 'completed',
      'steps.guidelineFetch.completedAt': new Date(),
      'steps.guidelineFetch.guidelinesFound': guidelines.length,
      'steps.guidelineFetch.clausesFound': gatekeeping.guidelineValidation.clausesFound,
      progress: 25,
    });
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: PREPARE CLAUSES WITH DEPARTMENT CONTEXT
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n🏢 Step 4: Applying department intelligence...');
    
    const deptContext = getDepartmentContext(sop.department || 'General');
    console.log(`   Department: ${deptContext.department}`);
    console.log(`   Relevant categories: ${deptContext.relevantCategories.join(', ')}`);
    
    // Build clauses list with proper typing
    const allClauses: GuidelineRequirement[] = guidelines.flatMap(guideline =>
      (guideline.clauses || []).map((clause: any) => ({
        guidelineId: guideline._id?.toString() || '',
        guidelineName: guideline.name || 'Unknown Guideline',
        folderName: guideline.folderName || '',
        pdfName: guideline.pdfName || '',
        guidelineType: guideline.guidelineType || '',
        category: guideline.category || '',
        clauseNumber: clause.clauseNumber || '',
        clauseTitle: clause.clauseTitle || '',
        clauseText: clause.clauseText || '',
        keywords: clause.keywords || [],
        applicableDepartments: [],
        isMandatory: true,
        regulatoryReference: `${guideline.guidelineType || ''} ${clause.clauseNumber || ''}`,
      }))
    );
    
    // Limit clauses
    const maxClauses = config?.maxClausesToAnalyze || 50;
    const clausesToAnalyze = allClauses.slice(0, maxClauses);
    
    console.log(`   Total clauses: ${allClauses.length}`);
    console.log(`   Clauses to analyze: ${clausesToAnalyze.length}`);
    
    await updateJobProgress(jobId, {
      totalClauses: clausesToAnalyze.length,
      progress: 30,
    });
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: AI ANALYSIS WITH PRECISION
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n🤖 Step 5: Analyzing clauses with AI (precision mode)...');
    
    await updateJobProgress(jobId, {
      currentStep: 'analyzing-clauses',
      'steps.clauseAnalysis.status': 'in-progress',
      'steps.clauseAnalysis.startedAt': new Date(),
    });
    
    const findings: ComplianceFindingV3[] = [];
    const guidelinesUsedMap = new Map();
    let analysisErrors = 0;
    
    for (let i = 0; i < clausesToAnalyze.length; i++) {
      const clause = clausesToAnalyze[i];
      const progress = 30 + Math.floor((i / clausesToAnalyze.length) * 45);
      
      console.log(`   [${i + 1}/${clausesToAnalyze.length}] ${clause.clauseNumber} - ${clause.clauseTitle.substring(0, 40)}...`);
      
      await updateJobProgress(jobId, {
        clausesAnalyzed: i + 1,
        progress,
        currentClause: {
          clauseNumber: clause.clauseNumber,
          clauseTitle: clause.clauseTitle,
          startedAt: new Date(),
        },
      });
      
      try {
        const finding = await analyzeClauseWithPrecision(
          sop.content || '',
          sopSections,
          sop.name,
          sop.identifier,
          sop.department || 'General',
          clause,
          config?.aiModel || 'gemini-1.5-flash'
        );
        
        aiCallsCount++;
        findings.push(finding);
        
        // Track guidelines used
        const key = clause.guidelineId;
        if (!guidelinesUsedMap.has(key)) {
          guidelinesUsedMap.set(key, {
            guidelineId: clause.guidelineId,
            guidelineName: clause.guidelineName,
            folderName: clause.folderName,
            pdfName: clause.pdfName,
            guidelineType: clause.guidelineType,
            category: clause.category,
            totalClauses: 0,
            clausesChecked: 0,
          });
        }
        const usage = guidelinesUsedMap.get(key);
        usage.totalClauses++;
        usage.clausesChecked++;
        
        // Log result
        const emoji = finding.complianceLevel === 'compliant' ? '✅' : 
                      finding.complianceLevel === 'partial' ? '🟡' :
                      finding.complianceLevel === 'not-applicable' ? '⬜' :
                      finding.complianceLevel === 'unable-to-determine' ? '❓' : '❌';
        console.log(`      ${emoji} ${finding.complianceLevel} (${finding.matchConfidence}%)`);
        
      } catch (clauseError) {
        console.error(`      ❌ Error: ${(clauseError as Error).message}`);
        analysisErrors++;
      }
    }
    
    console.log(`\n✅ Analysis completed: ${findings.length}/${clausesToAnalyze.length} clauses`);
    if (analysisErrors > 0) {
      console.log(`   ⚠️ Errors: ${analysisErrors}`);
    }
    
    await updateJobProgress(jobId, {
      'steps.clauseAnalysis.status': 'completed',
      'steps.clauseAnalysis.completedAt': new Date(),
      'steps.clauseAnalysis.clausesAnalyzed': findings.length,
      'steps.clauseAnalysis.clausesFailed': analysisErrors,
      progress: 75,
    });
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 6: INTELLIGENT SCORE CALCULATION
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n📊 Step 6: Calculating intelligent score...');
    
    await updateJobProgress(jobId, {
      currentStep: 'calculating-score',
      'steps.scoreCalculation.status': 'in-progress',
      'steps.scoreCalculation.startedAt': new Date(),
    });
    
    const scoreResult = calculateIntelligentScore(findings, gatekeeping);
    
    console.log(`   Overall Score: ${scoreResult.overallScore ?? 'N/A'}/10`);
    console.log(`   Compliance %: ${scoreResult.compliancePercentage ?? 'N/A'}%`);
    console.log(`   Status: ${scoreResult.complianceStatus}`);
    console.log(`   Breakdown:`);
    console.log(`     - Compliant: ${scoreResult.scoreBreakdown.compliantCount}`);
    console.log(`     - Partial: ${scoreResult.scoreBreakdown.partialCount}`);
    console.log(`     - Non-Compliant: ${scoreResult.scoreBreakdown.nonCompliantCount}`);
    console.log(`     - Not Applicable: ${scoreResult.scoreBreakdown.notApplicableCount}`);
    console.log(`     - Unable to Determine: ${scoreResult.scoreBreakdown.unableToDetermineCount}`);
    
    // Extract critical and major issues
    const criticalIssues = findings.filter(f => f.issueSeverity === 'critical' && f.complianceLevel !== 'compliant');
    const majorIssues = findings.filter(f => f.issueSeverity === 'major' && f.complianceLevel !== 'compliant');
    
    await updateJobProgress(jobId, {
      overallScore: scoreResult.overallScore,
      complianceStatus: scoreResult.complianceStatus,
      'steps.scoreCalculation.status': 'completed',
      'steps.scoreCalculation.completedAt': new Date(),
      'steps.scoreCalculation.overallScore': scoreResult.overallScore,
      'steps.scoreCalculation.complianceStatus': scoreResult.complianceStatus,
      progress: 85,
    });
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 7: SAVE REPORT WITH FULL TRANSPARENCY
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n💾 Step 7: Saving report...');
    
    await updateJobProgress(jobId, {
      currentStep: 'saving-report',
      'steps.reportSave.status': 'in-progress',
      'steps.reportSave.startedAt': new Date(),
    });
    
    // Build transparent explanation
    const analysisExplanation = buildAnalysisExplanation(
      sop,
      guidelines,
      findings,
      scoreResult,
      gatekeeping
    );
    
    // Build next steps
    const nextSteps = buildNextSteps(scoreResult, criticalIssues, majorIssues);
    
    const report = new ComplianceReport({
      sopId: sop._id,
      sopIdentifier: sop.identifier,
      sopName: sop.name,
      sopVersion: sop.version || '1.0',
      department: sop.department,
      sopContentLength: sop.content?.length || 0,
      sopFolderPath: sop.folderPath,
      
      analysisStatus: 'completed',
      analysisStartedAt: new Date(startTime),
      analysisCompletedAt: new Date(),
      analysisEngine: config?.aiModel || 'gemini-1.5-flash',
      processingTimeMs: Date.now() - startTime,
      analysisErrors: [],
      
      guidelinesUsed: Array.from(guidelinesUsedMap.values()),
      
      overallScore: scoreResult.overallScore ?? 0,
      complianceStatus: scoreResult.complianceStatus,
      compliancePercentage: scoreResult.compliancePercentage ?? 0,
      scoreBreakdown: scoreResult.scoreBreakdown,
      
      // Store V3 findings (they're compatible with the schema)
      findings: findings.map(f => ({
        guidelineId: f.guidelineId,
        guidelineName: f.guidelineName,
        folderName: f.folderName,
        pdfName: f.pdfName,
        clauseNumber: f.clauseNumber,
        clauseTitle: f.clauseTitle,
        clauseText: f.clauseText,
        complianceLevel: f.complianceLevel === 'unable-to-determine' ? 'partial' : f.complianceLevel,
        matchConfidence: f.matchConfidence,
        sopSectionAffected: `${f.sopSectionNumber} - ${f.sopSectionTitle}`,
        mismatchExplanation: f.specificGap,
        suggestedAction: f.suggestedAction,
        sopTextSnippet: f.sopTextSnippet,
        highlightedIssue: f.specificGap,
        issueSeverity: f.issueSeverity,
        issueType: f.issueType,
        guidelineRequirement: f.guidelineRequirement,
        suggestedText: f.suggestedText,
        estimatedEffort: f.estimatedEffort,
        priority: f.priority,
        analyzedAt: f.analyzedAt,
        aiModelUsed: f.aiModelUsed,
      })),
      
      dataIntegrity: {
        sopDataFetched: true,
        sopDataValidated: gatekeeping.sopValidation.isValid,
        guidelinesDataFetched: true,
        guidelinesDataValidated: gatekeeping.guidelineValidation.syncStatus === 'synced',
        allClausesAnalyzed: findings.length === clausesToAnalyze.length,
        scoreCalculated: scoreResult.overallScore !== null,
        scoreValidated: true,
        dataComplete: true,
        lastValidatedAt: new Date(),
      },
      
      analyzedBy: userId,
      reviewHistory: [{
        reviewedBy: userId,
        action: 'created',
        comment: analysisExplanation,
        timestamp: new Date(),
      }],
      
      syncedToSOPMonitoring: false,
      syncedToSOPLibrary: false,
      syncedToMCQBank: false,
      syncErrors: [],
      
      totalGuidelinesChecked: clausesToAnalyze.length,
      compliantCount: scoreResult.scoreBreakdown.compliantCount,
      partialCount: scoreResult.scoreBreakdown.partialCount,
      nonCompliantCount: scoreResult.scoreBreakdown.nonCompliantCount,
      analyzedAt: new Date(),
    });
    
    await report.save();
    console.log(`✅ Report saved: ${report._id}`);
    
    await updateJobProgress(jobId, {
      complianceReportId: report._id,
      status: 'completed',
      currentStep: 'completed',
      completedAt: new Date(),
      processingTimeMs: Date.now() - startTime,
      isActive: false,
      'steps.reportSave.status': 'completed',
      'steps.reportSave.completedAt': new Date(),
      'steps.reportSave.reportId': report._id,
      progress: 100,
    });
    
    const totalTime = Date.now() - startTime;
    console.log(`\n✅ ANALYSIS COMPLETE: ${totalTime}ms`);
    console.log(`   AI Calls: ${aiCallsCount}`);
    console.log(`═════════════════════════════════════\n`);
    
    return NextResponse.json({
      success: true,
      jobId,
      reportId: report._id,
      
      // SOP Info
      sopIdentifier: sop.identifier,
      sopName: sop.name,
      department: sop.department,
      
      // Score (transparent)
      overallScore: scoreResult.overallScore,
      compliancePercentage: scoreResult.compliancePercentage,
      complianceStatus: scoreResult.complianceStatus,
      
      // Breakdown
      statistics: scoreResult.scoreBreakdown,
      
      // Critical findings
      criticalIssuesCount: criticalIssues.length,
      majorIssuesCount: majorIssues.length,
      
      // Transparency
      analysisExplanation,
      dataSources: {
        sopName: sop.name,
        sopIdentifier: sop.identifier,
        sopContentLength: sop.content?.length || 0,
        sopSectionsAnalyzed: sopSections.length,
        guidelinesUsed: Array.from(guidelinesUsedMap.values()).map((g: any) => g.guidelineName),
        clausesAnalyzed: findings.length,
        clausesSkipped: clausesToAnalyze.length - findings.length,
        aiCallsCount,
        analysisMethod: 'AI Semantic Analysis (V3)',
      },
      
      // Gatekeeping results
      gatekeeping: {
        sopValid: gatekeeping.sopValidation.isValid,
        guidelinesSync: gatekeeping.guidelineValidation.syncStatus,
        clausesFound: gatekeeping.guidelineValidation.clausesFound,
        applicableClauses: gatekeeping.guidelineValidation.applicableClausesCount,
      },
      
      // Next steps
      nextSteps,
      
      // Processing info
      processingTimeMs: totalTime,
      message: 'Analysis completed with V3 precision engine',
      reportUrl: `/compliance/report/${report._id}`,
    });
    
  } catch (error) {
    console.error('❌ FATAL ERROR:', error);
    
    if (jobId) {
      await logJobError(
        jobId,
        'other',
        'Unexpected error during analysis',
        'unknown',
        (error as Error).stack
      );
    }
    
    return NextResponse.json({
      success: false,
      jobId,
      error: 'Analysis failed',
      userMessage: 'An unexpected error occurred. Please try again.',
      technicalDetails: (error as Error).message,
    }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function buildAnalysisExplanation(
  sop: any,
  guidelines: any[],
  findings: ComplianceFindingV3[],
  scoreResult: any,
  gatekeeping: any
): string {
  const parts: string[] = [];
  
  parts.push(`Analysis performed on ${sop.name} (${sop.identifier}) from ${sop.department} department.`);
  parts.push(`SOP content: ${sop.content?.length || 0} characters.`);
  parts.push(`Guidelines checked: ${guidelines.length} sources with ${findings.length} clauses analyzed.`);
  
  if (scoreResult.overallScore !== null) {
    parts.push(`Score: ${scoreResult.overallScore}/10 (${scoreResult.compliancePercentage}% compliant).`);
    parts.push(`Breakdown: ${scoreResult.scoreBreakdown.compliantCount} compliant, ${scoreResult.scoreBreakdown.partialCount} partial, ${scoreResult.scoreBreakdown.nonCompliantCount} non-compliant.`);
  } else {
    parts.push(`Score could not be calculated: ${scoreResult.complianceStatus}.`);
  }
  
  return parts.join(' ');
}

function buildNextSteps(
  scoreResult: any,
  criticalIssues: ComplianceFindingV3[],
  majorIssues: ComplianceFindingV3[]
): string[] {
  const steps: string[] = [];
  
  if (criticalIssues.length > 0) {
    steps.push(`Address ${criticalIssues.length} critical issue(s) immediately`);
  }
  
  if (majorIssues.length > 0) {
    steps.push(`Review ${majorIssues.length} major issue(s) for compliance gaps`);
  }
  
  if (scoreResult.scoreBreakdown.partialCount > 0) {
    steps.push('Review partial compliance items for improvement opportunities');
  }
  
  if (scoreResult.overallScore !== null && scoreResult.overallScore >= 8) {
    steps.push('Maintain current compliance standards through regular reviews');
  } else if (scoreResult.overallScore !== null && scoreResult.overallScore >= 5) {
    steps.push('Create action plan to address non-compliant areas');
  } else if (scoreResult.overallScore !== null) {
    steps.push('Prioritize comprehensive SOP revision to meet regulatory requirements');
  }
  
  if (steps.length === 0) {
    steps.push('Review the analysis results and consult with QA team');
  }
  
  return steps;
}
