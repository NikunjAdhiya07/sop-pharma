import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingSlide from '@/models/TrainingSlide';
import { uploadToBunny } from '@/lib/bunnyStorage';
import { buildTrainingSlidePath } from '@/lib/trainingBunnyPaths';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';
import { normalizeSopIdentifierKey } from '@/lib/sopIdentifierNormalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Hard cap matches the videos endpoint (2 GB). PDFs are usually <50 MB. */
const MAX_SLIDE_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Best-effort parse of SOP code + language hint from a slide filename like
 * `QAGE74-2_brief_slides.pdf` or `qage05-03 explainer guj.pdf`.
 */
function inferMetaFromFileName(name: string): {
  sopNo?: string;
  language?: 'English' | 'Gujarati';
} {
  const stem = name.replace(/\.[^.]+$/, '');
  const m = stem.match(/([A-Z]{2,6}\d{1,4}-\d{1,3})/i);
  const sopNo = m ? normalizeSopIdentifierKey(m[1].toUpperCase()) : undefined;
  let language: 'English' | 'Gujarati' | undefined;
  if (/[઀-૿]/.test(stem) || /\b(guj|gujarati)\b/i.test(stem)) language = 'Gujarati';
  else if (/\b(eng|english)\b/i.test(stem)) language = 'English';
  return { sopNo, language };
}

/** GET — basic list (used by future Training Content slide tab). */
export async function GET(req: NextRequest) {
  await connectDB();
  const url = new URL(req.url);
  const department = url.searchParams.get('department') || '';
  const sopNo = url.searchParams.get('sopNo') || '';
  const q: Record<string, any> = { active: true };
  if (department) q.department = department;
  if (sopNo) q.sopNo = sopNo;
  const items = await TrainingSlide.find(q).sort({ createdAt: -1 }).limit(200).lean();
  return NextResponse.json({ items, total: items.length });
}

/** POST — multipart/form-data:
 *    - slide   (File, required) — PDF
 *    - title, sopNo, department, language, description (optional)
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const form = await req.formData();
    const file = form.get('slide');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing slide file' }, { status: 400 });
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'pdf') {
      return NextResponse.json({ error: 'Only PDF slides are supported.' }, { status: 400 });
    }
    if (file.size > MAX_SLIDE_BYTES) {
      return NextResponse.json({ error: 'PDF too large.' }, { status: 400 });
    }

    const inferred = inferMetaFromFileName(file.name);
    const fileStem = file.name.replace(/\.[^.]+$/, '');
    const title = String(form.get('title') || '').trim() || fileStem || 'Untitled slide';
    const department = String(form.get('department') || '').trim() || 'General';
    const sopNoRaw = String(form.get('sopNo') || '').trim();
    const sopNo = sopNoRaw || inferred.sopNo || '';
    const version = String(form.get('version') || '').trim();
    const description = String(form.get('description') || '').trim();
    const explicitLang = String(form.get('language') || '').trim() as 'English' | 'Gujarati' | '';
    const language = explicitLang || inferred.language;

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = buildTrainingSlidePath({
      department,
      sopNo,
      version,
      fileName: file.name,
    });
    const cdnUrl = await uploadToBunny(buffer, storagePath);
    if (!cdnUrl) {
      return NextResponse.json({ error: 'Bunny upload failed' }, { status: 502 });
    }

    const doc = await TrainingSlide.create({
      title,
      department,
      sopNo: sopNo || undefined,
      version: version || undefined,
      description: description || undefined,
      language,
      bunnyCdnUrl: cdnUrl,
      storagePath,
      fileName: file.name,
      fileType: 'pdf',
      mimeType: file.type || 'application/pdf',
      sizeBytes: file.size,
      uploadedByName: String(form.get('uploadedByName') || '').trim() || undefined,
    });

    // Dashboard Slides capsule reads training-slide counts → invalidate cache.
    try { await invalidateDashboardSopsCache(); } catch { /* best effort */ }

    return NextResponse.json({ ok: true, slide: doc }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[training-content/slides POST]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
