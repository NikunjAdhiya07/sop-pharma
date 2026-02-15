/**
 * ═══════════════════════════════════════════════════════════════════════
 * Compliance Analysis Prompts
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Centralized, version-controlled AI prompts for compliance analysis.
 * Enforces strict JSON output with validation and prevents hallucinations.
 */

/**
 * JSON Schema that AI must follow for compliance analysis
 */
export const COMPLIANCE_OUTPUT_SCHEMA = {
  type: 'object',
  required: [
    'isClauseApplicable',
    'applicabilityReason',
    'sopSectionNumber',
    'sopSectionTitle',
    'complianceLevel',
    'matchConfidence',
    'issueType',
    'issueSeverity',
    'specificGap',
    'guidelineRequirement',
    'sopCurrentState',
    'sopTextSnippet',
    'suggestedAction',
    'suggestedText',
    'estimatedEffort',
    'priority',
  ],
  properties: {
    isClauseApplicable: { type: 'boolean' },
    applicabilityReason: { type: 'string', minLength: 20 },
    sopSectionNumber: { type: 'string' },
    sopSectionTitle: { type: 'string' },
    complianceLevel: {
      type: 'string',
      enum: ['compliant', 'partial', 'non-compliant', 'not-applicable', 'unable-to-determine'],
    },
    matchConfidence: { type: 'number', minimum: 0, maximum: 100 },
    issueType: {
      type: 'string',
      enum: ['missing-clause', 'partial-coverage', 'incorrect-implementation', 'outdated-practice', 'ambiguous-wording', 'no-issue', 'not-applicable'],
    },
    issueSeverity: {
      type: 'string',
      enum: ['critical', 'major', 'minor', 'informational'],
    },
    specificGap: { type: 'string', minLength: 20 },
    guidelineRequirement: { type: 'string', minLength: 15 },
    sopCurrentState: { type: 'string', minLength: 15 },
    sopTextSnippet: { type: 'string', minLength: 10 },
    suggestedAction: { type: 'string', minLength: 20 },
    suggestedText: { type: 'string', minLength: 20 },
    estimatedEffort: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
    priority: { type: 'number', minimum: 1, maximum: 5 },
  },
};

/**
 * Prohibited phrases that indicate low-quality output
 */
export const PROHIBITED_OUTPUT_PHRASES = [
  'No regulatory requirement found',
  'Not specified',
  'Not found',
  'General compliance',
  'Review required',
  'Manual review required',
  'Unable to determine',
  'Analysis required',
  'Not determined',
  'No information',
  'Not mentioned',
  'Not clear',
  'Unclear',
  'N/A',
  'Not addressed',
];

/**
 * Few-shot examples of correct output
 */
export const COMPLIANCE_EXAMPLES = [
  {
    input: {
      clauseText: 'All equipment must be calibrated annually and records maintained for 5 years.',
      sopSection: 'Section 4.2 discusses equipment maintenance but does not specify calibration frequency.',
    },
    output: {
      isClauseApplicable: true,
      applicabilityReason: 'This clause applies as the SOP covers equipment maintenance procedures.',
      sopSectionNumber: '4.2',
      sopSectionTitle: 'Equipment Maintenance',
      complianceLevel: 'partial',
      matchConfidence: 85,
      issueType: 'partial-coverage',
      issueSeverity: 'major',
      specificGap: 'SOP mentions equipment maintenance but does not specify annual calibration requirement or 5-year record retention period.',
      guidelineRequirement: 'Equipment must be calibrated annually with records maintained for 5 years.',
      sopCurrentState: 'SOP Section 4.2 states "Equipment shall be maintained according to manufacturer specifications" but does not mention calibration frequency or record retention.',
      sopTextSnippet: 'Equipment shall be maintained according to manufacturer specifications and documented in the equipment log.',
      suggestedAction: 'Add specific calibration frequency requirement and record retention period to Section 4.2.',
      suggestedText: 'All equipment shall be calibrated annually as per approved calibration procedures. Calibration records shall be maintained for a minimum of 5 years.',
      estimatedEffort: 'low',
      priority: 2,
    },
  },
  {
    input: {
      clauseText: 'Change control procedures must include risk assessment and approval by Quality Assurance.',
      sopSection: 'Section 7.1 describes change control with QA approval and risk evaluation steps.',
    },
    output: {
      isClauseApplicable: true,
      applicabilityReason: 'This clause directly applies to the change control SOP.',
      sopSectionNumber: '7.1',
      sopSectionTitle: 'Change Control Process',
      complianceLevel: 'compliant',
      matchConfidence: 95,
      issueType: 'no-issue',
      issueSeverity: 'informational',
      specificGap: 'No gap identified. SOP adequately addresses risk assessment and QA approval requirements.',
      guidelineRequirement: 'Change control must include risk assessment and QA approval.',
      sopCurrentState: 'SOP Section 7.1 states "All changes must undergo risk assessment and receive QA Head approval before implementation."',
      sopTextSnippet: 'All proposed changes shall be evaluated for risk impact and submitted to QA Head for review and approval.',
      suggestedAction: 'No action required. Current SOP text is compliant.',
      suggestedText: 'No changes needed. Maintain current procedure.',
      estimatedEffort: 'low',
      priority: 5,
    },
  },
];

/**
 * Generate the main compliance analysis prompt - STRICT REGULATORY AUDITOR MODE
 */
export function generateCompliancePrompt(params: {
  sopName: string;
  sopIdentifier: string;
  department: string;
  sopContent: string;
  relevantSectionContent: string;
  relevantSectionNumber: string;
  relevantSectionTitle: string;
  guidelineName: string;
  guidelineType: string;
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  category: string;
}): string {
  return `🚨 YOU ARE A REGULATORY COMPLIANCE AUDITOR SYSTEM - NOT A TEXT GENERATOR

PRIMARY MISSION:
- Analyze SOP vs Guideline
- Identify EXACT gaps
- Provide STRUCTURED, VERIFIABLE output ONLY
- NO generic explanations, NO long paragraphs, NO assumptions

🔒 HARD RULES (MANDATORY):
❌ NO generic phrases: "not found", "not specified", "review required", "not clear"
❌ NO storytelling or explanations
❌ NO assumptions
✅ ONLY structured data
✅ Each finding MUST map: Guideline ↔ SOP ↔ Gap
✅ Each suggestion MUST fix a specific gap with EXACT text

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 SOP UNDER AUDIT:
ID: ${params.sopIdentifier}
Name: ${params.sopName}
Department: ${params.department}

📄 RELEVANT SOP SECTION:
Section: ${params.relevantSectionNumber} - ${params.relevantSectionTitle}
Content: ${params.relevantSectionContent.substring(0, 1500)}${params.relevantSectionContent.length > 1500 ? '...' : ''}

📚 FULL SOP CONTEXT:
${params.sopContent.substring(0, 3000)}${params.sopContent.length > 3000 ? '...' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📖 GUIDELINE REQUIREMENT TO VERIFY:
Source: ${params.guidelineName} (${params.guidelineType})
Clause: ${params.clauseNumber} - ${params.clauseTitle}
Category: ${params.category}

ATOMIC REQUIREMENT:
${params.clauseText.substring(0, 2000)}${params.clauseText.length > 2000 ? '...' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚙️ AUDIT PROCESS (STRICT):

STEP 1: Determine Applicability
→ Does this requirement apply to this SOP's scope and department?
→ If NO: mark "not-applicable" and explain why
→ If YES: proceed to Step 2

STEP 2: Locate SOP Evidence
→ Find the EXACT section that addresses (or should address) this requirement
→ Quote the EXACT text from the SOP (not paraphrased)
→ If not found anywhere: note which section SHOULD contain it

STEP 3: Perform 1:1 Comparison
→ What does the GUIDELINE require? (1 sentence, specific)
→ What does the SOP CURRENTLY state? (exact quote)
→ What is the EXACT gap? (specific, measurable)

STEP 4: Determine Compliance Level
→ Fully matched = "compliant"
→ Partially present = "partial"
→ Missing/incorrect = "non-compliant"
→ Cannot determine = "unable-to-determine"

STEP 5: Generate Fix (if gap exists)
→ Specific action to take
→ EXACT text to add/modify
→ Section where change should be made

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 REQUIRED OUTPUT FORMAT (NO DEVIATION):

{
  "isClauseApplicable": true or false,
  "applicabilityReason": "Brief reason why this clause does/doesn't apply to this SOP",
  "sopSectionNumber": "5.2" (exact section number, or "N/A" if not found),
  "sopSectionTitle": "Equipment Maintenance" (exact title, or "Not Addressed"),
  "complianceLevel": "compliant" | "partial" | "non-compliant" | "not-applicable" | "unable-to-determine",
  "matchConfidence": 85 (0-100, how confident you are in this assessment),
  "issueType": "missing-clause" | "partial-coverage" | "incorrect-implementation" | "outdated-practice" | "ambiguous-wording" | "no-issue" | "not-applicable",
  "issueSeverity": "critical" | "major" | "minor" | "informational",
  "specificGap": "SOP specifies fixed 3-month maintenance schedule but does not link to Quality Risk Management (QRM) principles",
  "guidelineRequirement": "Maintenance frequency must be risk-based per ICH Q9",
  "sopCurrentState": "Section 5.2 states: 'Equipment shall be maintained every 3 months as per fixed schedule'",
  "sopTextSnippet": "Equipment shall be maintained every 3 months as per fixed schedule",
  "suggestedAction": "Update Section 5.2 to include QRM-based frequency justification",
  "suggestedText": "Equipment maintenance frequency shall be determined based on Quality Risk Management (QRM) assessment considering equipment criticality, validated Design Space, and impact on Critical Process Parameters (CPPs). Maintenance intervals shall be justified and documented in the Equipment Maintenance Plan.",
  "estimatedEffort": "low" | "medium" | "high",
  "priority": 2 (1=highest, 5=lowest)
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 QUALITY CHECKS (BEFORE SUBMITTING):

✅ Is "specificGap" EXACT and measurable? (not "missing information")
✅ Is "sopCurrentState" an EXACT quote? (not paraphrased)
✅ Is "suggestedText" EXACT text to implement? (not "update this section")
✅ Is "guidelineRequirement" a clear 1-sentence requirement? (not a paragraph)
✅ Does output contain NO prohibited phrases?

If ANY check fails → REJECT and REGENERATE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OUTPUT ONLY VALID JSON (NO MARKDOWN, NO EXPLANATIONS):`;
}

/**
 * Generate a refined prompt for retry attempts
 */
export function generateRefinedPrompt(params: {
  originalPrompt: string;
  previousResponse: string;
  validationErrors: string[];
}): string {
  return `${params.originalPrompt}

**PREVIOUS ATTEMPT FAILED VALIDATION:**
Errors: ${params.validationErrors.join(', ')}

**REQUIREMENTS FOR THIS RETRY:**
1. Fix all validation errors listed above
2. Be MORE SPECIFIC in your gap description
3. Quote EXACT text from the SOP (not paraphrased)
4. Provide CONCRETE suggested text (not "update this section")
5. Ensure all required fields have minimum character lengths

**YOUR CORRECTED ANALYSIS (JSON ONLY):**`;
}

/**
 * Validate AI response against schema and quality rules
 */
export function validateAIResponse(response: any): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  const requiredFields = COMPLIANCE_OUTPUT_SCHEMA.required;
  for (const field of requiredFields) {
    if (!(field in response)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check for prohibited phrases
  const textFields = [
    'specificGap',
    'guidelineRequirement',
    'sopCurrentState',
    'suggestedAction',
    'suggestedText',
  ];

  for (const field of textFields) {
    const value = (response[field] || '').toLowerCase();
    
    for (const phrase of PROHIBITED_OUTPUT_PHRASES) {
      if (value.includes(phrase.toLowerCase())) {
        errors.push(`Prohibited phrase in ${field}: "${phrase}"`);
      }
    }
  }

  // Check minimum lengths
  const minLengths: Record<string, number> = {
    applicabilityReason: 20,
    specificGap: 20,
    guidelineRequirement: 15,
    sopCurrentState: 15,
    suggestedAction: 20,
    suggestedText: 20,
    sopTextSnippet: 10,
  };

  for (const [field, minLength] of Object.entries(minLengths)) {
    const value = response[field] || '';
    if (value.length < minLength) {
      errors.push(`${field} too short (${value.length} chars, min ${minLength})`);
    }
  }

  // Check confidence score
  if (response.matchConfidence < 0 || response.matchConfidence > 100) {
    errors.push(`Invalid confidence score: ${response.matchConfidence}`);
  }

  // Check priority
  if (response.priority < 1 || response.priority > 5) {
    errors.push(`Invalid priority: ${response.priority}`);
  }

  // Warnings for quality issues
  if (response.matchConfidence < 50 && response.complianceLevel !== 'unable-to-determine') {
    warnings.push('Low confidence score for non-uncertain finding');
  }

  if (response.sopSectionNumber === 'N/A' && response.complianceLevel !== 'not-applicable') {
    warnings.push('SOP section not identified for applicable finding');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
