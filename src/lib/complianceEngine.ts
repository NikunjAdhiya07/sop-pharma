import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Enhanced Compliance Engine
 * AI-powered SOP compliance validation against regulatory guidelines
 * 
 * Features:
 * - Semantic comparison of SOPs against guideline clauses
 * - Criticality assessment for non-compliant items
 * - Emoji-based visual indicators
 * - Traceable references to exact guideline sections
 */

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error('❌ GEMINI_API_KEY (or GOOGLE_AI_API_KEY) is missing');
}

const genAI = new GoogleGenerativeAI(apiKey || 'dummy_key_to_prevent_init_crash');

// Score to Emoji mapping
export function getScoreEmoji(score: number): string {
  if (score >= 9) return '🟢';
  if (score >= 6) return '🟡';
  return '🔴';
}

export function getScoreLabel(score: number): string {
  if (score >= 9) return 'Fully Compliant';
  if (score >= 6) return 'Partially Compliant';
  return 'Non-Compliant';
}

export interface ComplianceCheckRequest {
  sopContent: string;
  sopName: string;
  sopIdentifier: string;
  sopVersion?: string;
  department?: string;
  guidelineClauses: {
    clauseNumber: string;
    clauseTitle: string;
    clauseText: string;
    guidelineName: string;
    folderName: string;
    pdfName: string;
    guidelineId?: string;
  }[];
}

export interface ComplianceFinding {
  guidelineId?: string;
  guidelineName: string;
  folderName: string;
  pdfName: string;
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  complianceLevel: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable' | 'analysis-failed';
  matchConfidence: number;
  sopSectionAffected: string;
  mismatchExplanation: string;
  suggestedAction: string;
  sopTextSnippet: string;
  highlightedIssue: string;
  issueSeverity: 'critical' | 'major' | 'minor' | 'informational';
  issueType: 'missing-clause' | 'partial-coverage' | 'incorrect-implementation' | 'outdated-practice' | 'ambiguous-wording' | 'no-issue' | 'not-applicable';
  guidelineRequirement: string;
  suggestedText: string;
}

export interface ComplianceAnalysisResult {
  overallScore: number;
  scoreEmoji: string;
  complianceStatus: 'Fully Compliant' | 'Partially Compliant' | 'Non-Compliant';
  findings: ComplianceFinding[];
  totalGuidelinesChecked: number;
  compliantCount: number;
  partialCount: number;
  nonCompliantCount: number;
  criticalIssues: number;
  majorIssues: number;
  processingTimeMs: number;
}

/**
 * Main compliance analysis function
 * Compares SOP against all guideline clauses with enhanced assessment
 */
export async function analyzeSOPCompliance(request: ComplianceCheckRequest): Promise<ComplianceAnalysisResult> {
  const startTime = Date.now();
  
  try {
    const findings: ComplianceFinding[] = [];
    
    // Process each guideline clause
    for (const clause of request.guidelineClauses) {
      console.log(`Checking SOP against: ${clause.clauseNumber} - ${clause.clauseTitle}`);
      
      const finding = await checkSOPAgainstClause({
        sopContent: request.sopContent,
        sopName: request.sopName,
        sopIdentifier: request.sopIdentifier,
        clause,
      });
      
      findings.push(finding);
    }
    
    // Calculate overall statistics
    const compliantCount = findings.filter(f => f.complianceLevel === 'compliant').length;
    const partialCount = findings.filter(f => f.complianceLevel === 'partial').length;
    const nonCompliantCount = findings.filter(f => f.complianceLevel === 'non-compliant').length;
    const criticalIssues = findings.filter(f => f.issueSeverity === 'critical').length;
    const majorIssues = findings.filter(f => f.issueSeverity === 'major').length;
    
    console.log(`📊 Compliance Statistics:`);
    console.log(`   - Total findings: ${findings.length}`);
    console.log(`   - Compliant: ${compliantCount}`);
    console.log(`   - Partial: ${partialCount}`);
    console.log(`   - Non-compliant: ${nonCompliantCount}`);
    console.log(`   - Critical issues: ${criticalIssues}`);
    console.log(`   - Major issues: ${majorIssues}`);
    
    // Calculate overall score (0-10 scale)
    const totalChecks = findings.length;
    let weightedScore = 0;
    if (totalChecks > 0) {
      weightedScore = (compliantCount * 10 + partialCount * 5 + nonCompliantCount * 0) / totalChecks;
      console.log(`   - Weighted score calculation: (${compliantCount} * 10 + ${partialCount} * 5 + ${nonCompliantCount} * 0) / ${totalChecks} = ${weightedScore}`);
    }
    const overallScore = Math.round(weightedScore * 10) / 10;
    console.log(`   - Final overall score: ${overallScore}/10`);
    
    // Get emoji and status
    const scoreEmoji = getScoreEmoji(overallScore);
    const complianceStatus = getScoreLabel(overallScore) as 'Fully Compliant' | 'Partially Compliant' | 'Non-Compliant';
    
    const processingTimeMs = Date.now() - startTime;
    
    return {
      overallScore,
      scoreEmoji,
      complianceStatus,
      findings,
      totalGuidelinesChecked: totalChecks,
      compliantCount,
      partialCount,
      nonCompliantCount,
      criticalIssues,
      majorIssues,
      processingTimeMs,
    };
  } catch (error) {
    console.error('Error analyzing SOP compliance:', error);
    throw new Error('Failed to analyze SOP compliance');
  }
}

/**
 * Check SOP against a single guideline clause with enhanced assessment
 */
async function checkSOPAgainstClause(params: {
  sopContent: string;
  sopName: string;
  sopIdentifier: string;
  clause: {
    clauseNumber: string;
    clauseTitle: string;
    clauseText: string;
    guidelineName: string;
    folderName: string;
    pdfName: string;
    guidelineId?: string;
  };
}): Promise<ComplianceFinding> {
  const { sopContent, sopName, sopIdentifier, clause } = params;
  
  // Enhanced AI prompt for compliance checking with criticality assessment
  const prompt = `You are an expert pharmaceutical regulatory compliance auditor with deep knowledge of GMP, ICH, WHO, and FDA guidelines.

**TASK:** Analyze whether an SOP complies with a specific regulatory guideline clause.

**SOP INFORMATION:**
- SOP Name: ${sopName}
- SOP Identifier: ${sopIdentifier}
- SOP Content: ${truncateText(sopContent, 4000)}

**GUIDELINE CLAUSE TO CHECK:**
- Guideline Source: ${clause.folderName} / ${clause.guidelineName}
- Clause Number: ${clause.clauseNumber}
- Clause Title: ${clause.clauseTitle}
- Clause Requirement: ${clause.clauseText}

**ANALYZE AND DETERMINE:**

1. **Compliance Level**: 
   - "compliant": SOP fully addresses every aspect of this guideline requirement
   - "partial": SOP addresses some aspects but has gaps or weaknesses
   - "non-compliant": SOP does not address this requirement at all

2. **Issue Type**:
   - "missing-clause": The clause/requirement is completely absent from the SOP
   - "partial-coverage": The clause exists but lacks sufficient detail or specificity
   - "incorrect-implementation": The clause is implemented incorrectly
   - "outdated-practice": The SOP uses outdated methods
   - "ambiguous-wording": The SOP text is unclear or ambiguous
   - "no-issue": No issues (fully compliant)
   - "not-applicable": This guideline does not apply to this SOP

3. **Issue Severity**:
   - "critical": Direct patient safety impact, regulatory audit failure risk
   - "major": Significant quality/compliance risk, major finding potential
   - "minor": Moderate risk, minor finding in audit
   - "informational": Minimal risk, suggestion for improvement

4. **Match Confidence**: 0-100% confidence in your assessment

5. **SOP Section Affected**: Which section/part of the SOP relates to this guideline?

6. **Mismatch Explanation**: Be specific about WHY the SOP fails or passes. Reference exact requirements from the guideline.

7. **Guideline Requirement**: What does the guideline specifically require? (Extract the key requirement)

8. **Suggested Action**: Provide a specific, actionable recommendation with reference to the guideline clause number

9. **Suggested Text**: Exact text to add or modify in the SOP to achieve compliance

10. **SOP Text Snippet**: Extract 1-2 sentences from the SOP that relate to this requirement

11. **Highlighted Issue**: If non-compliant or partial, what specific element is missing/wrong?

**OUTPUT (JSON ONLY):**
{
  "complianceLevel": "compliant" | "partial" | "non-compliant" | "not-applicable",
  "issueType": "missing-clause" | "partial-coverage" | "incorrect-implementation" | "outdated-practice" | "ambiguous-wording" | "no-issue" | "not-applicable",
  "issueSeverity": "critical" | "major" | "minor" | "informational",
  "matchConfidence": 85,
  "sopSectionAffected": "Section X.X - Title",
  "mismatchExplanation": "Detailed explanation of the compliance gap referencing the specific guideline requirement...",
  "guidelineRequirement": "The guideline requires that...",
  "suggestedAction": "Add the following clause as per ${clause.clauseNumber}...",
  "suggestedText": "Exact text to add: 'All equipment shall be...' OR 'Modify section X.X to state: ...'",
  "sopTextSnippet": "Relevant text from the SOP...",
  "highlightedIssue": "Missing: specific element OR Weak: lacks detail on..."
}

IMPORTANT: 
- Be specific and actionable, not generic.
- Always reference the exact guideline clause number in suggestions.
- Criticality should reflect real regulatory risk.
- Provide ONLY valid JSON, no additional text.`;
  
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Parse AI response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    console.log(`   ✓ Clause ${clause.clauseNumber}: ${parsed.complianceLevel} (confidence: ${parsed.matchConfidence}%)`);
    
    return {
      guidelineId: clause.guidelineId,
      guidelineName: clause.guidelineName,
      folderName: clause.folderName,
      pdfName: clause.pdfName,
      clauseNumber: clause.clauseNumber,
      clauseTitle: clause.clauseTitle,
      clauseText: clause.clauseText,
      complianceLevel: parsed.complianceLevel || 'non-compliant',
      matchConfidence: parsed.matchConfidence || 0,
      sopSectionAffected: parsed.sopSectionAffected || 'Unknown',
      mismatchExplanation: parsed.mismatchExplanation || 'Unable to analyze',
      suggestedAction: parsed.suggestedAction || 'Manual review required',
      sopTextSnippet: parsed.sopTextSnippet || 'N/A',
      highlightedIssue: parsed.highlightedIssue || 'Unable to determine',
      issueSeverity: parsed.issueSeverity || 'minor',
      issueType: parsed.issueType || 'not-applicable',
      guidelineRequirement: parsed.guidelineRequirement || clause.clauseText || 'Not specified',
      suggestedText: parsed.suggestedText || 'Manual review required',
    };
  } catch (error) {
    console.error('❌ Error checking clause compliance:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    
    // Return a default finding on error
    return {
      guidelineId: clause.guidelineId,
      guidelineName: clause.guidelineName,
      folderName: clause.folderName,
      pdfName: clause.pdfName,
      clauseNumber: clause.clauseNumber,
      clauseTitle: clause.clauseTitle,
      clauseText: clause.clauseText,
      complianceLevel: 'analysis-failed',
      matchConfidence: 0,
      sopSectionAffected: 'Unable to analyze',
      mismatchExplanation: 'Error during analysis: ' + (error as Error).message,
      suggestedAction: 'Manual review required',
      sopTextSnippet: 'N/A',
      highlightedIssue: 'Analysis failed',
      issueSeverity: 'major',
      issueType: 'not-applicable',
      guidelineRequirement: clause.clauseText || 'Not specified',
      suggestedText: 'Manual review required - analysis failed',
    };
  }
}

/**
 * Truncate text to a maximum length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '... [truncated]';
}

/**
 * Batch compliance analysis for multiple SOPs
 */
export async function batchAnalyzeCompliance(
  requests: ComplianceCheckRequest[],
  onProgress?: (current: number, total: number, sopName: string) => void
): Promise<ComplianceAnalysisResult[]> {
  const results: ComplianceAnalysisResult[] = [];
  
  for (let i = 0; i < requests.length; i++) {
    const request = requests[i];
    console.log(`Analyzing compliance for: ${request.sopName} (${i + 1}/${requests.length})`);
    
    if (onProgress) {
      onProgress(i + 1, requests.length, request.sopName);
    }
    
    const result = await analyzeSOPCompliance(request);
    results.push(result);
  }
  
  return results;
}

/**
 * Smart guideline matching
 * Filter guidelines relevant to a specific SOP based on department/keywords
 */
export function filterRelevantGuidelines(
  allClauses: any[],
  sopDepartment: string,
  sopContent: string
): any[] {
  // Filter by department relevance
  const departmentKeywords: Record<string, string[]> = {
    'QA': ['quality assurance', 'audit', 'documentation', 'compliance', 'capa', 'deviation'],
    'QC': ['quality control', 'testing', 'laboratory', 'analysis', 'specification', 'sampling'],
    'PRODUCTION': ['manufacturing', 'production', 'process', 'equipment', 'batch', 'in-process'],
    'MICROBIOLOGY': ['microbiology', 'sterility', 'contamination', 'culture', 'environmental'],
    'STORE': ['storage', 'material', 'inventory', 'handling', 'dispensing', 'quarantine'],
    'ENGINEERING AND MAINTENANCE': ['equipment', 'calibration', 'maintenance', 'validation', 'qualification'],
    'PERSONNEL': ['training', 'personnel', 'qualification', 'competency', 'hygiene'],
  };
  
  const relevantKeywords = departmentKeywords[sopDepartment] || [];
  const sopLower = sopContent.toLowerCase();
  
  // Filter clauses that match department keywords
  return allClauses.filter(clause => {
    const clauseLower = (clause.clauseText + ' ' + clause.clauseTitle).toLowerCase();
    
    // Check if any relevant keyword appears in the clause
    return relevantKeywords.some(keyword => clauseLower.includes(keyword));
  });
}

/**
 * Generate compliance summary for dashboard
 */
export function generateComplianceSummary(results: ComplianceAnalysisResult[]): {
  totalSOPs: number;
  averageScore: number;
  fullyCompliant: number;
  partiallyCompliant: number;
  nonCompliant: number;
  criticalIssues: number;
  majorIssues: number;
} {
  const totalSOPs = results.length;
  const averageScore = results.reduce((sum, r) => sum + r.overallScore, 0) / totalSOPs || 0;
  const fullyCompliant = results.filter(r => r.overallScore >= 9).length;
  const partiallyCompliant = results.filter(r => r.overallScore >= 6 && r.overallScore < 9).length;
  const nonCompliant = results.filter(r => r.overallScore < 6).length;
  const criticalIssues = results.reduce((sum, r) => sum + r.criticalIssues, 0);
  const majorIssues = results.reduce((sum, r) => sum + r.majorIssues, 0);
  
  return {
    totalSOPs,
    averageScore: Math.round(averageScore * 10) / 10,
    fullyCompliant,
    partiallyCompliant,
    nonCompliant,
    criticalIssues,
    majorIssues,
  };
}
