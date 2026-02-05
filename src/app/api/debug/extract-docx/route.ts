import { NextRequest, NextResponse } from 'next/server';
import { parseDOCX } from '@/lib/documentParser';
import { extractDatesFromContent, extractSOPIdentifier } from '@/lib/dateExtractor';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Convert to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse DOCX
    const parsed = await parseDOCX(buffer);
    const content = parsed.content;

    // Extract data
    const identifier = extractSOPIdentifier(content);
    const dates = extractDatesFromContent(content);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      identifier,
      extractedDates: dates,
      contentPreview: content.substring(0, 1000), // First 1000 chars
      fullContentLength: content.length,
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
