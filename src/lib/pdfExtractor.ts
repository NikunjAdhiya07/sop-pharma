import { readFile } from 'fs/promises';
import { parsePDF } from './documentParser';

/**
 * Extract text from PDF file
 */
export async function extractTextFromPDF(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const parsed = await parsePDF(buffer);
  return parsed.content;
}
