import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import mammoth from 'mammoth';
import { resolveFilePath } from '@/lib/filePathResolver';
import { extractHeaderHtmlFromDocx, extractDocumentBodyHtmlFromDocx } from '@/lib/docxHeaderExtractor';
import { isBunnyPath, fetchBunnyFile } from '@/lib/bunnyStorage';
import { buildTemplateHeaderHtml, type TemplateHeaderData } from '@/lib/templateHeaderBuilder';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import {
  extractSubcategoryFromIdentifier,
  getDepartmentForSubcategory,
  getSubcategoryName,
} from '@/lib/mcqTreeBuilder';
import { sopIdentifierMatchFilter } from '@/lib/sopIdentifierNormalize';
import { extractDatesFromContent } from '@/lib/dateExtractor';

/** Extract raw text from a DOCX buffer for live date parsing. */
async function extractTextFromDocxBuffer(buffer: Buffer): Promise<string> {
  try {
    const AdmZip = (await import('adm-zip')).default;
    const { parseStringPromise } = await import('xml2js');
    const zip = new AdmZip(buffer);
    const docXml = zip.readAsText('word/document.xml');
    if (!docXml) return '';
    const parsed = await parseStringPromise(docXml);

    // Walk the XML tree and extract w:t text nodes, joining paragraph/cell
    // boundaries with newlines so date label + value stay on adjacent lines.
    const lines: string[] = [];
    const walkParagraph = (p: any) => {
      const runs = p?.['w:r'] ?? [];
      const runList = Array.isArray(runs) ? runs : [runs];
      const parts: string[] = [];
      for (const r of runList) {
        const ts = r?.['w:t'] ?? [];
        const tList = Array.isArray(ts) ? ts : [ts];
        for (const t of tList) {
          const text = typeof t === 'string' ? t : (t?._ ?? '');
          if (text) parts.push(text);
        }
      }
      if (parts.length) lines.push(parts.join(''));
    };
    const walkBody = (body: any) => {
      if (!body || typeof body !== 'object') return;
      // Paragraphs
      for (const p of [body?.['w:p'] ?? []].flat()) walkParagraph(p);
      // Table rows → cells → paragraphs
      for (const tbl of [body?.['w:tbl'] ?? []].flat()) {
        for (const tr of [tbl?.['w:tr'] ?? []].flat()) {
          for (const tc of [tr?.['w:tc'] ?? []].flat()) {
            for (const p of [tc?.['w:p'] ?? []].flat()) walkParagraph(p);
          }
        }
      }
    };

    // Navigate w:document → w:body
    const docKey = Object.keys(parsed || {}).find(k => k === 'w:document' || k.endsWith(':document') || k === 'document');
    const docObj = docKey ? (Array.isArray(parsed[docKey]) ? parsed[docKey][0] : parsed[docKey]) : parsed;
    const bodyKey = Object.keys(docObj || {}).find(k => k === 'w:body' || k.endsWith(':body') || k === 'body');
    const body = bodyKey ? (Array.isArray(docObj[bodyKey]) ? docObj[bodyKey][0] : docObj[bodyKey]) : null;
    if (body) walkBody(body);

    return lines.join('\n');
  } catch {
    return '';
  }
}

function isoFromExtracted(d: Date | undefined): string {
  if (!d || isNaN(d.getTime())) return '';
  return d.toISOString();
}

function looksGujaratiSop(s: {
  language?: string;
  name?: string;
  originalFileName?: string;
  fileUrl?: string;
  folderPath?: string;
}): boolean {
  if (s.language === 'Gujarati') return true;
  const name = (s.name || '') + (s.originalFileName || '');
  const url = s.fileUrl || '';
  const folder = s.folderPath || '';
  if (/[\u0A80-\u0AFF]{4,}/.test(name)) return true;
  if (/(^|[/\\\s_-])guj([/\\\s_-]|$)/i.test(url) || /gujarati/i.test(url)) return true;
  if (/(^|[/\\\s_-])guj([/\\\s_-]|$)/i.test(folder) || /gujarati/i.test(folder)) return true;
  return false;
}

function normalizeDeptForDisplay(d: string): string {
  if (!d) return 'Other';
  const lower = d.toLowerCase();
  if (lower.includes('micro')) return 'Microbiology';
  if (lower.includes('engineer')) return 'Engineering and Maintenance';
  if (lower.includes('person') || lower.includes('hr')) return 'Personnel';
  if (lower.includes('store')) return 'Store';
  if (lower.includes('prod')) return 'Production';
  if (lower === 'qa' || lower.includes('quality assurance')) return 'QA';
  if (lower === 'qc' || lower.includes('quality control')) return 'QC';
  return d;
}

const DEPT_DISPLAY: Record<string, string> = {
  QA: 'QUALITY ASSURANCE',
  QC: 'QUALITY CONTROL',
  Microbiology: 'MICROBIOLOGY',
  Production: 'PRODUCTION',
  Store: 'STORE',
  'Engineering and Maintenance': 'ENGINEERING AND MAINTENANCE',
  Personnel: 'PERSONNEL',
};

function deriveSupersedes(identifier: string): string {
  const match = identifier.match(/^(.*?)-(\d+)$/);
  if (!match) return '';
  const base = match[1];
  const ver = parseInt(match[2], 10);
  if (ver <= 0) return 'NEW';
  const prev = String(ver - 1).padStart(match[2].length, '0');
  return `${base}-${prev}`;
}

async function lookupSOPMetadata(identifier: string, language?: string): Promise<TemplateHeaderData | null> {
  try {
    await connectDB();
    const lang = language === 'Gujarati' ? 'Gujarati' : 'English';

    const sop = await SOP.findOne({
      ...sopIdentifierMatchFilter(identifier),
      language: lang,
    })
      .select('name identifier department effectiveDate reviewDate expiryDate version')
      .lean() as any;

    if (!sop) return null;

    const master = await MasterSOPRepository.findOne({
      ...sopIdentifierMatchFilter(identifier, 'sopIdentifier'),
    })
      .select('metadata.effectiveDate metadata.reviewDate metadata.expiryDate')
      .lean() as any;

    const subcategoryCode = extractSubcategoryFromIdentifier(sop.identifier);
    const deptRaw = getDepartmentForSubcategory(subcategoryCode);
    const dept = normalizeDeptForDisplay(deptRaw);
    const area = getSubcategoryName(subcategoryCode);

    const effectiveDate =
      master?.metadata?.effectiveDate?.toISOString?.() ??
      master?.metadata?.effectiveDate ??
      sop.effectiveDate?.toISOString?.() ??
      sop.effectiveDate ??
      '';

    const reviewDate =
      master?.metadata?.reviewDate?.toISOString?.() ??
      master?.metadata?.reviewDate ??
      sop.reviewDate?.toISOString?.() ??
      sop.reviewDate ??
      master?.metadata?.expiryDate?.toISOString?.() ??
      master?.metadata?.expiryDate ??
      sop.expiryDate?.toISOString?.() ??
      sop.expiryDate ??
      '';

    return {
      department: DEPT_DISPLAY[dept] ?? dept.toUpperCase(),
      area: area.toUpperCase(),
      sopNo: sop.identifier,
      effectiveDate: effectiveDate ? String(effectiveDate) : '',
      reviewDate: reviewDate ? String(reviewDate) : '',
      supersedes: deriveSupersedes(sop.identifier),
      subject: sop.name ?? '',
    };
  } catch (err) {
    console.error('Error looking up SOP metadata for template header:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let filePath = searchParams.get('path')?.trim() || null;
    const identifier = searchParams.get('identifier');
    const language = searchParams.get('language'); // 'English' | 'Gujarati'

    if (!filePath && !identifier) {
      return NextResponse.json({ success: false, error: 'File path or identifier is required' }, { status: 400 });
    }

    // Explicit path from client (dashboard / dual preview) wins over DB lookup
    if (!filePath && identifier) {
      await connectDB();

      const allSops = await SOP.find(sopIdentifierMatchFilter(identifier))
        .select('fileUrl language name originalFileName folderPath')
        .lean();

      const wantGujarati = language === 'Gujarati';
      const target = wantGujarati
        ? allSops.find((s) => looksGujaratiSop(s))
        : allSops.find((s) => !looksGujaratiSop(s)) || allSops[0];

      if (target?.fileUrl) {
        filePath = (target as any).fileUrl.replace(/^\/+/, '');
      }
    }

    if (filePath) {
      filePath = filePath.replace(/^\/+/, '');
    }

    if (!filePath) {
      return NextResponse.json({ success: false, error: 'File path or identifier is required' }, { status: 400 });
    }

    let absolutePath = await resolveFilePath(filePath);
    let buffer: Buffer;

    // Build template header from DB metadata when identifier is provided (same language as document)
    let headerHtml = '';
    let dbMeta: TemplateHeaderData | null = null;
    if (identifier) {
      dbMeta = await lookupSOPMetadata(identifier, language ?? undefined);
    }

    // If not on disk, try Bunny Storage (CDN or bunny://)
    if (!absolutePath && isBunnyPath(filePath)) {
      const bunnyBuffer = await fetchBunnyFile(filePath);
      if (bunnyBuffer) {
        buffer = bunnyBuffer;
      } else {
        return NextResponse.json(
          {
            success: false,
            error: 'File not found or unavailable.',
            hint: 'Open the document via Dashboard preview (Word Online) or ensure the file exists on CDN/storage.',
          },
          { status: 404 },
        );
      }
    } else if (!absolutePath) {
      return NextResponse.json(
        {
          success: false,
          error: 'File not found. It may have been deleted after uploading.',
          hint: 'Use /dashboard/view-doc with a public HTTPS file URL or restore the file to storage.',
        },
        { status: 404 },
      );
    } else {
      buffer = await fs.readFile(absolutePath);
    }

    // Build the template header (DB dates → fallback to live extraction from DOCX text)
    if (identifier) {
      // Extract live dates from the DOCX text so we can fill in gaps from the DB
      const docxText = await extractTextFromDocxBuffer(buffer);
      const liveDates = extractDatesFromContent(docxText);

      const meta: TemplateHeaderData = dbMeta ?? {
        department: '',
        area: '',
        sopNo: identifier,
        effectiveDate: '',
        reviewDate: '',
        supersedes: deriveSupersedes(identifier),
        subject: '',
      };

      // Fill blank date slots with live-extracted values
      if (!meta.effectiveDate) {
        meta.effectiveDate = isoFromExtracted(liveDates.effectiveDate);
      }
      if (!meta.reviewDate) {
        meta.reviewDate = isoFromExtracted(liveDates.reviewDate) || isoFromExtracted(liveDates.expiryDate);
      }

      headerHtml = buildTemplateHeaderHtml(meta);
    }

    // Only fall back to the raw DOCX header when we have no identifier at all
    if (!headerHtml) {
      const docxHeader = await extractHeaderHtmlFromDocx(buffer);
      if (docxHeader) {
        headerHtml = `<div class="docx-header">${docxHeader}</div>`;
      }
    }

    // Prefer body from DOCX XML (same conversion as header) so layout matches the original; fallback to mammoth
    let bodyHtml = '';
    const docxBody = await extractDocumentBodyHtmlFromDocx(buffer);
    if (docxBody && docxBody.trim().length > 0) {
      bodyHtml = docxBody;
    } else {
      const optionsWithPreserve = {
        ignoreEmptyParagraphs: false,
        includeDefaultStyleMap: true,
        includeEmbeddedStyleMap: true,
        styleMap: [
          'p[style-name="Title"] => h1.title',
          'p[style-name="Subtitle"] => h2.subtitle',
          'r[style-name="Footnote Reference"] => sup',
          'p[style-name="Footnote Text"] => p.footnote',
        ],
      };
      try {
        const result = await mammoth.convertToHtml(
          { buffer },
          optionsWithPreserve,
        );
        bodyHtml = result.value;
      } catch {
        try {
          const result = await mammoth.convertToHtml({ buffer }, optionsWithPreserve);
          bodyHtml = result.value;
        } catch {
          const result = await mammoth.convertToHtml({ buffer });
          bodyHtml = result.value;
        }
      }
    }

    const fullHtml = headerHtml ? `${headerHtml}${bodyHtml}` : bodyHtml;

    return NextResponse.json({
      success: true,
      html: fullHtml,
      messages: [],
    });
  } catch (error) {
    console.error('Error viewing DOCX:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to view document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
