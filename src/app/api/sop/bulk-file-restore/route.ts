import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { parseDocument, validateDocumentContent } from '@/lib/documentParser';
import { resolveSopLanguageForUpload } from '@/lib/detectSopLanguage';
import crypto from 'crypto';
import { uploadToBunny, generateSOPDocumentPath } from '@/lib/bunnyStorage';
import { persistUploadPath } from '@/lib/persistUploadPath';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const identifier = formData.get('identifier') as string;
    const manualReviewDate = formData.get('reviewDate') as string | null;
    const manualEffectiveDate = formData.get('effectiveDate') as string | null;
    
    if (!file || !identifier) {
      return NextResponse.json(
        { error: 'File and identifier are required' },
        { status: 400 }
      );
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !['pdf', 'docx'].includes(fileExtension)) {
      return NextResponse.json(
        { error: 'Only PDF and DOCX files are supported' },
        { status: 400 }
      );
    }

    const fileType = fileExtension as 'pdf' | 'docx';
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    // Find the SOP first to ensure it exists
    const existingSOP = await SOP.findOne({ identifier: identifier });
    
    if (!existingSOP) {
      return NextResponse.json(
        { error: `No SOP found with identifier ${identifier}` },
        { status: 404 }
      );
    }

    // Parse document to extract text and dates
    const parsed = await parseDocument(buffer, fileType);
    const validation = validateDocumentContent(parsed.content);
    if (!validation.isValid) {
       console.warn(`[Bulk Restore] Validation failed for ${identifier}, continuing anyway. Error: ${validation.error}`);
    }

    const { extractDatesFromBuffer } = await import('@/lib/dateExtractor');
    const extractedDates = await extractDatesFromBuffer(buffer, fileType, parsed.content);

    // Upload to Bunny or Local
    const sanitizedDept = (existingSOP.department || 'General').replace(/[^a-zA-Z0-9-_]/g, '_');
    const fileName = `${identifier}_${Date.now()}.${fileExtension}`;
    let fileUrl: string = '';

    const useBunny = Boolean(
      (process.env.BUNNY_STORAGE_ZONE || process.env.BUNNY_STORAGE_ZONE_NAME) &&
      (process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY) &&
      (process.env.BUNNY_PULL_ZONE_URL || process.env.BUNNY_CDN_HOSTNAME)
    );

    if (useBunny) {
      const bunnyPath = generateSOPDocumentPath(existingSOP.department, identifier, file.name || fileName);
      const cdnUrl = await uploadToBunny(buffer, bunnyPath);
      if (cdnUrl) {
        fileUrl = cdnUrl;
      } else {
        fileUrl = `/uploads/sops/${sanitizedDept}/${fileName}`;
      }
    } else {
      fileUrl = `/uploads/sops/${sanitizedDept}/${fileName}`;
    }

    const storedRemotely =
      fileUrl.startsWith('http://') ||
      fileUrl.startsWith('https://') ||
      fileUrl.startsWith('bunny://');
      
    if (!storedRemotely) {
      try {
        await persistUploadPath(fileUrl, buffer);
      } catch (err) {
        console.error('Failed to persist to disk:', err);
      }
    }

    // Update the SOP
    // We only update the file links, content, checksum, and dates. 
    // We do NOT change mcqCount, pipelineStatus, etc.
    existingSOP.fileUrl = fileUrl;
    existingSOP.fileType = fileType;
    existingSOP.originalFileName = file.name;
    existingSOP.content = parsed.content;
    existingSOP.checksum = checksum;
    
    if (manualEffectiveDate) {
      existingSOP.effectiveDate = new Date(manualEffectiveDate);
    } else if (extractedDates.effectiveDate) {
      existingSOP.effectiveDate = extractedDates.effectiveDate;
    }

    // Only write review date if manually provided or extracted from the document
    if (manualReviewDate) {
      existingSOP.reviewDate = new Date(manualReviewDate);
    } else if (extractedDates.reviewDate) {
      existingSOP.reviewDate = extractedDates.reviewDate;
    }
    
    // Update metadata word/page count but keep other things intact
    existingSOP.metadata = {
      ...existingSOP.metadata,
      fileSize: buffer.length,
      pageCount: parsed.metadata.pageCount,
      wordCount: parsed.metadata.wordCount,
    };

    await existingSOP.save();

    invalidateDashboardSopsCache();

    const dateSource = manualReviewDate ? 'manual' : extractedDates.reviewDate ? 'extracted' : 'not-found';

    return NextResponse.json({
      success: true,
      message: 'SOP file and dates restored successfully',
      sop: {
        id: existingSOP._id,
        identifier: existingSOP.identifier,
        reviewDate: existingSOP.reviewDate,
        effectiveDate: existingSOP.effectiveDate,
        fileUrl: existingSOP.fileUrl,
        reviewDateSource: dateSource,
      }
    });

  } catch (error: any) {
    console.error('Bulk Restore API Error:', error);
    return NextResponse.json(
      { error: 'Failed to restore SOP file', details: error.message },
      { status: 500 }
    );
  }
}
