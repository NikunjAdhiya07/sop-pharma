import { NextRequest, NextResponse } from 'next/server';
import {
  resolvePublicDocUrl,
  getOrigin,
  canOfficeOnlineFetchDocumentUrl,
} from '@/lib/viewerHelper';

const OFFICE_VIEWER = 'https://view.officeapps.live.com/op/view.aspx';
const GOOGLE_VIEWER = 'https://docs.google.com/gview?url=';

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
