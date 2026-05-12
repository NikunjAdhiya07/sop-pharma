import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import { uploadToBunny, generateSOPDocumentPath } from '@/lib/bunnyStorage';
import { persistUploadPath } from '@/lib/persistUploadPath';
import { getDepartmentForSubcategory, extractSubcategoryFromIdentifier } from '@/lib/mcqTreeBuilder';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

const useBunny = () =>
  Boolean(
    (process.env.BUNNY_STORAGE_ZONE || process.env.BUNNY_STORAGE_ZONE_NAME) &&
      (process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY) &&
      (process.env.BUNNY_PULL_ZONE_URL || process.env.BUNNY_CDN_HOSTNAME)
  );

function normalizeDeptForDisplay(d: string): string {
  if (!d) return 'General';
  const lower = d.toLowerCase();
  if (lower.includes('micro')) return 'Microbiology';
  if (lower.includes('engineer')) return 'Engineering and Maintenance';
  if (lower.includes('person') || lower.includes('hr')) return 'Personnel';
  if (lower.includes('store')) return 'Store';
  if (lower.includes('prod')) return 'Production';
  if (lower === 'qa' || lower.includes('quality assurance')) return 'QA';
  if (lower === 'qc' || lower.includes('quality control')) return 'QC';
  return d;
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const formData = await request.formData();
    const filesList = formData.getAll('files');
    const files = filesList.filter((v): v is File => v instanceof File && v.size > 0);
    const paths = (formData.getAll('paths') as string[]) || [];

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No PDF files provided.' },
        { status: 400 }
      );
    }

    const results: Array<{
      fileName: string;
      sopIdentifier: string;
      sopName: string;
      department: string;
      matched: boolean;
    }> = [];
    const errors: Array<{ fileName: string; error: string }> = [];
    const storeToBunny = useBunny();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = file.name || 'document.pdf';
      const relativePath = paths[i] || fileName;
      const ext = fileName.toLowerCase().split('.').pop();

      if (ext !== 'pdf') {
        errors.push({ fileName, error: 'Only PDF files are accepted' });
        continue;
      }

      // Detect Gujarati script characters (\u0A80-\u0AFF) or keyword in the relative path (e.g. from the uploaded folder name)
      const isGujaratiFile =
        /[\u0A80-\u0AFF]/.test(relativePath) ||
        relativePath.toLowerCase().includes('gujarati') ||
        relativePath.toLowerCase().includes('-guj-') ||
        relativePath.toLowerCase().includes('_guj');
      const documentLanguage = isGujaratiFile ? 'Gujarati' : 'English';

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const nameWithoutExt = fileName.replace(/\.pdf$/i, '');
        const codeMatch = nameWithoutExt.match(/([A-Z]{2,}[-_]?\d+[-_]?\d*)/i);
        const sopIdentifier = codeMatch
          ? codeMatch[1].toUpperCase().replace(/_/g, '-')
          : null;

        if (!sopIdentifier) {
          errors.push({
            fileName,
            error: 'Could not extract SOP identifier from filename (e.g. MAGE01-08)',
          });
          continue;
        }

        const sop = await SOP.findOne({
          identifier: { $regex: new RegExp(`^${sopIdentifier.replace(/[-]/g, '[-]?')}$`, 'i') },
          language: documentLanguage,
        }).lean();

        const department = sop
          ? normalizeDeptForDisplay(sop.department)
          : (() => {
              const subcategory = extractSubcategoryFromIdentifier(sopIdentifier);
              const fromId = getDepartmentForSubcategory(subcategory);
              return fromId ? normalizeDeptForDisplay(fromId) : 'General';
            })();

        const sanitizedDept = department.replace(/[^a-zA-Z0-9-_]/g, '_');
        let fileUrl: string;

        if (storeToBunny) {
          const bunnyPath = generateSOPDocumentPath(department, sopIdentifier, fileName);
          const cdnUrl = await uploadToBunny(buffer, bunnyPath);
          if (cdnUrl) {
            fileUrl = cdnUrl;
          } else {
            const localFileName = `${sopIdentifier}_${Date.now()}.pdf`;
            fileUrl = `/uploads/sop-pdfs/${sanitizedDept}/${localFileName}`;
          }
        } else {
          const localFileName = `${sopIdentifier}_${Date.now()}.pdf`;
          fileUrl = `/uploads/sop-pdfs/${sanitizedDept}/${localFileName}`;
        }

        const storedRemotely =
          fileUrl.startsWith('http://') ||
          fileUrl.startsWith('https://') ||
          fileUrl.startsWith('bunny://');
        if (!storedRemotely) {
          try {
            await persistUploadPath(fileUrl, buffer);
          } catch (persistErr) {
            console.error('upload-pdf-batch: failed to persist file:', persistErr);
          }
        }

        const sopName = sop?.name || nameWithoutExt;
        const sopId = sop?._id;
        const libraryLanguage = sop?.language || documentLanguage;

        const subcategory = extractSubcategoryFromIdentifier(sopIdentifier);
        const departmentCode = subcategory || department.substring(0, 4).toUpperCase();

        let sopLib = await SOPLibrary.findOne({
          sopIdentifier: { $regex: new RegExp(`^${sopIdentifier.replace(/[-]/g, '[-]?')}$`, 'i') },
          language: documentLanguage,
        });

        const newDoc = {
          fileName,
          filePath: fileUrl,
          storageType: (storeToBunny && fileUrl.startsWith('http') ? 'bunny' : 'local') as 'bunny' | 'local',
          fileType: 'pdf' as const,
          uploadedAt: new Date(),
          fileSize: buffer.length,
          language: documentLanguage,
        };

        if (sopLib) {
          const alreadyExists = sopLib.sopDocuments.some(
            (d: any) => d.fileType === 'pdf' && d.fileName === fileName
          );
          if (alreadyExists) {
            sopLib.sopDocuments = sopLib.sopDocuments.map((d: any) =>
              d.fileType === 'pdf' && d.fileName === fileName
                ? { ...d, filePath: fileUrl, fileSize: buffer.length, uploadedAt: new Date(), language: documentLanguage }
                : d
            ) as any;
          } else {
            sopLib.sopDocuments.push(newDoc as any);
          }
          await sopLib.save();
        } else if (sopId) {
          sopLib = await SOPLibrary.create({
            sopId,
            sopIdentifier,
            sopName,
            department,
            departmentCode,
            language: documentLanguage,
            sopDocuments: [newDoc],
            videos: [],
            slides: [],
          });
        } else {
          const placeholderSop = await SOP.create({
            name: sopName,
            identifier: sopIdentifier,
            department,
            fileUrl,
            fileType: 'pdf',
            content: `PDF document: ${fileName}`,
            language: documentLanguage,
            status: 'uploaded',
            metadata: { fileSize: buffer.length },
          });

          sopLib = await SOPLibrary.create({
            sopId: placeholderSop._id,
            sopIdentifier,
            sopName,
            department,
            departmentCode,
            language: documentLanguage,
            sopDocuments: [newDoc],
            videos: [],
            slides: [],
          });
        }

        results.push({
          fileName,
          sopIdentifier,
          sopName,
          department,
          matched: !!sop,
        });
      } catch (err) {
        errors.push({
          fileName,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    if (results.length > 0) void invalidateDashboardSopsCache();
    return NextResponse.json({
      success: true,
      uploaded: results.length,
      failed: errors.length,
      matched: results.filter((r) => r.matched).length,
      unmatched: results.filter((r) => !r.matched).length,
      results,
      errors,
      storage: storeToBunny ? 'bunny' : 'local',
    });
  } catch (error) {
    console.error('PDF bulk upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'PDF bulk upload failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
