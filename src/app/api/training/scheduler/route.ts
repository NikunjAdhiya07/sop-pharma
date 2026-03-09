import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';

// GET /api/training/scheduler — trainer-wise scheduling overview
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || 'all';
    const department = searchParams.get('department') || 'all';

    const matchStage: any = {};
    if (month !== 'all') {
      const [y, m] = month.split('-').map(Number);
      matchStage.trainingDate = {
        $gte: new Date(y, m - 1, 1),
        $lt: new Date(y, m, 1),
      };
    }
    if (department !== 'all') matchStage.department = department;

    // Trainer-wise aggregation for scheduler view
    const trainerRows = await TrainingMatrix.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { trainer: '$trainerName', dept: '$department' },
          sopCodes: { $addToSet: '$sopIdentifier' },
          employees: { $addToSet: '$employeeName' },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $in: ['$status', ['Completed', 'Trained']] }, 1, 0] } },
          retestRequired: { $sum: { $cond: ['$retestRequired', 1, 0] } },
          total: { $sum: 1 },
        }
      },
      {
        $project: {
          trainer: '$_id.trainer',
          department: '$_id.dept',
          sopCount: { $size: '$sopCodes' },
          employeeCount: { $size: '$employees' },
          sopCodes: 1,
          employees: 1,
          pending: 1,
          inProgress: 1,
          completed: 1,
          retestRequired: 1,
          total: 1,
        }
      },
      { $sort: { pending: -1, trainer: 1 } }
    ]);

    // SOP-wise aggregation
    const sopRows = await TrainingMatrix.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { sop: '$sopIdentifier', sopName: '$sopName', trainer: '$trainerName' },
          employees: { $addToSet: '$employeeName' },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $in: ['$status', ['Completed', 'Trained']] }, 1, 0] } },
          total: { $sum: 1 },
        }
      },
      {
        $project: {
          sopIdentifier: '$_id.sop',
          sopName: '$_id.sopName',
          trainer: '$_id.trainer',
          employeeCount: { $size: '$employees' },
          pending: 1,
          inProgress: 1,
          completed: 1,
          total: 1,
        }
      },
      { $sort: { pending: -1 } },
      { $limit: 100 }
    ]);

    // Full summary via aggregate (includes all statuses)
    const summaryAgg = await TrainingMatrix.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          total:     { $sum: 1 },
          pending:   { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          inProgress:{ $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $in: ['$status', ['Completed', 'Trained']] }, 1, 0] } },
          passed:    { $sum: { $cond: [{ $eq: ['$passStatus', 'Pass'] }, 1, 0] } },
          failed:    { $sum: { $cond: [{ $eq: ['$passStatus', 'Fail'] }, 1, 0] } },
          retests:   { $sum: { $cond: ['$retestRequired', 1, 0] } },
        }
      }
    ]);
    const s = summaryAgg[0] ?? { total:0, pending:0, inProgress:0, completed:0, passed:0, failed:0, retests:0 };
    const totals = {
      ...s,
      trainers: trainerRows.filter((r:any) => r.trainer && r.trainer !== 'null').length,
      sops: new Set(sopRows.map((r:any) => r.sopIdentifier)).size,
      employees: s.total - s.completed, // rough proxy for unique active
      passRate: s.total ? Math.round((s.passed / s.total) * 100) : 0,
    };

    const departments: string[] = await TrainingMatrix.distinct('department');
    const monthAgg = await TrainingMatrix.aggregate([
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$trainingDate' } } } },
      { $sort: { _id: -1 } }
    ]);
    const months = monthAgg.map((x: any) => x._id).filter(Boolean);

    return NextResponse.json({
      success: true,
      trainerRows,
      sopRows,
      totals,
      filters: { departments, months },
    });
  } catch (error: any) {
    console.error('Scheduler GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
