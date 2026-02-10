import { createWorker } from 'tesseract.js';
import fs from 'fs';
import pdf from 'pdf-parse';

/**
 * OCR Processor for Guideline PDFs
 * Handles both scanned and digital PDFs
 */

export interface OCRResult {
  text: string;
  isScanned: boolean;
  confidence: number;
  pageCount: number;
  processingTimeMs: number;
}

/**
 * Determine if a PDF is scanned (needs OCR) or digital (has text layer)
 */
async function isScannedPDF(buffer: Buffer): Promise<boolean> {
  try {
    const data = await pdf(buffer);
    const textLength = data.text.trim().length;
    const pageCount = data.numpages;
    
    // If less than 50 characters per page on average, it's likely scanned
    const avgCharsPerPage = textLength / pageCount;
    return avgCharsPerPage < 50;
  } catch (error) {
    console.error('Error checking PDF type:', error);
    return true; // Default to scanned if we can't determine
  }
}

/**
 * Extract text from digital PDF (has text layer)
 */
async function extractTextFromDigitalPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from digital PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

/**
 * Perform OCR on scanned PDF
 */
async function performOCR(buffer: Buffer): Promise<{ text: string; confidence: number }> {
  const worker = await createWorker('eng');
  
  try {
    // Convert PDF to images and perform OCR
    // Note: Tesseract.js works with images, so we need to convert PDF pages to images
    // For now, we'll use a simplified approach
    
    const { data: { text, confidence } } = await worker.recognize(buffer);
    
    await worker.terminate();
    
    return { text, confidence };
  } catch (error) {
    await worker.terminate();
    console.error('OCR processing error:', error);
    throw new Error('Failed to perform OCR on PDF');
  }
}

/**
 * Main OCR processing function
 * Automatically detects if PDF is scanned or digital and processes accordingly
 */
export async function processGuidelinePDF(pdfBuffer: Buffer): Promise<OCRResult> {
  const startTime = Date.now();
  
  try {
    // Step 1: Check if PDF is scanned or digital
    const isScanned = await isScannedPDF(pdfBuffer);
    
    let text = '';
    let confidence = 100;
    let pageCount = 1;
    
    if (isScanned) {
      // Step 2a: Perform OCR for scanned PDFs
      console.log('Detected scanned PDF, performing OCR...');
      const ocrResult = await performOCR(pdfBuffer);
      text = ocrResult.text;
      confidence = ocrResult.confidence;
    } else {
      // Step 2b: Extract text directly from digital PDF
      console.log('Detected digital PDF, extracting text...');
      text = await extractTextFromDigitalPDF(pdfBuffer);
      
      // Get page count
      const pdfData = await pdf(pdfBuffer);
      pageCount = pdfData.numpages;
    }
    
    const processingTimeMs = Date.now() - startTime;
    
    return {
      text: text.trim(),
      isScanned,
      confidence,
      pageCount,
      processingTimeMs,
    };
  } catch (error) {
    console.error('Error processing guideline PDF:', error);
    throw error;
  }
}

/**
 * Normalize extracted text
 * Remove noise, fix common OCR errors, standardize formatting
 */
export function normalizeText(text: string): string {
  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove headers/footers patterns (common in regulatory docs)
    .replace(/Page \d+ of \d+/gi, '')
    .replace(/\d+\s*\/\s*\d+/g, '')
    // Fix common OCR errors
    .replace(/\bl\b/g, '1') // lowercase l -> 1 in numbers
    .replace(/\bO\b/g, '0') // uppercase O -> 0 in numbers
    // Standardize line breaks
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Trim
    .trim();
}

/**
 * Extract structured clauses from guideline text
 * Identifies clause numbers, titles, and content
 */
export interface GuidelineClause {
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  keywords: string[];
}

export function extractClauses(text: string, guidelineName: string): GuidelineClause[] {
  const clauses: GuidelineClause[] = [];
  
  // Common patterns for guideline clauses
  const patterns = [
    // Pattern 1: "5.2.1 Documentation Requirements"
    /(\d+(?:\.\d+)*)\s+([A-Z][^\n]+)/g,
    // Pattern 2: "Section A.3: Quality Control"
    /Section\s+([A-Z]\.?\d*):?\s*([^\n]+)/gi,
    // Pattern 3: "Clause 12 - Manufacturing Process"
    /Clause\s+(\d+)\s*[-–]\s*([^\n]+)/gi,
    // Pattern 4: "Article 5.2 Quality Assurance"
    /Article\s+(\d+(?:\.\d+)*)\s+([^\n]+)/gi,
  ];
  
  // Try each pattern
  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    
    for (const match of matches) {
      const clauseNumber = match[1];
      const clauseTitle = match[2]?.trim() || 'Untitled';
      
      // Extract text for this clause (until next clause or end)
      const startIndex = match.index || 0;
      const nextMatch = text.slice(startIndex + match[0].length).search(/(\d+(?:\.\d+)*)\s+[A-Z]|Section\s+[A-Z]|Clause\s+\d+/);
      const endIndex = nextMatch === -1 ? text.length : startIndex + match[0].length + nextMatch;
      
      const clauseText = text.slice(startIndex, endIndex).trim();
      
      // Extract keywords (simple approach: important terms)
      const keywords = extractKeywords(clauseText);
      
      clauses.push({
        clauseNumber,
        clauseTitle,
        clauseText,
        keywords,
      });
    }
    
    // If we found clauses with this pattern, stop trying others
    if (clauses.length > 0) break;
  }
  
  // If no structured clauses found, create one large clause
  if (clauses.length === 0) {
    clauses.push({
      clauseNumber: '1',
      clauseTitle: guidelineName,
      clauseText: text,
      keywords: extractKeywords(text),
    });
  }
  
  return clauses;
}

/**
 * Extract keywords from text
 * Simple approach: find important terms
 */
function extractKeywords(text: string): string[] {
  // Common important terms in pharma guidelines
  const importantTerms = [
    'quality', 'manufacturing', 'documentation', 'validation', 'qualification',
    'control', 'assurance', 'testing', 'inspection', 'audit', 'compliance',
    'procedure', 'process', 'requirement', 'standard', 'specification',
    'calibration', 'maintenance', 'training', 'personnel', 'equipment',
    'material', 'storage', 'handling', 'contamination', 'hygiene',
    'record', 'report', 'review', 'approval', 'authorization',
    'deviation', 'corrective', 'preventive', 'investigation', 'monitoring',
  ];
  
  const keywords: string[] = [];
  const lowerText = text.toLowerCase();
  
  for (const term of importantTerms) {
    if (lowerText.includes(term)) {
      keywords.push(term);
    }
  }
  
  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Identify guideline type from text content
 */
export function identifyGuidelineType(text: string, fileName: string): string {
  const lowerText = text.toLowerCase();
  const lowerFileName = fileName.toLowerCase();
  
  // Check for common guideline types
  if (lowerText.includes('ich q7') || lowerFileName.includes('ich q7')) {
    return 'ICH Q7 - GMP for Active Pharmaceutical Ingredients';
  }
  if (lowerText.includes('fda') && lowerText.includes('21 cfr')) {
    return 'FDA 21 CFR Part 211 - GMP for Finished Pharmaceuticals';
  }
  if (lowerText.includes('who gmp') || lowerFileName.includes('who')) {
    return 'WHO GMP Guidelines';
  }
  if (lowerText.includes('iso') && lowerText.includes('9001')) {
    return 'ISO 9001 - Quality Management';
  }
  if (lowerText.includes('iso') && lowerText.includes('13485')) {
    return 'ISO 13485 - Medical Devices';
  }
  if (lowerText.includes('schedule m')) {
    return 'Schedule M - GMP for Pharmaceuticals (India)';
  }
  
  return 'Generic Regulatory Guideline';
}

/**
 * Categorize guideline based on content
 */
export function categorizeGuideline(text: string): string {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('quality control') || lowerText.includes('testing') || lowerText.includes('laboratory')) {
    return 'Quality Control';
  }
  if (lowerText.includes('quality assurance')) {
    return 'Quality Assurance';
  }
  if (lowerText.includes('manufacturing') || lowerText.includes('production')) {
    return 'Manufacturing';
  }
  if (lowerText.includes('documentation') || lowerText.includes('record')) {
    return 'Documentation';
  }
  if (lowerText.includes('equipment') || lowerText.includes('calibration') || lowerText.includes('maintenance')) {
    return 'Equipment & Maintenance';
  }
  if (lowerText.includes('personnel') || lowerText.includes('training')) {
    return 'Personnel & Training';
  }
  if (lowerText.includes('storage') || lowerText.includes('material')) {
    return 'Storage & Material Handling';
  }
  
  return 'General Compliance';
}
