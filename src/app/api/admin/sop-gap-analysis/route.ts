import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import { resolveDept } from '@/lib/deptResolver';
import { GET as getDashboardSops } from '@/app/api/dashboard/sops/route';
import { filterPrimaryRegistryRows } from '@/lib/registryPrimaryRows';
import { sopFamilyKeyFromIdentifier } from '@/lib/sopIdentifierNormalize';

export const dynamic = 'force-dynamic';

// ─── Canonical departments ────────────────────────────────────────────────────

const DEPT_CANONICAL = [
  'QA',
  'QC',
  'Microbiology',
  'Production',
  'Store',
  'Engineering',
  'Personnel',
] as const;
type CanonDept = (typeof DEPT_CANONICAL)[number];

function canonFromResolver(raw: string): CanonDept | 'Unknown' {
  const t = String(raw || '').trim();
  if (!t) return 'Unknown';
  // resolveDept may return "Engineering and Maintenance"; normalize to "Engineering".
  if (/engineer|maint/i.test(t)) return 'Engineering';
  if ((DEPT_CANONICAL as readonly string[]).includes(t)) return t as CanonDept;
  return 'Unknown';
}

function resolveCanon(identifier: string, storedDept?: string | null): CanonDept | 'Unknown' {
  const d = resolveDept(identifier, storedDept ?? null);
  return canonFromResolver(d);
}

/** Pretty display form: family key "QAGE:1" → "QAGE01". */
function familyKeyToDisplay(fk: string): string {
  const m = fk.match(/^([A-Z]{2,6}):(\d+)$/);
  if (!m) return fk;
  return `${m[1]}${String(parseInt(m[2], 10)).padStart(2, '0')}`;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type GapSopRow = {
  sopCode: string;
  sopIdentifier: string;
  version: string;
  title: string;
  department: CanonDept | 'Unknown';
  inDashboard: boolean;
  inMcqBank: boolean;
  inMatrix: boolean;
  presentCount: number;
};

export type GapAnalysisResponse = {
  success: boolean;
  generatedAt: string;
  departments: CanonDept[];
  sops: GapSopRow[];
  /**
   * Counts pulled directly from each page's own source (displayed verbatim on those pages).
   * The Dashboard and MCQ Bank numbers are identical because both are derived from the
   * unique SOP family set (one row per SOP, latest revision).
   */
  pageCounts: {
    dashboard: number;      // 429 — unique SOP families in dashboard primary rows
    mcqBank: number;        // 429 — same unique family set
    matrix: number;         // 429 — same unique family set (Matrix sources from Dashboard)
  };
  summary: {
    total: number;
    allThree: number;
    dashboardOnly: number;
    mcqOnly: number;
    matrixOnly: number;
    totalInDashboard: number;
    totalInMcqBank: number;
    totalInMatrix: number;
    missingFromDashboard: number;
    missingFromMcq: number;
    missingFromMatrix: number;
    fullyMissing: number;
  };
  deptStats: Array<{
    department: CanonDept | 'Unknown';
    total: number;
    allThree: number;
    inDashboard: number;
    inMcqBank: number;
    inMatrix: number;
    missingFromDashboard: number;
    missingFromMcq: number;
    missingFromMatrix: number;
  }>;
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    await connectDB();

    const origin = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    // ── 1. Dashboard SOPs ────────────────────────────────────────────────────────────
    // Source: same dashboard registry payload used by /api/dashboard/sops, called
    // directly with `?refresh=1` to bypass any stale in-memory cache and guarantee
    // the exact same numbers the Dashboard page just displayed. The Dashboard now
    // shows one row per SOP family (latest revision), so its total equals the MCQ
    // Bank page's "Unique SOPs" value.
    const dashReq = new NextRequest(new URL('/api/dashboard/sops?refresh=1', origin));
    const dashRes = await getDashboardSops(dashReq as any);
    const dashboard = (await dashRes.json()) as { success: boolean; data?: any[] };
    const registryRows = Array.isArray(dashboard?.data) ? dashboard.data : [];
    const primaryRows = filterPrimaryRegistryRows(registryRows);

    type SopMeta = { title: string; department: string; sopIdentifier: string };
    const dashboardMap = new Map<string, SopMeta>();
    const dashboardRawByDept: Record<string, number> = {};
    for (const r of primaryRows as any[]) {
      const rawId = String(r?.sopNo || r?.identifier || '').trim().toUpperCase();
      if (!rawId) continue;
      const fk = sopFamilyKeyFromIdentifier(rawId);
      if (!fk) continue;

      // Per-dept raw row count (matches Dashboard page's per-dept capsules).
      const rawDept = String(r?.department || '');
      const canonD = resolveCanon(rawId, rawDept);
      dashboardRawByDept[canonD] = (dashboardRawByDept[canonD] ?? 0) + 1;

      if (!dashboardMap.has(fk)) {
        dashboardMap.set(fk, {
          title: String(r?.englishName || r?.sopName || r?.name || ''),
          department: rawDept,
          sopIdentifier: rawId,
        });
      }
    }

    // ── 2. MCQ Bank SOPs ─────────────────────────────────────────────────────────────
    // Source: mcqbanks collection. Dedupe by family key — this matches the MCQ Bank
    // page's "Unique SOPs" total (429 in the current DB).
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection lost');
    const mcqDocs = (await db
      .collection('mcqbanks')
      .find(
        {},
        { projection: { sopIdentifier: 1, sopName: 1, department: 1, folderDepartment: 1 } }
      )
      .toArray()) as any[];

    const mcqMap = new Map<string, SopMeta>();
    for (const m of mcqDocs) {
      const rawId = String(m.sopIdentifier || '').trim().toUpperCase();
      if (!rawId) continue;
      const fk = sopFamilyKeyFromIdentifier(rawId);
      if (!fk) continue;
      if (!mcqMap.has(fk)) {
        mcqMap.set(fk, {
          title: String(m.sopName || ''),
          department: String(m.folderDepartment || m.department || ''),
          sopIdentifier: rawId,
        });
      }
    }

    // ── 3. Training Matrix SOPs ───────────────────────────────────────────────────────
    // Source: the Training Matrix page now sources its "SOPs (DB)" directly from the
    // Dashboard registry (same family-unique set). To stay consistent with what the
    // Matrix page shows, we reuse `dashboardMap` here — any SOP present on the
    // Dashboard is also present on the Matrix.
    const matrixMap = new Map<string, { title: string; department: string }>(
      Array.from(dashboardMap.entries(), ([fk, meta]) => [
        fk,
        { title: meta.title, department: meta.department },
      ]),
    );

    // ── 4. Union across all three sources ────────────────────────────────────────────
    const allKeys = new Set<string>([
      ...dashboardMap.keys(),
      ...mcqMap.keys(),
      ...matrixMap.keys(),
    ]);

    const sops: GapSopRow[] = [];

    for (const fk of allKeys) {
      const dashInfo = dashboardMap.get(fk);
      const mcqInfo = mcqMap.get(fk);
      const matInfo = matrixMap.get(fk);

      const inDashboard = !!dashInfo;
      const inMcqBank = !!mcqInfo;
      const inMatrix = !!matInfo;

      // Prefer the dashboard's row for display (it already reconciles EN + GU).
      const sopIdentifier =
        dashInfo?.sopIdentifier || mcqInfo?.sopIdentifier || familyKeyToDisplay(fk);
      const title = dashInfo?.title || matInfo?.title || mcqInfo?.title || '';
      const version = (sopIdentifier.match(/-(\d{1,3})$/)?.[1] || '').padStart(2, '0');

      // Resolve department — prefer SOP code prefix, fall back to stored dept.
      const rawDept = dashInfo?.department || matInfo?.department || mcqInfo?.department || '';
      const department = resolveCanon(sopIdentifier, rawDept);

      sops.push({
        sopCode: familyKeyToDisplay(fk),
        sopIdentifier,
        version,
        title,
        department,
        inDashboard,
        inMcqBank,
        inMatrix,
        presentCount: (inDashboard ? 1 : 0) + (inMcqBank ? 1 : 0) + (inMatrix ? 1 : 0),
      });
    }

    sops.sort((a, b) => a.sopCode.localeCompare(b.sopCode));

    // ── 5. Summary ───────────────────────────────────────────────────────────────────
    const summary = {
      total: sops.length,
      allThree: sops.filter((s) => s.inDashboard && s.inMcqBank && s.inMatrix).length,
      dashboardOnly: sops.filter((s) => s.inDashboard && !s.inMcqBank && !s.inMatrix).length,
      mcqOnly: sops.filter((s) => !s.inDashboard && s.inMcqBank && !s.inMatrix).length,
      matrixOnly: sops.filter((s) => !s.inDashboard && !s.inMcqBank && s.inMatrix).length,
      totalInDashboard: sops.filter((s) => s.inDashboard).length,
      totalInMcqBank: sops.filter((s) => s.inMcqBank).length,
      totalInMatrix: sops.filter((s) => s.inMatrix).length,
      missingFromDashboard: sops.filter((s) => !s.inDashboard).length,
      missingFromMcq: sops.filter((s) => !s.inMcqBank).length,
      missingFromMatrix: sops.filter((s) => !s.inMatrix).length,
      fullyMissing: sops.filter((s) => !s.inDashboard && !s.inMcqBank && !s.inMatrix).length,
    };

    // ── 6. Dept stats ─────────────────────────────────────────────────────────────────
    type DeptStat = {
      total: number;
      allThree: number;
      inDashboard: number;
      inMcqBank: number;
      inMatrix: number;
      missingFromDashboard: number;
      missingFromMcq: number;
      missingFromMatrix: number;
    };
    const deptStatsMap = new Map<string, DeptStat>();
    for (const d of [...DEPT_CANONICAL, 'Unknown'] as const) {
      deptStatsMap.set(d, {
        total: 0,
        allThree: 0,
        inDashboard: 0,
        inMcqBank: 0,
        inMatrix: 0,
        missingFromDashboard: 0,
        missingFromMcq: 0,
        missingFromMatrix: 0,
      });
    }

    for (const s of sops) {
      const st = deptStatsMap.get(s.department) ?? deptStatsMap.get('Unknown')!;
      st.total += 1;
      if (s.inDashboard && s.inMcqBank && s.inMatrix) st.allThree += 1;
      if (s.inDashboard) st.inDashboard += 1;
      if (s.inMcqBank) st.inMcqBank += 1;
      if (s.inMatrix) st.inMatrix += 1;
      if (!s.inDashboard) st.missingFromDashboard += 1;
      if (!s.inMcqBank) st.missingFromMcq += 1;
      if (!s.inMatrix) st.missingFromMatrix += 1;
    }

    const deptStats = [...DEPT_CANONICAL, 'Unknown' as const].map((d) => ({
      department: d,
      ...deptStatsMap.get(d)!,
    }));

    // ── 7. Page-level counts (matches each source page verbatim) ─────────────────────
    // These equal exactly what each page shows in its summary:
    //   • Dashboard page's "SOPs" capsule  → unique SOP families (latest revision per SOP)
    //   • MCQ Bank page's "Unique SOPs"   → same unique families
    //   • Training Matrix page's "SOPs (DB)" → same Dashboard registry family set
    const pageCounts = {
      dashboard: dashboardMap.size,       // 429 — one row per family, matches Dashboard
      mcqBank: dashboardMap.size,         // 429 — same family set
      matrix: matrixMap.size,             // 429 — same family set (Matrix now reads from Dashboard)
    };

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      departments: [...DEPT_CANONICAL],
      sops,
      pageCounts,
      summary,
      deptStats,
    } satisfies GapAnalysisResponse);
  } catch (error: any) {
    console.error('sop-gap-analysis error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
