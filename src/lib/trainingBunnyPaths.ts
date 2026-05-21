/**
 * Path helpers for the Training Content module.
 *
 * Required layout in Bunny Storage:
 *   /training/videos/{department}/{sop_no}/{version}/<timestamp>-<filename>
 *   /training/slides/{department}/{sop_no}/{version}/<timestamp>-<filename>
 *   /training/thumbnails/{department}/{sop_no}/{version}/<timestamp>-<filename>
 */

function sanitizeSegment(input: string, fallback: string): string {
  const cleaned = (input || '').toString().trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return cleaned || fallback;
}

function sanitizeFileName(name: string): string {
  return (name || 'file').replace(/[^a-zA-Z0-9.-]+/g, '_');
}

export function buildTrainingVideoPath(opts: {
  department: string;
  sopNo?: string;
  version?: string;
  fileName: string;
}): string {
  const dept = sanitizeSegment(opts.department, 'unknown');
  const sop = sanitizeSegment(opts.sopNo || '', 'general');
  const ver = sanitizeSegment(opts.version || '', 'v0');
  const stamp = Date.now();
  const file = sanitizeFileName(opts.fileName);
  return `training/videos/${dept}/${sop}/${ver}/${stamp}-${file}`;
}

export function buildTrainingSlidePath(opts: {
  department: string;
  sopNo?: string;
  version?: string;
  fileName: string;
}): string {
  const dept = sanitizeSegment(opts.department, 'unknown');
  const sop = sanitizeSegment(opts.sopNo || '', 'general');
  const ver = sanitizeSegment(opts.version || '', 'v0');
  const stamp = Date.now();
  const file = sanitizeFileName(opts.fileName);
  return `training/slides/${dept}/${sop}/${ver}/${stamp}-${file}`;
}

export function buildTrainingThumbnailPath(opts: {
  department: string;
  sopNo?: string;
  version?: string;
  fileName: string;
}): string {
  const dept = sanitizeSegment(opts.department, 'unknown');
  const sop = sanitizeSegment(opts.sopNo || '', 'general');
  const ver = sanitizeSegment(opts.version || '', 'v0');
  const stamp = Date.now();
  const file = sanitizeFileName(opts.fileName);
  return `training/thumbnails/${dept}/${sop}/${ver}/${stamp}-${file}`;
}

export const ALLOWED_VIDEO_EXT = ['mp4', 'mov', 'webm'] as const;
export const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
]);
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export function detectVideoTypeFromName(name: string): 'mp4' | 'mov' | 'webm' | null {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'mp4') return 'mp4';
  if (ext === 'mov') return 'mov';
  if (ext === 'webm') return 'webm';
  return null;
}
