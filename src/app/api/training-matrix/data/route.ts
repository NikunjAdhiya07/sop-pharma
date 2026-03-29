import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrixRecord from '@/models/TrainingMatrixRecord';
import TrainingMatrixUpload from '@/models/TrainingMatrixUpload';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const sp = request.nextUrl.searchParams;

    const dept      = sp.get('department') || 'all';
    const monthP    = sp.get('month')      || 'all';
    const yearP     = sp.get('year')       || 'all';
    const search    = (sp.get('search')    || '').toLowerCase();
    const sopSearch = (sp.get('sop')       || '').toLowerCase();
    const desigF    = sp.get('designation')|| 'all';
    const statusF   = sp.get('status')     || 'all';

    const match: Record<string, any> = {};
    if (dept    !== 'all') match.department   = dept;
    if (monthP  !== 'all') match.month        = parseInt(monthP);
    if (yearP   !== 'all') match.year         = parseInt(yearP);
    if (statusF !== 'all') match.status       = statusF;
    if (desigF  !== 'all') match.designation  = desigF;
    if (search)            match.employeeName = { $regex: search, $options: 'i' };
    if (sopSearch)         match.sopCode      = { $regex: sopSearch, $options: 'i' };

    const records = await TrainingMatrixRecord.find(match)
      .sort({ department: 1, employeeName: 1, sopCode: 1 })
      .lean();

    // Build employee map with SOP matrix
    const empMap: Record<string, {
      employeeName: string;
      designation: string;
      department: string;
      trainings: Record<string, { status: string; raw: string }>;
    }> = {};

    const sopSet = new Set<string>();

    for (const r of records) {
      const key = `${r.department}||${r.employeeName}`;
      if (!empMap[key]) {
        empMap[key] = { employeeName: r.employeeName, designation: r.designation, department: r.department, trainings: {} };
      }
      empMap[key].trainings[r.sopCode] = { status: r.status, raw: r.rawSymbol };
      sopSet.add(r.sopCode);
    }

    const employees = Object.values(empMap).map(emp => {
      const completed    = Object.values(emp.trainings).filter(t => t.status === 'completed').length;
      const not_required = Object.values(emp.trainings).filter(t => t.status === 'not_required').length;
      const na           = Object.values(emp.trainings).filter(t => t.status === 'na').length;
      const pending      = Object.values(emp.trainings).filter(t => t.status === 'pending').length;
      const required     = completed + pending;
      const pct          = required > 0 ? Math.round((completed / required) * 100) : 0;
      return { ...emp, completed, not_required, na, pending, required, completionPct: pct };
    });

    const sopCodes = [...sopSet].sort();

    // Filter options
    const departments   = await TrainingMatrixRecord.distinct('department');
    const years         = (await TrainingMatrixRecord.distinct('year')).sort();
    const designations  = await TrainingMatrixRecord.distinct('designation', dept !== 'all' ? { department: dept } : {});
    const monthsRaw     = await TrainingMatrixRecord.aggregate([
      { $group: { _id: { month: '$month', monthName: '$monthName' } } },
      { $sort: { '_id.month': 1 } },
    ]);
    const months = monthsRaw.map(m => ({ month: m._id.month, monthName: m._id.monthName }));

    // Upload history
    const uploads = await TrainingMatrixUpload.find(dept !== 'all' ? { department: dept } : {})
      .sort({ uploadedAt: -1 }).limit(20).lean();

    return NextResponse.json({
      success: true,
      employees,
      sopCodes,
      filters: { departments, years, months, designations },
      uploads,
      total: records.length,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
