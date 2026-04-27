import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { resolveDept } from '@/lib/deptResolver';

export const dynamic = 'force-dynamic';

const DEPT_CANONICAL = ['QA', 'QC', 'Microbiology', 'Production', 'Store', 'Engineering', 'Personnel'] as const;
type CanonDept = (typeof DEPT_CANONICAL)[number];

function stripVersion(code: string): string {
  return String(code || '').toUpperCase().replace(/-\d+$/, '').trim();
}

function resolveCanon(baseSopCode: string, storedDept?: string | null): CanonDept | 'Unknown' {
  const d = resolveDept(baseSopCode, storedDept);
  return (DEPT_CANONICAL as readonly string[]).includes(d) ? (d as CanonDept) : 'Unknown';
}

function canonFromLibraryFields(rawDept?: string | null): CanonDept | 'Unknown' {
  if (!rawDept) return 'Unknown';
  const d = String(rawDept);
  const lower = d.toLowerCase();
  if (lower.includes('micro')) return 'Microbiology';
  if (lower.includes('engineer')) return 'Engineering';
  if (lower.includes('person') || lower.includes('hr')) return 'Personnel';
  if (lower === 'qa' || lower.includes('quality assurance')) return 'QA';
  if (lower === 'qc' || lower.includes('quality control')) return 'QC';
  if (lower.includes('store')) return 'Store';
  if (lower.includes('prod')) return 'Production';
  return 'Unknown';
}

type SopRow = {
  sopCode: string;
  sopIdentifier: string;
  version: string;
  title: string;
  deptLibrary: CanonDept | 'Unknown';
  deptDashboard: CanonDept | 'Unknown';
  departmentCode?: string;
  inSopCollection: boolean;
  inMcqBank: boolean;
  isObsoleteInSop: boolean;
  isObsoleteInMcqBank: boolean;
};

export async function GET() {
  try {
    await connectDB();

    // SOPLibrary is the authoritative “department schema” source (department + departmentCode).
    const libDocs = await SOPLibrary.find(
      {
        sopIdentifier: { $regex: /^[A-Z]{2,6}\d{1,4}-\d{1,3}$/i },
        sopName: { $not: /annexure/i },
      },
      { sopIdentifier: 1, sopName: 1, department: 1, departmentCode: 1 }
    ).lean();

    // SOP collection (ingested documents) — used to cross-check counts + obsolete flags.
    const sopDocs = await SOP.find(
      {},
      { identifier: 1, department: 1, isObsolete: 1 }
    ).lean();

    // MCQBank — used to cross-check presence + “absolute/obsolete” SOPs (currently managed here).
    const mcqDocs = await MCQBank.find(
      {},
      {
        sopIdentifier: 1,
        sopName: 1,
        department: 1,
        folderDepartment: 1,
        isObsolete: 1,
        obsoleteAt: 1,
        obsoleteReason: 1,
      }
    ).lean();

    const sopBaseToDeptFromSOP = new Map<string, CanonDept | 'Unknown'>();
    const sopBaseToObsoleteFromSOP = new Map<string, boolean>();
    for (const s of sopDocs as any[]) {
      const base = stripVersion(s.identifier);
      if (!base) continue;
      if (!sopBaseToDeptFromSOP.has(base)) {
        sopBaseToDeptFromSOP.set(base, resolveCanon(base, s.department || null));
      }
      if (s.isObsolete) sopBaseToObsoleteFromSOP.set(base, true);
    }

    const sopBaseToMcqPresent = new Map<string, boolean>();
    const sopBaseToObsoleteFromMcq = new Map<string, boolean>();
    const obsoleteMcqBanks: Array<{
      sopCode: string;
      sopIdentifier: string;
      sopName: string;
      department: string;
      folderDepartment?: string;
      obsoleteAt?: string;
      obsoleteReason?: string;
    }> = [];

    for (const m of mcqDocs as any[]) {
      const base = stripVersion(m.sopIdentifier);
      if (!base) continue;
      sopBaseToMcqPresent.set(base, true);
      if (m.isObsolete) {
        sopBaseToObsoleteFromMcq.set(base, true);
        obsoleteMcqBanks.push({
          sopCode: base,
          sopIdentifier: m.sopIdentifier,
          sopName: m.sopName || '',
          department: String(m.department || ''),
          folderDepartment: m.folderDepartment,
          obsoleteAt: m.obsoleteAt ? new Date(m.obsoleteAt).toISOString() : undefined,
          obsoleteReason: m.obsoleteReason,
        });
      }
    }

    // Build canonical SOP list (unique base SOPs) from SOPLibrary + attach cross-check flags.
    const seen = new Set<string>();
    const sops: SopRow[] = [];

    for (const d of libDocs as any[]) {
      const rawIdentifier = String(d.sopIdentifier || '').toUpperCase().trim();
      const base = stripVersion(rawIdentifier);
      if (!base || seen.has(base)) continue;
      seen.add(base);

      const deptDashboard = resolveCanon(base, d?.department || null);
      const deptLibrary = canonFromLibraryFields(d?.department || null);
      const version = (rawIdentifier.match(/-(\d{1,3})$/)?.[1] || '').padStart(2, '0');

      sops.push({
        sopCode: base,
        sopIdentifier: rawIdentifier,
        version,
        title: String(d.sopName || ''),
        deptLibrary,
        deptDashboard,
        departmentCode: d.departmentCode ? String(d.departmentCode) : undefined,
        inSopCollection: sopBaseToDeptFromSOP.has(base),
        inMcqBank: sopBaseToMcqPresent.has(base),
        isObsoleteInSop: sopBaseToObsoleteFromSOP.has(base),
        isObsoleteInMcqBank: sopBaseToObsoleteFromMcq.has(base),
      });
    }

    // Department-wise counts from different sources
    const initDeptStats = (): Record<CanonDept, any> => {
      const out: any = {};
      for (const dept of DEPT_CANONICAL) {
        out[dept] = {
          department: dept,
          sopLibraryUnique: 0,
          sopDocs: 0,
          sopDocsObsolete: 0,
          mcqBanksUnique: 0,
          mcqBanksObsoleteUnique: 0,
        };
      }
      return out;
    };

    const deptStatsMap = initDeptStats();

    // SOPLibrary unique base counts
    for (const r of sops) {
      if (r.deptDashboard !== 'Unknown') {
        deptStatsMap[r.deptDashboard as CanonDept].sopLibraryUnique += 1;
      }
    }

    // SOP collection counts (by SOP.department, canonicalized)
    const sopSeenByDept = new Map<string, Set<string>>();
    for (const dept of DEPT_CANONICAL) sopSeenByDept.set(dept, new Set<string>());
    for (const s of sopDocs as any[]) {
      const base = stripVersion(s.identifier);
      const dept = resolveCanon(base, s.department || null);
      if (!base || dept === 'Unknown') continue;
      sopSeenByDept.get(dept)!.add(base);
      if (s.isObsolete) deptStatsMap[dept].sopDocsObsolete += 1;
    }
    for (const dept of DEPT_CANONICAL) {
      deptStatsMap[dept].sopDocs = sopSeenByDept.get(dept)!.size;
    }

    // MCQBank counts (unique base, by folderDepartment if present else department)
    const mcqSeenByDept = new Map<string, Set<string>>();
    const mcqObsoleteSeenByDept = new Map<string, Set<string>>();
    for (const dept of DEPT_CANONICAL) {
      mcqSeenByDept.set(dept, new Set<string>());
      mcqObsoleteSeenByDept.set(dept, new Set<string>());
    }
    for (const m of mcqDocs as any[]) {
      const base = stripVersion(m.sopIdentifier);
      if (!base) continue;
      const dept = resolveCanon(base, (m.folderDepartment || m.department || null) as any);
      if (dept === 'Unknown') continue;
      mcqSeenByDept.get(dept)!.add(base);
      if (m.isObsolete) mcqObsoleteSeenByDept.get(dept)!.add(base);
    }
    for (const dept of DEPT_CANONICAL) {
      deptStatsMap[dept].mcqBanksUnique = mcqSeenByDept.get(dept)!.size;
      deptStatsMap[dept].mcqBanksObsoleteUnique = mcqObsoleteSeenByDept.get(dept)!.size;
    }

    const deptStats = DEPT_CANONICAL.map((d) => deptStatsMap[d]);

    sops.sort((a, b) => a.sopCode.localeCompare(b.sopCode));
    obsoleteMcqBanks.sort((a, b) => a.sopCode.localeCompare(b.sopCode));

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      departments: DEPT_CANONICAL,
      deptStats,
      sops,
      obsoleteMcqBanks,
    });
  } catch (error: any) {
    console.error('sop-dept-audit error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

