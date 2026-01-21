import { readFile } from 'fs/promises';
import { parseDOCX } from './documentParser';

/**
 * Extract text from DOCX file
 */
export async function extractTextFromDOCX(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const parsed = await parseDOCX(buffer);
  return parsed.content;
}
