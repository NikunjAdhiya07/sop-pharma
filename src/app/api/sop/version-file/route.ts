import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import connectDB from '@/lib/mongodb';
import SOPVersionArtifacts from '@/models/SOPVersionArtifacts';
import SOP from '@/models/SOP';
import { uploadToBunny } from '@/lib/bunnyStorage';

function bunnyConfigured(): boolean {
  return Boolean(
    (process.env.BUNNY_STORAGE_ZONE || process.env.BUNNY_STORAGE_ZONE_NAME) &&
    (process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY) &&
    (process.env.BUNNY_PULL_ZONE_URL || process.env.BUNNY_CDN_HOSTNAME),
  );
}
import { normalizeSopIdentifierKey } from '@/lib/sopIdentifierNormalize';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDeptFolder(dept: string): string {
  return (dept || 'General').replace(/[^a-zA-Z0-9-_]/g, '_');
}

function padVersionSuffix(v: number): string {
  const w = Math.max(2, String(v).length);
  return String(v).padStart(w, '0');
}

/**
 * Look up the canonical (highest-revision) identifier for a base across SOP registry +
 * existing SOPVersionArtifacts. Mirrors the logic in /api/sop/folder-upload so single-file
 * uploads attach to the same row the dashboard joins against.
 */
async function resolveCanonicalIdentifier(
  base: string,
  uploadedVersion: number,
  language: 'English' | 'Gujarati',
): Promise<{ identifier: string; department: string | null }> {
  const b = base.toUpperCase();
  const baseLetters = b.match(/^([A-Z]+)/)?.[1] ?? b;
  const baseDigits = b.slice(baseLetters.length);
  const baseDigitsInt = parseInt(baseDigits, 10);
  const baseRx = Number.isFinite(baseDigitsInt)
    ? new RegExp(`^${escapeRegex(baseLetters)}0*${baseDigitsInt}-\\d+$`, 'i')
    : new RegExp(`^${escapeRegex(b)}-\\d+$`, 'i');

  let maxS = uploadedVersion;
  let department: string | null = null;

  const artifactRows = await SOPVersionArtifacts.find({ identifier: { $regex: baseRx } })
    .select('identifier department')
    .lean();
  for (const r of artifactRows) {
    const id = String((r as any).identifier || '');
    const m = id.match(/-(\d+)$/i);
    if (m) maxS = Math.max(maxS, parseInt(m[1], 10));
    if (!department && (r as any).department) department = String((r as any).department);
  }

  const registryRows = await SOP.find({ identifier: { $regex: baseRx } })
    .select('identifier department')
    .lean();
  for (const r of registryRows) {
    const id = String((r as any).identifier || '');
    const m = id.match(/-(\d+)$/i);
    if (m) maxS = Math.max(maxS, parseInt(m[1], 10));
    if (!department && (r as any).department) department = String((r as any).department);
  }

  const w = Math.max(2, String(maxS).length, String(uploadedVersion).length);
  return {
    identifier: normalizeSopIdentifierKey(`${b}-${String(maxS).padStart(w, '0')}`),
    department,
  };
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    if (!bunnyConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Bunny Storage is not configured.' },
        { status: 503 },
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const sopIdRaw = String(formData.get('sopId') || '').trim().toUpperCase();
    const versionRaw = String(formData.get('version') || '').trim();
    const langRaw = String(formData.get('language') || '').trim();
    const deptOverride = String(formData.get('department') || '').trim();

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ success: false, error: 'No file uploaded.' }, { status: 400 });
    }
    if (!sopIdRaw) {
      return NextResponse.json({ success: false, error: 'Missing sopId (e.g. PRAA05 or PRAA05-05).' }, { status: 400 });
    }
    const version = parseInt(versionRaw, 10);
    if (!Number.isFinite(version) || version < 0) {
      return NextResponse.json({ success: false, error: 'Version must be a non-negative integer.' }, { status: 400 });
    }
    const language: 'English' | 'Gujarati' = langRaw === 'Gujarati' ? 'Gujarati' : 'English';

    const baseMatch = sopIdRaw.match(/^([A-Z]+\d+)(?:-\d+)?$/i);
    if (!baseMatch) {
      return NextResponse.json(
        { success: false, error: `Invalid SOP id "${sopIdRaw}". Expected like PRAA05 or PRAA05-05.` },
        { status: 400 },
      );
    }
    const base = baseMatch[1].toUpperCase();

    const fileName = file.name || `file-${Date.now()}`;
    const ext: 'docx' | 'pdf' | null = fileName.toLowerCase().endsWith('.pdf')
      ? 'pdf'
      : fileName.toLowerCase().endsWith('.docx') || fileName.toLowerCase().endsWith('.doc')
        ? 'docx'
        : null;
    if (!ext) {
      return NextResponse.json(
        { success: false, error: 'Only .docx, .doc, or .pdf files are accepted.' },
        { status: 400 },
      );
    }

    const { identifier: canonical, department: discoveredDept } = await resolveCanonicalIdentifier(
      base,
      version,
      language,
    );
    const department = deptOverride || discoveredDept || 'General';

    const deptSeg = normalizeDeptFolder(department);
    const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9.-]/g, '_');
    const subFolder = `${deptSeg}/${base}-${padVersionSuffix(version)}`;
    const bunnyPath = `${subFolder}/${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const cdn = await uploadToBunny(buffer, bunnyPath);
    if (!cdn) {
      return NextResponse.json(
        { success: false, error: 'Bunny upload failed (check credentials/zone).' },
        { status: 502 },
      );
    }
    const storedPath = cdn.startsWith('http') ? cdn : cdn.replace(/^\/+/, '');

    const existing = await SOPVersionArtifacts.findOne({ identifier: canonical, language }).lean<any>();
    const entries: { version: number; docxPath?: string; pdfPath?: string }[] = Array.isArray(existing?.entries)
      ? [...existing.entries]
      : [];

    const idx = entries.findIndex((e) => Number(e.version) === version);
    if (idx >= 0) {
      const cur = entries[idx];
      entries[idx] = {
        version,
        docxPath: ext === 'docx' ? storedPath : cur.docxPath,
        pdfPath: ext === 'pdf' ? storedPath : cur.pdfPath,
      };
    } else {
      entries.push({
        version,
        docxPath: ext === 'docx' ? storedPath : undefined,
        pdfPath: ext === 'pdf' ? storedPath : undefined,
      });
    }
    entries.sort((a, b) => Number(b.version) - Number(a.version));

    const saved = await SOPVersionArtifacts.findOneAndUpdate(
      { identifier: canonical, language },
      { $set: { identifier: canonical, language, department, entries } },
      { upsert: true, new: true },
    ).lean<any>();

    try { await invalidateDashboardSopsCache(); } catch { /* best effort */ }

    return NextResponse.json({
      success: true,
      identifier: canonical,
      language,
      version,
      ext,
      storedPath,
      department,
      entries: saved?.entries ?? entries,
    });
  } catch (err) {
    console.error('[sop-version-file] failure:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Internal error' },
      { status: 500 },
    );
  }
}
