import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrixRecord from '@/models/TrainingMatrixRecord';
import TrainingExamRecord from '@/models/TrainingExamRecord';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const sp = request.nextUrl.searchParams;
    const employeeName = sp.get('employee') || '';
    const department   = sp.get('department') || '';

    if (!employeeName) {
      return NextResponse.json({ success: false, error: 'employee param required' }, { status: 400 });
    }

    const match: Record<string, any> = { employeeName };
    if (department) match.department = department;

    // All SOP training records for this employee
    const matrixRecords = await TrainingMatrixRecord.find(match)
      .select('sopCode sopName department month year monthName status rawSymbol designation')
      .sort({ year: 1, month: 1, sopCode: 1 })
      .lean() as any[];

    // All exam records for this employee
    const examRecords = await TrainingExamRecord.find({ employeeName })
      .sort({ examDate: -1 })
      .lean() as any[];

    // Build SOP-level summary (deduplicate by sopCode, keep best status)
    const priority: Record<string, number> = { completed: 3, pending: 2, not_required: 1, na: 0 };
    const sopMap = new Map<string, {
      sopCode: string;
      sopName: string;
      department: string;
      status: string;
      months: Array<{ month: number; monthName: string; year: number; status: string }>;
      lastExamDate?: Date;
      lastScore?: number;
      passStatus?: string;
      examHistory: Array<{
        examDate: Date;
        score?: number;
        maxScore?: number;
        passFail: string;
        remarks?: string;
      }>;
    }>();

    for (const r of matrixRecords) {
      const key = r.sopCode;
      if (!sopMap.has(key)) {
        sopMap.set(key, {
          sopCode: r.sopCode,
          sopName: r.sopName || r.sopCode,
          department: r.department,
          status: r.status,
          months: [],
          examHistory: [],
        });
      }
      const entry = sopMap.get(key)!;
      // Update to best status
      const existing = priority[entry.status] ?? 0;
      const incoming = priority[r.status]    ?? 0;
      if (incoming > existing) entry.status = r.status;
      entry.months.push({ month: r.month, monthName: r.monthName, year: r.year, status: r.status });
    }

    // Attach exam records to SOPs
    for (const exam of examRecords) {
      const entry = sopMap.get(exam.sopCode);
      if (entry) {
        entry.examHistory.push({
          examDate:  exam.examDate,
          score:     exam.score,
          maxScore:  exam.maxScore,
          passFail:  exam.passFail,
          remarks:   exam.remarks,
        });
        // Latest exam metadata
        if (!entry.lastExamDate || exam.examDate > entry.lastExamDate) {
          entry.lastExamDate = exam.examDate;
          entry.lastScore    = exam.score;
          entry.passStatus   = exam.passFail;
        }
      }
    }

    const sops = Array.from(sopMap.values()).sort((a, b) => a.sopCode.localeCompare(b.sopCode));

    // Stats
    const required      = sops.filter(s => s.status === 'pending' || s.status === 'completed');
    const completed     = sops.filter(s => s.status === 'completed');
    const pending       = sops.filter(s => s.status === 'pending');
    const notRequired   = sops.filter(s => s.status === 'not_required');
    const pct           = required.length > 0 ? Math.round((completed.length / required.length) * 100) : 0;

    const designation = matrixRecords.length > 0 ? (matrixRecords[0] as any).designation || '' : '';

    return NextResponse.json({
      success: true,
      employee: {
        employeeName,
        department,
        designation,
        totalSops:       sops.length,
        required:        required.length,
        completed:       completed.length,
        pending:         pending.length,
        notRequired:     notRequired.length,
        completionPct:   pct,
      },
      sops,
      examRecords: examRecords.map(e => ({
        _id:       e._id?.toString(),
        sopCode:   e.sopCode,
        sopName:   e.sopName,
        examDate:  e.examDate,
        score:     e.score,
        maxScore:  e.maxScore,
        passFail:  e.passFail,
        remarks:   e.remarks,
      })),
    });
  } catch (error: any) {
    console.error('[employee-detail]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
