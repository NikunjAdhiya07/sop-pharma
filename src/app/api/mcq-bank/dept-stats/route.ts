import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import { sopFamilyKeyFromIdentifier, normalizeSopIdentifierKey } from '@/lib/sopIdentifierNormalize';
import { filterPrimaryRegistryRows } from '@/lib/registryPrimaryRows';
import { getDashboardRegistryPayload } from '@/lib/dashboardRegistrySource';
import { getRedis, REDIS_TTL } from '@/lib/redis';

const DEPT_STATS_CACHE_KEY = 'mcq-dept-stats:v1';

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
    // Redis cache check
    const redis = getRedis();
    if (redis) {
      try {
        const cached = await redis.get(DEPT_STATS_CACHE_KEY);
        if (cached) return NextResponse.json(cached);
      } catch { /* fall through */ }
    }

    await connectDB();

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const mcqBankCollection = db.collection('mcqbanks');

    // ── 1. Fetch SOP registry rows from Dashboard source of truth ───────────
    const origin = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const dashboard = await getDashboardRegistryPayload(origin);
    const registryRows = Array.isArray(dashboard?.data) ? dashboard.data : [];
    const primaryRows = filterPrimaryRegistryRows(registryRows);
    const obsoleteSOPs: any[] = [];

    // ── 2. Aggregate MCQ bank stats per bank ──────────────────────────────
    const bankAgg = await mcqBankCollection
      .aggregate([
        {
          $project: {
            sopId: 1,
            sopIdentifier: 1,
            department: 1,
            language: 1,
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

    // ── 4. Count SOPs per dept ────────────────────────────────────────────────
    // Three dedup levels — mirroring dashboard exactly:
    //
    //  familyMap   — by family key (QAGE:1)  → totalSOPs (unique SOP numbers, ~428)
    //  normalMap   — by normalizeSopIdentifierKey (QAGE1-10) merging EN+GU into one
    //                → totalSopVersions (matches dashboard MERGED_DATA.length, ~479)
    //
    // normalMap key = normalizeSopIdentifierKey(raw), value = { dept, hasEng, hasGuj }
    const familyMap = new Map<string, { dept: string; langs: Set<string>; identifier: string; name: string }>();
    const normalMap = new Map<string, { dept: string; hasEng: boolean; hasGuj: boolean; identifier: string; name: string }>();

    for (const sop of primaryRows as any[]) {
      const raw = String(sop.sopNo || sop.identifier || '').trim().toUpperCase();
      if (!raw) continue;

      const fk = sopFamilyKeyFromIdentifier(raw);
      if (!fk) continue; // skip non-standard identifiers

      const dept = resolveDept(raw, (sop.department as string) || null);
      if (dept === 'Other') continue;

      const langRaw = String(sop.language || '').toLowerCase();
      // Dashboard primary rows can be "Both" — count both lang slots.
      const langs: ('English' | 'Gujarati')[] =
        langRaw === 'gujarati'
          ? ['Gujarati']
          : langRaw === 'both'
            ? ['English', 'Gujarati']
            : ['English'];

      // Family-level (totalSOPs = unique SOP numbers ignoring revision+language)
      if (!familyMap.has(fk)) {
        familyMap.set(fk, { dept, langs: new Set(), identifier: raw, name: sop.sopName || sop.englishName || '' });
      }
      for (const l of langs) familyMap.get(fk)!.langs.add(l);

      // Normalized-identifier level (matches dashboard MERGED_DATA — EN+GU merged as one)
      const nk = normalizeSopIdentifierKey(raw);
      if (!normalMap.has(nk)) {
        normalMap.set(nk, { dept, hasEng: false, hasGuj: false, identifier: raw, name: sop.sopName || sop.englishName || '' });
      }
      const ne = normalMap.get(nk)!;
      for (const l of langs) {
        if (l === 'Gujarati') ne.hasGuj = true;
        else ne.hasEng = true;
      }
    }

    console.log(`[dept-stats] family keys=${familyMap.size}  normalized identifiers=${normalMap.size}`);

    type DeptStats = {
      department: string;
      totalSOPs: number;
      totalSopVersions: number;
      mcqFoundVersions: number;
      mcqNotFoundVersions: number;
      totalSopPairs: number;
      mcqFoundPairs: number;
      mcqNotFoundPairs: number;
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
      remainingSOPs: { identifier: string; name: string }[];
    };

    const statsMap = new Map<string, DeptStats>();
    const initDept = (dept: string): DeptStats => ({
      department: dept,
      totalSOPs: 0, totalSopVersions: 0, mcqFoundVersions: 0, mcqNotFoundVersions: 0,
      totalSopPairs: 0, mcqFoundPairs: 0, mcqNotFoundPairs: 0,
      sopWithMCQs: 0, sopWithoutMCQs: 0,
      sopCompletedGen: 0, sopUnder100MCQs: 0,
      approvedSOPs: 0, partialSOPs: 0, pendingSOPs: 0, similarSOPs: 0,
      totalQuestions: 0, checkedCount: 0, reviewedCount: 0, similarCount: 0,
      sopEng: 0, sopGuj: 0,
      totalSopEng: 0, totalSopGuj: 0, remainingEng: 0, remainingGuj: 0,
      remainingSOPs: [],
    });

    // Tally totalSOPs from family keys (unique SOP numbers, ~428)
    for (const { dept, langs } of familyMap.values()) {
      if (!statsMap.has(dept)) statsMap.set(dept, initDept(dept));
      const ds = statsMap.get(dept)!;
      ds.totalSOPs += 1;
      if (langs.has('English'))  ds.totalSopEng += 1;
      if (langs.has('Gujarati')) ds.totalSopGuj += 1;
    }

    // Tally totalSopVersions from normalMap (matches dashboard MERGED_DATA.length, ~479)
    // Each unique normalized identifier = one "version" regardless of EN/GU
    for (const { dept } of normalMap.values()) {
      if (!statsMap.has(dept)) statsMap.set(dept, initDept(dept));
      const ds = statsMap.get(dept)!;
      ds.totalSopVersions += 1;
      ds.totalSopPairs = ds.totalSopVersions; // alias for frontend
    }

    // ── 5. Merge MCQ bank stats ────────────────────────────────────────────────
    // mcqByFamily: grouped by family key for sopWithMCQs, questions, approval stats
    // mcqFoundNormSet: normalized identifier keys that have any MCQ bank (EN or GU)
    const mcqByFamily = new Map<string, {
      dept: string;
      totalQuestions: number;
      checkedCount: number;
      reviewedCount: number;
      similarCount: number;
      hasEng: boolean;
      hasGuj: boolean;
    }>();
    const mcqFoundNormSet = new Set<string>(); // normalized identifier keys with a bank

    for (const bank of bankAgg) {
      const rawIdentifier = String(bank.sopIdentifier || '').trim().toUpperCase();
      if (!rawIdentifier) continue;

      const fk = sopFamilyKeyFromIdentifier(rawIdentifier);
      if (!fk) continue;

      const dept = resolveDept(rawIdentifier, bank.department ?? null);
      if (dept === 'Other') continue;

      const lang = String(bank.language || '').toLowerCase() === 'gujarati' ? 'Gujarati' : 'English';

      // Track normalized identifier keys that have any bank (same level as normalMap)
      mcqFoundNormSet.add(normalizeSopIdentifierKey(rawIdentifier));

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

    // Tally mcqFoundVersions per dept from the normalized set
    for (const nk of mcqFoundNormSet) {
      const entry = normalMap.get(nk);
      if (!entry) continue;
      const dept = entry.dept;
      if (!statsMap.has(dept)) statsMap.set(dept, initDept(dept));
      const ds = statsMap.get(dept)!;
      ds.mcqFoundVersions += 1;
      ds.mcqFoundPairs = ds.mcqFoundVersions; // alias for frontend
    }

    // Tally MCQ stats per dept from family map
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
      ds.sopWithoutMCQs      = Math.max(0, ds.totalSOPs - ds.sopWithMCQs);
      ds.remainingEng        = Math.max(0, ds.totalSopEng - ds.sopEng);
      ds.remainingGuj        = Math.max(0, ds.totalSopGuj - ds.sopGuj);
      ds.mcqNotFoundVersions = Math.max(0, ds.totalSopVersions - ds.mcqFoundVersions);
      ds.mcqNotFoundPairs    = ds.mcqNotFoundVersions; // alias for frontend
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

    // Informational: obsolete SOP counts (by dept) from SOP.isObsolete.
    const obsoleteByDept: Record<string, number> = {};
    for (const sop of obsoleteSOPs) {
      const raw = String(sop?.identifier || '').trim().toUpperCase();
      if (!raw) continue;
      const dept = resolveDept(raw, sop?.department);
      if (!dept || dept === 'Other') continue;
      obsoleteByDept[dept] = (obsoleteByDept[dept] || 0) + 1;
    }

    // Overall totals — sum only named departments
    const overall = result.reduce(
      (acc, ds) => {
        acc.totalSOPs            += ds.totalSOPs;
        acc.totalSopVersions     += ds.totalSopVersions;
        acc.mcqFoundVersions     += ds.mcqFoundVersions;
        acc.mcqNotFoundVersions  += ds.mcqNotFoundVersions;
        acc.totalSopPairs        += ds.totalSopVersions;   // alias
        acc.mcqFoundPairs        += ds.mcqFoundVersions;   // alias
        acc.mcqNotFoundPairs     += ds.mcqNotFoundVersions;// alias
        acc.sopWithMCQs       += ds.sopWithMCQs;
        acc.sopWithoutMCQs    += ds.sopWithoutMCQs;
        acc.sopCompletedGen   += ds.sopCompletedGen;
        acc.sopUnder100MCQs   += ds.sopUnder100MCQs;
        acc.approvedSOPs      += ds.approvedSOPs;
        acc.partialSOPs       += ds.partialSOPs;
        acc.pendingSOPs       += ds.pendingSOPs;
        acc.similarSOPs       += ds.similarSOPs;
        acc.totalQuestions    += ds.totalQuestions;
        acc.checkedCount      += ds.checkedCount;
        acc.reviewedCount     += ds.reviewedCount;
        acc.similarCount      += ds.similarCount;
        acc.sopEng            += ds.sopEng;
        acc.sopGuj            += ds.sopGuj;
        acc.totalSopEng       += ds.totalSopEng;
        acc.totalSopGuj       += ds.totalSopGuj;
        acc.remainingEng      += ds.remainingEng;
        acc.remainingGuj      += ds.remainingGuj;
        acc.remainingSOPs.push(...ds.remainingSOPs);
        return acc;
      },
      {
        totalSOPs: 0,
        totalSopVersions: 0, mcqFoundVersions: 0, mcqNotFoundVersions: 0,
        totalSopPairs: 0, mcqFoundPairs: 0, mcqNotFoundPairs: 0,
        sopWithMCQs: 0, sopWithoutMCQs: 0,
        sopCompletedGen: 0, sopUnder100MCQs: 0,
        approvedSOPs: 0, partialSOPs: 0, pendingSOPs: 0, similarSOPs: 0,
        totalQuestions: 0, checkedCount: 0, reviewedCount: 0, similarCount: 0,
        sopEng: 0, sopGuj: 0,
        totalSopEng: 0, totalSopGuj: 0, remainingEng: 0, remainingGuj: 0,
        remainingSOPs: [] as { identifier: string; name: string }[],
      },
    );

    const responseBody = {
      success: true,
      departments: result,
      overall,
      obsolete: { total: obsoleteSOPs.length, byDept: obsoleteByDept },
    };

    if (redis) {
      try { await redis.set(DEPT_STATS_CACHE_KEY, responseBody, { ex: REDIS_TTL.FIVE_MIN }); } catch { /* ignore */ }
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error('[dept-stats] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch department stats' },
      { status: 500 },
    );
  }
}
