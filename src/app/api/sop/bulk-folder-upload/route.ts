import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { extractTextFromDOCX } from '@/lib/docxExtractor';
import { extractDatesFromContent } from '@/lib/dateExtractor';
import { extractSOPIdFromFilename, isValidSOPIdentifier } from '@/lib/sopIdExtractor';
import { saveFileToFolder, parseFolderPath } from '@/lib/fileStorage';
import AuditLog from '@/models/AuditLog';
import User from '@/models/User';

// Approved department names
const APPROVED_DEPARTMENTS = [
  'QA',
  'QC',
  'MICROBIOLOGY',
  'PRODUCTION',
  'STORE',
  'ENGINEERING AND MAINTENANCE',
  'PERSONNEL'
];

interface FileWithPath {
  file: File;
  relativePath: string;
  folderPath: string;
  department: string;
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const formData = await request.formData();
    const files: FileWithPath[] = [];

    // Parse all files and their paths from FormData
    console.log('📦 Received FormData with entries:');
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        console.log(`  - Key: ${key}, File: ${value.name}`);
        
        // Key format: "files[relativePath]"
        const pathMatch = key.match(/files\[(.*)\]/);
        if (!pathMatch) {
          console.warn(`⚠️ Skipping - Key doesn't match pattern: ${key}`);
          continue;
        }

        const relativePath = pathMatch[1];
        const pathParts = relativePath.split('/').filter((p: string) => p.length > 0);
        
        console.log(`  📂 Relative path: ${relativePath}`);
        console.log(`  📂 Path parts:`, pathParts);
        
        // First part should be department (but may have prefixes like "1. QA" or "QA - Quality Assurance")
        const firstFolder = pathParts[0]?.toUpperCase() || '';
        
        // Try to extract department name from folder name
        // Look for any approved department name in the folder name
        let department = '';
        for (const dept of APPROVED_DEPARTMENTS) {
          if (firstFolder.includes(dept)) {
            department = dept;
            break;
          }
        }
        
        console.log(`  🏢 First folder: "${firstFolder}"`);
        console.log(`  🏢 Detected department: "${department}"`);
        
        // Validate department
        if (!department) {
          console.warn(`❌ Skipping file ${relativePath}: Could not detect valid department in "${firstFolder}". Must contain one of: ${APPROVED_DEPARTMENTS.join(', ')}`);
          continue;
        }

        // Only process DOCX files
        const ext = value.name.toLowerCase().split('.').pop();
        if (ext !== 'docx' && ext !== 'doc') {
          console.warn(`❌ Skipping file ${relativePath}: Not a DOCX file (extension: ${ext})`);
          continue;
        }

        // Skip temporary files (starting with ~$)
        if (value.name.startsWith('~$')) {
          console.warn(`❌ Skipping file ${relativePath}: Temporary file`);
          continue;
        }

        // Only process main SOP file (filename should match parent folder name)
        // Example: QAGE01-10/QAGE01-10.docx ✅
        //          QAGE01-10/Annexure-I.docx ❌
        const parentFolderName = pathParts[pathParts.length - 2]; // Second to last is parent folder
        const fileNameWithoutExt = value.name.replace(/\.(docx|doc)$/i, '');
        
        // Extract SOP code from folder name (e.g., "QAGE01-10" from "QAGE01-10 - STANDARD OPERATING PROCEDURE")
        // Supports: QA01-10, QAGE01-10, QAGE127-03, MAGE 01-10, etc. (2-6 letters, optional space/hyphen, 2-3 digits, hyphen, 2-3 digits)
        const folderSopCode = parentFolderName?.match(/([A-Z]{2,6}[\s-]?\d{2,3}-\d{2,3})/i)?.[1];
        const fileSopCode = fileNameWithoutExt.match(/([A-Z]{2,6}[\s-]?\d{2,3}-\d{2,3})/i)?.[1];
        
        console.log(`  📋 Parent folder: "${parentFolderName}"`);
        console.log(`  📋 Folder SOP code: "${folderSopCode}"`);
        console.log(`  📋 File name: "${fileNameWithoutExt}"`);
        console.log(`  📋 File SOP code: "${fileSopCode}"`);
        
        // Check if file matches folder (either exact match or SOP code match)
        const isMainSOP = folderSopCode && fileSopCode && 
                          folderSopCode.toUpperCase() === fileSopCode.toUpperCase();
        
        if (!isMainSOP) {
          console.warn(`❌ Skipping file ${relativePath}: Not the main SOP file (doesn't match folder "${parentFolderName}")`);
          continue;
        }
        
        console.log(`✅ Main SOP file detected!`);

        // Build folder path (everything except the filename)
        const folderPath = pathParts.slice(0, -1).join('/');
        
        console.log(`✅ Adding file: ${relativePath} (Department: ${department}, Folder: ${folderPath})`);

        files.push({
          file: value,
          relativePath,
          folderPath,
          department
        });
      }
    }

    console.log(`\n📊 Summary: Found ${files.length} valid DOCX files to process`);

    if (files.length === 0) {
      console.error('❌ No valid DOCX files found!');
      console.error('Expected folder structure:');
      console.error('  YourFolder/');
      console.error('    ├── QA/');
      console.error('    │   ├── Subfolder/');
      console.error('    │   │   └── file.docx');
      console.error('    │   └── file2.docx');
      console.error('    └── QC/');
      console.error('        └── file3.docx');
      
      return NextResponse.json(
        { 
          error: 'No valid DOCX files found in uploaded folders',
          details: 'Make sure your folder structure has department folders (QA, QC, MICROBIOLOGY, PRODUCTION, STORE, ENGINEERING AND MAINTENANCE, PERSONNEL) at the root level containing DOCX files.'
        },
        { status: 400 }
      );
    }

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let completed = 0;
        let failed = 0;
        const errors: Array<{ fileName: string; error: string }> = [];
        const results: Array<{ fileName: string; sopId: string; sopIdentifier: string; extracted: any }> = [];

        for (const fileWithPath of files) {
          try {
            const { file, relativePath, folderPath, department } = fileWithPath;

            // Send progress update
            const progress = {
              total: files.length,
              completed,
              failed,
              current: relativePath,
              errors,
              results,
            };

            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(progress)}\n\n`)
              );
            } catch (e) {
              console.warn('⚠️ Stream controller closed by client. Stopping bulk process.');
              return;
            }

            // Read file buffer
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);

            // Extract text content from DOCX
            let content = '';
            try {
              // Use parseDOCX directly which accepts Buffer
              const { parseDOCX } = await import('@/lib/documentParser');
              const parsed = await parseDOCX(buffer);
              content = parsed.content;
            } catch (err) {
              throw new Error(`Failed to extract text from DOCX: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }

            // Validate content
            const wordCount = content.trim().split(/\s+/).length;
            if (wordCount < 10) {
              throw new Error(`Insufficient content. Only ${wordCount} words found. Minimum 10 words required.`);
            }

            // Extract SOP ID from filename
            const sopIdResult = extractSOPIdFromFilename(file.name);
            let sopIdentifier = sopIdResult.identifier;

            // If no valid identifier found, try to extract from content
            if (!sopIdentifier || !isValidSOPIdentifier(sopIdentifier)) {
              const { extractSOPIdentifier } = await import('@/lib/dateExtractor');
              const contentId = extractSOPIdentifier(content);
              if (contentId && isValidSOPIdentifier(contentId)) {
                sopIdentifier = contentId;
              } else {
                // Fallback: generate from filename
                const nameWithoutExt = file.name.replace(/\.(pdf|docx|doc)$/i, '');
                const words = nameWithoutExt.split(/[\s_-]+/).filter(w => w.length > 0);
                sopIdentifier = words.slice(0, 3).join('-').toUpperCase() || `SOP-${Date.now()}`;
              }
            }

            // Extract dates and version from content
            const extractedDates = extractDatesFromContent(content);

            // Parse folder path info
            const folderInfo = parseFolderPath(folderPath);

            // Generate SOP name from filename
            const nameWithoutExt = file.name.replace(/\.(pdf|docx|doc)$/i, '');
            const sopName = nameWithoutExt.toUpperCase();

            // Save file to mirrored folder structure
            const savedFilePath = await saveFileToFolder(buffer, folderPath, file.name);

            // Check if SOP already exists
            let sop = await SOP.findOne({ identifier: sopIdentifier });

            if (sop) {
              // Update existing SOP
              sop.content = content;
              sop.folderPath = folderPath;
              sop.parentFolder = folderInfo.parentFolder || undefined;
              sop.subfolderLevel = folderInfo.level;
              sop.originalFileName = file.name;
              sop.fileUrl = `/${savedFilePath}`;
              sop.department = department;
              
              // Update dates if extracted
              if (extractedDates.effectiveDate) sop.effectiveDate = extractedDates.effectiveDate;
              if (extractedDates.reviewDate) sop.reviewDate = extractedDates.reviewDate;
              if (extractedDates.expiryDate) sop.expiryDate = extractedDates.expiryDate;
              if (extractedDates.version) sop.version = extractedDates.version;
              
              sop.metadata = {
                fileSize: file.size,
                wordCount: wordCount,
              };
              
              await sop.save();
            } else {
              // Create new SOP
              sop = await SOP.create({
                name: sopName,
                identifier: sopIdentifier,
                department: department,
                folderPath: folderPath,
                parentFolder: folderInfo.parentFolder || undefined,
                subfolderLevel: folderInfo.level,
                originalFileName: file.name,
                fileUrl: `/${savedFilePath}`,
                fileType: 'docx',
                content: content,
                status: 'uploaded',
                mcqCount: 0,
                effectiveDate: extractedDates.effectiveDate,
                reviewDate: extractedDates.reviewDate,
                expiryDate: extractedDates.expiryDate,
                version: extractedDates.version || '1.0',
                metadata: {
                  fileSize: file.size,
                  wordCount: wordCount,
                },
              });
            }

            // Update or create SOPLibrary entry
            const departmentCode = sopIdentifier.substring(0, 4).toUpperCase();
            
            let sopLibrary = await SOPLibrary.findOne({ sopIdentifier: sopIdentifier });
            
            if (sopLibrary) {
              // Update folder info
              sopLibrary.folderPath = folderPath;
              sopLibrary.parentFolder = folderInfo.parentFolder || undefined;
              sopLibrary.subfolderLevel = folderInfo.level;
              await sopLibrary.save();
            } else {
              // Create new library entry
              await SOPLibrary.create({
                sopId: sop._id,
                sopName: sopName,
                sopIdentifier: sopIdentifier,
                department: department,
                departmentCode: departmentCode,
                folderPath: folderPath,
                parentFolder: folderInfo.parentFolder || undefined,
                subfolderLevel: folderInfo.level,
                videos: [],
                slides: [],
                sopDocuments: [{
                  fileName: file.name,
                  filePath: savedFilePath,
                  fileType: 'docx',
                  uploadedAt: new Date(),
                  fileSize: file.size,
                }],
              });
            }

            // Update or create MasterSOPRepository entry (separate collection for folder uploads)
            let masterRepo = await MasterSOPRepository.findOne({ sopIdentifier: sopIdentifier });
            
            if (masterRepo) {
              // Update existing entry
              masterRepo.sopName = sopName;
              masterRepo.department = department;
              masterRepo.departmentCode = departmentCode;
              masterRepo.folderPath = folderPath;
              masterRepo.parentFolder = folderInfo.parentFolder || undefined;
              masterRepo.subfolderLevel = folderInfo.level;
              masterRepo.sopDocument = {
                fileName: file.name,
                filePath: savedFilePath,
                fileSize: file.size,
                uploadedAt: new Date(),
              };
              masterRepo.metadata = {
                effectiveDate: extractedDates.effectiveDate,
                reviewDate: extractedDates.reviewDate,
                expiryDate: extractedDates.expiryDate,
                version: extractedDates.version || '1.0',
                wordCount: wordCount,
              };
              await masterRepo.save();
            } else {
              // Create new Master Repository entry
              await MasterSOPRepository.create({
                sopIdentifier: sopIdentifier,
                sopName: sopName,
                department: department,
                departmentCode: departmentCode,
                folderPath: folderPath,
                parentFolder: folderInfo.parentFolder || undefined,
                subfolderLevel: folderInfo.level,
                sopDocument: {
                  fileName: file.name,
                  filePath: savedFilePath,
                  fileSize: file.size,
                  uploadedAt: new Date(),
                },
                metadata: {
                  effectiveDate: extractedDates.effectiveDate,
                  reviewDate: extractedDates.reviewDate,
                  expiryDate: extractedDates.expiryDate,
                  version: extractedDates.version || '1.0',
                  wordCount: wordCount,
                },
                resources: {
                  hasVideos: false,
                  videoCount: 0,
                  hasSlides: false,
                  slideCount: 0,
                  hasMCQs: false,
                  mcqCount: 0,
                },
              });
            }

            completed++;
            results.push({
              fileName: relativePath,
              sopId: sop._id.toString(),
              sopIdentifier: sopIdentifier,
              extracted: {
                effectiveDate: extractedDates.effectiveDate,
                reviewDate: extractedDates.reviewDate,
                expiryDate: extractedDates.expiryDate,
                version: extractedDates.version,
              }
            });

          } catch (error) {
            console.error(`Error processing ${fileWithPath.relativePath}:`, error);
            failed++;
            errors.push({
              fileName: fileWithPath.relativePath,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // Send final progress update
        const finalProgress = {
          total: files.length,
          completed,
          failed,
          current: '',
          errors,
          results,
        };

        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(finalProgress)}\n\n`)
          );
        } catch (e) {
          // Ignore
        }

        // Create audit log for folder upload
        try {
          // Find admin user or create a system user for audit logs
          let adminUser = await User.findOne({ role: 'admin' });
          if (!adminUser) {
            // Fallback: create a system user entry for audit logs
            adminUser = await User.findOne({ username: 'system' });
            if (!adminUser) {
              adminUser = { 
                _id: new mongoose.Types.ObjectId('000000000000000000000000'),
                username: 'system',
                fullName: 'System'
              } as any;
            }
          }

          await AuditLog.create({
            action: 'FOLDER_UPLOAD',
            userId: adminUser._id,
            username: adminUser.username,
            userFullName: adminUser.fullName,
            targetName: 'SOP Folder Upload',
            details: {
              totalFiles: files.length,
              successCount: completed,
              failedCount: failed,
              failedFiles: errors.map(err => ({
                filePath: err.fileName,
                reason: err.error
              })),
              uploadedSOPs: results.map(r => r.sopIdentifier)
            }
          });
          
          console.log('✅ Audit log created for folder upload');
        } catch (auditError) {
          console.error('⚠️ Failed to create audit log:', auditError);
          // Don't fail the upload if audit log creation fails
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Bulk folder upload error:', error);
    return NextResponse.json(
      {
        error: 'Bulk folder upload failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
