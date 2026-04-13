import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { existsSync } from 'fs';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import { generateFilePath, validateFileType, getAllowedExtensions } from '@/lib/sopLibraryHelper';
import { uploadToBunny, generateBunnyPath } from '@/lib/bunnyStorage';
import { persistUploadPath } from '@/lib/persistUploadPath';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

// Check if Bunny Storage is configured
const isBunnyConfigured = () => {
  return Boolean(
    (process.env.BUNNY_STORAGE_ZONE || process.env.BUNNY_STORAGE_ZONE_NAME) &&
    (process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY) &&
    (process.env.BUNNY_PULL_ZONE_URL || process.env.BUNNY_CDN_HOSTNAME)
  );
};

// POST - Upload files (videos, slides, or documents)
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const formData = await request.formData();
    const sopLibraryId = formData.get('sopLibraryId') as string;
    const fileType = formData.get('fileType') as 'video' | 'slide' | 'document';
    const title = formData.get('title') as string | null;
    const description = formData.get('description') as string | null;
    // Option to force local storage even if Bunny is configured
    const forceLocal = formData.get('forceLocal') === 'true';
    // Language field for document uploads (especially Gujarati supersede files)
    const languageRaw = (formData.get('language') as string) || 'English';
    const resolvedLanguage: 'English' | 'Gujarati' =
      languageRaw.toLowerCase() === 'gujarati' ? 'Gujarati' : 'English';

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

    // Determine storage type
    const useBunny = !forceLocal && isBunnyConfigured();

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

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      let filePath: string;
      let storageType: 'local' | 'bunny' = 'local';

      if (useBunny) {
        // Upload to Bunny Storage
        const bunnyPath = generateBunnyPath(
          sopLibrary.sopIdentifier,
          fileType,
          file.name
        );
        
        const bunnyUrl = await uploadToBunny(buffer, bunnyPath);
        
        if (bunnyUrl) {
          filePath = `bunny://${bunnyPath}`;
          storageType = 'bunny';
        } else {
          // Bunny failed — virtual path only (no disk write)
          console.warn(`Bunny upload failed for ${file.name}, using virtual path`);
          filePath = generateFilePath(
            sopLibrary.sopIdentifier,
            sopLibrary.departmentCode,
            fileType,
            file.name
          );
        }
      } else {
        // No Bunny — virtual path only (no disk write)
        filePath = generateFilePath(
          sopLibrary.sopIdentifier,
          sopLibrary.departmentCode,
          fileType,
          file.name
        );
      }

      if (!filePath.startsWith('bunny://') && !filePath.startsWith('http://') && !filePath.startsWith('https://')) {
        try {
          await persistUploadPath(filePath, buffer);
        } catch (persistErr) {
          console.error('sop-library upload: failed to persist file:', persistErr);
        }
      }

      // Get file extension
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';

      // Create file metadata
      const fileMetadata: any = {
        fileName: file.name,
        filePath: filePath,
        storageType: storageType,
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
        // Add language field for Gujarati supersede documents - prevents misclassification
        fileMetadata.language = resolvedLanguage;
        sopLibrary.sopDocuments.push(fileMetadata);
      }

      uploadedFiles.push({
        fileName: file.name,
        filePath: filePath,
        storageType: storageType,
        fileSize: file.size,
      });
    }

    // Save updated SOP Library entry
    await sopLibrary.save();
    invalidateDashboardSopsCache();

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

    // Find the file to determine storage type
    let fileToDelete: any = null;
    if (fileType === 'video') {
      fileToDelete = sopLibrary.videos.find((v: any) => v.filePath === filePath);
      sopLibrary.videos = sopLibrary.videos.filter((v: any) => v.filePath !== filePath);
    } else if (fileType === 'slide') {
      fileToDelete = sopLibrary.slides.find((s: any) => s.filePath === filePath);
      sopLibrary.slides = sopLibrary.slides.filter((s: any) => s.filePath !== filePath);
    } else if (fileType === 'document') {
      fileToDelete = sopLibrary.sopDocuments.find((d: any) => d.filePath === filePath);
      sopLibrary.sopDocuments = sopLibrary.sopDocuments.filter((d: any) => d.filePath !== filePath);
    }

    await sopLibrary.save();

    // Delete physical file based on storage type
    if (fileToDelete) {
      const storageType = fileToDelete.storageType || 'local';
      
      if (storageType === 'bunny') {
        // Delete from Bunny Storage
        const { deleteFromBunny } = await import('@/lib/bunnyStorage');
        await deleteFromBunny(filePath);
      } else {
        // Delete local file
        try {
          const { unlink } = await import('fs/promises');
          const fullPath = join(process.cwd(), filePath);
          if (existsSync(fullPath)) {
            await unlink(fullPath);
          }
        } catch (err) {
          console.warn('Could not delete local file:', filePath, err);
        }
      }
    }

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
