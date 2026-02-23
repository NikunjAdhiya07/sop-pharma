import { NextRequest, NextResponse } from 'next/server';
import { extractMatrixFromDocBuffer } from '@/lib/matrixExtractor';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const results = [];
    let totalSuccess = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];

    for (const file of files) {
      console.log(`📂 Processing file: ${file.name}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      const res = await extractMatrixFromDocBuffer(buffer, file.name);
      
      totalSuccess += res.success;
      totalFailed += res.failed;
      allErrors.push(...res.errors);
      
      results.push({
        fileName: file.name,
        success: res.success,
        failed: res.failed
      });

      // Add a small delay between files to avoid hitting API rate limits
      if (files.length > 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalFiles: files.length,
        totalSuccess,
        totalFailed,
      },
      results,
      errors: allErrors.length > 5 ? allErrors.slice(0, 5).concat([`...and ${allErrors.length - 5} more errors`]) : allErrors
    });

  } catch (error: any) {
    console.error('API Error in training matrix upload:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
