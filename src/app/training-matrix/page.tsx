'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Upload, RefreshCw, Search, Users, BookOpen, CheckCircle2,
  XCircle, Clock, BarChart2, X, AlertCircle, TrendingUp, FileSpreadsheet,
  Calendar, Award, Layers, ChevronDown, ChevronRight, ChevronLeft,
  Download, Bell, Filter, SortAsc, Eye, Send, RotateCcw, Zap,
  Building2, UserCheck, AlertTriangle, CheckCheck, Activity,
  GraduationCap, ShieldCheck, BarChart, ClipboardList, RotateCw,
  ChevronUp, Star, ListChecks,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type TrainingStatus = 'completed' | 'not_required' | 'na' | 'pending';
type ViewMode       = 'month' | 'employee' | 'trainer';
type SortKey        = 'pending' | 'completed' | 'pct_asc' | 'pct_desc' | 'department' | 'name';

const MONTH_NAMES = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DEPTS       = ['QA','QC','Production','Engineering','Engineering and Maintenance','Store','Personnel','Microbiology','R&D'];

// ─── Helper: status colours ───────────────────────────────────────────────────
function statusBadge(s: string) {
  if (s === 'completed')    return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
  if (s === 'pending')      return 'bg-amber-100   text-amber-700   border border-amber-200';
  if (s === 'not_required') return 'bg-red-50      text-red-600     border border-red-200';
  return 'bg-gray-100 text-gray-500 border border-gray-200';
}
function statusLabel(s: string) {
  if (s === 'completed')    return '✓ Completed';
  if (s === 'pending')      return '√ Pending';
  if (s === 'not_required') return '✗ Not Required';
  return '— N/A';
}
function pctColor(pct: number) {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
}
function pctBg(pct: number) {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}
function empStatusColor(pct: number, hasPending: boolean) {
  if (pct === 100)  return 'border-l-emerald-500';
  if (hasPending)   return 'border-l-amber-400';
  return 'border-l-gray-300';
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [files, setFiles]       = useState<File[]>([]);
  const [dept, setDept]         = useState('');
  const [month, setMonth]       = useState(new Date().getMonth() + 1);
  const [year, setYear]         = useState(new Date().getFullYear());
  const [fileType, setFileType] = useState<'main' | 'addendum'>('main');
  const [uploading, setUploading] = useState(false);
  const [results, setResults]   = useState<any[]>([]);
  const [error, setError]       = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const FILE_RE  = /\.(xlsx|xls|xlsm|docx|doc)$/i;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setFiles(p => [...p, ...Array.from(e.dataTransfer.files).filter(f => FILE_RE.test(f.name))]);
  };

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true); setError(''); setResults([]);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      if (dept) fd.append('department', dept);
      fd.append('month', String(month));
      fd.append('year', String(year));
      fd.append('fileType', fileType);
      const res  = await fetch('/api/training-matrix/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) { setResults(data.results || []); onSuccess(); }
      else setError(data.error || 'Upload failed');
    } catch (e: any) { setError(e.message); }
    finally { setUploading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
              <FileSpreadsheet className="h-4 w-4 text-purple-600" />
            </div>
            <h2 className="font-bold text-gray-800">Upload Training Matrix</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/40 px-4 py-8 text-center hover:bg-purple-50 transition-colors">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-purple-400 mb-2" />
            <p className="text-sm font-semibold text-gray-700">Drop Excel or Word files here</p>
            <p className="text-xs text-gray-500 mt-1">.xlsx · .xls · .xlsm · .docx supported</p>
            <input ref={inputRef} type="file" multiple accept=".xlsx,.xls,.xlsm,.docx,.doc" className="hidden"
              onChange={e => setFiles(p => [...p, ...Array.from(e.target.files || [])])} />
          </div>
          {files.length > 0 && (
            <ul className="space-y-1 max-h-28 overflow-y-auto text-xs">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5">
                  <span className="truncate text-gray-700">{f.name}</span>
                  <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="ml-2 text-red-400 hover:text-red-600"><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Department (override)', el: <select value={dept} onChange={e => setDept(e.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-purple-400 focus:outline-none"><option value="">Auto-detect</option>{DEPTS.map(d => <option key={d} value={d}>{d}</option>)}</select> },
              { label: 'File Type', el: <select value={fileType} onChange={e => setFileType(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-purple-400 focus:outline-none"><option value="main">Main Matrix</option><option value="addendum">Addendum</option></select> },
              { label: 'Month', el: <select value={month} onChange={e => setMonth(+e.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-purple-400 focus:outline-none">{MONTH_NAMES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}</select> },
              { label: 'Year', el: <select value={year} onChange={e => setYear(+e.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-purple-400 focus:outline-none">{[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}</select> },
            ].map(({ label, el }) => (
              <div key={label}>
                <label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
                {el}
              </div>
            ))}
          </div>
          {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600">{error}</p>}
          {results.length > 0 && (
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className={`rounded-lg px-3 py-2 text-xs ${r.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                  <strong>{r.fileName}</strong>: {r.ok ? `${r.employees} employees · ${r.sops} SOPs · ${r.records} records` : r.error}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleUpload} disabled={uploading || !files.length}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50">
            {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Upload & Parse'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Employee Detail Panel ────────────────────────────────────────────────────
function EmployeeDetailPanel({ employee, onClose }: { employee: { employeeName: string; department: string }; onClose: () => void }) {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<'sops' | 'exams'>('sops');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/training-matrix/employee-detail?employee=${encodeURIComponent(employee.employeeName)}&department=${encodeURIComponent(employee.department)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); })
      .finally(() => setLoading(false));
  }, [employee.employeeName, employee.department]);

  const emp  = data?.employee;
  const sops = data?.sops || [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-purple-700 to-purple-500 px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-white text-lg leading-tight">{employee.employeeName}</h2>
              <p className="text-purple-200 text-xs mt-0.5">{emp?.designation || '—'} · {employee.department}</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/20 text-white"><X className="h-5 w-5" /></button>
          </div>
          {emp && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[
                { l: 'Required', v: emp.required,       bg: 'bg-white/10' },
                { l: 'Completed', v: emp.completed,     bg: 'bg-emerald-500/30' },
                { l: 'Pending',   v: emp.pending,       bg: 'bg-amber-400/30' },
                { l: 'Not Req',   v: emp.notRequired,   bg: 'bg-red-400/20' },
              ].map(s => (
                <div key={s.l} className={`${s.bg} rounded-xl p-2 text-center`}>
                  <p className="text-base font-black text-white">{s.v}</p>
                  <p className="text-[9px] text-purple-200 font-semibold mt-0.5">{s.l}</p>
                </div>
              ))}
            </div>
          )}
          {emp && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-white/80 mb-1">
                <span>Completion</span>
                <span className="font-bold">{emp.completionPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/20">
                <div className="h-2 rounded-full bg-white transition-all" style={{ width: `${emp.completionPct}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-4 pt-2">
          {[
            { id: 'sops' as const,  label: 'SOP Training Status', icon: BookOpen },
            { id: 'exams' as const, label: 'Exam History',         icon: Award },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 pb-2 text-xs font-semibold transition-colors ${
                tab === id ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-purple-400" />
          </div>
        ) : (
          <div className="p-4">
            {tab === 'sops' && (
              <div className="space-y-2">
                {['completed', 'pending', 'not_required'].map(statusGroup => {
                  const grouped = sops.filter((s: any) => s.status === statusGroup);
                  if (!grouped.length) return null;
                  return (
                    <div key={statusGroup}>
                      <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${
                        statusGroup === 'completed' ? 'text-emerald-600' :
                        statusGroup === 'pending'   ? 'text-amber-600'   : 'text-red-500'
                      }`}>
                        {statusLabel(statusGroup)} ({grouped.length})
                      </p>
                      <div className="space-y-1.5">
                        {grouped.map((s: any) => (
                          <div key={s.sopCode} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${statusBadge(statusGroup)} bg-opacity-50`}>
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-bold truncate">{s.sopCode}</p>
                              {s.sopName && s.sopName !== s.sopCode && (
                                <p className="text-[10px] text-gray-500 truncate mt-0.5">{s.sopName}</p>
                              )}
                              <p className="text-[9px] text-gray-400 mt-0.5">
                                {s.months?.map((m: any) => `${MONTH_SHORT[m.month]} ${m.year}`).join(' · ')}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                              {s.lastScore != null && (
                                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-px rounded-full">
                                  Score: {s.lastScore}
                                </span>
                              )}
                              {s.passStatus && s.passStatus !== 'pending' && (
                                <span className={`text-[9px] font-bold px-1.5 py-px rounded-full ${s.passStatus === 'pass' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                  {s.passStatus.toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {sops.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No SOP records found</p>}
              </div>
            )}

            {tab === 'exams' && (
              <div className="space-y-2">
                {(data?.examRecords || []).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No exam records yet</p>
                ) : (
                  (data?.examRecords || []).map((e: any, i: number) => (
                    <div key={i} className="rounded-xl border border-gray-200 bg-white p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-xs font-bold text-purple-700">{e.sopCode}</p>
                          {e.sopName && <p className="text-[10px] text-gray-500 mt-0.5">{e.sopName}</p>}
                          <p className="text-[10px] text-gray-400 mt-1">
                            {e.examDate ? new Date(e.examDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            e.passFail === 'pass'    ? 'bg-emerald-100 text-emerald-700' :
                            e.passFail === 'fail'    ? 'bg-red-100 text-red-600'        :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {e.passFail?.toUpperCase() || 'PENDING'}
                          </span>
                          {e.score != null && (
                            <span className="text-[10px] text-gray-600">
                              {e.score}{e.maxScore ? `/${e.maxScore}` : ''} pts
                            </span>
                          )}
                        </div>
                      </div>
                      {e.remarks && <p className="mt-1.5 text-[10px] text-gray-500 italic">{e.remarks}</p>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Quick Actions</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Schedule Exam',  icon: Calendar,  cls: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' },
              { label: 'Send Reminder',  icon: Send,      cls: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
              { label: 'Reschedule',     icon: RotateCcw, cls: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
            ].map(({ label, icon: Icon, cls }) => (
              <button key={label} className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${cls}`}>
                <Icon className="h-3 w-3" />{label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────
function MonthView({ dept, month, year, onMonthChange }: {
  dept: string; month: number; year: number;
  onMonthChange: (m: number, y: number) => void;
}) {
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [selEmployee, setSelEmp] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ month: String(month), year: String(year) });
    if (dept !== 'all') p.set('department', dept);
    fetch(`/api/training-matrix/calendar-data?${p}`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); })
      .finally(() => setLoading(false));
  }, [dept, month, year]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 1) onMonthChange(12, year - 1);
    else             onMonthChange(month - 1, year);
  };
  const nextMonth = () => {
    if (month === 12) onMonthChange(1, year + 1);
    else              onMonthChange(month + 1, year);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {/* skeleton */}
        {[1,2,3].map(i => (
          <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  const summary     = data?.summary     || {};
  const deptList    = data?.deptBreakdown || [];
  const empList     = data?.employeeList  || [];
  const weekBuckets = data?.weekBuckets   || [];

  return (
    <div className="space-y-5">
      {/* Month Nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <h2 className="text-xl font-black text-gray-900">{MONTH_NAMES[month]} {year}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{summary.employeeCount || 0} employees · {summary.sopCount || 0} SOPs</p>
        </div>
        <button onClick={nextMonth} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Top KPI capsules */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {[
          { label: 'Total SOPs',   val: summary.sopCount || 0,        icon: BookOpen,      bg: 'bg-purple-50',  ic: 'bg-purple-100',  t: 'text-purple-700' },
          { label: 'Employees',    val: summary.employeeCount || 0,   icon: Users,         bg: 'bg-blue-50',    ic: 'bg-blue-100',    t: 'text-blue-700' },
          { label: 'Required',     val: summary.required || 0,        icon: Layers,        bg: 'bg-indigo-50',  ic: 'bg-indigo-100',  t: 'text-indigo-700' },
          { label: 'Completed',    val: summary.completed || 0,       icon: CheckCircle2,  bg: 'bg-emerald-50', ic: 'bg-emerald-100', t: 'text-emerald-700' },
          { label: 'Pending',      val: summary.pending || 0,         icon: Clock,         bg: 'bg-amber-50',   ic: 'bg-amber-100',   t: 'text-amber-700' },
          { label: 'Completion',   val: `${summary.pct || 0}%`,       icon: TrendingUp,    bg: summary.pct >= 80 ? 'bg-emerald-50' : summary.pct >= 50 ? 'bg-amber-50' : 'bg-red-50', ic: summary.pct >= 80 ? 'bg-emerald-100' : summary.pct >= 50 ? 'bg-amber-100' : 'bg-red-100', t: pctColor(summary.pct || 0) },
        ].map(({ label, val, icon: Icon, bg, ic, t }) => (
          <div key={label} className={`${bg} rounded-2xl p-3 flex items-center gap-3 shadow-sm border border-white`}>
            <div className={`${ic} flex h-9 w-9 shrink-0 items-center justify-center rounded-xl`}>
              <Icon className={`h-4 w-4 ${t}`} />
            </div>
            <div>
              <p className={`text-lg font-black ${t}`}>{val}</p>
              <p className="text-[10px] font-semibold text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-800">Monthly Completion Progress</h3>
          <span className={`text-sm font-black ${pctColor(summary.pct || 0)}`}>{summary.pct || 0}%</span>
        </div>
        <div className="h-3 rounded-full bg-gray-100">
          <div className={`h-3 rounded-full transition-all duration-700 ${pctBg(summary.pct || 0)}`} style={{ width: `${summary.pct || 0}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-gray-400">
          <span>{summary.completed || 0} completed</span>
          <span>{summary.pending || 0} pending</span>
        </div>
      </div>

      {/* Week distribution */}
      {weekBuckets.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Weekly Distribution</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {weekBuckets.map((w: any) => {
              const total = w.completed + w.pending;
              const wpct  = total > 0 ? Math.round((w.completed / total) * 100) : 0;
              return (
                <div key={w.week} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                  <p className="text-[9px] font-bold text-gray-500 uppercase mb-2">{w.label}</p>
                  <p className={`text-2xl font-black ${pctColor(wpct)}`}>{total}</p>
                  <p className="text-[9px] text-gray-400 mb-2">trainings</p>
                  <div className="h-1.5 rounded-full bg-gray-200">
                    <div className={`h-1.5 rounded-full ${pctBg(wpct)}`} style={{ width: `${wpct}%` }} />
                  </div>
                  <p className="text-[9px] text-gray-500 mt-1">{w.employeeCount} emp</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Department breakdown */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-purple-600" />Department-wise Breakdown
        </h3>
        {deptList.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No department data for this month</p>
        ) : (
          <div className="space-y-3">
            {deptList.map((d: any) => (
              <div key={d.department} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-gray-800">{d.department}</p>
                    <p className="text-[10px] text-gray-500">{d.employeeCount} employees · {d.sopCount} SOPs</p>
                  </div>
                  <span className={`text-sm font-black px-2.5 py-1 rounded-full ${
                    d.pct >= 80 ? 'bg-emerald-100 text-emerald-700' :
                    d.pct >= 50 ? 'bg-amber-100 text-amber-700'     :
                    'bg-red-100 text-red-600'
                  }`}>{d.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 mb-2">
                  <div className={`h-2 rounded-full transition-all ${pctBg(d.pct)}`} style={{ width: `${d.pct}%` }} />
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">✓ {d.completed}</span>
                  <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">√ {d.pending}</span>
                  <span className="font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">✗ {d.notRequired}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Employee list for this month */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-purple-600" />Employees This Month ({empList.length})
        </h3>
        {empList.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No employee data for this month</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {empList.map((e: any) => (
              <button key={`${e.employeeName}-${e.department}`}
                onClick={() => setSelEmp(e)}
                className={`text-left rounded-xl border-l-4 border border-gray-200 bg-white p-3 hover:shadow-md hover:-translate-y-0.5 transition-all ${
                  e.pct === 100 ? 'border-l-emerald-400' :
                  e.pending > 0 ? 'border-l-amber-400' : 'border-l-gray-300'
                }`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-xs leading-tight truncate">{e.employeeName}</p>
                    <p className="text-[9px] text-gray-500 mt-0.5 truncate">{e.designation || e.department}</p>
                  </div>
                  <span className={`text-xs font-black shrink-0 ${pctColor(e.pct)}`}>{e.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 mb-2">
                  <div className={`h-1.5 rounded-full ${pctBg(e.pct)}`} style={{ width: `${e.pct}%` }} />
                </div>
                <div className="flex items-center gap-1.5 text-[9px]">
                  <span className="text-emerald-700 bg-emerald-50 px-1 py-px rounded font-bold">✓{e.completed}</span>
                  <span className="text-amber-700 bg-amber-50 px-1 py-px rounded font-bold">√{e.pending}</span>
                  <span className="text-red-600 bg-red-50 px-1 py-px rounded font-bold">✗{e.notRequired}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selEmployee && (
        <EmployeeDetailPanel
          employee={{ employeeName: selEmployee.employeeName, department: selEmployee.department }}
          onClose={() => setSelEmp(null)}
        />
      )}
    </div>
  );
}

// ─── Employee View ────────────────────────────────────────────────────────────
function EmployeeView({
  employees, records, search, onSearchChange,
}: {
  employees: any[];
  records: any[];
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const [sort, setSort]           = useState<SortKey>('pending');
  const [deptFilter, setDeptFilter] = useState('all');
  const [selectedEmp, setSelectedEmp] = useState<any>(null);

  const departments = useMemo(() => [...new Set(employees.map(e => e.department))].filter(Boolean).sort(), [employees]);

  const filtered = useMemo(() => {
    let r = employees;
    if (deptFilter !== 'all') r = r.filter(e => e.department === deptFilter);
    if (search) r = r.filter(e => e.employeeName.toLowerCase().includes(search.toLowerCase()));
    return [...r].sort((a, b) => {
      if (sort === 'pending')     return b.pending   - a.pending;
      if (sort === 'completed')   return b.completed - a.completed;
      if (sort === 'pct_desc')    return b.pct - a.pct;
      if (sort === 'pct_asc')     return a.pct - b.pct;
      if (sort === 'department')  return a.department.localeCompare(b.department);
      return a.employeeName.localeCompare(b.employeeName);
    });
  }, [employees, deptFilter, search, sort]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Search employee…"
            className="w-44 rounded-xl border border-gray-200 pl-8 pr-3 py-1.5 text-xs focus:border-purple-400 focus:outline-none" />
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          className="rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs focus:border-purple-400 focus:outline-none">
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="flex items-center gap-1 ml-auto">
          <SortAsc className="h-3.5 w-3.5 text-gray-500" />
          <span className="text-xs text-gray-500 font-medium">Sort:</span>
          {[
            { k: 'pending'    as SortKey, l: 'Most Pending' },
            { k: 'completed'  as SortKey, l: 'Most Done'    },
            { k: 'pct_desc'   as SortKey, l: 'Highest %'    },
            { k: 'pct_asc'    as SortKey, l: 'Lowest %'     },
            { k: 'department' as SortKey, l: 'Department'   },
          ].map(({ k, l }) => (
            <button key={k} onClick={() => setSort(k)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                sort === k ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-purple-50'
              }`}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">{filtered.length} employees</span>
      </div>

      {/* Employee grid */}
      {filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white text-sm text-gray-400">
          No employees found
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(emp => {
            const hasPending = emp.pending > 0;
            const borderCls  = emp.pct === 100  ? 'border-l-emerald-500' :
                               hasPending        ? 'border-l-amber-400'   : 'border-l-gray-300';
            return (
              <button key={`${emp.department}-${emp.employeeName}`}
                onClick={() => setSelectedEmp(emp)}
                className={`text-left rounded-2xl border border-gray-200 border-l-4 ${borderCls} bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-purple-300`}>

                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm leading-tight truncate">{emp.employeeName}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">{emp.designation || '—'}</p>
                    <span className="inline-block mt-1 text-[9px] font-semibold bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-px rounded-full">
                      {emp.department}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-xl font-black ${pctColor(emp.pct)}`}>{emp.pct}%</p>
                    <p className="text-[9px] text-gray-400">complete</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-gray-100 mb-3">
                  <div className={`h-2 rounded-full transition-all ${pctBg(emp.pct)}`} style={{ width: `${emp.pct}%` }} />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-1 text-center">
                  <div className="rounded-lg bg-indigo-50 py-1.5">
                    <p className="text-xs font-black text-indigo-700">{emp.required}</p>
                    <p className="text-[8px] text-indigo-500 font-semibold">Req</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 py-1.5">
                    <p className="text-xs font-black text-emerald-700">{emp.completed}</p>
                    <p className="text-[8px] text-emerald-500 font-semibold">Done</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 py-1.5">
                    <p className="text-xs font-black text-amber-700">{emp.pending}</p>
                    <p className="text-[8px] text-amber-500 font-semibold">Pend</p>
                  </div>
                  <div className="rounded-lg bg-red-50 py-1.5">
                    <p className="text-xs font-black text-red-600">{emp.not_required || emp.notRequired || 0}</p>
                    <p className="text-[8px] text-red-400 font-semibold">N/R</p>
                  </div>
                </div>

                {emp.pct < 20 && emp.required > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-[9px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="h-2.5 w-2.5" /> Low Completion
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedEmp && (
        <EmployeeDetailPanel
          employee={{ employeeName: selectedEmp.employeeName, department: selectedEmp.department }}
          onClose={() => setSelectedEmp(null)}
        />
      )}
    </div>
  );
}

// ─── Trend Charts (lightweight, no recharts dependency) ───────────────────────
function TrendSection({ monthlyTrend, deptBreakdown }: { monthlyTrend: any[]; deptBreakdown: any[] }) {
  const max = Math.max(...monthlyTrend.map(m => m.total || 0), 1);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Monthly bar chart */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
          <Activity className="h-4 w-4 text-purple-600" />Monthly Training Trend
        </h3>
        <p className="text-[10px] text-gray-400 mb-4">Completed vs pending across all months</p>
        {monthlyTrend.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No trend data available</p>
        ) : (
          <div className="flex items-end gap-1.5 h-32">
            {monthlyTrend.map((m, i) => {
              const compH = Math.round(((m.completed || 0) / max) * 100);
              const pendH = Math.round(((m.pending   || 0) / max) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group" title={`${MONTH_SHORT[m.month]} ${m.year}: ${m.completed} done, ${m.pending} pending`}>
                  <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: '100px' }}>
                    <div className="w-full rounded-t bg-amber-400 transition-all" style={{ height: `${pendH}px`, minHeight: pendH > 0 ? '2px' : '0' }} />
                    <div className="w-full rounded-b bg-emerald-500 transition-all" style={{ height: `${compH}px`, minHeight: compH > 0 ? '2px' : '0' }} />
                  </div>
                  <p className="text-[8px] text-gray-400 font-semibold">{MONTH_SHORT[m.month]}</p>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex items-center gap-4 text-[10px]">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />Completed</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />Pending</span>
        </div>
      </div>

      {/* Dept completion bars */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-purple-600" />Department Completion
        </h3>
        <p className="text-[10px] text-gray-400 mb-4">Completion % across departments</p>
        {deptBreakdown.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No department data</p>
        ) : (
          <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
            {deptBreakdown.map((d: any) => (
              <div key={d.department}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-700 truncate max-w-[60%]">{d.department}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-500">{d.employeeCount} emp</span>
                    <span className={`text-xs font-black ${pctColor(Math.round(d.pct))}`}>{Math.round(d.pct)}%</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className={`h-2 rounded-full transition-all ${pctBg(Math.round(d.pct))}`} style={{ width: `${Math.round(d.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Notifications Panel ──────────────────────────────────────────────────────
function NotificationsPanel({ employees }: { employees: any[] }) {
  const { overdue, pending, completed } = useMemo(() => {
    const overdue   = employees.filter(e => e.pending > 0 && e.pct < 30).slice(0, 6);
    const pending   = employees.filter(e => e.pending > 0 && e.pct >= 30).slice(0, 6);
    const completed = employees.filter(e => e.pct === 100).slice(0, 6);
    return { overdue, pending, completed };
  }, [employees]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <Bell className="h-4 w-4 text-purple-600" />
        <h3 className="text-sm font-bold text-gray-800">Smart Notifications</h3>
      </div>
      <div className="p-4 space-y-4">
        {/* Overdue / critical */}
        {overdue.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Critical — Low Completion ({overdue.length})
            </p>
            <div className="space-y-1.5">
              {overdue.map(e => (
                <div key={e.employeeName} className="flex items-center justify-between rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                  <div>
                    <p className="text-xs font-bold text-red-800">{e.employeeName}</p>
                    <p className="text-[9px] text-red-600">{e.department} · {e.pending} pending</p>
                  </div>
                  <span className="text-sm font-black text-red-700">{e.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Pending attention */}
        {pending.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Pending Training ({pending.length})
            </p>
            <div className="space-y-1.5">
              {pending.map(e => (
                <div key={e.employeeName} className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                  <div>
                    <p className="text-xs font-bold text-amber-800">{e.employeeName}</p>
                    <p className="text-[9px] text-amber-600">{e.department} · {e.pending} pending</p>
                  </div>
                  <span className="text-sm font-black text-amber-700">{e.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Completed */}
        {completed.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-2 flex items-center gap-1">
              <CheckCheck className="h-3 w-3" /> Fully Completed ({completed.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {completed.map(e => (
                <span key={e.employeeName} className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                  ✓ {e.employeeName}
                </span>
              ))}
            </div>
          </div>
        )}
        {!overdue.length && !pending.length && !completed.length && (
          <p className="text-sm text-gray-400 text-center py-4">No notifications</p>
        )}
      </div>
    </div>
  );
}

// ─── Trainer View ─────────────────────────────────────────────────────────────
function TrainerView() {
  const [data, setData]           = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [dept, setDept]           = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]       = useState('');
  const [selectedTrainer, setSelectedTrainer] = useState<any>(null);
  const [expandedSop, setExpandedSop]         = useState<string | null>(null);
  const [sortKey, setSortKey]     = useState<'pending' | 'completed' | 'sops' | 'name'>('pending');

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dept         !== 'all') p.set('department', dept);
    if (statusFilter !== 'all') p.set('status', statusFilter);
    if (search)                  p.set('search', search);
    fetch(`/api/training-matrix/trainer-view?${p}`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); })
      .finally(() => setLoading(false));
  }, [dept, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const trainers: any[] = useMemo(() => {
    const list = data?.trainers || [];
    return [...list].sort((a, b) => {
      if (sortKey === 'pending')   return b.pendingCount   - a.pendingCount;
      if (sortKey === 'completed') return b.completedCount - a.completedCount;
      if (sortKey === 'sops')      return b.uniqueSOPCount - a.uniqueSOPCount;
      return a.trainerName.localeCompare(b.trainerName);
    });
  }, [data, sortKey]);

  const summary = data?.summary || {};

  // Status badge for a trainer card
  function trainerBadge(t: any) {
    if (t.pendingCount === 0 && t.completedCount > 0)  return { cls: 'border-l-emerald-500', dot: 'bg-emerald-500', label: 'All Done', labelCls: 'bg-emerald-100 text-emerald-700' };
    if (t.retestCount  > 0)                             return { cls: 'border-l-red-500',     dot: 'bg-red-500',     label: 'Retest',   labelCls: 'bg-red-100 text-red-700' };
    if (t.pendingCount > 0)                             return { cls: 'border-l-amber-400',   dot: 'bg-amber-400',   label: 'Pending',  labelCls: 'bg-amber-100 text-amber-700' };
    return { cls: 'border-l-gray-300', dot: 'bg-gray-300', label: 'No Data', labelCls: 'bg-gray-100 text-gray-500' };
  }

  return (
    <div className="space-y-5">
      {/* ── Summary capsules ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: 'Total Trainers',    val: summary.totalTrainers   || 0, icon: GraduationCap, bg: 'bg-purple-50',  ic: 'bg-purple-100',  t: 'text-purple-700' },
          { label: 'All SOPs Done',     val: summary.allDoneTrainers || 0, icon: ShieldCheck,   bg: 'bg-emerald-50', ic: 'bg-emerald-100', t: 'text-emerald-700' },
          { label: 'Has Pending',       val: summary.pendingTrainers || 0, icon: Clock,         bg: 'bg-amber-50',   ic: 'bg-amber-100',   t: 'text-amber-700' },
          { label: 'Has Retest',        val: summary.retestTrainers  || 0, icon: RotateCw,      bg: 'bg-red-50',     ic: 'bg-red-100',     t: 'text-red-600' },
          { label: 'Unique SOPs',       val: summary.totalSOPs       || 0, icon: BookOpen,      bg: 'bg-blue-50',    ic: 'bg-blue-100',    t: 'text-blue-700' },
          { label: 'Total Completed',   val: summary.totalCompleted  || 0, icon: CheckCheck,    bg: 'bg-teal-50',    ic: 'bg-teal-100',    t: 'text-teal-700' },
          { label: 'Total Pending',     val: summary.totalPending    || 0, icon: AlertCircle,   bg: 'bg-orange-50',  ic: 'bg-orange-100',  t: 'text-orange-700' },
        ].map(({ label, val, icon: Icon, bg, ic, t }) => (
          <div key={label} className={`${bg} rounded-2xl p-3 flex items-center gap-3 shadow-sm border border-white`}>
            <div className={`${ic} flex h-9 w-9 shrink-0 items-center justify-center rounded-xl`}>
              <Icon className={`h-4 w-4 ${t}`} />
            </div>
            <div>
              <p className={`text-lg font-black ${t}`}>{loading ? '…' : val}</p>
              <p className="text-[10px] font-semibold text-gray-500 leading-tight">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search trainer / department…"
            className="w-52 rounded-xl border border-gray-200 pl-8 pr-3 py-1.5 text-xs focus:border-purple-400 focus:outline-none" />
        </div>
        <select value={dept} onChange={e => setDept(e.target.value)}
          className="rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs focus:border-purple-400 focus:outline-none">
          <option value="all">All Departments</option>
          {(data?.departments || []).map((d: string) => <option key={d} value={d}>{d}</option>)}
        </select>
        {/* Status filter pills */}
        <div className="flex items-center gap-1">
          {[
            { k: 'all',          l: 'All'       },
            { k: 'all_done',     l: '✓ All Done' },
            { k: 'has_pending',  l: '√ Pending'  },
            { k: 'has_retest',   l: '↻ Retest'   },
          ].map(({ k, l }) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                statusFilter === k ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-purple-50'
              }`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <SortAsc className="h-3.5 w-3.5 text-gray-400" />
          {[
            { k: 'pending'   as const, l: 'Most Pending'  },
            { k: 'completed' as const, l: 'Most Done'     },
            { k: 'sops'      as const, l: 'Most SOPs'     },
            { k: 'name'      as const, l: 'Name'          },
          ].map(({ k, l }) => (
            <button key={k} onClick={() => setSortKey(k)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                sortKey === k ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-purple-50'
              }`}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{trainers.length} trainers</span>
      </div>

      {/* ── Trainer Cards ── */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-44 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : trainers.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white text-sm text-gray-400">
          No trainer data found. Ensure training matrix files with trainer names are uploaded.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {trainers.map(t => {
            const badge   = trainerBadge(t);
            const compPct = t.totalRecords > 0
              ? Math.round((t.completedCount / t.totalRecords) * 100) : 0;
            return (
              <button key={t.trainerName}
                onClick={() => setSelectedTrainer(t)}
                className={`text-left rounded-2xl border border-gray-200 border-l-4 ${badge.cls} bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-purple-300`}>

                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`h-2 w-2 rounded-full ${badge.dot} shrink-0`} />
                      <p className="font-bold text-gray-900 text-sm leading-tight truncate">{t.trainerName}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(t.departments || []).slice(0, 2).map((d: string) => (
                        <span key={d} className="text-[9px] font-semibold bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-px rounded-full">{d}</span>
                      ))}
                      {(t.departments || []).length > 2 && (
                        <span className="text-[9px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-px rounded-full">+{t.departments.length - 2}</span>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full ${badge.labelCls}`}>{badge.label}</span>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-gray-500">Completion</span>
                    <span className={`font-black ${pctColor(compPct)}`}>{compPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className={`h-2 rounded-full transition-all ${pctBg(compPct)}`} style={{ width: `${compPct}%` }} />
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-4 gap-1 text-center mb-3">
                  <div className="rounded-lg bg-blue-50 py-1.5">
                    <p className="text-xs font-black text-blue-700">{t.uniqueSOPCount}</p>
                    <p className="text-[8px] text-blue-500 font-semibold">SOPs</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 py-1.5">
                    <p className="text-xs font-black text-emerald-700">{t.completedCount}</p>
                    <p className="text-[8px] text-emerald-500 font-semibold">Done</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 py-1.5">
                    <p className="text-xs font-black text-amber-700">{t.pendingCount}</p>
                    <p className="text-[8px] text-amber-500 font-semibold">Pending</p>
                  </div>
                  <div className="rounded-lg bg-red-50 py-1.5">
                    <p className="text-xs font-black text-red-600">{t.retestCount}</p>
                    <p className="text-[8px] text-red-400 font-semibold">Retest</p>
                  </div>
                </div>

                {/* Footer: employees + pass rate */}
                <div className="flex items-center justify-between text-[10px] text-gray-500 border-t border-gray-100 pt-2">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{t.uniqueEmpCount} employees</span>
                  {t.passRate > 0 && (
                    <span className={`font-bold ${t.passRate >= 80 ? 'text-emerald-600' : t.passRate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {t.passRate}% pass rate
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Trainer Detail Panel ── */}
      {selectedTrainer && (
        <TrainerDetailPanel
          trainer={selectedTrainer}
          onClose={() => setSelectedTrainer(null)}
          expandedSop={expandedSop}
          setExpandedSop={setExpandedSop}
        />
      )}
    </div>
  );
}

// ─── Trainer Detail Panel ─────────────────────────────────────────────────────
function TrainerDetailPanel({ trainer, onClose, expandedSop, setExpandedSop }: {
  trainer: any;
  onClose: () => void;
  expandedSop: string | null;
  setExpandedSop: (s: string | null) => void;
}) {
  const [sopSearch, setSopSearch] = useState('');
  const [statusTab, setStatusTab] = useState<'all' | 'done' | 'pending' | 'retest'>('all');

  const compPct = trainer.totalRecords > 0
    ? Math.round((trainer.completedCount / trainer.totalRecords) * 100) : 0;

  const filteredSops = useMemo(() => {
    let s: any[] = trainer.sopSummary || [];
    if (statusTab === 'done')    s = s.filter((x: any) => x.allCompleted);
    if (statusTab === 'pending') s = s.filter((x: any) => x.pending > 0);
    if (statusTab === 'retest')  s = s.filter((x: any) => x.retests > 0);
    if (sopSearch) s = s.filter((x: any) =>
      x.sopIdentifier.toLowerCase().includes(sopSearch.toLowerCase()) ||
      (x.sopName || '').toLowerCase().includes(sopSearch.toLowerCase())
    );
    return s;
  }, [trainer.sopSummary, statusTab, sopSearch]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-purple-700 to-indigo-600 px-5 py-5 shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                  <GraduationCap className="h-4 w-4 text-white" />
                </div>
                <h2 className="font-bold text-white text-xl leading-tight">{trainer.trainerName}</h2>
              </div>
              <div className="flex flex-wrap gap-1">
                {(trainer.departments || []).map((d: string) => (
                  <span key={d} className="text-[10px] font-semibold bg-white/20 text-white px-2 py-px rounded-full">{d}</span>
                ))}
              </div>
            </div>
            <button onClick={onClose} className="rounded-xl p-1.5 hover:bg-white/20 text-white shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { l: 'Total SOPs',  v: trainer.uniqueSOPCount,   bg: 'bg-white/10' },
              { l: 'Completed',   v: trainer.completedCount,   bg: 'bg-emerald-500/30' },
              { l: 'Pending',     v: trainer.pendingCount,     bg: 'bg-amber-400/30' },
              { l: 'Retest',      v: trainer.retestCount,      bg: 'bg-red-400/30' },
            ].map(s => (
              <div key={s.l} className={`${s.bg} rounded-xl p-2 text-center`}>
                <p className="text-lg font-black text-white">{s.v}</p>
                <p className="text-[9px] text-purple-200 font-semibold">{s.l}</p>
              </div>
            ))}
          </div>

          {/* Secondary stats */}
          <div className="flex items-center gap-4 text-[11px] text-purple-200 mb-3">
            <span><Users className="inline h-3 w-3 mr-0.5" />{trainer.uniqueEmpCount} employees trained</span>
            {trainer.avgScore != null && <span><Star className="inline h-3 w-3 mr-0.5" />Avg score: {trainer.avgScore}</span>}
            {trainer.passRate > 0 && <span><ShieldCheck className="inline h-3 w-3 mr-0.5" />{trainer.passRate}% pass rate</span>}
          </div>

          {/* Completion bar */}
          <div>
            <div className="flex justify-between text-[11px] text-white/80 mb-1">
              <span>Overall Completion</span>
              <span className="font-bold">{compPct}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/20">
              <div className="h-2.5 rounded-full bg-white transition-all" style={{ width: `${compPct}%` }} />
            </div>
          </div>
        </div>

        {/* SOP list header + filters */}
        <div className="sticky top-[220px] z-10 border-b border-gray-200 bg-white px-5 py-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-purple-600" />SOP Coverage
            </h3>
            <span className="text-[10px] text-gray-400">{filteredSops.length} of {(trainer.sopSummary || []).length} SOPs</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
              <input value={sopSearch} onChange={e => setSopSearch(e.target.value)} placeholder="Search SOP code or name…"
                className="w-full rounded-xl border border-gray-200 pl-7 pr-3 py-1.5 text-xs focus:border-purple-400 focus:outline-none" />
            </div>
            <div className="flex items-center gap-1">
              {[
                { k: 'all'     as const, l: 'All'     },
                { k: 'done'    as const, l: '✓ Done'  },
                { k: 'pending' as const, l: '√ Pend'  },
                { k: 'retest'  as const, l: '↻ Retest' },
              ].map(({ k, l }) => (
                <button key={k} onClick={() => setStatusTab(k)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                    statusTab === k ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-purple-50'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SOP list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {filteredSops.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No SOPs match the current filter</p>
          ) : filteredSops.map((sop: any) => {
            const isExpanded = expandedSop === sop.sopIdentifier;
            const sopTotal   = sop.completed + sop.pending + sop.inProgress;
            const sopPct     = sopTotal > 0 ? Math.round((sop.completed / sopTotal) * 100) : 0;

            return (
              <div key={sop.sopIdentifier}
                className={`rounded-2xl border transition-all overflow-hidden ${
                  sop.allCompleted      ? 'border-emerald-200 bg-emerald-50/40' :
                  sop.retests > 0       ? 'border-red-200 bg-red-50/30'         :
                  sop.pending > 0       ? 'border-amber-200 bg-amber-50/30'     :
                  'border-gray-200 bg-white'
                }`}>

                {/* SOP row */}
                <button
                  onClick={() => setExpandedSop(isExpanded ? null : sop.sopIdentifier)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/60 transition-colors">

                  {/* Status dot */}
                  <span className={`shrink-0 h-2.5 w-2.5 rounded-full ${
                    sop.allCompleted ? 'bg-emerald-500' :
                    sop.retests > 0  ? 'bg-red-500'     :
                    sop.pending > 0  ? 'bg-amber-400'   : 'bg-gray-300'
                  }`} />

                  {/* SOP info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono font-black text-purple-700 text-sm">{sop.sopIdentifier}</p>
                      {sop.sopName && sop.sopName !== sop.sopIdentifier && (
                        <p className="text-xs text-gray-600 truncate max-w-[200px]">{sop.sopName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                        <Users className="h-3 w-3" />{sop.uniqueEmployees} employees
                      </span>
                      {sop.lastTrainingDate && (
                        <span className="text-[10px] text-gray-400">
                          Last: {new Date(sop.lastTrainingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Completion badge + mini progress */}
                  <div className="shrink-0 flex items-center gap-2">
                    <div className="text-right">
                      <p className={`text-sm font-black ${pctColor(sopPct)}`}>{sopPct}%</p>
                      <div className="w-16 h-1.5 rounded-full bg-gray-200 mt-0.5">
                        <div className={`h-1.5 rounded-full ${pctBg(sopPct)}`} style={{ width: `${sopPct}%` }} />
                      </div>
                    </div>
                    {isExpanded
                      ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                    }
                  </div>
                </button>

                {/* Expanded breakdown */}
                {isExpanded && (
                  <div className="border-t border-gray-200/60 px-4 pb-4 pt-3 bg-white/80">
                    {/* Stat pills */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {[
                        { label: 'Completed',   val: sop.completed,   bg: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                        { label: 'Pending',     val: sop.pending,     bg: 'bg-amber-100 text-amber-700 border-amber-200' },
                        { label: 'In Progress', val: sop.inProgress,  bg: 'bg-blue-100 text-blue-700 border-blue-200' },
                        { label: 'Passed',      val: sop.passed,      bg: 'bg-teal-100 text-teal-700 border-teal-200' },
                        { label: 'Failed',      val: sop.failed,      bg: 'bg-red-100 text-red-600 border-red-200' },
                        { label: 'Retest',      val: sop.retests,     bg: 'bg-orange-100 text-orange-700 border-orange-200' },
                      ].filter(s => s.val > 0).map(s => (
                        <span key={s.label} className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${s.bg}`}>
                          {s.label}: {s.val}
                        </span>
                      ))}
                    </div>

                    {/* Employees under this SOP */}
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                      Employees under this SOP ({sop.uniqueEmployees})
                    </p>
                    {sop.uniqueEmployees === 0 ? (
                      <p className="text-xs text-gray-400">No employee records</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {/* We show count only since individual names need a deeper query */}
                        <span className="text-xs text-gray-600 bg-gray-100 border border-gray-200 px-2 py-1 rounded-lg">
                          {sop.uniqueEmployees} {sop.uniqueEmployees === 1 ? 'employee' : 'employees'} trained
                        </span>
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${sop.allCompleted ? 'bg-emerald-100 text-emerald-700' : sop.pending > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                          {sop.allCompleted ? '✓ All completed' : `${sop.pending} pending`}
                        </span>
                        {sop.retests > 0 && (
                          <span className="text-xs font-bold px-2 py-1 rounded-lg bg-red-100 text-red-700">
                            {sop.retests} need retest
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TrainingMatrixDashboard() {
  const [viewMode, setViewMode]   = useState<ViewMode>('month');
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dashData, setDashData]   = useState<any>(null);

  // Filters
  const [dept, setDept]   = useState('all');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear]   = useState(new Date().getFullYear());
  const [search, setSearch] = useState('');

  const refresh = () => setRefreshKey(k => k + 1);

  // Load dashboard stats
  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dept !== 'all') p.set('department', dept);
    if (search)         p.set('search', search);
    fetch(`/api/training-matrix/dashboard-stats?${p}`)
      .then(r => r.json())
      .then(d => { if (d.success) setDashData(d); })
      .finally(() => setLoading(false));
  }, [dept, search, refreshKey]);

  const kpi        = dashData?.overallKpi     || {};
  const deptBreak  = dashData?.deptBreakdown  || [];
  const employees  = dashData?.employeeSummary || [];
  const trend      = dashData?.monthlyTrend   || [];
  const capsules   = dashData?.monthCapsules  || [];
  const deptOpts   = dashData?.departments    || [];
  const yearOpts   = dashData?.years          || [];

  const handleMonthChange = (m: number, y: number) => { setMonth(m); setYear(y); };

  // Export CSV
  const exportCSV = () => {
    const rows = [
      ['Employee', 'Designation', 'Department', 'Required', 'Completed', 'Pending', 'Not Required', 'Completion %'],
      ...employees.map((e: any) => [
        e.employeeName, e.designation || '', e.department,
        e.required, e.completed, e.pending, e.not_required || 0, e.pct,
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a   = document.createElement('a');
    a.href    = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `training-matrix-${MONTH_NAMES[month]}-${year}.csv`;
    a.click();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa]">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 shadow-sm">
              <BarChart2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Training Matrix</h1>
              <p className="text-[10px] text-gray-500">Department-wise SOP training tracker</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Dept filter */}
            <div className="relative">
              <Filter className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
              <select value={dept} onChange={e => setDept(e.target.value)}
                className="rounded-xl border border-gray-200 pl-6 pr-2.5 py-1.5 text-xs font-medium text-gray-700 focus:border-purple-400 focus:outline-none bg-white">
                <option value="all">All Departments</option>
                {deptOpts.map((d: string) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <button onClick={refresh} className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50" title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-purple-500' : ''}`} />
            </button>
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 shadow-sm">
              <Upload className="h-3.5 w-3.5" /> Upload Matrix
            </button>
          </div>
        </div>

        {/* View mode tabs */}
        <div className="flex items-center gap-1 border-t border-gray-100 px-4 pt-2 pb-2">
          {([
            { id: 'month'    as ViewMode, label: 'Month-wise View',    icon: Calendar       },
            { id: 'employee' as ViewMode, label: 'Employee-wise View', icon: Users          },
            { id: 'trainer'  as ViewMode, label: 'Trainer View',       icon: GraduationCap  },
          ]).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setViewMode(id)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === id ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
              }`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Overall KPI Bar ── */}
      <section className="grid grid-cols-2 gap-2 border-b border-gray-200 bg-white px-4 py-3 sm:grid-cols-4 lg:grid-cols-7">
        {loading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
          ))
        ) : (
          [
            { label: 'Employees',   val: kpi.employeeCount   || 0,   color: 'text-purple-700 bg-purple-50',   icon: Users        },
            { label: 'Total SOPs',  val: kpi.sopCount        || 0,   color: 'text-blue-700 bg-blue-50',       icon: BookOpen     },
            { label: 'Departments', val: kpi.departmentCount || 0,   color: 'text-indigo-700 bg-indigo-50',   icon: Building2    },
            { label: '√ Required',  val: kpi.pending         || 0,   color: 'text-amber-700 bg-amber-50',     icon: Clock        },
            { label: '✓ Completed', val: kpi.completed       || 0,   color: 'text-emerald-700 bg-emerald-50', icon: CheckCircle2 },
            { label: 'X Not Req',   val: kpi.not_required    || 0,   color: 'text-red-600 bg-red-50',         icon: XCircle      },
            { label: 'Completion',  val: `${kpi.pending + kpi.completed > 0 ? Math.round((kpi.completed / (kpi.pending + kpi.completed)) * 100) : 0}%`,
              color: (kpi.pending + kpi.completed) > 0
                ? kpi.completed / (kpi.pending + kpi.completed) >= 0.8 ? 'text-emerald-700 bg-emerald-50'
                : kpi.completed / (kpi.pending + kpi.completed) >= 0.5  ? 'text-amber-700 bg-amber-50'
                : 'text-red-600 bg-red-50'
                : 'text-gray-500 bg-gray-50',
              icon: TrendingUp },
          ].map(({ label, val, color, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white p-2.5 shadow-sm">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-gray-500 leading-tight">{label}</p>
                <p className="text-sm font-black text-gray-800">{val}</p>
              </div>
            </div>
          ))
        )}
      </section>

      {/* ── Month Capsule Bar ── */}
      {capsules.length > 0 && (
        <section className="flex gap-2 overflow-x-auto border-b border-gray-200 bg-gray-50/80 px-4 py-2">
          {capsules.map((m: any) => {
            const active = month === m.month && year === m.year;
            return (
              <button key={`${m.year}-${m.month}`}
                onClick={() => { setViewMode('month'); handleMonthChange(m.month, m.year); }}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-all hover:shadow-md ${
                  active ? 'bg-purple-600 border-purple-600 shadow-sm' : 'bg-white border-gray-200 hover:border-purple-300'
                }`}>
                <p className={`text-xs font-bold ${active ? 'text-white' : 'text-gray-800'}`}>{MONTH_SHORT[m.month]} {m.year}</p>
                <p className={`text-[9px] mt-0.5 ${active ? 'text-purple-200' : 'text-gray-500'}`}>{m.sopCount} SOPs · {m.employeeCount} emp</p>
                <div className="mt-1 flex items-center gap-1">
                  <span className={`text-[9px] font-bold px-1 py-px rounded ${active ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>✓{m.completed}</span>
                  <span className={`text-[9px] font-bold px-1 py-px rounded ${active ? 'bg-amber-400/30 text-amber-100' : 'bg-amber-100 text-amber-700'}`}>√{m.pending}</span>
                  <span className={`text-[9px] font-bold px-1 py-px rounded ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>{m.pct}%</span>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* ── Main Content ── */}
      {loading && !dashData ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-purple-500 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading training matrix…</p>
          </div>
        </div>
      ) : !dashData || (employees.length === 0 && capsules.length === 0) ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400">
          <FileSpreadsheet className="h-14 w-14 opacity-30" />
          <p className="font-bold text-gray-600">No training data found</p>
          <p className="text-sm">Upload department-wise training matrix files to get started</p>
          <button onClick={() => setShowUpload(true)}
            className="mt-2 flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 shadow-sm">
            <Upload className="h-4 w-4" /> Upload Training Matrix
          </button>
        </div>
      ) : (
        <main className="flex-1 p-4 space-y-5">

          {/* ── MONTH-WISE VIEW ── */}
          {viewMode === 'month' && (
            <div className="space-y-5">
              <MonthView dept={dept} month={month} year={year} onMonthChange={handleMonthChange} />

              {/* Trends + Notifications row */}
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <TrendSection monthlyTrend={trend} deptBreakdown={deptBreak} />
                </div>
                <div>
                  <NotificationsPanel employees={employees} />
                </div>
              </div>
            </div>
          )}

          {/* ── EMPLOYEE-WISE VIEW ── */}
          {viewMode === 'employee' && (
            <div className="space-y-5">
              <EmployeeView
                employees={employees}
                records={[]}
                search={search}
                onSearchChange={setSearch}
              />

              {/* Trends row */}
              <TrendSection monthlyTrend={trend} deptBreakdown={deptBreak} />

              {/* Notifications */}
              <NotificationsPanel employees={employees} />
            </div>
          )}

          {/* ── TRAINER VIEW ── */}
          {viewMode === 'trainer' && (
            <TrainerView />
          )}

        </main>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={refresh} />}
    </div>
  );
}
