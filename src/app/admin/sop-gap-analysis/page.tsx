'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type CanonDept =
  | 'QA'
  | 'QC'
  | 'Microbiology'
  | 'Production'
  | 'Store'
  | 'Engineering'
  | 'Personnel'
  | 'Unknown';

type GapSopRow = {
  sopCode: string;
  sopIdentifier: string;
  version: string;
  title: string;
  department: CanonDept;
  inDashboard: boolean;
  inMcqBank: boolean;
  inMatrix: boolean;
  presentCount: number;
};

type GapAnalysisResponse = {
  success: boolean;
  generatedAt: string;
  departments: string[];
  sops: GapSopRow[];
  pageCounts: {
    dashboard: number;
    mcqBank: number;
    matrix: number;
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
  };
  deptStats: Array<{
    department: string;
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

// ─── Sort helpers ─────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';
type SortKey =
  | 'sopCode'
  | 'title'
  | 'department'
  | 'inDashboard'
  | 'inMcqBank'
  | 'inMatrix'
  | 'presentCount';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronDown className="h-3 w-3 text-gray-300" />;
  return dir === 'asc' ? (
    <ChevronUp className="h-3 w-3 text-blue-600" />
  ) : (
    <ChevronDown className="h-3 w-3 text-blue-600" />
  );
}

// ─── Presence badge ────────────────────────────────────────────────────────────

function PresenceBadge({ present, label }: { present: boolean; label: string }) {
  return present ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-green-200">
      <CheckCircle2 className="h-3 w-3" />
      Present
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600 ring-1 ring-red-200">
      <XCircle className="h-3 w-3" />
      Missing
    </span>
  );
}

// ─── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ row }: { row: GapSopRow }) {
  const { inDashboard, inMcqBank, inMatrix } = row;
  if (inDashboard && inMcqBank && inMatrix)
    return (
      <span className="inline-block rounded-full bg-green-100 px-3 py-0.5 text-xs font-bold text-green-800">
        Complete
      </span>
    );
  if (!inDashboard && !inMcqBank && !inMatrix)
    return (
      <span className="inline-block rounded-full bg-gray-100 px-3 py-0.5 text-xs font-bold text-gray-600">
        Orphan
      </span>
    );
  const missing: string[] = [];
  if (!inDashboard) missing.push('Dashboard');
  if (!inMcqBank) missing.push('MCQ');
  if (!inMatrix) missing.push('Matrix');
  return (
    <span className="inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-800">
      Missing in {missing.join(' & ')}
    </span>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: 'green' | 'red' | 'amber' | 'blue' | 'gray';
}) {
  const colors = {
    green: 'border-green-200 bg-green-50 text-green-800',
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    gray: 'border-gray-200 bg-gray-50 text-gray-700',
  };
  const cls = colors[accent ?? 'gray'];
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${cls}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-3xl font-extrabold">{value}</div>
      {sub && <div className="mt-1 text-xs opacity-60">{sub}</div>}
    </div>
  );
}

// ─── Filter pill ───────────────────────────────────────────────────────────────

function Pill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
        active
          ? 'bg-blue-600 text-white shadow'
          : 'border border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
      {typeof count === 'number' && (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
            active ? 'bg-white/25 text-white' : 'bg-white text-gray-500 ring-1 ring-gray-200'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

type FilterMode =
  | 'all'
  | 'complete'
  | 'missingDashboard'
  | 'missingMcq'
  | 'missingMatrix'
  | 'incomplete';

export default function SopGapAnalysisPage() {
  useAuthGuard({ allowedRoles: ['admin', 'qa-head'] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<GapAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dept, setDept] = useState<string>('All');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [q, setQ] = useState('');

  // Sort
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'sopCode',
    dir: 'asc',
  });

  async function fetchData() {
    try {
      setError(null);
      const res = await fetch('/api/admin/sop-gap-analysis', { cache: 'no-store' });
      const json = (await res.json()) as GapAnalysisResponse;
      if (json?.success) setData(json);
      else setError('API returned success: false');
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    fetchData();
  }

  // ── Sorted + filtered rows ──────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    if (!data) return [];
    let rows = data.sops;

    // Department filter
    if (dept !== 'All') {
      rows = rows.filter((r) => r.department === dept);
    }

    // Mode filter
    if (filterMode === 'complete') rows = rows.filter((r) => r.inDashboard && r.inMcqBank && r.inMatrix);
    else if (filterMode === 'missingDashboard') rows = rows.filter((r) => !r.inDashboard);
    else if (filterMode === 'missingMcq') rows = rows.filter((r) => !r.inMcqBank);
    else if (filterMode === 'missingMatrix') rows = rows.filter((r) => !r.inMatrix);
    else if (filterMode === 'incomplete') rows = rows.filter((r) => !(r.inDashboard && r.inMcqBank && r.inMatrix));

    // Text search
    if (q.trim()) {
      const lq = q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.sopCode.toLowerCase().includes(lq) ||
          r.title.toLowerCase().includes(lq) ||
          r.department.toLowerCase().includes(lq)
      );
    }

    // Sort
    const k = sort.key;
    rows = [...rows].sort((a, b) => {
      let av: any = a[k];
      let bv: any = b[k];
      if (typeof av === 'boolean') av = av ? 1 : 0;
      if (typeof bv === 'boolean') bv = bv ? 1 : 0;
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [data, dept, filterMode, q, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  }

  // ── Dept pill counts ────────────────────────────────────────────────────────

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = { All: data?.sops.length ?? 0 };
    for (const s of data?.sops ?? []) {
      counts[s.department] = (counts[s.department] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  // ── CSV export ──────────────────────────────────────────────────────────────

  function exportCSV() {
    const rows = filteredRows;
    const header = 'SOP Code,SOP Identifier,Version,Title,Department,In Dashboard,In MCQ Bank,In Matrix,Present Count,Status';
    const lines = rows.map((r) => {
      const status = r.inDashboard && r.inMcqBank && r.inMatrix
        ? 'Complete'
        : !r.inDashboard && !r.inMcqBank && !r.inMatrix
        ? 'Orphan'
        : `Missing in ${[!r.inDashboard && 'Dashboard', !r.inMcqBank && 'MCQ', !r.inMatrix && 'Matrix'].filter(Boolean).join(' & ')}`;
      return [
        r.sopCode,
        r.sopIdentifier,
        r.version,
        `"${r.title.replace(/"/g, '""')}"`,
        r.department,
        r.inDashboard ? 'Yes' : 'No',
        r.inMcqBank ? 'Yes' : 'No',
        r.inMatrix ? 'Yes' : 'No',
        r.presentCount,
        `"${status}"`,
      ].join(',');
    });
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sop-gap-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const summary = data?.summary;

  const DEPTS = ['All', ...(data?.departments ?? []), 'Unknown'];

  const thCls =
    'select-none cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading SOP gap analysis…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-8 text-center shadow">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
          <h2 className="mb-1 text-base font-semibold text-red-800">Failed to load</h2>
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={handleRefresh}
            className="mt-4 rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-8">
      {/* ── Header ── */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">SOP Gap Analysis</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Cross-reference SOPs across Dashboard, MCQ Bank, and Training Matrix to find missing
            entries.
            {data?.generatedAt && (
              <span className="ml-2 text-gray-400">
                Generated: {new Date(data.generatedAt).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      {summary && (
        <>
          {/* Overall totals per source — these match each source page's displayed total */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Total Unique SOPs"
              value={summary.total}
              accent="blue"
              sub="Union across all sources"
            />
            <SummaryCard
              label="Dashboard SOPs"
              value={data?.pageCounts?.dashboard ?? summary.totalInDashboard}
              sub="Same as Dashboard page"
              accent="blue"
            />
            <SummaryCard
              label="MCQ Bank SOPs"
              value={data?.pageCounts?.mcqBank ?? summary.totalInMcqBank}
              sub="Same as MCQ Bank page"
              accent="blue"
            />
            <SummaryCard
              label="Matrix SOPs (DB)"
              value={data?.pageCounts?.matrix ?? summary.totalInMatrix}
              sub="Same as Training Matrix page"
              accent="blue"
            />
          </div>

          {/* Gap highlights */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Present in All Three"
              value={summary.allThree}
              sub="Dashboard + MCQ + Matrix"
              accent="green"
            />
            <SummaryCard
              label="Missing from Dashboard"
              value={summary.missingFromDashboard}
              sub="Exist in MCQ or Matrix only"
              accent="red"
            />
            <SummaryCard
              label="Missing from MCQ Bank"
              value={summary.missingFromMcq}
              sub="Exist elsewhere but not in MCQ"
              accent="red"
            />
            <SummaryCard
              label="Missing from Matrix"
              value={summary.missingFromMatrix}
              sub="Exist elsewhere but not in Matrix"
              accent="amber"
            />
          </div>
        </>
      )}

      {/* ── Department stats table ── */}
      {data?.deptStats && (
        <div className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-bold text-gray-800">Department-wise Breakdown</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Present = SOPs found in that source for the department &nbsp;|&nbsp; Missing = SOPs absent from that source
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th rowSpan={2} className="border-b border-r border-gray-200 px-4 py-3 text-left font-semibold uppercase tracking-wide align-bottom">
                    Department
                  </th>
                  <th rowSpan={2} className="border-b border-r border-gray-200 px-4 py-3 text-left font-semibold uppercase tracking-wide align-bottom">
                    Total
                  </th>
                  <th rowSpan={2} className="border-b border-r border-gray-200 px-4 py-3 text-left font-semibold uppercase tracking-wide align-bottom">
                    All Three ✓
                  </th>
                  <th colSpan={2} className="border-b border-gray-200 bg-blue-50 px-4 py-2 text-center font-bold text-blue-700 uppercase tracking-wide">
                    Dashboard
                  </th>
                  <th colSpan={2} className="border-b border-gray-200 bg-purple-50 px-4 py-2 text-center font-bold text-purple-700 uppercase tracking-wide">
                    MCQ Bank
                  </th>
                  <th colSpan={2} className="border-b border-gray-200 bg-teal-50 px-4 py-2 text-center font-bold text-teal-700 uppercase tracking-wide">
                    Training Matrix
                  </th>
                </tr>
                <tr>
                  <th className="border-b border-gray-200 bg-blue-50 px-4 py-2 text-center text-xs font-semibold text-blue-600">Present</th>
                  <th className="border-b border-r border-gray-200 bg-blue-50 px-4 py-2 text-center text-xs font-semibold text-red-500">Missing</th>
                  <th className="border-b border-gray-200 bg-purple-50 px-4 py-2 text-center text-xs font-semibold text-purple-600">Present</th>
                  <th className="border-b border-r border-gray-200 bg-purple-50 px-4 py-2 text-center text-xs font-semibold text-red-500">Missing</th>
                  <th className="border-b border-gray-200 bg-teal-50 px-4 py-2 text-center text-xs font-semibold text-teal-600">Present</th>
                  <th className="border-b border-gray-200 bg-teal-50 px-4 py-2 text-center text-xs font-semibold text-red-500">Missing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.deptStats
                  .filter((d) => d.total > 0)
                  .map((d) => (
                    <tr key={d.department} className="hover:bg-gray-50">
                      <td className="border-r border-gray-100 px-4 py-3 font-semibold text-gray-800">{d.department}</td>
                      <td className="border-r border-gray-100 px-4 py-3 font-bold text-gray-700">{d.total}</td>
                      <td className="border-r border-gray-100 px-4 py-3 text-center">
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">
                          {d.allThree}
                        </span>
                      </td>
                      {/* Dashboard */}
                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                          {d.inDashboard}
                        </span>
                      </td>
                      <td className="border-r border-gray-100 px-4 py-3 text-center">
                        {d.missingFromDashboard > 0 ? (
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                            {d.missingFromDashboard}
                          </span>
                        ) : (
                          <span className="text-xs text-green-500 font-semibold">✓ None</span>
                        )}
                      </td>
                      {/* MCQ Bank */}
                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-800">
                          {d.inMcqBank}
                        </span>
                      </td>
                      <td className="border-r border-gray-100 px-4 py-3 text-center">
                        {d.missingFromMcq > 0 ? (
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                            {d.missingFromMcq}
                          </span>
                        ) : (
                          <span className="text-xs text-green-500 font-semibold">✓ None</span>
                        )}
                      </td>
                      {/* Training Matrix */}
                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-800">
                          {d.inMatrix}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {d.missingFromMatrix > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                            {d.missingFromMatrix}
                          </span>
                        ) : (
                          <span className="text-xs text-green-500 font-semibold">✓ None</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
              {/* Totals footer */}
              {data.deptStats.filter((d) => d.total > 0).length > 1 && (() => {
                const rows = data.deptStats.filter((d) => d.total > 0);
                const tot = (fn: (d: typeof rows[0]) => number) => rows.reduce((s, d) => s + fn(d), 0);
                return (
                  <tfoot className="bg-gray-100 text-xs font-bold text-gray-700">
                    <tr>
                      <td className="border-r border-gray-200 px-4 py-3">Total</td>
                      <td className="border-r border-gray-200 px-4 py-3">{tot((d) => d.total)}</td>
                      <td className="border-r border-gray-200 px-4 py-3 text-center">
                        <span className="rounded-full bg-green-200 px-2.5 py-0.5 text-xs font-bold text-green-900">
                          {tot((d) => d.allThree)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full bg-blue-200 px-2.5 py-0.5 text-xs font-bold text-blue-900">{tot((d) => d.inDashboard)}</span>
                      </td>
                      <td className="border-r border-gray-200 px-4 py-3 text-center">
                        <span className="rounded-full bg-red-200 px-2.5 py-0.5 text-xs font-bold text-red-800">{tot((d) => d.missingFromDashboard)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full bg-purple-200 px-2.5 py-0.5 text-xs font-bold text-purple-900">{tot((d) => d.inMcqBank)}</span>
                      </td>
                      <td className="border-r border-gray-200 px-4 py-3 text-center">
                        <span className="rounded-full bg-red-200 px-2.5 py-0.5 text-xs font-bold text-red-800">{tot((d) => d.missingFromMcq)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full bg-teal-200 px-2.5 py-0.5 text-xs font-bold text-teal-900">{tot((d) => d.inMatrix)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-900">{tot((d) => d.missingFromMatrix)}</span>
                      </td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="mb-5 space-y-4">
        {/* Mode pills */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'All SOPs', summary?.total],
              ['complete', 'Complete (all 3)', summary?.allThree],
              ['incomplete', 'Incomplete', (summary?.total ?? 0) - (summary?.allThree ?? 0)],
              ['missingDashboard', 'Missing Dashboard', summary?.missingFromDashboard],
              ['missingMcq', 'Missing MCQ Bank', summary?.missingFromMcq],
              ['missingMatrix', 'Missing Matrix', summary?.missingFromMatrix],
            ] as [FilterMode, string, number | undefined][]
          ).map(([mode, label, count]) => (
            <Pill
              key={mode}
              active={filterMode === mode}
              label={label}
              count={count}
              onClick={() => setFilterMode(mode)}
            />
          ))}
        </div>

        {/* Dept pills */}
        <div className="flex flex-wrap gap-2">
          {DEPTS.map((d) => (
            <Pill
              key={d}
              active={dept === d}
              label={d}
              count={deptCounts[d] ?? 0}
              onClick={() => setDept(d)}
            />
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search SOP code or title…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {/* ── Main table ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-bold text-gray-800">
            SOP Detail View{' '}
            <span className="ml-1 font-normal text-gray-400">({filteredRows.length} rows)</span>
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {(
                  [
                    ['sopCode', 'SOP Code'],
                    ['title', 'Title'],
                    ['department', 'Department'],
                    ['inDashboard', 'Dashboard'],
                    ['inMcqBank', 'MCQ Bank'],
                    ['inMatrix', 'Matrix'],
                    ['presentCount', 'Coverage'],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th
                    key={key}
                    className={thCls}
                    onClick={() => toggleSort(key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <SortIcon active={sort.key === key} dir={sort.dir} />
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-gray-400">
                    No SOPs match the current filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.sopCode}
                    className={`hover:bg-gray-50 ${
                      !row.inDashboard || !row.inMcqBank || !row.inMatrix
                        ? 'bg-amber-50/40'
                        : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-blue-700">
                        {row.sopCode}
                      </span>
                      {row.version && (
                        <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                          v{row.version}
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-gray-700">
                      <span className="line-clamp-2">{row.title || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                        {row.department}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <PresenceBadge present={row.inDashboard} label="Dashboard" />
                    </td>
                    <td className="px-4 py-3">
                      <PresenceBadge present={row.inMcqBank} label="MCQ Bank" />
                    </td>
                    <td className="px-4 py-3">
                      <PresenceBadge present={row.inMatrix} label="Matrix" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className={`h-2 w-4 rounded-sm ${
                                i < row.presentCount ? 'bg-blue-500' : 'bg-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-gray-500">{row.presentCount}/3</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip row={row} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-400">
          Showing {filteredRows.length} of {data?.sops.length ?? 0} SOPs across Dashboard,
          MCQ&nbsp;Bank, and Training&nbsp;Matrix sources.
        </div>
      </div>
    </div>
  );
}
