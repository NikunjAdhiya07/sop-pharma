import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import {
  buildStubParsedDocument,
  parseDocument,
  validateDocumentContent,
  type ParsedDocument,
} from '@/lib/documentParser';
import { extractDatesFromBuffer } from '@/lib/dateExtractor';
import { uploadToBunny, generateSOPDocumentPath } from '@/lib/bunnyStorage';
import { persistUploadPath } from '@/lib/persistUploadPath';
import { getDepartmentForSubcategory, extractSubcategoryFromIdentifier } from '@/lib/mcqTreeBuilder';
import { resolveSopLanguageForUpload } from '@/lib/detectSopLanguage';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

const useBunny = () =>
  Boolean(
    (process.env.BUNNY_STORAGE_ZONE || process.env.BUNNY_STORAGE_ZONE_NAME) &&
      (process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY) &&
      (process.env.BUNNY_PULL_ZONE_URL || process.env.BUNNY_CDN_HOSTNAME)
  );

function detectDepartment(filename: string, content: string): string {
  const text = (filename + ' ' + (content || '').substring(0, 500)).toLowerCase();
  const departmentKeywords: Record<string, string[]> = {
    QA: ['qa', 'quality assurance', 'audit', 'compliance', 'deviation', 'capa'],
    QC: ['qc', 'quality control', 'testing', 'analysis', 'laboratory', 'sampling'],
    Microbiology: ['microbiology', 'sterility', 'bioburden', 'environmental monitoring'],
    Production: ['production', 'manufacturing', 'aseptic', 'packing', 'pred', 'prep', 'prge'],
    Store: ['store', 'bsge', 'warehouse', 'storage', 'inventory', 'raw material'],
    'Engineering and Maintenance': ['engineering', 'maintenance', 'equipment', 'calibration', 'mage', 'hvac'],
    Personnel: ['personnel', 'hr', 'training', 'recruitment', 'pege', 'employee'],
  };
  for (const [dept, keywords] of Object.entries(departmentKeywords)) {
    if (keywords.some((k) => text.includes(k))) return dept;
  }
  return 'General';
}

function fileBaseName(fileName: string): string {
  const norm = fileName.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  return i >= 0 ? norm.slice(i + 1) : norm;
}

function shouldSkipUploadFileName(fileName: string): boolean {
  return fileBaseName(fileName).startsWith('~$');
}

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

function isGenericDepartment(d?: string | null): boolean {
  const v = String(d || '').trim().toLowerCase();
  return !v || v === 'general' || v === 'other' || v === 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const formData = await request.formData();
    const languageRaw = ((formData.get('language') as string) || 'auto').trim();
    const batchLanguage: 'English' | 'Gujarati' | 'auto' =
      languageRaw.toLowerCase() === 'auto'
        ? 'auto'
        : languageRaw === 'Gujarati'
          ? 'Gujarati'
          : 'English';
    const batchDepartment = formData.get('department') as string | null;
    // When `filesOnly` is set, the caller wants pure file ingest only — no MCQ pipeline,
    // no similarity / compliance runs. Used by Bulk upload SOP when the goal is to fill
    // missing DOCX/PDF on existing SOPs without paying for AI processing.
    const filesOnlyMode =
      formData.get('filesOnly') === '1' || formData.get('filesOnly') === 'true';

    let relativePathList: string[] = [];
    const rpRaw = formData.get('relativePaths');
    if (typeof rpRaw === 'string' && rpRaw.length > 0) {
      try {
        const parsedPaths = JSON.parse(rpRaw) as unknown;
        if (Array.isArray(parsedPaths)) {
          relativePathList = parsedPaths.map((x) => String(x ?? ''));
        }
      } catch {
        /* ignore invalid JSON */
      }
    }

    const files = (formData.getAll('files') as File[]).filter((v): v is File => v instanceof File && v.size > 0);
    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided. Add DOCX or PDF files.' },
        { status: 400 }
      );
    }

    const results: Array<{
      fileName: string;
      sopId: string;
      sopIdentifier: string;
      sopName: string;
      department: string;
      language: 'English' | 'Gujarati';
    }> = [];
    const errors: Array<{ fileName: string; error: string }> = [];
    const storeToBunny = useBunny();

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];
      const fileName = file.name || 'document';
      if (shouldSkipUploadFileName(fileName)) {
        continue;
      }
      const ext = fileName.toLowerCase().split('.').pop();
      if (!ext || !['docx', 'doc', 'pdf'].includes(ext)) {
        errors.push({ fileName, error: 'Only DOCX and PDF are supported' });
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileType = (ext === 'doc' ? 'docx' : ext) as 'pdf' | 'docx';

        const baseName = fileBaseName(fileName);
        const nameWithoutExt = baseName.replace(/\.(pdf|docx|doc)$/i, '');
        const codeMatch = nameWithoutExt.match(/([A-Z]{2,}[-_]?\d+[-_]?\d*)/i);
        const sopIdentifier = codeMatch ? codeMatch[1].toUpperCase().replace(/_/g, '-') : `SOP-${Date.now()}`;
        let sopName = nameWithoutExt;

        let parsed: ParsedDocument;
        try {
          if (ext === 'pdf') {
            try {
              parsed = await parseDocument(buffer, 'pdf', { lenient: true });
              if (!parsed.content.trim()) {
                const pages = parsed.metadata.pageCount;
                parsed = buildStubParsedDocument({
                  fileName: baseName,
                  sopIdentifier,
                  sopName,
                  pageCount: pages,
                  note: `No selectable text (${pages ?? '?'} page(s)). Likely scanned or image-only; use OCR or export a searchable PDF for search and MCQs.`,
                });
              }
            } catch (pdfErr) {
              const msg = pdfErr instanceof Error ? pdfErr.message : 'PDF text extraction failed';
              parsed = buildStubParsedDocument({
                fileName: baseName,
                sopIdentifier,
                sopName,
                note: msg,
              });
            }
          } else {
            try {
              parsed = await parseDocument(buffer, 'docx');
            } catch (docErr) {
              if (ext === 'doc') {
                parsed = buildStubParsedDocument({
                  fileName: baseName,
                  sopIdentifier,
                  sopName,
                  note: 'Legacy .doc is not parsed as DOCX. Save as .docx in Microsoft Word for full text extraction.',
                });
              } else {
                errors.push({
                  fileName,
                  error: docErr instanceof Error ? docErr.message : 'Failed to parse DOCX',
                });
                continue;
              }
            }
          }
        } catch (parseOuter) {
          errors.push({
            fileName,
            error: parseOuter instanceof Error ? parseOuter.message : 'Parse failed',
          });
          continue;
        }

        let validation = validateDocumentContent(parsed.content);
        if (!validation.isValid) {
          const err = validation.error || '';
          const allowStub =
            ext === 'pdf' ||
            ext === 'doc' ||
            (ext === 'docx' &&
              (/minimum\s+\d+\s+word/i.test(err) ||
                /empty/i.test(err) ||
                /scanned|password-protected/i.test(err)));
          if (allowStub) {
            parsed = buildStubParsedDocument({
              fileName: baseName,
              sopIdentifier,
              sopName,
              note: err || 'Insufficient extracted text for indexing.',
            });
            validation = { isValid: true };
          } else {
            errors.push({ fileName, error: err || 'Invalid content' });
            continue;
          }
        }

        const relFromClient =
          fileIndex < relativePathList.length && relativePathList[fileIndex]
            ? relativePathList[fileIndex]
            : fileName;
        const effectiveLanguage = resolveSopLanguageForUpload({
          batchLanguage,
          text: parsed.content,
          relativePath: relFromClient,
          baseName,
        });

        let department: string;
        if (batchDepartment) {
          department = normalizeDeptForDisplay(batchDepartment);
        } else {
          let headerDepartment = '';
          if (fileType === 'docx') {
            try {
              const { extractSOPHeaderTableData } = await import('@/lib/docxHeaderExtractor');
              const headerData = await extractSOPHeaderTableData(buffer);
              if (headerData?.department) {
                headerDepartment = normalizeDeptForDisplay(String(headerData.department).trim());
              }
              if (headerData?.subject) {
                sopName = String(headerData.subject).trim();
              }
            } catch {
              // Best-effort header extraction; continue with other detectors.
            }
          }
          const fromContent = detectDepartment(nameWithoutExt, parsed.content);
          const subcategory = extractSubcategoryFromIdentifier(sopIdentifier);
          const fromIdentifier = getDepartmentForSubcategory(subcategory);
          department =
            (!isGenericDepartment(headerDepartment) ? headerDepartment : '') ||
            (!isGenericDepartment(fromIdentifier) ? normalizeDeptForDisplay(fromIdentifier) : '') ||
            normalizeDeptForDisplay(fromContent);
        }

        const extractedDates = await extractDatesFromBuffer(buffer, fileType, parsed.content);
        const sanitizedDept = department.replace(/[^a-zA-Z0-9-_]/g, '_');
        let fileUrl: string;

        if (storeToBunny) {
          const bunnyPath = generateSOPDocumentPath(department, sopIdentifier, fileName);
          const cdnUrl = await uploadToBunny(buffer, bunnyPath);
          if (cdnUrl) {
            fileUrl = cdnUrl;
          } else {
            const localFileName = `${sopIdentifier}_${Date.now()}.${ext}`;
            fileUrl = `/uploads/sops/${sanitizedDept}/${localFileName}`;
          }
        } else {
          const localFileName = `${sopIdentifier}_${Date.now()}.${ext}`;
          fileUrl = `/uploads/sops/${sanitizedDept}/${localFileName}`;
        }

        const storedRemotely =
          fileUrl.startsWith('http://') ||
          fileUrl.startsWith('https://') ||
          fileUrl.startsWith('bunny://');
        if (!storedRemotely) {
          try {
            await persistUploadPath(fileUrl, buffer);
          } catch (persistErr) {
            console.error('upload-batch: failed to persist file:', persistErr);
          }
        }

        let sop = await SOP.findOne({ identifier: sopIdentifier, language: effectiveLanguage });
        if (sop) {
          if (!sop.name || sop.name === sopIdentifier) sop.name = sopName;
          if (!sop.department || isGenericDepartment(sop.department)) sop.department = department;
          sop.fileUrl = fileUrl;
          sop.fileType = fileType;
          sop.originalFileName = fileName;
          sop.content = parsed.content;
          sop.language = effectiveLanguage;
          sop.effectiveDate = extractedDates.effectiveDate ?? sop.effectiveDate;
          sop.reviewDate = extractedDates.reviewDate ?? sop.reviewDate;
          sop.expiryDate = extractedDates.expiryDate ?? sop.expiryDate;
          sop.version = extractedDates.version ?? sop.version;
          sop.metadata = {
            fileSize: buffer.length,
            wordCount: parsed.metadata.wordCount,
            pageCount: parsed.metadata.pageCount,
          };
          await sop.save();
        } else {
          sop = await SOP.create({
            name: sopName,
            identifier: sopIdentifier,
            department,
            fileUrl,
            fileType,
            originalFileName: fileName,
            content: parsed.content,
            language: effectiveLanguage,
            status: 'uploaded',
            effectiveDate: extractedDates.effectiveDate,
            reviewDate: extractedDates.reviewDate,
            expiryDate: extractedDates.expiryDate,
            version: extractedDates.version,
            metadata: {
              fileSize: buffer.length,
              wordCount: parsed.metadata.wordCount,
              pageCount: parsed.metadata.pageCount,
            },
          });
        }

        // Also create/update SOPLibrary record for dashboard visibility
        try {
          let sopLibrary = await SOPLibrary.findOne({
            sopIdentifier: sopIdentifier,
            language: effectiveLanguage,
          });

          if (sopLibrary) {
            // Update existing library entry
            sopLibrary.sopName = sop.name;
            sopLibrary.department = sop.department;
            sopLibrary.language = effectiveLanguage;
            // Add/update the uploaded document with language field
            const existingDocIndex = sopLibrary.sopDocuments?.findIndex(
              (d: any) => d.filePath === fileUrl
            ) ?? -1;
            if (existingDocIndex === -1) {
              sopLibrary.sopDocuments = [
                ...(sopLibrary.sopDocuments || []),
                {
                  fileName,
                  filePath: fileUrl,
                  fileType,
                  uploadedAt: new Date(),
                  fileSize: buffer.length,
                  language: effectiveLanguage,
                },
              ];
            }
            await sopLibrary.save();
          } else {
            // Create new library entry
            await SOPLibrary.create({
              sopId: sop._id,
              sopName: sop.name,
              sopIdentifier: sopIdentifier,
              department: sop.department,
              departmentCode: sopIdentifier.substring(0, 4).toUpperCase(),
              videos: [],
              slides: [],
              sopDocuments: [
                {
                  fileName,
                  filePath: fileUrl,
                  fileType,
                  uploadedAt: new Date(),
                  fileSize: buffer.length,
                  language: effectiveLanguage,
                },
              ],
              language: effectiveLanguage,
            });
          }
        } catch (libErr) {
          console.error(`Failed to create/update SOPLibrary for ${sopIdentifier}:`, libErr);
          // Don't fail the upload if library creation fails
        }

        results.push({
          fileName,
          sopId: String(sop._id),
          sopIdentifier: sop.identifier,
          sopName: sop.name,
          department: sop.department,
          language: effectiveLanguage,
        });
      } catch (err) {
        errors.push({
          fileName,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Revalidate/invalidate dashboard caches after successful uploads
    try {
      await revalidateTag('dashboard-sops', 'max');
    } catch (revalidateError) {
      console.warn('Failed to revalidate dashboard cache:', revalidateError);
      // Don't fail the upload if tag revalidation fails
    }
    if (results.length > 0) {
      void invalidateDashboardSopsCache();
    }

    // Deduplicate results by sopId. Multiple files (e.g. DOCX + PDF) for the same SOP
    // identifier+language hit the same SOP document, so they should produce ONE MCQ pipeline,
    // not one per file. Keep the last-seen entry (latest fileName).
    const dedupedResults: typeof results = [];
    const seenSopIds = new Set<string>();
    for (let i = results.length - 1; i >= 0; i--) {
      const r = results[i];
      if (seenSopIds.has(r.sopId)) continue;
      seenSopIds.add(r.sopId);
      dedupedResults.unshift(r);
    }
    const duplicateCount = results.length - dedupedResults.length;
    if (duplicateCount > 0) {
      console.log(
        `[upload-batch] Collapsed ${duplicateCount} multi-file entries into existing SOPs (same identifier+language)`
      );
    }

    // Fire pipeline (MCQ generation → similarity → compliance) once per unique SOP —
    // unless `filesOnly` was set, in which case the caller is using this endpoint as a
    // pure file-ingest tool and explicitly does NOT want AI processing to run.
    if (dedupedResults.length > 0 && !filesOnlyMode) {
      const baseUrl =
        process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

      for (const r of dedupedResults) {
        fetch(`${baseUrl}/api/sop/pipeline/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sopId: r.sopId,
            sopIdentifier: r.sopIdentifier,
            sopName: r.sopName,
            department: r.department,
            language: r.language,
          }),
        }).catch((err) =>
          console.error(`[upload-batch][PIPELINE] trigger failed for ${r.sopIdentifier}:`, err)
        );
      }
      console.log(`[upload-batch][PIPELINE] Triggered for ${dedupedResults.length} SOP(s)`);
    } else if (dedupedResults.length > 0 && filesOnlyMode) {
      console.log(`[upload-batch][PIPELINE] Skipped (filesOnly mode) for ${dedupedResults.length} SOP(s)`);
    }

    return NextResponse.json({
      success: true,
      uploaded: dedupedResults.length,
      filesProcessed: results.length,
      failed: errors.length,
      results: dedupedResults,
      errors,
      storage: storeToBunny ? 'bunny' : 'local',
    });
  } catch (error) {
    console.error('SOP upload-batch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Batch upload failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
