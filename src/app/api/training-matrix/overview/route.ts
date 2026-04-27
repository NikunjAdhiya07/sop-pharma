import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrixUpload from '@/models/TrainingMatrixUpload';
import { resolveDept } from '@/lib/deptResolver';
import { GET as getDashboardSops } from '@/app/api/dashboard/sops/route';
import { filterPrimaryRegistryRowsUniqueByFamily } from '@/lib/registryPrimaryRows';
import SOP from '@/models/SOP';
import TrainingMatrix from '@/models/TrainingMatrix';
import User from '@/models/User';
import MCQBank from '@/models/MCQBank';

export const dynamic = 'force-dynamic';

const DEPT_CANONICAL = ['QA','QC','Microbiology','Production','Store','Engineering','Personnel'];

type LangKey = 'ENG' | 'GUJ';

type OverviewCacheEntry = { ts: number; payload: any };
const CACHE_TTL_MS = 60_000;

function getCacheKey(req: NextRequest) {
  // Keep it simple: one cache for the whole overview payload.
  // If later this route becomes user-specific, include user/session key here.
  return 'training-matrix-overview:v10';
}

function getCached(req: NextRequest): any | null {
  const key = getCacheKey(req);
  const store = (globalThis as any).__tm_overview_cache as Record<string, OverviewCacheEntry> | undefined;
  const entry = store?.[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.payload;
}

function setCached(req: NextRequest, payload: any) {
  const key = getCacheKey(req);
  const g = globalThis as any;
  if (!g.__tm_overview_cache) g.__tm_overview_cache = {};
  g.__tm_overview_cache[key] = { ts: Date.now(), payload } satisfies OverviewCacheEntry;
}

function withCacheHeaders(res: NextResponse) {
  // Helps both browser and any proxy cache; also reduces repeated "version checks" on reload.
  res.headers.set('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
  return res;
}

function canonDept(raw: string): string {
  const t = (raw || '').toLowerCase();
  if (/micro/.test(t)) return 'Microbiology';
  if (/engineer|maint/.test(t)) return 'Engineering';
  if (/person|hr\b/.test(t)) return 'Personnel';
  if (/\bqa\b|quality.assur/.test(t)) return 'QA';
  if (/\bqc\b|quality.cont/.test(t)) return 'QC';
  if (/store/.test(t)) return 'Store';
  if (/prod/.test(t)) return 'Production';
  return raw;
}

function stripVersion(code: string): string {
  return String(code || '').toUpperCase().replace(/-\d+$/, '').trim();
}

function canonDeptCode(raw: string): string | null {
  const t = String(raw || '').toUpperCase().trim();
  if (!t) return null;
  if (t === 'QA') return 'QA';
  if (t === 'QC') return 'QC';
  if (t === 'MI' || t === 'MICRO') return 'Microbiology';
  if (t === 'PR' || t === 'PROD') return 'Production';
  if (t === 'ST' || t === 'STORE') return 'Store';
  if (t === 'EN' || t === 'ENG') return 'Engineering';
  if (t === 'PE' || t === 'PER' || t === 'HR') return 'Personnel';
  return null;
}

function resolveDeptForBaseSop(
  baseSopCode: string,
  meta: { department?: string; departmentCode?: string } | undefined
): string {
  // Use the exact same mapping logic as the dashboard.
  // If it can’t resolve from code prefix, fall back to SOPLibrary.department string.
  const fromResolver = resolveDept(baseSopCode, meta?.department || null);
  if (DEPT_CANONICAL.includes(fromResolver)) return fromResolver;
  return canonDeptCode(meta?.departmentCode || '') || canonDept(meta?.department || '');
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const forceFresh = sp.get('refresh') === '1';
    if (!forceFresh) {
      const cached = getCached(req);
      if (cached) return withCacheHeaders(NextResponse.json(cached));
    }

    await connectDB();

    // 0. Build trainer maps using the same sources as the Dashboard:
    //    a) TrainingMatrix entries with trainerName (SOP-specific)
    //    b) Users with role=trainer or isTrainerEligible (department-level)
    //    c) Hardcoded fallback (same as dashboard)
    const [tmTrainerEntries, allUsers] = await Promise.all([
      TrainingMatrix.find({ trainerName: { $exists: true, $nin: [null, ''] } })
        .select('sopIdentifier department trainerName')
        .lean(),
      User.find({}).lean(),
    ]);

    // sopCode (upper) → trainerName(s)
    const sopTrainerMap = new Map<string, Set<string>>();
    for (const entry of tmTrainerEntries as any[]) {
      if (!entry.sopIdentifier || !entry.trainerName) continue;
      const code = String(entry.sopIdentifier).trim().toUpperCase().replace(/-\d+$/, '');
      if (!sopTrainerMap.has(code)) sopTrainerMap.set(code, new Set());
      sopTrainerMap.get(code)!.add(entry.trainerName);
    }

    // dept (canonical) → trainerName(s) from User collection
    const deptTrainerMap = new Map<string, Set<string>>();
    for (const user of allUsers as any[]) {
      const isTrainer = user.role === 'trainer' || user.isTrainerEligible === true;
      if (!isTrainer) continue;
      const deptList: string[] = user.allowedDepartments?.length
        ? user.allowedDepartments
        : user.department ? [user.department] : [];
      for (const rawDept of deptList) {
        const dept = canonDept(rawDept);
        if (!dept) continue;
        if (!deptTrainerMap.has(dept)) deptTrainerMap.set(dept, new Set());
        deptTrainerMap.get(dept)!.add(user.name);
      }
    }

    // Same hardcoded fallback as the Dashboard
    const fallbackTrainerMap: Record<string, string[]> = {
      QA: ['Abhishek Dave'],
      QC: ['Jayesh Aal'],
      Microbiology: ['Ulhas Mahajan'],
      Store: ['Sanjay Chauhan'],
      Production: ['Darshan Parmar', 'Nirav Morasiya'],
      Personnel: ['Jignesh Trivedi'],
      Engineering: ['Devang Rathod'],
      'Engineering and Maintenance': ['Devang Rathod'],
    };

    // 1. Pull the latest upload per department (with snapshot)
    const uploads = await TrainingMatrixUpload.find({
      fileType: 'main',
      snapshot: { $exists: true, $ne: null },
    })
      .sort({ uploadedAt: -1 })
      .lean();

    const latestByDept = new Map<string, any>();
    for (const up of uploads) {
      const dept = canonDept(up.department);
      if (!latestByDept.has(dept)) latestByDept.set(dept, up);
    }

    // 2. Use the EXACT same SOP set the Dashboard displays, so the Training Matrix
    // "SOPs (DB)" count equals the Dashboard's total. We call the Dashboard SOPs API
    // directly, then apply the same one-row-per-family filter the Dashboard uses.
    // Each remaining row becomes a base SOP code via `stripVersion(sopNo)` — the same
    // format Excel uploads use (e.g. "QA001", no revision suffix).
    const origin = req.nextUrl.origin;
    const dashUrl = new URL('/api/dashboard/sops', origin);
    // IMPORTANT: don't bypass caches unless explicitly requested.
    if (forceFresh) dashUrl.searchParams.set('refresh', '1');
    const dashReq = new NextRequest(dashUrl);
    const dashRes = await getDashboardSops(dashReq as any);
    const dashboard = (await dashRes.json()) as { success: boolean; data?: any[] };
    const registryRows = Array.isArray(dashboard?.data) ? dashboard.data : [];
    const familyUniqueRows = filterPrimaryRegistryRowsUniqueByFamily(registryRows);

    // Build base metadata from registry rows (titles, dept, language)
    const dbBaseSet = new Set<string>();
    const dbBaseMeta = new Map<string, { title: string; department: string; departmentCode: string; expired?: boolean; targetDate?: string | null; latestIdentifier?: string }>();
    const dbBaseLangs = new Map<string, Set<LangKey>>();
    for (const row of familyUniqueRows as any[]) {
      const sopNo = String(row?.sopNo || row?.identifier || '').trim();
      const base = stripVersion(sopNo);
      if (!base) continue;
      dbBaseSet.add(base);

      if (!dbBaseMeta.has(base)) {
        dbBaseMeta.set(base, {
          title: String(row?.englishName || row?.sopName || row?.name || ''),
          department: String(row?.department || ''),
          departmentCode: String(row?.departmentCode || ''),
          expired: false,
          targetDate: null,
          latestIdentifier: sopNo,
        });
      }

      if (!dbBaseLangs.has(base)) dbBaseLangs.set(base, new Set<LangKey>());
      const langs = dbBaseLangs.get(base)!;
      const rawLang = String(row?.language || '').trim().toLowerCase();
      const isDual = !!row?.isDualLanguage || (!!row?.englishVersion && !!row?.gujaratiVersion);
      if (isDual) {
        langs.add('ENG');
        langs.add('GUJ');
      } else if (rawLang === 'gujarati') {
        langs.add('GUJ');
      } else {
        langs.add('ENG');
      }
    }

    // Fetch actual expiry/review dates directly from the SOP model
    // NOTE: The actual DB field with dates is `reviewDate` (446 docs), NOT `expiryDate` (0) or `nextReviewDate` (0).
    // We also check SOPLibrary.expiryDate as a fallback (144 docs).
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const latestIdentifiers = Array.from(dbBaseMeta.values())
      .map(m => m.latestIdentifier)
      .filter(Boolean);

    // Primary source: SOP collection `reviewDate` field.
    // Sort newest-first so that when multiple records share the same identifier (duplicate
    // uploads), the most recently uploaded SOP's review date wins.
    const sopDateDocs = await SOP.find(
      { identifier: { $in: latestIdentifiers }, reviewDate: { $exists: true, $ne: null }, isObsolete: { $ne: true } },
      { identifier: 1, reviewDate: 1, uploadedAt: 1 }
    )
      .sort({ uploadedAt: -1 })
      .lean();

    for (const doc of sopDateDocs as any[]) {
      const id = String(doc?.identifier || '');
      const base = stripVersion(id);
      if (!base || !dbBaseMeta.has(base)) continue;

      const meta = dbBaseMeta.get(base)!;
      if (meta.targetDate) continue; // already set by a newer doc for this family
      const rawDate = doc?.reviewDate;
      if (!rawDate) continue;
      const t = new Date(rawDate);
      if (isNaN(t.getTime())) continue;
      const expired = Math.ceil((t.getTime() - today.getTime()) / (1000 * 3600 * 24)) < 0;
      meta.targetDate = t.toISOString();
      meta.expired = expired;
    }

    // Fallback: SOPLibrary `expiryDate` — fill in any SOPs still missing a date
    const SOPLibrary = (await import('@/models/SOPLibrary')).default;
    const libDateDocs = await SOPLibrary.find(
      { sopIdentifier: { $in: latestIdentifiers }, expiryDate: { $exists: true, $ne: null } },
      { sopIdentifier: 1, expiryDate: 1 }
    ).lean();

    for (const doc of libDateDocs as any[]) {
      const id = String(doc?.sopIdentifier || '');
      const base = stripVersion(id);
      if (!base || !dbBaseMeta.has(base)) continue;
      const meta = dbBaseMeta.get(base)!;
      if (meta.targetDate) continue; // already set from SOP collection
      const rawDate = (doc as any)?.expiryDate;
      if (!rawDate) continue;
      const t = new Date(rawDate);
      if (isNaN(t.getTime())) continue;
      const expired = Math.ceil((t.getTime() - today.getTime()) / (1000 * 3600 * 24)) < 0;
      meta.targetDate = t.toISOString();
      meta.expired = expired;
    }

    // Debug: count how many SOPs have a date
    const withDate = [...dbBaseMeta.values()].filter((m) => m.targetDate).length;
    const withoutDate = [...dbBaseMeta.values()].filter((m) => !m.targetDate).length;
    console.log(`[TM Overview] SOP dates: ${withDate} with date, ${withoutDate} without date, sopDateDocs(reviewDate): ${sopDateDocs.length}, libDateDocs(expiryDate): ${libDateDocs.length}`);

    // ── MCQ stats: per-SOP identifier → { totalQuestions, approvedCount } ──────
    // Use aggregation to count total MCQs and approved MCQs per sopIdentifier.
    const mcqAggResults = await MCQBank.aggregate([
      { $match: { isObsolete: { $ne: true } } },
      {
        $project: {
          sopIdentifier: 1,
          totalQuestions: 1,
          approvedCount: {
            $size: {
              $filter: {
                input: { $ifNull: ['$mcqs', []] },
                as: 'm',
                cond: { $eq: ['$$m.isChecked', true] },
              },
            },
          },
        },
      },
    ]);

    // Build map: baseSopCode → { totalQuestions, approvedCount }
    // A SOP may have multiple MCQBank entries (e.g. English + Gujarati); sum them.
    const mcqStatMap = new Map<string, { totalQuestions: number; approvedCount: number }>();
    for (const doc of mcqAggResults as any[]) {
      const id = String(doc?.sopIdentifier || '').trim();
      if (!id) continue;
      const base = stripVersion(id);
      if (!base) continue;
      const tq: number = doc?.totalQuestions || 0;
      const approved: number = doc?.approvedCount || 0;
      const existing = mcqStatMap.get(base);
      if (existing) {
        existing.totalQuestions += tq;
        existing.approvedCount += approved;
      } else {
        mcqStatMap.set(base, { totalQuestions: tq, approvedCount: approved });
      }
    }

    const dbSopCount = dbBaseSet.size;

    /** Resolve trainer using the same priority as the Dashboard:
     *  1. SOP-specific TrainingMatrix entries (trainerName)
     *  2. Department-level Users with trainer role / isTrainerEligible
     *  3. Hardcoded fallback per department */
    const resolveTrainer = (base: string, ownerDept: string): string => {
      if (sopTrainerMap.has(base) && sopTrainerMap.get(base)!.size > 0) {
        return Array.from(sopTrainerMap.get(base)!).join(', ');
      }
      if (deptTrainerMap.has(ownerDept) && deptTrainerMap.get(ownerDept)!.size > 0) {
        return Array.from(deptTrainerMap.get(ownerDept)!).join(', ');
      }
      if (fallbackTrainerMap[ownerDept]) {
        return fallbackTrainerMap[ownerDept].join(', ');
      }
      return '';
    };

    // Pre-compute trainer name + has-trainer for every base SOP in the DB set
    const dbBaseHasTrainer = new Map<string, boolean>();
    const dbBaseTrainerName = new Map<string, string>();
    for (const base of dbBaseSet) {
      const meta = dbBaseMeta.get(base);
      const ownerDept = resolveDeptForBaseSop(base, meta);
      const tr = resolveTrainer(base, ownerDept);
      dbBaseHasTrainer.set(base, Boolean(tr));
      if (tr) dbBaseTrainerName.set(base, tr);
    }

    // 2b. Obsolete SOPs: these may not appear in primary registry rows but are still "in DB".
    // We treat them separately so UI can show "Found (obsolete)" explicitly.
    const obsoleteDocs = await SOP.find({ isObsolete: true })
      .select('identifier name department obsoleteAt obsoleteReason version')
      .lean();

    const obsoleteByDept: Record<string, Set<string>> = {};
    for (const d of DEPT_CANONICAL) obsoleteByDept[d] = new Set<string>();

    for (const doc of obsoleteDocs as any[]) {
      const id = String(doc?.identifier || '').trim();
      if (!id) continue;
      const base = stripVersion(id);
      if (!base) continue;
      const dept = resolveDeptForBaseSop(base, {
        department: String(doc?.department || ''),
        departmentCode: '',
      });
      if (!DEPT_CANONICAL.includes(dept)) continue;
      obsoleteByDept[dept].add(base);
    }

    // Build department-wise SOP list (base SOPs) from DB
    const dbSopsByDept: Record<string, Array<{ sopCode: string; title: string }>> = {};
    const dbSopCountsByDept: Record<string, number> = {};
    for (const d of DEPT_CANONICAL) {
      dbSopsByDept[d] = [];
      dbSopCountsByDept[d] = 0;
    }

    for (const sopCode of dbBaseSet) {
      const meta = dbBaseMeta.get(sopCode);
      const dept = resolveDeptForBaseSop(sopCode, meta);
      if (!DEPT_CANONICAL.includes(dept)) continue;
      dbSopsByDept[dept].push({ sopCode, title: meta?.title || '' });
    }
    for (const d of DEPT_CANONICAL) {
      dbSopsByDept[d].sort((a, b) => a.sopCode.localeCompare(b.sopCode));
      dbSopCountsByDept[d] = dbSopsByDept[d].length;
    }

    // Fast lookup: dept -> SOP base codes that belong to that dept in DB
    const dbDeptSets: Record<string, Set<string>> = {};
    for (const d of DEPT_CANONICAL) {
      dbDeptSets[d] = new Set((dbSopsByDept[d] || []).map((x) => x.sopCode));
    }

    // 3. Build per-department cards
    const allExcelCodes = new Set<string>();
    const allExcelEmployees: Array<{ name: string; designation: string; department: string; training: Record<string, boolean> }> = [];
    const perDept: Record<string, any> = {};
    const sopMonthMapAll: Record<string, Record<string, string>> = {};
    const sopCodesByDept: Record<string, string[]> = {};
    const monthCountsByDept: Record<string, Record<string, number>> = {};

    for (const dept of DEPT_CANONICAL) {
      const up = latestByDept.get(dept);
      if (!up || !up.snapshot) {
        perDept[dept] = {
          uploaded: false,
          sopCount: 0,
          foundInDb: 0,
          missingFromExcel: 0,
          trainersAssigned: 0,
          trainersMissing: 0,
          employeeCount: 0,
          fullyTrained: 0,
          incomplete: 0,
          monthCounts: {},
          sopCodes: [],
          employees: [],
          fileUrl: null,
          uploadedAt: null,
          missingFromExcelList: [],
          trainersMissingList: [],
          additionalTraining: { total: 0, byDept: {} },
          langBreakdown: [],
        };
        continue;
      }

      const snapshot = up.snapshot as {
        sopCodes: string[];
        sopMonthMap: Record<string, string>;
        monthCounts: Record<string, number>;
        employees: Array<{ name: string; designation: string; training: Record<string, boolean> }>;
      };

      // Unique SOP codes from snapshot header row
      const codes = Array.from(new Set((snapshot.sopCodes || []).map((c) => String(c).toUpperCase().replace(/-\d+$/, '').trim()))).filter(Boolean);
      codes.forEach((c) => allExcelCodes.add(c));
      sopCodesByDept[dept] = codes;
      sopMonthMapAll[dept] = snapshot.sopMonthMap || {};
      monthCountsByDept[dept] = snapshot.monthCounts || {};

      // IMPORTANT: "Found in DB" must be department-scoped, otherwise it can exceed
      // the department's own DB SOP count (Excel sheet may contain SOPs that exist in DB
      // but are mapped to other departments).
      const dbDeptSet = dbDeptSets[dept] || new Set<string>();
      const foundInDb = codes.filter((c) => dbDeptSet.has(c));

      // Found in obsolete: exists in DB but only as obsolete SOP record for this dept
      const obsoleteSet = obsoleteByDept[dept] || new Set<string>();
      const foundObsolete = codes.filter((c) => obsoleteSet.has(c) && !dbDeptSet.has(c));
      const missingFromExcel = [...dbBaseSet].filter((c) => {
        const meta = dbBaseMeta.get(c);
        if (!meta) return false;
        return resolveDeptForBaseSop(c, meta) === dept && !codes.includes(c);
      });

      // Repetitive SOP categorisation — count how many employees have each SOP ticked (assigned)
      const tickCountBySop = new Map<string, number>();
      for (const emp of (snapshot.employees || [])) {
        for (const [rawCode, ticked] of Object.entries(emp.training || {})) {
          if (!ticked) continue;
          const c = String(rawCode).toUpperCase().replace(/-\d+$/, '').trim();
          if (!c) continue;
          tickCountBySop.set(c, (tickCountBySop.get(c) || 0) + 1);
        }
      }
      type RepeatItem = { sopCode: string; title: string; department: string; count: number };
      const repeat3PlusList: RepeatItem[] = [];
      const repeat2List: RepeatItem[] = [];
      const repeat1List: RepeatItem[] = [];
      for (const c of codes) {
        const count = tickCountBySop.get(c) || 0;
        const meta = dbBaseMeta.get(c);
        const item: RepeatItem = { sopCode: c, title: meta?.title || '', department: dept, count };
        if (count >= 3) repeat3PlusList.push(item);
        else if (count === 2) repeat2List.push(item);
        else repeat1List.push(item);
      }
      repeat3PlusList.sort((a, b) => b.count - a.count || a.sopCode.localeCompare(b.sopCode));
      repeat2List.sort((a, b) => a.sopCode.localeCompare(b.sopCode));
      repeat1List.sort((a, b) => a.sopCode.localeCompare(b.sopCode));

      const excelDeptSplitFoundByDept: Record<string, number> = {};
      const excelDeptSplitMissingByDept: Record<string, number> = {};
      for (const d of DEPT_CANONICAL) {
        excelDeptSplitFoundByDept[d] = 0;
        excelDeptSplitMissingByDept[d] = 0;
      }
      let excelDeptSplitUnknownFound = 0;
      let excelDeptSplitUnknownMissing = 0;
      for (const c of codes) {
        const inDb = dbBaseSet.has(c);
        const meta = inDb ? dbBaseMeta.get(c) : undefined;
        const owner = resolveDeptForBaseSop(c, meta as any);
        const isKnown = DEPT_CANONICAL.includes(owner);
        if (!isKnown) {
          if (inDb) excelDeptSplitUnknownFound += 1;
          continue;
        }
        if (inDb) excelDeptSplitFoundByDept[owner] = (excelDeptSplitFoundByDept[owner] || 0) + 1;
      }

      // Also include DB SOPs for THIS card's dept that are missing from Excel
      // so the dept-split's red count reconciles with the "In Excel" missing number.
      for (const c of missingFromExcel) {
        const meta = dbBaseMeta.get(c);
        const owner = resolveDeptForBaseSop(c, meta as any);
        if (DEPT_CANONICAL.includes(owner)) {
          excelDeptSplitMissingByDept[owner] = (excelDeptSplitMissingByDept[owner] || 0) + 1;
        } else {
          excelDeptSplitUnknownMissing += 1;
        }
      }

      const langKeys = new Set<LangKey>();
      for (const c of foundInDb) {
        const ls = dbBaseLangs.get(c);
        (ls && ls.size > 0 ? Array.from(ls) : (['ENG'] as LangKey[])).forEach((k) => langKeys.add(k));
      }
      for (const c of missingFromExcel) {
        const ls = dbBaseLangs.get(c);
        (ls && ls.size > 0 ? Array.from(ls) : (['ENG'] as LangKey[])).forEach((k) => langKeys.add(k));
      }
      const langBreakdown = Array.from(langKeys)
        .sort((a, b) => (a === b ? 0 : a === 'ENG' ? -1 : 1))
        .map((k) => {
          const found = foundInDb.filter((c) => (dbBaseLangs.get(c) || new Set<LangKey>(['ENG'])).has(k)).length;
          const missing = missingFromExcel.filter((c) => (dbBaseLangs.get(c) || new Set<LangKey>(['ENG'])).has(k)).length;
          return { key: k, label: k, found, missing };
        });

      const trainersAssignedList = foundInDb.filter((c) => dbBaseHasTrainer.get(c));
      const trainersMissingListRows = foundInDb
        .filter((c) => !dbBaseHasTrainer.get(c))
        .map((c) => ({
          sopCode: c,
          month: (snapshot.sopMonthMap || {})[c] || '',
          department: dept,
        }));
      const trainersAssigned = trainersAssignedList.length;
      const trainersMissing = trainersMissingListRows.length;
      
      let expiredCount = 0;
      let okayCount = 0;
      for (const c of foundInDb) {
        const meta = dbBaseMeta.get(c);
        if (!meta?.targetDate) continue; // no date set — excluded from both counts
        if (meta.expired) expiredCount++;
        else okayCount++;
      }

      // MCQ counts for this dept (scoped to Excel SOPs found in DB)
      let mcqCreatedCount = 0;    // SOPs with >= 100 MCQs
      let mcqNotCreatedCount = 0; // SOPs with < 100 MCQs (including zero)
      let mcqAllApprovedCount = 0;    // SOPs where all MCQs are approved
      let mcqPartiallyApprovedCount = 0; // SOPs with some but not all MCQs approved
      let mcqNotApprovedCount = 0;    // SOPs with 0 approved MCQs
      
      const mcqCreatedList: string[] = [];
      const mcqNotCreatedList: string[] = [];
      const mcqAllApprovedList: string[] = [];
      const mcqPartiallyApprovedList: string[] = [];
      const mcqNotApprovedList: string[] = [];

      for (const sopCode of foundInDb) {
        const mcqStat = mcqStatMap.get(sopCode);
        const tq = mcqStat?.totalQuestions ?? 0;
        if (tq >= 100) {
          mcqCreatedCount++;
          mcqCreatedList.push(sopCode);
        } else {
          mcqNotCreatedCount++;
          mcqNotCreatedList.push(sopCode);
        }

        const approved = mcqStat?.approvedCount ?? 0;
        if (tq > 0) {
          if (approved >= tq) {
            mcqAllApprovedCount++;
            mcqAllApprovedList.push(sopCode);
          } else if (approved > 0) {
            mcqPartiallyApprovedCount++;
            mcqPartiallyApprovedList.push(sopCode);
          } else {
            mcqNotApprovedCount++;
            mcqNotApprovedList.push(sopCode);
          }
        } else {
          mcqNotApprovedCount++;
          mcqNotApprovedList.push(sopCode);
        }
      }

      const employees = (snapshot.employees || []).map((e) => ({
        ...e,
        department: dept,
      }));
      const fullyTrained = employees.filter((e) => {
        const vals = Object.values(e.training || {});
        return vals.length > 0 && vals.every(Boolean);
      }).length;
      const incomplete = employees.length - fullyTrained;
      employees.forEach((e) => allExcelEmployees.push(e));

      perDept[dept] = {
        uploaded: true,
        sopCount: codes.length,
        foundInDb: foundInDb.length,
        foundObsolete: foundObsolete.length,
        missingFromExcel: missingFromExcel.length,
        langBreakdown,
        excelDeptSplit: {
          total: codes.length,
          foundByDept: excelDeptSplitFoundByDept,
          missingByDept: excelDeptSplitMissingByDept,
          unknownFound: excelDeptSplitUnknownFound,
          unknownMissing: excelDeptSplitUnknownMissing,
        },
        trainersAssigned,
        trainersMissing,
        expiredCount,
        okayCount,
        mcqCreatedCount,
        mcqNotCreatedCount,
        mcqAllApprovedCount,
        mcqPartiallyApprovedCount,
        mcqNotApprovedCount,
        employeeCount: employees.length,
        fullyTrained,
        incomplete,
        monthCounts: snapshot.monthCounts || {},
        sopCodes: codes,
        // Exact lists for instant client-side filtering (no API call needed)
        foundInDbList: foundInDb,
        expiredList: foundInDb.filter((c) => dbBaseMeta.get(c)?.expired),
        okayList: foundInDb.filter((c) => !dbBaseMeta.get(c)?.expired),
        mcqCreatedList,
        mcqNotCreatedList,
        mcqAllApprovedList,
        mcqPartiallyApprovedList,
        mcqNotApprovedList,
        employees,
        fileUrl: up.fileUrl || null,
        uploadedAt: up.uploadedAt,
        fileName: up.fileName,
        missingFromExcelList: missingFromExcel.map((c) => ({
          sopCode: c,
          title: dbBaseMeta.get(c)?.title || '',
          department: canonDept(dbBaseMeta.get(c)?.department || ''),
        })),
        trainersMissingList: trainersMissingListRows,
        trainerBySopCode: Object.fromEntries(
          [...codes, ...missingFromExcel]
            .map((c) => [c, dbBaseTrainerName.get(c) || ''])
            .filter(([, v]) => v)
        ),
        repeat3PlusCount: repeat3PlusList.length,
        repeat2Count: repeat2List.length,
        repeat1Count: repeat1List.length,
        repeat3PlusList,
        repeat2List,
        repeat1List,
      };
    }

    // 4. Total card
    const dbSopsAll = [...dbBaseSet];
    const missingFromAllExcel = dbSopsAll.filter((c) => !allExcelCodes.has(c));
    let totalTrainersAssigned = 0;
    let totalTrainersMissing = 0;
    let totalSopOkayCount = 0;
    let totalSopExpiredCount = 0;
    const totalTrainersMissingList: any[] = [];
    // MCQ totals across ALL DB SOPs (not dept-scoped by upload)
    let totalMcqCreated = 0;
    let totalMcqNotCreated = 0;
    let totalMcqAllApproved = 0;
    let totalMcqPartiallyApproved = 0;
    let totalMcqNotApproved = 0;
    for (const base of dbBaseSet) {
      const mcqStat = mcqStatMap.get(base);
      const tq = mcqStat?.totalQuestions ?? 0;
      if (tq >= 100) totalMcqCreated++; else totalMcqNotCreated++;
      
      const approved = mcqStat?.approvedCount ?? 0;
      if (tq > 0) {
        if (approved >= tq) totalMcqAllApproved++;
        else if (approved > 0) totalMcqPartiallyApproved++;
        else totalMcqNotApproved++;
      } else {
        totalMcqNotApproved++;
      }
    }
    for (const dept of DEPT_CANONICAL) {
      if (perDept[dept].uploaded) {
        totalTrainersAssigned += perDept[dept].trainersAssigned || 0;
        totalTrainersMissing += perDept[dept].trainersMissing || 0;
        totalSopOkayCount += perDept[dept].okayCount || 0;
        totalSopExpiredCount += perDept[dept].expiredCount || 0;
      }
      totalTrainersMissingList.push(...perDept[dept].trainersMissingList);
    }

    const totalEmployees = allExcelEmployees.length;
    const totalFullyTrained = allExcelEmployees.filter((e) => {
      const vals = Object.values(e.training || {});
      return vals.length > 0 && vals.every(Boolean);
    }).length;
    const totalIncomplete = totalEmployees - totalFullyTrained;

    const totalMissingList = missingFromAllExcel.map((c) => ({
      sopCode: c,
      title: dbBaseMeta.get(c)?.title || '',
      department: canonDept(dbBaseMeta.get(c)?.department || ''),
    }));

    const totalCard = {
      dbSopCount,
      dbSopsByDept,
      dbSopCountsByDept,
      excelSopCount: allExcelCodes.size,
      missingSopCount: missingFromAllExcel.length,
      trainersAssigned: totalTrainersAssigned,
      trainersMissing: totalTrainersMissing,
      okayCount: totalSopOkayCount,
      expiredCount: totalSopExpiredCount,
      mcqCreatedCount: totalMcqCreated,
      mcqNotCreatedCount: totalMcqNotCreated,
      mcqAllApprovedCount: totalMcqAllApproved,
      mcqPartiallyApprovedCount: totalMcqPartiallyApproved,
      mcqNotApprovedCount: totalMcqNotApproved,
      employeeCount: totalEmployees,
      fullyTrained: totalFullyTrained,
      incomplete: totalIncomplete,
      departmentCount: DEPT_CANONICAL.filter((d) => perDept[d].uploaded).length,
      totalDepartments: DEPT_CANONICAL.length,
      missingFromExcelList: totalMissingList,
      trainersMissingList: totalTrainersMissingList,
    };

    const sopStatusByCode: Record<string, { expired: boolean; targetDate: string | null; totalQuestions: number; approvedCount: number }> = {};
    for (const [code, meta] of dbBaseMeta.entries()) {
      const mcqStat = mcqStatMap.get(code);
      sopStatusByCode[code] = {
        expired: !!meta.expired,
        targetDate: meta.targetDate || null,
        totalQuestions: mcqStat?.totalQuestions || 0,
        approvedCount: mcqStat?.approvedCount || 0,
      };
    }

    const payload = {
      success: true,
      departments: DEPT_CANONICAL,
      perDept,
      totalCard,
      employees: allExcelEmployees,
      sopCodesByDept,
      sopMonthMapByDept: sopMonthMapAll,
      monthCountsByDept,
      sopStatusByCode,
    };

    if (!forceFresh) setCached(req, payload);
    return withCacheHeaders(NextResponse.json(payload));
  } catch (error: any) {
    console.error('training-matrix overview error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
