import { NextRequest, NextResponse } from 'next/server';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { extractTextFromDOCX } from '@/lib/docxExtractor';
import { extractDatesFromContent } from '@/lib/dateExtractor';
import { extractTitleFromFolderPath } from '@/lib/sopLibraryHelper';
import { extractSOPIdFromFilename, isValidSOPIdentifier } from '@/lib/sopIdExtractor';
import { saveFileToFolder, parseFolderPath } from '@/lib/fileStorage';
import { uploadToBunny, generateSOPDocumentPath } from '@/lib/bunnyStorage';

/** Upload to Bunny CDN if configured, otherwise fall back to local disk.
 *  Returns the stored path/URL to save in the DB. */
async function storeFile(
  buffer: Buffer,
  department: string,
  sopIdentifier: string,
  fileName: string,
  folderPath: string,
): Promise<{ fileUrl: string; storedPath: string }> {
  const bunnyConfigured =
    process.env.BUNNY_STORAGE_ZONE &&
    process.env.BUNNY_STORAGE_PASSWORD &&
    process.env.BUNNY_PULL_ZONE_URL;

  if (bunnyConfigured) {
    const bunnyPath = generateSOPDocumentPath(department, sopIdentifier, fileName);
    const cdnUrl = await uploadToBunny(buffer, bunnyPath);
    if (cdnUrl) {
      return { fileUrl: cdnUrl, storedPath: bunnyPath };
    }
    console.warn(`[bulk-upload] Bunny upload failed for ${fileName}, falling back to local disk`);
  }

  // Local disk fallback (dev / no Bunny configured)
  const savedFilePath = await saveFileToFolder(buffer, folderPath, fileName);
  return { fileUrl: `/${savedFilePath}`, storedPath: savedFilePath };
}
import AuditLog from '@/models/AuditLog';
import User from '@/models/User';

// Helper function to normalize path for comparison
function normPathKey(p: string): string {
  return (p || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '').toLowerCase();
}

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
    const language = (formData.get('language') as 'English' | 'Gujarati') || 'English';
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

        // Only process main SOP file (filename must contain a SOP code that appears somewhere in the folder hierarchy)
        // Example: QAGE01-10/QAGE01-10.docx ✅
        //          QAGE01-10/Gujarati SOP/QAGE01-10_gujarati.docx ✅  (SOP code in ancestor folder)
        //          QAGE01-10/Annexure-I.docx ❌
        const fileNameWithoutExt = value.name.replace(/\.(docx|doc)$/i, '');
        const SOP_CODE_RE = /([A-Z]{2,6}[\s-]?\d{2,3}-\d{2,3})/i;

        const fileSopCode = fileNameWithoutExt.match(SOP_CODE_RE)?.[1];

        // Search up the folder hierarchy (excluding the filename) for a matching SOP code
        const folderParts = pathParts.slice(0, -1); // all parts except filename
        let folderSopCode: string | undefined;
        for (let i = folderParts.length - 1; i >= 0; i--) {
          const m = folderParts[i].match(SOP_CODE_RE);
          if (m) { folderSopCode = m[1]; break; }
        }

        console.log(`  📋 Parent folder: "${folderParts[folderParts.length - 1]}"`);
        console.log(`  📋 Folder SOP code (from hierarchy): "${folderSopCode}"`);
        console.log(`  📋 File name: "${fileNameWithoutExt}"`);
        console.log(`  📋 File SOP code: "${fileSopCode}"`);

        // Check if file SOP code matches any ancestor folder's SOP code
        const isMainSOP = folderSopCode && fileSopCode &&
                          folderSopCode.toUpperCase().replace(/[\s-]/g, '') === fileSopCode.toUpperCase().replace(/[\s-]/g, '');

        if (!isMainSOP) {
          console.warn(`❌ Skipping file ${relativePath}: Not the main SOP file (SOP code in filename "${fileSopCode}" doesn't match folder hierarchy "${folderSopCode}")`);
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
            const trimmedContent = content.trim();
            if (trimmedContent.length === 0) {
              throw new Error('No text content could be extracted from the DOCX file.');
            }
            // For Gujarati, individual characters are often in separate <w:t> XML tags,
            // so the extracted text has spaces between each character/syllable.
            // Use character count as a fallback for Gujarati to avoid false failures.
            const wordCount = trimmedContent.split(/\s+/).filter(w => w.length > 0).length;
            const minWords = language === 'Gujarati' ? 5 : 10;
            const minChars = language === 'Gujarati' ? 50 : 30;
            if (wordCount < minWords && trimmedContent.length < minChars) {
              throw new Error(`Insufficient content. Only ${wordCount} words (${trimmedContent.length} chars) found. Minimum ${minWords} words or ${minChars} characters required.`);
            }

            // ── Step 1: Extract SOP identifier + dates from the DOCX header table ──
            // This is the most reliable source — reads "SOP NO." cell directly from
            // the Word XML, so a misnamed file (QAGE28-10.docx whose header says
            // QAGE21-05) gets the correct identifier stored in the DB.
            const { extractSOPHeaderTableData } = await import('@/lib/docxHeaderExtractor');
            const headerData = await extractSOPHeaderTableData(buffer);

            let sopIdentifier: string | null = null;

            if (headerData.sopNo && isValidSOPIdentifier(headerData.sopNo)) {
              sopIdentifier = headerData.sopNo;
              console.log(`  ✅ SOP NO from document header: ${sopIdentifier}`);
            }

            // ── Step 2: Fall back to filename-based extraction ────────────────────
            if (!sopIdentifier) {
              const sopIdResult = extractSOPIdFromFilename(file.name);
              if (sopIdResult.identifier && isValidSOPIdentifier(sopIdResult.identifier)) {
                sopIdentifier = sopIdResult.identifier;
                console.log(`  ℹ️  SOP ID from filename: ${sopIdentifier}`);
              }
            }

            // ── Step 3: Fall back to full-text content extraction ─────────────────
            if (!sopIdentifier) {
              const { extractSOPIdentifier } = await import('@/lib/dateExtractor');
              const contentId = extractSOPIdentifier(content);
              if (contentId && isValidSOPIdentifier(contentId)) {
                sopIdentifier = contentId;
              } else {
                // Final fallback: generate from filename words
                const nameWithoutExt = file.name.replace(/\.(pdf|docx|doc)$/i, '');
                const words = nameWithoutExt.split(/[\s_-]+/).filter(w => w.length > 0);
                sopIdentifier = words.slice(0, 3).join('-').toUpperCase() || `SOP-${Date.now()}`;
              }
            }

            // ── Extract dates: prepend header table values so they win the regex ──
            // If the header says "EFF. DATE 23/07/2022" and the body text has
            // ambiguous dates, the header values (prepended here) will be matched first.
            let contentForDates = content;
            if (headerData.effDate) contentForDates = `EFF. DATE: ${headerData.effDate}\n${contentForDates}`;
            if (headerData.reviewDate) contentForDates = `REVIEW DT.: ${headerData.reviewDate}\n${contentForDates}`;
            const extractedDates = extractDatesFromContent(contentForDates);

            // Parse folder path info
            const folderInfo = parseFolderPath(folderPath);

            // Generate SOP name from folder path structure
            // The folder structure has the full title: "QAGE01-10 - STANDARD OPERATING PROCEDURE FOR SOP"
            const sopName = extractTitleFromFolderPath(folderPath, sopIdentifier);

            // Save file to Bunny CDN (or local disk fallback)
            const { fileUrl: savedFileUrl, storedPath: savedFilePath } = await storeFile(
              buffer, department, sopIdentifier, file.name, folderPath,
            );

            // Check if SOP already exists
            let sop = await SOP.findOne({ identifier: sopIdentifier, language: language });

            if (sop) {
              // Update existing SOP
              sop.content = content;
              sop.folderPath = folderPath;
              sop.parentFolder = folderInfo.parentFolder || undefined;
              sop.subfolderLevel = folderInfo.level;
              sop.originalFileName = file.name;
              sop.fileUrl = savedFileUrl;
              sop.department = department;
              sop.language = language;
              
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
                fileUrl: savedFileUrl,
                fileType: 'docx',
                content: content,
                language: language,
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
            
            let sopLibrary = await SOPLibrary.findOne({ sopIdentifier: sopIdentifier, language: language });
            
            if (sopLibrary) {
              // Update folder info
              sopLibrary.folderPath = folderPath;
              sopLibrary.parentFolder = folderInfo.parentFolder || undefined;
              sopLibrary.subfolderLevel = folderInfo.level;
              sopLibrary.language = language;
              // Add/update the uploaded document with language field
              const existingDoc = sopLibrary.sopDocuments?.find(
                (d: any) => normPathKey(d.filePath) === normPathKey(savedFilePath)
              );
              if (!existingDoc) {
                sopLibrary.sopDocuments = [
                  ...(sopLibrary.sopDocuments || []),
                  {
                    fileName: file.name,
                    filePath: savedFilePath,
                    fileType: 'docx',
                    uploadedAt: new Date(),
                    fileSize: file.size,
                    language: language,
                  },
                ];
              }
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
                  language: language,
                }],
                language: language,
              });
            }

            // Update or create MasterSOPRepository entry (separate collection for folder uploads)
            let masterRepo = await MasterSOPRepository.findOne({ sopIdentifier: sopIdentifier, language: language });
            
            if (masterRepo) {
              // Update existing entry
              masterRepo.sopName = sopName;
              masterRepo.department = department;
              masterRepo.departmentCode = departmentCode;
              masterRepo.folderPath = folderPath;
              masterRepo.parentFolder = folderInfo.parentFolder || undefined;
              masterRepo.subfolderLevel = folderInfo.level;
              masterRepo.language = language;
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
                language: language,
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

        // Invalidate server-side dashboard cache after successful uploads
        try {
          invalidateDashboardSopsCache();
          console.log('✅ Dashboard server cache invalidated after bulk upload');
        } catch (revalidateError) {
          console.warn('⚠️ Failed to invalidate dashboard cache:', revalidateError);
          // Don't fail the upload if cache invalidation fails
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
