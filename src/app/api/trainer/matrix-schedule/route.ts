import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';

// GET /api/trainer/matrix-schedule
// Returns TrainingMatrix records for a specific trainer name
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const trainerName = searchParams.get('trainer');
    const status = searchParams.get('status') || 'all';
    const sop = searchParams.get('sop') || 'all';
    const month = searchParams.get('month') || 'all';
    const department = searchParams.get('department') || 'all';

    if (!trainerName) {
      return NextResponse.json({ error: 'trainer param required' }, { status: 400 });
    }

    const query: any = { trainerName };
    if (status !== 'all') query.status = status;
    if (sop !== 'all') query.sopIdentifier = sop;
    if (department !== 'all') query.department = department;
    if (month !== 'all') {
      const [y, m] = month.split('-').map(Number);
      query.trainingDate = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) };
    }

    const records = await TrainingMatrix.find(query).sort({ trainingDate: 1 });

    // Filter options for this trainer
    const sops: string[] = await TrainingMatrix.distinct('sopIdentifier', { trainerName });
    const departments: string[] = await TrainingMatrix.distinct('department', { trainerName });
    const monthAgg = await TrainingMatrix.aggregate([
      { $match: { trainerName } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$trainingDate' } } } },
      { $sort: { _id: -1 } }
    ]);
    const months = monthAgg.map((x: any) => x._id).filter(Boolean);

    // Stats for this trainer
    const stats = {
      total: records.length,
      pending: records.filter(r => r.status === 'Pending').length,
      inProgress: records.filter(r => r.status === 'In Progress').length,
      completed: records.filter(r => ['Completed', 'Trained'].includes(r.status)).length,
      passed: records.filter(r => r.passStatus === 'Pass').length,
      failed: records.filter(r => r.passStatus === 'Fail').length,
      retests: records.filter(r => r.retestRequired).length,
      passRate: records.length
        ? Math.round((records.filter(r => r.passStatus === 'Pass').length / records.length) * 100)
        : 0,
    };

    return NextResponse.json({
      success: true,
      records,
      stats,
      filters: { sops, departments, months },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
