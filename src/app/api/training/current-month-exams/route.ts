import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';

// GET /api/training/current-month-exams
// Returns exam events for the CURRENT calendar month, grouped by trainer+SOP
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department') || 'all';

    // Current month bounds
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const matchStage: any = {
      trainingDate: { $gte: monthStart, $lt: monthEnd },
    };
    if (department !== 'all') matchStage.department = department;

    // Group by trainer + SOP to create "exam events"
    const examEvents = await TrainingMatrix.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { trainer: '$trainerName', sop: '$sopIdentifier' },
          sopName: { $first: '$sopName' },
          department: { $first: '$department' },
          scheduledDate: { $min: '$trainingDate' },
          scheduledWeek: { $first: '$scheduledWeek' },
          employees: { $push: '$employeeName' },
          employeeCount: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $in: ['$status', ['Completed', 'Trained']] }, 1, 0] } },
          passed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Pass'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Fail'] }, 1, 0] } },
          retests: { $sum: { $cond: ['$retestRequired', 1, 0] } },
          testSessionIds: { $push: '$testSessionId' },
        }
      },
      {
        $addFields: {
          trainerName: '$_id.trainer',
          sopIdentifier: '$_id.sop',
          examStatus: {
            $switch: {
              branches: [
                { case: { $gt: ['$retests', 0] }, then: 'Retest Required' },
                { case: { $eq: ['$completed', '$employeeCount'] }, then: 'Completed' },
                { case: { $gt: ['$inProgress', 0] }, then: 'In Progress' },
                { case: { $gt: ['$pending', '$completed'] }, then: 'Pending' },
              ],
              default: 'Scheduled'
            }
          },
          passRate: {
            $cond: [{ $eq: ['$employeeCount', 0] }, 0, {
              $multiply: [{ $divide: ['$passed', '$employeeCount'] }, 100]
            }]
          }
        }
      },
      { $sort: { examStatus: 1, scheduledDate: 1 } }
    ]);

    // Overall stats for current month
    const overallStats = await TrainingMatrix.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalExams: { $sum: 1 },
          scheduled: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $in: ['$status', ['Completed', 'Trained']] }, 1, 0] } },
          passed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Pass'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$passStatus', 'Fail'] }, 1, 0] } },
          retests: { $sum: { $cond: ['$retestRequired', 1, 0] } },
        }
      }
    ]);

    const stats = overallStats[0] || {
      totalExams: 0, scheduled: 0, pending: 0, completed: 0, passed: 0, failed: 0, retests: 0,
    };
    stats.passRate = stats.totalExams
      ? Math.round((stats.passed / stats.totalExams) * 100) : 0;

    const departments: string[] = await TrainingMatrix.distinct('department');
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return NextResponse.json({
      success: true,
      examEvents,
      stats,
      currentMonth,
      filters: { departments },
    });
  } catch (error: any) {
    console.error('Current month exams error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
