import { readFile } from 'fs/promises';
import { parseDOCX } from './documentParser';

/**
 * Extract text from DOCX file
 */
export async function extractTextFromDOCX(input: string | Buffer): Promise<string> {
  const buffer = typeof input === 'string' ? await readFile(input) : input;
  const parsed = await parseDOCX(buffer);
  return parsed.content;
}
