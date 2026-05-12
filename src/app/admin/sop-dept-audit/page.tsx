'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { ChevronDown, ChevronUp, ClipboardList, RefreshCw, Search, ShieldAlert } from 'lucide-react';

type CanonDept = 'QA' | 'QC' | 'Microbiology' | 'Production' | 'Store' | 'Engineering' | 'Personnel';

type DeptStat = {
  department: CanonDept;
  sopLibraryUnique: number;
  sopDocs: number;
  sopDocsObsolete: number;
  mcqBanksUnique: number;
  mcqBanksObsoleteUnique: number;
};

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

type ObsoleteMcqRow = {
  sopCode: string;
  sopIdentifier: string;
  sopName: string;
  department: string;
  folderDepartment?: string;
  obsoleteAt?: string;
  obsoleteReason?: string;
};

type AuditData = {
  success: boolean;
  generatedAt: string;
  departments: CanonDept[];
  deptStats: DeptStat[];
  sops: SopRow[];
  obsoleteMcqBanks: ObsoleteMcqRow[];
};

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-gray-700">{title}</div>
      <div className="mt-2 text-3xl font-extrabold text-gray-900">{value}</div>
      {subtitle && <div className="mt-1 text-xs text-gray-500">{subtitle}</div>}
    </div>
  );
}

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
      className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
      style={
        active
          ? { background: '#a855f7', color: '#fff' }
          : { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }
      }
    >
      <span className="inline-flex items-center gap-2">
        <span>{label}</span>
        {typeof count === 'number' && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-extrabold"
            style={
              active
                ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                : { background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb' }
            }
          >
            {count}
          </span>
        )}
      </span>
    </button>
  );
}

type SortDir = 'asc' | 'desc';
type SopSortKey = 'sopCode' | 'version' | 'title' | 'deptLibrary' | 'deptDashboard' | 'inSopCollection' | 'inMcqBank' | 'obsolete';
type ObsoleteSortKey = 'sopCode' | 'sopIdentifier' | 'sopName' | 'department' | 'folderDepartment' | 'obsoleteAt' | 'obsoleteReason';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronDown className="h-3.5 w-3.5 text-gray-300" />;
  return dir === 'asc'
    ? <ChevronUp className="h-3.5 w-3.5 text-gray-700" />
    : <ChevronDown className="h-3.5 w-3.5 text-gray-700" />;
}

export default function SopDeptAuditPage() {
  useAuthGuard({ allowedRoles: ['admin', 'qa-head'] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<AuditData | null>(null);

  const [dept, setDept] = useState<'All' | CanonDept | 'Unknown'>('All');
  const [q, setQ] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'obsolete'>('all');
  const [sopSort, setSopSort] = useState<{ key: SopSortKey; dir: SortDir }>({ key: 'sopCode', dir: 'asc' });
  const [obsoleteSort, setObsoleteSort] = useState<{ key: ObsoleteSortKey; dir: SortDir }>({ key: 'sopCode', dir: 'asc' });

  const fetchData = async () => {
    try {
      const res = await fetch('/api/admin/sop-dept-audit', { cache: 'no-store' });
      const json = (await res.json()) as AuditData;
      if (json?.success) setData(json);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overall = useMemo(() => {
    const stats = data?.deptStats || [];
    return {
      sopLibraryUnique: stats.reduce((s, d) => s + (d.sopLibraryUnique || 0), 0),
      sopDocs: stats.reduce((s, d) => s + (d.sopDocs || 0), 0),
      mcqBanksUnique: stats.reduce((s, d) => s + (d.mcqBanksUnique || 0), 0),
      mcqBanksObsoleteUnique: stats.reduce((s, d) => s + (d.mcqBanksObsoleteUnique || 0), 0),
    };
  }, [data]);

  const deptCountsForPills = useMemo(() => {
    const counts: Record<string, number> = { All: 0, Unknown: 0 };
    for (const d of (data?.departments || [])) counts[d] = 0;
    for (const r of (data?.sops || [])) {
      const dd = (r as any).deptDashboard || 'Unknown';
      counts.All += 1;
      if (dd in counts) counts[dd] += 1;
      else counts.Unknown += 1;
    }
    return counts;
  }, [data]);

  const filteredSops = useMemo(() => {
    const rows = data?.sops || [];
    const term = q.trim().toLowerCase();
    const filtered = rows
      .filter((r) => (dept === 'All' ? true : r.deptDashboard === dept))
      .filter((r) => {
        if (!term) return true;
        return (
          r.sopCode.toLowerCase().includes(term) ||
          (r.title || '').toLowerCase().includes(term) ||
          String(r.deptDashboard || '').toLowerCase().includes(term) ||
          String(r.deptLibrary || '').toLowerCase().includes(term)
        );
      });
    const dirMult = sopSort.dir === 'asc' ? 1 : -1;
    const key = sopSort.key;
    const boolScore = (v: boolean) => (v ? 1 : 0);
    return [...filtered].sort((a, b) => {
      let av: any;
      let bv: any;
      switch (key) {
        case 'sopCode':
          av = a.sopCode; bv = b.sopCode; break;
        case 'version':
          av = a.version || ''; bv = b.version || ''; break;
        case 'title':
          av = a.title || ''; bv = b.title || ''; break;
        case 'deptLibrary':
          av = String(a.deptLibrary || ''); bv = String(b.deptLibrary || ''); break;
        case 'deptDashboard':
          av = String(a.deptDashboard || ''); bv = String(b.deptDashboard || ''); break;
        case 'inSopCollection':
          av = boolScore(a.inSopCollection); bv = boolScore(b.inSopCollection); break;
        case 'inMcqBank':
          av = boolScore(a.inMcqBank); bv = boolScore(b.inMcqBank); break;
        case 'obsolete':
          av = boolScore(a.isObsoleteInMcqBank || a.isObsoleteInSop);
          bv = boolScore(b.isObsoleteInMcqBank || b.isObsoleteInSop);
          break;
        default:
          av = a.sopCode; bv = b.sopCode;
      }
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dirMult;
      return String(av).localeCompare(String(bv)) * dirMult;
    });
  }, [data, dept, q, sopSort]);

  const sortedObsolete = useMemo(() => {
    const rows = data?.obsoleteMcqBanks || [];
    const dirMult = obsoleteSort.dir === 'asc' ? 1 : -1;
    const key = obsoleteSort.key;
    const dateVal = (s?: string) => (s ? new Date(s).getTime() : 0);
    return [...rows].sort((a, b) => {
      let av: any;
      let bv: any;
      switch (key) {
        case 'sopCode':
          av = a.sopCode; bv = b.sopCode; break;
        case 'sopIdentifier':
          av = a.sopIdentifier; bv = b.sopIdentifier; break;
        case 'sopName':
          av = a.sopName || ''; bv = b.sopName || ''; break;
        case 'department':
          av = a.department || ''; bv = b.department || ''; break;
        case 'folderDepartment':
          av = a.folderDepartment || ''; bv = b.folderDepartment || ''; break;
        case 'obsoleteAt':
          av = dateVal(a.obsoleteAt); bv = dateVal(b.obsoleteAt); break;
        case 'obsoleteReason':
          av = a.obsoleteReason || ''; bv = b.obsoleteReason || ''; break;
        default:
          av = a.sopCode; bv = b.sopCode;
      }
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dirMult;
      return String(av).localeCompare(String(bv)) * dirMult;
    });
  }, [data, obsoleteSort]);

  const totalSops = data?.sops?.length || 0;
  const shownSops = filteredSops.length;
  const totalObsolete = data?.obsoleteMcqBanks?.length || 0;
  const shownObsolete = sortedObsolete.length;

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
        <div className="mx-auto max-w-7xl">
          <div className="animate-pulse rounded-2xl border border-gray-200 bg-white p-6">Loading…</div>
        </div>
      </div>
    );
  }

  const depts = data?.departments || [];

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="SOP Department Audit"
          subtitle="Compare department-wise counts across SOPLibrary, SOP, and MCQBank. Includes Obsolete (Absolute) SOPs from MCQBank."
          icon={ClipboardList}
        />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-600">
            Generated at: <span className="font-semibold text-gray-900">{data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              fetchData();
            }}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard title="SOPs (SOPLibrary unique base)" value={overall.sopLibraryUnique} subtitle="Authoritative department mapping (departmentCode/department)" />
          <StatCard title="SOPs (SOP documents unique base)" value={overall.sopDocs} subtitle="What’s actually uploaded/ingested in SOP collection" />
          <StatCard title="SOPs (MCQBank unique base)" value={overall.mcqBanksUnique} subtitle="SOPs that have MCQ banks generated" />
          <StatCard title="Obsolete SOPs (MCQBank unique)" value={overall.mcqBanksObsoleteUnique} subtitle="Your 'absolute/obsolete' set currently tracked in MCQBank" />
        </div>

        {/* Department counts comparison */}
        <div className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <div className="text-lg font-bold text-gray-900">Department-wise Counts (Compare Sources)</div>
            <div className="mt-1 text-xs text-gray-500">Use this to identify which source is drifting for a given department.</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 font-semibold text-gray-700">Department</th>
                  <th className="px-6 py-3 font-semibold text-gray-700">Dashboard SOPs</th>
                  <th className="px-6 py-3 font-semibold text-gray-700">SOPLibrary (unique)</th>
                  <th className="px-6 py-3 font-semibold text-gray-700">SOP Docs (unique)</th>
                  <th className="px-6 py-3 font-semibold text-gray-700">MCQBank (unique)</th>
                  <th className="px-6 py-3 font-semibold text-gray-700">MCQBank Obsolete (unique)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.deptStats || []).map((r) => (
                  <tr key={r.department} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-semibold text-gray-900">{r.department}</td>
                    <td className="px-6 py-3 text-gray-800">{deptCountsForPills[r.department] ?? 0}</td>
                    <td className="px-6 py-3 text-gray-800">{r.sopLibraryUnique}</td>
                    <td className="px-6 py-3 text-gray-800">{r.sopDocs}</td>
                    <td className="px-6 py-3 text-gray-800">{r.mcqBanksUnique}</td>
                    <td className="px-6 py-3 text-gray-800">{r.mcqBanksObsoleteUnique}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex items-center gap-2">
          <Pill active={activeTab === 'all'} label="All SOPs (Dept Map)" onClick={() => setActiveTab('all')} />
          <Pill active={activeTab === 'obsolete'} label="Obsolete (Absolute) SOPs" onClick={() => setActiveTab('obsolete')} />
        </div>

        {activeTab === 'all' ? (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
              <div>
                <div className="text-lg font-bold text-gray-900">SOP → Department (Authoritative)</div>
                <div className="mt-1 text-xs text-gray-500">
                  Departments come from `SOPLibrary.departmentCode` (fallback `SOPLibrary.department`).
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  Showing <span className="font-semibold text-gray-900">{shownSops}</span> of{' '}
                  <span className="font-semibold text-gray-900">{totalSops}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <Pill active={dept === 'All'} label="All" count={deptCountsForPills.All} onClick={() => setDept('All')} />
                  {depts.map((d) => (
                    <Pill
                      key={d}
                      active={dept === d}
                      label={d}
                      count={deptCountsForPills[d] ?? 0}
                      onClick={() => setDept(d)}
                    />
                  ))}
                  <Pill active={dept === 'Unknown'} label="Unknown" count={deptCountsForPills.Unknown} onClick={() => setDept('Unknown')} />
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search SOP code / title…"
                    className="w-[260px] rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-purple-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 80 }}>
                      Sr No.
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 140 }}>
                      <button
                        type="button"
                        onClick={() => setSopSort((p) => ({ key: 'sopCode', dir: p.key === 'sopCode' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'asc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        SOP Code <SortIcon active={sopSort.key === 'sopCode'} dir={sopSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 110 }}>
                      <button
                        type="button"
                        onClick={() => setSopSort((p) => ({ key: 'version', dir: p.key === 'version' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'desc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        Version <SortIcon active={sopSort.key === 'version'} dir={sopSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700">
                      <button
                        type="button"
                        onClick={() => setSopSort((p) => ({ key: 'title', dir: p.key === 'title' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'asc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        Title <SortIcon active={sopSort.key === 'title'} dir={sopSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 160 }}>
                      <button
                        type="button"
                        onClick={() => setSopSort((p) => ({ key: 'deptLibrary', dir: p.key === 'deptLibrary' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'asc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        Dept (Library) <SortIcon active={sopSort.key === 'deptLibrary'} dir={sopSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 170 }}>
                      <button
                        type="button"
                        onClick={() => setSopSort((p) => ({ key: 'deptDashboard', dir: p.key === 'deptDashboard' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'asc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        Dept (Dashboard) <SortIcon active={sopSort.key === 'deptDashboard'} dir={sopSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 120 }}>
                      <button
                        type="button"
                        onClick={() => setSopSort((p) => ({ key: 'inSopCollection', dir: p.key === 'inSopCollection' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'desc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        In SOP <SortIcon active={sopSort.key === 'inSopCollection'} dir={sopSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 140 }}>
                      <button
                        type="button"
                        onClick={() => setSopSort((p) => ({ key: 'inMcqBank', dir: p.key === 'inMcqBank' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'desc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        In MCQBank <SortIcon active={sopSort.key === 'inMcqBank'} dir={sopSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 140 }}>
                      <button
                        type="button"
                        onClick={() => setSopSort((p) => ({ key: 'obsolete', dir: p.key === 'obsolete' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'desc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        Obsolete? <SortIcon active={sopSort.key === 'obsolete'} dir={sopSort.dir} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSops.map((r, idx) => (
                    <tr key={r.sopCode} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{idx + 1}</td>
                      <td className="px-6 py-3 font-mono font-semibold text-purple-700">{r.sopCode}</td>
                      <td className="px-6 py-3 font-mono font-semibold text-gray-700">{r.version || '—'}</td>
                      <td className="px-6 py-3 text-gray-800">{r.title || '—'}</td>
                      <td className="px-6 py-3">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-800">
                          {r.deptLibrary}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-800">
                          {r.deptDashboard}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${r.inSopCollection ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                          {r.inSopCollection ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${r.inMcqBank ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-700'}`}>
                          {r.inMcqBank ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${(r.isObsoleteInMcqBank || r.isObsoleteInSop) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                          {(r.isObsoleteInMcqBank || r.isObsoleteInSop) ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredSops.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-10 text-center text-sm text-gray-500">
                        No SOPs match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-red-100 p-2">
                  <ShieldAlert className="h-5 w-5 text-red-700" />
                </div>
                <div>
                  <div className="text-lg font-bold text-gray-900">Obsolete (Absolute) SOPs</div>
                  <div className="mt-1 text-xs text-gray-500">
                    This list comes from `MCQBank.isObsolete` (as you mentioned the absolute data is currently in MCQ Bank).
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-600">
                Showing <span className="font-semibold text-gray-900">{shownObsolete}</span> of{' '}
                <span className="font-semibold text-gray-900">{totalObsolete}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 80 }}>
                      Sr No.
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 140 }}>
                      <button
                        type="button"
                        onClick={() => setObsoleteSort((p) => ({ key: 'sopCode', dir: p.key === 'sopCode' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'asc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        Base Code <SortIcon active={obsoleteSort.key === 'sopCode'} dir={obsoleteSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 160 }}>
                      <button
                        type="button"
                        onClick={() => setObsoleteSort((p) => ({ key: 'sopIdentifier', dir: p.key === 'sopIdentifier' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'asc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        Identifier <SortIcon active={obsoleteSort.key === 'sopIdentifier'} dir={obsoleteSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700">
                      <button
                        type="button"
                        onClick={() => setObsoleteSort((p) => ({ key: 'sopName', dir: p.key === 'sopName' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'asc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        SOP Name <SortIcon active={obsoleteSort.key === 'sopName'} dir={obsoleteSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 180 }}>
                      <button
                        type="button"
                        onClick={() => setObsoleteSort((p) => ({ key: 'department', dir: p.key === 'department' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'asc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        Department (MCQ) <SortIcon active={obsoleteSort.key === 'department'} dir={obsoleteSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 180 }}>
                      <button
                        type="button"
                        onClick={() => setObsoleteSort((p) => ({ key: 'folderDepartment', dir: p.key === 'folderDepartment' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'asc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        Folder Dept <SortIcon active={obsoleteSort.key === 'folderDepartment'} dir={obsoleteSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700" style={{ width: 190 }}>
                      <button
                        type="button"
                        onClick={() => setObsoleteSort((p) => ({ key: 'obsoleteAt', dir: p.key === 'obsoleteAt' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'desc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        Obsolete At <SortIcon active={obsoleteSort.key === 'obsoleteAt'} dir={obsoleteSort.dir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 font-semibold text-gray-700">
                      <button
                        type="button"
                        onClick={() => setObsoleteSort((p) => ({ key: 'obsoleteReason', dir: p.key === 'obsoleteReason' ? (p.dir === 'asc' ? 'desc' : 'asc') : 'asc' }))}
                        className="inline-flex items-center gap-1.5 hover:text-gray-900"
                      >
                        Reason <SortIcon active={obsoleteSort.key === 'obsoleteReason'} dir={obsoleteSort.dir} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedObsolete.map((r, idx) => (
                    <tr key={`${r.sopIdentifier}-${r.obsoleteAt || ''}`} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{idx + 1}</td>
                      <td className="px-6 py-3 font-mono font-semibold text-red-700">{r.sopCode}</td>
                      <td className="px-6 py-3 font-mono text-gray-800">{r.sopIdentifier}</td>
                      <td className="px-6 py-3 text-gray-800">{r.sopName || '—'}</td>
                      <td className="px-6 py-3 text-gray-800">{r.department || '—'}</td>
                      <td className="px-6 py-3 text-gray-800">{r.folderDepartment || '—'}</td>
                      <td className="px-6 py-3 text-gray-800">{r.obsoleteAt ? new Date(r.obsoleteAt).toLocaleString() : '—'}</td>
                      <td className="px-6 py-3 text-gray-800">{r.obsoleteReason || '—'}</td>
                    </tr>
                  ))}
                  {(data?.obsoleteMcqBanks || []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-500">
                        No obsolete SOPs found in MCQBank.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

