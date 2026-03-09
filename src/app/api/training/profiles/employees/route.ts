import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';

// GET /api/training/profiles/employees
// Returns one auto-generated profile per employee aggregated from TrainingMatrix
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || 'all';
    const department = searchParams.get('department') || 'all';
    const trainer = searchParams.get('trainer') || 'all';

    const matchStage: any = {};
    if (month !== 'all') {
      const [y, m] = month.split('-').map(Number);
      matchStage.trainingDate = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) };
    }
    if (department !== 'all') matchStage.department = department;
    if (trainer !== 'all') matchStage.trainerName = trainer;

    const profiles = await TrainingMatrix.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$employeeName',
          department: { $first: '$department' },
          employeeCode: { $first: '$employeeCode' },
          sopList: {
            $push: {
              sopIdentifier: '$sopIdentifier',
              sopName: '$sopName',
              trainerName: '$trainerName',
              status: '$status',
              passStatus: '$passStatus',
              score: '$score',
              retestRequired: '$retestRequired',
              trainingDate: '$trainingDate',
              scheduledWeek: '$scheduledWeek',
              acknowledgedAt: '$acknowledgedAt',
              attemptCount: '$attemptCount',
              testSessionId: '$testSessionId',
            }
          },
          totalSOPs: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $in: ['$status', ['Completed', 'Trained']] }, 1, 0] } },
          passed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Pass'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Fail'] }, 1, 0] } },
          retests: { $sum: { $cond: ['$retestRequired', 1, 0] } },
          avgScore: { $avg: '$score' },
          nextExam: {
            $min: {
              $cond: [{ $in: ['$status', ['Pending', 'In Progress']] }, '$trainingDate', null]
            }
          },
          trainerName: { $first: '$trainerName' }, // primary trainer
        }
      },
      {
        $addFields: {
          employeeName: '$_id',
          passRate: {
            $cond: [{ $eq: ['$totalSOPs', 0] }, 0, {
              $multiply: [{ $divide: ['$passed', '$totalSOPs'] }, 100]
            }]
          },
          completionRate: {
            $cond: [{ $eq: ['$totalSOPs', 0] }, 0, {
              $multiply: [{ $divide: ['$completed', '$totalSOPs'] }, 100]
            }]
          },
        }
      },
      { $sort: { pending: -1, employeeName: 1 } }
    ]);

    // Filters
    const departments: string[] = await TrainingMatrix.distinct('department');
    const trainers: string[] = await TrainingMatrix.distinct('trainerName');
    const monthAgg = await TrainingMatrix.aggregate([
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$trainingDate' } } } },
      { $sort: { _id: -1 } }
    ]);
    const months = monthAgg.map((x: any) => x._id).filter(Boolean);

    return NextResponse.json({
      success: true,
      profiles,
      filters: { departments, trainers: trainers.filter(Boolean), months },
    });
  } catch (error: any) {
    console.error('Employee profiles error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
