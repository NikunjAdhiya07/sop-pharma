/**
 * Extract dates from SOP document content
 * Looks for common date patterns in SOP documents
 */

interface ExtractedDates {
  effectiveDate?: Date;
  reviewDate?: Date;
  expiryDate?: Date;
  version?: string;
}

/**
 * Parse date from various formats commonly found in SOPs
 */
function parseSOPDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Remove common prefixes
  dateStr = dateStr.trim();

  // Try different date formats
  const formats = [
    // DD/MM/YYYY
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    // DD-MM-YYYY
    /(\d{1,2})-(\d{1,2})-(\d{4})/,
    // YYYY-MM-DD
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    // DD.MM.YYYY
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      // Check if it's YYYY-MM-DD format
      if (match[1].length === 4) {
        const date = new Date(`${match[1]}-${match[2]}-${match[3]}`);
        if (!isNaN(date.getTime())) return date;
      } else {
        // DD/MM/YYYY or DD-MM-YYYY format
        const day = parseInt(match[1]);
        const month = parseInt(match[2]) - 1; // JS months are 0-indexed
        const year = parseInt(match[3]);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) return date;
      }
    }
  }

  return null;
}

/**
 * Extract dates from SOP document content
 */
export function extractDatesFromContent(content: string): ExtractedDates {
  const extracted: ExtractedDates = {};

  // Normalize content - convert to lowercase for matching
  const normalizedContent = content.toLowerCase();

  // Common patterns for date fields in SOPs
  const patterns = {
    effective: [
      // With colon or whitespace separator
      /eff(?:ective)?\.?\s*date[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
      // Table format without colon
      /eff\.?\s+date\s+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
      /effective\s*from[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
      /date\s*of\s*issue[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
      /issue\s*date[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
    ],
    review: [
      // With colon or whitespace separator
      /review\.?\s*(?:dt|date)[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
      // Table format without colon
      /review\s+dt\.?\s+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
      /next\s*review[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
      /review\s*due[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
      /date\s*of\s*review[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
    ],
    expiry: [
      /expir(?:y|ation)\.?\s*date[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
      /expiry\s+date\s+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
      /valid\s*until[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
      /valid\s+until\s+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i,
    ],
    version: [
      /version[:\s]+([0-9]+\.?[0-9]*)/i,
      /ver\.?[:\s]+([0-9]+\.?[0-9]*)/i,
      /revision[:\s]+([0-9]+\.?[0-9]*)/i,
      /rev\.?[:\s]+([0-9]+\.?[0-9]*)/i,
    ],
  };

  // Extract effective date
  for (const pattern of patterns.effective) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const date = parseSOPDate(match[1]);
      if (date) {
        extracted.effectiveDate = date;
        break;
      }
    }
  }

  // Extract review date
  for (const pattern of patterns.review) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const date = parseSOPDate(match[1]);
      if (date) {
        extracted.reviewDate = date;
        break;
      }
    }
  }

  // Extract expiry date
  for (const pattern of patterns.expiry) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const date = parseSOPDate(match[1]);
      if (date) {
        extracted.expiryDate = date;
        break;
      }
    }
  }

  // Extract version
  for (const pattern of patterns.version) {
    const match = content.match(pattern);
    if (match && match[1]) {
      extracted.version = match[1];
      break;
    }
  }

  return extracted;
}

/**
 * Extract SOP identifier from content
 */
export function extractSOPIdentifier(content: string): string | null {
  // First, try to find the exact pattern QAGE01-10 style (most specific)
  const specificPattern = /\b([A-Z]{2,4}[A-Z]{2}\d{2}-\d{2})\b/;
  const specificMatch = content.match(specificPattern);
  if (specificMatch && specificMatch[1]) {
    return specificMatch[1].toUpperCase();
  }

  // Try patterns with labels
  const patterns = [
    /sop\s*(?:no|number|#|identifier)?\.?[:\s]+([A-Z]{2,4}[A-Z0-9\-]+\d+)/i,
    /(?:code|identifier)\.?[:\s]+([A-Z]{2,4}[A-Z0-9\-]+\d+)/i,
    /document\s*(?:no|number|#)\.?[:\s]+([A-Z]{2,4}[A-Z0-9\-]+\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      // Validate it's not just random text
      const identifier = match[1].toUpperCase();
      // Must contain at least one digit and one hyphen
      if (/\d/.test(identifier) && identifier.includes('-')) {
        return identifier;
      }
    }
  }

  return null;
}

