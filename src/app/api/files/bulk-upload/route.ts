import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { extractTextFromPDF } from '@/lib/pdfExtractor';
import { extractTextFromDOCX } from '@/lib/docxExtractor';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    const uploadResults = [];
    const errors = [];

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads', 'sops');
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (err) {
      console.log('Uploads directory already exists or error creating it:', err);
    }

    for (const file of files) {
      try {
        // Validate file type
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!extension || !['pdf', 'docx', 'doc'].includes(extension)) {
          errors.push({
            fileName: file.name,
            error: 'Invalid file type. Only PDF and DOC/DOCX are allowed.'
          });
          continue;
        }

        // Validate file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
          errors.push({
            fileName: file.name,
            error: 'File size exceeds 10MB limit'
          });
          continue;
        }

        // Generate unique filename
        const timestamp = Date.now();
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}_${sanitizedName}`;
        const filePath = path.join(uploadsDir, fileName);

        // Save file
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await writeFile(filePath, buffer);

        // Extract text content
        let content = '';
        let wordCount = 0;

        if (extension === 'pdf') {
          content = await extractTextFromPDF(filePath);
        } else if (extension === 'docx' || extension === 'doc') {
          content = await extractTextFromDOCX(filePath);
        }

        // Validate content
        wordCount = content.trim().split(/\s+/).length;
        if (wordCount < 10) {
          errors.push({
            fileName: file.name,
            error: `Insufficient content. Only ${wordCount} words found. Minimum 10 words required.`
          });
          continue;
        }

        // Auto-generate SOP name and identifier from filename
        const nameWithoutExt = file.name.replace(/\.(pdf|docx|doc)$/i, '');
        const sopName = nameWithoutExt;

        // Generate identifier
        const codeMatch = nameWithoutExt.match(/([A-Z]{2,}[-_]?\d+[-_]?\d*)/i);
        let sopIdentifier;
        if (codeMatch) {
          sopIdentifier = codeMatch[1].toUpperCase();
        } else {
          const words = nameWithoutExt.split(/[\s_-]+/).filter(w => w.length > 0);
          sopIdentifier = words.slice(0, 3).join('-').toUpperCase() || `SOP-${timestamp}`;
        }

        // Auto-detect department from filename or content
        const department = detectDepartment(nameWithoutExt, content);

        // Create SOP document
        const sop = await SOP.create({
          name: sopName,
          identifier: sopIdentifier,
          department: department,
          fileUrl: `/uploads/sops/${fileName}`,
          fileType: extension === 'doc' ? 'docx' : extension,
          content: content,
          status: 'uploaded',
          mcqCount: 0,
          metadata: {
            fileSize: file.size,
            wordCount: wordCount,
          },
        });

        uploadResults.push({
          fileName: file.name,
          sopId: sop._id,
          sopName: sop.name,
          sopIdentifier: sop.identifier,
          wordCount: wordCount,
        });

      } catch (err) {
        console.error(`Error processing file ${file.name}:`, err);
        errors.push({
          fileName: file.name,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      uploadedCount: uploadResults.length,
      failedCount: errors.length,
      uploads: uploadResults,
      errors: errors,
    }, { status: 201 });

  } catch (error) {
    console.error('Bulk upload error:', error);
    return NextResponse.json(
      {
        error: 'Bulk upload failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper function to detect department from filename or content
function detectDepartment(filename: string, content: string): string {
  const text = (filename + ' ' + content.substring(0, 500)).toLowerCase();

  const departmentKeywords = {
    'QA': ['qa', 'quality assurance', 'qaic', 'qaio', 'qcge', 'instrument calibration', 'instrument operation', 'audit', 'compliance', 'deviation', 'capa'],
    'QC': ['qc', 'quality control', 'testing', 'analysis', 'laboratory', 'sampling', 'specification'],
    'Microbiology': ['microbiology', 'qami', 'qcmi', 'sterility', 'bioburden', 'environmental monitoring', 'aseptic'],
    'Production': ['production', 'praa', 'prcl', 'pred', 'preo', 'prep', 'prge', 'prma', 'prpa', 'manufacturing', 'aseptic area', 'eye drops', 'eye ointment', 'external preparation', 'packing'],
    'Store': ['store', 'bsge', 'stcl', 'stge', 'stop', 'stpa', 'strm', 'warehouse', 'storage', 'inventory', 'raw material', 'packing material'],
    'Engineering and Maintenance': ['engineering', 'maintenance', 'equipment', 'calibration', 'preventive', 'hvac', 'utilities'],
    'Personnel': ['personnel', 'human resources', 'hr', 'training', 'recruitment', 'employee', 'staff'],
  };

  for (const [dept, keywords] of Object.entries(departmentKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return dept;
    }
  }

  return 'QA';
}
