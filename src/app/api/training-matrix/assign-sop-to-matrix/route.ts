import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrixUpload from '@/models/TrainingMatrixUpload';
import TrainingMatrixRecord from '@/models/TrainingMatrixRecord';
import MatrixEntry from '@/models/MatrixEntry';
import MatrixSOPAssignment from '@/models/MatrixSOPAssignment';
import SOP from '@/models/SOP';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function stripVersion(code: string): string {
  return String(code || '').toUpperCase().replace(/-\d+$/, '').trim();
}

// POST /api/training-matrix/assign-sop-to-matrix
//
// Body: {
//   department: string
//   sopId: string                      — master SOP _id
//   month: number                      — effective month (1-12)
//   year: number
//   employees: Array<{
//     name: string
//     designation: string
//     trainingStatus: string           — 'completed' | 'pending' | 'not_required' | 'na'
//   }>
//   createdBy: string
// }
//
// Effect:
//   1. Creates / updates a MatrixSOPAssignment record (so the SOP is tracked as "in matrix")
//   2. Writes one TrainingMatrixRecord per employee (isAddendum: true, sourceFile: 'manual')
//   3. For 'pending' employees also writes a MatrixEntry
//   4. Appends the sopCode to the latest upload snapshot's sopCodes list
//      (so the Overview API sees it as "in Excel") and updates sopMonthMap
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { department, sopId, month, year, employees, createdBy } = body as {
      department: string;
      sopId: string;
      month: number;
      year: number;
      employees: Array<{ name: string; designation: string; trainingStatus: string }>;
      createdBy: string;
    };

    if (!department || !sopId || !month || !year || !employees?.length || !createdBy) {
      return NextResponse.json(
        { error: 'department, sopId, month, year, employees, and createdBy are required' },
        { status: 400 },
      );
    }

    // 1. Fetch SOP metadata (read-only master data)
    const sop = await SOP.findById(sopId).lean() as any;
    if (!sop) return NextResponse.json({ error: 'SOP not found in master database' }, { status: 404 });

    const sopCode   = stripVersion(String(sop.identifier || ''));
    const monthName = MONTH_NAMES[month - 1] || 'Unknown';

    // 2. Upsert the MatrixSOPAssignment so this SOP is tracked as "assigned"
    await MatrixSOPAssignment.updateOne(
      { department, sopCode, isActive: true },
      {
        $setOnInsert: {
          sopId:          sop._id,
          sopCode,
          sopName:        sop.name,
          effectiveMonth: month,
          effectiveYear:  year,
          designationApplicability: [],
          isActive:       true,
          createdBy,
        },
      },
      { upsert: true },
    );

    // 3. Find the latest upload for this department (to get an uploadId and update snapshot)
    const latestUpload = await TrainingMatrixUpload.findOne({
      department, fileType: 'main',
    }).sort({ uploadedAt: -1 });

    const uploadId = latestUpload?._id;

    // 4. Write TrainingMatrixRecord rows (one per employee) — isAddendum: true
    const recordOps = employees.map((emp) => ({
      updateOne: {
        filter: {
          employeeName: emp.name,
          sopCode,
          month,
          year,
          department,
        },
        update: {
          $set: {
            uploadId,
            designation:  emp.designation || '',
            monthName,
            status:       emp.trainingStatus === 'completed'    ? 'completed'
                        : emp.trainingStatus === 'not_required' ? 'not_required'
                        : emp.trainingStatus === 'na'           ? 'na'
                        : 'pending',
            // Use √ for pending (training required), ✓ for completed
            rawSymbol:    emp.trainingStatus === 'completed'    ? '✓'
                        : emp.trainingStatus === 'not_required' ? 'X'
                        : emp.trainingStatus === 'na'           ? 'NA'
                        : '√',
            sourceFile:  'manual',
            isAddendum:  true,
          },
        },
        upsert: true,
      },
    }));

    if (recordOps.length) {
      await TrainingMatrixRecord.bulkWrite(recordOps, { ordered: false });
    }

    // 5. For 'pending' employees also create a MatrixEntry (training required)
    const matrixEntryOps = employees
      .filter((e) => e.trainingStatus === 'pending' || !e.trainingStatus)
      .map((emp) => ({
        updateOne: {
          filter: { employeeName: emp.name, department, year, month, sopCode },
          update: {
            $set: {
              designation: emp.designation || '',
              monthName,
              sourceFile:  'manual',
              extractedAt: new Date(),
            },
          },
          upsert: true,
        },
      }));

    if (matrixEntryOps.length) {
      await MatrixEntry.bulkWrite(matrixEntryOps, { ordered: false });
    }

    // 6. Patch the upload snapshot so the Overview API sees this SOP as "in Excel"
    if (latestUpload) {
      const snap = (latestUpload.snapshot as any) || { sopCodes: [], sopMonthMap: {}, monthCounts: {}, employees: [] };
      const existingCodes: string[] = snap.sopCodes || [];
      if (!existingCodes.includes(sopCode)) {
        existingCodes.push(sopCode);
      }
      // Map this SOP to the month of the upload (use upload's stored month name)
      const sopMonthMap: Record<string, string> = snap.sopMonthMap || {};
      sopMonthMap[sopCode] = monthName;

      // Update monthCounts: increment the count for the relevant month
      const monthCounts: Record<string, number> = snap.monthCounts || {};
      if (!existingCodes.includes(sopCode)) {
        // only increment if it was genuinely new
        monthCounts[monthName] = (monthCounts[monthName] || 0) + 1;
      }

      // Update each employee's training map to include the new sopCode
      const snapshotEmployees: Array<{ name: string; designation: string; training: Record<string, boolean> }> = snap.employees || [];
      for (const emp of employees) {
        const existing = snapshotEmployees.find((e) => e.name === emp.name);
        const isRequired = emp.trainingStatus === 'pending' || !emp.trainingStatus;
        if (existing) {
          existing.training = existing.training || {};
          existing.training[sopCode] = isRequired;
        } else {
          snapshotEmployees.push({
            name:        emp.name,
            designation: emp.designation || '',
            training:    { [sopCode]: isRequired },
          });
        }
      }

      await TrainingMatrixUpload.findByIdAndUpdate(latestUpload._id, {
        $set: {
          'snapshot.sopCodes':    existingCodes,
          'snapshot.sopMonthMap': sopMonthMap,
          'snapshot.monthCounts': monthCounts,
          'snapshot.employees':   snapshotEmployees,
          sopCount: existingCodes.length,
        },
      });

      // Bust the overview cache so the next fetch picks up the change
      const g = globalThis as any;
      if (g.__tm_overview_cache) g.__tm_overview_cache = {};
    }

    return NextResponse.json({
      success: true,
      sopCode,
      recordsWritten: employees.length,
      message: `SOP ${sopCode} added to ${department} matrix for ${employees.length} employee(s).`,
    }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
