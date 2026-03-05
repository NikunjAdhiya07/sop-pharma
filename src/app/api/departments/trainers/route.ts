import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import DepartmentTrainer from '@/models/DepartmentTrainer';
import TrainingMatrix from '@/models/TrainingMatrix';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    // First try dedicated DepartmentTrainer collection
    const dedicatedTrainers = await DepartmentTrainer.find({}).sort({ departmentName: 1 });
    
    let result: any[] = dedicatedTrainers;
    
    // If no dedicated trainer records, derive from TrainingMatrix data
    if (!dedicatedTrainers || dedicatedTrainers.length === 0) {
      const matrixTrainers = await TrainingMatrix.aggregate([
        { $match: { employeeName: { $exists: true, $nin: [null, ''] } } },
        { $group: { _id: '$department', employees: { $addToSet: '$employeeName' } } },
        { $sort: { _id: 1 } }
      ]);
      
      result = matrixTrainers.map((t: any) => ({
        departmentName: t._id,
        trainerName: t.employees.slice(0, 2).join(', ') + (t.employees.length > 2 ? '...' : '')
      }));
    }

    // Also return SOP-specific trainer names from DepartmentTrainer (sopIdentifier field)
    const sopSpecificTrainers = await DepartmentTrainer.find({ sopIdentifier: { $exists: true, $ne: '' } });
    const sopMapping: Record<string, string> = {};
    
    // From SOP-specific DepartmentTrainer records
    sopSpecificTrainers.forEach((t: any) => {
      if (t.sopIdentifier) {
        sopMapping[t.sopIdentifier.toUpperCase()] = t.trainerName;
      }
    });

    // Also from TrainingMatrix (fallback)
    const matrixSopTrainers = await TrainingMatrix.aggregate([
      { $match: { employeeName: { $exists: true, $nin: [null, ''] } } },
      { $group: { _id: '$sopIdentifier', employees: { $addToSet: '$employeeName' } } }
    ]);
    matrixSopTrainers.forEach((t: any) => {
      if (!sopMapping[t._id?.toUpperCase()]) {
        sopMapping[t._id?.toUpperCase()] = t.employees.slice(0, 2).join(', ') + (t.employees.length > 2 ? '...' : '');
      }
    });
    
    return NextResponse.json({ 
      success: true, 
      trainers: result,
      sopTrainers: sopMapping 
    });
  } catch (error) {
    console.error('Error fetching trainers:', error);
    return NextResponse.json({ error: 'Failed to fetch trainers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    const colKeys = Object.keys(data[0] || {});

    // User-specified column mappings from form data (sent from the frontend preview UI)
    const deptColName = (formData.get('deptCol') as string) || '';
    const trainerColName = (formData.get('trainerCol') as string) || '';
    const sopColName = (formData.get('sopCol') as string) || '';

    // Auto-detect fallback
    const AUTO_DEPT_HEADERS = ['Department Name', 'SOP Department', 'Department', 'Dept'];
    const AUTO_TRAINER_HEADERS = ['Trainer Name', 'Trainer', "Trainer's Name", 'Training Officer', 'Training Incharge'];
    const AUTO_SOP_HEADERS = ['SOP Code', 'SOP No', 'SOP', 'SOP Identifier', 'Protocol ID', 'SOP Number'];

    const findKey = (candidates: string[]): string | null => {
      return colKeys.find(k => candidates.some(c => k.toLowerCase().trim() === c.toLowerCase())) || null;
    };

    const deptKey = (deptColName && colKeys.includes(deptColName)) ? deptColName : findKey(AUTO_DEPT_HEADERS);
    const trainerKey = (trainerColName && colKeys.includes(trainerColName)) ? trainerColName : findKey(AUTO_TRAINER_HEADERS);
    const sopKey = (sopColName && colKeys.includes(sopColName)) ? sopColName : findKey(AUTO_SOP_HEADERS);

    if (!trainerKey) {
      return NextResponse.json({ 
        error: `Cannot find trainer column. Columns found: ${colKeys.join(', ')}. Please select the correct trainer column.`,
        availableColumns: colKeys,
      }, { status: 400 });
    }

    if (!deptKey && !sopKey) {
      return NextResponse.json({ 
        error: `Cannot find department or SOP column. Columns found: ${colKeys.join(', ')}. Please select the correct column.`,
        availableColumns: colKeys,
      }, { status: 400 });
    }

    const results = { saved: 0, skipped: 0 };

    for (const row of data) {
      const trainerName = row[trainerKey]?.toString().trim();
      if (!trainerName) { results.skipped++; continue; }

      // SOP-level assignment
      if (sopKey) {
        const sopCode = row[sopKey]?.toString().trim().toUpperCase();
        if (sopCode) {
          const deptName = deptKey ? row[deptKey]?.toString().trim() : '';
          await DepartmentTrainer.findOneAndUpdate(
            { sopIdentifier: sopCode },
            { sopIdentifier: sopCode, trainerName, departmentName: deptName },
            { upsert: true, new: true }
          );
          results.saved++;
          continue;
        }
      }

      // Department-level assignment
      if (deptKey) {
        const deptName = row[deptKey]?.toString().trim();
        if (!deptName) { results.skipped++; continue; }

        const escaped = deptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        await DepartmentTrainer.findOneAndUpdate(
          { departmentName: { $regex: new RegExp(`^${escaped}$`, 'i') } },
          { trainerName, departmentName: deptName },
          { upsert: true, new: true }
        );
        results.saved++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully saved ${results.saved} trainer assignment${results.saved !== 1 ? 's' : ''}${results.skipped > 0 ? ` (${results.skipped} rows skipped — no trainer name)` : ''}.`,
      results 
    });

  } catch (error: any) {
    console.error('Error processing trainer file:', error);
    return NextResponse.json({ error: error.message || 'Failed to process file' }, { status: 500 });
  }
}

// PUT - Save individual trainer assignment (inline editing)
export async function PUT(request: NextRequest) {
  try {
    await connectDB();
    const { departmentName, trainerName } = await request.json();

    if (!departmentName || !trainerName) {
      return NextResponse.json({ error: 'departmentName and trainerName are required' }, { status: 400 });
    }

    const escaped = departmentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const result = await DepartmentTrainer.findOneAndUpdate(
      { departmentName: { $regex: new RegExp(`^${escaped}$`, 'i') } },
      { departmentName, trainerName },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, trainer: result });
  } catch (error: any) {
    console.error('Error saving trainer:', error);
    return NextResponse.json({ error: error.message || 'Failed to save trainer' }, { status: 500 });
  }
}
