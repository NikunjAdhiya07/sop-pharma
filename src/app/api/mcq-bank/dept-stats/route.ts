import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

/**
 * GET /api/mcq-bank/dept-stats
 *
 * Returns MCQ status metrics per department:
 *   - totalSOPs: all non-obsolete SOPs in that dept (from SOP model)
 *   - sopWithMCQs: SOPs that have at least one MCQ bank
 *   - sopWithoutMCQs: SOPs that have no MCQ bank (remaining)
 *   - approvedSOPs: SOPs where all questions are checked (fully reviewed)
 *   - pendingSOPs: SOPs with MCQs but not fully checked
 *   - similarSOPs: SOPs that have at least one similar question flagged
 *   - totalQuestions: total MCQ count across all banks in dept
 *   - checkedCount: questions marked checked
 *   - reviewedCount: questions marked reviewed
 *   - similarCount: questions flagged as similar
 */
export async function GET() {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const mcqBankCollection = db.collection('mcqbanks');

    // --- 1. Fetch all non-obsolete SOPs grouped by department ---
    const allSOPs = await SOP.find({
      $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }],
    })
      .select('_id department identifier')
      .lean();

    // --- 2. Aggregate MCQ bank stats per department ---
    const bankAgg = await mcqBankCollection
      .aggregate([
        {
          $match: {
            $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }],
          },
        },
        {
          $project: {
            sopId: 1,
            sopIdentifier: 1,
            department: 1,
            totalQuestions: { $size: { $ifNull: ['$mcqs', []] } },
            checkedCount: {
              $size: {
                $filter: {
                  input: { $ifNull: ['$mcqs', []] },
                  as: 'q',
                  cond: { $eq: ['$$q.isChecked', true] },
                },
              },
            },
            reviewedCount: {
              $size: {
                $filter: {
                  input: { $ifNull: ['$mcqs', []] },
                  as: 'q',
                  cond: { $eq: ['$$q.isReviewed', true] },
                },
              },
            },
            similarCount: {
              $size: {
                $filter: {
                  input: { $ifNull: ['$mcqs', []] },
                  as: 'q',
                  cond: { $eq: ['$$q.isSimilar', true] },
                },
              },
            },
          },
        },
      ])
      .toArray();

    // --- 3. Build per-SOP summaries (merge English + Gujarati banks for same sopId) ---
    // Determine department for each bank from SOP identifier (same logic as mcqTreeBuilder)
    const sopDeptMap = new Map<string, string>();
    for (const sop of allSOPs as any[]) {
      if (sop._id) sopDeptMap.set(sop._id.toString(), sop.department || '');
    }

    // Subcategory-to-department mapping (mirrors mcqTreeBuilder)
    const SUBCAT_TO_DEPT: Record<string, string> = {
      QAGE: 'QA', ANNE: 'QA',
      QCGE: 'QC', QAIC: 'QC', QAIO: 'QC',
      QAMI: 'Microbiology', QCMI: 'Microbiology',
      PRAA: 'Production', PRCL: 'Production', PRED: 'Production',
      PREO: 'Production', PREP: 'Production', PRGE: 'Production',
      PRMA: 'Production', PRPA: 'Production',
      BSGE: 'Store', STCL: 'Store', STGE: 'Store',
      STOP: 'Store', STPA: 'Store', STRM: 'Store',
      MAGE: 'Engineering and Maintenance', PREG: 'Engineering and Maintenance',
      PEGE: 'Personnel',
    };

    function resolveDept(bank: any): string {
      if (bank.sopIdentifier) {
        const m = bank.sopIdentifier.toUpperCase().trim().match(/^([A-Z]{2,4})/);
        if (m && SUBCAT_TO_DEPT[m[1]]) return SUBCAT_TO_DEPT[m[1]];
      }
      if (bank.sopId) {
        const d = sopDeptMap.get(bank.sopId.toString());
        if (d) return d;
      }
      return bank.department || 'Other';
    }

    // Group banks by sopId (merge multi-language)
    const sopMerged = new Map<string, {
      dept: string;
      totalQuestions: number;
      checkedCount: number;
      reviewedCount: number;
      similarCount: number;
    }>();

    for (const bank of bankAgg as any[]) {
      const key = bank.sopId?.toString() ?? bank._id?.toString();
      if (!key) continue;
      const dept = resolveDept(bank);
      if (!sopMerged.has(key)) {
        sopMerged.set(key, { dept, totalQuestions: 0, checkedCount: 0, reviewedCount: 0, similarCount: 0 });
      }
      const entry = sopMerged.get(key)!;
      entry.totalQuestions += bank.totalQuestions ?? 0;
      entry.checkedCount   += bank.checkedCount   ?? 0;
      entry.reviewedCount  += bank.reviewedCount  ?? 0;
      entry.similarCount   += bank.similarCount   ?? 0;
    }

    // --- 4. Compute per-department stats ---
    const DEPARTMENT_ORDER = [
      'QA', 'QC', 'Microbiology', 'Production',
      'Store', 'Engineering and Maintenance', 'Personnel',
    ];

    type DeptStats = {
      department: string;
      totalSOPs: number;
      sopWithMCQs: number;
      sopWithoutMCQs: number;
      approvedSOPs: number;
      pendingSOPs: number;
      similarSOPs: number;
      totalQuestions: number;
      checkedCount: number;
      reviewedCount: number;
      similarCount: number;
    };

    const statsMap = new Map<string, DeptStats>();

    const initDept = (dept: string): DeptStats => ({
      department: dept,
      totalSOPs: 0,
      sopWithMCQs: 0,
      sopWithoutMCQs: 0,
      approvedSOPs: 0,
      pendingSOPs: 0,
      similarSOPs: 0,
      totalQuestions: 0,
      checkedCount: 0,
      reviewedCount: 0,
      similarCount: 0,
    });

    // Count total SOPs per department (from SOP model)
    for (const sop of allSOPs as any[]) {
      const dept = sop.department || 'Other';
      if (!statsMap.has(dept)) statsMap.set(dept, initDept(dept));
      statsMap.get(dept)!.totalSOPs += 1;
    }

    // Count SOPs with MCQs and their status
    for (const [, entry] of sopMerged) {
      const dept = entry.dept;
      if (!statsMap.has(dept)) statsMap.set(dept, initDept(dept));
      const ds = statsMap.get(dept)!;

      ds.sopWithMCQs    += 1;
      ds.totalQuestions += entry.totalQuestions;
      ds.checkedCount   += entry.checkedCount;
      ds.reviewedCount  += entry.reviewedCount;
      ds.similarCount   += entry.similarCount;

      // Approved = all questions checked
      if (entry.totalQuestions > 0 && entry.checkedCount >= entry.totalQuestions) {
        ds.approvedSOPs += 1;
      } else if (entry.totalQuestions > 0 && entry.similarCount > 0) {
        ds.similarSOPs += 1;
      } else {
        ds.pendingSOPs += 1;
      }
    }

    // Derive remaining (no MCQs yet)
    for (const ds of statsMap.values()) {
      ds.sopWithoutMCQs = Math.max(0, ds.totalSOPs - ds.sopWithMCQs);
    }

    // Sort by official order, put unknowns at the end
    const result: DeptStats[] = [];
    for (const dept of DEPARTMENT_ORDER) {
      if (statsMap.has(dept)) result.push(statsMap.get(dept)!);
    }
    for (const [dept, ds] of statsMap) {
      if (!DEPARTMENT_ORDER.includes(dept)) result.push(ds);
    }

    // Overall totals
    const overall = result.reduce(
      (acc, ds) => {
        acc.totalSOPs      += ds.totalSOPs;
        acc.sopWithMCQs    += ds.sopWithMCQs;
        acc.sopWithoutMCQs += ds.sopWithoutMCQs;
        acc.approvedSOPs   += ds.approvedSOPs;
        acc.pendingSOPs    += ds.pendingSOPs;
        acc.similarSOPs    += ds.similarSOPs;
        acc.totalQuestions += ds.totalQuestions;
        acc.checkedCount   += ds.checkedCount;
        acc.reviewedCount  += ds.reviewedCount;
        acc.similarCount   += ds.similarCount;
        return acc;
      },
      {
        totalSOPs: 0, sopWithMCQs: 0, sopWithoutMCQs: 0,
        approvedSOPs: 0, pendingSOPs: 0, similarSOPs: 0,
        totalQuestions: 0, checkedCount: 0, reviewedCount: 0, similarCount: 0,
      },
    );

    return NextResponse.json(
      { success: true, departments: result, overall },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      },
    );
  } catch (error) {
    console.error('[dept-stats] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch department stats' },
      { status: 500 },
    );
  }
}
