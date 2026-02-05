import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';

// Department mapping from old to new
const departmentMapping: Record<string, string> = {
  'General': 'QA',
  'Quality Assurance': 'QA',
  'Quality Assurance (QA)': 'QA',
  'Quality Control (QC)': 'QC',
  'Production': 'Production',
  'Human Resources (HR)': 'Personnel',
  'Warehouse / Logistics': 'Store',
  'Maintenance / Engineering': 'Engineering and Maintenance',
  'EHS': 'QA',
  'Information Technology (IT)': 'QA',
};

export async function POST() {
  try {
    await connectDB();

    const results = {
      sops: { total: 0, updated: 0, details: [] as any[] },
      mcqBanks: { total: 0, updated: 0, details: [] as any[] },
    };

    // Migrate SOPs using direct update
    const sops = await SOP.find({}).lean();
    results.sops.total = sops.length;

    for (const sop of sops) {
      const oldDept = sop.department;
      const newDept = departmentMapping[oldDept];

      if (newDept && newDept !== oldDept) {
        await SOP.updateOne(
          { _id: sop._id },
          { $set: { department: newDept } }
        );
        results.sops.updated++;
        results.sops.details.push({
          id: sop._id,
          name: sop.name,
          old: oldDept,
          new: newDept,
        });
      }
    }

    // Migrate MCQ Banks using direct update (bypasses validation)
    const mcqBanks = await MCQBank.find({}).lean();
    results.mcqBanks.total = mcqBanks.length;

    for (const bank of mcqBanks) {
      const oldDept = bank.department;
      const newDept = departmentMapping[oldDept];

      if (newDept && newDept !== oldDept) {
        await MCQBank.updateOne(
          { _id: bank._id },
          { $set: { department: newDept } }
        );
        results.mcqBanks.updated++;
        results.mcqBanks.details.push({
          id: bank._id,
          sopName: bank.sopName,
          old: oldDept,
          new: newDept,
        });
      }
    }

    // Get final department counts
    const departmentCounts: Record<string, number> = {};
    const allSops = await SOP.find({}).lean();
    
    for (const sop of allSops) {
      departmentCounts[sop.department] = (departmentCounts[sop.department] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      message: 'Department migration completed successfully',
      results,
      departmentCounts,
    });

  } catch (error) {
    console.error('❌ Migration error:', error);
    
    // Log detailed error information
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    return NextResponse.json(
      {
        success: false,
        error: 'Migration failed',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
