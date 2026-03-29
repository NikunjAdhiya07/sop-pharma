import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

/**
 * Writes binary data under process.cwd() using the same relative layout as stored fileUrl
 * (e.g. /uploads/sops/Dept/file.docx → cwd/uploads/sops/Dept/file.docx) so
 * resolveFilePath, serve-docx, and view-docx can open the file.
 */
export async function persistUploadPath(webPath: string, buffer: Buffer): Promise<void> {
  const rel = webPath.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!rel || rel.includes('..')) {
    throw new Error('Invalid upload path');
  }
  const dest = path.join(process.cwd(), rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buffer);
}
