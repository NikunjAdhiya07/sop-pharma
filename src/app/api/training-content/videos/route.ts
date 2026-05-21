import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingVideo from '@/models/TrainingVideo';
import { uploadToBunny } from '@/lib/bunnyStorage';
import {
  ALLOWED_VIDEO_EXT,
  ALLOWED_VIDEO_MIME,
  MAX_VIDEO_BYTES,
  buildTrainingThumbnailPath,
  buildTrainingVideoPath,
  detectVideoTypeFromName,
} from '@/lib/trainingBunnyPaths';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';
import { normalizeSopIdentifierKey } from '@/lib/sopIdentifierNormalize';

/**
 * Best-effort parse of SOP code, brief/explainer kind, and language hint from a
 * filename like `QAGE74-2_BRIEF.mp4`, `qage05-03 explainer guj.mp4`, etc. This
 * is what links a lean training-video upload back into the dashboard's "Videos"
 * capsule without asking the user to fill in metadata.
 */
function inferMetaFromFileName(name: string): {
  sopNo?: string;
  videoKind?: 'brief' | 'explainer';
  language?: 'English' | 'Gujarati';
} {
  const stem = name.replace(/\.[^.]+$/, '');
  const m = stem.match(/([A-Z]{2,6}\d{1,4}-\d{1,3})/i);
  const sopNo = m ? normalizeSopIdentifierKey(m[1].toUpperCase()) : undefined;

  // Use non-letter separators (so `_GUJ-`, `-BRIEF.`, `MAGE07-04_GUJ-Brief`
  // all match). \b treats `_` as a word char, which silently broke detection
  // for header-style names like `MAGE07-04_GUJ-Brief`.
  const sep = '(?:^|[^A-Za-z])';
  const sepEnd = '(?:$|[^A-Za-z])';
  const lower = stem.toLowerCase();
  let videoKind: 'brief' | 'explainer' | undefined;
  if (new RegExp(`${sep}brief${sepEnd}`, 'i').test(lower)) videoKind = 'brief';
  else if (new RegExp(`${sep}explainer${sepEnd}`, 'i').test(lower)) videoKind = 'explainer';

  let language: 'English' | 'Gujarati' | undefined;
  if (/[઀-૿]/.test(stem) || new RegExp(`${sep}(guj|gujarati)${sepEnd}`, 'i').test(stem)) language = 'Gujarati';
  else if (new RegExp(`${sep}(eng|english)${sepEnd}`, 'i').test(stem)) language = 'English';

  return { sopNo, videoKind, language };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** GET /api/training-content/videos
 *  Query: department, sopNo, version, fileType, search, dateFrom, dateTo, page, pageSize
 */
export async function GET(req: NextRequest) {
  await connectDB();
  const url = new URL(req.url);
  const department = url.searchParams.get('department') || '';
  const sopNo = url.searchParams.get('sopNo') || '';
  const version = url.searchParams.get('version') || '';
  const fileType = url.searchParams.get('fileType') || '';
  const search = url.searchParams.get('search') || '';
  const dateFrom = url.searchParams.get('dateFrom') || '';
  const dateTo = url.searchParams.get('dateTo') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)));

  const q: Record<string, any> = { active: true };
  if (department) q.department = department;
  if (sopNo) q.sopNo = sopNo;
  if (version) q.version = version;
  if (fileType) q.fileType = fileType;
  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ title: re }, { sopNo: re }, { description: re }, { designation: re }];
  }
  if (dateFrom || dateTo) {
    q.createdAt = {};
    if (dateFrom) q.createdAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      q.createdAt.$lte = d;
    }
  }

  const [items, total] = await Promise.all([
    TrainingVideo.find(q)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    TrainingVideo.countDocuments(q),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}

/** POST /api/training-content/videos
 *  multipart/form-data:
 *    - video        (File, required)
 *    - thumbnail    (File, optional)
 *    - title, department, designation, sopNo, version, description (text)
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const form = await req.formData();
    const file = form.get('video');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing video file' }, { status: 400 });
    }

    // Metadata is now optional. Title defaults to the filename stem and
    // department defaults to "General" so the bulk-video upload flow only
    // needs the file itself (and an optional thumbnail). We also try to recover
    // SOP code / brief-or-explainer / language from the filename so the
    // uploaded row counts toward the matching SOP's Videos slots on the
    // dashboard automatically.
    const rawTitle = String(form.get('title') || '').trim();
    const fileStem = file.name.replace(/\.[^.]+$/, '');
    const inferred = inferMetaFromFileName(file.name);
    const title = rawTitle || fileStem || 'Untitled video';
    const department = String(form.get('department') || '').trim() || 'General';
    const designation = String(form.get('designation') || '').trim();
    const sopNoRaw = String(form.get('sopNo') || '').trim();
    const sopNo = sopNoRaw || inferred.sopNo || '';
    const version = String(form.get('version') || '').trim();
    const description = String(form.get('description') || '').trim();

    const ext = detectVideoTypeFromName(file.name);
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${ALLOWED_VIDEO_EXT.join(', ')}` },
        { status: 400 },
      );
    }
    if (file.type && !ALLOWED_VIDEO_MIME.has(file.type)) {
      // mime is advisory; some browsers omit it for .mov — allow if extension is OK
    }
    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: `File too large. Max ${MAX_VIDEO_BYTES / (1024 * 1024 * 1024)} GB.` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = buildTrainingVideoPath({
      department,
      sopNo,
      version,
      fileName: file.name,
    });
    const cdnUrl = await uploadToBunny(buffer, storagePath);
    if (!cdnUrl) {
      return NextResponse.json({ error: 'Bunny upload failed' }, { status: 502 });
    }

    let thumbnailUrl: string | undefined;
    let thumbnailStoragePath: string | undefined;
    const thumb = form.get('thumbnail');
    if (thumb instanceof File && thumb.size > 0) {
      const thumbBuf = Buffer.from(await thumb.arrayBuffer());
      const tPath = buildTrainingThumbnailPath({
        department,
        sopNo,
        version,
        fileName: thumb.name,
      });
      const tUrl = await uploadToBunny(thumbBuf, tPath);
      if (tUrl) {
        thumbnailUrl = tUrl;
        thumbnailStoragePath = tPath;
      }
    }

    const doc = await TrainingVideo.create({
      title,
      department,
      designation: designation || undefined,
      sopNo: sopNo || undefined,
      version: version || undefined,
      description: description || undefined,
      videoKind: inferred.videoKind,
      language: inferred.language,
      bunnyCdnUrl: cdnUrl,
      storagePath,
      thumbnailUrl,
      thumbnailStoragePath,
      fileName: file.name,
      fileType: ext,
      mimeType: file.type || `video/${ext}`,
      sizeBytes: file.size,
      uploadedByName: String(form.get('uploadedByName') || '').trim() || undefined,
    });

    // Dashboard Videos capsule reads training-video counts → invalidate the
    // 5-minute sops cache so the next dashboard fetch picks up this upload.
    try { await invalidateDashboardSopsCache(); } catch { /* best effort */ }

    return NextResponse.json({ ok: true, video: doc }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[training-content/videos POST]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
