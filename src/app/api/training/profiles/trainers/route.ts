import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';

// GET /api/training/profiles/trainers
// Returns one auto-generated profile per trainer aggregated from TrainingMatrix
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || 'all';
    const department = searchParams.get('department') || 'all';

    const matchStage: any = {};
    if (month !== 'all') {
      const [y, m] = month.split('-').map(Number);
      matchStage.trainingDate = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) };
    }
    if (department !== 'all') matchStage.department = department;

    // Main trainer profile aggregation
    const profiles = await TrainingMatrix.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$trainerName',
          department: { $first: '$department' },
          sopList: {
            $push: {
              sopIdentifier: '$sopIdentifier',
              sopName: '$sopName',
              employeeName: '$employeeName',
              status: '$status',
              passStatus: '$passStatus',
              score: '$score',
              retestRequired: '$retestRequired',
              trainingDate: '$trainingDate',
            }
          },
          totalRecords: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $in: ['$status', ['Completed', 'Trained']] }, 1, 0] } },
          passed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Pass'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Fail'] }, 1, 0] } },
          retests: { $sum: { $cond: ['$retestRequired', 1, 0] } },
          acknowledged: { $sum: { $cond: [{ $ifNull: ['$acknowledgedAt', false] }, 1, 0] } },
          avgScore: { $avg: '$score' },
          nextScheduled: { $min: '$trainingDate' }, // earliest training date
        }
      },
      {
        $addFields: {
          trainerName: '$_id',
          passRate: {
            $cond: [{ $eq: ['$totalRecords', 0] }, 0, {
              $multiply: [{ $divide: ['$passed', '$totalRecords'] }, 100]
            }]
          },
          // Unique SOPs
          uniqueSOPs: { $size: { $setUnion: ['$sopList.sopIdentifier'] } },
          // Unique employees
          uniqueEmployees: { $size: { $setUnion: ['$sopList.employeeName'] } },
        }
      },
      { $sort: { pending: -1, trainerName: 1 } }
    ]);

    // Build SOP-level summary per trainer
    const profilesWithSOPSummary = profiles.map((p: any) => {
      // Group sopList by sopIdentifier
      const sopMap: Record<string, any> = {};
      for (const s of p.sopList) {
        if (!sopMap[s.sopIdentifier]) {
          sopMap[s.sopIdentifier] = {
            sopIdentifier: s.sopIdentifier,
            sopName: s.sopName,
            employees: [],
            pending: 0, inProgress: 0, completed: 0, passed: 0, failed: 0, retests: 0,
          };
        }
        const sop = sopMap[s.sopIdentifier];
        sop.employees.push(s.employeeName);
        if (s.status === 'Pending') sop.pending++;
        if (s.status === 'In Progress') sop.inProgress++;
        if (['Completed', 'Trained'].includes(s.status)) sop.completed++;
        if (s.passStatus === 'Pass') sop.passed++;
        if (s.passStatus === 'Fail') sop.failed++;
        if (s.retestRequired) sop.retests++;
      }
      const sopSummary = Object.values(sopMap).map((s: any) => ({
        ...s,
        employeeCount: [...new Set(s.employees)].length,
        employees: undefined,
      }));
      return { ...p, sopList: undefined, sopSummary };
    });

    // Filters
    const departments: string[] = await TrainingMatrix.distinct('department');
    const monthAgg = await TrainingMatrix.aggregate([
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$trainingDate' } } } },
      { $sort: { _id: -1 } }
    ]);
    const months = monthAgg.map((x: any) => x._id).filter(Boolean);

    return NextResponse.json({
      success: true,
      profiles: profilesWithSOPSummary,
      filters: { departments, months },
    });
  } catch (error: any) {
    console.error('Trainer profiles error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
