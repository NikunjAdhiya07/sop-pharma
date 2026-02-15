/**
 * ═══════════════════════════════════════════════════════════════════════
 * Compliance Formatter
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Format compliance findings into structured, consistent output.
 * Transform raw AI responses into clean, professional compliance reports.
 */

import { ComplianceFindingInput } from './ComplianceFindingValidator';

export interface FormattedFinding {
  id: string;
  requirement: string;
  gap: string;
  impact: string;
  suggestion: string;
  reference: string;
  severity: 'critical' | 'major' | 'minor' | 'informational';
  status: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable';
  confidence: number;
}

/**
 * Format a compliance finding for display
 */
export function formatFinding(finding: ComplianceFindingInput): FormattedFinding {
  return {
    id: finding.findingId || `finding-${Date.now()}`,
    requirement: formatRequirement(finding),
    gap: formatGap(finding),
    impact: formatImpact(finding),
    suggestion: formatSuggestion(finding),
    reference: formatReference(finding),
    severity: normalizeSeverity(finding.issueSeverity),
    status: finding.complianceLevel as any,
    confidence: finding.matchConfidence,
  };
}

/**
 * Format the guideline requirement in a clear, concise way
 */
export function formatRequirement(finding: ComplianceFindingInput): string {
  const requirement = finding.guidelineRequirement || finding.clauseText;
  
  // Clean up the requirement text
  let formatted = requirement.trim();
  
  // Ensure it starts with a capital letter
  if (formatted.length > 0) {
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
  
  // Ensure it ends with proper punctuation
  if (formatted.length > 0 && !formatted.match(/[.!?]$/)) {
    formatted += '.';
  }
  
  return formatted;
}

/**
 * Format the gap explanation using the strict audit structure:
 * 1. What guideline requires (atomic requirement)
 * 2. What SOP currently has (exact evidence)
 * 3. What is the exact gap (measurable)
 */
export function formatGap(finding: ComplianceFindingInput): string {
  const parts: string[] = [];
  
  // Part 1: Guideline requirement (atomic, 1-sentence)
  if (finding.guidelineRequirement && finding.guidelineRequirement.length > 10) {
    parts.push(`**Guideline Requires:** ${finding.guidelineRequirement}`);
  }
  
  // Part 2: Current SOP state (exact quote/evidence)
  if (finding.sopCurrentState && finding.sopCurrentState.length > 10) {
    // Check if it's already formatted as a quote
    const state = finding.sopCurrentState.includes('"') || finding.sopCurrentState.includes("'")
      ? finding.sopCurrentState
      : `"${finding.sopCurrentState}"`;
    parts.push(`**SOP Currently States:** ${state}`);
  }
  
  // Part 3: Exact gap (specific, measurable)
  if (finding.specificGap && finding.specificGap.length > 10) {
    parts.push(`**Exact Gap:** ${finding.specificGap}`);
  }
  
  // If we don't have all 3 parts, return just the specific gap
  if (parts.length < 3 && finding.specificGap) {
    return finding.specificGap;
  }
  
  return parts.join('\n\n');
}

/**
 * Format the impact explanation
 */
export function formatImpact(finding: ComplianceFindingInput): string {
  // Extract impact from the gap or generate based on severity
  const severity = normalizeSeverity(finding.issueSeverity);
  
  const impactTemplates: Record<string, string> = {
    critical: 'This gap may lead to regulatory non-compliance and could result in serious quality or safety issues.',
    major: 'This gap may lead to compliance concerns and could impact product quality or regulatory standing.',
    minor: 'This gap represents an opportunity for improvement to strengthen compliance.',
    informational: 'This is noted for informational purposes and future reference.',
  };
  
  // If we have a specific gap that mentions impact, use it
  if (finding.specificGap && (
    finding.specificGap.toLowerCase().includes('may lead to') ||
    finding.specificGap.toLowerCase().includes('could result in') ||
    finding.specificGap.toLowerCase().includes('impact')
  )) {
    return finding.specificGap;
  }
  
  return impactTemplates[severity] || impactTemplates.informational;
}

/**
 * Format the suggestion with clear action steps
 */
export function formatSuggestion(finding: ComplianceFindingInput): string {
  const parts: string[] = [];
  
  // Action
  if (finding.suggestedAction) {
    parts.push(`**Action:** ${finding.suggestedAction}`);
  }
  
  // Suggested text (if specific)
  if (finding.suggestedText && finding.suggestedText.length > 20) {
    parts.push(`**Suggested Text:**\n\`\`\`\n${finding.suggestedText}\n\`\`\``);
  }
  
  // Effort estimate
  if (finding.estimatedEffort) {
    const effortLabels: Record<string, string> = {
      low: 'Low effort (minor text addition)',
      medium: 'Medium effort (section revision)',
      high: 'High effort (major restructuring)',
    };
    parts.push(`**Effort:** ${effortLabels[finding.estimatedEffort] || finding.estimatedEffort}`);
  }
  
  return parts.join('\n\n');
}

/**
 * Format the complete reference citation
 */
export function formatReference(finding: ComplianceFindingInput): string {
  const parts: string[] = [];
  
  // Guideline name
  if (finding.guidelineName) {
    parts.push(finding.guidelineName);
  }
  
  // Folder (if different from guideline name)
  if (finding.folderName && finding.folderName !== finding.guidelineName) {
    parts.push(`(${finding.folderName})`);
  }
  
  // Clause number and title
  if (finding.clauseNumber) {
    const clausePart = finding.clauseTitle 
      ? `§${finding.clauseNumber} - ${finding.clauseTitle}`
      : `§${finding.clauseNumber}`;
    parts.push(clausePart);
  }
  
  // Regulatory reference (if available)
  if (finding.regulatoryReference && finding.regulatoryReference !== finding.guidelineName) {
    parts.push(`[${finding.regulatoryReference}]`);
  }
  
  return parts.join(' → ');
}

/**
 * Normalize severity to standard values
 */
function normalizeSeverity(severity: string): 'critical' | 'major' | 'minor' | 'informational' {
  const normalized = (severity || '').toLowerCase();
  if (normalized.includes('critical')) return 'critical';
  if (normalized.includes('major') || normalized.includes('high')) return 'major';
  if (normalized.includes('minor') || normalized.includes('medium')) return 'minor';
  return 'informational';
}

/**
 * Format a complete compliance report summary
 */
export function formatReportSummary(data: {
  sopName: string;
  sopIdentifier: string;
  department: string;
  overallScore: number;
  complianceStatus: string;
  totalChecked: number;
  compliantCount: number;
  partialCount: number;
  nonCompliantCount: number;
  analyzedAt: Date;
}): string {
  const lines: string[] = [];
  
  lines.push(`# Compliance Report: ${data.sopIdentifier}`);
  lines.push(`**SOP:** ${data.sopName}`);
  lines.push(`**Department:** ${data.department}`);
  lines.push(`**Overall Score:** ${data.overallScore.toFixed(1)}/10`);
  lines.push(`**Status:** ${data.complianceStatus}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- **Total Checks:** ${data.totalChecked}`);
  lines.push(`- **Compliant:** ${data.compliantCount} (${Math.round(data.compliantCount / data.totalChecked * 100)}%)`);
  lines.push(`- **Partial:** ${data.partialCount} (${Math.round(data.partialCount / data.totalChecked * 100)}%)`);
  lines.push(`- **Non-Compliant:** ${data.nonCompliantCount} (${Math.round(data.nonCompliantCount / data.totalChecked * 100)}%)`);
  lines.push('');
  lines.push(`**Analyzed:** ${data.analyzedAt.toLocaleDateString()} ${data.analyzedAt.toLocaleTimeString()}`);
  
  return lines.join('\n');
}

/**
 * Format findings grouped by severity
 */
export function groupFindingsBySeverity(findings: ComplianceFindingInput[]): {
  critical: ComplianceFindingInput[];
  major: ComplianceFindingInput[];
  minor: ComplianceFindingInput[];
  informational: ComplianceFindingInput[];
} {
  const groups = {
    critical: [] as ComplianceFindingInput[],
    major: [] as ComplianceFindingInput[],
    minor: [] as ComplianceFindingInput[],
    informational: [] as ComplianceFindingInput[],
  };
  
  for (const finding of findings) {
    const severity = normalizeSeverity(finding.issueSeverity);
    groups[severity].push(finding);
  }
  
  return groups;
}

/**
 * Format findings grouped by compliance level
 */
export function groupFindingsByStatus(findings: ComplianceFindingInput[]): {
  compliant: ComplianceFindingInput[];
  partial: ComplianceFindingInput[];
  nonCompliant: ComplianceFindingInput[];
  notApplicable: ComplianceFindingInput[];
} {
  const groups = {
    compliant: [] as ComplianceFindingInput[],
    partial: [] as ComplianceFindingInput[],
    nonCompliant: [] as ComplianceFindingInput[],
    notApplicable: [] as ComplianceFindingInput[],
  };
  
  for (const finding of findings) {
    if (finding.complianceLevel === 'compliant') {
      groups.compliant.push(finding);
    } else if (finding.complianceLevel === 'partial') {
      groups.partial.push(finding);
    } else if (finding.complianceLevel === 'non-compliant') {
      groups.nonCompliant.push(finding);
    } else {
      groups.notApplicable.push(finding);
    }
  }
  
  return groups;
}
