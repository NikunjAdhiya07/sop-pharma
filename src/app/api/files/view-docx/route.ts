import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import mammoth from 'mammoth';

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

    // Construct absolute path
    const absolutePath = path.join(process.cwd(), filePath);

    // Check if file exists
    try {
      await fs.access(absolutePath);
    } catch {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    // Read the DOCX file
    const buffer = await fs.readFile(absolutePath);

    // Convert DOCX to HTML using mammoth
    const result = await mammoth.convertToHtml({ buffer });

    return NextResponse.json({
      success: true,
      html: result.value,
      messages: result.messages, // Any warnings or errors from conversion
    });

  } catch (error) {
    console.error('Error viewing DOCX:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to view document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
