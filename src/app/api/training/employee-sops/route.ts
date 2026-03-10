import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MatrixEntry from '@/models/MatrixEntry';
import MCQBank from '@/models/MCQBank';

/**
 * GET /api/training/employee-sops
 * Returns all SOP codes assigned to an employee (from MatrixEntry),
 * cross-referenced with MCQBank to show exam availability.
 *
 * KEY FIX: MatrixEntry stores bare codes like 'QAIO03',
 * but MCQBank stores versioned identifiers like 'QAIO03-07'.
 * We use a starts-with regex and strip the version suffix when building the map.
 */
export async function GET(request: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const employeeName = searchParams.get('employeeName');
    const department   = searchParams.get('department');
    const month        = searchParams.get('month');
    const year         = searchParams.get('year');

    if (!employeeName || !department) {
      return NextResponse.json(
        { success: false, error: 'employeeName and department are required' },
        { status: 400 }
      );
    }

    // Build filter for MatrixEntry
    const match: Record<string, any> = { employeeName, department };
    if (month) match.month = parseInt(month);
    if (year)  match.year  = parseInt(year);

    // Get all √-marked SOP entries for this employee
    const entries = await MatrixEntry.find(match)
      .select('sopCode monthName month year designation')
      .lean();

    if (entries.length === 0) {
      return NextResponse.json({ success: true, sops: [] });
    }

    // Collect unique SOP codes (e.g. "QAIO03", "QAGE02")
    const sopCodes = [...new Set(entries.map(e => e.sopCode))];

    // ── MCQBank lookup ────────────────────────────────────────────────────────
    // MCQBank sopIdentifier format: "QAIO03-07" (code + hyphen + version number)
    // MatrixEntry format:           "QAIO03"    (bare code, no version)
    // Strategy: use $or with starts-with regex so "QAIO03" matches "QAIO03-07"
    const orConditions = sopCodes.map(code => ({
      sopIdentifier: { $regex: `^${code}([-_]|$)`, $options: 'i' },
    }));

    const mcqBanks = await MCQBank.find({ $or: orConditions })
      .select('sopIdentifier sopName totalQuestions _id')
      .lean();

    // Build lookup: baseCode (uppercase, version stripped) → MCQBank entry
    // e.g.  "QAIO03-07" → strip "-07" → key = "QAIO03"
    const mcqMap = new Map<string, { examId: string; sopName: string; questionCount: number }>();
    for (const bank of mcqBanks) {
      // Strip trailing "-NN" or "_NN" version suffix
      const baseCode = bank.sopIdentifier.replace(/[-_]\d+.*$/, '').toUpperCase();
      if (!mcqMap.has(baseCode)) {
        // Clean up the sopName by removing the versioned code prefix
        // e.g. "QAIO03-07_OPERATION, CLEANING..." → "OPERATION, CLEANING..."
        const rawName = bank.sopName || '';
        const cleanName = rawName.replace(/^[A-Z0-9]+-\d+[_\s-]+/i, '').trim() || rawName;
        mcqMap.set(baseCode, {
          examId:        (bank._id as any).toString(),
          sopName:       cleanName,
          questionCount: bank.totalQuestions,
        });
      }
    }

    // Group by sopCode + month (dedup repeated entries in same month)
    const grouped = new Map<string, {
      sopCode: string;
      monthName: string;
      month: number;
      year: number;
      designation?: string;
    }>();

    for (const e of entries) {
      const key = `${e.sopCode}|${e.month}|${e.year}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          sopCode:     e.sopCode,
          monthName:   e.monthName,
          month:       e.month,
          year:        e.year,
          designation: e.designation,
        });
      }
    }

    const sops = Array.from(grouped.values())
      .sort((a, b) => a.month - b.month || a.sopCode.localeCompare(b.sopCode))
      .map(entry => {
        const mcq = mcqMap.get(entry.sopCode.toUpperCase());
        return {
          sopCode:       entry.sopCode,
          monthName:     entry.monthName,
          month:         entry.month,
          year:          entry.year,
          designation:   entry.designation,
          hasExam:       !!mcq,
          examId:        mcq?.examId,
          sopName:       mcq?.sopName,
          questionCount: mcq?.questionCount,
        };
      });

    return NextResponse.json({ success: true, sops, employeeName, department });
  } catch (err: any) {
    console.error('[API] /api/training/employee-sops error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
