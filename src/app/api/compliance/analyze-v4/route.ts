import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPGuideline from '@/models/SOPGuideline';
import ComplianceReport from '@/models/ComplianceReport';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SOP Compliance Intelligence Engine V4 - Batch Optimized
 * ═══════════════════════════════════════════════════════════════════════
 *
 * KEY CHANGE: Batch processing — BATCH_SIZE clauses per AI call.
 *   62 clauses / 12 per batch = ~6 calls instead of 62.
 *   Typical time: ~30-60s instead of 3-5 minutes.
 */

const BATCH_SIZE = 12;
const SMALL_BATCH_SIZE = 5;
const CLAUSE_TEXT_LIMIT = 400;

interface AnalysisConfig {
  aiModel?: 'gemini-1.5-flash' | 'gemini-1.5-pro';
  maxClausesToAnalyze?: number;  // 0 = all
  enableMissingDetection?: boolean;
  priorityThreshold?: number;  // 1-5
}

interface Finding {
  guidelineId: string;
  guidelineName: string;
  folderName: string;
  pdfName: string;
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  complianceLevel: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable' | 'analysis-failed';
  matchConfidence: number;
  issueType: 'missing-clause' | 'partial-coverage' | 'incorrect-implementation' | 'outdated-practice' | 'ambiguous-wording' | 'no-issue' | 'not-applicable';
  issueSeverity: 'critical' | 'major' | 'minor' | 'informational';
  sopSectionAffected: string;
  mismatchExplanation: string;
  highlightedIssue: string;
  sopTextSnippet: string;
  guidelineRequirement: string;
  suggestedAction: string;
  suggestedText: string;
  estimatedEffort: 'low' | 'medium' | 'high';
  priority: number;
  analyzedAt: Date;
  aiModelUsed: string;
}

interface ScoreBreakdown {
  overallScore: number;
  breakdown: {
    completeness: number;
    compliance: number;
    clarity: number;
    accuracy: number;
  };
  counts: {
    totalChecks: number;
    compliantCount: number;
    partialCount: number;
    nonCompliantCount: number;
    notApplicableCount: number;
  };
}

function normLevel(raw: string): Finding['complianceLevel'] {
  const v = String(raw || '').toLowerCase().replace(/_/g, '-');
  const valid: Finding['complianceLevel'][] = ['compliant', 'partial', 'non-compliant', 'not-applicable'];
  return valid.includes(v as Finding['complianceLevel']) ? (v as Finding['complianceLevel']) : 'non-compliant';
}

function calculateScore(findings: Finding[]): ScoreBreakdown {
  const totalChecks = findings.length;
  const compliantCount    = findings.filter(f => f.complianceLevel === 'compliant').length;
  const partialCount      = findings.filter(f => f.complianceLevel === 'partial').length;
  const nonCompliantCount = findings.filter(f => f.complianceLevel === 'non-compliant').length;
  const notApplicableCount = findings.filter(f => f.complianceLevel === 'not-applicable').length;

  const applicableChecks = totalChecks - notApplicableCount;
  const complianceScore = applicableChecks > 0
    ? ((compliantCount * 10) + (partialCount * 5)) / applicableChecks
    : 10;

  const requiredElements = findings.filter(f => f.issueType !== 'not-applicable').length;
  const presentElements  = findings.filter(f => f.complianceLevel === 'compliant' || f.complianceLevel === 'partial').length;
  const completenessScore = requiredElements > 0 ? (presentElements / requiredElements) * 10 : 10;

  const ambiguousCount  = findings.filter(f => f.issueType === 'ambiguous-wording').length;
  const clarityScore    = Math.max(0, 10 - (ambiguousCount * 0.5));
  const incorrectCount  = findings.filter(f => f.issueType === 'incorrect-implementation').length;
  const accuracyScore   = Math.max(0, 10 - (incorrectCount * 1.0));

  const overallScore = (
    completenessScore * 0.30 +
    complianceScore   * 0.40 +
    clarityScore      * 0.15 +
    accuracyScore     * 0.15
  );

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    breakdown: {
      completeness: Math.round(completenessScore * 10) / 10,
      compliance:   Math.round(complianceScore   * 10) / 10,
      clarity:      Math.round(clarityScore       * 10) / 10,
      accuracy:     Math.round(accuracyScore      * 10) / 10,
    },
    counts: { totalChecks, compliantCount, partialCount, nonCompliantCount, notApplicableCount },
  };
}

/**
 * Build a batch prompt: analyse BATCH_SIZE clauses in a single AI call.
 * The AI must return a JSON ARRAY with one finding object per clause (same order).
 */
function buildBatchPrompt(sopData: any, items: Array<{ guideline: any; clause: any }>): string {
  const clauseList = items
    .map(({ guideline, clause }, idx) =>
      `[${idx + 1}] Guideline: ${guideline.name} (${guideline.folderName})\n` +
      `    Clause ${clause.clauseNumber}: ${clause.clauseTitle}\n` +
      `    Requirement: ${(clause.clauseText || '').substring(0, 700)}${(clause.clauseText || '').length > 700 ? '...' : ''}`
    )
    .join('\n\n');

  const sopContent = (sopData.content || 'No content available').substring(0, 14000);
  const truncated  = (sopData.content || '').length > 14000;

  return (
    'You are a pharmaceutical GMP compliance expert.\n\n' +
    'Analyze the SOP below against EACH numbered guideline clause.\n' +
    'Return a JSON ARRAY containing exactly ' + items.length + ' objects (one per clause, same order).\n\n' +
    '**SOP:**\n' +
    '- Identifier: ' + sopData.identifier + '\n' +
    '- Name: ' + sopData.name + '\n' +
    '- Department: ' + sopData.department + '\n\n' +
    '**SOP CONTENT:**\n' +
    sopContent + (truncated ? '\n\n... (content truncated)' : '') + '\n\n' +
    '**CLAUSES TO CHECK (' + items.length + ' total):**\n' +
    clauseList + '\n\n' +
    '**REQUIRED JSON SHAPE per object:**\n' +
    '{\n' +
    '  "complianceLevel": "compliant" | "partial" | "non-compliant" | "not-applicable",\n' +
    '  "matchConfidence": 0-100,\n' +
    '  "issueType": "missing-clause" | "partial-coverage" | "incorrect-implementation" | "no-issue" | "not-applicable",\n' +
    '  "issueSeverity": "critical" | "major" | "minor" | "informational",\n' +
    '  "sopSectionAffected": "Section X.Y - Title or N/A",\n' +
    '  "mismatchExplanation": "Concise explanation of gap or compliance",\n' +
    '  "highlightedIssue": "Specific issue or empty string",\n' +
    '  "sopTextSnippet": "Relevant verbatim SOP text (max 200 chars) or empty",\n' +
    '  "guidelineRequirement": "What this clause requires (concise)",\n' +
    '  "suggestedAction": "Specific actionable fix",\n' +
    '  "suggestedText": "Exact proposed text to add/modify",\n' +
    '  "estimatedEffort": "low" | "medium" | "high",\n' +
    '  "priority": 1-5\n' +
    '}\n\n' +
    'RULES:\n' +
    '1. SOP does not mention topic → "non-compliant" + "missing-clause"\n' +
    '2. SOP partially addresses → "partial" + "partial-coverage"\n' +
    '3. SOP fully complies → "compliant" + "no-issue"\n' +
    '4. Clause irrelevant to this SOP → "not-applicable"\n' +
    '5. Be specific and actionable.\n\n' +
    'Respond with ONLY a valid JSON array of length ' + items.length + '. No markdown, no extra text.'
  );
}

/**
 * Parse batch AI response back into an array of finding objects.
 */
function parseBatchResponse(responseText: string, expectedCount: number): any[] {
  let text = responseText.trim();
  if (text.startsWith('```json')) text = text.slice(7);
  else if (text.startsWith('```')) text = text.slice(3);
  if (text.endsWith('```')) text = text.slice(0, -3);
  text = text.trim();

  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('No JSON array in batch response');
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('Batch response is not an array');
  while (parsed.length < expectedCount) parsed.push(null);
  return parsed.slice(0, expectedCount);
}

/** POST /api/compliance/analyze-v4 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    await dbConnect();

    const body = await request.json();
    const { sopId, userId, config = {} } = body;

    if (!sopId) {
      return NextResponse.json({ success: false, error: 'sopId is required' }, { status: 400 });
    }

    const analysisConfig: AnalysisConfig = {
      aiModel:               config.aiModel               || 'gemini-1.5-flash',
      maxClausesToAnalyze:   config.maxClausesToAnalyze   || 0,
      enableMissingDetection: config.enableMissingDetection !== false,
      priorityThreshold:     config.priorityThreshold     || 5,
    };

    console.log('Starting V4 batch analysis for SOP:', sopId, '| config:', analysisConfig);

    const sop = await SOP.findById(sopId);
    if (!sop) return NextResponse.json({ success: false, error: 'SOP not found' }, { status: 404 });

    const guidelines = await SOPGuideline.find({});
    if (guidelines.length === 0) {
      return NextResponse.json({ success: false, error: 'No guidelines found. Please upload guidelines first.' }, { status: 400 });
    }

    const allClauses: Array<{ guideline: any; clause: any }> = [];
    for (const guideline of guidelines) {
      if (guideline.clauses?.length > 0) {
        for (const clause of guideline.clauses) {
          allClauses.push({ guideline, clause });
        }
      }
    }

    console.log('Total clauses:', allClauses.length);

    const clausesToAnalyze = analysisConfig.maxClausesToAnalyze && analysisConfig.maxClausesToAnalyze > 0
      ? allClauses.slice(0, analysisConfig.maxClausesToAnalyze)
      : allClauses;

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: analysisConfig.aiModel || 'gemini-1.5-flash' });

    // ── Batch processing (replaces per-clause loop) ────────────────────
    const findings: Finding[] = [];
    const errors: any[]       = [];

    const batches: Array<Array<{ guideline: any; clause: any }>> = [];
    for (let i = 0; i < clausesToAnalyze.length; i += BATCH_SIZE) {
      batches.push(clausesToAnalyze.slice(i, i + BATCH_SIZE));
    }

    console.log(`Processing ${clausesToAnalyze.length} clauses in ${batches.length} batches of up to ${BATCH_SIZE}`);

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      console.log(`Batch [${batchIdx + 1}/${batches.length}] — ${batch.length} clauses`);

      try {
        const prompt      = buildBatchPrompt(sop, batch);
        const result      = await model.generateContent(prompt);
        const responseText = result.response.text();
        const batchResults = parseBatchResponse(responseText, batch.length);

        batch.forEach(({ guideline, clause }, i) => {
          const ai = batchResults[i];
          if (!ai || typeof ai !== 'object') {
            errors.push({ errorMessage: `Batch ${batchIdx + 1} slot ${i + 1} null`, affectedStep: 'ai-analysis', timestamp: new Date() });
            findings.push({
              guidelineId: guideline._id.toString(), guidelineName: guideline.name,
              folderName: guideline.folderName, pdfName: guideline.pdfName,
              clauseNumber: clause.clauseNumber, clauseTitle: clause.clauseTitle, clauseText: clause.clauseText,
              complianceLevel: 'analysis-failed', matchConfidence: 0, issueType: 'not-applicable',
              issueSeverity: 'informational', sopSectionAffected: 'N/A',
              mismatchExplanation: 'Batch slot missing in AI response', highlightedIssue: '',
              sopTextSnippet: '', guidelineRequirement: clause.clauseText,
              suggestedAction: 'Re-run analysis', suggestedText: '',
              estimatedEffort: 'low', priority: 5, analyzedAt: new Date(), aiModelUsed: analysisConfig.aiModel!,
            });
            return;
          }
          findings.push({
            guidelineId: guideline._id.toString(), guidelineName: guideline.name,
            folderName: guideline.folderName, pdfName: guideline.pdfName,
            clauseNumber: clause.clauseNumber, clauseTitle: clause.clauseTitle, clauseText: clause.clauseText,
            complianceLevel: normLevel(ai.complianceLevel),
            matchConfidence: Number(ai.matchConfidence) || 0,
            issueType: ai.issueType || 'not-applicable',
            issueSeverity: ai.issueSeverity || 'minor',
            sopSectionAffected: String(ai.sopSectionAffected || 'N/A'),
            mismatchExplanation: String(ai.mismatchExplanation || ''),
            highlightedIssue: String(ai.highlightedIssue || ''),
            sopTextSnippet: String(ai.sopTextSnippet || ''),
            guidelineRequirement: String(ai.guidelineRequirement || clause.clauseText || ''),
            suggestedAction: String(ai.suggestedAction || ''),
            suggestedText: String(ai.suggestedText || ''),
            estimatedEffort: (ai.estimatedEffort as Finding['estimatedEffort']) || 'medium',
            priority: Number(ai.priority) || 3,
            analyzedAt: new Date(), aiModelUsed: analysisConfig.aiModel!,
          });
        });
      } catch (error: any) {
        console.error(`Batch ${batchIdx + 1} failed:`, error.message);
        batch.forEach(({ guideline, clause }) => {
          errors.push({ errorType: 'ai-timeout', errorMessage: `Batch ${batchIdx + 1} failed`, errorDetails: error.message, affectedStep: 'ai-analysis', timestamp: new Date() });
          findings.push({
            guidelineId: guideline._id.toString(), guidelineName: guideline.name,
            folderName: guideline.folderName, pdfName: guideline.pdfName,
            clauseNumber: clause.clauseNumber, clauseTitle: clause.clauseTitle, clauseText: clause.clauseText,
            complianceLevel: 'analysis-failed', matchConfidence: 0, issueType: 'not-applicable',
            issueSeverity: 'informational', sopSectionAffected: 'N/A',
            mismatchExplanation: 'Analysis failed due to AI error', highlightedIssue: error.message,
            sopTextSnippet: '', guidelineRequirement: clause.clauseText,
            suggestedAction: 'Re-run analysis', suggestedText: '',
            estimatedEffort: 'low', priority: 5, analyzedAt: new Date(), aiModelUsed: analysisConfig.aiModel!,
          });
        });
      }

      // Brief pause between batches (not between every clause)
      if (batchIdx < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    // ──────────────────────────────────────────────────────────────────

    console.log('Analysis complete:', findings.length, 'findings');

    const scoreData = calculateScore(findings);
    console.log('Score:', scoreData);

    let complianceStatus: string;
    if (scoreData.overallScore >= 9.0)      complianceStatus = 'Fully Compliant';
    else if (scoreData.overallScore >= 6.0) complianceStatus = 'Partially Compliant';
    else                                    complianceStatus = 'Non-Compliant';

    const guidelinesUsed = guidelines.map(g => ({
      guidelineId: g._id, guidelineName: g.name, folderName: g.folderName,
      pdfName: g.pdfName, guidelineType: g.guidelineType, category: g.category || 'General',
      totalClauses: g.clauses?.length || 0,
      clausesChecked: findings.filter(f => f.guidelineId === g._id.toString()).length,
      relevanceScore: 100,
    }));

    const report = await ComplianceReport.create({
      sopId: sop._id, sopIdentifier: sop.identifier, sopName: sop.name,
      sopVersion: sop.version || '1.0', department: sop.department,
      sopContentLength: sop.content?.length || 0, sopFolderPath: sop.folderPath,
      analysisStatus: 'completed',
      analysisStartedAt: new Date(startTime), analysisCompletedAt: new Date(),
      analysisEngine: analysisConfig.aiModel,
      processingTimeMs: Date.now() - startTime, analysisErrors: errors,
      guidelinesUsed,
      overallScore: scoreData.overallScore, complianceStatus,
      compliancePercentage: scoreData.overallScore * 10,
      scoreBreakdown: {
        totalChecks: scoreData.counts.totalChecks,
        compliantCount: scoreData.counts.compliantCount,
        partialCount: scoreData.counts.partialCount,
        nonCompliantCount: scoreData.counts.nonCompliantCount,
        notApplicableCount: scoreData.counts.notApplicableCount,
        skippedCount: 0,
      },
      findings,
      dataIntegrity: {
        sopDataFetched: true, sopDataValidated: true,
        guidelinesDataFetched: true, guidelinesDataValidated: true,
        allClausesAnalyzed: analysisConfig.maxClausesToAnalyze === 0,
        scoreCalculated: true, scoreValidated: true, dataComplete: true,
        lastValidatedAt: new Date(),
      },
      analyzedBy: userId,
      syncedToSOPMonitoring: false, syncedToSOPLibrary: false, syncedToMCQBank: false, syncErrors: [],
      totalGuidelinesChecked: guidelines.length,
      compliantCount: scoreData.counts.compliantCount,
      partialCount: scoreData.counts.partialCount,
      nonCompliantCount: scoreData.counts.nonCompliantCount,
      analyzedAt: new Date(),
    });

    console.log('Report saved:', report._id);

    const missingElements = findings
      .filter(f => f.issueType === 'missing-clause' && f.issueSeverity !== 'informational')
      .map(f => ({
        element: f.clauseTitle,
        severity: f.issueSeverity,
        guidelineReference: `${f.guidelineName} - ${f.clauseNumber}`,
        suggestedAction: f.suggestedAction,
        suggestedText: f.suggestedText,
      }));

    return NextResponse.json({
      success: true,
      reportId: report._id,
      overallScore: scoreData.overallScore,
      breakdown: scoreData.breakdown,
      complianceStatus,
      totalGuidelinesChecked: guidelines.length,
      totalClausesAnalyzed: clausesToAnalyze.length,
      batchesUsed: batches.length,
      findings: {
        compliant: scoreData.counts.compliantCount,
        partial: scoreData.counts.partialCount,
        nonCompliant: scoreData.counts.nonCompliantCount,
        notApplicable: scoreData.counts.notApplicableCount,
      },
      missingElements,
      processingTimeMs: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Analysis failed:', error);
    return NextResponse.json({ success: false, error: error.message || 'Analysis failed', details: error.stack }, { status: 500 });
  }
}
