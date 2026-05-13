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
export function parseSOPDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  dateStr = dateStr.trim();

  // Handle textual months like 12 May 2023 or 12-May-2023
  const textMonthMatch = dateStr.match(/(\d{1,2})[\s\-\.\/]+([a-zA-Z]{3,9})[\s\-\.\/]+(\d{2,4})/);
  if (textMonthMatch) {
    const day = parseInt(textMonthMatch[1], 10);
    const monthStr = textMonthMatch[2].toLowerCase();
    let year = parseInt(textMonthMatch[3], 10);
    if (year < 100) year += 2000;

    const monthMap: Record<string, number> = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11
    };

    const monthNum = Object.keys(monthMap).find(k => monthStr.startsWith(k));
    if (monthNum !== undefined) {
      const date = new Date(year, monthMap[monthNum], day);
      if (!isNaN(date.getTime())) return date;
    }
  }

  // numeric formats
  const formats = [
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4}|\d{2})/,
    /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (match[1].length === 4) {
        const date = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
        if (!isNaN(date.getTime())) return date;
      } else {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        let year = parseInt(match[3], 10);
        if (year < 100) year += 2000;
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
  // dateRegex: allow any whitespace incl. newlines between date parts, so table-cell boundary splits still match
  const dateRegex = '([0-9]{1,2}[\\/\\-\\.\\s\\n]+(?:[0-9]{1,2}|[a-zA-Z]{3,9})[\\/\\-\\.\\s\\n]+(?:[0-9]{4}|[0-9]{2}))';
  
  const patterns = {
    effective: [
      // Standard forms: EFF. DATE: / EFF DATE / EFFECTIVE DATE
      new RegExp(`eff(?:ective)?\.?\\s*date[.:\\s]+${dateRegex}`, 'i'),
      // Table split: "EFF. DATE" in one cell, date in next — flattened with space
      new RegExp(`eff\.?\\s+dt\.?\\s+${dateRegex}`, 'i'),
      new RegExp(`eff\.?\\s+date\.?\\s+${dateRegex}`, 'i'),
      // Forms with colon or no separator
      new RegExp(`effective\\s*from[.:\\s]+${dateRegex}`, 'i'),
      new RegExp(`date\\s*of\\s*issue[.:\\s]+${dateRegex}`, 'i'),
      new RegExp(`issue\\s*date[.:\\s]+${dateRegex}`, 'i'),
      new RegExp(`date\\s*of\\s*implementation[.:\\s]+${dateRegex}`, 'i'),
    ],
    review: [
      // Standard: REVIEW DT. / REVIEW DATE
      new RegExp(`review\.?\\s*(?:dt|date)\.?[.:\\s]+${dateRegex}`, 'i'),
      // Table split: "REVIEW DT." in one cell, date in next
      new RegExp(`review\\s+dt\.?\\s+${dateRegex}`, 'i'),
      new RegExp(`review\\s+date\.?\\s+${dateRegex}`, 'i'),
      new RegExp(`review\\s*dt\.?[:\\s]+${dateRegex}`, 'i'),
      new RegExp(`next\\s*review[.:\\s]+${dateRegex}`, 'i'),
      new RegExp(`review\\s*due[.:\\s]+${dateRegex}`, 'i'),
      new RegExp(`date\\s*of\\s*review[.:\\s]+${dateRegex}`, 'i'),
    ],
    expiry: [
      // Inline forms — label and date on same line
      new RegExp(`expir(?:y|ation)\.?\\s*date[.:\\s]+${dateRegex}`, 'i'),
      new RegExp(`date\\s*of\\s*expir(?:y|ation)[.:\\s]+${dateRegex}`, 'i'),
      new RegExp(`expires?\\s*(?:on)?[.:\\s]+${dateRegex}`, 'i'),
      // Table split — label in one cell, value in next (newline between)
      new RegExp(`expir(?:y|ation)\\s+date\.?\\s+${dateRegex}`, 'i'),
      new RegExp(`expir(?:y|ation)\\s+dt\.?\\s+${dateRegex}`, 'i'),
      new RegExp(`exp\.?\\s*(?:date|dt)\.?[.:\\s]+${dateRegex}`, 'i'),
      // Valid Till / Valid Upto / Valid Until (common SOP labels)
      new RegExp(`valid\\s*(?:till|upto|up\\s*to|until)[.:\\s]+${dateRegex}`, 'i'),
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

/**
 * Extract dates from a document buffer, combining the cell-aware header-table
 * parser (most reliable for SOPs with Word page headers) with the regex fallback.
 * For DOCX files, header XML files are scanned so dates in page-header tables are found.
 * Use this instead of calling extractDatesFromContent directly.
 */
export async function extractDatesFromBuffer(
  buffer: Buffer,
  fileType: 'pdf' | 'docx',
  parsedContent: string,
): Promise<ExtractedDates> {
  const dates = extractDatesFromContent(parsedContent);

  if (fileType === 'docx') {
    try {
      const { extractSOPHeaderTableData } = await import('./docxHeaderExtractor');
      const headerData = await extractSOPHeaderTableData(buffer);
      if (headerData.reviewDate && !dates.reviewDate) {
        const d = parseSOPDate(headerData.reviewDate);
        if (d) dates.reviewDate = d;
      }
      if (headerData.effDate && !dates.effectiveDate) {
        const d = parseSOPDate(headerData.effDate);
        if (d) dates.effectiveDate = d;
      }
      if (headerData.expiryDate && !dates.expiryDate) {
        const d = parseSOPDate(headerData.expiryDate);
        if (d) dates.expiryDate = d;
      }
    } catch { /* best-effort */ }
  }

  // Final fallback: many SOPs have only a review date in the header table.
  // The expiry date is conventionally the review date (the review IS the expiry of validity).
  // Only fall back when no explicit expiry label was found — keeps real expiry dates intact.
  if (!dates.expiryDate && dates.reviewDate) {
    dates.expiryDate = dates.reviewDate;
  }

  return dates;
}
