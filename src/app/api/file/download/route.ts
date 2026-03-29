import { NextRequest, NextResponse } from 'next/server';

/** Typo tolerance: some links use /api/file/download instead of /api/files/download */
export async function GET(request: NextRequest) {
  const u = request.nextUrl.clone();
  u.pathname = '/api/files/download';
  return NextResponse.redirect(u, 308);
}
