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
      
      // Format to match the DepartmentTrainer shape
      result = matrixTrainers.map((t: any) => ({
        departmentName: t._id,
        trainerName: t.employees.slice(0, 2).join(', ') + (t.employees.length > 2 ? '...' : '')
      }));
    }

    // NEW: Also return SOP-specific trainer names
    const sopTrainers = await TrainingMatrix.aggregate([
      { $match: { employeeName: { $exists: true, $nin: [null, ''] } } },
      { $group: { _id: '$sopIdentifier', employees: { $addToSet: '$employeeName' } } }
    ]);

    const sopMapping: Record<string, string> = {};
    sopTrainers.forEach((t: any) => {
      sopMapping[t._id.toUpperCase()] = t.employees.slice(0, 2).join(', ') + (t.employees.length > 2 ? '...' : '');
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
    const data = XLSX.utils.sheet_to_json(worksheet) as any[];

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    // Expected headers (case insensitive or common variants)
    const deptHeaders = ['Department Name', 'SOP Department', 'Department', 'Dept'];
    const trainerHeaders = ['Trainer Name', 'Trainer'];

    const findKey = (row: any, candidates: string[]) => {
      const keys = Object.keys(row);
      return keys.find(k => candidates.some(c => k.toLowerCase().trim() === c.toLowerCase()));
    };

    const deptKey = findKey(data[0], deptHeaders);
    const trainerKey = findKey(data[0], trainerHeaders);

    if (!deptKey || !trainerKey) {
      return NextResponse.json({ 
        error: `Missing required columns. Found: ${Object.keys(data[0]).join(', ')}. Need something like: "Department Name" and "Trainer Name"` 
      }, { status: 400 });
    }

    const results = {
      updated: 0,
      created: 0,
      errors: 0
    };

    for (const row of data) {
      const deptName = row[deptKey]?.toString().trim();
      const trainerName = row[trainerKey]?.toString().trim();

      if (!deptName || !trainerName) {
        results.errors++;
        continue;
      }

      // Upsert: update if exists, create if not
      const updated = await DepartmentTrainer.findOneAndUpdate(
        { departmentName: { $regex: new RegExp(`^${deptName}$`, 'i') } },
        { trainerName: trainerName },
        { upsert: true, new: true }
      );

      if (updated.createdAt.getTime() === updated.updatedAt.getTime()) {
        results.created++;
      } else {
        results.updated++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Processed ${data.length} rows: ${results.created} created, ${results.updated} updated, ${results.errors} skipped.`,
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

    const result = await DepartmentTrainer.findOneAndUpdate(
      { departmentName: { $regex: new RegExp(`^${departmentName}$`, 'i') } },
      { departmentName, trainerName },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, trainer: result });
  } catch (error: any) {
    console.error('Error saving trainer:', error);
    return NextResponse.json({ error: error.message || 'Failed to save trainer' }, { status: 500 });
  }
}
