import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

/**
 * GET /api/mcq-bank/dept-stats
 *
 * Returns MCQ status metrics per department.
 * Both SOPs and MCQ banks are bucketed by sopIdentifier prefix (same logic as mcqTreeBuilder)
 * so the counts are always consistent with the tree view.
 */

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

/** Resolve department from identifier string (e.g. "QAGE01-10" → "QA") */
function deptFromIdentifier(identifier?: string | null, fallback = 'Other'): string {
  if (!identifier) return fallback;
  const m = identifier.toUpperCase().trim().match(/^([A-Z]{2,6})\d/);
  if (m && SUBCAT_TO_DEPT[m[1]]) return SUBCAT_TO_DEPT[m[1]];
  // Try 4-char prefix then 3-char then 2-char
  for (let len = 4; len >= 2; len--) {
    const pfx = identifier.toUpperCase().trim().slice(0, len);
    if (SUBCAT_TO_DEPT[pfx]) return SUBCAT_TO_DEPT[pfx];
  }
  return fallback;
}

export async function GET() {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const mcqBankCollection = db.collection('mcqbanks');

    // ── 1. Fetch all non-obsolete SOPs ──────────────────────────────────────
    const allSOPs = await SOP.find({
      $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }],
    })
      .select('_id identifier department')
      .lean() as any[];

    // ── 2. Aggregate MCQ bank stats per bank (without loading mcqs array) ──
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
      .toArray() as any[];

    // ── 3. Build sopId → identifier map for banks that lack sopIdentifier ──
    const sopIdentifierMap = new Map<string, string>();
    for (const sop of allSOPs) {
      if (sop._id && sop.identifier) sopIdentifierMap.set(sop._id.toString(), sop.identifier);
    }

    // ── 4. Merge English + Gujarati banks per sopId ─────────────────────────
    // Key = sopId (or bank._id if no sopId). Each SOP counts as 1 logical unit.
    const sopMerged = new Map<string, {
      identifier: string;
      dept: string;
      totalQuestions: number;
      checkedCount: number;
      reviewedCount: number;
      similarCount: number;
    }>();

    for (const bank of bankAgg) {
      const key = bank.sopId?.toString() ?? bank._id?.toString();
      if (!key) continue;

      // Resolve identifier: prefer bank's own field, fallback to SOP map
      const identifier = bank.sopIdentifier || sopIdentifierMap.get(key) || '';
      const dept = deptFromIdentifier(identifier, bank.department || 'Other');

      if (!sopMerged.has(key)) {
        sopMerged.set(key, { identifier, dept, totalQuestions: 0, checkedCount: 0, reviewedCount: 0, similarCount: 0 });
      }
      const entry = sopMerged.get(key)!;
      entry.totalQuestions += bank.totalQuestions ?? 0;
      entry.checkedCount   += bank.checkedCount   ?? 0;
      entry.reviewedCount  += bank.reviewedCount  ?? 0;
      entry.similarCount   += bank.similarCount   ?? 0;
    }

    // ── 5. Count total SOPs per dept using identifier-based bucketing ───────
    const DEPARTMENT_ORDER = [
      'QA', 'QC', 'Microbiology', 'Production',
      'Store', 'Engineering and Maintenance', 'Personnel',
    ];

    type DeptStats = {
      department: string;
      totalSOPs: number;       // all active SOPs in SOP collection for this dept
      sopWithMCQs: number;     // SOPs that have at least one MCQ bank
      sopWithoutMCQs: number;  // SOPs with no MCQ bank yet (remaining)
      approvedSOPs: number;    // all questions checked
      pendingSOPs: number;     // has MCQs but not fully checked and no similar issues
      similarSOPs: number;     // has at least one similar question flagged
      totalQuestions: number;
      checkedCount: number;
      reviewedCount: number;
      similarCount: number;
    };

    const statsMap = new Map<string, DeptStats>();
    const initDept = (dept: string): DeptStats => ({
      department: dept, totalSOPs: 0, sopWithMCQs: 0, sopWithoutMCQs: 0,
      approvedSOPs: 0, pendingSOPs: 0, similarSOPs: 0,
      totalQuestions: 0, checkedCount: 0, reviewedCount: 0, similarCount: 0,
    });

    // Count SOPs from the SOP collection — deduplicate by identifier first so that
    // dual-language SOPs (one English record + one Gujarati record with the same
    // identifier) are counted as a single SOP, not two.
    const sopIdWithMCQs = new Set(sopMerged.keys());
    const seenIdentifiers = new Set<string>();

    for (const sop of allSOPs) {
      const key = (sop.identifier || '').trim().toUpperCase();
      if (key && seenIdentifiers.has(key)) continue; // skip duplicate language variant
      if (key) seenIdentifiers.add(key);
      const dept = deptFromIdentifier(sop.identifier, sop.department || 'Other');
      if (!statsMap.has(dept)) statsMap.set(dept, initDept(dept));
      statsMap.get(dept)!.totalSOPs += 1;
    }

    // Now tally MCQ bank stats per dept
    for (const [sopKey, entry] of sopMerged) {
      const dept = entry.dept;
      if (!statsMap.has(dept)) statsMap.set(dept, initDept(dept));
      const ds = statsMap.get(dept)!;

      ds.sopWithMCQs    += 1;
      ds.totalQuestions += entry.totalQuestions;
      ds.checkedCount   += entry.checkedCount;
      ds.reviewedCount  += entry.reviewedCount;
      ds.similarCount   += entry.similarCount;

      // Classify SOP status:
      // approved  = has questions AND all are checked
      // similar   = has at least one similar question (needs resolution)
      // pending   = has questions but not fully checked and no similar issues
      if (entry.totalQuestions > 0 && entry.checkedCount >= entry.totalQuestions) {
        ds.approvedSOPs += 1;
      } else if (entry.similarCount > 0) {
        ds.similarSOPs += 1;
      } else if (entry.totalQuestions > 0) {
        ds.pendingSOPs += 1;
      }
      // (if totalQuestions === 0, the bank exists but is empty — don't count in any category)
    }

    // Derive remaining = SOPs without any MCQ bank
    for (const ds of statsMap.values()) {
      ds.sopWithoutMCQs = Math.max(0, ds.totalSOPs - ds.sopWithMCQs);
    }

    // Sort by official order
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
          'Cache-Control': 'no-store',
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
