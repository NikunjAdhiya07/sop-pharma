/**
 * Utility for extracting SOP identifiers from filenames
 * Supports patterns like QAGE01-10, QCMI05-15, etc.
 */

export interface SOPIdExtractionResult {
  identifier: string | null;
  department: string | null;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Extract SOP ID from filename
 * Pattern: {DEPT_CODE}{CATEGORY}{NUMBER}-{NUMBER}
 * Examples: QAGE01-10, QCMI05-15, PRAA02-08
 */
export function extractSOPIdFromFilename(filename: string): SOPIdExtractionResult {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.(pdf|docx?|txt)$/i, '');
  
  // Pattern 1: Exact match for department-based codes (QAGE01-10 style)
  // Format: 2-4 uppercase letters + 2 uppercase letters + 2 digits + hyphen + 2 digits
  const exactPattern = /\b([A-Z]{2,4}[A-Z]{2}\d{2}-\d{2})\b/;
  const exactMatch = nameWithoutExt.match(exactPattern);
  
  if (exactMatch && exactMatch[1]) {
    const identifier = exactMatch[1].toUpperCase();
    const deptCode = identifier.substring(0, 2);
    
    return {
      identifier,
      department: mapDepartmentCode(deptCode),
      confidence: 'high'
    };
  }
  
  // Pattern 2: More flexible pattern with separators
  // Matches: QA-GE-01-10, QA_GE_01_10, etc.
  const flexiblePattern = /\b([A-Z]{2,4}[-_]?[A-Z]{2}[-_]?\d{2}[-_]\d{2})\b/;
  const flexibleMatch = nameWithoutExt.match(flexiblePattern);
  
  if (flexibleMatch && flexibleMatch[1]) {
    // Normalize to standard format (remove underscores, standardize hyphens)
    const normalized = flexibleMatch[1]
      .replace(/_/g, '')
      .replace(/([A-Z]{2,4}[A-Z]{2})(\d{2})(\d{2})/, '$1$2-$3')
      .toUpperCase();
    
    const deptCode = normalized.substring(0, 2);
    
    return {
      identifier: normalized,
      department: mapDepartmentCode(deptCode),
      confidence: 'medium'
    };
  }
  
  // Pattern 3: Look for any code-like pattern in the filename
  const generalPattern = /\b([A-Z]{2,6}\d{2,4}[-_]?\d{2,4})\b/;
  const generalMatch = nameWithoutExt.match(generalPattern);
  
  if (generalMatch && generalMatch[1]) {
    const identifier = generalMatch[1].toUpperCase();
    
    return {
      identifier,
      department: null,
      confidence: 'low'
    };
  }
  
  return {
    identifier: null,
    department: null,
    confidence: 'low'
  };
}

/**
 * Map department code to full department name
 */
function mapDepartmentCode(code: string): string | null {
  const departmentMap: Record<string, string> = {
    'QA': 'QA',
    'QC': 'QC',
    'MI': 'MICROBIOLOGY',
    'PR': 'PRODUCTION',
    'ST': 'STORE',
    'BS': 'STORE', // Bulk Store
    'EN': 'ENGINEERING AND MAINTENANCE',
    'PE': 'PERSONNEL',
  };
  
  return departmentMap[code.toUpperCase()] || null;
}

/**
 * Validate if a string looks like a valid SOP identifier
 */
export function isValidSOPIdentifier(identifier: string): boolean {
  // Must have at least 2 letters, 2 digits, and a hyphen
  const validPattern = /^[A-Z]{2,6}\d{2,4}-\d{2,4}$/;
  return validPattern.test(identifier);
}

/**
 * Extract SOP ID from folder name
 * Useful when filename doesn't contain the ID
 */
export function extractSOPIdFromFolderName(folderName: string): string | null {
  const result = extractSOPIdFromFilename(folderName);
  return result.identifier;
}
