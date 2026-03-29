import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrixRecord from '@/models/TrainingMatrixRecord';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const sp = request.nextUrl.searchParams;
    const dept   = sp.get('department') || 'all';
    const monthP = sp.get('month')      || 'all';
    const yearP  = sp.get('year')       || 'all';

    const base: Record<string, any> = {};
    if (dept   !== 'all') base.department = dept;
    if (monthP !== 'all') base.month      = parseInt(monthP);
    if (yearP  !== 'all') base.year       = parseInt(yearP);

    // Overall KPIs
    const [kpi] = await TrainingMatrixRecord.aggregate([
      { $match: base },
      { $group: {
        _id: null,
        total:           { $sum: 1 },
        completed:       { $sum: { $cond: [{ $eq: ['$status','completed']   }, 1, 0] } },
        not_required:    { $sum: { $cond: [{ $eq: ['$status','not_required']}, 1, 0] } },
        na:              { $sum: { $cond: [{ $eq: ['$status','na']          }, 1, 0] } },
        pending:         { $sum: { $cond: [{ $eq: ['$status','pending']     }, 1, 0] } },
        employees:       { $addToSet: '$employeeName' },
        sops:            { $addToSet: '$sopCode' },
        departments:     { $addToSet: '$department' },
      }},
      { $project: {
        total: 1, completed: 1, not_required: 1, na: 1, pending: 1,
        employeeCount:   { $size: '$employees' },
        sopCount:        { $size: '$sops' },
        departmentCount: { $size: '$departments' },
      }},
    ]);

    // Dept breakdown
    const deptBreakdown = await TrainingMatrixRecord.aggregate([
      { $match: base },
      { $group: {
        _id: '$department',
        total:     { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } },
        pending:   { $sum: { $cond: [{ $eq: ['$status','pending']   }, 1, 0] } },
        employees: { $addToSet: '$employeeName' },
      }},
      { $project: {
        department:    '$_id',
        total: 1, completed: 1, pending: 1,
        employeeCount: { $size: '$employees' },
        required: { $add: ['$completed', '$pending'] },
      }},
      { $project: {
        department: 1, total: 1, completed: 1, pending: 1, employeeCount: 1, required: 1,
        pct: { $cond: [{ $gt: ['$required',0] }, { $multiply: [{ $divide: ['$completed','$required'] }, 100] }, 0] },
      }},
      { $sort: { pct: -1 } },
    ]);

    // Monthly trend
    const monthlyTrend = await TrainingMatrixRecord.aggregate([
      { $match: { ...base, ...(dept !== 'all' ? {} : {}) } },
      { $group: {
        _id: { month: '$month', monthName: '$monthName', year: '$year' },
        completed: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } },
        pending:   { $sum: { $cond: [{ $eq: ['$status','pending']   }, 1, 0] } },
        total:     { $sum: 1 },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Top employees by completion
    const topEmployees = await TrainingMatrixRecord.aggregate([
      { $match: base },
      { $group: {
        _id: { employeeName: '$employeeName', department: '$department' },
        total:     { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } },
        pending:   { $sum: { $cond: [{ $eq: ['$status','pending']   }, 1, 0] } },
      }},
      { $project: {
        employeeName: '$_id.employeeName', department: '$_id.department',
        total: 1, completed: 1, pending: 1,
        required: { $add: ['$completed', '$pending'] },
      }},
      { $project: {
        employeeName: 1, department: 1, total: 1, completed: 1, pending: 1, required: 1,
        pct: { $cond: [{ $gt: ['$required',0] }, { $multiply: [{ $divide: ['$completed','$required'] }, 100] }, 0] },
      }},
      { $sort: { pct: -1 } },
      { $limit: 10 },
    ]);

    // SOP-wise pending
    const sopPending = await TrainingMatrixRecord.aggregate([
      { $match: { ...base, status: 'pending' } },
      { $group: { _id: '$sopCode', pending: { $sum: 1 } } },
      { $sort: { pending: -1 } },
      { $limit: 15 },
    ]);

    return NextResponse.json({
      success: true,
      kpi: kpi || { total: 0, completed: 0, not_required: 0, na: 0, pending: 0, employeeCount: 0, sopCount: 0, departmentCount: 0 },
      deptBreakdown,
      monthlyTrend: monthlyTrend.map(m => ({
        month: m._id.month, monthName: m._id.monthName, year: m._id.year,
        completed: m.completed, pending: m.pending, total: m.total,
      })),
      topEmployees,
      sopPending: sopPending.map(s => ({ sopCode: s._id, pending: s.pending })),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
