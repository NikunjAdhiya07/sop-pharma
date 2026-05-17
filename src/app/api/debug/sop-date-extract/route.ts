import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { fetchBunnyFile, isBunnyPath } from '@/lib/bunnyStorage';
import { extractSOPHeaderTableData } from '@/lib/docxHeaderExtractor';
import { parseSOPDate, extractDatesFromContent } from '@/lib/dateExtractor';
import { parseDOCX } from '@/lib/documentParser';

export const maxDuration = 60;

// GET /api/debug/sop-date-extract?id=QAGE03-07
// Re-runs the DOCX date extractor against the SOP's stored file and compares
// the result with the value currently in the DB. Used to diagnose stale or
// mis-parsed review/expiry dates shown on the dashboard.
export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get('id') || '').trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing ?id=<identifier>' }, { status: 400 });
  }

  try {
    await connectDB();

    const sop = await SOP.findOne({
      identifier: new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    })
      .select('_id identifier fileUrl fileType reviewDate effectiveDate expiryDate language isObsolete sopDocuments')
      .lean<any>();

    if (!sop) {
      return NextResponse.json({ ok: false, error: `No SOP found with identifier ${id}` }, { status: 404 });
    }

    const db = {
      identifier: sop.identifier,
      fileType: sop.fileType,
      fileUrl: sop.fileUrl,
      reviewDate: sop.reviewDate ? new Date(sop.reviewDate).toISOString() : null,
      expiryDate: sop.expiryDate ? new Date(sop.expiryDate).toISOString() : null,
      effectiveDate: sop.effectiveDate ? new Date(sop.effectiveDate).toISOString() : null,
      isObsolete: !!sop.isObsolete,
    };

    // Pick a DOCX to scan: prefer the primary file, otherwise look in sopDocuments[].
    // The dashboard sees `SOP.reviewDate` regardless of which file is "primary", so
    // we need to read the DOCX even when the primary file slot holds the PDF.
    const docxUrlCandidates: string[] = [];
    if (sop.fileType === 'docx' && sop.fileUrl) docxUrlCandidates.push(sop.fileUrl);
    for (const d of sop.sopDocuments || []) {
      const isDocx =
        (d.fileType && /docx/i.test(d.fileType)) ||
        (d.fileName && /\.docx$/i.test(d.fileName)) ||
        (d.filePath && /\.docx$/i.test(d.filePath));
      if (isDocx && d.filePath) docxUrlCandidates.push(d.filePath);
    }
    // Also check MasterSOPRepository — it's the canonical store and may hold
    // the DOCX even when the SOP record was uploaded as a PDF.
    const masterDocs = await MasterSOPRepository.find({ sopIdentifier: id.toUpperCase() })
      .select('sopIdentifier language sopDocument metadata')
      .lean<any[]>();
    for (const m of masterDocs || []) {
      const p = m?.sopDocument?.filePath;
      if (p && /\.docx$/i.test(p)) docxUrlCandidates.push(p);
    }

    const docxUrl = docxUrlCandidates.find((u) => u && (isBunnyPath(u) || u.startsWith('http')));

    if (!docxUrl) {
      return NextResponse.json({
        ok: true,
        db,
        extracted: null,
        reason: 'no DOCX file available for this SOP (checked primary + sopDocuments[] + MasterSOPRepository)',
        sopDocuments: sop.sopDocuments || [],
        masterDocs: (masterDocs || []).map((m) => ({
          language: m.language,
          filePath: m?.sopDocument?.filePath,
          metadataReviewDate: m?.metadata?.reviewDate,
        })),
      });
    }

    const buffer = await fetchBunnyFile(docxUrl);
    if (!buffer) {
      return NextResponse.json({ ok: true, db, extracted: null, reason: 'failed to download DOCX from Bunny' });
    }

    const headerData = await extractSOPHeaderTableData(buffer).catch((e) => ({ __error: String(e) } as any));
    const headerReview = headerData?.reviewDate ? parseSOPDate(headerData.reviewDate) : null;
    const headerEff = headerData?.effDate ? parseSOPDate(headerData.effDate) : null;
    const headerExpiry = headerData?.expiryDate ? parseSOPDate(headerData.expiryDate) : null;

    let textExtracted: any = null;
    try {
      const parsed = await parseDOCX(buffer);
      textExtracted = extractDatesFromContent(parsed.content);
    } catch (e: any) {
      textExtracted = { __error: e?.message || String(e) };
    }

    const extracted = {
      headerTable: {
        raw: headerData,
        parsedReviewDate: headerReview ? headerReview.toISOString() : null,
        parsedEffDate: headerEff ? headerEff.toISOString() : null,
        parsedExpiryDate: headerExpiry ? headerExpiry.toISOString() : null,
      },
      textRegex: {
        reviewDate: textExtracted?.reviewDate ? new Date(textExtracted.reviewDate).toISOString() : null,
        effectiveDate: textExtracted?.effectiveDate ? new Date(textExtracted.effectiveDate).toISOString() : null,
        expiryDate: textExtracted?.expiryDate ? new Date(textExtracted.expiryDate).toISOString() : null,
        error: textExtracted?.__error || null,
      },
    };

    const recommendedReviewDate = headerReview || (textExtracted?.reviewDate ?? null);
    const diff = {
      dbReviewDate: db.reviewDate,
      docReviewDate: recommendedReviewDate ? new Date(recommendedReviewDate).toISOString() : null,
      stale:
        recommendedReviewDate &&
        db.reviewDate &&
        new Date(recommendedReviewDate).toISOString() !== db.reviewDate,
    };

    return NextResponse.json({ ok: true, db, docxUrlScanned: docxUrl, extracted, diff });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
