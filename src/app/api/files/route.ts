import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// GET - Serve uploaded files
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json(
        { success: false, error: 'File path is required' },
        { status: 400 }
      );
    }

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
