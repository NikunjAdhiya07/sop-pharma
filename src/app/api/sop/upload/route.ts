import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { parseDocument, validateDocumentContent } from '@/lib/documentParser';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import User from '@/models/User';
import { Notification } from '@/models/Notification';

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
    const language = (formData.get('language') as 'English' | 'Gujarati') || 'English';
    const overwrite = formData.get('overwrite') === 'true';

    console.log('📝 Form data received:', {
      hasFile: !!file,
      fileName: file?.name,
      sopName,
      sopIdentifier,
      overwrite
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

    // Calculate Checksum
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    console.log('🔐 File Checksum:', checksum);

    // Duplicate Check
    if (!overwrite) {
      console.log('🔍 Checking for duplicates...');
      const duplicateSOP = await SOP.findOne({
        $or: [
          { identifier: sopIdentifier, language: language },
          { name: sopName, language: language },
          { checksum: checksum }
        ]
      });

      if (duplicateSOP) {
        let duplicateReason = 'unknown';
        if (duplicateSOP.identifier === sopIdentifier) duplicateReason = 'identifier';
        else if (duplicateSOP.name === sopName) duplicateReason = 'name';
        else if (duplicateSOP.checksum === checksum) duplicateReason = 'content';

        console.log(`⚠️ Duplicate found: ${duplicateReason} matches SOP ${duplicateSOP.identifier}`);

        return NextResponse.json(
          {
            error: 'Duplicate SOP detected',
            type: duplicateReason,
            existingSOP: {
              id: duplicateSOP._id,
              name: duplicateSOP.name,
              identifier: duplicateSOP.identifier,
              uploadedAt: duplicateSOP.uploadedAt
            }
          },
          { status: 409 }
        );
      }
      console.log('✅ No duplicates found');
    }

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
    // Save file to disk
    console.log('💾 Saving file to disk...');
    
    // Sanitize department name for folder
    const sanitizedDept = department.replace(/[^a-zA-Z0-9-_]/g, '_');
    const uploadsDir = path.join(process.cwd(), 'uploads', 'sops', sanitizedDept);
    
    await mkdir(uploadsDir, { recursive: true });

    const fileName = `${sopIdentifier}_${Date.now()}.${fileExtension}`;
    const filePath = path.join(uploadsDir, fileName);
    await writeFile(filePath, buffer);
    console.log('✅ File saved:', fileName, 'in', sanitizedDept);

    const fileUrl = `/uploads/sops/${sanitizedDept}/${fileName}`;

    // Extract dates and metadata from content
    console.log('📅 Extracting dates from document...');
    const { extractDatesFromContent } = await import('@/lib/dateExtractor');
    const extractedDates = extractDatesFromContent(parsed.content);
    console.log('✅ Dates extracted:', extractedDates);

    // Create or Update SOP record
    console.log(`💾 ${overwrite ? 'Updating' : 'Creating'} SOP record in database...`);
    
    let sop;
    if (overwrite) {
      // Find and update existing SOP by identifier or name to preserve history
      // Prioritize identifier match
      sop = await SOP.findOneAndUpdate(
        { 
           $or: [
             { identifier: sopIdentifier },
             { name: sopName }
           ]
        },
        {
          name: sopName,
          identifier: sopIdentifier,
          department: department,
          fileUrl,
          fileType,
          content: parsed.content,
          language: language,
          checksum: checksum,
          status: 'uploaded',
          effectiveDate: extractedDates.effectiveDate,
          reviewDate: extractedDates.reviewDate,
          expiryDate: extractedDates.expiryDate,
          version: extractedDates.version,
          metadata: {
            fileSize: buffer.length,
            pageCount: parsed.metadata.pageCount,
            wordCount: parsed.metadata.wordCount,
          },
          updatedAt: new Date()
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } else {
      sop = await SOP.create({
        name: sopName,
        identifier: sopIdentifier,
        department: department,
        fileUrl,
        fileType,
        content: parsed.content,
        language: language,
        checksum: checksum,
        status: 'uploaded',
        effectiveDate: extractedDates.effectiveDate,
        reviewDate: extractedDates.reviewDate,
        expiryDate: extractedDates.expiryDate,
        version: extractedDates.version,
        metadata: {
          fileSize: buffer.length,
          pageCount: parsed.metadata.pageCount,
          wordCount: parsed.metadata.wordCount,
        },
      });
    }

    // Trigger Notifications on Overwrite (Update)
    if (overwrite && sop) {
      try {
          // Notify users in the same department
          const usersInDept = await User.find({ department: department });
          if (usersInDept.length > 0) {
              const notifications = usersInDept.map(user => ({
                  recipient: user._id,
                  type: 'update',
                  title: 'SOP Updated',
                  message: `SOP "${sopName}" (${sopIdentifier}) has been updated. Please review the changes.`,
                  link: `/sop-library/${sop._id}`,
                  read: false,
                  createdAt: new Date()
              }));
              await Notification.insertMany(notifications);
              console.log(`🔔 Sent update notifications to ${usersInDept.length} users in ${department}`);
          }
      } catch (error) {
          console.error('Failed to send notifications:', error);
      }
    }

    console.log('✅ SOP saved with ID:', sop._id);

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
