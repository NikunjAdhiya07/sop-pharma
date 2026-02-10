import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { isBunnyPath, getBunnyCdnUrl, extractBunnyPath, checkBunnyFileExists } from '@/lib/bunnyStorage';

// GET - Serve uploaded files (supports local and Bunny Storage)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');
    const storageType = searchParams.get('storage') || 'auto'; // 'local', 'bunny', or 'auto'

    if (!filePath) {
      return NextResponse.json(
        { success: false, error: 'File path is required' },
        { status: 400 }
      );
    }

    // Determine storage type
    const useBunny = 
      storageType === 'bunny' || 
      (storageType === 'auto' && isBunnyPath(filePath));

    if (useBunny) {
      // Handle Bunny Storage file
      const bunnyPath = extractBunnyPath(filePath);
      const cdnUrl = getBunnyCdnUrl(bunnyPath);

      if (!cdnUrl) {
        return NextResponse.json(
          { success: false, error: 'Bunny CDN not configured' },
          { status: 500 }
        );
      }

      // Check if file exists (optional, can skip for performance)
      const exists = await checkBunnyFileExists(bunnyPath);
      if (!exists) {
        return NextResponse.json(
          { success: false, error: 'File not found in Bunny Storage' },
          { status: 404 }
        );
      }

      // Redirect to CDN URL for optimal performance
      return NextResponse.redirect(cdnUrl, 302);
    }

    // Handle local file (existing logic)
    // Security: Prevent directory traversal
    if (filePath.includes('..') || filePath.startsWith('/')) {
      return NextResponse.json(
        { success: false, error: 'Invalid file path' },
        { status: 400 }
      );
    }

    const fullPath = join(process.cwd(), filePath);

    if (!existsSync(fullPath)) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    const fileBuffer = await readFile(fullPath);
    
    // Determine content type based on file extension
    const extension = filePath.split('.').pop()?.toLowerCase();
    const contentTypeMap: Record<string, string> = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'pdf': 'application/pdf',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    const contentType = contentTypeMap[extension || ''] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filePath.split('/').pop()}"`,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error: any) {
    console.error('Error serving file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to serve file', details: error.message },
      { status: 500 }
    );
  }
}
