import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';

// GET /api/training/report — trainer-wise and month-wise stats
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

    // Trainer-wise report
    const trainerReport = await TrainingMatrix.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { trainer: '$trainerName', dept: '$department' },
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Pass'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Fail'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          avgScore: { $avg: { $cond: [{ $ne: ['$score', null] }, '$score', null] } },
          retests: { $sum: { $cond: ['$retestRequired', 1, 0] } },
          acknowledged: { $sum: { $cond: [{ $ne: ['$acknowledgedAt', null] }, 1, 0] } },
        }
      },
      { $sort: { '_id.trainer': 1 } }
    ]);

    // Month-wise report
    const monthReport = await TrainingMatrix.aggregate([
      { $match: department !== 'all' ? { department } : {} },
      {
        $group: {
          _id: {
            year: { $year: '$trainingDate' },
            month: { $month: '$trainingDate' },
            department: '$department'
          },
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Pass'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Fail'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          retests: { $sum: { $cond: ['$retestRequired', 1, 0] } },
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 60 }
    ]);

    // SOP-wise report
    const sopReport = await TrainingMatrix.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { sop: '$sopIdentifier', sopName: '$sopName' },
          total: { $sum: 1 },
          passed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Pass'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Fail'] }, 1, 0] } },
          avgScore: { $avg: { $cond: [{ $ne: ['$score', null] }, '$score', null] } },
          trainer: { $first: '$trainerName' },
        }
      },
      { $sort: { total: -1 } },
      { $limit: 50 }
    ]);

    // Department summary
    const deptSummary = await TrainingMatrix.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$department',
          total: { $sum: 1 },
          passed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Pass'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Fail'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          retests: { $sum: { $cond: ['$retestRequired', 1, 0] } },
        }
      },
      { $sort: { total: -1 } }
    ]);

    // Available filter options
    const departments: string[] = await TrainingMatrix.distinct('department');
    const months: string[] = (await TrainingMatrix.aggregate([
      { $group: { _id: { y: { $year: '$trainingDate' }, m: { $month: '$trainingDate' } } } },
      { $sort: { '_id.y': -1, '_id.m': -1 } }
    ])).map(x => `${x._id.y}-${String(x._id.m).padStart(2, '0')}`);

    return NextResponse.json({
      success: true,
      trainerReport,
      monthReport,
      sopReport,
      deptSummary,
      filters: { departments, months },
    });

  } catch (error: any) {
    console.error('Report error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
