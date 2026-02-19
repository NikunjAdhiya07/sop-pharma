import { GoogleGenerativeAI } from '@google/generative-ai';
import mongoose from 'mongoose';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * Compliance Engine V3 - Precision & Scalability
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL IMPROVEMENTS:
 * 1. True Guideline Synchronization - Validate before analysis
 * 2. Analysis Gatekeeping - Stop if dependencies fail
 * 3. Section-Level Matching - Precise SOP-to-Clause mapping
 * 4. Intelligent Scoring - Based on actual coverage
 * 5. Department Intelligence - Context-aware analysis
 * 6. Transparent Reasoning - No misleading results
 */

// Validate API key early
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
if (!GEMINI_KEY) {
  console.warn('⚠️ GEMINI_API_KEY (or GOOGLE_AI_API_KEY) is not set. AI analysis will fail.');
}
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const STABLE_MODEL = 'gemini-2.0-flash';

// ═══════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════

export type AnalysisResultStatus = 
  | 'COMPLETED'
  | 'GUIDELINE_SYNC_FAILED'
  | 'SOP_INVALID'
  | 'DEPARTMENT_MISMATCH'
  | 'ANALYSIS_INCOMPLETE'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'NO_APPLICABLE_GUIDELINES';

export interface GuidelineRequirement {
  guidelineId: string;
  guidelineName: string;
  folderName: string;
  pdfName: string;
  guidelineType: string;
  category: string;
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  keywords: string[];
  // Enhanced fields for precision
  applicableDepartments: string[];
  isMandatory: boolean;
  regulatoryReference: string;
}

export interface SOPSection {
  sectionNumber: string;
  sectionTitle: string;
  sectionContent: string;
  startPosition: number;
  endPosition: number;
}

export interface ComplianceFindingV3 {
  // Unique identifier for this finding
  findingId: string;
  
  // Guideline reference (precise)
  guidelineId: string;
  guidelineName: string;
  folderName: string;
  pdfName: string;
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  regulatoryReference: string;
  
  // SOP reference (precise)
  sopSectionNumber: string;
  sopSectionTitle: string;
  sopTextSnippet: string;
  
  // Analysis result
  complianceLevel: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable' | 'unable-to-determine';
  matchConfidence: number;
  
  // Issue details
  issueType: 'missing-clause' | 'partial-coverage' | 'incorrect-implementation' | 'outdated-practice' | 'ambiguous-wording' | 'no-issue' | 'not-applicable';
  issueSeverity: 'critical' | 'major' | 'minor' | 'informational';
  
  // Clear explanation (no generic text)
  specificGap: string;
  guidelineRequirement: string;
  sopCurrentState: string;
  
  // Actionable suggestions
  suggestedAction: string;
  suggestedText: string;
  estimatedEffort: 'low' | 'medium' | 'high';
  priority: number;
  
  // Metadata
  analyzedAt: Date;
  aiModelUsed: string;
  analysisMethod: 'ai-semantic' | 'keyword-match' | 'manual';
}

export interface DepartmentContext {
  department: string;
  relevantCategories: string[];
  criticalGuidelines: string[];
  expectedCoverage: string[];
  regulatoryFramework: string[];
}

export interface AnalysisGatekeepingResult {
  canProceed: boolean;
  status: AnalysisResultStatus;
  failureReason?: string;
  failureDetails?: string;
  
  // Validation results
  sopValidation: {
    isValid: boolean;
    contentLength: number;
    hasSections: boolean;
    sectionsFound: number;
    error?: string;
  };
  
  guidelineValidation: {
    isValid: boolean;
    guidelinesFound: number;
    clausesFound: number;
    applicableClausesCount: number;
    syncStatus: 'synced' | 'partial' | 'not-synced' | 'empty';
    error?: string;
  };
  
  departmentValidation: {
    isValid: boolean;
    department: string;
    hasRelevantGuidelines: boolean;
    error?: string;
  };
}

export interface ComplianceAnalysisResultV3 {
  // Status
  status: AnalysisResultStatus;
  analysisComplete: boolean;
  
  // Transparency
  analysisExplanation: string;
  dataSources: {
    sopName: string;
    sopIdentifier: string;
    sopContentLength: number;
    sopSectionsAnalyzed: number;
    guidelinesUsed: string[];
    clausesAnalyzed: number;
    clausesSkipped: number;
    analysisMethod: string;
  };
  
  // Score (only if analysis completed)
  overallScore: number | null;
  compliancePercentage: number | null;
  complianceStatus: string;
  
  // Breakdown
  scoreBreakdown: {
    totalApplicableClauses: number;
    compliantCount: number;
    partialCount: number;
    nonCompliantCount: number;
    notApplicableCount: number;
    unableToDetermineCount: number;
    skippedCount: number;
  };
  
  // Findings
  findings: ComplianceFindingV3[];
  
  // Critical issues highlighted
  criticalIssues: ComplianceFindingV3[];
  majorIssues: ComplianceFindingV3[];
  
  // Gatekeeping results
  gatekeeping: AnalysisGatekeepingResult;
  
  // Processing metadata
  processingTimeMs: number;
  aiCallsCount: number;
  
  // Recommendations
  nextSteps: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// DEPARTMENT INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════

const DEPARTMENT_CONTEXTS: Record<string, DepartmentContext> = {
  'QA': {
    department: 'QA',
    relevantCategories: ['Quality Assurance', 'Documentation', 'General Compliance'],
    criticalGuidelines: ['ICH Q7', 'WHO GMP', 'Schedule M'],
    expectedCoverage: ['audit', 'capa', 'deviation', 'change control', 'documentation', 'approval'],
    regulatoryFramework: ['ICH', 'WHO', 'FDA', 'Schedule M'],
  },
  'QC': {
    department: 'QC',
    relevantCategories: ['Quality Control', 'Testing', 'Laboratory'],
    criticalGuidelines: ['ICH Q2', 'ICH Q6A', 'FDA 21 CFR Part 211'],
    expectedCoverage: ['testing', 'sampling', 'specifications', 'stability', 'method validation', 'oos'],
    regulatoryFramework: ['ICH', 'FDA', 'USP', 'BP'],
  },
  'PRODUCTION': {
    department: 'PRODUCTION',
    relevantCategories: ['Manufacturing', 'Production', 'Process Control'],
    criticalGuidelines: ['ICH Q7', 'FDA 21 CFR Part 211', 'Schedule M'],
    expectedCoverage: ['batch processing', 'equipment', 'in-process control', 'cleaning', 'gowning'],
    regulatoryFramework: ['ICH', 'FDA', 'Schedule M'],
  },
  'ENGINEERING AND MAINTENANCE': {
    department: 'ENGINEERING AND MAINTENANCE',
    relevantCategories: ['Equipment & Maintenance', 'Calibration', 'Qualification'],
    criticalGuidelines: ['ICH Q7', 'FDA 21 CFR Part 211', 'Schedule M'],
    expectedCoverage: ['calibration', 'maintenance', 'qualification', 'validation', 'equipment log'],
    regulatoryFramework: ['ICH', 'FDA', 'Schedule M'],
  },
  'MICROBIOLOGY': {
    department: 'MICROBIOLOGY',
    relevantCategories: ['Quality Control', 'Testing', 'Environmental Monitoring'],
    criticalGuidelines: ['ICH Q6A', 'FDA 21 CFR Part 211', 'WHO GMP Annex'],
    expectedCoverage: ['sterility', 'environmental monitoring', 'bioburden', 'endotoxin', 'water testing'],
    regulatoryFramework: ['ICH', 'FDA', 'WHO'],
  },
  'STORE': {
    department: 'STORE',
    relevantCategories: ['Storage & Material Handling', 'Warehouse'],
    criticalGuidelines: ['ICH Q7', 'FDA 21 CFR Part 211', 'WHO GMP'],
    expectedCoverage: ['storage conditions', 'material handling', 'inventory', 'dispensing', 'quarantine'],
    regulatoryFramework: ['ICH', 'FDA', 'WHO'],
  },
};

function getDepartmentContext(department: string): DepartmentContext {
  const normalized = department.toUpperCase().replace(/[^A-Z\s]/g, '').trim();
  
  // Try exact match
  if (DEPARTMENT_CONTEXTS[normalized]) {
    return DEPARTMENT_CONTEXTS[normalized];
  }
  
  // Try partial match
  for (const [key, context] of Object.entries(DEPARTMENT_CONTEXTS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return context;
    }
  }
  
  // Default context
  return {
    department: department,
    relevantCategories: ['General Compliance'],
    criticalGuidelines: ['ICH Q7', 'WHO GMP'],
    expectedCoverage: [],
    regulatoryFramework: ['ICH', 'WHO', 'FDA'],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// SOP SECTION EXTRACTION
// ═══════════════════════════════════════════════════════════════════════

export function extractSOPSections(content: string): SOPSection[] {
  const sections: SOPSection[] = [];
  
  // Common SOP section patterns
  const patterns = [
    // Pattern 1: "1.0 PURPOSE", "2.0 SCOPE"
    /(\d+\.0)\s+([A-Z][A-Z\s&]+)/g,
    // Pattern 2: "Section 1: Purpose"
    /Section\s+(\d+):?\s*([^:\n]+)/gi,
    // Pattern 3: "1. PURPOSE", "2. SCOPE"
    /^(\d+)\.\s+([A-Z][A-Z\s&]+)/gm,
    // Pattern 4: "PURPOSE:", "SCOPE:"
    /^([A-Z][A-Z\s&]+):/gm,
  ];
  
  for (const pattern of patterns) {
    const matches = Array.from(content.matchAll(pattern));
    
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const startPos = match.index || 0;
      const nextMatch = matches[i + 1];
      const endPos = nextMatch?.index ? nextMatch.index : content.length;
      
      const sectionNumber = match[1] || `${i + 1}`;
      const sectionTitle = (match[2] || match[1]).trim();
      const sectionContent = content.slice(startPos, endPos).trim();
      
      // Only add if not duplicate
      const exists = sections.some(s => 
        s.sectionNumber === sectionNumber && s.sectionTitle === sectionTitle
      );
      
      if (!exists && sectionContent.length > 50) {
        sections.push({
          sectionNumber,
          sectionTitle,
          sectionContent,
          startPosition: startPos,
          endPosition: endPos,
        });
      }
    }
    
    if (sections.length > 0) break;
  }
  
  // If no sections found, create one large section
  if (sections.length === 0) {
    sections.push({
      sectionNumber: '1',
      sectionTitle: 'Full Document',
      sectionContent: content,
      startPosition: 0,
      endPosition: content.length,
    });
  }
  
  return sections;
}

// ═══════════════════════════════════════════════════════════════════════
// GATEKEEPING - VALIDATE BEFORE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════

export async function validateAnalysisPrerequisites(
  sop: any,
  guidelines: any[],
  department: string
): Promise<AnalysisGatekeepingResult> {
  const result: AnalysisGatekeepingResult = {
    canProceed: false,
    status: 'COMPLETED',
    sopValidation: {
      isValid: false,
      contentLength: 0,
      hasSections: false,
      sectionsFound: 0,
    },
    guidelineValidation: {
      isValid: false,
      guidelinesFound: 0,
      clausesFound: 0,
      applicableClausesCount: 0,
      syncStatus: 'not-synced',
    },
    departmentValidation: {
      isValid: false,
      department,
      hasRelevantGuidelines: false,
    },
  };
  
  // 1. Validate SOP
  if (!sop) {
    result.status = 'SOP_INVALID';
    result.failureReason = 'SOP not found';
    result.failureDetails = 'The requested SOP does not exist in the database.';
    return result;
  }
  
  if (!sop.content || typeof sop.content !== 'string') {
    result.status = 'SOP_INVALID';
    result.failureReason = 'SOP content missing';
    result.failureDetails = 'The SOP has no extractable content.';
    return result;
  }
  
  const sections = extractSOPSections(sop.content);
  result.sopValidation = {
    isValid: sop.content.length >= 100,
    contentLength: sop.content.length,
    hasSections: sections.length > 1 || sections[0].sectionTitle !== 'Full Document',
    sectionsFound: sections.length,
  };
  
  if (sop.content.length < 100) {
    result.status = 'SOP_INVALID';
    result.failureReason = 'SOP content too short';
    result.failureDetails = `SOP has only ${sop.content.length} characters. Minimum 100 required.`;
    result.sopValidation.error = result.failureDetails;
    return result;
  }
  
  // 2. Validate Guidelines (TRUE SYNC CHECK)
  if (!guidelines || guidelines.length === 0) {
    result.status = 'GUIDELINE_SYNC_FAILED';
    result.failureReason = 'No guidelines found';
    result.failureDetails = 'No guidelines have been uploaded. Please upload regulatory guidelines first.';
    result.guidelineValidation.error = result.failureDetails;
    result.guidelineValidation.syncStatus = 'empty';
    return result;
  }
  
  // Check for actual parsed clauses
  const totalClauses = guidelines.reduce((sum, g) => sum + (g.clauses?.length || 0), 0);
  const guidelinesWithClauses = guidelines.filter(g => g.clauses && g.clauses.length > 0);
  
  result.guidelineValidation.guidelinesFound = guidelines.length;
  result.guidelineValidation.clausesFound = totalClauses;
  
  if (totalClauses === 0) {
    result.status = 'GUIDELINE_SYNC_FAILED';
    result.failureReason = 'Guidelines not properly synced';
    result.failureDetails = `Found ${guidelines.length} guideline(s) but 0 parsed clauses. Guidelines may need to be re-uploaded or OCR processing completed.`;
    result.guidelineValidation.error = result.failureDetails;
    result.guidelineValidation.syncStatus = 'not-synced';
    return result;
  }
  
  if (guidelinesWithClauses.length < guidelines.length) {
    result.guidelineValidation.syncStatus = 'partial';
  } else {
    result.guidelineValidation.syncStatus = 'synced';
  }
  
  // 3. Check department relevance
  const deptContext = getDepartmentContext(department);
  const applicableClauses = countApplicableClauses(guidelines, deptContext);
  
  result.guidelineValidation.applicableClausesCount = applicableClauses;
  result.departmentValidation = {
    isValid: true,
    department,
    hasRelevantGuidelines: applicableClauses > 0,
  };
  
  if (applicableClauses === 0) {
    result.status = 'NO_APPLICABLE_GUIDELINES';
    result.failureReason = 'No applicable guidelines for this department';
    result.failureDetails = `Department "${department}" has no matching guidelines. Available guidelines may not be relevant to this SOP's scope.`;
    result.departmentValidation.error = result.failureDetails;
    result.departmentValidation.hasRelevantGuidelines = false;
    // Don't return - we can still analyze with all guidelines
  }
  
  // All validations passed
  result.canProceed = true;
  result.status = 'COMPLETED';
  
  return result;
}

function countApplicableClauses(guidelines: any[], context: DepartmentContext): number {
  let count = 0;
  
  for (const guideline of guidelines) {
    const categoryMatch = context.relevantCategories.some(cat =>
      (guideline.category || '').toLowerCase().includes(cat.toLowerCase())
    );
    
    if (categoryMatch || !guideline.category) {
      count += guideline.clauses?.length || 0;
    }
  }
  
  return count;
}

// ═══════════════════════════════════════════════════════════════════════
// AI ANALYSIS WITH PRECISION
// ═══════════════════════════════════════════════════════════════════════

export async function analyzeClauseWithPrecision(
  sopContent: string,
  sopSections: SOPSection[],
  sopName: string,
  sopIdentifier: string,
  department: string,
  clause: GuidelineRequirement,
  aiModel: string = STABLE_MODEL
): Promise<ComplianceFindingV3> {
  const { generateCompliancePrompt, generateRefinedPrompt, validateAIResponse } = await import('./compliancePrompts');
  const { validateFinding, sanitizeAIOutput, detectHallucination } = await import('./ComplianceFindingValidator');
  
  const findingId = `finding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Find most relevant SOP section for this clause
  const relevantSection = findRelevantSection(sopSections, clause);
  
  // Truncate for AI
  const truncatedContent = sopContent.length > 6000
    ? sopContent.substring(0, 6000) + '... [truncated]'
    : sopContent;
  
  // Generate structured prompt
  const prompt = generateCompliancePrompt({
    sopName,
    sopIdentifier,
    department,
    sopContent: truncatedContent,
    relevantSectionContent: relevantSection.sectionContent,
    relevantSectionNumber: relevantSection.sectionNumber,
    relevantSectionTitle: relevantSection.sectionTitle,
    guidelineName: clause.guidelineName,
    guidelineType: clause.guidelineType,
    clauseNumber: clause.clauseNumber,
    clauseTitle: clause.clauseTitle,
    clauseText: clause.clauseText,
    category: clause.category,
  });

  try {
    // Check API key before making the call
    if (!GEMINI_KEY) {
      throw new Error('GEMINI_API_KEY (or GOOGLE_AI_API_KEY) is not configured in .env.local.');
    }
    const model = genAI.getGenerativeModel({ model: aiModel });
    
    let result;
    let parsed: any;
    let validationResult: any;
    let retryCount = 0;
    const maxRetries = 3;
    
    // Retry loop with validation
    while (retryCount < maxRetries) {
      try {
        // Make AI call
        const currentPrompt = retryCount === 0 
          ? prompt 
          : generateRefinedPrompt({
              originalPrompt: prompt,
              previousResponse: JSON.stringify(parsed || {}),
              validationErrors: validationResult?.errors || [],
            });
        
        result = await model.generateContent(currentPrompt);
        const responseText = result.response.text();
        
        // Extract JSON
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('AI response did not contain valid JSON');
        }
        
        parsed = JSON.parse(jsonMatch[0]);
        
        // Validate response
        validationResult = validateAIResponse(parsed);
        
        if (validationResult.isValid) {
          console.log(`✅ Valid response on attempt ${retryCount + 1}`);
          break;
        } else {
          console.warn(`⚠️ Validation failed (Attempt ${retryCount + 1}/${maxRetries}):`, validationResult.errors);
          retryCount++;
          
          if (retryCount >= maxRetries) {
            console.error('Max retries reached. Using best available response.');
            break;
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err: any) {
        console.warn(`⚠️ AI call failed (Attempt ${retryCount + 1}/${maxRetries}): ${err.message}`);
        retryCount++;
        if (retryCount >= maxRetries) throw err;
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
      }
    }

    // Sanitize AI output
    const sanitized = sanitizeAIOutput({
      findingId,
      guidelineId: clause.guidelineId,
      guidelineName: clause.guidelineName,
      folderName: clause.folderName,
      pdfName: clause.pdfName,
      clauseNumber: clause.clauseNumber,
      clauseTitle: clause.clauseTitle,
      clauseText: clause.clauseText,
      regulatoryReference: clause.regulatoryReference || `${clause.guidelineType} ${clause.clauseNumber}`,
      ...parsed,
    });
    
    // Detect hallucinations
    const hallucinationCheck = detectHallucination(sanitized);
    if (hallucinationCheck.isHallucinated) {
      console.warn(`⚠️ Possible hallucination detected:`, hallucinationCheck.reasons);
      // Lower confidence score for suspected hallucinations
      sanitized.matchConfidence = Math.min(sanitized.matchConfidence, 60);
    }
    
    // Final validation
    const finalValidation = validateFinding(sanitized);
    if (!finalValidation.isValid) {
      console.error(`❌ Final validation failed:`, finalValidation.errors);
      // Log but continue - we'll use the best available data
    }
    
    if (finalValidation.warnings.length > 0) {
      console.warn(`⚠️ Validation warnings:`, finalValidation.warnings);
    }
    
    // Determine final compliance level
    let complianceLevel = normalizeComplianceLevel(sanitized.complianceLevel);
    
    // If not applicable, use that consistently
    if (!sanitized.isClauseApplicable) {
      complianceLevel = 'not-applicable';
    }
    
    return {
      findingId: sanitized.findingId || findingId,
      guidelineId: sanitized.guidelineId || clause.guidelineId,
      guidelineName: sanitized.guidelineName || clause.guidelineName,
      folderName: sanitized.folderName || clause.folderName,
      pdfName: sanitized.pdfName || clause.pdfName,
      clauseNumber: sanitized.clauseNumber || clause.clauseNumber,
      clauseTitle: sanitized.clauseTitle || clause.clauseTitle,
      clauseText: sanitized.clauseText || clause.clauseText,
      regulatoryReference: sanitized.regulatoryReference || `${clause.guidelineType} ${clause.clauseNumber}`,
      sopSectionNumber: sanitized.sopSectionNumber || 'N/A',
      sopSectionTitle: sanitized.sopSectionTitle || 'Not Addressed',
      sopTextSnippet: sanitized.sopTextSnippet || 'No specific SOP text identified for this clause.',
      complianceLevel,
      matchConfidence: Math.min(100, Math.max(0, sanitized.matchConfidence || 50)),
      issueType: normalizeIssueType(sanitized.issueType),
      issueSeverity: normalizeIssueSeverity(sanitized.issueSeverity),
      specificGap: sanitized.specificGap || 'Analysis required',
      guidelineRequirement: sanitized.guidelineRequirement || clause.clauseText.substring(0, 200),
      sopCurrentState: sanitized.sopCurrentState || 'Not determined',
      suggestedAction: sanitized.suggestedAction || 'Review required',
      suggestedText: sanitized.suggestedText || 'Review and update this section to address the guideline requirement.',
      estimatedEffort: normalizeEstimatedEffort(sanitized.estimatedEffort),
      priority: Math.min(5, Math.max(1, sanitized.priority || 3)),
      analyzedAt: new Date(),
      aiModelUsed: aiModel,
      analysisMethod: 'ai-semantic',
    };
  } catch (error) {
    console.error(`AI analysis failed for clause ${clause.clauseNumber}:`, error);
    
    // Return unable-to-determine instead of false non-compliant
    return {
      findingId,
      guidelineId: clause.guidelineId,
      guidelineName: clause.guidelineName,
      folderName: clause.folderName,
      pdfName: clause.pdfName,
      clauseNumber: clause.clauseNumber,
      clauseTitle: clause.clauseTitle,
      clauseText: clause.clauseText,
      regulatoryReference: `${clause.guidelineType} ${clause.clauseNumber}`,
      sopSectionNumber: 'N/A',
      sopSectionTitle: 'Analysis Failed',
      sopTextSnippet: 'Unable to extract - AI analysis failed. Manual review required.',
      complianceLevel: 'unable-to-determine',
      matchConfidence: 0,
      issueType: 'not-applicable',
      issueSeverity: 'informational',
      specificGap: `AI analysis failed: ${(error as Error).message}`,
      guidelineRequirement: clause.clauseText.substring(0, 200),
      sopCurrentState: 'Unable to determine',
      suggestedAction: 'Manual review required',
      suggestedText: 'Manual review required - AI analysis was unable to generate suggested text.',
      estimatedEffort: 'medium',
      priority: 3,
      analyzedAt: new Date(),
      aiModelUsed: aiModel,
      analysisMethod: 'ai-semantic',
    };
  }
}


function findRelevantSection(sections: SOPSection[], clause: GuidelineRequirement): SOPSection {
  const clauseKeywords = (clause.keywords || []).concat(
    clause.clauseTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  );
  
  let bestMatch = sections[0];
  let bestScore = 0;
  
  for (const section of sections) {
    const sectionLower = (section.sectionTitle + ' ' + section.sectionContent).toLowerCase();
    let score = 0;
    
    for (const keyword of clauseKeywords) {
      if (sectionLower.includes(keyword.toLowerCase())) {
        score++;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = section;
    }
  }
  
  return bestMatch;
}

// ═══════════════════════════════════════════════════════════════════════
// INTELLIGENT SCORE CALCULATION
// ═══════════════════════════════════════════════════════════════════════

export function calculateIntelligentScore(
  findings: ComplianceFindingV3[],
  gatekeeping: AnalysisGatekeepingResult
): {
  overallScore: number | null;
  compliancePercentage: number | null;
  complianceStatus: string;
  scoreBreakdown: ComplianceAnalysisResultV3['scoreBreakdown'];
} {
  const totalFindings = findings.length;
  
  // Count by compliance level
  const compliantCount = findings.filter(f => f.complianceLevel === 'compliant').length;
  const partialCount = findings.filter(f => f.complianceLevel === 'partial').length;
  const nonCompliantCount = findings.filter(f => f.complianceLevel === 'non-compliant').length;
  const notApplicableCount = findings.filter(f => f.complianceLevel === 'not-applicable').length;
  const unableToDetermineCount = findings.filter(f => f.complianceLevel === 'unable-to-determine').length;
  
  const scoreBreakdown = {
    totalApplicableClauses: totalFindings - notApplicableCount,
    compliantCount,
    partialCount,
    nonCompliantCount,
    notApplicableCount,
    unableToDetermineCount,
    skippedCount: 0,
  };
  
  // If too many unable-to-determine, mark as incomplete
  if (unableToDetermineCount > totalFindings * 0.5) {
    return {
      overallScore: null,
      compliancePercentage: null,
      complianceStatus: 'Analysis Failed',
      scoreBreakdown,
    };
  }
  
  // Calculate score excluding not-applicable and unable-to-determine
  const applicableFindings = totalFindings - notApplicableCount - unableToDetermineCount;
  
  if (applicableFindings === 0) {
    return {
      overallScore: null,
      compliancePercentage: null,
      complianceStatus: 'Analysis Pending',
      scoreBreakdown,
    };
  }
  
  // Weighted score: compliant=10, partial=5, non-compliant=0
  const weightedScore = (compliantCount * 10 + partialCount * 5) / applicableFindings;
  const overallScore = Math.round(weightedScore * 10) / 10;
  const compliancePercentage = Math.round((compliantCount / applicableFindings) * 100);
  
  // Determine status
  let complianceStatus: string;
  if (overallScore >= 8.5) {
    complianceStatus = 'Fully Compliant';
  } else if (overallScore >= 5.0) {
    complianceStatus = 'Partially Compliant';
  } else if (overallScore > 0) {
    complianceStatus = 'Non-Compliant';
  } else {
    complianceStatus = 'Non-Compliant';
  }
  
  return {
    overallScore,
    compliancePercentage,
    complianceStatus,
    scoreBreakdown,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function normalizeComplianceLevel(level: string): ComplianceFindingV3['complianceLevel'] {
  const normalized = (level || '').toLowerCase();
  if (normalized.includes('unable') || normalized.includes('determine')) return 'unable-to-determine';
  if (normalized.includes('not-applicable') || normalized.includes('not applicable')) return 'not-applicable';
  if (normalized.includes('compliant') && !normalized.includes('non') && !normalized.includes('partial')) return 'compliant';
  if (normalized.includes('partial')) return 'partial';
  return 'non-compliant';
}

function normalizeIssueType(type: string): ComplianceFindingV3['issueType'] {
  const normalized = (type || '').toLowerCase();
  if (normalized.includes('missing')) return 'missing-clause';
  if (normalized.includes('partial')) return 'partial-coverage';
  if (normalized.includes('incorrect')) return 'incorrect-implementation';
  if (normalized.includes('outdated')) return 'outdated-practice';
  if (normalized.includes('ambiguous')) return 'ambiguous-wording';
  if (normalized.includes('no-issue') || normalized.includes('none')) return 'no-issue';
  if (normalized.includes('not-applicable')) return 'not-applicable';
  return 'partial-coverage';
}

function normalizeIssueSeverity(severity: string): ComplianceFindingV3['issueSeverity'] {
  const normalized = (severity || '').toLowerCase();
  if (normalized.includes('critical')) return 'critical';
  if (normalized.includes('major')) return 'major';
  if (normalized.includes('minor')) return 'minor';
  return 'informational';
}

function normalizeEstimatedEffort(effort: string): 'low' | 'medium' | 'high' {
  const normalized = (effort || '').toLowerCase();
  if (normalized.includes('low')) return 'low';
  if (normalized.includes('high')) return 'high';
  return 'medium';
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

export { getDepartmentContext };
