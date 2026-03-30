import { NextRequest, NextResponse } from 'next/server';
import { verifyViewerToken } from '@/lib/viewerToken';
import { loadWordDocumentBuffer } from '@/lib/loadStoredFileBuffer';
import mammoth from 'mammoth';
import { extractDocumentBodyHtmlFromDocx } from '@/lib/docxHeaderExtractor';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { sopIdentifierMatchFilter } from '@/lib/sopIdentifierNormalize';
import { buildTemplateHeaderHtml, type TemplateHeaderData } from '@/lib/templateHeaderBuilder';
import {
  extractSubcategoryFromIdentifier,
  getDepartmentForSubcategory,
  getSubcategoryName,
} from '@/lib/mcqTreeBuilder';
import { extractDatesFromContent } from '@/lib/dateExtractor';

function deriveSupersedes(identifier: string): string {
  const match = identifier.match(/^(.*?)-(\d+)$/);
  if (!match) return '';
  const ver = parseInt(match[2], 10);
  if (ver <= 0) return 'NEW';
  return `${match[1]}-${String(ver - 1).padStart(match[2].length, '0')}`;
}

function normalizeDept(d: string): string {
  if (!d) return 'Other';
  const l = d.toLowerCase();
  if (l.includes('micro')) return 'Microbiology';
  if (l.includes('engineer')) return 'Engineering and Maintenance';
  if (l.includes('person') || l.includes('hr')) return 'Personnel';
  if (l.includes('store')) return 'Store';
  if (l.includes('prod')) return 'Production';
  if (l === 'qa' || l.includes('quality assurance')) return 'QA';
  if (l === 'qc' || l.includes('quality control')) return 'QC';
  return d;
}

const DEPT_DISPLAY: Record<string, string> = {
  QA: 'QUALITY ASSURANCE', QC: 'QUALITY CONTROL',
  Microbiology: 'MICROBIOLOGY', Production: 'PRODUCTION', Store: 'STORE',
  'Engineering and Maintenance': 'ENGINEERING AND MAINTENANCE', Personnel: 'PERSONNEL',
};

async function buildHeaderHtml(identifier: string, language: string, buffer: Buffer): Promise<string> {
  try {
    await connectDB();
    const lang = language === 'Gujarati' ? 'Gujarati' : 'English';
    const sop = await SOP.findOne({ ...sopIdentifierMatchFilter(identifier), language: lang })
      .select('name identifier department effectiveDate reviewDate expiryDate').lean() as any;
    const master = await MasterSOPRepository.findOne(sopIdentifierMatchFilter(identifier, 'sopIdentifier'))
      .select('metadata.effectiveDate metadata.reviewDate metadata.expiryDate').lean() as any;

    const sub = extractSubcategoryFromIdentifier(identifier);
    const dept = normalizeDept(getDepartmentForSubcategory(sub));
    const area = getSubcategoryName(sub);

    // Extract live dates from DOCX text as fallback
    const { extractTextFromDOCX } = await import('@/lib/docxExtractor');
    let docxText = '';
    try { docxText = (await extractTextFromDOCX(buffer)) || ''; } catch { /* ignore */ }
    const liveDates = extractDatesFromContent(docxText);

    const meta: TemplateHeaderData = {
      department: DEPT_DISPLAY[dept] ?? dept.toUpperCase(),
      area: area.toUpperCase(),
      sopNo: sop?.identifier ?? identifier,
      effectiveDate: master?.metadata?.effectiveDate ?? sop?.effectiveDate ?? liveDates.effectiveDate ?? '',
      reviewDate: master?.metadata?.reviewDate ?? sop?.reviewDate ?? master?.metadata?.expiryDate ?? sop?.expiryDate ?? liveDates.reviewDate ?? liveDates.expiryDate ?? '',
      supersedes: deriveSupersedes(sop?.identifier ?? identifier),
      subject: sop?.name ?? '',
    };
    // Convert Date objects to ISO strings
    if (meta.effectiveDate instanceof Date) meta.effectiveDate = (meta.effectiveDate as Date).toISOString();
    if (meta.reviewDate instanceof Date) meta.reviewDate = (meta.reviewDate as Date).toISOString();

    return buildTemplateHeaderHtml(meta);
  } catch {
    return '';
  }
}

async function convertBufferToHtml(buffer: Buffer, identifier: string | null, language: string): Promise<string> {
  // Try DOCX body extraction first (preserves layout better)
  let bodyHtml = '';
  try {
    const docxBody = await extractDocumentBodyHtmlFromDocx(buffer);
    if (docxBody?.trim()) bodyHtml = docxBody;
  } catch { /* ignore */ }

  if (!bodyHtml) {
    try {
      const result = await mammoth.convertToHtml({ buffer });
      bodyHtml = result.value;
    } catch {
      bodyHtml = '<p>Could not extract document content.</p>';
    }
  }

  if (!identifier) return bodyHtml;

  const headerHtml = await buildHeaderHtml(identifier, language, buffer);
  return headerHtml ? `${headerHtml}${bodyHtml}` : bodyHtml;
}

/**
 * GET /api/files/docx-to-html?t=<token>
 * Server fetches the file (for non-CDN paths).
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('t');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const payload = verifyViewerToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 });

    const buffer = await loadWordDocumentBuffer(
      (payload.path || '').trim(),
      payload.identifier?.trim() || null,
      payload.language,
    );
    if (!buffer) return NextResponse.json({ error: 'File not found on server' }, { status: 404 });

    const html = await convertBufferToHtml(buffer, payload.identifier?.trim() || null, payload.language || 'English');
    return NextResponse.json({ success: true, html }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (error) {
    console.error('docx-to-html GET error:', error);
    return NextResponse.json({ error: 'Failed to convert document' }, { status: 500 });
  }
}

/**
 * POST /api/files/docx-to-html?identifier=...&language=...
 * Browser sends the raw DOCX bytes (fetched directly from CDN).
 * Used when server cannot reach CDN but browser can.
 */
export async function POST(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const identifier = sp.get('identifier')?.trim() || null;
    const language = sp.get('language') || 'Gujarati';

    const arrayBuffer = await request.arrayBuffer();
    if (!arrayBuffer.byteLength) {
      return NextResponse.json({ error: 'Empty file body' }, { status: 400 });
    }
    const buffer = Buffer.from(arrayBuffer);

    const html = await convertBufferToHtml(buffer, identifier, language);
    return NextResponse.json({ success: true, html }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (error) {
    console.error('docx-to-html POST error:', error);
    return NextResponse.json({ error: 'Failed to convert document' }, { status: 500 });
  }
}
