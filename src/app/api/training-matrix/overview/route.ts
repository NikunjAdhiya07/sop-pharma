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
import SOPLibrary from '@/models/SOPLibrary';
import { getRedis, REDIS_TTL } from '@/lib/redis';
import { expectedDocxSlotsForRow, scanRowLanguageFileSlots } from '@/lib/registryRowDocCounts';

export const dynamic = 'force-dynamic';

const DEPT_CANONICAL = ['QA','QC','Microbiology','Production','Store','Engineering','Personnel'];

type LangKey = 'ENG' | 'GUJ';

const CACHE_KEY = 'training-matrix-overview:v37';
// In-memory fallback TTL (used when Redis is not configured)
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;

type MemoryCacheEntry = { ts: number; payload: any };

function getMemoryCached(): any | null {
  const store = (globalThis as any).__tm_overview_cache as MemoryCacheEntry | undefined;
  if (!store) return null;
  if (Date.now() - store.ts > MEMORY_CACHE_TTL_MS) return null;
  return store.payload;
}

function setMemoryCached(payload: any) {
  (globalThis as any).__tm_overview_cache = { ts: Date.now(), payload } satisfies MemoryCacheEntry;
}

async function getCached(): Promise<any | null> {
  const redis = getRedis();
  if (redis) {
    try {
      return await redis.get(CACHE_KEY);
    } catch {
      // Redis unavailable — fall through to memory cache
    }
  }
  return getMemoryCached();
}

async function setCached(payload: any) {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(CACHE_KEY, payload, { ex: REDIS_TTL.FIVE_MIN });
      return;
    } catch {
      // Redis unavailable — fall through to memory cache
    }
  }
  setMemoryCached(payload);
}

async function invalidateTrainingMatrixCache() {
  const redis = getRedis();
  if (redis) {
    try { await redis.del(CACHE_KEY); } catch { /* best effort */ }
  }
  (globalThis as any).__tm_overview_cache = null;
}

function withCacheHeaders(res: NextResponse) {
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
      const cached = await getCached();
      if (cached) return withCacheHeaders(NextResponse.json(cached));
    }

    await connectDB();

    // Build dashReq before parallel fetch
    const origin = req.nextUrl.origin;
    const dashUrl = new URL('/api/dashboard/sops', origin);
    // IMPORTANT: don't bypass caches unless explicitly requested.
    if (forceFresh) dashUrl.searchParams.set('refresh', '1');
    const dashReq = new NextRequest(dashUrl);

    // Tier 1: Run all independent DB queries + dashboard call in parallel
    const [tmTrainerEntries, allUsers, uploads, dashRes, sopDateDocsRaw, obsoleteDocs, mcqAggResults] = await Promise.all([
      TrainingMatrix.find({ trainerName: { $exists: true, $nin: [null, ''] } })
        .select('sopIdentifier department trainerName')
        .lean(),
      User.find({}).lean(),
      TrainingMatrixUpload.find({
        fileType: 'main',
        snapshot: { $exists: true, $ne: null },
      })
        .sort({ uploadedAt: -1 })
        .lean(),
      getDashboardSops(dashReq as any),
      SOP.find(
        { reviewDate: { $exists: true, $ne: null }, isObsolete: { $ne: true } },
        { identifier: 1, reviewDate: 1, uploadedAt: 1 }
      )
        .sort({ uploadedAt: -1 })
        .lean(),
      SOP.find({ isObsolete: true })
        .select('identifier name department obsoleteAt obsoleteReason version')
        .lean(),
      MCQBank.aggregate([
        { $match: { isObsolete: { $ne: true } } },
        {
          $project: {
            sopIdentifier: 1,
            language: 1,
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
      ]),
    ]);

    // 0. Build trainer maps using the same sources as the Dashboard:
    //    a) TrainingMatrix entries with trainerName (SOP-specific)
    //    b) Users with role=trainer or isTrainerEligible (department-level)
    //    c) Hardcoded fallback (same as dashboard)

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
    const dashboard = (await dashRes.json()) as { success: boolean; data?: any[] };
    const registryRows = Array.isArray(dashboard?.data) ? dashboard.data : [];
    const familyUniqueRows = filterPrimaryRegistryRowsUniqueByFamily(registryRows);

    // Build base metadata from registry rows (titles, dept, language)
    const dbBaseSet = new Set<string>();
    const dbBaseMeta = new Map<string, { title: string; department: string; departmentCode: string; expired?: boolean; targetDate?: string | null; latestIdentifier?: string; isDualLanguage?: boolean; gujaratiName?: string }>();
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
          isDualLanguage: !!row?.isDualLanguage || (!!row?.englishVersion && !!row?.gujaratiVersion),
          gujaratiName: String(row?.gujaratiName || '')
        });
      }

      if (!dbBaseLangs.has(base)) dbBaseLangs.set(base, new Set<LangKey>());
      const langs = dbBaseLangs.get(base)!;
      // Match DepartmentCapsules "w/ EN" / "w/ GU" (scanRowLanguageFileSlots + expected DOCX slots)
      const langSlots = scanRowLanguageFileSlots(row);
      const isBilingual = expectedDocxSlotsForRow(row) >= 2;
      const rawLang = String(row?.language || '').trim().toLowerCase();
      const hasEng =
        !!row.englishVersion ||
        langSlots.engDocx ||
        langSlots.engPdf ||
        isBilingual ||
        rawLang !== 'gujarati';
      const hasGuj =
        !!row.gujaratiVersion ||
        langSlots.gujDocx ||
        langSlots.gujPdf ||
        row?.isDualLanguage === true ||
        isBilingual ||
        rawLang === 'gujarati';
      if (hasEng) langs.add('ENG');
      if (hasGuj) langs.add('GUJ');
      if (langs.size === 0) langs.add('ENG');
    }

    // Fetch actual expiry/review dates directly from the SOP model
    // NOTE: The actual DB field with dates is `reviewDate` (446 docs), NOT `expiryDate` (0) or `nextReviewDate` (0).
    // We also check SOPLibrary.expiryDate as a fallback (144 docs).
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const latestIdentifiers = Array.from(dbBaseMeta.values())
      .map(m => m.latestIdentifier)
      .filter(Boolean);

    // Tier 2: SOPLibrary queries depend on latestIdentifiers/dbBaseSet (derived from dashboard response)
    const [libDateDocs, libNameDocs] = await Promise.all([
      SOPLibrary.find(
        { sopIdentifier: { $in: latestIdentifiers }, expiryDate: { $exists: true, $ne: null } },
        { sopIdentifier: 1, expiryDate: 1 }
      ).lean(),
      SOPLibrary.find(
        { sopIdentifier: { $in: Array.from(dbBaseSet) }, sopName: { $exists: true, $ne: '' } },
        { sopIdentifier: 1, sopName: 1, gujaratiName: 1, language: 1, isDualLanguage: 1 }
      ).lean(),
    ]);

    // Primary source: SOP collection `reviewDate` field (fetched in Tier 1 above).
    // Sort newest-first so that when multiple records share the same identifier (duplicate
    // uploads), the most recently uploaded SOP's review date wins.
    // The processing loop skips any doc whose base is not in dbBaseMeta, so no pre-filter needed.
    const sopDateDocs = sopDateDocsRaw as any[];

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

    // Fallback: SOPLibrary `sopName` — fill in any SOPs still missing a title
    // Query by base codes (no version suffix) since SOPLibrary often stores bare codes.
    for (const doc of libNameDocs as any[]) {
      const id = String(doc?.sopIdentifier || '');
      const base = stripVersion(id);
      if (!base || !dbBaseMeta.has(base)) continue;
      const meta = dbBaseMeta.get(base)!;
      if (!meta.title && doc.sopName) {
        meta.title = String(doc.sopName).trim();
      }
      if (!meta.gujaratiName && doc.gujaratiName) {
        meta.gujaratiName = String(doc.gujaratiName).trim();
      }
      if (doc.isDualLanguage) {
        meta.isDualLanguage = true;
      } else if (String(doc.language || '').toLowerCase() === 'dual') {
        meta.isDualLanguage = true;
      }
      // Sync dbBaseLangs when SOPLibrary reveals a SOP is dual-language
      if (meta.isDualLanguage) {
        if (!dbBaseLangs.has(base)) dbBaseLangs.set(base, new Set<LangKey>());
        dbBaseLangs.get(base)!.add('ENG');
        dbBaseLangs.get(base)!.add('GUJ');
      }
    }

    // Debug: count how many SOPs have a date
    const withDate = [...dbBaseMeta.values()].filter((m) => m.targetDate).length;
    const withoutDate = [...dbBaseMeta.values()].filter((m) => !m.targetDate).length;
    console.log(`[TM Overview] SOP dates: ${withDate} with date, ${withoutDate} without date, sopDateDocs(reviewDate): ${sopDateDocs.length}, libDateDocs(expiryDate): ${libDateDocs.length}`);

    // ── MCQ stats: per-SOP identifier + language → { totalQuestions, approvedCount } ──
    // (mcqAggResults fetched in Tier 1 above)

    type LangStat = { totalQuestions: number; approvedCount: number };
    // baseSopCode → combined stats (English + Gujarati summed)
    const mcqStatMap = new Map<string, LangStat>();
    // baseSopCode → per-language stats ('English' | 'Gujarati' | 'Other')
    const mcqLangStatMap = new Map<string, { eng: LangStat; guj: LangStat }>();

    for (const doc of mcqAggResults as any[]) {
      const id = String(doc?.sopIdentifier || '').trim();
      if (!id) continue;
      const base = stripVersion(id);
      if (!base) continue;
      const tq: number = doc?.totalQuestions || 0;
      const approved: number = doc?.approvedCount || 0;
      const lang: string = String(doc?.language || 'English').trim();

      // Combined map (existing behaviour)
      const existing = mcqStatMap.get(base);
      if (existing) {
        existing.totalQuestions += tq;
        existing.approvedCount += approved;
      } else {
        mcqStatMap.set(base, { totalQuestions: tq, approvedCount: approved });
      }

      // Per-language map
      if (!mcqLangStatMap.has(base)) mcqLangStatMap.set(base, { eng: { totalQuestions: 0, approvedCount: 0 }, guj: { totalQuestions: 0, approvedCount: 0 } });
      const langEntry = mcqLangStatMap.get(base)!;
      if (lang === 'Gujarati') {
        langEntry.guj.totalQuestions += tq;
        langEntry.guj.approvedCount += approved;
      } else {
        langEntry.eng.totalQuestions += tq;
        langEntry.eng.approvedCount += approved;
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
    // (obsoleteDocs fetched in Tier 1 above)

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
    const dbSopsByDept: Record<string, Array<{ sopCode: string; title: string; isDualLanguage: boolean; gujaratiName: string }>> = {};
    const dbSopCountsByDept: Record<string, number> = {};
    for (const d of DEPT_CANONICAL) {
      dbSopsByDept[d] = [];
      dbSopCountsByDept[d] = 0;
    }

    for (const sopCode of dbBaseSet) {
      const meta = dbBaseMeta.get(sopCode);
      const dept = resolveDeptForBaseSop(sopCode, meta);
      if (!DEPT_CANONICAL.includes(dept)) continue;
      dbSopsByDept[dept].push({ 
        sopCode, 
        title: meta?.title || '',
        isDualLanguage: meta?.isDualLanguage || false,
        gujaratiName: meta?.gujaratiName || ''
      });
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

    // Pre-pass: for every department that has an upload, collect the unique SOP codes.
    // Then build sopCodeToDeptCount: sopCode -> how many distinct departments contain it.
    // This is the correct "repetition" definition: count of departments sharing the same SOP.
    const sopCodeToDeptCount = new Map<string, number>();
    for (const dept of DEPT_CANONICAL) {
      const up = latestByDept.get(dept);
      if (!up?.snapshot) continue;
      const snap = up.snapshot as { sopCodes: string[] };
      const uniqueCodes = Array.from(
        new Set((snap.sopCodes || []).map((c) => String(c).toUpperCase().replace(/-\d+$/, '').trim()).filter(Boolean))
      );
      for (const c of uniqueCodes) {
        sopCodeToDeptCount.set(c, (sopCodeToDeptCount.get(c) || 0) + 1);
      }
    }

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

      const obsoleteSetAll = new Set<string>();
      for (const d of DEPT_CANONICAL) {
        if (obsoleteByDept[d]) {
          for (const c of obsoleteByDept[d]) obsoleteSetAll.add(c);
        }
      }

      // "Found in Excel": DB SOPs belonging to this dept that ARE present in the Excel upload.
      // Direction is DB → Excel so that foundInDb + missingFromExcel == total DB SOPs for this dept.
      const codesSet = new Set(codes);
      const foundInDb = (dbSopsByDept[dept] || []).map((x) => x.sopCode).filter((c) => codesSet.has(c));

      // Found in obsolete: exists in DB but only as obsolete SOP record
      const foundObsolete = codes.filter((c) => obsoleteSetAll.has(c) && !dbBaseSet.has(c));
      const missingFromExcel = [...dbBaseSet].filter((c) => {
        const meta = dbBaseMeta.get(c);
        if (!meta) return false;
        return resolveDeptForBaseSop(c, meta) === dept && !codes.includes(c);
      });

      // Repetitive SOP categorisation — count how many distinct DEPARTMENTS contain each SOP code.
      // "count" here is the number of department uploads that include this SOP code (not employee rows).
      type RepeatItem = { sopCode: string; title: string; department: string; count: number };
      const repeat3PlusList: RepeatItem[] = [];
      const repeat2List: RepeatItem[] = [];
      const repeat1List: RepeatItem[] = [];
      for (const c of codes) {
        if (!dbBaseSet.has(c)) continue; // only DB-matched codes
        const meta = dbBaseMeta.get(c);
        // Only count each SOP in its OWNER dept's card so per-dept sums reconcile to the Total card.
        const owner = resolveDeptForBaseSop(c, meta);
        if (owner !== dept) continue;
        const count = sopCodeToDeptCount.get(c) || 1;
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

      // Lang breakdown: base on this dept's DB SOPs (matches the dashboard's source of truth).
      const deptDbCodes = (dbSopsByDept[dept] || []).map((x) => x.sopCode);
      const excelCodesSet = new Set(codes); // Excel codes for this dept's upload

      const langKeys = new Set<LangKey>();
      for (const c of deptDbCodes) {
        const ls = dbBaseLangs.get(c);
        (ls && ls.size > 0 ? Array.from(ls) : (['ENG'] as LangKey[])).forEach((k) => langKeys.add(k));
      }
      const langBreakdown = Array.from(langKeys)
        .sort((a, b) => (a === b ? 0 : a === 'ENG' ? -1 : 1))
        .map((k) => {
          const found = deptDbCodes.filter((c) => excelCodesSet.has(c) && (dbBaseLangs.get(c) || new Set<LangKey>(['ENG'])).has(k)).length;
          const missing = deptDbCodes.filter((c) => !excelCodesSet.has(c) && (dbBaseLangs.get(c) || new Set<LangKey>(['ENG'])).has(k)).length;
          return { key: k, label: k, found, missing };
        });

      // Pre-compute per-language SOP code lists for instant client-side filtering.
      // Uses the same deptDbCodes base so counts match the dashboard exactly.
      const langSopListByKey: Record<string, string[]> = {};
      for (const k of langKeys) {
        langSopListByKey[k] = deptDbCodes
          .filter((c) => (dbBaseLangs.get(c) || new Set<LangKey>(['ENG'])).has(k))
          .sort((a, b) => a.localeCompare(b));
      }

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

      // SOP-wise trainer counts: based on all DB SOPs for this dept (not just Excel-found)
      const sopTrainersAssigned = deptDbCodes.filter((c) => dbBaseHasTrainer.get(c)).length;
      const sopTrainersMissing = deptDbCodes.filter((c) => !dbBaseHasTrainer.get(c)).length;
      const sopTrainersMissingList = deptDbCodes
        .filter((c) => !dbBaseHasTrainer.get(c))
        .map((c) => ({ sopCode: c, title: dbBaseMeta.get(c)?.title || '', department: dept }));
      
      let expiredCount = 0;
      let okayCount = 0;
      let dueSoon60Count = 0;
      const dueSoon60List: string[] = [];
      const sixtyDaysMs = 60 * 24 * 3600 * 1000;
      for (const c of deptDbCodes) {
        const meta = dbBaseMeta.get(c);
        if (!meta?.targetDate) {
          okayCount++; // no expiry date known — treat as okay
          continue;
        }
        if (meta.expired) {
          expiredCount++;
        } else {
          okayCount++;
          const t = new Date(meta.targetDate).getTime();
          if (t - today.getTime() <= sixtyDaysMs) {
            dueSoon60Count++;
            dueSoon60List.push(c);
          }
        }
      }

      // MCQ review status for the due-soon SOPs
      let dueSoon60McqReviewed = 0;
      let dueSoon60McqPartial = 0;
      let dueSoon60McqNotReviewed = 0;
      const dueSoon60McqReviewedList: string[] = [];
      const dueSoon60McqPartialList: string[] = [];
      const dueSoon60McqNotReviewedList: string[] = [];
      for (const c of dueSoon60List) {
        const mcqStat = mcqStatMap.get(c);
        const tq = mcqStat?.totalQuestions ?? 0;
        const approved = mcqStat?.approvedCount ?? 0;
        if (tq > 0 && approved >= tq) { dueSoon60McqReviewed++; dueSoon60McqReviewedList.push(c); }
        else if (approved > 0) { dueSoon60McqPartial++; dueSoon60McqPartialList.push(c); }
        else { dueSoon60McqNotReviewed++; dueSoon60McqNotReviewedList.push(c); }
      }

      // MCQ counts for this dept (scoped to Excel SOPs found in DB)
      let mcqCreatedCount = 0;
      let mcqNotCreatedCount = 0;
      let mcqAllApprovedCount = 0;
      let mcqPartiallyApprovedCount = 0;
      let mcqNotApprovedCount = 0;
      // Per-language MCQ counts
      let mcqEngCreatedCount = 0;
      let mcqEngNotCreatedCount = 0;
      let mcqEngAllApprovedCount = 0;
      let mcqEngPartiallyApprovedCount = 0;
      let mcqEngNotApprovedCount = 0;
      let mcqGujCreatedCount = 0;
      let mcqGujNotCreatedCount = 0;
      let mcqGujAllApprovedCount = 0;
      let mcqGujPartiallyApprovedCount = 0;
      let mcqGujNotApprovedCount = 0;

      const mcqCreatedList: string[] = [];
      const mcqNotCreatedList: string[] = [];
      const mcqAllApprovedList: string[] = [];
      const mcqPartiallyApprovedList: string[] = [];
      const mcqNotApprovedList: string[] = [];
      const mcqEngCreatedList: string[] = [];
      const mcqEngNotCreatedList: string[] = [];
      const mcqEngAllApprovedList: string[] = [];
      const mcqEngPartiallyApprovedList: string[] = [];
      const mcqEngNotApprovedList: string[] = [];
      const mcqGujCreatedList: string[] = [];
      const mcqGujNotCreatedList: string[] = [];
      const mcqGujAllApprovedList: string[] = [];
      const mcqGujPartiallyApprovedList: string[] = [];
      const mcqGujNotApprovedList: string[] = [];

      // Overall MCQ counts scoped to Excel SOPs found in DB (foundInDb)
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

      // Per-language MCQ counts use the same SOP lists as langBreakdown/langSopListByKey,
      // so ENG total == Lang(DB) ENG and GUJ total == Lang(DB) GUJ exactly.
      const engSopList = langSopListByKey['ENG'] ?? deptDbCodes;
      const gujSopList = langSopListByKey['GUJ'] ?? [];

      for (const sopCode of engSopList) {
        const langStat = mcqLangStatMap.get(sopCode);
        const engTq = langStat?.eng.totalQuestions ?? 0;
        const engApproved = langStat?.eng.approvedCount ?? 0;
        if (engTq >= 100) { mcqEngCreatedCount++; mcqEngCreatedList.push(sopCode); }
        else { mcqEngNotCreatedCount++; mcqEngNotCreatedList.push(sopCode); }
        if (engTq > 0) {
          if (engApproved >= engTq) { mcqEngAllApprovedCount++; mcqEngAllApprovedList.push(sopCode); }
          else if (engApproved > 0) { mcqEngPartiallyApprovedCount++; mcqEngPartiallyApprovedList.push(sopCode); }
          else { mcqEngNotApprovedCount++; mcqEngNotApprovedList.push(sopCode); }
        } else {
          mcqEngNotApprovedCount++; mcqEngNotApprovedList.push(sopCode);
        }
      }

      for (const sopCode of gujSopList) {
        const langStat = mcqLangStatMap.get(sopCode);
        const gujTq = langStat?.guj.totalQuestions ?? 0;
        const gujApproved = langStat?.guj.approvedCount ?? 0;
        if (gujTq >= 100) { mcqGujCreatedCount++; mcqGujCreatedList.push(sopCode); }
        else { mcqGujNotCreatedCount++; mcqGujNotCreatedList.push(sopCode); }
        if (gujTq > 0) {
          if (gujApproved >= gujTq) { mcqGujAllApprovedCount++; mcqGujAllApprovedList.push(sopCode); }
          else if (gujApproved > 0) { mcqGujPartiallyApprovedCount++; mcqGujPartiallyApprovedList.push(sopCode); }
          else { mcqGujNotApprovedCount++; mcqGujNotApprovedList.push(sopCode); }
        } else {
          mcqGujNotApprovedCount++; mcqGujNotApprovedList.push(sopCode);
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
        langSopListByKey,
        excelDeptSplit: {
          total: codes.length,
          foundByDept: excelDeptSplitFoundByDept,
          missingByDept: excelDeptSplitMissingByDept,
          unknownFound: excelDeptSplitUnknownFound,
          unknownMissing: excelDeptSplitUnknownMissing,
        },
        trainersAssigned,
        trainersMissing,
        sopTrainersAssigned,
        sopTrainersMissing,
        sopTrainersMissingList,
        expiredCount,
        okayCount,
        dueSoon60Count,
        dueSoon60List,
        dueSoon60McqReviewed,
        dueSoon60McqPartial,
        dueSoon60McqNotReviewed,
        dueSoon60McqReviewedList,
        dueSoon60McqPartialList,
        dueSoon60McqNotReviewedList,
        mcqCreatedCount,
        mcqNotCreatedCount,
        mcqAllApprovedCount,
        mcqPartiallyApprovedCount,
        mcqNotApprovedCount,
        mcqEngCreatedCount,
        mcqEngNotCreatedCount,
        mcqEngAllApprovedCount,
        mcqEngPartiallyApprovedCount,
        mcqEngNotApprovedCount,
        mcqGujCreatedCount,
        mcqGujNotCreatedCount,
        mcqGujAllApprovedCount,
        mcqGujPartiallyApprovedCount,
        mcqGujNotApprovedCount,
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
        mcqEngCreatedList,
        mcqEngNotCreatedList,
        mcqEngAllApprovedList,
        mcqEngPartiallyApprovedList,
        mcqEngNotApprovedList,
        mcqGujCreatedList,
        mcqGujNotCreatedList,
        mcqGujAllApprovedList,
        mcqGujPartiallyApprovedList,
        mcqGujNotApprovedList,
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

    // Diagnostic: reconcile Total Excel SOP vs Total repeat buckets
    {
      let totalDFoundSum = 0;
      const allBucketSopCodes = new Map<string, number>(); // sopCode → count (deduped across depts)
      const deptOccurrences = new Map<string, Set<string>>(); // sopCode → set of depts that contain it in Excel
      for (const d of DEPT_CANONICAL) {
        const pd = perDept[d];
        if (!pd?.uploaded) continue;
        const dFS = Object.values(pd.excelDeptSplit?.foundByDept || {}).reduce((a: number, b: any) => a + (b || 0), 0) + (pd.excelDeptSplit?.unknownFound ?? 0);
        totalDFoundSum += dFS;
        for (const list of [pd.repeat3PlusList, pd.repeat2List, pd.repeat1List]) {
          for (const item of (list as any[]) || []) {
            if (!allBucketSopCodes.has(item.sopCode)) allBucketSopCodes.set(item.sopCode, item.count);
            if (!deptOccurrences.has(item.sopCode)) deptOccurrences.set(item.sopCode, new Set());
            deptOccurrences.get(item.sopCode)!.add(d);
          }
        }
      }
      const weightedSum = Array.from(allBucketSopCodes.values()).reduce((a, b) => a + b, 0);
      const occurrenceSum = Array.from(deptOccurrences.values()).reduce((a, s) => a + s.size, 0);
      const mismatches: string[] = [];
      for (const [code, count] of allBucketSopCodes.entries()) {
        const occ = deptOccurrences.get(code)!.size;
        if (occ !== count) mismatches.push(`${code}: sopCodeToDeptCount=${count}, actualOccurrences=${occ}`);
      }
      console.log(`[TM Overview/TOTAL] totalDFoundSum=${totalDFoundSum} weightedBucketSum=${weightedSum} actualOccurrenceSum=${occurrenceSum} uniqueBucketSops=${allBucketSopCodes.size}`);
      if (mismatches.length) {
        console.log(`[TM Overview/TOTAL] count mismatches (sopCodeToDeptCount vs actual dept occurrences):`, mismatches);
      }
    }

    // 4. Total card
    // "Missing from Excel" at the total level must reconcile with the sum of per-dept
    // missing counts: a SOP is missing if its OWNER department's Excel upload doesn't
    // contain it. A SOP appearing in some other dept's Excel doesn't count as "found"
    // for its owner — that mismatch is what the per-dept cards already report.
    const dbSopsAll = [...dbBaseSet];
    const foundInAllExcel: string[] = [];
    const missingFromAllExcel: string[] = [];
    for (const c of dbSopsAll) {
      const meta = dbBaseMeta.get(c);
      const owner = resolveDeptForBaseSop(c, meta);
      const ownerCodes = DEPT_CANONICAL.includes(owner) ? sopCodesByDept[owner] : undefined;
      const ownerCodesSet = ownerCodes ? new Set(ownerCodes) : null;
      if (ownerCodesSet && ownerCodesSet.has(c)) foundInAllExcel.push(c);
      else missingFromAllExcel.push(c);
    }
    let totalTrainersAssigned = 0;
    let totalTrainersMissing = 0;
    let totalSopTrainersAssigned = 0;
    let totalSopTrainersMissing = 0;
    const totalSopTrainersMissingList: { sopCode: string; title: string; department: string }[] = [];
    let totalSopOkayCount = 0;
    let totalSopExpiredCount = 0;
    let totalDueSoon60Count = 0;
    let totalDueSoon60McqReviewed = 0;
    let totalDueSoon60McqPartial = 0;
    let totalDueSoon60McqNotReviewed = 0;
    const totalTrainersMissingList: any[] = [];
    // MCQ totals across ALL DB SOPs (not dept-scoped by upload)
    let totalMcqCreated = 0;
    let totalMcqNotCreated = 0;
    let totalMcqAllApproved = 0;
    let totalMcqPartiallyApproved = 0;
    let totalMcqNotApproved = 0;
    let totalMcqEngCreated = 0;
    let totalMcqEngNotCreated = 0;
    let totalMcqEngAllApproved = 0;
    let totalMcqEngPartiallyApproved = 0;
    let totalMcqEngNotApproved = 0;
    let totalMcqGujCreated = 0;
    let totalMcqGujNotCreated = 0;
    let totalMcqGujAllApproved = 0;
    let totalMcqGujPartiallyApproved = 0;
    let totalMcqGujNotApproved = 0;
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

      const langStat = mcqLangStatMap.get(base);
      const engTq = langStat?.eng.totalQuestions ?? 0;
      const engApproved = langStat?.eng.approvedCount ?? 0;
      const gujTq = langStat?.guj.totalQuestions ?? 0;
      const gujApproved = langStat?.guj.approvedCount ?? 0;

      // ENG: every SOP counts toward ENG total
      if (engTq >= 100) totalMcqEngCreated++; else totalMcqEngNotCreated++;
      if (engTq > 0) {
        if (engApproved >= engTq) totalMcqEngAllApproved++;
        else if (engApproved > 0) totalMcqEngPartiallyApproved++;
        else totalMcqEngNotApproved++;
      } else {
        totalMcqEngNotApproved++;
      }

      // GUJ: use same default as globalLangMap (new Set(['ENG'])) so counts match Lang(DB) GUJ total
      const baseHasGuj = (dbBaseLangs.get(base) || new Set<LangKey>(['ENG'])).has('GUJ');
      if (baseHasGuj) {
        if (gujTq >= 100) totalMcqGujCreated++; else totalMcqGujNotCreated++;
        if (gujTq > 0) {
          if (gujApproved >= gujTq) totalMcqGujAllApproved++;
          else if (gujApproved > 0) totalMcqGujPartiallyApproved++;
          else totalMcqGujNotApproved++;
        } else {
          totalMcqGujNotApproved++;
        }
      }
    }
    // Total expiry counts over ALL 427 DB SOPs (not just Excel-found)
    const sixtyDaysMsTotal = 60 * 24 * 3600 * 1000;
    for (const base of dbBaseSet) {
      const meta = dbBaseMeta.get(base);
      if (!meta?.targetDate) {
        totalSopOkayCount++;
        continue;
      }
      if (meta.expired) {
        totalSopExpiredCount++;
      } else {
        totalSopOkayCount++;
        const t = new Date(meta.targetDate).getTime();
        if (t - today.getTime() <= sixtyDaysMsTotal) {
          totalDueSoon60Count++;
          // MCQ status for due-soon SOP
          const mcqStat = mcqStatMap.get(base);
          const tq = mcqStat?.totalQuestions ?? 0;
          const approved = mcqStat?.approvedCount ?? 0;
          if (tq > 0 && approved >= tq) totalDueSoon60McqReviewed++;
          else if (approved > 0) totalDueSoon60McqPartial++;
          else totalDueSoon60McqNotReviewed++;
        }
      }
    }

    for (const dept of DEPT_CANONICAL) {
      if (perDept[dept].uploaded) {
        totalTrainersAssigned += perDept[dept].trainersAssigned || 0;
        totalTrainersMissing += perDept[dept].trainersMissing || 0;
      }
      totalTrainersMissingList.push(...perDept[dept].trainersMissingList);
    }

    // SOP-wise trainer totals: all 427 DB SOPs (uses full 3-tier trainer resolution)
    for (const base of dbBaseSet) {
      if (dbBaseHasTrainer.get(base)) {
        totalSopTrainersAssigned++;
      } else {
        totalSopTrainersMissing++;
        const meta = dbBaseMeta.get(base);
        totalSopTrainersMissingList.push({
          sopCode: base,
          title: meta?.title || '',
          department: canonDept(meta?.department || ''),
        });
      }
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

    // Global lang breakdown — computed from ALL dbBaseSet SOPs regardless of dept,
    // so SOPs with an unresolved dept are not missed.
    const globalLangMap = new Map<LangKey, { found: number; missing: number }>();
    for (const sopCode of dbBaseSet) {
      const langs = dbBaseLangs.get(sopCode) || new Set<LangKey>(['ENG']);
      for (const k of langs) {
        if (!globalLangMap.has(k)) globalLangMap.set(k, { found: 0, missing: 0 });
        const entry = globalLangMap.get(k)!;
        if (allExcelCodes.has(sopCode)) entry.found++; else entry.missing++;
      }
    }
    const totalLangBreakdown = Array.from(globalLangMap.entries())
      .sort(([a], [b]) => (a === b ? 0 : a === 'ENG' ? -1 : 1))
      .map(([key, v]) => ({ key, label: key, found: v.found, missing: v.missing }));

    const totalCard = {
      dbSopCount,
      dbSopsByDept,
      dbSopCountsByDept,
      langBreakdown: totalLangBreakdown,
      excelSopCount: foundInAllExcel.length,
      missingSopCount: missingFromAllExcel.length,
      trainersAssigned: totalTrainersAssigned,
      trainersMissing: totalTrainersMissing,
      sopTrainersAssigned: totalSopTrainersAssigned,
      sopTrainersMissing: totalSopTrainersMissing,
      sopTrainersMissingList: totalSopTrainersMissingList,
      okayCount: totalSopOkayCount,
      expiredCount: totalSopExpiredCount,
      dueSoon60Count: totalDueSoon60Count,
      dueSoon60McqReviewed: totalDueSoon60McqReviewed,
      dueSoon60McqPartial: totalDueSoon60McqPartial,
      dueSoon60McqNotReviewed: totalDueSoon60McqNotReviewed,
      mcqCreatedCount: totalMcqCreated,
      mcqNotCreatedCount: totalMcqNotCreated,
      mcqAllApprovedCount: totalMcqAllApproved,
      mcqPartiallyApprovedCount: totalMcqPartiallyApproved,
      mcqNotApprovedCount: totalMcqNotApproved,
      mcqEngCreatedCount: totalMcqEngCreated,
      mcqEngNotCreatedCount: totalMcqEngNotCreated,
      mcqEngAllApprovedCount: totalMcqEngAllApproved,
      mcqEngPartiallyApprovedCount: totalMcqEngPartiallyApproved,
      mcqEngNotApprovedCount: totalMcqEngNotApproved,
      mcqGujCreatedCount: totalMcqGujCreated,
      mcqGujNotCreatedCount: totalMcqGujNotCreated,
      mcqGujAllApprovedCount: totalMcqGujAllApproved,
      mcqGujPartiallyApprovedCount: totalMcqGujPartiallyApproved,
      mcqGujNotApprovedCount: totalMcqGujNotApproved,
      employeeCount: totalEmployees,
      fullyTrained: totalFullyTrained,
      incomplete: totalIncomplete,
      departmentCount: DEPT_CANONICAL.filter((d) => perDept[d].uploaded).length,
      totalDepartments: DEPT_CANONICAL.length,
      missingFromExcelList: totalMissingList,
      trainersMissingList: totalTrainersMissingList,
    };

    const sopStatusByCode: Record<string, { expired: boolean; targetDate: string | null; totalQuestions: number; approvedCount: number; engTotalQuestions?: number; engApprovedCount?: number; gujTotalQuestions?: number; gujApprovedCount?: number; title: string }> = {};
    for (const [code, meta] of dbBaseMeta.entries()) {
      const mcqStat = mcqStatMap.get(code);
      const langStat = mcqLangStatMap.get(code);
      sopStatusByCode[code] = {
        expired: !!meta.expired,
        targetDate: meta.targetDate || null,
        totalQuestions: mcqStat?.totalQuestions || 0,
        approvedCount: mcqStat?.approvedCount || 0,
        engTotalQuestions: langStat?.eng.totalQuestions || 0,
        engApprovedCount: langStat?.eng.approvedCount || 0,
        gujTotalQuestions: langStat?.guj.totalQuestions || 0,
        gujApprovedCount: langStat?.guj.approvedCount || 0,
        title: meta.title || '',
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

    if (!forceFresh) await setCached(payload);
    return withCacheHeaders(NextResponse.json(payload));
  } catch (error: any) {
    console.error('training-matrix overview error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
