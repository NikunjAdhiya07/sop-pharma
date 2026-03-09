import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';
import MCQBank from '@/models/MCQBank';
import User from '@/models/User';

// POST /api/training/matrix/validate — dry-run validation before saving
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { records } = await request.json();
    // records: Array<{ employeeName, sopIdentifier, trainerName, trainingDate, department, sopName? }>

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'No records provided' }, { status: 400 });
    }

    // Pre-fetch existing data for fast lookups
    const uniqueSOPs = [...new Set(records.map((r: any) => r.sopIdentifier).filter(Boolean))];
    const uniqueTrainers = [...new Set(records.map((r: any) => r.trainerName).filter(Boolean))];

    // Check which SOPs have MCQ banks
    const mcqBanks = await MCQBank.find({ sopIdentifier: { $in: uniqueSOPs } }, { sopIdentifier: 1 });
    const mcqBankSOPs = new Set(mcqBanks.map((b: any) => b.sopIdentifier));

    // Check which trainers exist in system as eligible trainers
    const eligibleTrainers = await User.find({ isTrainerEligible: true }, { name: 1 });
    const trainerNames = new Set<string>();
    eligibleTrainers.forEach((t: any) => {
      trainerNames.add(t.name.trim().toLowerCase());
    });

    // Check for duplicates in DB
    const existenceChecks = records.map((r: any) => ({
      employeeName: r.employeeName,
      sopIdentifier: r.sopIdentifier,
      trainingDate: r.trainingDate ? new Date(r.trainingDate) : null,
    })).filter((r: any) => r.trainingDate);

    // Count existing duplicates efficiently
    const existingDocs = await TrainingMatrix.find({
      $or: existenceChecks.map((r: any) => ({
        employeeName: r.employeeName,
        sopIdentifier: r.sopIdentifier,
        trainingDate: {
          $gte: new Date(r.trainingDate.getFullYear(), r.trainingDate.getMonth(), 1),
          $lt: new Date(r.trainingDate.getFullYear(), r.trainingDate.getMonth() + 1, 1),
        },
      }))
    }, { employeeName: 1, sopIdentifier: 1 });

    const existingSet = new Set(existingDocs.map((d: any) => `${d.employeeName}::${d.sopIdentifier}`));

    // Analyse each record
    const errors: string[] = [];
    const warnings: string[] = [];
    let duplicates = 0;
    let missingSOP = 0;
    let unknownTrainers = 0;
    let missingData = 0;
    let ready = 0;

    const unknownTrainerSet = new Set<string>();
    const missingSOPSet = new Set<string>();

    for (const r of records) {
      let hasError = false;

      if (!r.employeeName || !r.sopIdentifier) {
        missingData++;
        hasError = true;
      }

      if (r.trainerName && !trainerNames.has(r.trainerName.trim().toLowerCase())) {
        unknownTrainerSet.add(r.trainerName);
        unknownTrainers++;
        hasError = true;
      }

      if (r.sopIdentifier && !mcqBankSOPs.has(r.sopIdentifier)) {
        missingSOPSet.add(r.sopIdentifier);
        missingSOP++;
        // This is a warning, not a hard error — record can still be saved, just no test will auto-assign
      }

      if (existingSet.has(`${r.employeeName}::${r.sopIdentifier}`)) {
        duplicates++;
        hasError = true;
      }

      if (!hasError) ready++;
    }

    if (unknownTrainerSet.size > 0) {
      warnings.push(`${unknownTrainerSet.size} trainer(s) not found in system: ${[...unknownTrainerSet].slice(0, 5).join(', ')}${unknownTrainerSet.size > 5 ? '...' : ''}`);
    }
    if (missingSOPSet.size > 0) {
      warnings.push(`${missingSOPSet.size} SOP(s) have no MCQ bank yet — tests cannot be auto-scheduled for these: ${[...missingSOPSet].slice(0, 5).join(', ')}${missingSOPSet.size > 5 ? '...' : ''}`);
    }
    if (duplicates > 0) {
      errors.push(`${duplicates} record(s) already exist in the database and will be skipped.`);
    }
    if (missingData > 0) {
      errors.push(`${missingData} record(s) are missing required fields (Employee Name or SOP Code) and will be skipped.`);
    }

    return NextResponse.json({
      success: true,
      total: records.length,
      ready: ready + missingSOP, // records with missing MCQ can still be saved
      duplicates,
      missingSOP,
      unknownTrainers: unknownTrainerSet.size,
      missingData,
      errors,
      warnings,
      schedulable: ready, // records that can be immediately auto-scheduled
    });
  } catch (error: any) {
    console.error('Validate error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
