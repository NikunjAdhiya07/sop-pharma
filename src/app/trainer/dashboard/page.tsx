'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

import { useState, useEffect, useCallback } from 'react';
import {
  Award, Users, BookOpen, CheckCircle2, Clock, XCircle, AlertTriangle,
  PlayCircle, RotateCcw, ChevronRight, RefreshCw, BarChart3, Target,
  TrendingUp, Activity, Search, Calendar, Loader2, UserCheck, ClipboardCheck, ThumbsUp
} from 'lucide-react';

interface MatrixRecord {
  _id: string;
  employeeName: string;
  department: string;
  sopIdentifier: string;
  sopName?: string;
  trainerName?: string;
  scheduledWeek?: string;
  status: string;
  passStatus: string;
  score?: number;
  testSessionId?: string;
  trainingDate: string;
  attemptCount: number;
  retestRequired: boolean;
  acknowledgedAt?: string;
}

interface Stats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  passed: number;
  failed: number;
  retests: number;
  passRate: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function TrainerDashboard() {
  useAuthGuard({ allowedRoles: ['admin', 'trainer', 'qa-head'] });
  // Trainer identity (read from localStorage, same as rest of app)
  const [trainerName, setTrainerName] = useState<string>('');
  const [records, setRecords] = useState<MatrixRecord[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, inProgress: 0, completed: 0, passed: 0, failed: 0, retests: 0, passRate: 0 });
  const [filters, setFilters] = useState({ sops: [] as string[], departments: [] as string[], months: [] as string[] });
  const [sel, setSel] = useState({ status: 'all', sop: 'all', department: 'all', month: 'all' });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'schedule' | 'results' | 'overview'>('schedule');

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user?.name) setTrainerName(user.name);
    } catch { }
  }, []);

  const fetchData = useCallback(async () => {
    if (!trainerName) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ trainer: trainerName, ...sel });
      const res = await fetch(`/api/trainer/matrix-schedule?${params}`);
      const json = await res.json();
      if (json.success) {
        setRecords(json.records);
        setStats(json.stats);
        setFilters(json.filters);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [trainerName, sel]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const visible = records.filter(r =>
    r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
    r.sopIdentifier.toLowerCase().includes(search.toLowerCase())
  );

  const TABS = [
    { id: 'schedule', label: 'Exam Schedule', icon: Calendar },
    { id: 'results', label: 'Results', icon: BarChart3 },
    { id: 'overview', label: 'SOP Overview', icon: BookOpen },
  ] as const;

  // Group by SOP for overview tab
  const sopGroups = records.reduce((acc: any, r) => {
    if (!acc[r.sopIdentifier]) {
      acc[r.sopIdentifier] = { sopIdentifier: r.sopIdentifier, sopName: r.sopName, total: 0, passed: 0, failed: 0, pending: 0, retests: 0, employees: [] };
    }
    const g = acc[r.sopIdentifier];
    g.total++;
    if (r.passStatus === 'Pass') g.passed++;
    if (r.passStatus === 'Fail') g.failed++;
    if (r.status === 'Pending') g.pending++;
    if (r.retestRequired) g.retests++;
    g.employees.push(r.employeeName);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      {/* ── Hero Header ── */}
      <div className="relative border-b border-white/5 bg-gradient-to-r from-[#06021a] via-[#0b0718] to-[#06021a]">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/3 w-[500px] h-[200px] bg-purple-600/10 rounded-full blur-[80px]" />
        </div>
        <div className="relative max-w-[1400px] mx-auto px-8 py-7">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30 text-2xl font-black">
                {trainerName ? trainerName.charAt(0).toUpperCase() : '?'}
              </div>
              <div>
                <p className="text-[10px] font-black text-purple-400 uppercase tracking-[0.3em] mb-0.5">Trainer Control Panel</p>
                <h1 className="text-2xl font-black text-white tracking-tight">
                  {trainerName || 'Loading…'}
                </h1>
                <p className="text-slate-500 text-xs mt-0.5">Your assigned SOP training sessions & exam management</p>
              </div>
            </div>
            <button onClick={fetchData} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* KPI Row */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5 mt-6">
            {[
              { label: 'Total', value: stats.total, color: 'text-white' },
              { label: 'Pending', value: stats.pending, color: 'text-slate-400' },
              { label: 'In Progress', value: stats.inProgress, color: 'text-amber-400' },
              { label: 'Completed', value: stats.completed, color: 'text-teal-400' },
              { label: 'Passed', value: stats.passed, color: 'text-emerald-400' },
              { label: 'Failed', value: stats.failed, color: 'text-rose-400' },
              { label: 'Retests', value: stats.retests, color: 'text-orange-400' },
              { label: 'Pass Rate', value: `${stats.passRate}%`, color: stats.passRate >= 80 ? 'text-emerald-400' : stats.passRate >= 60 ? 'text-amber-400' : 'text-rose-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/[0.04] border border-white/[0.06] rounded-2xl px-3 py-3 text-center">
                <p className={`text-lg font-black ${color}`}>{value}</p>
                <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-6 space-y-5">

        {/* Tabs */}
        <div className="flex gap-1 bg-white/[0.03] p-1 rounded-2xl border border-white/5 w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                activeTab === id
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30'
                  : 'text-slate-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-wrap gap-4">
          {[
            { label: 'Status', value: sel.status, key: 'status', options: ['Pending', 'In Progress', 'Completed', 'Trained', 'Retest Required'] },
            { label: 'Department', value: sel.department, key: 'department', options: filters.departments },
            { label: 'SOP', value: sel.sop, key: 'sop', options: filters.sops },
            { label: 'Month', value: sel.month, key: 'month', options: filters.months },
          ].map(({ label, value, key, options }) => (
            <div key={key} className="space-y-1">
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{label}</label>
              <select
                value={value}
                onChange={e => setSel(s => ({ ...s, [key]: e.target.value }))}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
              >
                <option value="all">All</option>
                {options.map((o: string) => (
                  <option key={o} value={o}>
                    {key === 'month' ? (() => { const [y, m] = o.split('-'); return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`; })() : o}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Employee, SOP…"
                className="bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-white placeholder-slate-700 outline-none"
              />
            </div>
          </div>
        </div>

        {/* ── Tab: Exam Schedule ── */}
        {activeTab === 'schedule' && (
          <div className="bg-white/[0.025] border border-white/5 rounded-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{visible.length} Exams Assigned to You</span>
              {stats.retests > 0 && (
                <span className="flex items-center gap-1 px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full text-rose-400 text-[9px] font-black uppercase tracking-widest">
                  <AlertTriangle className="h-3 w-3" /> {stats.retests} Retests Outstanding
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    {['Employee', 'Department', 'SOP', 'Date / Week', 'Status', 'Score', 'Actions'].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left font-black text-[9px] uppercase tracking-[0.15em] text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-7 w-7 text-purple-500 animate-spin" />
                        <p className="text-slate-600 text-xs font-bold">Loading your schedule…</p>
                      </div>
                    </td></tr>
                  ) : visible.length === 0 ? (
                    <tr><td colSpan={7} className="py-16 text-center">
                      <p className="text-slate-600 font-bold">No records found.</p>
                      <p className="text-slate-700 text-[10px] mt-1">Your name must match the trainer name in the uploaded Excel matrix.</p>
                    </td></tr>
                  ) : visible.map(row => (
                    <tr key={row._id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center font-black text-sm shrink-0">
                            {row.employeeName.charAt(0)}
                          </div>
                          <span className="font-bold text-white text-xs">{row.employeeName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="px-2 py-1 bg-slate-800/50 rounded-lg text-slate-400 font-bold text-[9px] uppercase tracking-wider">
                          {row.department}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono font-black text-purple-400 text-[10px]">{row.sopIdentifier}</span>
                        {row.sopName && <p className="text-slate-600 text-[9px] mt-0.5 max-w-[150px] truncate">{row.sopName}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-slate-300 text-[10px] font-bold">
                          {new Date(row.trainingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        {row.scheduledWeek && <p className="text-slate-600 text-[9px]">{row.scheduledWeek}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <TrainerStatusPill row={row} />
                      </td>
                      <td className="px-5 py-4">
                        {row.score !== undefined ? (
                          <span className={`font-black text-xs ${row.score >= 80 ? 'text-emerald-400' : 'text-rose-400'}`}>{row.score}%</span>
                        ) : <span className="text-slate-700">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <TrainerActionCell row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab: Results ── */}
        {activeTab === 'results' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Pass Rate', value: `${stats.passRate}%`, sub: `${stats.passed} passed`, color: 'from-emerald-600/20 to-teal-600/20 border-emerald-500/20 text-emerald-400' },
                { label: 'Failed', value: stats.failed, sub: 'Need attention', color: 'from-rose-600/20 to-red-600/20 border-rose-500/20 text-rose-400' },
                { label: 'Retests Required', value: stats.retests, sub: 'Pending retest', color: 'from-amber-600/20 to-orange-600/20 border-amber-500/20 text-amber-400' },
                { label: 'Completed', value: stats.completed, sub: 'Tests done', color: 'from-indigo-600/20 to-purple-600/20 border-indigo-500/20 text-indigo-300' },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className={`bg-gradient-to-br ${color} border rounded-3xl p-6 space-y-1`}>
                  <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">{label}</p>
                  <p className="text-4xl font-black text-white">{value}</p>
                  <p className="text-[10px] text-white/40">{sub}</p>
                </div>
              ))}
            </div>

            <div className="bg-white/[0.025] border border-white/5 rounded-3xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Employee Results</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      {['Employee', 'SOP', 'Score', 'Status', 'Attempts', 'Acknowledged'].map(h => (
                        <th key={h} className="px-5 py-3 text-left font-black text-[9px] uppercase tracking-[0.15em] text-slate-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.filter(r => r.passStatus !== 'Not Taken').map(row => (
                      <tr key={row._id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="px-5 py-3 font-bold text-white">{row.employeeName}</td>
                        <td className="px-5 py-3 font-mono text-purple-400">{row.sopIdentifier}</td>
                        <td className="px-5 py-3">
                          <span className={`font-black ${row.score && row.score >= 80 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {row.score !== undefined ? `${row.score}%` : '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                            row.passStatus === 'Pass' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>{row.passStatus}</span>
                        </td>
                        <td className="px-5 py-3 text-center font-black text-slate-400">{row.attemptCount}</td>
                        <td className="px-5 py-3">
                          {row.acknowledgedAt ? (
                            <span className="flex items-center gap-1 text-teal-400 text-[9px] font-black">
                              <ClipboardCheck className="h-3 w-3" />
                              {new Date(row.acknowledgedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </span>
                          ) : <span className="text-slate-700 text-[9px]">—</span>}
                        </td>
                      </tr>
                    ))}
                    {records.filter(r => r.passStatus !== 'Not Taken').length === 0 && (
                      <tr><td colSpan={6} className="py-10 text-center text-slate-600 text-xs">No completed tests yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: SOP Overview ── */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Object.values(sopGroups).length === 0 ? (
              <div className="col-span-3 py-16 text-center text-slate-600">No SOPs assigned yet.</div>
            ) : Object.values(sopGroups).map((g: any) => {
              const passRate = g.total ? Math.round((g.passed / g.total) * 100) : 0;
              return (
                <div key={g.sopIdentifier} className="bg-white/[0.03] border border-white/5 rounded-3xl p-6 space-y-4 hover:border-purple-500/20 transition-all">
                  <div>
                    <span className="font-mono font-black text-purple-400 text-xs">{g.sopIdentifier}</span>
                    {g.sopName && <p className="text-slate-300 text-sm font-bold mt-0.5 line-clamp-2">{g.sopName}</p>}
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-500">Pass Rate</span>
                      <span className={`font-black ${passRate >= 80 ? 'text-emerald-400' : passRate >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>{passRate}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${passRate >= 80 ? 'bg-emerald-500' : passRate >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${passRate}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Total', value: g.total, color: 'text-white' },
                      { label: 'Passed', value: g.passed, color: 'text-emerald-400' },
                      { label: 'Failed', value: g.failed, color: 'text-rose-400' },
                      { label: 'Retest', value: g.retests, color: 'text-amber-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-white/[0.03] rounded-xl p-2 text-center">
                        <p className={`text-sm font-black ${color}`}>{value}</p>
                        <p className="text-[8px] text-slate-600 uppercase tracking-widest mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-600">
                    <span>{g.employees.length} employee{g.employees.length !== 1 ? 's' : ''}</span>
                    {g.pending > 0 && <span className="ml-2 text-amber-400 font-bold">· {g.pending} pending</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrainerStatusPill({ row }: { row: MatrixRecord }) {
  if (row.retestRequired) return (
    <span className="flex items-center gap-1 px-2 py-1 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[9px] font-black uppercase tracking-widest">
      <RotateCcw className="h-3 w-3" /> Retest
    </span>
  );
  if (row.passStatus === 'Pass') return (
    <span className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-[9px] font-black uppercase tracking-widest">
      <CheckCircle2 className="h-3 w-3" /> Passed
    </span>
  );
  if (row.passStatus === 'Fail') return (
    <span className="flex items-center gap-1 px-2 py-1 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[9px] font-black uppercase tracking-widest">
      <XCircle className="h-3 w-3" /> Failed
    </span>
  );
  if (row.status === 'In Progress') return (
    <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-[9px] font-black uppercase tracking-widest">
      <Activity className="h-3 w-3" /> In Progress
    </span>
  );
  if (row.status === 'Trained') return (
    <span className="flex items-center gap-1 px-2 py-1 bg-teal-500/10 border border-teal-500/20 rounded-xl text-teal-400 text-[9px] font-black uppercase tracking-widest">
      <UserCheck className="h-3 w-3" /> Trained
    </span>
  );
  return <span className="px-2 py-1 bg-slate-800/50 rounded-xl text-slate-500 text-[9px] font-black uppercase">Pending</span>;
}

function TrainerActionCell({ row }: { row: MatrixRecord }) {
  if (row.status === 'In Progress' && row.testSessionId) {
    return (
      <a href={`/training/test/${row.testSessionId}`}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all">
        <PlayCircle className="h-3 w-3" /> Monitor
      </a>
    );
  }
  if (row.retestRequired && row.testSessionId) {
    return (
      <a href={`/training/test/${row.testSessionId}`}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all">
        <RotateCcw className="h-3 w-3" /> Retest
      </a>
    );
  }
  if (row.passStatus === 'Pass' && !row.acknowledgedAt) {
    return (
      <span className="flex items-center gap-1 text-emerald-500 text-[9px] font-black uppercase tracking-widest">
        <ThumbsUp className="h-3 w-3" /> Ack Pending
      </span>
    );
  }
  return <span className="text-slate-700 text-[9px]">—</span>;
}
