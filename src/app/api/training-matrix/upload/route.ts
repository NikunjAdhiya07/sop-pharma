import { NextRequest, NextResponse } from 'next/server';
import { parseDocxMatrix, parseExcelMatrix, saveMatrixEntries } from '@/lib/matrixParser';
import connectDB from '@/lib/mongodb';
import MatrixEntry from '@/models/MatrixEntry';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const clearAll = formData.get('clearAll') === 'true';
    await connectDB();

    let cleared = false;
    if (clearAll) {
      const del = await MatrixEntry.deleteMany({});
      console.log(`🗑️ Cleared MatrixEntry collection: ${del.deletedCount} docs deleted`);
      cleared = true;
    }

    let totalSuccess = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];
    const results: Array<{ fileName: string; success: number; failed: number }> = [];

    for (const file of files) {
      console.log(`📂 Processing: ${file.name}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      const lower = file.name.toLowerCase();

      let entries;
      try {
        if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
          entries = await parseExcelMatrix(buffer, file.name);
        } else {
          // .docx or .doc
          entries = await parseDocxMatrix(buffer, file.name);
        }
        console.log(`  → Parsed ${entries.length} √-marked entries`);
      } catch (parseErr: any) {
        console.error(`  ✗ Parse failed: ${parseErr.message}`);
        allErrors.push(`${file.name}: ${parseErr.message}`);
        results.push({ fileName: file.name, success: 0, failed: 1 });
        totalFailed++;
        continue;
      }

      const { success, failed, errors } = await saveMatrixEntries(entries, file.name);
      console.log(`  ✅ Saved ${success} entries, ❌ Failed ${failed} entries`);
      if (errors.length > 0) console.error(`  Errors:`, errors.slice(0, 3));
      totalSuccess += success;
      totalFailed += failed;
      allErrors.push(...errors);
      results.push({ fileName: file.name, success, failed });

      if (files.length > 1) await new Promise(r => setTimeout(r, 300));
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalFiles: files.length,
        totalSuccess,
        totalFailed,
        cleared,
      },
      results,
      errors: allErrors.slice(0, 10),
    });

  } catch (error: any) {
    console.error('Upload API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
