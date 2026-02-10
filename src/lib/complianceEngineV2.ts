import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * Compliance Engine V2 - AI-Powered Analysis with Full Validation
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * This module handles the core AI analysis logic for compliance checking.
 * Each clause is analyzed individually with structured validation.
 */

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface ClauseAnalysisRequest {
  sopContent: string;
  sopName: string;
  sopIdentifier: string;
  clause: {
    guidelineId: any;
    guidelineName: string;
    folderName: string;
    pdfName: string;
    guidelineType: string;
    category: string;
    clauseNumber: string;
    clauseTitle: string;
    clauseText: string;
  };
  aiModel?: string;
}

export interface ClauseAnalysisResult {
  // Reference
  guidelineId: any;
  guidelineName: string;
  folderName: string;
  pdfName: string;
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  
  // Result
  complianceLevel: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable';
  matchConfidence: number;
  
  // Categorization
  issueType: 'missing-clause' | 'partial-coverage' | 'incorrect-implementation' | 'outdated-practice' | 'ambiguous-wording' | 'no-issue' | 'not-applicable';
  issueSeverity: 'critical' | 'major' | 'minor' | 'informational';
  
  // Explanation
  sopSectionAffected: string;
  mismatchExplanation: string;
  highlightedIssue: string;
  
  // Evidence
  sopTextSnippet: string;
  guidelineRequirement: string;
  
  // Action
  suggestedAction: string;
  suggestedText: string;
  estimatedEffort: 'low' | 'medium' | 'high';
  priority: number;
  
  // Metadata
  analyzedAt: Date;
  aiModelUsed: string;
}

/**
 * Analyze a single clause against SOP content using AI
 */
export async function analyzeClauseWithAI(
  request: ClauseAnalysisRequest
): Promise<ClauseAnalysisResult> {
  const { sopContent, sopName, sopIdentifier, clause, aiModel = 'gemini-1.5-flash' } = request;
  
  // Truncate SOP content for AI (max 4000 chars)
  const truncatedContent = sopContent.length > 4000 
    ? sopContent.substring(0, 4000) + '... [content truncated for analysis]'
    : sopContent;
  
  // Build AI prompt
  const prompt = `You are an expert pharmaceutical compliance auditor analyzing SOPs against regulatory guidelines.

**SOP INFORMATION:**
- Name: ${sopName}
- Identifier: ${sopIdentifier}
- Content: ${truncatedContent}

**GUIDELINE CLAUSE TO CHECK:**
- Guideline: ${clause.guidelineName} (${clause.guidelineType})
- Folder: ${clause.folderName}
- Clause: ${clause.clauseNumber} - ${clause.clauseTitle}
- Requirement: ${clause.clauseText}

**YOUR TASK:**
Analyze whether this SOP complies with the specific guideline clause above.

**OUTPUT FORMAT (JSON ONLY):**
{
  "complianceLevel": "compliant" | "partial" | "non-compliant" | "not-applicable",
  "matchConfidence": 0-100,
  "issueType": "missing-clause" | "partial-coverage" | "incorrect-implementation" | "outdated-practice" | "ambiguous-wording" | "no-issue" | "not-applicable",
  "issueSeverity": "critical" | "major" | "minor" | "informational",
  "sopSectionAffected": "Which section of SOP (e.g., 'Section 5.2 - Documentation')",
  "mismatchExplanation": "Clear explanation of WHY it passes/fails",
  "highlightedIssue": "Specific problem identified (e.g., 'Missing: 5-year retention period')",
  "sopTextSnippet": "Relevant SOP text (1-2 sentences)",
  "guidelineRequirement": "What the guideline specifically requires (1 sentence)",
  "suggestedAction": "Specific action to fix (e.g., 'Add retention period clause')",
  "suggestedText": "EXACT text to add/modify in SOP",
  "estimatedEffort": "low" | "medium" | "high",
  "priority": 1-5 (1=highest)
}

**IMPORTANT RULES:**
1. If the guideline clause is not applicable to this SOP's scope, set complianceLevel to "not-applicable"
2. Be specific in mismatchExplanation - explain WHY, not just WHAT
3. suggestedText must be exact, copy-paste ready text
4. priority 1-2 = critical/major issues, 3 = medium, 4-5 = minor/informational
5. Output ONLY valid JSON, no additional text

**ANALYZE NOW:**`;

  try {
    const model = genAI.getGenerativeModel({ 
      model: aiModel || 'gemini-1.5-flash'
    });
    
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI response did not contain valid JSON');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate response
    if (!parsed.complianceLevel || !parsed.matchConfidence) {
      throw new Error('AI response missing required fields');
    }
    
    // Normalize and validate fields
    const normalized: ClauseAnalysisResult = {
      // Reference
      guidelineId: clause.guidelineId,
      guidelineName: clause.guidelineName,
      folderName: clause.folderName,
      pdfName: clause.pdfName,
      clauseNumber: clause.clauseNumber,
      clauseTitle: clause.clauseTitle,
      clauseText: clause.clauseText,
      
      // Result
      complianceLevel: normalizeComplianceLevel(parsed.complianceLevel),
      matchConfidence: Math.min(100, Math.max(0, parsed.matchConfidence)),
      
      // Categorization
      issueType: normalizeIssueType(parsed.issueType),
      issueSeverity: normalizeIssueSeverity(parsed.issueSeverity),
      
      // Explanation
      sopSectionAffected: parsed.sopSectionAffected || 'General',
      mismatchExplanation: parsed.mismatchExplanation || 'No explanation provided',
      highlightedIssue: parsed.highlightedIssue || 'No specific issue identified',
      
      // Evidence
      sopTextSnippet: parsed.sopTextSnippet || truncatedContent.substring(0, 200),
      guidelineRequirement: parsed.guidelineRequirement || clause.clauseText.substring(0, 200),
      
      // Action
      suggestedAction: parsed.suggestedAction || 'Review and update SOP',
      suggestedText: parsed.suggestedText || '',
      estimatedEffort: normalizeEstimatedEffort(parsed.estimatedEffort),
      priority: Math.min(5, Math.max(1, parsed.priority || 3)),
      
      // Metadata
      analyzedAt: new Date(),
      aiModelUsed: aiModel,
    };
    
    return normalized;
    
  } catch (error) {
    console.error('Error in AI analysis:', error);
    
    // Return safe fallback
    return {
      guidelineId: clause.guidelineId,
      guidelineName: clause.guidelineName,
      folderName: clause.folderName,
      pdfName: clause.pdfName,
      clauseNumber: clause.clauseNumber,
      clauseTitle: clause.clauseTitle,
      clauseText: clause.clauseText,
      complianceLevel: 'non-compliant',
      matchConfidence: 0,
      issueType: 'not-applicable',
      issueSeverity: 'informational',
      sopSectionAffected: 'Unable to analyze',
      mismatchExplanation: `Analysis failed: ${(error as Error).message}`,
      highlightedIssue: 'AI analysis error',
      sopTextSnippet: 'N/A',
      guidelineRequirement: clause.clauseText.substring(0, 200),
      suggestedAction: 'Manual review required',
      suggestedText: '',
      estimatedEffort: 'high',
      priority: 3,
      analyzedAt: new Date(),
      aiModelUsed: aiModel,
    };
  }
}

/**
 * Calculate overall compliance score from findings
 */
export function calculateComplianceScore(findings: ClauseAnalysisResult[]): {
  overallScore: number;
  complianceStatus: string;
  compliancePercentage: number;
  scoreBreakdown: {
    totalChecks: number;
    compliantCount: number;
    partialCount: number;
    nonCompliantCount: number;
    notApplicableCount: number;
    skippedCount: number;
  };
} {
  const totalChecks = findings.length;
  
  if (totalChecks === 0) {
    return {
      overallScore: 0,
      complianceStatus: 'Analysis Pending',
      compliancePercentage: 0,
      scoreBreakdown: {
        totalChecks: 0,
        compliantCount: 0,
        partialCount: 0,
        nonCompliantCount: 0,
        notApplicableCount: 0,
        skippedCount: 0,
      },
    };
  }
  
  const compliantCount = findings.filter(f => f.complianceLevel === 'compliant').length;
  const partialCount = findings.filter(f => f.complianceLevel === 'partial').length;
  const nonCompliantCount = findings.filter(f => f.complianceLevel === 'non-compliant').length;
  const notApplicableCount = findings.filter(f => f.complianceLevel === 'not-applicable').length;
  
  // Calculate score (excluding not-applicable)
  const applicableChecks = totalChecks - notApplicableCount;
  const weightedScore = applicableChecks > 0
    ? (compliantCount * 10 + partialCount * 5 + nonCompliantCount * 0) / applicableChecks
    : 0;
  
  const overallScore = Math.round(weightedScore * 10) / 10;
  const compliancePercentage = applicableChecks > 0
    ? Math.round((compliantCount / applicableChecks) * 100)
    : 0;
  
  // Determine status
  let complianceStatus: string;
  if (overallScore >= 8.5) {
    complianceStatus = 'Fully Compliant';
  } else if (overallScore >= 5.0) {
    complianceStatus = 'Partially Compliant';
  } else {
    complianceStatus = 'Non-Compliant';
  }
  
  return {
    overallScore,
    complianceStatus,
    compliancePercentage,
    scoreBreakdown: {
      totalChecks,
      compliantCount,
      partialCount,
      nonCompliantCount,
      notApplicableCount,
      skippedCount: 0,
    },
  };
}

// Helper functions for normalization
function normalizeComplianceLevel(level: string): 'compliant' | 'partial' | 'non-compliant' | 'not-applicable' {
  const normalized = level.toLowerCase();
  if (normalized.includes('compliant') && !normalized.includes('non') && !normalized.includes('partial')) {
    return 'compliant';
  }
  if (normalized.includes('partial')) {
    return 'partial';
  }
  if (normalized.includes('not-applicable') || normalized.includes('not applicable')) {
    return 'not-applicable';
  }
  return 'non-compliant';
}

function normalizeIssueType(type: string): 'missing-clause' | 'partial-coverage' | 'incorrect-implementation' | 'outdated-practice' | 'ambiguous-wording' | 'no-issue' | 'not-applicable' {
  const normalized = type.toLowerCase();
  if (normalized.includes('missing')) return 'missing-clause';
  if (normalized.includes('partial')) return 'partial-coverage';
  if (normalized.includes('incorrect')) return 'incorrect-implementation';
  if (normalized.includes('outdated')) return 'outdated-practice';
  if (normalized.includes('ambiguous')) return 'ambiguous-wording';
  if (normalized.includes('not-applicable')) return 'not-applicable';
  if (normalized.includes('no-issue') || normalized.includes('none')) return 'no-issue';
  return 'partial-coverage';
}

function normalizeIssueSeverity(severity: string): 'critical' | 'major' | 'minor' | 'informational' {
  const normalized = severity.toLowerCase();
  if (normalized.includes('critical')) return 'critical';
  if (normalized.includes('major')) return 'major';
  if (normalized.includes('minor')) return 'minor';
  return 'informational';
}

function normalizeEstimatedEffort(effort: string): 'low' | 'medium' | 'high' {
  const normalized = effort.toLowerCase();
  if (normalized.includes('low')) return 'low';
  if (normalized.includes('high')) return 'high';
  return 'medium';
}

/**
 * Validate SOP data before analysis
 */
export function validateSOPData(sop: any): { valid: boolean; error?: string } {
  if (!sop) {
    return { valid: false, error: 'SOP not found' };
  }
  
  if (!sop.content || typeof sop.content !== 'string') {
    return { valid: false, error: 'SOP content is missing or invalid' };
  }
  
  if (sop.content.length < 100) {
    return { valid: false, error: `SOP content too short (${sop.content.length} characters). Minimum 100 characters required.` };
  }
  
  if (!sop.identifier || !sop.name) {
    return { valid: false, error: 'SOP identifier or name is missing' };
  }
  
  return { valid: true };
}

/**
 * Validate guidelines data before analysis
 */
export function validateGuidelinesData(guidelines: any[]): { valid: boolean; error?: string } {
  if (!guidelines || guidelines.length === 0) {
    return { 
      valid: false, 
      error: 'No guidelines found. Please upload guidelines first.' 
    };
  }
  
  const totalClauses = guidelines.reduce((sum, g) => sum + (g.clauses?.length || 0), 0);
  
  if (totalClauses === 0) {
    return { 
      valid: false, 
      error: 'Guidelines found but no clauses extracted. Guidelines may be improperly formatted.' 
    };
  }
  
  return { valid: true };
}
