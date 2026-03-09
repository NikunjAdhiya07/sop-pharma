import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { readFile } from 'fs/promises';
import path from 'path';
import { parseDocument } from '@/lib/documentParser';

export const maxDuration = 60;

/**
 * POST /api/sop/reextract-content
 * Re-read the saved file from disk, re-parse it, and update the SOP's content in the DB.
 * This fixes SOPs where content is empty/too short due to a failed extraction at upload time.
 *
 * Body: { sopId: string }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const { sopId, sopIdentifier } = await request.json();

    if (!sopId && !sopIdentifier) {
      return NextResponse.json(
        { success: false, error: 'sopId or sopIdentifier is required' },
        { status: 400 }
      );
    }

    // Find SOP — by ID first, with identifier-based fallback
    let sop = sopId ? await SOP.findById(sopId).catch(() => null) : null;

    // If sopIdentifier is provided, check for mismatch
    if (sop && sopIdentifier &&
        sop.identifier.toUpperCase().trim() !== sopIdentifier.toUpperCase().trim()) {
      console.warn(`⚠️ reextract-content: sopId points to "${sop.identifier}" but requested identifier is "${sopIdentifier}". Falling back to identifier lookup.`);
      sop = null;
    }
    // Fallback: find by identifier
    if (!sop && sopIdentifier) {
      sop = await SOP.findOne({ identifier: sopIdentifier });
      if (sop) {
        console.log(`✅ reextract-content: Found SOP by identifier "${sopIdentifier}" (_id: ${sop._id})`);
      }
    }

    if (!sop) {
      return NextResponse.json(
        { success: false, error: 'SOP not found' },
        { status: 404 }
      );
    }

    if (!sop.fileUrl) {
      return NextResponse.json(
        { success: false, error: 'SOP has no saved file path. Please re-upload the file.' },
        { status: 400 }
      );
    }

    // fileUrl is like "/uploads/sops/QA/QAGE01-11_1234567890.pdf"
    // Resolve to absolute path on disk
    const absoluteFilePath = path.join(process.cwd(), sop.fileUrl);
    console.log(`🔄 Re-extracting content for SOP ${sop.identifier} from: ${absoluteFilePath}`);

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(absoluteFilePath);
    } catch (readErr: any) {
      console.error('❌ File not found on disk:', absoluteFilePath);
      return NextResponse.json(
        {
          success: false,
          error: `File not found on disk: "${sop.fileUrl}". Please re-upload the original SOP file.`,
          fileUrl: sop.fileUrl,
        },
        { status: 404 }
      );
    }

    console.log(`📦 File read successful, size: ${fileBuffer.length} bytes`);

    // Re-parse the document
    const parsed = await parseDocument(fileBuffer, sop.fileType as 'pdf' | 'docx');
    const newContent = parsed.content.trim();

    if (!newContent || newContent.length < 100) {
      return NextResponse.json(
        {
          success: false,
          error: `Re-extraction yielded only ${newContent.length} characters. The file may be a scanned image PDF with no selectable text. Please re-upload a text-based version or a DOCX.`,
          extractedLength: newContent.length,
          preview: newContent.substring(0, 200),
        },
        { status: 422 }
      );
    }

    // Update the SOP content in DB
    const oldLength = sop.content?.length || 0;
    sop.content = newContent;
    sop.status = 'uploaded'; // Reset to allow re-generation
    sop.metadata = {
      ...sop.metadata,
      fileSize: fileBuffer.length,
      wordCount: parsed.metadata.wordCount,
      pageCount: parsed.metadata.pageCount,
    };
    await sop.save();

    console.log(`✅ Content re-extracted: ${oldLength} chars → ${newContent.length} chars`);

    return NextResponse.json({
      success: true,
      message: `Content re-extracted successfully. ${oldLength} chars → ${newContent.length} chars (${parsed.metadata.wordCount} words).`,
      sopId: sop._id,
      sopIdentifier: sop.identifier,
      oldLength,
      newLength: newContent.length,
      wordCount: parsed.metadata.wordCount,
      preview: newContent.substring(0, 300),
    });

  } catch (error: any) {
    console.error('[ReextractContent] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
