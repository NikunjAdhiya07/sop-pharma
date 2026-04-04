import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SupersedeSOPVersion from '@/models/SupersedeSOPVersion';
import { normalizeSopIdentifierKey } from '@/lib/sopIdentifierNormalize';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const sopNo = normalizeSopIdentifierKey(String(body?.sopNo || '').trim().toUpperCase());
    const language = String(body?.lang || '') === 'Gujarati' ? 'Gujarati' : 'English';
    const version = parseInt(String(body?.version ?? ''), 10);
    const docxPath = body?.docxPath ? String(body.docxPath).trim() : undefined;
    const pdfPath = body?.pdfPath ? String(body.pdfPath).trim() : undefined;
    const createdBy = body?.createdBy ? String(body.createdBy).trim() : undefined;

    if (!sopNo || !Number.isFinite(version) || version < 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid sopNo/version' },
        { status: 400 },
      );
    }

    await SupersedeSOPVersion.findOneAndUpdate(
      { sopNo, language, version },
      {
        $set: {
          sopNo,
          language,
          version,
          docxPath,
          pdfPath,
          createdBy,
        },
      },
      { upsert: true, new: true },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('supersede-version POST failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to persist supersede version' },
      { status: 500 },
    );
  }
}
