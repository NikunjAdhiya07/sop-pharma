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
import { expectedDocxSlotsForRow, scanRowLanguageFileSlots, scanRowLanguageDocPaths } from '@/lib/registryRowDocCounts';
import {
  getTrainingMatrixCached as getCached,
  setTrainingMatrixCached as setCached,
  invalidateTrainingMatrixCache,
} from '@/lib/trainingMatrixCache';

export const dynamic = 'force-dynamic';

const DEFAULT_DEPARTMENTS = ['QA','QC','Microbiology','Production','Store','Engineering','Personnel'];

type LangKey = 'ENG' | 'GUJ';

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

function normalizeDept(raw: string): string {
  return canonDept(String(raw || '').trim()).trim();
}

function isValidDeptName(raw: string): boolean {
  const dept = String(raw || '').trim();
  if (!dept) return false;
  return !/^unknown$/i.test(dept);
}

function stripVersion(code: string): string {
  return String(code || '').toUpperCase().replace(/-\d+$/, '').trim();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Align month map keys with stripVersion'd sopCodes so month filters match monthCounts. */
function buildNormalizedMonthData(
  rawMonthMap: Record<string, string>,
  codes: string[],
): { sopMonthMap: Record<string, string>; monthCounts: Record<string, number> } {
  const sopMonthMap: Record<string, string> = {};
  for (const [k, month] of Object.entries(rawMonthMap || {})) {
    const base = stripVersion(k);
    if (!base || !month) continue;
    sopMonthMap[base] = month;
  }
  const monthCounts: Record<string, number> = {};
  for (const m of MONTH_NAMES) monthCounts[m] = 0;
  for (const c of codes) {
    const month = sopMonthMap[c];
    if (!month) continue;
    monthCounts[month] = (monthCounts[month] || 0) + 1;
  }
  return { sopMonthMap, monthCounts };
}

function normalizeEmployeeTraining(training: Record<string, boolean> | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(training || {})) {
    const base = stripVersion(k);
    if (!base) continue;
    out[base] = out[base] || !!v;
  }
  return out;
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
  if (DEFAULT_DEPARTMENTS.includes(fromResolver)) return fromResolver;
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
    const dynamicDeptSet = new Set<string>(DEFAULT_DEPARTMENTS);
    const addDynamicDept = (raw: string | null | undefined) => {
      const dept = normalizeDept(String(raw || ''));
      if (!isValidDeptName(dept)) return;
      dynamicDeptSet.add(dept);
    };
    const getDynamicDepartments = () => {
      const extras = Array.from(dynamicDeptSet)
        .filter((d) => !DEFAULT_DEPARTMENTS.includes(d))
        .sort((a, b) => a.localeCompare(b));
      return [...DEFAULT_DEPARTMENTS, ...extras];
    };

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
      const dept = normalizeDept(up.department);
      addDynamicDept(dept);
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build base metadata from registry rows (titles, dept, language)
    const dbBaseSet = new Set<string>();
    const dbBaseMeta = new Map<string, { title: string; department: string; departmentCode: string; expired?: boolean; targetDate?: string | null; latestIdentifier?: string; isDualLanguage?: boolean; gujaratiName?: string }>();
    const dbBaseLangs = new Map<string, Set<LangKey>>();
    const dbDocPathsByCode: Record<string, { eng?: string; guj?: string; id?: string }> = {};
    for (const row of familyUniqueRows as any[]) {
      const sopNo = String(row?.sopNo || row?.identifier || '').trim();
      const base = stripVersion(sopNo);
      if (!base) continue;
      dbBaseSet.add(base);

      const docPaths = scanRowLanguageDocPaths(row);
      if (!dbDocPathsByCode[base]) dbDocPathsByCode[base] = {};
      if (docPaths.engDocx && !dbDocPathsByCode[base].eng) dbDocPathsByCode[base].eng = docPaths.engDocx;
      if (docPaths.gujDocx && !dbDocPathsByCode[base].guj) dbDocPathsByCode[base].guj = docPaths.gujDocx;
      if (sopNo && !dbDocPathsByCode[base].id) dbDocPathsByCode[base].id = sopNo;

      if (!dbBaseMeta.has(base)) {
        // Use the dashboard row's already-resolved expiryDate (includes MasterSOPRepository priority)
        const rowExpiryDate = row?.expiryDate ? String(row.expiryDate) : null;
        const rowExpired = rowExpiryDate
          ? Math.floor((new Date(rowExpiryDate).getTime() - today.getTime()) / (1000 * 3600 * 24)) < 0
          : false;
        dbBaseMeta.set(base, {
          title: String(row?.englishName || row?.sopName || row?.name || ''),
          department: String(row?.department || ''),
          departmentCode: String(row?.departmentCode || ''),
          expired: rowExpired,
          targetDate: rowExpiryDate,
          latestIdentifier: sopNo,
          isDualLanguage: !!row?.isDualLanguage || (!!row?.englishVersion && !!row?.gujaratiVersion),
          gujaratiName: String(row?.gujaratiName || '')
        });
      }
      addDynamicDept(row?.department || '');
      addDynamicDept(resolveDeptForBaseSop(base, dbBaseMeta.get(base)));

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

    // Fallback: fill in any SOPs still missing a date from the dashboard (SOP.reviewDate → SOPLibrary.expiryDate)
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

    // Secondary fallback: SOP collection `reviewDate` for any SOPs that had no expiryDate in the dashboard response.
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

    /**
     * Build the full MCQ-creation / MCQ-approval bucket set for an arbitrary
     * SOP-code list. Centralising this keeps the Total card, the per-dept
     * cards (uploaded + no-upload), and any future scope-based panels using
     * the same SOP-level definitions:
     *
     *   • Top "MCQ (100+ created)" is SOP-based: a SOP is "created" only when
     *     every language it requires has 100+ MCQs. So `created + missing`
     *     always equals the number of SOPs in scope (e.g. 429 for the Total
     *     card), no matter how many languages each SOP needs.
     *
     *   • Non-Dual section (English-only SOPs): per-SOP ENG status.
     *
     *   • Dual section (ENG + GUJ SOPs, including every MAGE / Engineering
     *     bilingual SOP): per-language slot status PLUS a per-SOP "either
     *     incomplete" aggregate so the dual SOPs that fail in *any* language
     *     are never silently merged into the ENG-only column.
     */
    const buildEmptyMcqBuckets = () => ({
      // Top — SOP-based: created + notCreated == sopCodes.length
      mcqCreatedCount: 0,
      mcqNotCreatedCount: 0,
      mcqCreatedList: [] as string[],
      mcqNotCreatedList: [] as string[],
      // Non-Dual SOPs (English-only) breakdown
      mcqEngOnlyCreatedCount: 0,
      mcqEngOnlyNotCreatedCount: 0,
      mcqEngOnlyCreatedList: [] as string[],
      mcqEngOnlyNotCreatedList: [] as string[],
      // Dual SOPs: per-language slot status (every dual SOP contributes once
      // to the ENG side and once to the GUJ side)
      mcqDualEngCreatedCount: 0,
      mcqDualEngNotCreatedCount: 0,
      mcqDualEngCreatedList: [] as string[],
      mcqDualEngNotCreatedList: [] as string[],
      mcqDualGujCreatedCount: 0,
      mcqDualGujNotCreatedCount: 0,
      mcqDualGujCreatedList: [] as string[],
      mcqDualGujNotCreatedList: [] as string[],
      // Dual SOPs: per-SOP aggregate
      mcqDualBothCreatedCount: 0,
      mcqDualEitherIncompleteCount: 0,
      mcqDualBothCreatedList: [] as string[],
      mcqDualEitherIncompleteList: [] as string[],
      // Total dual SOPs in this scope (so UI can render "x of y" if needed)
      mcqDualSopCount: 0,
      // Legacy ENG/GUJ totals — every SOP with an ENG slot contributes to the
      // ENG total; only dual SOPs contribute to the GUJ total. Kept for
      // backwards-compatible filter buttons.
      mcqEngCreatedCount: 0,
      mcqEngNotCreatedCount: 0,
      mcqEngCreatedList: [] as string[],
      mcqEngNotCreatedList: [] as string[],
      mcqGujCreatedCount: 0,
      mcqGujNotCreatedCount: 0,
      mcqGujCreatedList: [] as string[],
      mcqGujNotCreatedList: [] as string[],
      // SOP-based approval (top-level) — universe is exactly the SOPs in
      // `mcqCreated*` (i.e. sopOk: every required language has 100+ MCQs).
      // SOPs that don't yet meet 100+ MCQs are NOT counted in approval at all,
      // because approval-of-MCQs is meaningless before MCQs exist.
      // Constraint: mcqAllApproved + mcqPartiallyApproved + mcqNotApproved
      //            === mcqCreatedCount  (e.g. 366)
      mcqAllApprovedCount: 0,
      mcqPartiallyApprovedCount: 0,
      mcqNotApprovedCount: 0,
      mcqAllApprovedList: [] as string[],
      mcqPartiallyApprovedList: [] as string[],
      mcqNotApprovedList: [] as string[],
      // Non-Dual SOPs (ENG-only) approval breakdown — sub-universe is
      // mcqEngOnlyCreated (the non-dual SOPs that already have 100+ ENG MCQs).
      mcqApprovedNonDualCount: 0,
      mcqApprovalPartialNonDualCount: 0,
      mcqApprovalMissingNonDualCount: 0,
      mcqApprovedNonDualList: [] as string[],
      mcqApprovalPartialNonDualList: [] as string[],
      mcqApprovalMissingNonDualList: [] as string[],
      // Dual SOPs (ENG + GUJ) approval breakdown — sub-universe is
      // mcqDualBothCreated (the dual SOPs that already have 100+ in BOTH langs).
      // Dual rules:
      //   • Approved if BOTH ENG and GUJ are fully approved.
      //   • Missing  if EITHER language has zero approvals.
      //   • Partial  otherwise (both have some approvals, neither fully done).
      mcqApprovedDualCount: 0,
      mcqApprovalPartialDualCount: 0,
      mcqApprovalMissingDualCount: 0,
      mcqApprovedDualList: [] as string[],
      mcqApprovalPartialDualList: [] as string[],
      mcqApprovalMissingDualList: [] as string[],
      // Per-language slot approval inside Dual-Found universe — display only,
      // mirrors the ENG/GUJ slot pattern from the 100+ MCQ section.
      mcqDualSlotEngAllApprovedCount: 0,
      mcqDualSlotEngPartiallyApprovedCount: 0,
      mcqDualSlotEngNotApprovedCount: 0,
      mcqDualSlotEngAllApprovedList: [] as string[],
      mcqDualSlotEngPartiallyApprovedList: [] as string[],
      mcqDualSlotEngNotApprovedList: [] as string[],
      mcqDualSlotGujAllApprovedCount: 0,
      mcqDualSlotGujPartiallyApprovedCount: 0,
      mcqDualSlotGujNotApprovedCount: 0,
      mcqDualSlotGujAllApprovedList: [] as string[],
      mcqDualSlotGujPartiallyApprovedList: [] as string[],
      mcqDualSlotGujNotApprovedList: [] as string[],
      // Legacy per-language approval (whole DB, not restricted to sopOk) — kept
      // for backwards-compatible filter buttons. New UI should use the slot
      // counts above which reconcile to the SOP-based totals.
      mcqEngAllApprovedCount: 0,
      mcqEngPartiallyApprovedCount: 0,
      mcqEngNotApprovedCount: 0,
      mcqEngAllApprovedList: [] as string[],
      mcqEngPartiallyApprovedList: [] as string[],
      mcqEngNotApprovedList: [] as string[],
      mcqGujAllApprovedCount: 0,
      mcqGujPartiallyApprovedCount: 0,
      mcqGujNotApprovedCount: 0,
      mcqGujAllApprovedList: [] as string[],
      mcqGujPartiallyApprovedList: [] as string[],
      mcqGujNotApprovedList: [] as string[],
    });

    type McqBuckets = ReturnType<typeof buildEmptyMcqBuckets>;

    const finaliseMcqBuckets = (b: McqBuckets) => {
      const sortAlpha = (a: string, c: string) => a.localeCompare(c);
      b.mcqCreatedList.sort(sortAlpha);
      b.mcqNotCreatedList.sort(sortAlpha);
      b.mcqEngOnlyCreatedList.sort(sortAlpha);
      b.mcqEngOnlyNotCreatedList.sort(sortAlpha);
      b.mcqDualEngCreatedList.sort(sortAlpha);
      b.mcqDualEngNotCreatedList.sort(sortAlpha);
      b.mcqDualGujCreatedList.sort(sortAlpha);
      b.mcqDualGujNotCreatedList.sort(sortAlpha);
      b.mcqDualBothCreatedList.sort(sortAlpha);
      b.mcqDualEitherIncompleteList.sort(sortAlpha);
      b.mcqEngCreatedList.sort(sortAlpha);
      b.mcqEngNotCreatedList.sort(sortAlpha);
      b.mcqGujCreatedList.sort(sortAlpha);
      b.mcqGujNotCreatedList.sort(sortAlpha);
      // SOP-based approval lists
      b.mcqAllApprovedList.sort(sortAlpha);
      b.mcqPartiallyApprovedList.sort(sortAlpha);
      b.mcqNotApprovedList.sort(sortAlpha);
      b.mcqApprovedNonDualList.sort(sortAlpha);
      b.mcqApprovalPartialNonDualList.sort(sortAlpha);
      b.mcqApprovalMissingNonDualList.sort(sortAlpha);
      b.mcqApprovedDualList.sort(sortAlpha);
      b.mcqApprovalPartialDualList.sort(sortAlpha);
      b.mcqApprovalMissingDualList.sort(sortAlpha);
      b.mcqDualSlotEngAllApprovedList.sort(sortAlpha);
      b.mcqDualSlotEngPartiallyApprovedList.sort(sortAlpha);
      b.mcqDualSlotEngNotApprovedList.sort(sortAlpha);
      b.mcqDualSlotGujAllApprovedList.sort(sortAlpha);
      b.mcqDualSlotGujPartiallyApprovedList.sort(sortAlpha);
      b.mcqDualSlotGujNotApprovedList.sort(sortAlpha);
      b.mcqEngAllApprovedList.sort(sortAlpha);
      b.mcqEngPartiallyApprovedList.sort(sortAlpha);
      b.mcqEngNotApprovedList.sort(sortAlpha);
      b.mcqGujAllApprovedList.sort(sortAlpha);
      b.mcqGujPartiallyApprovedList.sort(sortAlpha);
      b.mcqGujNotApprovedList.sort(sortAlpha);
      return b;
    };

    const computeMcqBuckets = (sopCodes: Iterable<string>): McqBuckets => {
      const b = buildEmptyMcqBuckets();
      for (const code of sopCodes) {
        const langSet = dbBaseLangs.get(code) || new Set<LangKey>(['ENG']);
        const isDual = langSet.has('GUJ');

        const langStat = mcqLangStatMap.get(code);
        const engTq = langStat?.eng.totalQuestions ?? 0;
        const engApproved = langStat?.eng.approvedCount ?? 0;
        const gujTq = langStat?.guj.totalQuestions ?? 0;
        const gujApproved = langStat?.guj.approvedCount ?? 0;

        const mcqStat = mcqStatMap.get(code);
        const combinedTq = mcqStat?.totalQuestions ?? 0;
        const combinedApproved = mcqStat?.approvedCount ?? 0;

        const engOk = engTq >= 100;
        const gujOk = gujTq >= 100;
        const sopOk = isDual ? (engOk && gujOk) : engOk;

        // Top SOP-based bucket
        if (sopOk) { b.mcqCreatedCount++; b.mcqCreatedList.push(code); }
        else { b.mcqNotCreatedCount++; b.mcqNotCreatedList.push(code); }

        if (!isDual) {
          // Non-Dual SOPs (English-only)
          if (engOk) {
            b.mcqEngOnlyCreatedCount++;
            b.mcqEngOnlyCreatedList.push(code);
          } else {
            b.mcqEngOnlyNotCreatedCount++;
            b.mcqEngOnlyNotCreatedList.push(code);
          }
        } else {
          b.mcqDualSopCount++;
          // Dual SOPs — per-language slot
          if (engOk) {
            b.mcqDualEngCreatedCount++;
            b.mcqDualEngCreatedList.push(code);
          } else {
            b.mcqDualEngNotCreatedCount++;
            b.mcqDualEngNotCreatedList.push(code);
          }
          if (gujOk) {
            b.mcqDualGujCreatedCount++;
            b.mcqDualGujCreatedList.push(code);
          } else {
            b.mcqDualGujNotCreatedCount++;
            b.mcqDualGujNotCreatedList.push(code);
          }
          // Dual SOPs — per-SOP aggregate
          if (engOk && gujOk) {
            b.mcqDualBothCreatedCount++;
            b.mcqDualBothCreatedList.push(code);
          } else {
            b.mcqDualEitherIncompleteCount++;
            b.mcqDualEitherIncompleteList.push(code);
          }
        }

        // Legacy ENG totals — every SOP has an ENG slot
        if (engOk) {
          b.mcqEngCreatedCount++;
          b.mcqEngCreatedList.push(code);
        } else {
          b.mcqEngNotCreatedCount++;
          b.mcqEngNotCreatedList.push(code);
        }
        // Legacy GUJ totals — only dual SOPs contribute
        if (isDual) {
          if (gujOk) {
            b.mcqGujCreatedCount++;
            b.mcqGujCreatedList.push(code);
          } else {
            b.mcqGujNotCreatedCount++;
            b.mcqGujNotCreatedList.push(code);
          }
        }

        // ──────────────────────────────────────────────────────────────────
        // SOP-based approval — strictly restricted to the 100+ MCQ Found
        // universe (sopOk). Approval of MCQs is meaningless for SOPs that
        // don't yet have 100+ MCQs, so those SOPs do NOT contribute to any
        // approval bucket.
        //
        // Rules (mirror the same SOP-vs-language separation as the 100+ MCQ
        // section so the totals reconcile):
        //   Non-Dual SOP (English-only):
        //     • Approved if engApproved >= engTq
        //     • Missing  if engApproved == 0
        //     • Partial  otherwise
        //   Dual SOP (ENG + GUJ):
        //     • Approved if BOTH engApproved >= engTq AND gujApproved >= gujTq
        //     • Missing  if engApproved == 0 OR gujApproved == 0
        //                (i.e. at least one language has no approvals at all)
        //     • Partial  otherwise (both have some approvals, neither full)
        //
        // Constraints (always hold by construction):
        //   mcqAllApproved + mcqPartiallyApproved + mcqNotApproved
        //     === mcqCreatedCount  (e.g. 366)
        //   mcqApproved{Non}Dual + mcqApprovalPartial{Non}Dual + mcqApprovalMissing{Non}Dual
        //     === mcqEngOnlyCreatedCount      (Non-Dual sub-universe)
        //   mcqApprovedDual + mcqApprovalPartialDual + mcqApprovalMissingDual
        //     === mcqDualBothCreatedCount     (Dual sub-universe)
        //   mcqAllApproved      === mcqApprovedNonDual + mcqApprovedDual
        //   mcqPartiallyApproved === mcqApprovalPartialNonDual + mcqApprovalPartialDual
        //   mcqNotApproved      === mcqApprovalMissingNonDual + mcqApprovalMissingDual
        // ──────────────────────────────────────────────────────────────────
        if (sopOk) {
          if (!isDual) {
            // Non-Dual SOP — ENG only
            if (engTq > 0 && engApproved >= engTq) {
              b.mcqAllApprovedCount++; b.mcqAllApprovedList.push(code);
              b.mcqApprovedNonDualCount++; b.mcqApprovedNonDualList.push(code);
            } else if (engApproved > 0) {
              b.mcqPartiallyApprovedCount++; b.mcqPartiallyApprovedList.push(code);
              b.mcqApprovalPartialNonDualCount++; b.mcqApprovalPartialNonDualList.push(code);
            } else {
              b.mcqNotApprovedCount++; b.mcqNotApprovedList.push(code);
              b.mcqApprovalMissingNonDualCount++; b.mcqApprovalMissingNonDualList.push(code);
            }
          } else {
            // Dual SOP — needs progress on BOTH ENG and GUJ
            const engFull = engTq > 0 && engApproved >= engTq;
            const gujFull = gujTq > 0 && gujApproved >= gujTq;
            const engNone = engApproved === 0;
            const gujNone = gujApproved === 0;
            if (engFull && gujFull) {
              b.mcqAllApprovedCount++; b.mcqAllApprovedList.push(code);
              b.mcqApprovedDualCount++; b.mcqApprovedDualList.push(code);
            } else if (engNone && gujNone) {
              // Missing: BOTH languages have zero approvals — truly nothing done.
              b.mcqNotApprovedCount++; b.mcqNotApprovedList.push(code);
              b.mcqApprovalMissingDualCount++; b.mcqApprovalMissingDualList.push(code);
            } else {
              // Partial: at least one language has progress (approvals or full),
              // but the SOP isn't fully approved across both languages. This
              // includes the asymmetric case where one language is fully
              // approved and the other has zero approvals — meaningful
              // progress, not full failure.
              b.mcqPartiallyApprovedCount++; b.mcqPartiallyApprovedList.push(code);
              b.mcqApprovalPartialDualCount++; b.mcqApprovalPartialDualList.push(code);
            }

            // Per-language slot approval inside the Dual-Found universe —
            // display only, won't reconcile to the Dual primary row above.
            if (engTq > 0 && engApproved >= engTq) {
              b.mcqDualSlotEngAllApprovedCount++;
              b.mcqDualSlotEngAllApprovedList.push(code);
            } else if (engApproved > 0) {
              b.mcqDualSlotEngPartiallyApprovedCount++;
              b.mcqDualSlotEngPartiallyApprovedList.push(code);
            } else {
              b.mcqDualSlotEngNotApprovedCount++;
              b.mcqDualSlotEngNotApprovedList.push(code);
            }
            if (gujTq > 0 && gujApproved >= gujTq) {
              b.mcqDualSlotGujAllApprovedCount++;
              b.mcqDualSlotGujAllApprovedList.push(code);
            } else if (gujApproved > 0) {
              b.mcqDualSlotGujPartiallyApprovedCount++;
              b.mcqDualSlotGujPartiallyApprovedList.push(code);
            } else {
              b.mcqDualSlotGujNotApprovedCount++;
              b.mcqDualSlotGujNotApprovedList.push(code);
            }
          }
        }

        // Legacy per-language approval (whole DB, not restricted to sopOk) —
        // kept so existing filter buttons / consumers don't break. New UI
        // rows under "MCQ Approved" use the SOP-based + Dual-slot counts.
        if (engTq > 0) {
          if (engApproved >= engTq) { b.mcqEngAllApprovedCount++; b.mcqEngAllApprovedList.push(code); }
          else if (engApproved > 0) { b.mcqEngPartiallyApprovedCount++; b.mcqEngPartiallyApprovedList.push(code); }
          else { b.mcqEngNotApprovedCount++; b.mcqEngNotApprovedList.push(code); }
        } else {
          b.mcqEngNotApprovedCount++; b.mcqEngNotApprovedList.push(code);
        }
        if (isDual) {
          if (gujTq > 0) {
            if (gujApproved >= gujTq) { b.mcqGujAllApprovedCount++; b.mcqGujAllApprovedList.push(code); }
            else if (gujApproved > 0) { b.mcqGujPartiallyApprovedCount++; b.mcqGujPartiallyApprovedList.push(code); }
            else { b.mcqGujNotApprovedCount++; b.mcqGujNotApprovedList.push(code); }
          } else {
            b.mcqGujNotApprovedCount++; b.mcqGujNotApprovedList.push(code);
          }
        }
        void combinedTq; void combinedApproved; // legacy combined stats no longer drive approval buckets
      }
      return finaliseMcqBuckets(b);
    };

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

    // Pre-compute trainer name + has-trainer + trainer count for every base SOP in the DB set
    const dbBaseHasTrainer = new Map<string, boolean>();
    const dbBaseTrainerName = new Map<string, string>();
    const dbBaseTrainerCount = new Map<string, number>(); // 0 | 1 | 2+
    for (const base of dbBaseSet) {
      const meta = dbBaseMeta.get(base);
      const ownerDept = resolveDeptForBaseSop(base, meta);
      // Count distinct trainers for this SOP (same resolution priority as resolveTrainer)
      let count = 0;
      if (sopTrainerMap.has(base) && sopTrainerMap.get(base)!.size > 0) {
        count = sopTrainerMap.get(base)!.size;
      } else if (deptTrainerMap.has(ownerDept) && deptTrainerMap.get(ownerDept)!.size > 0) {
        count = deptTrainerMap.get(ownerDept)!.size;
      } else if (fallbackTrainerMap[ownerDept]) {
        count = fallbackTrainerMap[ownerDept].length;
      }
      dbBaseTrainerCount.set(base, count);
      const tr = resolveTrainer(base, ownerDept);
      dbBaseHasTrainer.set(base, Boolean(tr));
      if (tr) dbBaseTrainerName.set(base, tr);
    }

    const trainerBucketsForDept = (deptDbCodes: string[], deptName: string) => {
      const sop0TrainerList = deptDbCodes.filter((c) => (dbBaseTrainerCount.get(c) ?? 0) === 0);
      const sop1TrainerList = deptDbCodes.filter((c) => (dbBaseTrainerCount.get(c) ?? 0) === 1);
      const sop2PlusTrainerList = deptDbCodes.filter((c) => (dbBaseTrainerCount.get(c) ?? 0) >= 2);
      return {
        sop0TrainerCount: sop0TrainerList.length,
        sop1TrainerCount: sop1TrainerList.length,
        sop2PlusTrainerCount: sop2PlusTrainerList.length,
        sop0TrainerList,
        sop1TrainerList,
        sop2PlusTrainerList,
        sopTrainersAssigned: deptDbCodes.filter((c) => dbBaseHasTrainer.get(c)).length,
        sopTrainersMissing: deptDbCodes.filter((c) => !dbBaseHasTrainer.get(c)).length,
        sopTrainersMissingList: deptDbCodes
          .filter((c) => !dbBaseHasTrainer.get(c))
          .map((c) => ({ sopCode: c, title: dbBaseMeta.get(c)?.title || '', department: deptName })),
      };
    };

    // 2b. Obsolete SOPs: these may not appear in primary registry rows but are still "in DB".
    // We treat them separately so UI can show "Found (obsolete)" explicitly.
    // (obsoleteDocs fetched in Tier 1 above)

    const obsoleteByDept: Record<string, Set<string>> = {};

    for (const doc of obsoleteDocs as any[]) {
      const id = String(doc?.identifier || '').trim();
      if (!id) continue;
      const base = stripVersion(id);
      if (!base) continue;
      const dept = resolveDeptForBaseSop(base, {
        department: String(doc?.department || ''),
        departmentCode: '',
      });
      addDynamicDept(doc?.department || '');
      addDynamicDept(dept);
      if (!isValidDeptName(dept)) continue;
      if (!obsoleteByDept[dept]) obsoleteByDept[dept] = new Set<string>();
      obsoleteByDept[dept].add(base);
    }
    const departments = getDynamicDepartments();

    // Build department-wise SOP list (base SOPs) from DB
    const dbSopsByDept: Record<string, Array<{ sopCode: string; title: string; isDualLanguage: boolean; gujaratiName: string }>> = {};
    const dbSopCountsByDept: Record<string, number> = {};
    for (const d of departments) {
      dbSopsByDept[d] = [];
      dbSopCountsByDept[d] = 0;
    }

    for (const sopCode of dbBaseSet) {
      const meta = dbBaseMeta.get(sopCode);
      const dept = resolveDeptForBaseSop(sopCode, meta);
      if (!departments.includes(dept)) continue;
      dbSopsByDept[dept].push({ 
        sopCode, 
        title: meta?.title || '',
        isDualLanguage: meta?.isDualLanguage || false,
        gujaratiName: meta?.gujaratiName || ''
      });
    }
    for (const d of departments) {
      dbSopsByDept[d].sort((a, b) => a.sopCode.localeCompare(b.sopCode));
      dbSopCountsByDept[d] = dbSopsByDept[d].length;
    }

    // Fast lookup: dept -> SOP base codes that belong to that dept in DB
    const dbDeptSets: Record<string, Set<string>> = {};
    for (const d of departments) {
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
    for (const dept of departments) {
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

    for (const dept of departments) {
      const up = latestByDept.get(dept);
      if (!up || !up.snapshot) {
        const deptDbCodesNoUpload = (dbSopsByDept[dept] || []).map((x) => x.sopCode);
        const langKeys = new Set<LangKey>();
        for (const c of deptDbCodesNoUpload) {
          const ls = dbBaseLangs.get(c);
          (ls && ls.size > 0 ? Array.from(ls) : (['ENG'] as LangKey[])).forEach((k) => langKeys.add(k));
        }
        const langBreakdown = Array.from(langKeys)
          .sort((a, b) => (a === b ? 0 : a === 'ENG' ? -1 : 1))
          .map((k) => ({
            key: k,
            label: k,
            found: 0,
            missing: deptDbCodesNoUpload.filter((c) => (dbBaseLangs.get(c) || new Set<LangKey>(['ENG'])).has(k)).length,
          }));
        const langSopListByKey: Record<string, string[]> = {};
        for (const k of langKeys) {
          langSopListByKey[k] = deptDbCodesNoUpload
            .filter((c) => (dbBaseLangs.get(c) || new Set<LangKey>(['ENG'])).has(k))
            .sort((a, b) => a.localeCompare(b));
        }
        const excelDeptSplitFoundByDept: Record<string, number> = {};
        const excelDeptSplitMissingByDept: Record<string, number> = {};
        for (const d of departments) {
          excelDeptSplitFoundByDept[d] = 0;
          excelDeptSplitMissingByDept[d] = 0;
        }
        excelDeptSplitMissingByDept[dept] = deptDbCodesNoUpload.length;
        let expiredCount = 0;
        let okayCount = 0;
        let dueSoon30Count = 0;
        const dueSoon30List: string[] = [];
        const dueSoon30McqReviewedList: string[] = [];
        const dueSoon30McqPartialList: string[] = [];
        const dueSoon30McqNotReviewedList: string[] = [];
        let dueSoon30McqReviewed = 0;
        let dueSoon30McqPartial = 0;
        let dueSoon30McqNotReviewed = 0;
        const thirtyDaysMs = 30 * 24 * 3600 * 1000;
        for (const c of deptDbCodesNoUpload) {
          const meta = dbBaseMeta.get(c);
          if (!meta?.targetDate) {
            okayCount++;
            continue;
          }
          if (meta.expired) {
            expiredCount++;
          } else {
            okayCount++;
            const t = new Date(meta.targetDate).getTime();
            if (t - today.getTime() <= thirtyDaysMs) {
              dueSoon30Count++;
              dueSoon30List.push(c);
              const mcqStat = mcqStatMap.get(c);
              const tq = mcqStat?.totalQuestions ?? 0;
              const approved = mcqStat?.approvedCount ?? 0;
              if (tq > 0 && approved >= tq) { dueSoon30McqReviewed++; dueSoon30McqReviewedList.push(c); }
              else if (approved > 0) { dueSoon30McqPartial++; dueSoon30McqPartialList.push(c); }
              else { dueSoon30McqNotReviewed++; dueSoon30McqNotReviewedList.push(c); }
            }
          }
        }

        // SOP-based MCQ buckets for this no-upload dept. Scope = every DB SOP
        // that belongs to this dept, regardless of Excel presence — the same
        // scope the per-language ENG/GUJ filters use, so the section's totals
        // always reconcile and bilingual MAGE-style SOPs are never dropped.
        const mcqBuckets = computeMcqBuckets(deptDbCodesNoUpload);

        const missingFromExcelList = deptDbCodesNoUpload.map((c) => ({
          sopCode: c,
          title: dbBaseMeta.get(c)?.title || '',
          department: dept,
        }));
        perDept[dept] = {
          uploaded: false,
          sopCount: 0,
          foundInDb: 0,
          foundObsolete: 0,
          missingFromExcel: deptDbCodesNoUpload.length,
          langBreakdown,
          langSopListByKey,
          excelDeptSplit: {
            total: 0,
            foundByDept: excelDeptSplitFoundByDept,
            missingByDept: excelDeptSplitMissingByDept,
            unknownFound: 0,
            unknownMissing: 0,
          },
          trainersAssigned: 0,
          trainersMissing: 0,
          employeeCount: 0,
          fullyTrained: 0,
          incomplete: 0,
          expiredCount,
          okayCount,
          dueSoon30Count,
          dueSoon30List,
          dueSoon30McqReviewed,
          dueSoon30McqPartial,
          dueSoon30McqNotReviewed,
          dueSoon30McqReviewedList,
          dueSoon30McqPartialList,
          dueSoon30McqNotReviewedList,
          ...mcqBuckets,
          monthCounts: {},
          sopCodes: [],
          foundInDbList: [],
          expiredList: deptDbCodesNoUpload.filter((c) => dbBaseMeta.get(c)?.expired),
          okayList: deptDbCodesNoUpload.filter((c) => !dbBaseMeta.get(c)?.expired),
          employees: [],
          fileUrl: null,
          uploadedAt: null,
          missingFromExcelList,
          trainersMissingList: [],
          trainerBySopCode: Object.fromEntries(
            deptDbCodesNoUpload
              .map((c) => [c, dbBaseTrainerName.get(c) || ''])
              .filter(([, v]) => v)
          ),
          repeat3PlusCount: 0,
          repeat2Count: 0,
          repeat1Count: 0,
          repeat3PlusList: [],
          repeat2List: [],
          repeat1List: [],
          additionalTraining: { total: 0, byDept: {} },
          ...trainerBucketsForDept(deptDbCodesNoUpload, dept),
        };
        continue;
      }

      const snapshot = up.snapshot as {
        sopCodes: string[];
        sopMonthMap: Record<string, string>;
        monthCounts: Record<string, number>;
        employees: Array<{ name: string; designation: string; training: Record<string, boolean> }>;
      };

      // Unique SOP codes from snapshot header row (strip version suffixes)
      const codes = Array.from(new Set((snapshot.sopCodes || []).map((c) => stripVersion(c)))).filter(Boolean);
      codes.forEach((c) => allExcelCodes.add(c));
      const { sopMonthMap: sopMonthMapNorm, monthCounts: monthCountsNorm } = buildNormalizedMonthData(
        snapshot.sopMonthMap || {},
        codes,
      );
      sopCodesByDept[dept] = codes;
      sopMonthMapAll[dept] = sopMonthMapNorm;
      monthCountsByDept[dept] = monthCountsNorm;

      const obsoleteSetAll = new Set<string>();
      for (const d of departments) {
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
      for (const d of departments) {
        excelDeptSplitFoundByDept[d] = 0;
        excelDeptSplitMissingByDept[d] = 0;
      }
      let excelDeptSplitUnknownFound = 0;
      let excelDeptSplitUnknownMissing = 0;
      for (const c of codes) {
        const inDb = dbBaseSet.has(c);
        const meta = inDb ? dbBaseMeta.get(c) : undefined;
        const owner = resolveDeptForBaseSop(c, meta as any);
        const isKnown = departments.includes(owner);
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
        if (departments.includes(owner)) {
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
          month: sopMonthMapNorm[c] || '',
          department: dept,
        }));
      const trainersAssigned = trainersAssignedList.length;
      const trainersMissing = trainersMissingListRows.length;

      // SOP-wise trainer counts: based on all DB SOPs for this dept (not just Excel-found)
      const {
        sopTrainersAssigned,
        sopTrainersMissing,
        sopTrainersMissingList,
        sop0TrainerCount,
        sop1TrainerCount,
        sop2PlusTrainerCount,
        sop0TrainerList,
        sop1TrainerList,
        sop2PlusTrainerList,
      } = trainerBucketsForDept(deptDbCodes, dept);
      
      let expiredCount = 0;
      let okayCount = 0;
      let dueSoon30Count = 0;
      const dueSoon30List: string[] = [];
      const thirtyDaysMs = 30 * 24 * 3600 * 1000;
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
          if (t - today.getTime() <= thirtyDaysMs) {
            dueSoon30Count++;
            dueSoon30List.push(c);
          }
        }
      }

      // MCQ review status for the due-soon SOPs
      let dueSoon30McqReviewed = 0;
      let dueSoon30McqPartial = 0;
      let dueSoon30McqNotReviewed = 0;
      const dueSoon30McqReviewedList: string[] = [];
      const dueSoon30McqPartialList: string[] = [];
      const dueSoon30McqNotReviewedList: string[] = [];
      for (const c of dueSoon30List) {
        const mcqStat = mcqStatMap.get(c);
        const tq = mcqStat?.totalQuestions ?? 0;
        const approved = mcqStat?.approvedCount ?? 0;
        if (tq > 0 && approved >= tq) { dueSoon30McqReviewed++; dueSoon30McqReviewedList.push(c); }
        else if (approved > 0) { dueSoon30McqPartial++; dueSoon30McqPartialList.push(c); }
        else { dueSoon30McqNotReviewed++; dueSoon30McqNotReviewedList.push(c); }
      }

      // SOP-based MCQ buckets for this uploaded dept. Scope = every DB SOP
      // belonging to this dept (deptDbCodes), so the section's totals always
      // reconcile with the per-language ENG/GUJ filters and bilingual
      // SOPs (e.g. MAGE) are never silently dropped from the dual breakdown.
      const mcqBuckets = computeMcqBuckets(deptDbCodes);

      const employees = (snapshot.employees || []).map((e) => ({
        ...e,
        training: normalizeEmployeeTraining(e.training as Record<string, boolean>),
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
        sop0TrainerCount,
        sop1TrainerCount,
        sop2PlusTrainerCount,
        sop0TrainerList,
        sop1TrainerList,
        sop2PlusTrainerList,
        expiredCount,
        okayCount,
        dueSoon30Count,
        dueSoon30List,
        dueSoon30McqReviewed,
        dueSoon30McqPartial,
        dueSoon30McqNotReviewed,
        dueSoon30McqReviewedList,
        dueSoon30McqPartialList,
        dueSoon30McqNotReviewedList,
        ...mcqBuckets,
        employeeCount: employees.length,
        fullyTrained,
        incomplete,
        monthCounts: monthCountsNorm,
        sopCodes: codes,
        // Exact lists for instant client-side filtering (no API call needed)
        foundInDbList: foundInDb,
        expiredList: deptDbCodes.filter((c) => dbBaseMeta.get(c)?.expired),
        okayList: deptDbCodes.filter((c) => !dbBaseMeta.get(c)?.expired),
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
      for (const d of departments) {
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
      const ownerCodes = departments.includes(owner) ? sopCodesByDept[owner] : undefined;
      const ownerCodesSet = ownerCodes ? new Set(ownerCodes) : null;
      if (ownerCodesSet && ownerCodesSet.has(c)) foundInAllExcel.push(c);
      else missingFromAllExcel.push(c);
    }
    let totalTrainersAssigned = 0;
    let totalTrainersMissing = 0;
    let totalSopTrainersAssigned = 0;
    let totalSopTrainersMissing = 0;
    const totalSopTrainersMissingList: { sopCode: string; title: string; department: string }[] = [];
    // Trainer-count bucket totals (across all DB SOPs, not just uploaded depts)
    const totalSop0TrainerList: string[] = [];
    const totalSop1TrainerList: string[] = [];
    const totalSop2PlusTrainerList: string[] = [];
    let totalSopOkayCount = 0;
    let totalSopExpiredCount = 0;
    let totalDueSoon30Count = 0;
    let totalDueSoon30McqReviewed = 0;
    let totalDueSoon30McqPartial = 0;
    let totalDueSoon30McqNotReviewed = 0;
    const totalTrainersMissingList: any[] = [];
    // SOP-based MCQ totals across ALL DB SOPs (every primary SOP, regardless
    // of dept upload status). The helper guarantees:
    //   • Top "MCQ (100+ created)" Found + Missing == dbBaseSet.size (e.g. 429)
    //   • Non-Dual section = English-only SOPs ENG status
    //   • Dual section = bilingual SOPs (incl. all MAGE/Engineering rows),
    //     reported per-language slot AND as a per-SOP "either incomplete"
    //     aggregate so dual issues never get hidden inside the ENG-only column.
    const totalMcqBuckets = computeMcqBuckets(dbBaseSet);
    // Total expiry counts over ALL DB SOPs (not just Excel-found)
    const thirtyDaysMsTotal = 30 * 24 * 3600 * 1000;
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
        if (t - today.getTime() <= thirtyDaysMsTotal) {
          totalDueSoon30Count++;
          // MCQ status for due-soon SOP
          const mcqStat = mcqStatMap.get(base);
          const tq = mcqStat?.totalQuestions ?? 0;
          const approved = mcqStat?.approvedCount ?? 0;
          if (tq > 0 && approved >= tq) totalDueSoon30McqReviewed++;
          else if (approved > 0) totalDueSoon30McqPartial++;
          else totalDueSoon30McqNotReviewed++;
        }
      }
    }

    for (const dept of departments) {
      if (perDept[dept].uploaded) {
        totalTrainersAssigned += perDept[dept].trainersAssigned || 0;
        totalTrainersMissing += perDept[dept].trainersMissing || 0;
      }
      totalTrainersMissingList.push(...perDept[dept].trainersMissingList);
    }

    // SOP-wise trainer totals: all DB SOPs (uses full 3-tier trainer resolution)
    for (const base of dbBaseSet) {
      const count = dbBaseTrainerCount.get(base) ?? 0;
      if (count >= 2) totalSop2PlusTrainerList.push(base);
      else if (count === 1) totalSop1TrainerList.push(base);
      else totalSop0TrainerList.push(base);

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
      sop0TrainerCount: totalSop0TrainerList.length,
      sop1TrainerCount: totalSop1TrainerList.length,
      sop2PlusTrainerCount: totalSop2PlusTrainerList.length,
      sop0TrainerList: totalSop0TrainerList,
      sop1TrainerList: totalSop1TrainerList,
      sop2PlusTrainerList: totalSop2PlusTrainerList,
      okayCount: totalSopOkayCount,
      expiredCount: totalSopExpiredCount,
      dueSoon30Count: totalDueSoon30Count,
      dueSoon30McqReviewed: totalDueSoon30McqReviewed,
      dueSoon30McqPartial: totalDueSoon30McqPartial,
      dueSoon30McqNotReviewed: totalDueSoon30McqNotReviewed,
      ...totalMcqBuckets,
      employeeCount: totalEmployees,
      fullyTrained: totalFullyTrained,
      incomplete: totalIncomplete,
      departmentCount: departments.filter((d) => perDept[d].uploaded).length,
      totalDepartments: departments.length,
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
      departments,
      perDept,
      totalCard,
      employees: allExcelEmployees,
      sopCodesByDept,
      sopMonthMapByDept: sopMonthMapAll,
      monthCountsByDept,
      sopStatusByCode,
      dbDocPathsByCode,
    };

    if (!forceFresh) await setCached(payload);
    return withCacheHeaders(NextResponse.json(payload));
  } catch (error: any) {
    console.error('training-matrix overview error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
