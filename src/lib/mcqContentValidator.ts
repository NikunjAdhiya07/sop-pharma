import { IMCQ } from '@/models/MCQBank';

/**
 * Extract page/section reference from sopReference field
 */
function extractReference(sopReference: string): {
  type: 'page' | 'section' | 'unknown';
  value: string;
} {
  // Try to match page reference (e.g., "Page 04-11", "Page 4-11")
  const pageMatch = sopReference.match(/Page\s+(\d+-\d+)/i);
  if (pageMatch) {
    return { type: 'page', value: pageMatch[1] };
  }
  
  // Try to match section reference (e.g., "Section 4.4.2", "Section X.Y")
  const sectionMatch = sopReference.match(/Section\s+([\d.]+|[A-Z]\.[\d.]+)/i);
  if (sectionMatch) {
    return { type: 'section', value: sectionMatch[1] };
  }
  
  return { type: 'unknown', value: sopReference };
}

/**
 * Check if a page reference exists in SOP content
 * This is a simplified check - in production, you might want more sophisticated validation
 */
function validatePageReference(pageRef: string, sopContent: string): boolean {
  // Check if the page reference appears in the content
  // This is a basic check - you might want to enhance this based on your SOP structure
  const patterns = [
    new RegExp(`Page\\s+${pageRef}`, 'i'),
    new RegExp(`${pageRef}`, 'i'),
  ];
  
  return patterns.some(pattern => pattern.test(sopContent));
}

/**
 * Check if a section reference exists in SOP content
 */
function validateSectionReference(sectionRef: string, sopContent: string): boolean {
  const patterns = [
    new RegExp(`Section\\s+${sectionRef.replace('.', '\\.')}`, 'i'),
    new RegExp(`${sectionRef.replace('.', '\\.')}`, 'i'),
    new RegExp(`\\b${sectionRef.replace('.', '\\.')}\\b`, 'i'),
  ];
  
  return patterns.some(pattern => pattern.test(sopContent));
}

/**
 * Validate MCQ references against current SOP content
 * Returns indices of MCQs with invalid/outdated references
 * 
 * CONSERVATIVE APPROACH: Only flags references that are clearly invalid
 * to avoid false positives
 */
export async function validateMCQReferences(
  mcqs: IMCQ[],
  sopContent: string
): Promise<Array<{
  index: number;
  reason: string;
  reference: string;
}>> {
  const invalidMCQs: Array<{
    index: number;
    reason: string;
    reference: string;
  }> = [];
  
  for (let i = 0; i < mcqs.length; i++) {
    const mcq = mcqs[i];
    const ref = extractReference(mcq.sopReference);
    
    let isValid = true; // Default to valid unless proven otherwise
    let reason = '';
    
    // Only validate if we can clearly parse the reference
    if (ref.type === 'page') {
      isValid = validatePageReference(ref.value, sopContent);
      if (!isValid) {
        // Double-check: also verify the question content doesn't appear in SOP
        const contentValid = validateMCQContent(mcq, sopContent, 0.3); // Lower threshold
        if (contentValid) {
          // If content is valid, don't mark as invalid even if page ref is missing
          isValid = true;
        } else {
          reason = `Page reference "${ref.value}" not found and question content not in current SOP`;
        }
      }
    } else if (ref.type === 'section') {
      isValid = validateSectionReference(ref.value, sopContent);
      if (!isValid) {
        // Double-check with content validation
        const contentValid = validateMCQContent(mcq, sopContent, 0.3);
        if (contentValid) {
          isValid = true;
        } else {
          reason = `Section reference "${ref.value}" not found and question content not in current SOP`;
        }
      }
    }
    // For unknown reference formats, assume valid (don't remove)
    
    if (!isValid && reason) {
      invalidMCQs.push({
        index: i,
        reason,
        reference: mcq.sopReference,
      });
    }
  }
  
  return invalidMCQs;
}

/**
 * Check if MCQ content appears in SOP
 * This is a more aggressive check - validates if the question's core content exists in SOP
 */
export function validateMCQContent(
  mcq: IMCQ,
  sopContent: string,
  threshold: number = 0.5
): boolean {
  // Extract key terms from the question (remove common words)
  const commonWords = new Set([
    'what', 'which', 'how', 'when', 'where', 'who', 'why',
    'is', 'are', 'was', 'were', 'the', 'a', 'an', 'in', 'on', 'at',
    'to', 'for', 'of', 'with', 'by', 'from', 'should', 'must',
  ]);
  
  const questionWords = mcq.question
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3 && !commonWords.has(word));
  
  // Check how many key terms appear in the SOP
  const sopLower = sopContent.toLowerCase();
  const matchingWords = questionWords.filter(word => sopLower.includes(word));
  
  const matchRatio = matchingWords.length / questionWords.length;
  
  return matchRatio >= threshold;
}
