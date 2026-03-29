import { NextRequest, NextResponse } from 'next/server';
import {
  resolvePublicDocUrl,
  getOrigin,
  isOriginPublicForViewer,
  canOfficeOnlineFetchDocumentUrl,
} from '@/lib/viewerHelper';

const OFFICE_VIEW = 'https://view.officeapps.live.com/op/view.aspx';
const OFFICE_EMBED = 'https://view.officeapps.live.com/op/embed.aspx';
const GOOGLE_VIEWER = 'https://docs.google.com/gview?url=';

/**
 * GET ?identifier=...&language=... or ?path=...
 * Returns Office and Google viewer URLs for embedding (e.g. in iframe).
 * Requires a public app URL (NEXT_PUBLIC_APP_URL) for viewers to load the document.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const identifier = searchParams.get('identifier');
    const language = searchParams.get('language');
    const pathParam = searchParams.get('path');

    const result = await resolvePublicDocUrl(request, identifier, language, pathParam);
    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    const { publicUrl } = result;

    /** Primary: Word Online full viewer (matches original layout). */
    const officeViewerUrl = `${OFFICE_VIEW}?src=${encodeURIComponent(publicUrl)}`;
    const officeUrl = officeViewerUrl;
    const officeEmbedUrl = `${OFFICE_EMBED}?src=${encodeURIComponent(publicUrl)}`;
    const googleViewerUrl = `${GOOGLE_VIEWER}${encodeURIComponent(publicUrl)}&embedded=true`;

    const origin = getOrigin(request);
    const isPublic = isOriginPublicForViewer(origin);

    // canOfficeOnlineFetchDocumentUrl checks whether the URL is HTTPS + non-localhost.
    // We also verify the file actually exists at that URL (HEAD request) so Office Online
    // doesn't get a valid-looking URL that returns 404 ("File not found" inside the iframe).
    let canUseOfficeViewer = canOfficeOnlineFetchDocumentUrl(publicUrl);
    if (canUseOfficeViewer) {
      try {
        const headRes = await fetch(publicUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });
        if (!headRes.ok) canUseOfficeViewer = false;
      } catch {
        canUseOfficeViewer = false;
      }
    }

    return NextResponse.json({
      success: true,
      publicDocumentUrl: publicUrl,
      officeViewerUrl,
      officeUrl,
      officeEmbedUrl,
      googleUrl: googleViewerUrl,
      googleViewerUrl,
      defaultUrl: officeViewerUrl,
      isPublic,
      canUseOfficeViewer,
      message: !canUseOfficeViewer
        ? 'File not found on CDN or not publicly accessible — using in-browser preview.'
        : undefined,
    });
  } catch (error) {
    console.error('viewer-url error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get viewer URL' },
      { status: 500 }
    );
  }
}
