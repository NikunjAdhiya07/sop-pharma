import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrixRecord from '@/models/TrainingMatrixRecord';
import TrainingExamRecord from '@/models/TrainingExamRecord';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const sp = request.nextUrl.searchParams;
    const dept   = sp.get('department') || 'all';
    const monthP = sp.get('month')      || 'all';
    const yearP  = sp.get('year')       || 'all';
    const search = sp.get('search')     || '';

    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear  = now.getFullYear();

    // ── Base filter for training matrix records ──────────────────────────────
    const matrixMatch: Record<string, any> = {};
    if (dept   !== 'all') matrixMatch.department   = dept;
    if (monthP !== 'all') matrixMatch.month        = parseInt(monthP);
    if (yearP  !== 'all') matrixMatch.year         = parseInt(yearP);
    if (search) matrixMatch.employeeName = { $regex: search, $options: 'i' };

    // ── Overall KPI from matrix ───────────────────────────────────────────────
    const [overallKpi] = await TrainingMatrixRecord.aggregate([
      { $match: matrixMatch },
      { $group: {
        _id: null,
        total:        { $sum: { $cond: [{ $ne: ['$status', 'na'] }, 1, 0] } },
        completed:    { $sum: { $cond: [{ $eq: ['$status', 'completed']    }, 1, 0] } },
        pending:      { $sum: { $cond: [{ $eq: ['$status', 'pending']      }, 1, 0] } },
        not_required: { $sum: { $cond: [{ $eq: ['$status', 'not_required'] }, 1, 0] } },
        na:           { $sum: { $cond: [{ $eq: ['$status', 'na']           }, 1, 0] } },
        employees:    { $addToSet: '$employeeName' },
        sops:         { $addToSet: '$sopCode' },
        departments:  { $addToSet: '$department' },
      }},
      { $project: {
        total: 1, completed: 1, pending: 1, not_required: 1, na: 1,
        employeeCount:   { $size: '$employees' },
        sopCount:        { $size: '$sops' },
        departmentCount: { $size: '$departments' },
      }},
    ]);

    // ── Current month KPI ─────────────────────────────────────────────────────
    const curMonthMatch: Record<string, any> = { month: curMonth, year: curYear };
    if (dept !== 'all') curMonthMatch.department = dept;

    const [currentMonthKpi] = await TrainingMatrixRecord.aggregate([
      { $match: curMonthMatch },
      { $group: {
        _id: null,
        total:        { $sum: { $cond: [{ $ne: ['$status', 'na'] }, 1, 0] } },
        completed:    { $sum: { $cond: [{ $eq: ['$status', 'completed']    }, 1, 0] } },
        pending:      { $sum: { $cond: [{ $eq: ['$status', 'pending']      }, 1, 0] } },
        not_required: { $sum: { $cond: [{ $eq: ['$status', 'not_required'] }, 1, 0] } },
        employees:    { $addToSet: '$employeeName' },
        sops:         { $addToSet: '$sopCode' },
      }},
      { $project: {
        total: 1, completed: 1, pending: 1, not_required: 1,
        employeeCount: { $size: '$employees' },
        sopCount:      { $size: '$sops' },
      }},
    ]);

    // ── Dept breakdown ────────────────────────────────────────────────────────
    const deptBreakdown = await TrainingMatrixRecord.aggregate([
      { $match: matrixMatch },
      { $group: {
        _id: '$department',
        total:        { $sum: { $cond: [{ $ne: ['$status', 'na'] }, 1, 0] } },
        completed:    { $sum: { $cond: [{ $eq: ['$status', 'completed']    }, 1, 0] } },
        pending:      { $sum: { $cond: [{ $eq: ['$status', 'pending']      }, 1, 0] } },
        not_required: { $sum: { $cond: [{ $eq: ['$status', 'not_required'] }, 1, 0] } },
        employees:    { $addToSet: '$employeeName' },
      }},
      { $project: {
        department:    '$_id',
        total: 1, completed: 1, pending: 1, not_required: 1,
        employeeCount: { $size: '$employees' },
        required:      { $add: ['$completed', '$pending'] },
      }},
      { $addFields: {
        pct: { $cond: [
          { $gt: ['$required', 0] },
          { $multiply: [{ $divide: ['$completed', '$required'] }, 100] },
          0,
        ]},
      }},
      { $sort: { pct: -1 } },
    ]);

    // ── Monthly trend (last 12 months) ────────────────────────────────────────
    const trendMatch: Record<string, any> = {};
    if (dept !== 'all') trendMatch.department = dept;

    const monthlyTrend = await TrainingMatrixRecord.aggregate([
      { $match: trendMatch },
      { $group: {
        _id: { year: '$year', month: '$month', monthName: '$monthName' },
        completed:    { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        pending:      { $sum: { $cond: [{ $eq: ['$status', 'pending']   }, 1, 0] } },
        total:        { $sum: { $cond: [{ $ne: ['$status', 'na']        }, 1, 0] } },
        employees:    { $addToSet: '$employeeName' },
      }},
      { $project: {
        year: '$_id.year', month: '$_id.month', monthName: '$_id.monthName',
        completed: 1, pending: 1, total: 1,
        employeeCount: { $size: '$employees' },
      }},
      { $sort: { year: 1, month: 1 } },
      { $limit: 12 },
    ]);

    // ── Employee summary list ─────────────────────────────────────────────────
    const employeeSummary = await TrainingMatrixRecord.aggregate([
      { $match: matrixMatch },
      { $group: {
        _id: { employeeName: '$employeeName', department: '$department', designation: '$designation' },
        completed:    { $sum: { $cond: [{ $eq: ['$status', 'completed']    }, 1, 0] } },
        pending:      { $sum: { $cond: [{ $eq: ['$status', 'pending']      }, 1, 0] } },
        not_required: { $sum: { $cond: [{ $eq: ['$status', 'not_required'] }, 1, 0] } },
        na:           { $sum: { $cond: [{ $eq: ['$status', 'na']           }, 1, 0] } },
        totalSops:    { $addToSet: '$sopCode' },
      }},
      { $project: {
        employeeName: '$_id.employeeName',
        department:   '$_id.department',
        designation:  '$_id.designation',
        completed: 1, pending: 1, not_required: 1, na: 1,
        totalSops:    { $size: '$totalSops' },
        required:     { $add: ['$completed', '$pending'] },
      }},
      { $addFields: {
        pct: { $cond: [
          { $gt: ['$required', 0] },
          { $round: [{ $multiply: [{ $divide: ['$completed', '$required'] }, 100] }, 0] },
          0,
        ]},
      }},
      { $sort: { pending: -1, employeeName: 1 } },
    ]);

    // ── Month capsules ────────────────────────────────────────────────────────
    const monthCapsules = await TrainingMatrixRecord.aggregate([
      { $match: dept !== 'all' ? { department: dept } : {} },
      { $group: {
        _id: { year: '$year', month: '$month', monthName: '$monthName' },
        completed:    { $sum: { $cond: [{ $eq: ['$status', 'completed']    }, 1, 0] } },
        pending:      { $sum: { $cond: [{ $eq: ['$status', 'pending']      }, 1, 0] } },
        not_required: { $sum: { $cond: [{ $eq: ['$status', 'not_required'] }, 1, 0] } },
        employees:    { $addToSet: '$employeeName' },
        sops:         { $addToSet: '$sopCode' },
      }},
      { $project: {
        year: '$_id.year', month: '$_id.month', monthName: '$_id.monthName',
        completed: 1, pending: 1, not_required: 1,
        employeeCount: { $size: '$employees' },
        sopCount:      { $size: '$sops' },
        required:      { $add: ['$completed', '$pending'] },
      }},
      { $addFields: {
        pct: { $cond: [
          { $gt: ['$required', 0] },
          { $round: [{ $multiply: [{ $divide: ['$completed', '$required'] }, 100] }, 0] },
          0,
        ]},
      }},
      { $sort: { year: 1, month: 1 } },
    ]);

    // ── Top pending employees ─────────────────────────────────────────────────
    const topPendingEmployees = [...employeeSummary]
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 8);

    // ── Available filter options ──────────────────────────────────────────────
    const departments = await TrainingMatrixRecord.distinct('department');
    const years       = await TrainingMatrixRecord.distinct('year');

    return NextResponse.json({
      success: true,
      overallKpi: overallKpi || {
        total: 0, completed: 0, pending: 0, not_required: 0, na: 0,
        employeeCount: 0, sopCount: 0, departmentCount: 0,
      },
      currentMonthKpi: currentMonthKpi || {
        total: 0, completed: 0, pending: 0, not_required: 0,
        employeeCount: 0, sopCount: 0,
      },
      deptBreakdown,
      monthlyTrend: monthlyTrend.map(m => ({
        year: m.year, month: m.month, monthName: m.monthName,
        completed: m.completed, pending: m.pending, total: m.total,
        employeeCount: m.employeeCount,
      })),
      employeeSummary,
      monthCapsules,
      topPendingEmployees,
      departments: departments.filter(Boolean).sort(),
      years: years.filter(Boolean).sort(),
      currentMonth: curMonth,
      currentYear:  curYear,
    });
  } catch (error: any) {
    console.error('[dashboard-stats]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
