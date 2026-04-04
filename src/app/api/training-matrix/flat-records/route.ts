import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrixRecord from '@/models/TrainingMatrixRecord';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const sp = request.nextUrl.searchParams;

    const dept  = sp.get('department') || 'all';
    const monthP = sp.get('month')     || 'all';
    const yearP  = sp.get('year')      || 'all';
    const search = sp.get('search')    || '';
    const sopF   = sp.get('sop')       || '';
    const statusF = sp.get('status')   || 'all';

    const match: Record<string, any> = {};
    if (dept   !== 'all') match.department   = dept;
    if (monthP !== 'all') match.month        = parseInt(monthP);
    if (yearP  !== 'all') match.year         = parseInt(yearP);
    if (statusF !== 'all') match.status      = statusF;
    if (search) match.employeeName = { $regex: search, $options: 'i' };
    if (sopF)   match.sopCode      = { $regex: sopF,   $options: 'i' };

    const raw = await TrainingMatrixRecord.find(match)
      .select('employeeName designation department sopCode month monthName year status rawSymbol')
      .sort({ department: 1, employeeName: 1, month: 1, sopCode: 1 })
      .lean() as any[];

    const records = raw.map(r => ({
      employeeName: r.employeeName,
      designation:  r.designation || '',
      department:   r.department,
      sopCode:      r.sopCode,
      month:        r.month,
      monthName:    r.monthName || '',
      year:         r.year,
      status:       r.status,
      rawSymbol:    r.rawSymbol || '',
    }));

    return NextResponse.json({ success: true, records });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
