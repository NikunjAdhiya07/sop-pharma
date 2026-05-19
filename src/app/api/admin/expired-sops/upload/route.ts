import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';
import { recheckSopDatesFromDocx } from '@/lib/recheckSopDatesFromDocx';

export const maxDuration = 120;

// POST /api/admin/expired-sops/upload
// Form fields: sopId (required), file (DOCX, required)
// Re-extracts dates from the uploaded DOCX and updates the SOP. Does NOT
// overwrite the stored file — only updates dates in the database.
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const form = await req.formData();
    const sopId = String(form.get('sopId') || '').trim();
    const file = form.get('file');

    if (!sopId) {
      return NextResponse.json(
        { success: false, error: 'Missing sopId' },
        { status: 400 },
      );
    }
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'Missing DOCX file' },
        { status: 400 },
      );
    }
    if (!/\.docx?$/i.test(file.name)) {
      return NextResponse.json(
        { success: false, error: 'Only .docx files are supported' },
        { status: 400 },
      );
    }

    const sop = await SOP.findById(sopId).select('_id identifier').lean<any>();
    if (!sop) {
      return NextResponse.json(
        { success: false, error: 'SOP not found' },
        { status: 404 },
      );
    }

    const idUpper = String(sop.identifier || '').trim().toUpperCase();
    const masters = idUpper
      ? await MasterSOPRepository.find({ sopIdentifier: idUpper })
          .select('sopIdentifier sopDocument metadata')
          .lean<any[]>()
      : [];

    const masterByIdentifier = new Map<string, any[]>();
    if (masters.length > 0) masterByIdentifier.set(idUpper, masters);

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await recheckSopDatesFromDocx(sopId, masterByIdentifier, {
      kind: 'buffer',
      buffer,
      fileName: file.name,
    });

    if (result.status === 'updated') {
      void invalidateDashboardSopsCache();
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('[expired-sops/upload] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      },
      { status: 500 },
    );
  }
}
