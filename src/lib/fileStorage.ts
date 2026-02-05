import { mkdir, writeFile, readFile, unlink, readdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

/**
 * Utility for managing folder-based file storage
 * Mirrors the department folder structure in the uploads directory
 */

const UPLOADS_BASE = path.join(process.cwd(), 'uploads', 'sops');

/**
 * Create nested folder structure
 */
export async function createFolderStructure(folderPath: string): Promise<string> {
  const fullPath = path.join(UPLOADS_BASE, folderPath);
  await mkdir(fullPath, { recursive: true });
  return fullPath;
}

/**
 * Save file to folder with mirrored structure
 */
export async function saveFileToFolder(
  fileBuffer: Buffer,
  folderPath: string,
  filename: string
): Promise<string> {
  // Create folder structure if it doesn't exist
  const fullFolderPath = await createFolderStructure(folderPath);
  
  // Sanitize filename
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  // Full file path
  const filePath = path.join(fullFolderPath, sanitizedFilename);
  
  // Write file
  await writeFile(filePath, fileBuffer);
  
  // Return relative path for database storage
  return path.join('uploads', 'sops', folderPath, sanitizedFilename).replace(/\\/g, '/');
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
  return files.filter(file => !file.startsWith('.'));
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
  const parts = folderPath.split('/').filter(p => p.length > 0);
  
  return {
    department: parts[0] || '',
    subfolders: parts.slice(1),
    level: parts.length - 1,
    parentFolder: parts.length > 1 ? parts[parts.length - 2] : null,
    fullPath: folderPath
  };
}
