import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrixUpload from '@/models/TrainingMatrixUpload';
import TrainingMatrixRecord from '@/models/TrainingMatrixRecord';
import MatrixEntry from '@/models/MatrixEntry';
import { parseTrainingMatrixFile } from '@/lib/trainingMatrixParser';
import {
  parseTrainingMatrixMonthAware,
  detectDepartmentFromName,
} from '@/lib/trainingMatrixMonthParser';
import { uploadToBunny } from '@/lib/bunnyStorage';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const formData = await request.formData();

    const files: File[] = [];
    for (const [, value] of formData.entries()) {
      if (value instanceof File) files.push(value);
    }

    const monthOverride = formData.get('month') ? parseInt(formData.get('month') as string) : null;
    const yearOverride  = formData.get('year')  ? parseInt(formData.get('year')  as string) : null;
    const deptOverride  = (formData.get('department') as string) || null;
    const fileTypeParam = (formData.get('fileType') as 'main' | 'addendum') || 'main';
    const clearAll = String(formData.get('clearAll') || '').toLowerCase() === 'true';

    if (!files.length) {
      return NextResponse.json({ success: false, error: 'No files uploaded' }, { status: 400 });
    }

    const results = [];

    // If the user is re-uploading the full set, make uploads the single source of truth:
    // wipe existing matrix records before importing the new files.
    if (clearAll) {
      await Promise.all([
        TrainingMatrixUpload.deleteMany({ fileType: fileTypeParam }),
        TrainingMatrixRecord.deleteMany({}),
        MatrixEntry.deleteMany({}),
      ]);
    }

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());

        // Month-aware snapshot parse (row 0 = months, row 1 = SOP codes, row 2+ = employees)
        let snapshot: ReturnType<typeof parseTrainingMatrixMonthAware> | null = null;
        try {
          snapshot = parseTrainingMatrixMonthAware(buffer, file.name);
        } catch {
          snapshot = null;
        }

        // Status-level parse (used by existing records/entries pipeline)
        const parsed = await parseTrainingMatrixFile(buffer, file.name);

        let month = monthOverride ?? parsed.month;
        let year = yearOverride ?? parsed.year;
        if (!Number.isFinite(month) || month < 1 || month > 12) {
          month = new Date().getMonth() + 1;
        }
        if (!Number.isFinite(year) || year < 2000 || year > 2100) {
          year = new Date().getFullYear();
        }
        const dept = (deptOverride
          ?? (snapshot?.department && snapshot.department !== 'Unknown' ? snapshot.department : null)
          ?? parsed.department
          ?? detectDepartmentFromName(file.name))?.trim() || 'Unknown';
        const monthName = MONTH_NAMES[month - 1] || 'Unknown';

        // Upload raw file to Bunny CDN (best effort; continue if it fails)
        const bunnyPath = `training-matrix/${sanitizeFileName(dept)}/${Date.now()}-${sanitizeFileName(file.name)}`;
        let fileUrl: string | undefined;
        try {
          const cdnUrl = await uploadToBunny(buffer, bunnyPath);
          if (cdnUrl) fileUrl = cdnUrl;
        } catch (e) {
          console.warn('[training-matrix upload] Bunny upload failed:', e);
        }

        // Replace prior upload snapshot for this department
        await TrainingMatrixUpload.deleteMany({ department: dept, fileType: fileTypeParam });

        const upload = await TrainingMatrixUpload.create({
          department: dept,
          fileName: file.name,
          fileType: fileTypeParam,
          month,
          year,
          monthName,
          employeeCount: parsed.employees.length,
          sopCount: parsed.sopCodes.length,
          fileUrl,
          bunnyPath: fileUrl ? bunnyPath : undefined,
          snapshot: snapshot ? {
            sopCodes: snapshot.sopCodes,
            sopMonthMap: snapshot.sopMonthMap,
            monthCounts: snapshot.monthCounts,
            employees: snapshot.employees,
          } : undefined,
        });

        let imported = 0;
        const matrixEntryOps = [];
        const recordOps = [];

        for (const emp of parsed.employees) {
          for (const [sopCode, { status, raw }] of Object.entries(emp.trainings)) {
            recordOps.push({
              updateOne: {
                filter: { employeeName: emp.name, sopCode, month, year, department: dept },
                update: {
                  $set: {
                    uploadId: upload._id, designation: emp.designation,
                    monthName, status, rawSymbol: raw,
                    sourceFile: file.name, isAddendum: fileTypeParam === 'addendum',
                  },
                },
                upsert: true,
              },
            });

            if (status === 'pending') {
              matrixEntryOps.push({
                updateOne: {
                  filter: { employeeName: emp.name, department: dept, year, month, sopCode },
                  update: { $set: { designation: emp.designation, monthName, sourceFile: file.name, extractedAt: new Date() } },
                  upsert: true,
                },
              });
            }

            imported++;
          }
        }

        if (recordOps.length)      await TrainingMatrixRecord.bulkWrite(recordOps,      { ordered: false });
        if (matrixEntryOps.length) await MatrixEntry.bulkWrite(matrixEntryOps,          { ordered: false });

        await TrainingMatrixUpload.findByIdAndUpdate(upload._id, { recordsImported: imported });

        results.push({
          fileName: file.name,
          department: dept,
          month,
          year,
          employees: parsed.employees.length,
          sops: parsed.sopCodes.length,
          records: imported,
          fileUrl: fileUrl || null,
          ok: true,
        });
      } catch (err: any) {
        let message = err?.message || 'Parse failed';
        if (/could not find workbook/i.test(message)) {
          message =
            'Not a valid Excel workbook (often happens with .docx Word files). Export the training matrix as .xlsx and upload that.';
        }
        results.push({ fileName: file.name, ok: false, error: message });
      }
    }

    return NextResponse.json({ success: true, results, cleared: clearAll });
  } catch (error: any) {
    console.error('training-matrix upload error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
