import { readFile, unlink, readdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { persistUploadPath } from '@/lib/persistUploadPath';

/**
 * Folder-based uploads under uploads/sops/… — binaries are written so
 * serve-docx / view-docx / download can resolve files on disk.
 */

const UPLOADS_BASE = path.join(process.cwd(), 'uploads', 'sops');

/**
 * Save file under uploads/sops/{folderPath}/ and return the web-relative path (leading segment uploads/...).
 */
export async function saveFileToFolder(
  fileBuffer: Buffer,
  folderPath: string,
  filename: string
): Promise<string> {
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const rel = path.join('uploads', 'sops', folderPath, sanitizedFilename).replace(/\\/g, '/');
  await persistUploadPath(rel, fileBuffer);
  return rel;
}

/**
 * Get file from folder
 */
export async function getFileFromFolder(
  folderPath: string,
  filename: string
): Promise<Buffer | null> {
  const filePath = path.join(UPLOADS_BASE, folderPath, filename);

  if (!existsSync(filePath)) {
    return null;
  }

  return await readFile(filePath);
}

/**
 * Delete file from folder
 */
export async function deleteFileFromFolder(
  folderPath: string,
  filename: string
): Promise<boolean> {
  const filePath = path.join(UPLOADS_BASE, folderPath, filename);

  if (!existsSync(filePath)) {
    return false;
  }

  await unlink(filePath);
  return true;
}

/**
 * List all files in a folder
 */
export async function listFilesInFolder(folderPath: string): Promise<string[]> {
  const fullPath = path.join(UPLOADS_BASE, folderPath);

  if (!existsSync(fullPath)) {
    return [];
  }

  const files = await readdir(fullPath);
  return files.filter((file) => !file.startsWith('.'));
}

/**
 * Check if folder exists
 */
export function folderExists(folderPath: string): boolean {
  const fullPath = path.join(UPLOADS_BASE, folderPath);
  return existsSync(fullPath);
}

/**
 * Get full system path for a folder
 */
export function getFullFolderPath(folderPath: string): string {
  return path.join(UPLOADS_BASE, folderPath);
}

/**
 * Parse folder path to extract department and subfolder info
 */
export interface FolderPathInfo {
  department: string;
  subfolders: string[];
  level: number;
  parentFolder: string | null;
  fullPath: string;
}

export function parseFolderPath(folderPath: string): FolderPathInfo {
  const parts = folderPath.split('/').filter((p) => p.length > 0);

  return {
    department: parts[0] || '',
    subfolders: parts.slice(1),
    level: parts.length - 1,
    parentFolder: parts.length > 1 ? parts[parts.length - 2] : null,
    fullPath: folderPath,
  };
}
