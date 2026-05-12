import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SOPGuideline from '@/models/SOPGuideline';
import User from '@/models/User'; // Required for populate
import fs from 'fs';
import path from 'path';

// Simple in-memory cache for guidelines summary (5 minute TTL)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let summaryCache: { data: any; timestamp: number } | null = null;

function getCachedSummary() {
  if (!summaryCache) return null;
  const age = Date.now() - summaryCache.timestamp;
  if (age > CACHE_TTL_MS) {
    summaryCache = null;
    return null;
  }
  return summaryCache.data;
}

function setCachedSummary(data: any) {
  summaryCache = { data, timestamp: Date.now() };
}
import {
  processGuidelinePDF,
  normalizeText,
  extractClauses,
  identifyGuidelineType,
  categorizeGuideline,
} from '@/lib/ocrProcessor';

/**
 * API Endpoint: Upload Guideline Folders with OCR
 * 
 * Accepts 4 separate guideline folders
 * Processes all PDFs with OCR (if needed)
 * Structures guideline content into clauses
 * Stores in database
 */

export async function POST(request: NextRequest) {
  console.log('📁 Starting guideline folder upload with OCR...');
  const startTime = Date.now();

  try {
    await dbConnect();

    // Parse multipart form data
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const folderName = formData.get('folderName') as string;
    const userId = formData.get('userId') as string;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    if (!folderName) {
      return NextResponse.json(
        { error: 'Folder name is required' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    console.log(`📂 Processing folder: ${folderName} with ${files.length} files`);

    const results: any[] = [];
    const errors: any[] = [];

    // Process each PDF file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = file.name;

      console.log(`\n📄 Processing file ${i + 1}/${files.length}: ${fileName}`);

      try {
        // Only process PDF files
        if (!fileName.toLowerCase().endsWith('.pdf')) {
          console.log(`⏭️ Skipping non-PDF file: ${fileName}`);
          errors.push({
            fileName,
            error: 'Only PDF files are supported',
          });
          continue;
        }

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Save file temporarily
        const tempDir = path.join(process.cwd(), 'temp', 'guidelines', folderName);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, buffer);

        console.log(`💾 File saved temporarily: ${filePath}`);

        // Step 1: OCR Processing
        console.log(`🔍 Starting OCR/text extraction...`);
        const ocrResult = await processGuidelinePDF(buffer);
        console.log(`✅ OCR completed in ${ocrResult.processingTimeMs}ms`);
        console.log(`   - Is scanned: ${ocrResult.isScanned}`);
        console.log(`   - Confidence: ${ocrResult.confidence}%`);
        console.log(`   - Text length: ${ocrResult.text.length} characters`);

        // Step 2: Normalize text
        const normalizedText = normalizeText(ocrResult.text);
        console.log(`🧹 Text normalized: ${normalizedText.length} characters`);

        // Step 3: Identify guideline type
        const guidelineType = identifyGuidelineType(normalizedText, fileName);
        console.log(`🏷️ Guideline type: ${guidelineType}`);

        // Step 4: Categorize guideline
        const category = categorizeGuideline(normalizedText);
        console.log(`📂 Category: ${category}`);

        // Step 5: Extract structured clauses
        console.log(`📋 Extracting clauses...`);
        const clauses = extractClauses(normalizedText, fileName);
        console.log(`✅ Extracted ${clauses.length} clauses`);

        // Step 6: Save to database
        const guideline = new SOPGuideline({
          name: fileName.replace('.pdf', ''),
          folderName,
          filePath,
          pdfName: fileName,
          isScanned: ocrResult.isScanned,
          ocrStatus: 'completed',
          rawText: normalizedText,
          clauses,
          guidelineType,
          category,
          uploadedBy: userId,
        });

        await guideline.save();
        console.log(`💾 Saved guideline to database: ${guideline._id}`);

        results.push({
          fileName,
          guidelineId: guideline._id,
          guidelineType,
          category,
          clauseCount: clauses.length,
          isScanned: ocrResult.isScanned,
          processingTimeMs: ocrResult.processingTimeMs,
          status: 'success',
        });
      } catch (fileError) {
        console.error(`❌ Error processing file ${fileName}:`, fileError);
        errors.push({
          fileName,
          error: (fileError as Error).message,
        });
      }
    }

    const totalTime = Date.now() - startTime;

    console.log(`\n✅ Guideline upload completed`);
    console.log(`   - Successful: ${results.length}`);
    console.log(`   - Failed: ${errors.length}`);
    console.log(`   - Total time: ${totalTime}ms`);

    // Clear cache since we added new guidelines
    summaryCache = null;
    console.log('🗑️ Cleared guidelines cache');

    return NextResponse.json({
      success: true,
      folderName,
      results,
      errors,
      summary: {
        totalFiles: files.length,
        successCount: results.length,
        errorCount: errors.length,
        totalProcessingTimeMs: totalTime,
      },
    });
  } catch (error) {
    console.error('❌ Error in guideline upload API:', error);
    return NextResponse.json(
      {
        error: 'Failed to process guideline upload',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET: Fetch all uploaded guidelines
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    void User;

    console.log('📚 GET /api/guidelines/upload called with params:', Object.fromEntries(new URL(request.url).searchParams));

    const { searchParams } = new URL(request.url);
    const serve = searchParams.get('serve');
    const id = searchParams.get('id');
    const folderName = searchParams.get('folderName');
    const category = searchParams.get('category');
    const guidelineType = searchParams.get('guidelineType');
    const isSummary = searchParams.get('summary') === 'true';

    // Serve PDF file if requested (inline viewing)
    if (serve) {
      try {
        const isValidObjectId = /^[a-f\d]{24}$/i.test(serve);
        if (!isValidObjectId) {
          return NextResponse.json({ success: false, error: 'Invalid guideline ID' }, { status: 400 });
        }

        const guideline = await SOPGuideline.findById(serve)
          .select('filePath pdfName')
          .lean();

        if (!guideline?.filePath) {
          return NextResponse.json({ success: false, error: 'Guideline file not found' }, { status: 404 });
        }

        // Check if file exists on disk
        if (!fs.existsSync(guideline.filePath)) {
          console.warn(`Guideline file missing on disk: ${guideline.filePath}`);
          return NextResponse.json({ success: false, error: 'Guideline file not found on disk' }, { status: 404 });
        }

        const fileBuffer = fs.readFileSync(guideline.filePath);
        const filename = guideline.pdfName || 'guideline.pdf';

        return new Response(fileBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${filename}"`,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      } catch (err: any) {
        console.error('Error serving guideline PDF:', err.message);
        return NextResponse.json({ success: false, error: 'Failed to serve PDF' }, { status: 500 });
      }
    }

    // Fetch individual guideline if ID is provided
    if (id) {
      try {
        const guideline = await SOPGuideline.findById(id)
          .select('name folderName pdfName guidelineType category createdAt clauses.clauseNumber clauses.clauseTitle clauses.clauseText')
          .maxTimeMS(25000)
          .lean();
          
        if (!guideline) {
          return NextResponse.json({ success: false, error: 'Guideline not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, guideline });
      } catch (err: any) {
        console.error('Error fetching guideline by ID:', err.message);
        return NextResponse.json({ success: false, error: 'Database timeout or error', details: err.message }, { status: 500 });
      }
    }

    // Build query
    const query: any = {};
    if (folderName) query.folderName = folderName;
    if (category) query.category = category;
    if (guidelineType) query.guidelineType = guidelineType;

    // For summary, check cache first (only when no filters applied)
    if (isSummary && !folderName && !category && !guidelineType) {
      const cached = getCachedSummary();
      if (cached) {
        console.log('📦 Returning cached guidelines summary');
        return NextResponse.json({
          success: true,
          guidelines: cached.guidelines,
          totalClauses: cached.totalClauses,
          summary: true,
          fromCache: true,
        }, {
          headers: {
            'Cache-Control': 'public, max-age=300', // 5 min browser cache
          }
        });
      }
    }

    const limit = isSummary ? 2000 : 50;

    let guidelines = await SOPGuideline.find(query)
      .select(isSummary
        ? 'name folderName pdfName guidelineType category createdAt'
        : 'name folderName pdfName guidelineType category createdAt clauses.clauseNumber clauses.clauseTitle')
      .sort({ createdAt: -1 })
      .limit(limit)
      .maxTimeMS(25000)
      .lean();

    console.log(`✅ Found ${guidelines.length} guidelines for this query`);

    // Skip heavy stats for summary mode to save time
    if (isSummary) {
      const responseData = {
        guidelines,
        totalClauses: 0,
      };

      // Cache the summary for future requests (only when no filters)
      if (!folderName && !category && !guidelineType) {
        setCachedSummary(responseData);
      }

      return NextResponse.json({
        success: true,
        ...responseData,
        summary: true,
      }, {
        headers: {
          'Cache-Control': 'public, max-age=300', // 5 min browser cache
        }
      });
    }

    // Calculate statistics (only for filtered/detailed views)
    const stats = {
      totalGuidelines: guidelines.length,
      byFolder: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      totalClauses: 0,
    };

    guidelines.forEach(guideline => {
      // Count by folder
      if (guideline.folderName) {
        stats.byFolder[guideline.folderName] = (stats.byFolder[guideline.folderName] || 0) + 1;
      }
      
      // Count by category
      if (guideline.category) {
        stats.byCategory[guideline.category] = (stats.byCategory[guideline.category] || 0) + 1;
      }
      
      // Count by type
      if (guideline.guidelineType) {
        stats.byType[guideline.guidelineType] = (stats.byType[guideline.guidelineType] || 0) + 1;
      }
      
      // Count clauses
      if (guideline.clauses) {
        stats.totalClauses += guideline.clauses.length;
      }
    });

    return NextResponse.json({
      success: true,
      guidelines,
      totalClauses: stats.totalClauses,
      stats,
    });
  } catch (error) {
    console.error('Error fetching guidelines:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch guidelines',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// DELETE: Delete a specific guideline
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'Guideline ID is required' },
        { status: 400 }
      );
    }
    
    const guideline = await SOPGuideline.findById(id);
    
    if (!guideline) {
      return NextResponse.json(
        { error: 'Guideline not found' },
        { status: 404 }
      );
    }

    // Attempt to delete file if it exists
    if (guideline.filePath && fs.existsSync(guideline.filePath)) {
      try {
        fs.unlinkSync(guideline.filePath);
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    }

    await SOPGuideline.findByIdAndDelete(id);

    // Clear cache since we deleted a guideline
    summaryCache = null;
    console.log('🗑️ Cleared guidelines cache after deletion');

    return NextResponse.json({
      success: true,
      message: 'Guideline deleted successfully',
      id,
    });
  } catch (error) {
    console.error('Error deleting guideline:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete guideline',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
