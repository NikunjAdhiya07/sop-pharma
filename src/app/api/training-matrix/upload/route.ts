import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrixUpload from '@/models/TrainingMatrixUpload';
import TrainingMatrixRecord from '@/models/TrainingMatrixRecord';
import MatrixEntry from '@/models/MatrixEntry';
import { parseTrainingMatrixFile } from '@/lib/trainingMatrixParser';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

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

    if (!files.length) {
      return NextResponse.json({ success: false, error: 'No files uploaded' }, { status: 400 });
    }

    const results = [];

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const parsed = await parseTrainingMatrixFile(buffer, file.name);

        let month = monthOverride ?? parsed.month;
        let year = yearOverride ?? parsed.year;
        if (!Number.isFinite(month) || month < 1 || month > 12) {
          month = new Date().getMonth() + 1;
        }
        if (!Number.isFinite(year) || year < 2000 || year > 2100) {
          year = new Date().getFullYear();
        }
        const dept = (deptOverride ?? parsed.department)?.trim() || 'Unknown';
        const monthName = MONTH_NAMES[month - 1] || 'Unknown';

        // Create upload record
        const upload = await TrainingMatrixUpload.create({
          department: dept,
          fileName: file.name,
          fileType: fileTypeParam,
          month,
          year,
          monthName,
          employeeCount: parsed.employees.length,
          sopCount: parsed.sopCodes.length,
        });

        let imported = 0;
        const matrixEntryOps = [];
        const recordOps = [];

        for (const emp of parsed.employees) {
          for (const [sopCode, { status, raw }] of Object.entries(emp.trainings)) {
            // Upsert TrainingMatrixRecord
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

            // Write to MatrixEntry for 'pending' (ticks: √) — meaning the employee HAS to give the test
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

        if (recordOps.length)     await TrainingMatrixRecord.bulkWrite(recordOps,     { ordered: false });
        if (matrixEntryOps.length) await MatrixEntry.bulkWrite(matrixEntryOps,         { ordered: false });

        await TrainingMatrixUpload.findByIdAndUpdate(upload._id, { recordsImported: imported });

        results.push({
          fileName: file.name,
          department: dept,
          month,
          year,
          employees: parsed.employees.length,
          sops: parsed.sopCodes.length,
          records: imported,
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

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('training-matrix upload error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
