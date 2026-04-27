import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrixUpload from '@/models/TrainingMatrixUpload';
import { GET as getDashboardSops } from '@/app/api/dashboard/sops/route';
import { filterPrimaryRegistryRowsUniqueByFamily } from '@/lib/registryPrimaryRows';
import { resolveDept } from '@/lib/deptResolver';
import SOP from '@/models/SOP';
import TrainingMatrix from '@/models/TrainingMatrix';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

const DEPTS = ['QA', 'QC', 'Microbiology', 'Production', 'Store', 'Engineering', 'Personnel'] as const;
type Dept = (typeof DEPTS)[number];

function canonDept(raw: string): Dept | '' {
  const t = (raw || '').toLowerCase();
  if (!t) return '';
  if (/micro/.test(t)) return 'Microbiology';
  if (/engineer|maint/.test(t)) return 'Engineering';
  if (/person|hr\b/.test(t)) return 'Personnel';
  if (/\bqa\b|quality.assur/.test(t)) return 'QA';
  if (/\bqc\b|quality.cont/.test(t)) return 'QC';
  if (/store/.test(t)) return 'Store';
  if (/prod/.test(t)) return 'Production';
  // If exact
  const exact = DEPTS.find((d) => d.toLowerCase() === t);
  return exact ?? '';
}

function stripVersion(code: string): string {
  return String(code || '').toUpperCase().replace(/-\d+$/, '').trim();
}

function versionFromSopNo(sopNo: string): number | null {
  const m = String(sopNo || '').toUpperCase().trim().match(/-0*(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function resolveDeptForBaseSop(
  baseSopCode: string,
  meta: { department?: string; departmentCode?: string } | undefined,
): Dept | '' {
  const fromResolver = resolveDept(baseSopCode, meta?.department || null);
  if ((DEPTS as readonly string[]).includes(fromResolver)) return fromResolver as Dept;
  const c = String(meta?.departmentCode || '').toUpperCase().trim();
  if (c === 'QA') return 'QA';
  if (c === 'QC') return 'QC';
  if (c === 'MI' || c === 'MICRO') return 'Microbiology';
  if (c === 'PR' || c === 'PROD') return 'Production';
  if (c === 'ST' || c === 'STORE') return 'Store';
  if (c === 'EN' || c === 'ENG') return 'Engineering';
  if (c === 'PE' || c === 'PER' || c === 'HR') return 'Personnel';
  const cd = canonDept(meta?.department || '');
  return cd;
}

type DetailType = 'db' | 'excel' | 'found' | 'missing' | 'obsolete';

type LangKey = 'ENG' | 'GUJ';
type TrainerFilter = 'assigned' | 'missing';

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    // Build trainer maps using the same sources as the Dashboard:
    // a) TrainingMatrix entries with trainerName (SOP-specific)
    // b) Users with role=trainer or isTrainerEligible (department-level)
    // c) Hardcoded fallback (same as dashboard)
    const [tmTrainerEntries, allUsers] = await Promise.all([
      TrainingMatrix.find({ trainerName: { $exists: true, $nin: [null, ''] } })
        .select('sopIdentifier department trainerName')
        .lean(),
      User.find({}).lean(),
    ]);

    const sopTrainerMap = new Map<string, Set<string>>();
    for (const entry of tmTrainerEntries as any[]) {
      if (!entry.sopIdentifier || !entry.trainerName) continue;
      const code = String(entry.sopIdentifier).trim().toUpperCase().replace(/-\d+$/, '');
      if (!sopTrainerMap.has(code)) sopTrainerMap.set(code, new Set());
      sopTrainerMap.get(code)!.add(entry.trainerName);
    }

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

    const resolveTrainer = (base: string, ownerDept: string): string => {
      if (sopTrainerMap.has(base) && sopTrainerMap.get(base)!.size > 0) {
        return Array.from(sopTrainerMap.get(base)!).join(', ');
      }
      if (deptTrainerMap.has(ownerDept as any) && deptTrainerMap.get(ownerDept as any)!.size > 0) {
        return Array.from(deptTrainerMap.get(ownerDept as any)!).join(', ');
      }
      if (fallbackTrainerMap[ownerDept]) {
        return fallbackTrainerMap[ownerDept].join(', ');
      }
      return '';
    };

    const sp = req.nextUrl.searchParams;
    const deptRaw = String(sp.get('dept') || '').trim();
    const type = (String(sp.get('type') || 'db') as DetailType) || 'db';
    const lang = String(sp.get('lang') || '').trim().toUpperCase() as LangKey | '';
    const trainerFilter = String(sp.get('trainer') || '').trim().toLowerCase() as TrainerFilter | '';

    const dept = canonDept(deptRaw);
    if (!dept) {
      return NextResponse.json({ success: false, error: 'Invalid dept' }, { status: 400 });
    }
    if (!['db', 'excel', 'found', 'missing', 'obsolete'].includes(type)) {
      return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
    }
    if (lang && lang !== 'ENG' && lang !== 'GUJ') {
      return NextResponse.json({ success: false, error: 'Invalid lang' }, { status: 400 });
    }
    if (trainerFilter && trainerFilter !== 'assigned' && trainerFilter !== 'missing') {
      return NextResponse.json({ success: false, error: 'Invalid trainer filter' }, { status: 400 });
    }

    // Latest main upload for dept (Excel snapshot stored in DB)
    const up = await TrainingMatrixUpload.findOne({
      fileType: 'main',
      department: { $regex: new RegExp(`^${dept}$`, 'i') },
      snapshot: { $exists: true, $ne: null },
    })
      .sort({ uploadedAt: -1 })
      .lean();

    const snapshot = ((up as any)?.snapshot || null) as null | {
      sopCodes?: string[];
      sopMonthMap?: Record<string, string>;
      employees?: Array<{ name: string; designation?: string; training?: Record<string, boolean> }>;
    };

    const excelCodes = (snapshot?.sopCodes || []).map((c) => String(c || '').toUpperCase().trim()).filter(Boolean);
    const excelSet = new Set(excelCodes);
    const excelMonthMap = snapshot?.sopMonthMap || {};
    const excelEmployees = Array.isArray(snapshot?.employees) ? snapshot!.employees! : [];

    // Obsolete SOPs (may exist only as obsolete, not in primary registry rows)
    const obsoleteDocs = await SOP.find({ isObsolete: true })
      .select('identifier name department obsoleteAt obsoleteReason version')
      .lean();
    const obsoleteDeptSet = new Set<string>();
    const obsoleteMetaByBase = new Map<
      string,
      { identifier: string; name: string; obsoleteAt?: any; obsoleteReason?: string; version?: string; department?: string }
    >();
    for (const doc of obsoleteDocs as any[]) {
      const id = String(doc?.identifier || '').trim();
      if (!id) continue;
      const base = stripVersion(id);
      if (!base) continue;
      const d = resolveDeptForBaseSop(base, { department: String(doc?.department || ''), departmentCode: '' });
      if (d !== dept) continue;
      obsoleteDeptSet.add(base);
      if (!obsoleteMetaByBase.has(base)) {
        obsoleteMetaByBase.set(base, {
          identifier: id,
          name: String(doc?.name || ''),
          obsoleteAt: doc?.obsoleteAt,
          obsoleteReason: String(doc?.obsoleteReason || ''),
          version: String(doc?.version || ''),
          department: String(doc?.department || ''),
        });
      }
    }

    // Dashboard registry rows (DB truth) + family-unique filter (same as overview)
    const origin = req.nextUrl.origin;
    const dashReq = new NextRequest(new URL('/api/dashboard/sops?refresh=1', origin));
    const dashRes = await getDashboardSops(dashReq as any);
    const dashboard = (await dashRes.json()) as { success: boolean; data?: any[] };
    const registryRows = Array.isArray(dashboard?.data) ? dashboard.data : [];
    const familyUniqueRows = filterPrimaryRegistryRowsUniqueByFamily(registryRows);

    // Build meta and registry enrichment per base SOP code
    const dbBaseSet = new Set<string>();
    const dbBaseMeta = new Map<
      string,
      {
        title: string;
        department: string;
        departmentCode: string;
      }
    >();

    const registryByBase = new Map<
      string,
      {
        sopNo: string;
        version: number | null;
        department: string;
        expiryDate?: string | null;
        reviewDate?: string | null;
        location?: string | null;
        isDualLanguage?: boolean;
        englishVersion?: boolean;
        gujaratiVersion?: boolean;
        fileType?: any;
        sopDocuments?: any[];
        mediaStatus?: any;
        trainer?: string | null;
        rawRow?: any;
      }
    >();

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
        });
      }

      // Keep the highest version sopNo we see for this base (best "current" guess)
      const v = versionFromSopNo(sopNo);
      const prev = registryByBase.get(base);
      const prevV = prev?.version ?? -1;
      const thisV = v ?? -1;
      if (!prev || thisV >= prevV) {
        registryByBase.set(base, {
          sopNo,
          version: v,
          department: String(row?.department || ''),
          expiryDate: row?.expiryDate ? String(row.expiryDate) : null,
          reviewDate: (row?.nextReviewDate || row?.reviewDate) ? String(row?.nextReviewDate || row?.reviewDate) : null,
          location: row?.location ? String(row.location) : null,
          isDualLanguage: !!row?.isDualLanguage,
          englishVersion: !!row?.englishVersion,
          gujaratiVersion: !!row?.gujaratiVersion,
          fileType: row?.fileType,
          sopDocuments: Array.isArray(row?.sopDocuments) ? row.sopDocuments : [],
          mediaStatus: row?.mediaStatus,
          trainer: null, // resolved below after full registry is built
          rawRow: row,
        });
      }
    }

    // Resolve authoritative trainer for every base SOP in registry
    for (const [base, reg] of registryByBase) {
      const ownerDept = String(reg?.department || '').trim();
      // Priority: SOP-specific DeptTrainer → dept-level DeptTrainer → row's assignedTrainer field
      const tr =
        resolveTrainer(base, ownerDept) ||
        String((reg as any)?.rawRow?.assignedTrainer || (reg as any)?.rawRow?.trainer || '').trim();
      if (tr) (reg as any).trainer = tr;
    }

    // Build DB SOP codes for this dept
    const dbDeptCodes: string[] = [];
    for (const base of dbBaseSet) {
      const meta = dbBaseMeta.get(base);
      const d = resolveDeptForBaseSop(base, meta);
      if (d === dept) dbDeptCodes.push(base);
    }
    dbDeptCodes.sort((a, b) => a.localeCompare(b));

    const listForType = (t: DetailType): string[] => {
      if (t === 'db') return dbDeptCodes;
      if (t === 'excel') return [...excelSet].sort((a, b) => a.localeCompare(b));
      if (t === 'found') return excelCodes.filter((c) => dbBaseSet.has(c)).sort((a, b) => a.localeCompare(b));
      if (t === 'obsolete') return [...obsoleteDeptSet].sort((a, b) => a.localeCompare(b));
      // missing: in DB for this dept, but not in Excel
      return dbDeptCodes.filter((c) => !excelSet.has(c));
    };

    const codes = listForType(type);
    const codesFiltered = (() => {
      if (!lang) return codes;
      if (type === 'excel' || type === 'obsolete') return codes;
      return codes.filter((sopCode) => {
        const reg = registryByBase.get(sopCode);
        const rawLang = String((reg as any)?.rawRow?.language || '').trim().toLowerCase();
        const isDual = !!reg?.isDualLanguage || (!!reg?.englishVersion && !!reg?.gujaratiVersion);
        if (isDual) return true;
        if (lang === 'GUJ') return rawLang === 'gujarati';
        return rawLang !== 'gujarati';
      });
    })();

    const codesFilteredByTrainerAndStatus = (() => {
      let filtered = codesFiltered;
      if (trainerFilter) {
        filtered = filtered.filter((sopCode) => {
          const tr = String(registryByBase.get(sopCode)?.trainer || '').trim();
          const has = Boolean(tr);
          return trainerFilter === 'assigned' ? has : !has;
        });
      }
      const statusFilter = String(sp.get('status') || '').trim().toLowerCase();
      if (statusFilter === 'expired' || statusFilter === 'okay') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        filtered = filtered.filter((sopCode) => {
          const reg = registryByBase.get(sopCode);
          let expired = false;
          const targetDate = reg?.reviewDate || reg?.expiryDate;
          if (targetDate) {
            const t = new Date(targetDate);
            const diffDays = Math.ceil((t.getTime() - today.getTime()) / (1000 * 3600 * 24));
            if (diffDays < 0) expired = true;
          }
          return statusFilter === 'expired' ? expired : !expired;
        });
      }
      return filtered;
    })();

    const rows = codesFilteredByTrainerAndStatus.map((sopCode) => {
      const meta = dbBaseMeta.get(sopCode);
      const reg = registryByBase.get(sopCode);
      const month = String(excelMonthMap?.[sopCode] || '').trim();
      const obs = obsoleteMetaByBase.get(sopCode);

      // From Excel snapshot employees: count who have an entry for this SOP, and how many are true/false
      let excelApplicable = 0;
      let excelCompleted = 0;
      let excelPending = 0;
      for (const e of excelEmployees) {
        const tr = (e as any)?.training || {};
        if (!(sopCode in tr)) continue;
        excelApplicable++;
        if (tr[sopCode]) excelCompleted++;
        else excelPending++;
      }

      // Attachment summary (DB)
      const docs = Array.isArray(reg?.sopDocuments) ? reg!.sopDocuments! : [];
      const docxCount = docs.filter((d: any) => String(d?.fileType || '').toLowerCase() === 'docx').length;
      const pdfCount = docs.filter((d: any) => String(d?.fileType || '').toLowerCase() === 'pdf').length;
      const languages = Array.from(
        new Set(
          docs
            .map((d: any) => String(d?.language || '').trim())
            .filter(Boolean)
            .map((x) => x[0].toUpperCase() + x.slice(1).toLowerCase()),
        ),
      );

      return {
        sopCode,
        title: meta?.title || obs?.name || '',
        department: dept,
        // DB / registry details
        db: {
          present: dbBaseSet.has(sopCode),
          sopNo: reg?.sopNo || '',
          version: reg?.version ?? null,
          expiryDate: reg?.expiryDate ?? null,
          reviewDate: reg?.reviewDate ?? null,
          location: reg?.location ?? null,
          trainer: reg?.trainer ?? null,
          isDualLanguage: reg?.isDualLanguage ?? false,
          englishVersion: reg?.englishVersion ?? false,
          gujaratiVersion: reg?.gujaratiVersion ?? false,
          attachments: {
            docxCount,
            pdfCount,
            languages,
            total: docs.length,
          },
          mediaStatus: reg?.mediaStatus ?? null,
        },
        obsolete: {
          present: obsoleteDeptSet.has(sopCode),
          identifier: obs?.identifier || '',
          name: obs?.name || '',
          obsoleteAt: obs?.obsoleteAt ?? null,
          obsoleteReason: obs?.obsoleteReason || '',
          version: obs?.version || '',
        },
        // Excel snapshot details (stored in DB)
        excel: {
          present: excelSet.has(sopCode),
          month,
          employees: {
            applicable: excelApplicable,
            completed: excelCompleted,
            pending: excelPending,
          },
        },
        // Raw payloads for "as much as possible"
        raw: {
          registryRow: reg?.rawRow ?? null,
          upload: up
            ? {
                _id: String((up as any)._id || ''),
                fileName: (up as any).fileName || null,
                uploadedAt: (up as any).uploadedAt || null,
                fileUrl: (up as any).fileUrl || null,
              }
            : null,
        },
      };
    });

    return NextResponse.json({
      success: true,
      dept,
      type,
      lang: lang || null,
      trainer: trainerFilter || null,
      counts: {
        rows: rows.length,
        dbDept: dbDeptCodes.length,
        excelDept: excelSet.size,
      },
      rows,
    });
  } catch (error: any) {
    console.error('training-matrix sop-details error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed' }, { status: 500 });
  }
}

