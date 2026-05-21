import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPVersionArtifacts from '@/models/SOPVersionArtifacts';
import SOP from '@/models/SOP';
import { normalizeSopIdentifierKey } from '@/lib/sopIdentifierNormalize';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(req: NextRequest) {
  await connectDB();
  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids') || '';
  const ids = idsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (!ids.length) {
    return NextResponse.json({
      usage: '/api/sop/version-artifacts-diag?ids=PRAA05-05,PRCL17-05,PRE002-03,PRPA04-05,QAGE85-05',
    });
  }

  const out: any[] = [];

  for (const id of ids) {
    const norm = normalizeSopIdentifierKey(id);
    const baseMatch = id.match(/^([A-Z]+\d+)-\d+$/i);
    const baseLetters = baseMatch?.[1].match(/^([A-Z]+)/i)?.[1] ?? '';
    const baseDigitsInt = baseMatch?.[1].slice(baseLetters.length);
    const baseRx = baseLetters && baseDigitsInt
      ? new RegExp(`^${escapeRegex(baseLetters)}0*${parseInt(baseDigitsInt, 10)}-\\d+$`, 'i')
      : new RegExp(`^${escapeRegex(id.split('-')[0])}-\\d+$`, 'i');

    const artifactRowsAny = await SOPVersionArtifacts.find({ identifier: { $regex: baseRx } })
      .select('identifier language entries department updatedAt')
      .lean();

    const registryRows = await SOP.find({ identifier: { $regex: baseRx } })
      .select('identifier language isObsolete')
      .lean();

    out.push({
      queried: id,
      normalized: norm,
      registry: registryRows.map((r: any) => ({
        identifier: r.identifier,
        language: r.language,
        isObsolete: r.isObsolete,
      })),
      versionArtifacts: artifactRowsAny.map((r: any) => ({
        identifier: r.identifier,
        normalizedIdentifier: normalizeSopIdentifierKey(String(r.identifier || '')),
        language: r.language,
        department: r.department,
        updatedAt: r.updatedAt,
        entries: (r.entries || []).map((e: any) => ({
          version: e.version,
          docxPath: e.docxPath || null,
          pdfPath: e.pdfPath || null,
        })),
      })),
    });
  }

  return NextResponse.json({ count: out.length, results: out }, { status: 200 });
}
