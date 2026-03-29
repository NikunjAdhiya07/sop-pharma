import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { resolveDualDocxPaths } from '@/lib/dualSopDocxPaths';

/**
 * GET ?identifier=MAGE04-05
 * Returns English / Gujarati DOCX paths for side-by-side in-app preview.
 */
export async function GET(request: NextRequest) {
  try {
    const identifier = request.nextUrl.searchParams.get('identifier')?.trim();
    if (!identifier) {
      return NextResponse.json({ success: false, error: 'Missing identifier' }, { status: 400 });
    }

    await connectDB();
    const paths = await resolveDualDocxPaths(identifier);

    if (!paths) {
      return NextResponse.json({ success: false, error: 'Invalid identifier' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      identifier: paths.identifier,
      englishPath: paths.englishPath,
      gujaratiPath: paths.gujaratiPath,
      hasDualDocx: Boolean(paths.englishPath && paths.gujaratiPath),
    });
  } catch (e) {
    console.error('dual-docx-info error:', e);
    return NextResponse.json({ success: false, error: 'Failed to resolve paths' }, { status: 500 });
  }
}
