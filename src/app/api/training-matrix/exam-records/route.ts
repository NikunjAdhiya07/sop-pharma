import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingExamRecord from '@/models/TrainingExamRecord';
import TrainingMatrixRecord from '@/models/TrainingMatrixRecord';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const sp = request.nextUrl.searchParams;
    const dept   = sp.get('department') || 'all';
    const search = sp.get('search')     || '';
    const yearP  = sp.get('year')       || 'all';
    const monthP = sp.get('month')      || 'all';

    const match: Record<string, any> = {};
    if (dept   !== 'all') match.department   = dept;
    if (yearP  !== 'all') match.year         = parseInt(yearP);
    if (monthP !== 'all') match.month        = parseInt(monthP);
    if (search)           match.employeeName = { $regex: search, $options: 'i' };

    const records = await TrainingExamRecord.find(match).sort({ examDate: -1 }).limit(500).lean();
    const departments = await TrainingExamRecord.distinct('department');

    return NextResponse.json({ success: true, records, departments });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const { employeeName, department, designation, sopCode, sopName, examDate, score, maxScore, passFail, retrainingRequired, remarks, month, year } = body;

    if (!employeeName || !department || !sopCode || !examDate) {
      return NextResponse.json({ success: false, error: 'employeeName, department, sopCode, examDate are required' }, { status: 400 });
    }

    // Auto-fetch designation from matrix if missing
    let desig = designation || '';
    if (!desig) {
      const rec = await TrainingMatrixRecord.findOne({ employeeName, department }).select('designation').lean();
      desig = (rec as any)?.designation || '';
    }

    const d = new Date(examDate);
    const m = month || (d.getMonth() + 1);
    const y = year  || d.getFullYear();

    const record = await TrainingExamRecord.create({
      employeeName, department, designation: desig, sopCode, sopName,
      examDate: d, score, maxScore,
      passFail: passFail || 'pending',
      retrainingRequired: !!retrainingRequired,
      remarks, month: m, year: y,
    });

    return NextResponse.json({ success: true, record });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();
    const { id } = await request.json();
    await TrainingExamRecord.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
