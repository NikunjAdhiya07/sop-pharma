import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';

export interface SOPMetadata {
  sopIdentifier: string;
  effectiveDate: Date | null;
  reviewDate: Date | null;
  version: string | null;
}

/**
 * Parse SOP metadata directly from individual SOP DOCX files
 * This reads the actual SOP documents, not summary tables
 */
export async function parseSOPFromDOCX(buffer: Buffer, filename: string): Promise<SOPMetadata | null> {
  try {
    // Extract SOP identifier from filename (e.g., "QAGE98-04.docx" -> "QAGE98-04")
    const sopMatch = filename.match(/([A-Z]{2,6}\d{2,3}(?:-\d{2})?)/i);
    if (!sopMatch) {
      console.log(`⚠️ Could not extract SOP identifier from filename: ${filename}`);
      return null;
    }
    
    const sopIdentifier = sopMatch[1].toUpperCase();
    
    // Extract text content from DOCX
    const textContent = await extractTextFromDOCX(buffer);
    
    // Look for date patterns in the document
    const effectiveDate = extractEffectiveDate(textContent);
    const reviewDate = extractReviewDate(textContent);
    const version = extractVersion(textContent, filename);
    
    console.log(`📄 ${sopIdentifier}:`);
    if (effectiveDate) console.log(`   Effective: ${formatDate(effectiveDate)}`);
    if (reviewDate) console.log(`   Review: ${formatDate(reviewDate)}`);
    if (version) console.log(`   Version: ${version}`);
    
    return {
      sopIdentifier,
      effectiveDate,
      reviewDate,
      version
    };
  } catch (error) {
    console.error(`Error parsing ${filename}:`, error);
    return null;
  }
}

/**
 * Extract all text from DOCX file
 */
async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const zip = new AdmZip(buffer);
  const documentXml = zip.readAsText('word/document.xml');
  
  if (!documentXml) {
    throw new Error('Could not read document.xml');
  }
  
  const parsed = await parseStringPromise(documentXml);
  const body = parsed?.['w:document']?.['w:body']?.[0];
  
  if (!body) {
    return '';
  }
  
  let text = '';
  
  // Extract text from paragraphs
  const paragraphs = body['w:p'] || [];
  for (const para of paragraphs) {
    const runs = para['w:r'] || [];
    const runArray = Array.isArray(runs) ? runs : [runs];
    
    for (const run of runArray) {
      const textNodes = run['w:t'] || [];
      const textArray = Array.isArray(textNodes) ? textNodes : [textNodes];
      
      for (const textNode of textArray) {
        if (typeof textNode === 'string') {
          text += textNode + ' ';
        } else if (textNode && textNode._) {
          text += textNode._ + ' ';
        }
      }
    }
    
    text += '\n';
  }
  
  // Also extract from tables
  const tables = body['w:tbl'] || [];
  for (const table of tables) {
    const rows = table['w:tr'] || [];
    for (const row of rows) {
      const cells = row['w:tc'] || [];
      for (const cell of cells) {
        const cellText = extractCellText(cell);
        text += cellText + '\t';
      }
      text += '\n';
    }
  }
  
  return text;
}

function extractCellText(cell: any): string {
  let text = '';
  const paragraphs = cell['w:p'] || [];
  const paraArray = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
  
  for (const para of paraArray) {
    const runs = para['w:r'] || [];
    const runArray = Array.isArray(runs) ? runs : [runs];
    
    for (const run of runArray) {
      const textNodes = run['w:t'] || [];
      const textArray = Array.isArray(textNodes) ? textNodes : [textNodes];
      
      for (const textNode of textArray) {
        if (typeof textNode === 'string') {
          text += textNode;
        } else if (textNode && textNode._) {
          text += textNode._;
        }
      }
    }
  }
  
  return text.trim();
}

/**
 * Extract effective date from document text
 * Looks for patterns like "Effective Date: 10/07/2024" or "Effective: 10/07/2024"
 */
function extractEffectiveDate(text: string): Date | null {
  const patterns = [
    /Effective\s*Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /Effective\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /Issue\s*Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseDate(match[1]);
    }
  }
  
  return null;
}

/**
 * Extract review date from document text
 * Looks for patterns like "Review Date: 06/10/2026" or "Next Review: 06/10/2026"
 */
function extractReviewDate(text: string): Date | null {
  const patterns = [
    /Review\s*Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /Next\s*Review\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /Expiry\s*Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseDate(match[1]);
    }
  }
  
  return null;
}

/**
 * Extract version from document text or filename
 */
function extractVersion(text: string, filename: string): string | null {
  // Try to extract from filename first (e.g., "QAGE98-04.docx" -> "04")
  const filenameMatch = filename.match(/-(\d{2})/);
  if (filenameMatch) {
    return filenameMatch[1];
  }
  
  // Try to extract from document text
  const patterns = [
    /Version\s*:?\s*(\d+(?:\.\d+)?)/i,
    /Rev(?:ision)?\s*:?\s*(\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Parse date string in DD/MM/YYYY or DD-MM-YYYY format
 */
function parseDate(dateStr: string): Date | null {
  try {
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length !== 3) return null;
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const year = parseInt(parts[2], 10);
    
    const date = new Date(year, month, day);
    
    // Validate the date
    if (isNaN(date.getTime())) return null;
    
    return date;
  } catch {
    return null;
  }
}

/**
 * Format date for logging
 */
function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}
