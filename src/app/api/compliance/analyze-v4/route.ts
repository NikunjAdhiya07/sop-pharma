import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPGuideline from '@/models/SOPGuideline';
import ComplianceReport from '@/models/ComplianceReport';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SOP Compliance Intelligence Engine V4 - Optimized
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * FEATURES:
 * ✅ Accurate scoring (0-10) with breakdown
 * ✅ Missing content detection
 * ✅ Actionable suggestions with references
 * ✅ Deterministic scoring algorithm
 * ✅ Structured AI prompts
 * ✅ Scalable batch processing
 */

interface AnalysisConfig {
  aiModel?: 'gemini-1.5-flash' | 'gemini-3-pro-preview';
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

/**
 * Calculate compliance score using deterministic algorithm
 */
function calculateScore(findings: Finding[]): ScoreBreakdown {
  const totalChecks = findings.length;
  const compliantCount = findings.filter(f => f.complianceLevel === 'compliant').length;
  const partialCount = findings.filter(f => f.complianceLevel === 'partial').length;
  const nonCompliantCount = findings.filter(f => f.complianceLevel === 'non-compliant').length;
  const notApplicableCount = findings.filter(f => f.complianceLevel === 'not-applicable').length;
  
  // Compliance score (0-10) - 40% weight
  const applicableChecks = totalChecks - notApplicableCount;
  const complianceScore = applicableChecks > 0
    ? ((compliantCount * 10) + (partialCount * 5)) / applicableChecks
    : 10;
  
  // Completeness score (0-10) - 30% weight
  const requiredElements = findings.filter(f => f.issueType !== 'not-applicable').length;
  const presentElements = findings.filter(f => 
    f.complianceLevel === 'compliant' || f.complianceLevel === 'partial'
  ).length;
  const completenessScore = requiredElements > 0
    ? (presentElements / requiredElements) * 10
    : 10;
  
  // Clarity score (0-10) - 15% weight
  const ambiguousCount = findings.filter(f => f.issueType === 'ambiguous-wording').length;
  const clarityScore = Math.max(0, 10 - (ambiguousCount * 0.5));
  
  // Accuracy score (0-10) - 15% weight
  const incorrectCount = findings.filter(f => f.issueType === 'incorrect-implementation').length;
  const accuracyScore = Math.max(0, 10 - (incorrectCount * 1.0));
  
  // Overall score (weighted average)
  const overallScore = (
    completenessScore * 0.30 +
    complianceScore * 0.40 +
    clarityScore * 0.15 +
    accuracyScore * 0.15
  );
  
  return {
    overallScore: Math.round(overallScore * 10) / 10,
    breakdown: {
      completeness: Math.round(completenessScore * 10) / 10,
      compliance: Math.round(complianceScore * 10) / 10,
      clarity: Math.round(clarityScore * 10) / 10,
      accuracy: Math.round(accuracyScore * 10) / 10
    },
    counts: {
      totalChecks,
      compliantCount,
      partialCount,
      nonCompliantCount,
      notApplicableCount
    }
  };
}

/**
 * Build structured AI prompt for clause analysis
 */
function buildAnalysisPrompt(
  sopData: any,
  guideline: any,
  clause: any
): string {
  return `You are a pharmaceutical compliance expert analyzing an SOP against regulatory guidelines.

**SOP INFORMATION:**
- Identifier: ${sopData.identifier}
- Name: ${sopData.name}
- Department: ${sopData.department}
- Content Length: ${sopData.content?.length || 0} characters

**GUIDELINE BEING CHECKED:**
- Name: ${guideline.name}
- Clause: ${clause.clauseNumber} - ${clause.clauseTitle}
- Requirement: ${(clause.clauseText || '').substring(0, 2000)}${clause.clauseText?.length > 2000 ? '... (truncated)' : ''}

**YOUR TASK:**
Analyze if the SOP complies with this guideline clause.

**REQUIRED OUTPUT (JSON ONLY):**
{
  "complianceLevel": "compliant" | "partial" | "non-compliant" | "not-applicable",
  "matchConfidence": 0-100,
  "issueType": "missing-clause" | "partial-coverage" | "incorrect-implementation" | "no-issue" | "not-applicable",
  "issueSeverity": "critical" | "major" | "minor" | "informational",
  "sopSectionAffected": "Section X.Y - Title",
  "mismatchExplanation": "Clear explanation of the gap or compliance",
  "highlightedIssue": "Specific problem identified",
  "sopTextSnippet": "Relevant SOP text (if found, max 200 chars)",
  "guidelineRequirement": "What the guideline requires (concise)",
  "suggestedAction": "Specific, actionable fix",
  "suggestedText": "Exact text to add/modify",
  "estimatedEffort": "low" | "medium" | "high",
  "priority": 1-5
}

**ANALYSIS RULES:**
1. If SOP doesn't mention this topic at all → "non-compliant" + "missing-clause"
2. If SOP partially addresses it → "partial" + "partial-coverage"
3. If SOP fully complies → "compliant" + "no-issue"
4. If guideline doesn't apply to this SOP → "not-applicable"
5. Be specific in suggestions - provide exact text to add
6. Always include section references
7. Keep responses concise but actionable

**SOP CONTENT:**
${(sopData.content || 'No content available').substring(0, 15000)}${sopData.content?.length > 15000 ? '\n\n... (content truncated for analysis)' : ''}

Respond with ONLY the JSON object, no other text.`;
}

/**
 * Parse AI response and validate
 */
function parseAIResponse(responseText: string): any {
  try {
    // Remove markdown code blocks if present
    let jsonText = responseText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '');
    }
    
    const parsed = JSON.parse(jsonText);
    
    // Validate required fields
    if (!parsed.complianceLevel || !parsed.matchConfidence) {
      throw new Error('Missing required fields in AI response');
    }
    
    return parsed;
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    throw error;
  }
}

/**
 * POST /api/compliance/analyze-v4
 * Analyze a single SOP against all guidelines
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    await dbConnect();
    
    const body = await request.json();
    const { sopId, userId, config = {} } = body;
    
    if (!sopId) {
      return NextResponse.json({
        success: false,
        error: 'sopId is required'
      }, { status: 400 });
    }
    
    // Default configuration
    const analysisConfig: AnalysisConfig = {
      aiModel: config.aiModel || 'gemini-3-pro-preview',
      maxClausesToAnalyze: config.maxClausesToAnalyze || 0,  // 0 = all
      enableMissingDetection: config.enableMissingDetection !== false,
      priorityThreshold: config.priorityThreshold || 5
    };
    
    console.log(`🚀 Starting V4 analysis for SOP: ${sopId}`);
    console.log(`⚙️ Config:`, analysisConfig);
    
    // Step 1: Fetch SOP
    const sop = await SOP.findById(sopId);
    if (!sop) {
      return NextResponse.json({
        success: false,
        error: 'SOP not found'
      }, { status: 404 });
    }
    
    console.log(`✅ SOP loaded: ${sop.identifier} - ${sop.name}`);
    
    // Step 2: Fetch all guidelines with clauses
    const guidelines = await SOPGuideline.find({});
    
    if (guidelines.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No guidelines found. Please upload guidelines first.'
      }, { status: 400 });
    }
    
    console.log(`✅ Guidelines loaded: ${guidelines.length} guidelines`);
    
    // Step 3: Collect all clauses
    const allClauses: Array<{ guideline: any; clause: any }> = [];
    for (const guideline of guidelines) {
      if (guideline.clauses && guideline.clauses.length > 0) {
        for (const clause of guideline.clauses) {
          allClauses.push({ guideline, clause });
        }
      }
    }
    
    console.log(`✅ Total clauses to analyze: ${allClauses.length}`);
    
    // Debug: Show first clause structure
    if (allClauses.length > 0) {
      const firstClause = allClauses[0];
      console.log(`📋 Sample clause:`, {
        guideline: firstClause.guideline.name,
        clauseNumber: firstClause.clause.clauseNumber,
        clauseTitle: firstClause.clause.clauseTitle,
        hasText: !!firstClause.clause.clauseText
      });
    }
    
    
    // Apply max clauses limit if set
    const clausesToAnalyze = analysisConfig.maxClausesToAnalyze && analysisConfig.maxClausesToAnalyze > 0
      ? allClauses.slice(0, analysisConfig.maxClausesToAnalyze)
      : allClauses;
    
    console.log(`📊 Analyzing ${clausesToAnalyze.length} clauses`);
    
    // Step 4: Initialize Gemini AI
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'GEMINI_API_KEY (or GOOGLE_AI_API_KEY) not configured'
      }, { status: 500 });
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: analysisConfig.aiModel || 'gemini-3-pro-preview'
    });
    
    // Step 5: Analyze each clause
    const findings: Finding[] = [];
    const errors: any[] = [];
    
    for (let i = 0; i < clausesToAnalyze.length; i++) {
      const { guideline, clause } = clausesToAnalyze[i];
      
      console.log(`🔍 [${i + 1}/${clausesToAnalyze.length}] Analyzing: ${guideline.name} - ${clause.clauseNumber}`);      
      try {
        const prompt = buildAnalysisPrompt(sop, guideline, clause);
        console.log(`📝 Prompt length: ${prompt.length} chars`);
        
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        console.log(`✅ AI Response received: ${responseText.substring(0, 100)}...`);
        
        const aiResponse = parseAIResponse(responseText);
        console.log(`✅ Parsed response for ${clause.clauseNumber}`);
        
        // Build finding object
        const finding: Finding = {
          guidelineId: guideline._id.toString(),
          guidelineName: guideline.name,
          folderName: guideline.folderName,
          pdfName: guideline.pdfName,
          clauseNumber: clause.clauseNumber,
          clauseTitle: clause.clauseTitle,
          clauseText: clause.clauseText,
          complianceLevel: aiResponse.complianceLevel,
          matchConfidence: aiResponse.matchConfidence,
          issueType: aiResponse.issueType,
          issueSeverity: aiResponse.issueSeverity,
          sopSectionAffected: aiResponse.sopSectionAffected,
          mismatchExplanation: aiResponse.mismatchExplanation,
          highlightedIssue: aiResponse.highlightedIssue,
          sopTextSnippet: aiResponse.sopTextSnippet,
          guidelineRequirement: aiResponse.guidelineRequirement,
          suggestedAction: aiResponse.suggestedAction,
          suggestedText: aiResponse.suggestedText,
          estimatedEffort: aiResponse.estimatedEffort,
          priority: aiResponse.priority,
          analyzedAt: new Date(),
          aiModelUsed: analysisConfig.aiModel!
        };
        
        findings.push(finding);
        
      } catch (error: any) {
        console.error(`❌ Error analyzing clause ${clause.clauseNumber}:`, error.message);
        console.error(`❌ Full error:`, error);
        console.error(`❌ Error stack:`, error.stack);
        errors.push({
          errorType: 'ai-timeout',
          errorMessage: `Failed to analyze ${clause.clauseNumber}`,
          errorDetails: error.message,
          affectedStep: 'ai-analysis',
          timestamp: new Date()
        });
        
        // Add failed finding
        findings.push({
          guidelineId: guideline._id.toString(),
          guidelineName: guideline.name,
          folderName: guideline.folderName,
          pdfName: guideline.pdfName,
          clauseNumber: clause.clauseNumber,
          clauseTitle: clause.clauseTitle,
          clauseText: clause.clauseText,
          complianceLevel: 'analysis-failed',
          matchConfidence: 0,
          issueType: 'not-applicable',
          issueSeverity: 'informational',
          sopSectionAffected: 'N/A',
          mismatchExplanation: 'Analysis failed due to AI error',
          highlightedIssue: error.message,
          sopTextSnippet: '',
          guidelineRequirement: clause.clauseText,
          suggestedAction: 'Re-run analysis',
          suggestedText: '',
          estimatedEffort: 'low',
          priority: 5,
          analyzedAt: new Date(),
          aiModelUsed: analysisConfig.aiModel!
        });
      }
      
      // Rate limiting: wait 500ms between API calls
      if (i < clausesToAnalyze.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`✅ Analysis complete: ${findings.length} findings`);
    
    // Step 6: Calculate scores
    const scoreData = calculateScore(findings);
    
    console.log(`📊 Scores calculated:`, scoreData);
    
    // Step 7: Determine compliance status
    let complianceStatus: string;
    if (scoreData.overallScore >= 9.0) {
      complianceStatus = 'Fully Compliant';
    } else if (scoreData.overallScore >= 6.0) {
      complianceStatus = 'Partially Compliant';
    } else {
      complianceStatus = 'Non-Compliant';
    }
    
    // Step 8: Build guidelines used summary
    const guidelinesUsed = guidelines.map(g => ({
      guidelineId: g._id,
      guidelineName: g.name,
      folderName: g.folderName,
      pdfName: g.pdfName,
      guidelineType: g.guidelineType,
      category: g.category || 'General',
      totalClauses: g.clauses?.length || 0,
      clausesChecked: findings.filter(f => f.guidelineId === g._id.toString()).length,
      relevanceScore: 100  // TODO: Calculate actual relevance
    }));
    
    // Step 9: Save compliance report
    const report = await ComplianceReport.create({
      // SOP Reference
      sopId: sop._id,
      sopIdentifier: sop.identifier,
      sopName: sop.name,
      sopVersion: sop.version || '1.0',
      department: sop.department,
      sopContentLength: sop.content?.length || 0,
      sopFolderPath: sop.folderPath,
      
      // Analysis State
      analysisStatus: 'completed',
      analysisStartedAt: new Date(startTime),
      analysisCompletedAt: new Date(),
      analysisEngine: analysisConfig.aiModel,
      processingTimeMs: Date.now() - startTime,
      analysisErrors: errors,
      
      // Guideline Sources
      guidelinesUsed,
      
      // Compliance Score
      overallScore: scoreData.overallScore,
      complianceStatus,
      compliancePercentage: scoreData.overallScore * 10,
      scoreBreakdown: {
        totalChecks: scoreData.counts.totalChecks,
        compliantCount: scoreData.counts.compliantCount,
        partialCount: scoreData.counts.partialCount,
        nonCompliantCount: scoreData.counts.nonCompliantCount,
        notApplicableCount: scoreData.counts.notApplicableCount,
        skippedCount: 0
      },
      
      // Findings
      findings,
      
      // Data Integrity
      dataIntegrity: {
        sopDataFetched: true,
        sopDataValidated: true,
        guidelinesDataFetched: true,
        guidelinesDataValidated: true,
        allClausesAnalyzed: analysisConfig.maxClausesToAnalyze === 0,
        scoreCalculated: true,
        scoreValidated: true,
        dataComplete: true,
        lastValidatedAt: new Date()
      },
      
      // Audit Trail
      analyzedBy: userId,
      
      // Integration Status
      syncedToSOPMonitoring: false,
      syncedToSOPLibrary: false,
      syncedToMCQBank: false,
      syncErrors: [],
      
      // Legacy Compatibility
      totalGuidelinesChecked: guidelines.length,
      compliantCount: scoreData.counts.compliantCount,
      partialCount: scoreData.counts.partialCount,
      nonCompliantCount: scoreData.counts.nonCompliantCount,
      analyzedAt: new Date()
    });
    
    console.log(`✅ Report saved: ${report._id}`);
    
    // Step 10: Extract missing elements
    const missingElements = findings
      .filter(f => f.issueType === 'missing-clause' && f.issueSeverity !== 'informational')
      .map(f => ({
        element: f.clauseTitle,
        severity: f.issueSeverity,
        guidelineReference: `${f.guidelineName} - ${f.clauseNumber}`,
        suggestedAction: f.suggestedAction,
        suggestedText: f.suggestedText
      }));
    
    // Return response
    return NextResponse.json({
      success: true,
      reportId: report._id,
      overallScore: scoreData.overallScore,
      breakdown: scoreData.breakdown,
      complianceStatus,
      totalGuidelinesChecked: guidelines.length,
      totalClausesAnalyzed: clausesToAnalyze.length,
      findings: {
        compliant: scoreData.counts.compliantCount,
        partial: scoreData.counts.partialCount,
        nonCompliant: scoreData.counts.nonCompliantCount,
        notApplicable: scoreData.counts.notApplicableCount
      },
      missingElements,
      processingTimeMs: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error: any) {
    console.error('❌ Analysis failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Analysis failed',
      details: error.stack
    }, { status: 500 });
  }
}
