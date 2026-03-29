'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Upload, RefreshCw, Search, Filter, Download,
  Users, BookOpen, CheckCircle2, XCircle, Clock, BarChart2,
  ChevronDown, X, Plus, Trash2, AlertCircle, TrendingUp,
  FileSpreadsheet, Calendar, Building2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────
type TrainingStatus = 'completed' | 'not_required' | 'na' | 'pending';

interface EmployeeRow {
  employeeName: string;
  designation: string;
  department: string;
  trainings: Record<string, { status: TrainingStatus; raw: string }>;
  completed: number;
  not_required: number;
  na: number;
  pending: number;
  required: number;
  completionPct: number;
}

interface KPI {
  total: number; completed: number; not_required: number;
  na: number; pending: number; employeeCount: number;
  sopCount: number; departmentCount: number;
}

interface DeptStat {
  department: string; total: number; completed: number;
  pending: number; employeeCount: number; pct: number;
}

interface ExamRecord {
  _id: string; employeeName: string; department: string;
  designation?: string; sopCode: string; sopName?: string;
  examDate: string; score?: number; maxScore?: number;
  passFail: 'pass' | 'fail' | 'pending'; retrainingRequired: boolean;
  remarks?: string;
}

const DEPARTMENTS = ['All','QA','QC','Production','Engineering','Store','Personnel','Microbiology','R&D'];
const STATUS_COLORS: Record<TrainingStatus, string> = {
  completed:    'bg-emerald-100 text-emerald-800',
  not_required: 'bg-red-100 text-red-700',
  na:           'bg-gray-100 text-gray-500',
  pending:      'bg-amber-100 text-amber-700',
};
const STATUS_CELL: Record<TrainingStatus, string> = {
  completed:    'bg-emerald-100 text-emerald-700 font-bold',
  not_required: 'bg-red-50 text-red-500',
  na:           'bg-gray-50 text-gray-400',
  pending:      'bg-amber-50 text-amber-600',
};
const STATUS_DISPLAY: Record<TrainingStatus, string> = {
  completed: '√', not_required: 'X', na: '--', pending: '?',
};
const CHART_COLORS = ['#7c3aed','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6'];

const MONTH_NAMES = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

const TRAINING_MATRIX_FILE_RE = /\.(xlsx|xls|xlsm|docx|doc)$/i;

function isTrainingMatrixUploadFile(f: File): boolean {
  return TRAINING_MATRIX_FILE_RE.test(f.name);
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [dept, setDept] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [fileType, setFileType] = useState<'main' | 'addendum'>('main');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [rejectHint, setRejectHint] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const appendMatrixFiles = (incoming: File[]) => {
    const ok = incoming.filter(isTrainingMatrixUploadFile);
    const other = incoming.filter((f) => !isTrainingMatrixUploadFile(f));
    if (other.length) {
      setRejectHint('Use Excel (.xlsx, .xls, .xlsm) or Word (.docx, .doc). PDF and images are not supported.');
    } else {
      setRejectHint('');
    }
    if (ok.length) setFiles((p) => [...p, ...ok]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    appendMatrixFiles(Array.from(e.dataTransfer.files));
  };

  const handleUpload = async () => {
    if (!files.length) {
      setError('Select at least one Excel or Word file.');
      return;
    }
    const bad = files.filter((f) => !isTrainingMatrixUploadFile(f));
    if (bad.length) {
      setError(
        'Remove unsupported files. Allowed: .xlsx, .xls, .xlsm, .docx, .doc (prefer .docx).',
      );
      return;
    }
    setUploading(true); setError(''); setResults([]);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('file', f));
      if (dept) fd.set('department', dept);
      fd.set('month', String(month));
      fd.set('year', String(year));
      fd.set('fileType', fileType);

      const res = await fetch('/api/training-matrix/upload', { method: 'POST', body: fd });
      let data: { success?: boolean; error?: string; results?: unknown } = {};
      try {
        data = await res.json();
      } catch {
        setError(res.ok ? 'Invalid server response' : `Upload failed (${res.status})`);
        return;
      }
      const list = Array.isArray(data.results) ? data.results : [];
      setResults(list);
      if (!res.ok || !data.success) {
        setError(data.error || `Upload failed (${res.status})`);
        return;
      }
      const anyOk = list.some((r: { ok?: boolean }) => r && r.ok === true);
      if (!anyOk) {
        const firstErr = list.find((r: { ok?: boolean; error?: string }) => r && r.ok === false) as
          | { error?: string }
          | undefined;
        setError(
          firstErr?.error ||
            'No rows were imported. For Excel, use a sheet with names and SOP columns; for Word, use a real table with the same layout.',
        );
        return;
      }
      onSuccess();
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-purple-600" /> Upload Training Matrix
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          {/* Drop zone */}
          <div
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-lg border-2 border-dashed border-purple-300 bg-purple-50 p-6 text-center hover:bg-purple-100"
          >
            <Upload className="mx-auto h-8 w-8 text-purple-400 mb-2" />
            <p className="text-sm font-medium text-purple-700">Drag & drop files or click to browse</p>
            <p className="text-xs text-gray-500 mt-1">
              Excel .xlsx / .xls / .xlsm · Word .docx (table layout) · legacy .doc not recommended
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.ms-excel"
              multiple
              className="sr-only"
              onChange={(e) => {
                appendMatrixFiles(Array.from(e.target.files || []));
                e.target.value = '';
              }}
            />
          </div>
          {rejectHint ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{rejectHint}</p>
          ) : null}
          {files.length > 0 && (
            <ul className="space-y-1 max-h-32 overflow-y-auto text-xs">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5">
                  <span className="truncate text-gray-700">{f.name}</span>
                  <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="ml-2 text-red-400 hover:text-red-600"><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}
          {/* Config */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Department (optional override)</label>
              <select value={dept} onChange={e => setDept(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                <option value="">Auto-detect from filename</option>
                {DEPARTMENTS.filter(d => d !== 'All').map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">File Type</label>
              <select value={fileType} onChange={e => setFileType(e.target.value as any)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                <option value="main">Main Matrix</option>
                <option value="addendum">Addendum</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Month (override)</label>
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                {MONTH_NAMES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Year</label>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {error && <p className="rounded bg-red-50 p-2 text-xs text-red-600">{error}</p>}

          {results.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className={`rounded px-3 py-2 text-xs ${r.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                  <strong>{r.fileName}</strong>: {r.ok ? `${r.employees} employees, ${r.sops} SOPs, ${r.records} records imported` : r.error}
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
            {uploading ? 'Uploading...' : 'Upload & Parse'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Exam Record Modal ────────────────────────────────────────────────────
function AddExamModal({ employees, department, onClose, onSuccess }: {
  employees: EmployeeRow[]; department: string; onClose: () => void; onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    employeeName: '', sopCode: '', sopName: '', examDate: new Date().toISOString().slice(0,10),
    score: '', maxScore: '100', passFail: 'pass', retrainingRequired: false, remarks: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.employeeName || !form.sopCode || !form.examDate) { setError('Employee, SOP, and Exam Date are required.'); return; }
    setSaving(true); setError('');
    try {
      const d = new Date(form.examDate);
      const res = await fetch('/api/training-matrix/exam-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form, department,
          score: form.score ? Number(form.score) : undefined,
          maxScore: form.maxScore ? Number(form.maxScore) : undefined,
          month: d.getMonth() + 1, year: d.getFullYear(),
        }),
      });
      const data = await res.json();
      if (data.success) { onSuccess(); onClose(); }
      else setError(data.error || 'Failed to save');
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-bold text-gray-800">Add Exam Record</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Employee Name *</label>
              <input list="emp-list" value={form.employeeName} onChange={e => set('employeeName', e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="Type name..." />
              <datalist id="emp-list">
                {employees.map(e => <option key={e.employeeName} value={e.employeeName} />)}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">SOP Code *</label>
              <input value={form.sopCode} onChange={e => set('sopCode', e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="PEGE04-06" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Exam Date *</label>
              <input type="date" value={form.examDate} onChange={e => set('examDate', e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Score</label>
              <input type="number" value={form.score} onChange={e => set('score', e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="e.g. 85" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Max Score</label>
              <input type="number" value={form.maxScore} onChange={e => set('maxScore', e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Pass / Fail</label>
              <select value={form.passFail} onChange={e => set('passFail', e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input type="checkbox" id="retrain" checked={form.retrainingRequired} onChange={e => set('retrainingRequired', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-purple-600" />
              <label htmlFor="retrain" className="text-xs font-semibold text-gray-600">Retraining Required</label>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Remarks</label>
              <textarea value={form.remarks} onChange={e => set('remarks', e.target.value)} rows={2} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Save Record
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TrainingMatrixPage() {
  const [activeTab, setActiveTab]         = useState<'matrix' | 'exams' | 'charts'>('matrix');
  const [dept, setDept]                   = useState('all');
  const [month, setMonth]                 = useState('all');
  /** Default "all" so new uploads are visible; a fixed year hid rows when file year ≠ current year. */
  const [year, setYear]                   = useState('all');
  const [search, setSearch]               = useState('');
  const [sopSearch, setSopSearch]         = useState('');
  const [designationF, setDesignationF]   = useState('all');
  const [statusF, setStatusF]             = useState('all');
  const [showUpload, setShowUpload]       = useState(false);
  const [showAddExam, setShowAddExam]     = useState(false);
  const [loading, setLoading]             = useState(true);
  const [statsLoading, setStatsLoading]   = useState(true);
  const [employees, setEmployees]         = useState<EmployeeRow[]>([]);
  const [sopCodes, setSopCodes]           = useState<string[]>([]);
  const [filters, setFilters]             = useState<any>({ departments: [], years: [], months: [], designations: [] });
  const [kpi, setKpi]                     = useState<KPI | null>(null);
  const [deptBreakdown, setDeptBreakdown] = useState<DeptStat[]>([]);
  const [monthlyTrend, setMonthlyTrend]   = useState<any[]>([]);
  const [topEmployees, setTopEmployees]   = useState<any[]>([]);
  const [sopPending, setSopPending]       = useState<any[]>([]);
  const [examRecords, setExamRecords]     = useState<ExamRecord[]>([]);
  const [examSearch, setExamSearch]       = useState('');
  const [refreshKey, setRefreshKey]       = useState(0);

  const refresh = () => setRefreshKey(k => k + 1);

  // Fetch matrix data
  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dept  !== 'all') p.set('department', dept);
    if (month !== 'all') p.set('month', month);
    if (year  !== 'all') p.set('year', year);
    if (search)          p.set('search', search);
    if (sopSearch)       p.set('sop', sopSearch);
    if (designationF !== 'all') p.set('designation', designationF);
    if (statusF      !== 'all') p.set('status', statusF);

    fetch(`/api/training-matrix/data?${p}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) { setEmployees(d.employees); setSopCodes(d.sopCodes); setFilters(d.filters); }
      })
      .finally(() => setLoading(false));
  }, [dept, month, year, search, sopSearch, designationF, statusF, refreshKey]);

  // Fetch stats
  useEffect(() => {
    setStatsLoading(true);
    const p = new URLSearchParams();
    if (dept  !== 'all') p.set('department', dept);
    if (month !== 'all') p.set('month', month);
    if (year  !== 'all') p.set('year', year);

    fetch(`/api/training-matrix/stats?${p}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setKpi(d.kpi); setDeptBreakdown(d.deptBreakdown);
          setMonthlyTrend(d.monthlyTrend); setTopEmployees(d.topEmployees);
          setSopPending(d.sopPending);
        }
      })
      .finally(() => setStatsLoading(false));
  }, [dept, month, year, refreshKey]);

  // Fetch exam records
  useEffect(() => {
    const p = new URLSearchParams();
    if (dept !== 'all') p.set('department', dept);
    if (year !== 'all') p.set('year', year);
    if (examSearch)     p.set('search', examSearch);

    fetch(`/api/training-matrix/exam-records?${p}`)
      .then(r => r.json())
      .then(d => { if (d.success) setExamRecords(d.records); });
  }, [dept, year, examSearch, refreshKey]);

  const deleteExam = async (id: string) => {
    if (!confirm('Delete this exam record?')) return;
    await fetch('/api/training-matrix/exam-records', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    refresh();
  };

  // Visible SOP codes (after sopSearch filter applied client-side too)
  const visibleSops = useMemo(() =>
    sopSearch ? sopCodes.filter(s => s.toLowerCase().includes(sopSearch.toLowerCase())) : sopCodes,
    [sopCodes, sopSearch]
  );

  const completionPct = kpi ? (kpi.total > 0 ? Math.round(kpi.completed / kpi.total * 100) : 0) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600">
              <BarChart2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Training Matrix</h1>
              <p className="text-[10px] text-gray-500">Department-wise SOP training tracker</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Filters */}
            <select value={dept} onChange={e => setDept(e.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:border-purple-500 focus:outline-none">
              <option value="all">All Departments</option>
              {filters.departments.map((d: string) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={month} onChange={e => setMonth(e.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:border-purple-500 focus:outline-none">
              <option value="all">All Months</option>
              {filters.months?.map((m: any) => <option key={m.month} value={m.month}>{m.monthName}</option>)}
            </select>
            <select value={year} onChange={e => setYear(e.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:border-purple-500 focus:outline-none">
              <option value="all">All Years</option>
              {filters.years?.map((y: number) => <option key={y} value={String(y)}>{y}</option>)}
            </select>
            <button onClick={refresh} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100" title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700">
              <Upload className="h-3.5 w-3.5" /> Upload Matrix
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-2.5 flex gap-1 border-t border-gray-100 pt-2">
          {(['matrix','charts','exams'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                activeTab === tab ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'
              }`}>
              {tab === 'matrix' ? 'Matrix View' : tab === 'charts' ? 'Charts' : 'Exam Records'}
            </button>
          ))}
        </div>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: 'Employees',    val: kpi?.employeeCount, icon: Users,       color: 'text-purple-600 bg-purple-50' },
          { label: 'SOPs',         val: kpi?.sopCount,       icon: BookOpen,    color: 'text-blue-600 bg-blue-50' },
          { label: 'Total Cells',  val: kpi?.total,          icon: BarChart2,   color: 'text-gray-600 bg-gray-50' },
          { label: 'Completed',    val: kpi?.completed,      icon: CheckCircle2,color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Pending',      val: kpi?.pending,        icon: Clock,       color: 'text-amber-600 bg-amber-50' },
          { label: 'Not Required', val: kpi?.not_required,   icon: XCircle,     color: 'text-red-500 bg-red-50' },
          { label: 'Completion %', val: `${completionPct}%`, icon: TrendingUp,  color: completionPct >= 80 ? 'text-emerald-600 bg-emerald-50' : completionPct >= 50 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50' },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="flex items-center gap-2 rounded-lg border border-gray-100 p-2.5">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-gray-500">{label}</p>
              <p className="text-sm font-bold text-gray-800">{statsLoading ? '...' : (val ?? 0)}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Department quick tabs */}
      <section className="flex gap-2 overflow-x-auto border-b border-gray-200 bg-gray-50 px-4 py-2 scrollbar-hide">
        {['all', ...filters.departments].map((d: string) => (
          <button key={d} onClick={() => setDept(d)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              dept === d ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-purple-50'
            }`}>
            {d === 'all' ? 'All Departments' : d}
            {d !== 'all' && deptBreakdown.find(b => b.department === d) && (
              <span className="ml-1.5 opacity-70">{Math.round(deptBreakdown.find(b => b.department === d)!.pct)}%</span>
            )}
          </button>
        ))}
      </section>

      {/* MATRIX VIEW */}
      {activeTab === 'matrix' && (
        <main className="flex flex-1 flex-col">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee..."
                className="w-44 rounded-md border border-gray-300 pl-7 pr-2 py-1.5 text-xs focus:border-purple-500 focus:outline-none" />
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input value={sopSearch} onChange={e => setSopSearch(e.target.value)} placeholder="Filter SOP code..."
                className="w-40 rounded-md border border-gray-300 pl-7 pr-2 py-1.5 text-xs focus:border-purple-500 focus:outline-none" />
            </div>
            <select value={designationF} onChange={e => setDesignationF(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:border-purple-500 focus:outline-none">
              <option value="all">All Designations</option>
              {filters.designations?.map((d: string) => d && <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={statusF} onChange={e => setStatusF(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:border-purple-500 focus:outline-none">
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="not_required">Not Required</option>
              <option value="na">N/A</option>
            </select>
            {(search || sopSearch || designationF !== 'all' || statusF !== 'all') && (
              <button onClick={() => { setSearch(''); setSopSearch(''); setDesignationF('all'); setStatusF('all'); }}
                className="flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-600 hover:bg-red-100">
                <X className="h-3 w-3" /> Clear
              </button>
            )}
            <span className="ml-auto text-xs text-gray-500">{employees.length} employees · {visibleSops.length} SOPs</span>
          </div>

          {/* Matrix table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-purple-600" />
              </div>
            ) : employees.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400">
                <FileSpreadsheet className="h-12 w-12 opacity-40" />
                <p className="font-medium">No training data found</p>
                <p className="text-sm">Upload a training matrix Excel file to get started</p>
                <button onClick={() => setShowUpload(true)} className="mt-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700">
                  <Upload className="mr-1.5 inline h-4 w-4" /> Upload Matrix
                </button>
              </div>
            ) : (
              <table className="min-w-max border-collapse text-xs">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gray-100">
                    <th className="sticky left-0 z-30 min-w-[180px] border border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700">Employee Name</th>
                    <th className="sticky left-[180px] z-30 min-w-[120px] border border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700">Designation</th>
                    {dept === 'all' && <th className="min-w-[100px] border border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700">Dept</th>}
                    <th className="min-w-[60px] border border-gray-200 bg-emerald-50 px-2 py-2 text-center font-semibold text-emerald-700">Done</th>
                    <th className="min-w-[60px] border border-gray-200 bg-amber-50 px-2 py-2 text-center font-semibold text-amber-700">Pending</th>
                    <th className="min-w-[60px] border border-gray-200 bg-red-50 px-2 py-2 text-center font-semibold text-red-700" title="Not Required">NR</th>
                    <th className="min-w-[60px] border border-gray-200 bg-purple-50 px-2 py-2 text-center font-semibold text-purple-700">%</th>
                    {visibleSops.map(sop => (
                      <th key={sop} className="min-w-[72px] border border-gray-200 bg-gray-100 px-2 py-2 text-center font-mono font-semibold text-gray-700"
                        title={sop}>
                        <span className="block max-w-[68px] truncate">{sop}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, ri) => (
                    <tr key={`${emp.department}-${emp.employeeName}`}
                      className={ri % 2 === 0 ? 'bg-white hover:bg-purple-50/30' : 'bg-gray-50/60 hover:bg-purple-50/30'}>
                      <td className="sticky left-0 z-10 border border-gray-200 bg-inherit px-3 py-1.5 font-medium text-gray-800">{emp.employeeName}</td>
                      <td className="sticky left-[180px] z-10 border border-gray-200 bg-inherit px-3 py-1.5 text-gray-600">{emp.designation || '-'}</td>
                      {dept === 'all' && <td className="border border-gray-200 px-2 py-1.5 text-gray-500">{emp.department}</td>}
                      <td className="border border-gray-200 px-2 py-1.5 text-center font-bold text-emerald-700">{emp.completed}</td>
                      <td className="border border-gray-200 px-2 py-1.5 text-center font-bold text-amber-700">{emp.pending}</td>
                      <td className="border border-gray-200 px-2 py-1.5 text-center font-bold text-red-700">{emp.not_required}</td>
                      <td className="border border-gray-200 px-2 py-1.5 text-center">
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${emp.completionPct >= 80 ? 'bg-emerald-100 text-emerald-700' : emp.completionPct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {emp.completionPct}%
                        </span>
                      </td>
                      {visibleSops.map(sop => {
                        const t = emp.trainings[sop];
                        const st: TrainingStatus = t?.status ?? 'pending';
                        return (
                          <td key={sop} title={`${emp.employeeName} - ${sop}: ${st}`}
                            className={`border border-gray-200 px-2 py-1.5 text-center ${STATUS_CELL[st]}`}>
                            {STATUS_DISPLAY[st]}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 border-t border-gray-200 bg-white px-4 py-2 text-xs text-gray-600">
            <span className="font-semibold">Legend:</span>
            {(['completed','pending','not_required','na'] as TrainingStatus[]).map(s => (
              <span key={s} className={`flex items-center gap-1 rounded px-2 py-0.5 ${STATUS_COLORS[s]}`}>
                <span className="font-bold">{STATUS_DISPLAY[s]}</span>
                <span className="capitalize">{s.replace('_', ' ')}</span>
              </span>
            ))}
          </div>
        </main>
      )}

      {/* CHARTS VIEW */}
      {activeTab === 'charts' && (
        <main className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2">
          {/* Dept completion */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-semibold text-gray-700 flex items-center gap-2"><Building2 className="h-4 w-4 text-purple-500" /> Department-wise Completion</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={deptBreakdown} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                <YAxis domain={[0,100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: any) => [`${Math.round(v)}%`, 'Completion']} />
                <Bar dataKey="pct" name="Completion %" radius={[4,4,0,0]}>
                  {deptBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly trend */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-semibold text-gray-700 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" /> Monthly Training Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="monthName" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="pending"   name="Pending"   stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Pending vs completed overall */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-semibold text-gray-700 flex items-center gap-2"><BarChart2 className="h-4 w-4 text-blue-500" /> Overall Status Distribution</h3>
            {kpi && (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={[
                    { name: 'Completed',    value: kpi.completed,    fill: '#10b981' },
                    { name: 'Pending',      value: kpi.pending,      fill: '#f59e0b' },
                    { name: 'Not Required', value: kpi.not_required, fill: '#ef4444' },
                    { name: 'N/A',          value: kpi.na,           fill: '#94a3b8' },
                  ]} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0)*100).toFixed(0)}%`}>
                    {['#10b981','#f59e0b','#ef4444','#94a3b8'].map((c, i) => <Cell key={i} fill={c} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top pending SOPs */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-semibold text-gray-700 flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-500" /> SOPs with Most Pending Trainings</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sopPending} layout="vertical" margin={{ top: 5, right: 10, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="sopCode" tick={{ fontSize: 10 }} width={70} />
                <Tooltip />
                <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top employees */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2">
            <h3 className="mb-3 font-semibold text-gray-700 flex items-center gap-2"><Users className="h-4 w-4 text-purple-500" /> Top Employees by Completion</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Employee</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Department</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Completed</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Pending</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">% Complete</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {topEmployees.map((e, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{e.employeeName}</td>
                      <td className="px-3 py-2 text-gray-600">{e.department}</td>
                      <td className="px-3 py-2 text-center text-emerald-700 font-semibold">{e.completed}</td>
                      <td className="px-3 py-2 text-center text-amber-700 font-semibold">{e.pending}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-full px-2 py-0.5 font-bold text-[10px] ${e.pct >= 80 ? 'bg-emerald-100 text-emerald-700' : e.pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {Math.round(e.pct)}%
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-2 w-28 rounded-full bg-gray-200">
                          <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round(e.pct)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* EXAM RECORDS */}
      {activeTab === 'exams' && (
        <main className="flex flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input value={examSearch} onChange={e => setExamSearch(e.target.value)} placeholder="Search employee..."
                className="w-44 rounded-md border border-gray-300 pl-7 pr-2 py-1.5 text-xs focus:border-purple-500 focus:outline-none" />
            </div>
            <span className="ml-auto text-xs text-gray-500">{examRecords.length} records</span>
            <button onClick={() => setShowAddExam(true)}
              className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700">
              <Plus className="h-3.5 w-3.5" /> Add Exam Record
            </button>
          </div>
          <div className="overflow-auto flex-1">
            {examRecords.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400">
                <BookOpen className="h-12 w-12 opacity-40" />
                <p className="font-medium">No exam records yet</p>
                <button onClick={() => setShowAddExam(true)} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700">
                  <Plus className="mr-1.5 inline h-4 w-4" /> Add First Record
                </button>
              </div>
            ) : (
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr>
                    {['Employee','Department','Designation','SOP','Exam Date','Score','Pass/Fail','Retrain?','Remarks',''].map(h => (
                      <th key={h} className="border-b border-gray-200 px-3 py-2 text-left font-semibold text-gray-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {examRecords.map((r, i) => (
                    <tr key={r._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 font-medium text-gray-800">{r.employeeName}</td>
                      <td className="px-3 py-2 text-gray-600">{r.department}</td>
                      <td className="px-3 py-2 text-gray-500">{r.designation || '-'}</td>
                      <td className="px-3 py-2 font-mono text-gray-700">{r.sopCode}</td>
                      <td className="px-3 py-2 text-gray-600">{new Date(r.examDate).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-center">
                        {r.score != null ? `${r.score}/${r.maxScore ?? 100}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-full px-2 py-0.5 font-bold text-[10px] ${r.passFail === 'pass' ? 'bg-emerald-100 text-emerald-700' : r.passFail === 'fail' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                          {r.passFail.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">{r.retrainingRequired ? <span className="text-amber-600 font-semibold">Yes</span> : <span className="text-gray-400">No</span>}</td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-gray-500">{r.remarks || '-'}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => deleteExam(r._id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      )}

      {/* Modals */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={() => { setShowUpload(false); refresh(); }} />}
      {showAddExam && <AddExamModal employees={employees} department={dept === 'all' ? 'Unknown' : dept} onClose={() => setShowAddExam(false)} onSuccess={refresh} />}
    </div>
  );
}
