import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import { generateFilePath, validateFileType, getAllowedExtensions } from '@/lib/sopLibraryHelper';

// POST - Upload files (videos, slides, or documents)
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const formData = await request.formData();
    const sopLibraryId = formData.get('sopLibraryId') as string;
    const fileType = formData.get('fileType') as 'video' | 'slide' | 'document';
    const title = formData.get('title') as string | null;
    const description = formData.get('description') as string | null;

    if (!sopLibraryId || !fileType) {
      return NextResponse.json(
        { success: false, error: 'SOP Library ID and file type are required' },
        { status: 400 }
      );
    }

    // Find SOP Library entry
    const sopLibrary = await SOPLibrary.findById(sopLibraryId);
    if (!sopLibrary) {
      return NextResponse.json(
        { success: false, error: 'SOP Library entry not found' },
        { status: 404 }
      );
    }

    // Get allowed extensions
    const allowedExtensions = getAllowedExtensions(fileType);

    // Process uploaded files
    const uploadedFiles: any[] = [];
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided' },
        { status: 400 }
      );
    }

    for (const file of files) {
      // Validate file type
      if (!validateFileType(file.name, allowedExtensions)) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Invalid file type for ${file.name}. Allowed: ${allowedExtensions.join(', ')}` 
          },
          { status: 400 }
        );
      }

      // Generate file path
      const filePath = generateFilePath(
        sopLibrary.sopIdentifier,
        sopLibrary.departmentCode,
        fileType,
        file.name
      );

      // Create directory if it doesn't exist
      const dirPath = join(process.cwd(), filePath.substring(0, filePath.lastIndexOf('/')));
      if (!existsSync(dirPath)) {
        await mkdir(dirPath, { recursive: true });
      }

      // Save file
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const fullPath = join(process.cwd(), filePath);
      await writeFile(fullPath, buffer);

      // Get file extension
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';

      // Create file metadata
      const fileMetadata: any = {
        fileName: file.name,
        filePath: filePath,
        uploadedAt: new Date(),
        fileSize: file.size,
      };

      if (fileType === 'video') {
        fileMetadata.title = title || file.name;
        fileMetadata.description = description || '';
        sopLibrary.videos.push(fileMetadata);
      } else if (fileType === 'slide') {
        fileMetadata.title = title || file.name;
        fileMetadata.fileType = fileExtension as 'pdf' | 'ppt' | 'pptx';
        sopLibrary.slides.push(fileMetadata);
      } else if (fileType === 'document') {
        fileMetadata.fileType = fileExtension as 'pdf' | 'docx';
        sopLibrary.sopDocuments.push(fileMetadata);
      }

      uploadedFiles.push({
        fileName: file.name,
        filePath: filePath,
        fileSize: file.size,
      });
    }

    // Save updated SOP Library entry
    await sopLibrary.save();

    return NextResponse.json({
      success: true,
      message: `${files.length} file(s) uploaded successfully`,
      uploadedFiles,
      sopLibrary,
    });
  } catch (error: any) {
    console.error('Error uploading files:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to upload files', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Remove a file from SOP Library
export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const sopLibraryId = searchParams.get('sopLibraryId');
    const fileType = searchParams.get('fileType') as 'video' | 'slide' | 'document';
    const filePath = searchParams.get('filePath');

    if (!sopLibraryId || !fileType || !filePath) {
      return NextResponse.json(
        { success: false, error: 'SOP Library ID, file type, and file path are required' },
        { status: 400 }
      );
    }

    const sopLibrary = await SOPLibrary.findById(sopLibraryId);
    if (!sopLibrary) {
      return NextResponse.json(
        { success: false, error: 'SOP Library entry not found' },
        { status: 404 }
      );
    }

    // Remove file from array
    if (fileType === 'video') {
      sopLibrary.videos = sopLibrary.videos.filter(v => v.filePath !== filePath);
    } else if (fileType === 'slide') {
      sopLibrary.slides = sopLibrary.slides.filter(s => s.filePath !== filePath);
    } else if (fileType === 'document') {
      sopLibrary.sopDocuments = sopLibrary.sopDocuments.filter(d => d.filePath !== filePath);
    }

    await sopLibrary.save();

    // TODO: Delete physical file from filesystem

    return NextResponse.json({
      success: true,
      message: 'File removed successfully',
      sopLibrary,
    });
  } catch (error: any) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete file', details: error.message },
      { status: 500 }
    );
  }
}
