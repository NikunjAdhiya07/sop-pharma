import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingSopAttempt from '@/models/TrainingSopAttempt';
import TrainingCertificate from '@/models/TrainingCertificate';
import MatrixEntry from '@/models/MatrixEntry';

/**
 * GET /api/training/my-results
 * Returns month-wise exam attempt history + certificate data for an employee.
 * Query params: employeeName (required), department (optional)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const employeeName = searchParams.get('employeeName');
    const department   = searchParams.get('department');

    if (!employeeName) {
      return NextResponse.json({ success: false, error: 'employeeName is required' }, { status: 400 });
    }

    // Get all attempts for this employee
    const attemptQuery: any = { employeeName };
    if (department) attemptQuery.department = department;

    const attempts = await TrainingSopAttempt.find(attemptQuery)
      .sort({ createdAt: 1 })
      .select('-questions')
      .lean();

    // Get all certificates for this employee
    const certQuery: any = { employeeName };
    if (department) certQuery.department = department;
    const certificates = await TrainingCertificate.find(certQuery).lean();

    // Build certificate lookup: sopIdentifier → certificate
    const certMap = new Map<string, any>();
    for (const cert of certificates) {
      certMap.set(cert.sopIdentifier, cert);
    }

    // Get MatrixEntry data to cross-reference months
    const matrixQuery: any = { employeeName };
    if (department) matrixQuery.department = department;
    const matrixEntries = await MatrixEntry.find(matrixQuery)
      .select('sopCode monthName month year department')
      .lean();

    // Build month/SOP lookup from MatrixEntry: sopCode → { month, monthName, year }
    const sopMonthMap = new Map<string, { month: number; monthName: string; year: number }>();
    for (const me of matrixEntries) {
      // Use the first month entry found per sopCode (there may be multiple months)
      if (!sopMonthMap.has(me.sopCode)) {
        sopMonthMap.set(me.sopCode, { month: me.month, monthName: me.monthName, year: me.year });
      }
    }

    // Group attempts by sopIdentifier
    const sopAttemptMap = new Map<string, any[]>();
    for (const att of attempts) {
      const list = sopAttemptMap.get(att.sopIdentifier) || [];
      list.push(att);
      sopAttemptMap.set(att.sopIdentifier, list);
    }

    // Build per-SOP result summary
    const sopResults: any[] = [];
    for (const [sopCode, sopAttempts] of sopAttemptMap.entries()) {
      const passedAttempt = sopAttempts.find(a => a.status === 'passed');
      const maxedOut      = !passedAttempt && sopAttempts.length >= 5;
      const cert          = certMap.get(sopCode);
      const monthInfo     = sopMonthMap.get(sopCode);
      const dept          = sopAttempts[0]?.department || department || '';

      sopResults.push({
        sopCode,
        sopName: sopAttempts[0]?.sopName || sopCode,
        department: dept,
        month:     monthInfo?.month,
        monthName: monthInfo?.monthName || '',
        year:      monthInfo?.year,
        totalAttempts: sopAttempts.length,
        maxAttemptsAllowed: 5,
        passed: !!passedAttempt,
        maxedOut,
        inProgress: !passedAttempt && !maxedOut,
        bestScore: Math.max(...sopAttempts.map(a => a.score)),
        attemptsHistory: sopAttempts.map(a => ({
          attemptNumber: a.attemptNumber,
          score: a.score,
          correctCount: a.correctCount,
          wrongCount: a.wrongCount,
          totalQuestions: a.totalQuestions,
          status: a.status,
          startedAt: a.startedAt,
          completedAt: a.completedAt,
          durationSeconds: a.completedAt && a.startedAt
            ? Math.round((new Date(a.completedAt).getTime() - new Date(a.startedAt).getTime()) / 1000)
            : null,
        })),
        certificate: cert ? {
          certificateNumber: cert.certificateNumber,
          completedAt: cert.completedAt,
          attemptNumber: cert.attemptNumber,
          score: cert.score,
        } : null,
      });
    }

    // Sort by monthName then sopCode
    sopResults.sort((a, b) => (a.month ?? 99) - (b.month ?? 99) || a.sopCode.localeCompare(b.sopCode));

    // Month-wise grouping for the dashboard view
    const monthGroups = new Map<string, { month: number; monthName: string; year: number; sops: any[] }>();
    for (const res of sopResults) {
      const key = `${res.year ?? 'unknown'}-${String(res.month ?? 0).padStart(2, '0')}`;
      if (!monthGroups.has(key)) {
        monthGroups.set(key, { month: res.month, monthName: res.monthName, year: res.year, sops: [] });
      }
      monthGroups.get(key)!.sops.push(res);
    }

    const monthWise = Array.from(monthGroups.values())
      .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || (a.month ?? 0) - (b.month ?? 0));

    return NextResponse.json({
      success: true,
      employeeName,
      totalAttempts:     attempts.length,
      totalPassed:       sopResults.filter(r => r.passed).length,
      totalCertificates: certificates.length,
      sopResults,
      monthWise,
    });
  } catch (err: any) {
    console.error('[my-results] error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
