/**
 * GET /api/training/dashboard
 *
 * Query params:
 *   month       = 1-12 (integer) or 'all'
 *   department  = department name or 'all'
 *   year        = YYYY or 'all'
 *
 * Returns data derived exclusively from MatrixEntry documents
 * (only records where √ was found in the uploaded training matrix).
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MatrixEntry from '@/models/MatrixEntry';
import MCQBank from '@/models/MCQBank';

const MONTH_NAMES_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);

    const deptFilter  = searchParams.get('department') || 'all';
    const monthParam  = searchParams.get('month')      || 'all';
    const yearParam   = searchParams.get('year')       || 'all';

    // ── Base match ────────────────────────────────────────────────────────────
    const baseMatch: Record<string, any> = {};
    if (deptFilter !== 'all') baseMatch.department = deptFilter;
    if (yearParam  !== 'all') baseMatch.year = parseInt(yearParam);
    if (monthParam !== 'all') baseMatch.month = parseInt(monthParam);

    // ── 1. Monthly Overview — count of √ marks per month (global, no month filter) ──
    const globalMatch: Record<string, any> = {};
    if (deptFilter !== 'all') globalMatch.department = deptFilter;
    if (yearParam  !== 'all') globalMatch.year = parseInt(yearParam);

    const monthlyAgg = await MatrixEntry.aggregate([
      { $match: globalMatch },
      {
        $group: {
          _id: { month: '$month', monthName: '$monthName', year: '$year' },
          sopCodes: { $addToSet: '$sopCode' },
        }
      },
      {
        $project: {
          _id: 1,
          totalSopExams: { $size: '$sopCodes' },
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const monthlySummary = monthlyAgg.map(m => ({
      month:       m._id.month,
      monthName:   m._id.monthName,
      year:        m._id.year,
      totalSopExams: m.totalSopExams,
    }));

    // ── 2. Department breakdown (filtered by selected month if any) ───────────
    const deptAgg = await MatrixEntry.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$department',
          employees: { $addToSet: '$employeeName' },
          totalSopExams: { $sum: 1 },
          sopCodes: { $addToSet: '$sopCode' },
        }
      },
      {
        $project: {
          department:    '$_id',
          employeeCount: { $size: '$employees' },
          totalSopExams: 1,
          uniqueSops:    { $size: '$sopCodes' },
        }
      },
      { $sort: { totalSopExams: -1 } },
    ]);

    // ── 3. Employee-level SOP training table ──────────────────────────────────
    const empAgg = await MatrixEntry.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: {
            employeeName: '$employeeName',
            department:   '$department',
            month:        '$month',
            monthName:    '$monthName',
            year:         '$year',
          },
          sopCodes: { $push: '$sopCode' },
          totalSopExams: { $sum: 1 },
        }
      },
      {
        $project: {
          _id: 0,
          employeeName: '$_id.employeeName',
          department:   '$_id.department',
          month:        '$_id.month',
          monthName:    '$_id.monthName',
          year:         '$_id.year',
          sopCodes:     1,
          totalSopExams: 1,
        }
      },
      { $sort: { month: 1, department: 1, employeeName: 1 } },
    ]);

    // ── 4. Filter options ──────────────────────────────────────────────────────
    const departments  = await MatrixEntry.distinct('department');
    const yearsRaw     = await MatrixEntry.distinct('year');
    const years        = yearsRaw.sort();

    // Available months (across all years, or within the selected year)
    const availMonthsAgg = await MatrixEntry.aggregate([
      { $match: yearParam !== 'all' ? { year: parseInt(yearParam) } : {} },
      { $group: { _id: { month: '$month', monthName: '$monthName' } } },
      { $sort: { '_id.month': 1 } },
    ]);
    const availableMonths = availMonthsAgg.map(m => ({
      month: m._id.month,
      monthName: m._id.monthName,
    }));

    // ── 5. High-level summary for KPI strip ───────────────────────────────────
    const kpiAgg = await MatrixEntry.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          totalSopExams:   { $sum: 1 },
          totalEmployees:  { $addToSet: '$employeeName' },
          totalDepts:      { $addToSet: '$department' },
          totalSopCodes:   { $addToSet: '$sopCode' },
        }
      },
      {
        $project: {
          totalSopExams: 1,
          totalEmployees: { $size: '$totalEmployees' },
          totalDepts:     { $size: '$totalDepts' },
          totalSopCodes:  { $size: '$totalSopCodes' },
        }
      }
    ]);

    const kpi = kpiAgg[0] || { totalSopExams: 0, totalEmployees: 0, totalDepts: 0, totalSopCodes: 0 };

    const uniqueSopCodesList = await MatrixEntry.distinct('sopCode', baseMatch);
    const sopsFromBank = await MCQBank.find().select('sopIdentifier sopName').lean();

    const sopNamesMap = uniqueSopCodesList.reduce((acc: Record<string, { id: string, name: string }>, code: string) => {
      const cleanCode = code.trim();
      const matched = sopsFromBank.find((b: any) => {
        const cleanBankId = b.sopIdentifier.trim();
        return cleanBankId === cleanCode || cleanBankId.startsWith(`${cleanCode}-`);
      });

      if (matched) {
        acc[code] = { id: matched.sopIdentifier.trim(), name: matched.sopName.trim() };
      } else {
        acc[code] = { id: cleanCode, name: 'Unknown SOP' };
      }
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      kpi,
      monthlySummary,
      deptBreakdown: deptAgg,
      employeeTable: empAgg,
      sopNamesMap,
      filters: {
        departments,
        years,
        availableMonths,
      },
    });

  } catch (error: any) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
