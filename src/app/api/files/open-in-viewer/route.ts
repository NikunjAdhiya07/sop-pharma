import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { signViewerToken } from '@/lib/viewerToken';
import { sopIdentifierMatchFilter } from '@/lib/sopIdentifierNormalize';
import { extractBunnyPath, getBunnyCdnUrl } from '@/lib/bunnyStorage';
const OFFICE_VIEWER = 'https://view.officeapps.live.com/op/view.aspx';
const GOOGLE_VIEWER = 'https://docs.google.com/gview?url=';

export function getOrigin(request: NextRequest): string {
  // Use explicit public URL so Office Online Viewer can reach serve-docx (viewer fetches from internet)
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (explicit) {
    const base = explicit.startsWith('http') ? explicit : `https://${explicit}`;
    return base.replace(/\/$/, '');
  }
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const proto = request.headers.get('x-forwarded-proto') || (request.nextUrl?.protocol?.replace(':', '') || 'https');
  return `${proto === 'https' ? 'https' : 'http'}://${host}`;
}

/** True if the document URL would be reachable by Office/Google viewer (public HTTPS, not localhost). */
export function isOriginPublicForViewer(origin: string): boolean {
  if (!origin || !origin.startsWith('https://')) return false;
  const host = origin.replace(/^https:\/\//, '').split('/')[0].toLowerCase();
  return !host.startsWith('localhost') && host !== '127.0.0.1' && !host.endsWith('.local');
}

/** Microsoft Office Online can fetch the document (HTTPS, not pointing at localhost). */
export function canOfficeOnlineFetchDocumentUrl(publicUrl: string): boolean {
  if (!publicUrl || !/^https:\/\//i.test(publicUrl)) return false;
  return !/localhost|127\.0\.0\.1/i.test(publicUrl);
}

function looksGujarati(sop: any): boolean {
  if (sop.language === 'Gujarati') return true;
  const name = (sop.name || '') + (sop.originalFileName || '');
  const url = sop.fileUrl || '';
  const folder = sop.folderPath || '';
  if (/[\u0A80-\u0AFF]{4,}/.test(name)) return true;
  if (/(^|[\/\\\s_-])guj([\/\\\s_-]|$)/i.test(url) || /gujarati/i.test(url)) return true;
  if (/(^|[\/\\\s_-])guj([\/\\\s_-]|$)/i.test(folder) || /gujarati/i.test(folder)) return true;
  return false;
}

/** Resolve file URL and build public document URL (Bunny CDN or signed serve-docx). */
export async function resolvePublicDocUrl(
  request: NextRequest,
  identifier: string | null,
  language: string | null,
  pathParam: string | null
): Promise<{ publicUrl: string } | { error: string; status: number }> {
  let fileUrl: string | null = null;

  // Comprehensive resolution: checks SOPLibrary + SOP, verifies reachability (Bunny CDN, local disk, https).
  // This ensures Office Online gets the best available URL rather than a stale SOP.fileUrl.
  if (identifier || pathParam) {
    const { resolveDocxPathForViewer } = await import('@/lib/loadStoredFileBuffer');
    const pathTrim = pathParam ? pathParam.replace(/^\/+/, '') : null;
    const resolved = await resolveDocxPathForViewer(identifier, language || undefined, pathTrim);
    if (resolved) {
      fileUrl = resolved;
    }
  }

  // Fallback: direct SOP query (handles PDFs and cases where resolveDocxPathForViewer finds nothing)
  if (!fileUrl) {
    if (identifier) {
      await connectDB();

      const allSops = await SOP.find(sopIdentifierMatchFilter(identifier))
        .select('fileUrl language name originalFileName folderPath')
        .lean();

      const wantGujarati = language === 'Gujarati';
      const target = wantGujarati
        ? allSops.find(s => looksGujarati(s))
        : allSops.find(s => !looksGujarati(s)) || allSops[0];

      if (target?.fileUrl) {
        fileUrl = (target as any).fileUrl;
      } else if (pathParam) {
        fileUrl = pathParam.replace(/^\/+/, '');
      }
    } else if (pathParam) {
      fileUrl = pathParam.replace(/^\/+/, '');
    }
  }

  if (!fileUrl) {
    return { error: 'Document not found', status: 404 };
  }

  let publicUrl: string;
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    publicUrl = fileUrl;
  } else if (fileUrl.startsWith('bunny://')) {
    /** Word Online can fetch the pull-zone URL directly — better than proxying through serve-docx. */
    const cdn = getBunnyCdnUrl(extractBunnyPath(fileUrl));
    if (cdn) {
      publicUrl = cdn;
    } else {
      const origin = getOrigin(request);
      const token = signViewerToken({ path: fileUrl });
      publicUrl = `${origin}/api/files/serve-docx?t=${encodeURIComponent(token)}`;
    }
  } else {
    const origin = getOrigin(request);
    const token = signViewerToken({ path: fileUrl });
    publicUrl = `${origin}/api/files/serve-docx?t=${encodeURIComponent(token)}`;
  }

  return { publicUrl };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const identifier = searchParams.get('identifier');
    const language = searchParams.get('language');
    const pathParam = searchParams.get('path');
    const viewer = searchParams.get('viewer'); // 'office' | 'google' (default: office)
    const force = searchParams.get('force'); // 'office' | 'google' = try external viewer even on localhost

    const result = await resolvePublicDocUrl(request, identifier, language, pathParam);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { publicUrl } = result;

    const origin = getOrigin(request);
    const officeCanFetch = canOfficeOnlineFetchDocumentUrl(publicUrl);

    // Office Online cannot load non-HTTPS or localhost document URLs → in-app preview
    if (!force && !officeCanFetch) {
      const inApp = new URL('/dashboard/view-doc', origin);
      if (identifier) inApp.searchParams.set('identifier', identifier);
      if (language) inApp.searchParams.set('language', language);
      if (pathParam) inApp.searchParams.set('path', pathParam);
      return NextResponse.redirect(inApp.toString(), 302);
    }

    const useGoogle = viewer === 'google' || force === 'google';
    const viewerUrl = useGoogle
      ? `${GOOGLE_VIEWER}${encodeURIComponent(publicUrl)}&embedded=true`
      : `${OFFICE_VIEWER}?src=${encodeURIComponent(publicUrl)}`;

    return NextResponse.redirect(viewerUrl, 302);
  } catch (error) {
    console.error('open-in-viewer error:', error);
    return NextResponse.json({ error: 'Failed to open viewer' }, { status: 500 });
  }
}
