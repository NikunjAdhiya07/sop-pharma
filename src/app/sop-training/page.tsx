'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, BookOpen, Calendar, Filter, CheckCircle2, Clock, AlertCircle,
  PlayCircle, BarChart3, FileText, Search, RefreshCw, ChevronRight,
  TrendingUp, Activity, Loader2, Award, UserCheck, XCircle, AlertTriangle,
  ClipboardCheck, ArrowUpRight, Target, ThumbsUp, RotateCcw, Upload,
  ChevronDown, Layers, CalendarRange, Zap, TrendingDown, Repeat
} from 'lucide-react';
import TrainingMatrixUploadModal from '@/components/TrainingMatrixUploadModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MatrixRecord {
  _id: string;
  employeeName: string;
  department: string;
  sopIdentifier: string;
  sopName?: string;
  trainerName?: string;
  scheduledWeek?: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Trained' | 'Retest Required';
  passStatus: 'Pass' | 'Fail' | 'Not Taken';
  score?: number;
  testSessionId?: string;
  trainingDate: string;
  attemptCount: number;
  retestRequired: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

interface TrainerStat {
  _id: { trainer: string; dept: string };
  total: number;
  completed: number;
  failed: number;
  pending: number;
  avgScore?: number;
  retests: number;
  acknowledged: number;
}

interface MonthStat {
  _id: { year: number; month: number; department: string };
  total: number;
  completed: number;
  failed: number;
  pending: number;
  retests: number;
}

interface SOPStat {
  _id: { sop: string; sopName?: string };
  total: number;
  passed: number;
  failed: number;
  avgScore?: number;
  trainer?: string;
}

interface DeptStat {
  _id: string;
  total: number;
  passed: number;
  failed: number;
  pending: number;
  retests: number;
}

type ActiveTab = 'matrix' | 'scheduler' | 'trainer-report' | 'month-view' | 'sop-report' | 'analytics';

interface SchedulerTrainerRow {
  trainer: string;
  department: string;
  sopCount: number;
  employeeCount: number;
  sopCodes: string[];
  pending: number;
  inProgress: number;
  completed: number;
  retestRequired: number;
  total: number;
}

interface SchedulerSOPRow {
  sopIdentifier: string;
  sopName?: string;
  trainer?: string;
  employeeCount: number;
  pending: number;
  inProgress: number;
  completed: number;
  total: number;
}

interface SchedulerTotals {
  trainers: number;
  sops: number;
  employees: number;
  pending: number;
  inProgress: number;
  completed: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtMonth(m: string) {
  if (!m || m === 'all') return 'All Months';
  const [y, mo] = m.split('-');
  return `${MONTH_NAMES[parseInt(mo) - 1]} ${y}`;
}

// ─── Acknowledge Modal ────────────────────────────────────────────────────────

function AcknowledgeModal({ record, onClose, onDone }: { record: MatrixRecord; onClose: () => void; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleAck = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/training/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrixId: record._id, acknowledgedBy: record.trainerName || 'Trainer' }),
      });
      if ((await res.json()).success) {
        setDone(true);
        setTimeout(() => { onDone(); onClose(); }, 1500);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0f0d1e] border border-emerald-500/20 rounded-3xl w-full max-w-md p-8 space-y-6 shadow-2xl shadow-emerald-500/10">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto">
            <ClipboardCheck className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-black text-white">SOP Training Acknowledgement</h2>
          <p className="text-sm text-gray-400">Confirm that you have completed the SOP training and understand its requirements.</p>
        </div>

        <div className="bg-white/5 rounded-2xl p-4 space-y-3 border border-white/10">
          <Row label="Employee" value={record.employeeName} />
          <Row label="SOP" value={`${record.sopIdentifier} — ${record.sopName || 'N/A'}`} />
          <Row label="Trainer" value={record.trainerName || 'N/A'} />
          <Row label="Score" value={`${record.score}%`} highlight />
          <Row label="Date" value={new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
        </div>

        <p className="text-[11px] text-gray-500 leading-relaxed text-center">
          By clicking <strong className="text-white">I Acknowledge</strong>, you confirm that you have received training on the above SOP and understand the procedure completely.
        </p>

        {done ? (
          <div className="flex items-center justify-center gap-2 py-4 text-emerald-400 font-bold">
            <CheckCircle2 className="h-5 w-5" /> Acknowledged Successfully!
          </div>
        ) : (
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
              Cancel
            </button>
            <button onClick={handleAck} disabled={loading} className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
              I Acknowledge
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className={`font-bold ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SOPTrainingPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('matrix');
  const [data, setData] = useState<MatrixRecord[]>([]);
  const [filters, setFilters] = useState({ departments: [] as string[], trainers: [] as string[], sops: [] as string[], months: [] as string[] });
  const [sel, setSel] = useState({ department: 'all', trainer: 'all', sop: 'all', month: 'all', status: 'all' });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [ackRecord, setAckRecord] = useState<MatrixRecord | null>(null);

  // Scheduler state
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerTrainers, setSchedulerTrainers] = useState<SchedulerTrainerRow[]>([]);
  const [schedulerSOPs, setSchedulerSOPs] = useState<SchedulerSOPRow[]>([]);
  const [schedulerTotals, setSchedulerTotals] = useState<SchedulerTotals>({ trainers: 0, sops: 0, employees: 0, pending: 0, inProgress: 0, completed: 0 });
  const [schedulerView, setSchedulerView] = useState<'trainer' | 'sop'>('trainer');
  const [schedulingRow, setSchedulingRow] = useState<string | null>(null);

  // Report state
  const [reportLoading, setReportLoading] = useState(false);
  const [trainerStats, setTrainerStats] = useState<TrainerStat[]>([]);
  const [monthStats, setMonthStats] = useState<MonthStat[]>([]);
  const [sopStats, setSopStats] = useState<SOPStat[]>([]);
  const [deptStats, setDeptStats] = useState<DeptStat[]>([]);

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(sel as any);
      const res = await fetch(`/api/training/matrix?${params}`);
      const json = await res.json();
      if (json.success) { setData(json.data); setFilters(json.filters); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [sel]);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams({ month: sel.month, department: sel.department });
      const res = await fetch(`/api/training/report?${params}`);
      const json = await res.json();
      if (json.success) {
        setTrainerStats(json.trainerReport);
        setMonthStats(json.monthReport);
        setSopStats(json.sopReport);
        setDeptStats(json.deptSummary);
      }
    } catch (e) { console.error(e); }
    finally { setReportLoading(false); }
  }, [sel.month, sel.department]);

  const fetchScheduler = useCallback(async () => {
    setSchedulerLoading(true);
    try {
      const params = new URLSearchParams({ month: sel.month, department: sel.department });
      const res = await fetch(`/api/training/scheduler?${params}`);
      const json = await res.json();
      if (json.success) {
        setSchedulerTrainers(json.trainerRows);
        setSchedulerSOPs(json.sopRows);
        setSchedulerTotals(json.totals);
      }
    } catch (e) { console.error(e); }
    finally { setSchedulerLoading(false); }
  }, [sel.month, sel.department]);

  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);
  useEffect(() => {
    if (activeTab === 'scheduler') fetchScheduler();
    else if (activeTab !== 'matrix') fetchReport();
  }, [activeTab, fetchReport, fetchScheduler]);

  const handleBulkAssign = async () => {
    const pending = data.filter(r => r.status === 'Pending').length;
    if (pending === 0) return alert('No pending records to schedule.');
    if (!confirm(`Schedule tests for ${pending} pending records?\nRecords without an MCQ bank will be skipped.`)) return;
    setScheduling(true);
    try {
      const res = await fetch('/api/training/scheduler/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionCount: 10, month: sel.month }),
      });
      const json = await res.json();
      alert(json.success ? json.message : json.error || 'Failed');
      if (json.success) fetchMatrix();
    } finally { setScheduling(false); }
  };

  const handleScheduleRow = async (filter: { trainer?: string; sopIdentifier?: string }) => {
    const key = filter.trainer || filter.sopIdentifier || 'row';
    setSchedulingRow(key);
    try {
      const res = await fetch('/api/training/scheduler/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...filter, questionCount: 10, month: sel.month === 'all' ? undefined : sel.month }),
      });
      const json = await res.json();
      alert(json.success ? json.message : json.error || 'Failed');
      if (json.success) { fetchMatrix(); fetchScheduler(); }
    } finally { setSchedulingRow(null); }
  };

  const visible = data.filter(r =>
    (r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
     r.sopIdentifier.toLowerCase().includes(search.toLowerCase()) ||
     (r.sopName || '').toLowerCase().includes(search.toLowerCase())) &&
    (sel.status === 'all' || r.status === sel.status || r.passStatus === sel.status)
  );

  const stats = {
    total: data.length,
    completed: data.filter(r => r.passStatus === 'Pass').length,
    inProgress: data.filter(r => r.status === 'In Progress').length,
    pending: data.filter(r => r.status === 'Pending').length,
    retests: data.filter(r => r.retestRequired).length,
    acknowledged: data.filter(r => r.acknowledgedAt).length,
    passRate: data.length ? Math.round((data.filter(r => r.passStatus === 'Pass').length / data.length) * 100) : 0,
  };

  const TABS = [
    { id: 'matrix', label: 'Training Matrix', icon: Layers },
    { id: 'scheduler', label: 'Scheduler', icon: CalendarRange },
    { id: 'trainer-report', label: 'Trainer Report', icon: Award },
    { id: 'month-view', label: 'Month View', icon: Calendar },
    { id: 'sop-report', label: 'SOP Analysis', icon: BarChart3 },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  ] as const;

  const FilterSelect = ({ label, value, onChange, options }: any) => (
    <div className="space-y-1.5">
      <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-black/50 border border-white/10 rounded-2xl px-4 py-2.5 text-xs font-bold text-white focus:ring-2 ring-indigo-500/50 outline-none appearance-none cursor-pointer"
      >
        <option value="all">All</option>
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#0a0118] via-[#0f0d1e] to-[#04011a] border-b border-white/5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[600px] h-[300px] bg-indigo-600/10 rounded-full blur-[100px]" />
          <div className="absolute top-0 right-1/4 w-[400px] h-[200px] bg-purple-600/10 rounded-full blur-[80px]" />
        </div>
        <div className="relative max-w-[1600px] mx-auto px-8 py-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/30">
                  <Target className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300">
                    SOP Training Matrix & Test Management
                  </h1>
                  <p className="text-slate-500 text-sm font-medium mt-0.5">
                    Monthly training matrix · Automated test allocation · Trainer tracking · Acknowledgements
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-teal-500/20"
              >
                <Upload className="h-4 w-4" /> Upload Matrix
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={scheduling || stats.pending === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-indigo-500/20 disabled:shadow-none"
              >
                {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                {scheduling ? 'Scheduling…' : `Schedule Tests (${stats.pending})`}
              </button>
              <button
                onClick={fetchMatrix}
                className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* ── KPI Strips ── */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-6">
            {[
              { label: 'Total', value: stats.total, color: 'text-white', bg: 'bg-white/5' },
              { label: 'Passed', value: stats.completed, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { label: 'In Progress', value: stats.inProgress, color: 'text-amber-400', bg: 'bg-amber-500/10' },
              { label: 'Pending', value: stats.pending, color: 'text-slate-400', bg: 'bg-white/5' },
              { label: 'Retests', value: stats.retests, color: 'text-rose-400', bg: 'bg-rose-500/10' },
              { label: 'Pass Rate', value: `${stats.passRate}%`, color: 'text-indigo-300', bg: 'bg-indigo-500/10' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`${bg} border border-white/5 rounded-2xl px-4 py-3 text-center`}>
                <p className={`text-xl font-black ${color}`}>{value}</p>
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-8 py-6 space-y-6">
        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-white/[0.03] p-1 rounded-2xl border border-white/5 w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                activeTab === id
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'text-slate-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: Training Matrix */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'matrix' && (
          <div className="space-y-5">
            {/* Filters */}
            <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-5">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <FilterSelect label="Department" value={sel.department} onChange={(v: string) => setSel(s => ({ ...s, department: v }))} options={filters.departments} />
                <FilterSelect label="Trainer" value={sel.trainer} onChange={(v: string) => setSel(s => ({ ...s, trainer: v }))} options={filters.trainers} />
                <FilterSelect label="SOP" value={sel.sop} onChange={(v: string) => setSel(s => ({ ...s, sop: v }))} options={filters.sops} />
                <FilterSelect
                  label="Month"
                  value={sel.month}
                  onChange={(v: string) => setSel(s => ({ ...s, month: v }))}
                  options={filters.months.map((m: string) => m)}
                />
                <FilterSelect
                  label="Status"
                  value={sel.status}
                  onChange={(v: string) => setSel(s => ({ ...s, status: v }))}
                  options={['Pending', 'In Progress', 'Completed', 'Trained', 'Retest Required', 'Pass', 'Fail']}
                />
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Name, SOP…"
                      className="w-full bg-black/50 border border-white/10 rounded-2xl pl-9 pr-3 py-2.5 text-xs font-bold text-white placeholder-slate-600 focus:ring-2 ring-indigo-500/50 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white/[0.025] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  {visible.length} Records
                </span>
                {stats.retests > 0 && (
                  <span className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full text-rose-400 text-[10px] font-black uppercase tracking-widest">
                    <AlertTriangle className="h-3 w-3" /> {stats.retests} Retest Required
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      {['Employee', 'Department', 'SOP', 'Trainer', 'Date', 'Status', 'Score', 'Attempts', 'Actions'].map(h => (
                        <th key={h} className="px-5 py-4 text-left font-black text-[9px] uppercase tracking-[0.2em] text-slate-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={9} className="px-5 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-8 w-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                          <p className="text-slate-600 font-bold text-xs">Loading matrix…</p>
                        </div>
                      </td></tr>
                    ) : visible.length === 0 ? (
                      <tr><td colSpan={9} className="px-5 py-16 text-center">
                        <p className="text-slate-600 font-bold">No records matching filters.</p>
                        <p className="text-slate-700 text-[10px] mt-1">Upload a training matrix to get started.</p>
                      </td></tr>
                    ) : visible.map(row => (
                      <tr key={row._id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group">
                        {/* Employee */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center font-black text-sm shadow-md shadow-indigo-500/20 shrink-0">
                              {row.employeeName.charAt(0)}
                            </div>
                            <span className="font-bold text-white text-xs group-hover:text-indigo-300 transition-colors leading-tight">
                              {row.employeeName}
                            </span>
                          </div>
                        </td>
                        {/* Dept */}
                        <td className="px-5 py-4">
                          <span className="px-2 py-1 bg-slate-800/50 rounded-lg text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                            {row.department}
                          </span>
                        </td>
                        {/* SOP */}
                        <td className="px-5 py-4">
                          <div>
                            <span className="font-mono font-black text-indigo-400 text-[10px]">{row.sopIdentifier}</span>
                            {row.sopName && <p className="text-slate-500 text-[10px] leading-tight mt-0.5 max-w-[140px] truncate">{row.sopName}</p>}
                          </div>
                        </td>
                        {/* Trainer */}
                        <td className="px-5 py-4">
                          <span className="text-slate-300 font-medium">{row.trainerName || '—'}</span>
                        </td>
                        {/* Date */}
                        <td className="px-5 py-4">
                          <div>
                            <p className="text-slate-300 font-bold text-[10px]">
                              {new Date(row.trainingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                            {row.scheduledWeek && <p className="text-slate-600 text-[9px] mt-0.5">{row.scheduledWeek}</p>}
                          </div>
                        </td>
                        {/* Status */}
                        <td className="px-5 py-4">
                          <StatusPill status={row.status} passStatus={row.passStatus} retestRequired={row.retestRequired} />
                        </td>
                        {/* Score */}
                        <td className="px-5 py-4">
                          {row.score !== undefined ? (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-14 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${row.score >= 80 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                  style={{ width: `${row.score}%` }}
                                />
                              </div>
                              <span className={`font-black text-[11px] ${row.score >= 80 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {row.score}%
                              </span>
                            </div>
                          ) : <span className="text-slate-700">—</span>}
                        </td>
                        {/* Attempts */}
                        <td className="px-5 py-4 text-center">
                          <span className={`font-black text-[11px] ${row.attemptCount > 1 ? 'text-amber-400' : 'text-slate-500'}`}>
                            {row.attemptCount || 0}
                          </span>
                        </td>
                        {/* Actions */}
                        <td className="px-5 py-4">
                          <ActionCell row={row} onAck={() => setAckRecord(row)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: Trainer Report */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'trainer-report' && (
          <div className="space-y-5">
            <ReportFilters sel={sel} setSel={setSel} filters={filters} />
            {reportLoading ? <ReportLoader /> : (
              trainerStats.length === 0
                ? <EmptyState msg="No trainer data available. Upload a training matrix first." />
                : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {trainerStats.map((t, i) => {
                      const passRate = t.total ? Math.round((t.completed / t.total) * 100) : 0;
                      return (
                        <div key={i} className="bg-white/[0.03] border border-white/5 rounded-3xl p-6 space-y-4 hover:border-indigo-500/20 transition-all group">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-black text-white text-base">{t._id.trainer || 'Unassigned'}</h3>
                              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">{t._id.dept}</p>
                            </div>
                            <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                              <Award className="h-5 w-5 text-indigo-400" />
                            </div>
                          </div>

                          {/* Pass rate bar */}
                          <div>
                            <div className="flex justify-between text-[10px] mb-1">
                              <span className="text-slate-500 font-bold">Pass Rate</span>
                              <span className={`font-black ${passRate >= 80 ? 'text-emerald-400' : passRate >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>{passRate}%</span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${passRate >= 80 ? 'bg-emerald-500' : passRate >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${passRate}%` }}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-2">
                            <StatMini label="Total" value={t.total} />
                            <StatMini label="Passed" value={t.completed} color="text-emerald-400" />
                            <StatMini label="Failed" value={t.failed} color="text-rose-400" />
                            <StatMini label="Retests" value={t.retests} color="text-amber-400" />
                          </div>

                          {t.avgScore !== undefined && t.avgScore !== null && (
                            <div className="pt-3 border-t border-white/5 flex justify-between text-[10px]">
                              <span className="text-slate-500 font-bold">Avg. Score</span>
                              <span className="font-black text-indigo-300">{Math.round(t.avgScore)}%</span>
                            </div>
                          )}
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500 font-bold">Acknowledged</span>
                            <span className="font-black text-teal-400">{t.acknowledged}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: Month View */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'month-view' && (
          <div className="space-y-5">
            <ReportFilters sel={sel} setSel={setSel} filters={filters} deptOnly />
            {reportLoading ? <ReportLoader /> : (
              <div className="space-y-6">
                {/* Dept Summary */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {deptStats.map((d, i) => (
                    <div key={i} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3">
                      <p className="font-black text-white text-sm truncate">{d._id}</p>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">Pass Rate</span>
                          <span className="font-black text-emerald-400">
                            {d.total ? Math.round((d.passed / d.total) * 100) : 0}%
                          </span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${d.total ? Math.round((d.passed / d.total) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div><p className="text-[9px] text-slate-600">Total</p><p className="text-xs font-black text-white">{d.total}</p></div>
                        <div><p className="text-[9px] text-slate-600">Pass</p><p className="text-xs font-black text-emerald-400">{d.passed}</p></div>
                        <div><p className="text-[9px] text-slate-600">Fail</p><p className="text-xs font-black text-rose-400">{d.failed}</p></div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Month Table */}
                <div className="bg-white/[0.025] border border-white/5 rounded-3xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Month-wise Training Status</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                          {['Month', 'Department', 'Total', 'Passed', 'Failed', 'Pending', 'Retests', 'Pass Rate'].map(h => (
                            <th key={h} className="px-5 py-3 text-left font-black text-[9px] uppercase tracking-[0.15em] text-slate-600">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {monthStats.length === 0 ? (
                          <tr><td colSpan={8} className="text-center py-10 text-slate-600">No data</td></tr>
                        ) : monthStats.map((m, i) => {
                          const pr = m.total ? Math.round((m.completed / m.total) * 100) : 0;
                          return (
                            <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                              <td className="px-5 py-3 font-black text-white">{MONTH_NAMES[m._id.month - 1]} {m._id.year}</td>
                              <td className="px-5 py-3 text-slate-400 font-bold">{m._id.department}</td>
                              <td className="px-5 py-3 text-white font-bold">{m.total}</td>
                              <td className="px-5 py-3 text-emerald-400 font-black">{m.completed}</td>
                              <td className="px-5 py-3 text-rose-400 font-black">{m.failed}</td>
                              <td className="px-5 py-3 text-slate-400 font-bold">{m.pending}</td>
                              <td className="px-5 py-3 text-amber-400 font-bold">{m.retests}</td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${pr >= 80 ? 'bg-emerald-500' : pr >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${pr}%` }} />
                                  </div>
                                  <span className={`font-black text-[11px] ${pr >= 80 ? 'text-emerald-400' : pr >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>{pr}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB 4: SOP Analysis */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'sop-report' && (
          <div className="space-y-5">
            <ReportFilters sel={sel} setSel={setSel} filters={filters} />
            {reportLoading ? <ReportLoader /> : (
              <div className="bg-white/[0.025] border border-white/5 rounded-3xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">SOP-wise Training Performance</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        {['SOP Code', 'SOP Name', 'Trainer', 'Trained', 'Passed', 'Failed', 'Avg Score', 'Pass Rate'].map(h => (
                          <th key={h} className="px-5 py-3 text-left font-black text-[9px] uppercase tracking-[0.15em] text-slate-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sopStats.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-10 text-slate-600">No data</td></tr>
                      ) : sopStats.map((s, i) => {
                        const pr = s.total ? Math.round((s.passed / s.total) * 100) : 0;
                        return (
                          <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                            <td className="px-5 py-3 font-mono font-black text-indigo-400">{s._id.sop}</td>
                            <td className="px-5 py-3 text-slate-300 max-w-[200px] truncate">{s._id.sopName || '—'}</td>
                            <td className="px-5 py-3 text-slate-400">{s.trainer || '—'}</td>
                            <td className="px-5 py-3 text-white font-bold">{s.total}</td>
                            <td className="px-5 py-3 text-emerald-400 font-black">{s.passed}</td>
                            <td className="px-5 py-3 text-rose-400 font-black">{s.failed}</td>
                            <td className="px-5 py-3 text-indigo-300 font-black">{s.avgScore !== undefined && s.avgScore !== null ? `${Math.round(s.avgScore)}%` : '—'}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${pr >= 80 ? 'bg-emerald-500' : pr >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${pr}%` }} />
                                </div>
                                <span className={`font-black text-[11px] ${pr >= 80 ? 'text-emerald-400' : pr >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>{pr}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB 5: Scheduler */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'scheduler' && (
          <div className="space-y-5">
            {/* Totals strip */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                { label: 'Trainers', value: schedulerTotals.trainers, color: 'text-indigo-300' },
                { label: 'Unique SOPs', value: schedulerTotals.sops, color: 'text-purple-300' },
                { label: 'Employees', value: schedulerTotals.employees, color: 'text-white' },
                { label: 'Pending', value: schedulerTotals.pending, color: 'text-amber-400' },
                { label: 'In Progress', value: schedulerTotals.inProgress, color: 'text-blue-400' },
                { label: 'Completed', value: schedulerTotals.completed, color: 'text-emerald-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white/[0.03] border border-white/5 rounded-2xl px-4 py-3 text-center">
                  <p className={`text-xl font-black ${color}`}>{value}</p>
                  <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* View toggle + filters */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/5">
                {(['trainer', 'sop'] as const).map(v => (
                  <button key={v} onClick={() => setSchedulerView(v)}
                    className={`px-4 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all ${
                      schedulerView === v ? 'bg-indigo-600/80 text-white' : 'text-slate-500 hover:text-white'
                    }`}>
                    {v === 'trainer' ? 'By Trainer' : 'By SOP'}
                  </button>
                ))}
              </div>
              <ReportFilters sel={sel} setSel={setSel} filters={filters} />
              <button onClick={fetchScheduler} className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all">
                <RefreshCw className={`h-3.5 w-3.5 ${schedulerLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {schedulerLoading ? <ReportLoader /> : (
              schedulerView === 'trainer' ? (
                /* ── Trainer-wise table ── */
                <div className="bg-white/[0.025] border border-white/5 rounded-3xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Trainer-wise Exam Scheduling</h3>
                    <button onClick={() => handleScheduleRow({})}
                      disabled={schedulingRow === 'row' || schedulerTotals.pending === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600/80 hover:bg-indigo-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all">
                      {schedulingRow === 'row' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      Schedule All Pending ({schedulerTotals.pending})
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                          {['Trainer', 'Department', 'SOPs', 'Employees', 'Pending', 'In Progress', 'Done', 'Action'].map(h => (
                            <th key={h} className="px-5 py-3 text-left font-black text-[9px] uppercase tracking-[0.15em] text-slate-600">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {schedulerTrainers.length === 0 ? (
                          <tr><td colSpan={8} className="py-12 text-center text-slate-600">No data. Upload a training matrix first.</td></tr>
                        ) : schedulerTrainers.map((row, i) => (
                          <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center font-black text-xs shrink-0">
                                  {(row.trainer || '?').charAt(0)}
                                </div>
                                <span className="font-bold text-white">{row.trainer || 'Unassigned'}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className="px-2 py-1 bg-slate-800/50 rounded-lg text-slate-400 font-bold text-[9px] uppercase tracking-wider">{row.department}</span>
                            </td>
                            <td className="px-5 py-4 font-black text-indigo-300">{row.sopCount}</td>
                            <td className="px-5 py-4 font-black text-white">{row.employeeCount}</td>
                            <td className="px-5 py-4">
                              <span className={`font-black ${row.pending > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{row.pending}</span>
                            </td>
                            <td className="px-5 py-4 font-black text-blue-400">{row.inProgress}</td>
                            <td className="px-5 py-4 font-black text-emerald-400">{row.completed}</td>
                            <td className="px-5 py-4">
                              {row.pending > 0 ? (
                                <button
                                  onClick={() => handleScheduleRow({ trainer: row.trainer })}
                                  disabled={schedulingRow === row.trainer}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                  {schedulingRow === row.trainer ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                                  Schedule ({row.pending})
                                </button>
                              ) : (
                                <span className="text-slate-700 text-[9px] font-black uppercase">All scheduled</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* ── SOP-wise table ── */
                <div className="bg-white/[0.025] border border-white/5 rounded-3xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">SOP-wise Exam Scheduling</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                          {['SOP Code', 'SOP Name', 'Trainer', 'Employees', 'Pending', 'Done', 'Action'].map(h => (
                            <th key={h} className="px-5 py-3 text-left font-black text-[9px] uppercase tracking-[0.15em] text-slate-600">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {schedulerSOPs.length === 0 ? (
                          <tr><td colSpan={7} className="py-12 text-center text-slate-600">No data.</td></tr>
                        ) : schedulerSOPs.map((row, i) => (
                          <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                            <td className="px-5 py-4 font-mono font-black text-indigo-400">{row.sopIdentifier}</td>
                            <td className="px-5 py-4 text-slate-300 max-w-[180px] truncate">{row.sopName || '—'}</td>
                            <td className="px-5 py-4 text-slate-400">{row.trainer || '—'}</td>
                            <td className="px-5 py-4 font-black text-white">{row.employeeCount}</td>
                            <td className="px-5 py-4">
                              <span className={`font-black ${row.pending > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{row.pending}</span>
                            </td>
                            <td className="px-5 py-4 font-black text-emerald-400">{row.completed}</td>
                            <td className="px-5 py-4">
                              {row.pending > 0 ? (
                                <button
                                  onClick={() => handleScheduleRow({ sopIdentifier: row.sopIdentifier })}
                                  disabled={schedulingRow === row.sopIdentifier}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                  {schedulingRow === row.sopIdentifier ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                                  Schedule ({row.pending})
                                </button>
                              ) : <span className="text-slate-700 text-[9px] font-black uppercase">Done</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB 6: Analytics */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <ReportFilters sel={sel} setSel={setSel} filters={filters} />
            {reportLoading ? <ReportLoader /> : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* Trainer Workload */}
                <div className="bg-white/[0.025] border border-white/5 rounded-3xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
                    <Award className="h-4 w-4 text-indigo-400" />
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Trainer Workload</h3>
                  </div>
                  <div className="divide-y divide-white/[0.03]">
                    {trainerStats.slice(0, 10).map((t, i) => {
                      const pr = t.total ? Math.round((t.completed / t.total) * 100) : 0;
                      return (
                        <div key={i} className="px-6 py-3 flex items-center justify-between hover:bg-white/[0.02]">
                          <div>
                            <p className="font-bold text-white text-xs">{t._id.trainer || 'Unassigned'}</p>
                            <p className="text-[9px] text-slate-600">{t._id.dept} · {t.total} tests</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-20 h-1 bg-white/5 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${pr >= 80 ? 'bg-emerald-500' : pr >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${pr}%` }} />
                            </div>
                            <span className={`text-xs font-black w-10 text-right ${pr >= 80 ? 'text-emerald-400' : pr >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>{pr}%</span>
                            {t.retests > 0 && <span className="text-[9px] text-rose-400 font-black">{t.retests}↩</span>}
                          </div>
                        </div>
                      );
                    })}
                    {trainerStats.length === 0 && <p className="px-6 py-8 text-center text-slate-600 text-xs">No data</p>}
                  </div>
                </div>

                {/* Department Completion */}
                <div className="bg-white/[0.025] border border-white/5 rounded-3xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
                    <Users className="h-4 w-4 text-teal-400" />
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Department Completion</h3>
                  </div>
                  <div className="divide-y divide-white/[0.03]">
                    {deptStats.map((d, i) => {
                      const pr = d.total ? Math.round((d.passed / d.total) * 100) : 0;
                      return (
                        <div key={i} className="px-6 py-3 hover:bg-white/[0.02]">
                          <div className="flex justify-between items-center mb-1">
                            <p className="font-bold text-white text-xs">{d._id}</p>
                            <div className="flex items-center gap-3 text-[10px]">
                              <span className="text-emerald-400 font-black">{d.passed} passed</span>
                              <span className="text-rose-400 font-black">{d.failed} failed</span>
                              <span className="text-amber-400 font-black">{d.pending} pending</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div style={{ width: `${pr}%` }} className={`h-full rounded-full ${pr >= 80 ? 'bg-emerald-500' : pr >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                          </div>
                        </div>
                      );
                    })}
                    {deptStats.length === 0 && <p className="px-6 py-8 text-center text-slate-600 text-xs">No data</p>}
                  </div>
                </div>

                {/* High-Failure SOPs */}
                <div className="bg-white/[0.025] border border-white/5 rounded-3xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-rose-400" />
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">High-Failure SOPs <span className="text-rose-400">(pass rate &lt; 60%)</span></h3>
                  </div>
                  <div className="divide-y divide-white/[0.03]">
                    {sopStats.filter(s => s.total >= 3 && s.total ? (s.passed / s.total) * 100 < 60 : false).slice(0, 8).map((s, i) => {
                      const pr = s.total ? Math.round((s.passed / s.total) * 100) : 0;
                      return (
                        <div key={i} className="px-6 py-3 flex items-center justify-between hover:bg-white/[0.02]">
                          <div>
                            <p className="font-mono font-black text-indigo-400 text-[10px]">{s._id.sop}</p>
                            <p className="text-[9px] text-slate-600 max-w-[200px] truncate">{s._id.sopName || '—'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-rose-400">{pr}% pass</span>
                            <span className="text-[9px] text-slate-600">{s.total} tested</span>
                          </div>
                        </div>
                      );
                    })}
                    {sopStats.filter(s => s.total >= 3 && s.total ? (s.passed / s.total) * 100 < 60 : false).length === 0 && (
                      <div className="px-6 py-8 text-center">
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
                        <p className="text-slate-600 text-xs">No high-failure SOPs detected.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Trainer-wise KPI summary table */}
                <div className="bg-white/[0.025] border border-white/5 rounded-3xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-amber-400" />
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Trainers with High Retests</h3>
                  </div>
                  <div className="divide-y divide-white/[0.03]">
                    {trainerStats.filter(t => t.retests > 0).sort((a, b) => b.retests - a.retests).slice(0, 8).map((t, i) => (
                      <div key={i} className="px-6 py-3 flex items-center justify-between hover:bg-white/[0.02]">
                        <div>
                          <p className="font-bold text-white text-xs">{t._id.trainer || 'Unassigned'}</p>
                          <p className="text-[9px] text-slate-600">{t._id.dept}</p>
                        </div>
                        <div className="flex items-center gap-4 text-[10px]">
                          <span className="text-amber-400 font-black">{t.retests} retests</span>
                          <span className="text-rose-400 font-black">{t.failed} failed</span>
                          <span className="text-white font-bold">{t.total} total</span>
                        </div>
                      </div>
                    ))}
                    {trainerStats.filter(t => t.retests > 0).length === 0 && (
                      <div className="px-6 py-8 text-center">
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
                        <p className="text-slate-600 text-xs">No retests recorded yet.</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

      </div>

      {/* Modals */}
      <TrainingMatrixUploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} onSuccess={fetchMatrix} />
      {ackRecord && <AcknowledgeModal record={ackRecord} onClose={() => setAckRecord(null)} onDone={fetchMatrix} />}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status, passStatus, retestRequired }: { status: string; passStatus: string; retestRequired?: boolean }) {
  if (retestRequired) return (
    <span className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[9px] font-black uppercase tracking-widest">
      <RotateCcw className="h-3 w-3" /> Retest
    </span>
  );
  if (passStatus === 'Pass') return (
    <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-[9px] font-black uppercase tracking-widest">
      <CheckCircle2 className="h-3 w-3" /> Passed
    </span>
  );
  if (passStatus === 'Fail') return (
    <span className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[9px] font-black uppercase tracking-widest">
      <XCircle className="h-3 w-3" /> Failed
    </span>
  );
  if (status === 'Trained') return (
    <span className="flex items-center gap-1 px-2.5 py-1 bg-teal-500/10 border border-teal-500/20 rounded-xl text-teal-400 text-[9px] font-black uppercase tracking-widest">
      <UserCheck className="h-3 w-3" /> Trained
    </span>
  );
  if (status === 'In Progress') return (
    <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-[9px] font-black uppercase tracking-widest">
      <Activity className="h-3 w-3" /> In Progress
    </span>
  );
  return (
    <span className="px-2.5 py-1 bg-slate-800/50 border border-white/5 rounded-xl text-slate-500 text-[9px] font-black uppercase tracking-widest">
      Pending
    </span>
  );
}

function ActionCell({ row, onAck }: { row: MatrixRecord; onAck: () => void }) {
  if (row.status === 'Trained' && row.acknowledgedAt) {
    return (
      <span className="flex items-center gap-1 text-teal-600 text-[9px] font-black uppercase tracking-widest">
        <ClipboardCheck className="h-3 w-3" /> Acked
      </span>
    );
  }
  if (row.passStatus === 'Pass' && !row.acknowledgedAt) {
    return (
      <button
        onClick={onAck}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all"
      >
        <ThumbsUp className="h-3 w-3" /> Acknowledge
      </button>
    );
  }
  if (row.retestRequired) {
    return (
      <span className="flex items-center gap-1 text-rose-500 text-[9px] font-black uppercase tracking-widest animate-pulse">
        <AlertTriangle className="h-3 w-3" /> Retest Pending
      </span>
    );
  }
  if (row.status === 'In Progress' && row.testSessionId) {
    return (
      <a href={`/training/test/${row.testSessionId}`}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all">
        <ChevronRight className="h-3 w-3" /> Resume
      </a>
    );
  }
  return <span className="text-slate-700 text-[9px] font-black uppercase tracking-widest">—</span>;
}

function StatMini({ label, value, color = 'text-white' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white/[0.03] rounded-xl p-2 text-center">
      <p className={`text-sm font-black ${color}`}>{value}</p>
      <p className="text-[8px] text-slate-600 font-bold uppercase tracking-widest mt-0.5">{label}</p>
    </div>
  );
}

function ReportFilters({ sel, setSel, filters, deptOnly }: any) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-wrap gap-4">
      {!deptOnly && (
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Month</label>
          <select
            value={sel.month}
            onChange={e => setSel((s: any) => ({ ...s, month: e.target.value }))}
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
          >
            <option value="all">All Months</option>
            {filters.months.map((m: string) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Department</label>
        <select
          value={sel.department}
          onChange={e => setSel((s: any) => ({ ...s, department: e.target.value }))}
          className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
        >
          <option value="all">All Departments</option>
          {filters.departments.map((d: string) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
    </div>
  );
}

function ReportLoader() {
  return (
    <div className="flex flex-col items-center py-20 gap-4">
      <div className="h-8 w-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      <p className="text-slate-600 font-bold text-xs">Loading report data…</p>
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center py-20 gap-3">
      <div className="p-4 bg-white/5 rounded-2xl"><BarChart3 className="h-8 w-8 text-slate-600" /></div>
      <p className="text-slate-500 font-bold text-sm">{msg}</p>
    </div>
  );
}
