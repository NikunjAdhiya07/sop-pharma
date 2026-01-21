import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { parseDocument, validateDocumentContent } from '@/lib/documentParser';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  console.log('📤 Upload API called');
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    await connectDB();
    console.log('✅ MongoDB connected');

    console.log('📋 Parsing form data...');
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const sopName = formData.get('sopName') as string;
    const sopIdentifier = formData.get('sopIdentifier') as string;
    const department = formData.get('department') as string || 'General';

    console.log('📝 Form data received:', {
      hasFile: !!file,
      fileName: file?.name,
      sopName,
      sopIdentifier
    });

    // Validation
    if (!file) {
      console.error('❌ No file uploaded');
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    if (!sopName || !sopIdentifier) {
      console.error('❌ Missing SOP name or identifier');
      return NextResponse.json(
        { error: 'SOP name and identifier are required' },
        { status: 400 }
      );
    }

    // Allow re-uploading same SOP (for regenerating MCQs)
    console.log('✅ SOP can be uploaded (duplicates allowed for re-generation)');

    // Validate file type
    console.log('🔍 Validating file type...');
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !['pdf', 'docx'].includes(fileExtension)) {
      console.error('❌ Invalid file type:', fileExtension);
      return NextResponse.json(
        { error: 'Only PDF and DOCX files are supported' },
        { status: 400 }
      );
    }

    const fileType = fileExtension as 'pdf' | 'docx';
    console.log('✅ File type valid:', fileType);

    // Convert file to buffer
    console.log('📦 Converting file to buffer...');
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    console.log('✅ Buffer created, size:', buffer.length, 'bytes');

    // Parse document
    console.log('📖 Parsing document...');
    const parsed = await parseDocument(buffer, fileType);
    console.log('✅ Document parsed, word count:', parsed.metadata.wordCount);

    // Validate content
    console.log('✔️ Validating content...');
    const validation = validateDocumentContent(parsed.content);
    if (!validation.isValid) {
      console.error('❌ Content validation failed:', validation.error);
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }
    console.log('✅ Content validated');

    // Save file to disk
    console.log('💾 Saving file to disk...');
    const uploadsDir = path.join(process.cwd(), 'uploads', 'sops');
    await mkdir(uploadsDir, { recursive: true });

    const fileName = `${sopIdentifier}_${Date.now()}.${fileExtension}`;
    const filePath = path.join(uploadsDir, fileName);
    await writeFile(filePath, buffer);
    console.log('✅ File saved:', fileName);

    const fileUrl = `/uploads/sops/${fileName}`;

    // Create SOP record
    console.log('💾 Creating SOP record in database...');
    const sop = await SOP.create({
      name: sopName,
      identifier: sopIdentifier,
      department: department,
      fileUrl,
      fileType,
      content: parsed.content,
      status: 'uploaded',
      metadata: {
        fileSize: buffer.length,
        pageCount: parsed.metadata.pageCount,
        wordCount: parsed.metadata.wordCount,
      },
    });
    console.log('✅ SOP created with ID:', sop._id);

    const response = {
      success: true,
      message: 'SOP uploaded successfully',
      sop: {
        id: sop._id,
        name: sop.name,
        identifier: sop.identifier,
        status: sop.status,
        wordCount: sop.metadata?.wordCount,
      },
    };
    
    console.log('🎉 Upload successful!', response);
    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    console.error('💥 Error uploading SOP:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Extract detailed error message
    let errorMessage = 'Failed to upload SOP';
    let errorDetails = 'Unknown error';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.message;
      
      // Add more context for specific errors
      if (error.message.includes('scanned images')) {
        errorDetails = error.message + '\n\nThis usually happens when:\n1. The PDF was created by scanning physical documents\n2. The PDF contains images of text rather than actual text\n3. OCR (Optical Character Recognition) was not applied during scanning';
      } else if (error.message.includes('password')) {
        errorDetails = error.message + '\n\nPlease remove password protection using:\n1. Adobe Acrobat\n2. Online PDF tools\n3. Command-line tools like qpdf';
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: errorDetails
      },
      { status: 500 }
    );
  }
}
