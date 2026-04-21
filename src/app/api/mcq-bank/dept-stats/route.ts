import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { sopFamilyKeyFromIdentifier } from '@/lib/sopIdentifierNormalize';

/**
 * GET /api/mcq-bank/dept-stats
 *
 * Returns MCQ status metrics per department.
 *
 * totalSOPs matches the dashboard's 431 count because we deduplicate by
 * SOP family key (prefix:number, ignoring revision suffix) — same logic as
 * filterPrimaryRegistryRows / sopFamilyKeyFromIdentifier used by the dashboard.
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

const DEPARTMENT_ORDER = [
  'QA', 'QC', 'Microbiology', 'Production',
  'Store', 'Engineering and Maintenance', 'Personnel',
];

/** Resolve department from identifier prefix (e.g. "QAGE01-10" → "QA"). */
function deptFromIdentifier(identifier?: string | null): string {
  if (!identifier) return 'Other';
  const m = identifier.toUpperCase().trim().match(/^([A-Z]{2,6})\d/);
  if (m && SUBCAT_TO_DEPT[m[1]]) return SUBCAT_TO_DEPT[m[1]];
  for (let len = 4; len >= 2; len--) {
    const pfx = identifier.toUpperCase().trim().slice(0, len);
    if (SUBCAT_TO_DEPT[pfx]) return SUBCAT_TO_DEPT[pfx];
  }
  return 'Other';
}

/** Normalize stored department name → canonical dept, mirrors dashboard normalizeDept. */
function normalizeDeptName(raw?: string | null): string {
  if (!raw) return 'Other';
  const lower = raw.toLowerCase().trim();
  if (lower === 'qa' || lower.includes('quality assurance')) return 'QA';
  if (lower === 'qc' || lower.includes('quality control')) return 'QC';
  if (lower.includes('micro')) return 'Microbiology';
  if (lower.includes('engineer')) return 'Engineering and Maintenance';
  if (lower.includes('person') || lower.includes('hr')) return 'Personnel';
  if (lower.includes('store')) return 'Store';
  if (lower.includes('prod')) return 'Production';
  return 'Other';
}

/** Resolve dept: try identifier prefix first, fall back to stored department name. */
function resolveDept(identifier: string, storedDept?: string | null): string {
  const fromId = deptFromIdentifier(identifier);
  if (fromId !== 'Other') return fromId;
  return normalizeDeptName(storedDept);
}


export async function GET() {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const mcqBankCollection = db.collection('mcqbanks');

    // ── 1. Fetch all non-obsolete SOPs that have an identifier ─────────────
    const allSOPs = await SOP.find({
      $and: [
        { $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }] },
        { identifier: { $exists: true, $nin: [null, '', undefined] } },
      ],
    })
      .select('_id identifier department language name')
      .lean() as any[];

    // ── 2. Aggregate MCQ bank stats per bank ──────────────────────────────
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

    // ── 3. Build sopId → identifier + language + department map ───────────────
    const sopIdentifierMap = new Map<string, string>();
    const sopLanguageMap = new Map<string, string>();
    const sopDeptMap = new Map<string, string>(); // sopId → stored department
    for (const sop of allSOPs) {
      if (sop._id) {
        const id = sop._id.toString();
        if (sop.identifier) sopIdentifierMap.set(id, sop.identifier);
        sopLanguageMap.set(id, sop.language === 'Gujarati' ? 'Gujarati' : 'English');
        if (sop.department) sopDeptMap.set(id, sop.department);
      }
    }

    // ── 4. Count registry-equivalent SOPs per dept ─────────────────────────
    // Deduplicate by family key (prefix:number, ignoring revision) so the count
    // matches the dashboard's "431 primary registry rows" logic.
    //
    // familyKey → { dept, langs, identifier (canonical), name }
    const familyMap = new Map<string, { dept: string; langs: Set<string>; identifier: string; name: string }>();

    for (const sop of allSOPs) {
      const raw = (sop.identifier as string).trim().toUpperCase();
      if (!raw) continue;

      const fk = sopFamilyKeyFromIdentifier(raw);
      if (!fk) continue; // skip non-standard identifiers (manuals, junk IDs)

      const dept = resolveDept(raw, sop.department);
      if (dept === 'Other') continue; // skip unknown depts — mirrors dashboard exclude

      const lang = sop.language === 'Gujarati' ? 'Gujarati' : 'English';

      if (!familyMap.has(fk)) {
        familyMap.set(fk, { dept, langs: new Set(), identifier: raw, name: sop.name || '' });
      }
      familyMap.get(fk)!.langs.add(lang);
    }

    console.log(`[dept-stats v4] unique family keys (matches dashboard count): ${familyMap.size}`);

    type DeptStats = {
      department: string;
      totalSOPs: number;
      sopWithMCQs: number;
      sopWithoutMCQs: number;
      sopCompletedGen: number;
      sopUnder100MCQs: number;
      approvedSOPs: number;
      partialSOPs: number;
      pendingSOPs: number;
      similarSOPs: number;
      totalQuestions: number;
      checkedCount: number;
      reviewedCount: number;
      similarCount: number;
      sopEng: number;
      sopGuj: number;
      totalSopEng: number;
      totalSopGuj: number;
      remainingEng: number;
      remainingGuj: number;
      remainingSOPs: { identifier: string; name: string }[]; // SOPs with no MCQ bank yet
    };

    const statsMap = new Map<string, DeptStats>();
    const initDept = (dept: string): DeptStats => ({
      department: dept, totalSOPs: 0, sopWithMCQs: 0, sopWithoutMCQs: 0,
      sopCompletedGen: 0, sopUnder100MCQs: 0,
      approvedSOPs: 0, partialSOPs: 0, pendingSOPs: 0, similarSOPs: 0,
      totalQuestions: 0, checkedCount: 0, reviewedCount: 0, similarCount: 0,
      sopEng: 0, sopGuj: 0,
      totalSopEng: 0, totalSopGuj: 0, remainingEng: 0, remainingGuj: 0,
      remainingSOPs: [],
    });

    // Tally totalSOPs + totalSopEng + totalSopGuj from deduplicated family keys
    // Also track all family keys so we can compute which ones have no MCQ bank
    for (const { dept, langs } of familyMap.values()) {
      if (!statsMap.has(dept)) statsMap.set(dept, initDept(dept));
      const ds = statsMap.get(dept)!;
      ds.totalSOPs += 1;
      if (langs.has('English'))  ds.totalSopEng += 1;
      if (langs.has('Gujarati')) ds.totalSopGuj += 1;
    }

    // ── 5. Merge MCQ bank stats per family key ─────────────────────────────
    // Group MCQ banks by family key so all revisions of the same SOP are counted once.
    const mcqByFamily = new Map<string, {
      dept: string;
      totalQuestions: number;
      checkedCount: number;
      reviewedCount: number;
      similarCount: number;
      hasEng: boolean;
      hasGuj: boolean;
    }>();

    for (const bank of bankAgg) {
      const fallbackKey = bank.sopId?.toString() ?? bank._id?.toString();
      if (!fallbackKey) continue;

      const rawIdentifier = (bank.sopIdentifier || sopIdentifierMap.get(fallbackKey) || '').trim().toUpperCase();
      if (!rawIdentifier) continue;

      const fk = sopFamilyKeyFromIdentifier(rawIdentifier);
      if (!fk) continue; // skip non-standard identifiers

      const storedDept = sopDeptMap.get(fallbackKey) ?? bank.department;
      const dept = resolveDept(rawIdentifier, storedDept);
      if (dept === 'Other') continue;

      const lang = sopLanguageMap.get(fallbackKey) ?? 'English';

      if (!mcqByFamily.has(fk)) {
        mcqByFamily.set(fk, { dept, totalQuestions: 0, checkedCount: 0, reviewedCount: 0, similarCount: 0, hasEng: false, hasGuj: false });
      }
      const entry = mcqByFamily.get(fk)!;
      entry.totalQuestions += bank.totalQuestions ?? 0;
      entry.checkedCount   += bank.checkedCount   ?? 0;
      entry.reviewedCount  += bank.reviewedCount  ?? 0;
      entry.similarCount   += bank.similarCount   ?? 0;
      if (lang === 'Gujarati') entry.hasGuj = true;
      else entry.hasEng = true;
    }

    // Tally MCQ stats per dept
    for (const [, entry] of mcqByFamily) {
      const dept = entry.dept;
      if (!statsMap.has(dept)) statsMap.set(dept, initDept(dept));
      const ds = statsMap.get(dept)!;

      ds.sopWithMCQs    += 1;
      ds.totalQuestions += entry.totalQuestions;
      ds.checkedCount   += entry.checkedCount;
      ds.reviewedCount  += entry.reviewedCount;
      ds.similarCount   += entry.similarCount;
      if (entry.hasEng) ds.sopEng += 1;
      if (entry.hasGuj) ds.sopGuj += 1;

      if (entry.totalQuestions >= 100) {
        ds.sopCompletedGen += 1;
      } else if (entry.totalQuestions > 0 && entry.totalQuestions < 100) {
        ds.sopUnder100MCQs += 1;
      }

      if (entry.totalQuestions > 0 && entry.checkedCount >= entry.totalQuestions) {
        ds.approvedSOPs += 1;
      } else if (entry.similarCount > 0) {
        ds.similarSOPs += 1;
      } else if (entry.totalQuestions > 0 && entry.checkedCount > 0) {
        ds.partialSOPs += 1;
      } else if (entry.totalQuestions > 0) {
        ds.pendingSOPs += 1;
      }
    }

    // Derive remaining counts + build list of SOPs with no MCQ bank
    for (const ds of statsMap.values()) {
      ds.sopWithoutMCQs = Math.max(0, ds.totalSOPs - ds.sopWithMCQs);
      ds.remainingEng   = Math.max(0, ds.totalSopEng - ds.sopEng);
      ds.remainingGuj   = Math.max(0, ds.totalSopGuj - ds.sopGuj);
    }

    // Populate remainingSOPs: family keys in familyMap that have no MCQ bank entry
    for (const [fk, { dept, identifier, name }] of familyMap) {
      if (dept === 'Other') continue;
      if (mcqByFamily.has(fk)) continue; // has MCQ bank — not remaining
      if (!statsMap.has(dept)) continue;
      statsMap.get(dept)!.remainingSOPs.push({ identifier, name });
    }
    // Sort remaining by identifier for stable display
    for (const ds of statsMap.values()) {
      ds.remainingSOPs.sort((a, b) => a.identifier.localeCompare(b.identifier));
    }

    // Only return the 7 named departments (mirrors dashboard + tree view)
    const result: DeptStats[] = [];
    for (const dept of DEPARTMENT_ORDER) {
      if (statsMap.has(dept)) result.push(statsMap.get(dept)!);
    }

    // Overall totals — sum only named departments
    const overall = result.reduce(
      (acc, ds) => {
        acc.totalSOPs      += ds.totalSOPs;
        acc.sopWithMCQs    += ds.sopWithMCQs;
        acc.sopWithoutMCQs += ds.sopWithoutMCQs;
        acc.sopCompletedGen+= ds.sopCompletedGen;
        acc.sopUnder100MCQs+= ds.sopUnder100MCQs;
        acc.approvedSOPs   += ds.approvedSOPs;
        acc.partialSOPs    += ds.partialSOPs;
        acc.pendingSOPs    += ds.pendingSOPs;
        acc.similarSOPs    += ds.similarSOPs;
        acc.totalQuestions += ds.totalQuestions;
        acc.checkedCount   += ds.checkedCount;
        acc.reviewedCount  += ds.reviewedCount;
        acc.similarCount   += ds.similarCount;
        acc.sopEng         += ds.sopEng;
        acc.sopGuj         += ds.sopGuj;
        acc.totalSopEng    += ds.totalSopEng;
        acc.totalSopGuj    += ds.totalSopGuj;
        acc.remainingEng   += ds.remainingEng;
        acc.remainingGuj   += ds.remainingGuj;
        acc.remainingSOPs.push(...ds.remainingSOPs);
        return acc;
      },
      {
        totalSOPs: 0, sopWithMCQs: 0, sopWithoutMCQs: 0,
        sopCompletedGen: 0, sopUnder100MCQs: 0,
        approvedSOPs: 0, partialSOPs: 0, pendingSOPs: 0, similarSOPs: 0,
        totalQuestions: 0, checkedCount: 0, reviewedCount: 0, similarCount: 0,
        sopEng: 0, sopGuj: 0,
        totalSopEng: 0, totalSopGuj: 0, remainingEng: 0, remainingGuj: 0,
        remainingSOPs: [] as { identifier: string; name: string }[],
      },
    );

    return NextResponse.json(
      { success: true, departments: result, overall },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[dept-stats] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch department stats' },
      { status: 500 },
    );
  }
}
