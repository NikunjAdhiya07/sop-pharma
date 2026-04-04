'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Upload, RefreshCw, Search,
  Users, BookOpen, CheckCircle2, XCircle, Clock, BarChart2,
  X, AlertCircle, TrendingUp,
  FileSpreadsheet, Calendar,
  Award, Layers,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type TrainingStatus = 'completed' | 'not_required' | 'na' | 'pending';

interface FlatRecord {
  employeeName: string;
  designation: string;
  department: string;
  sopCode: string;
  month: number;
  monthName: string;
  year: number;
  status: TrainingStatus;
  rawSymbol: string;
}

interface EmployeeCard {
  employeeName: string;
  designation: string;
  department: string;
  totalSOPs: number;
  required: number;      // pending + completed
  notRequired: number;
  completed: number;
  pending: number;
  completionPct: number;
}

interface SOPCard {
  sopCode: string;
  department: string;
  monthName: string;
  month: number;
  year: number;
  required: number;
  notRequired: number;
}

interface MonthCapsule {
  month: number;
  monthName: string;
  year: number;
  sopCount: number;
  employeeCount: number;
  required: number;
  notRequired: number;
  completed: number;
  pending: number;
}

interface KPI {
  employees: number;
  sops: number;
  required: number;
  notRequired: number;
  completed: number;
  pending: number;
  completionPct: number;
}

const STATUS_BADGE: Record<TrainingStatus, string> = {
  pending:      'bg-green-100 text-green-800 border border-green-200',
  completed:    'bg-emerald-100 text-emerald-700 border border-emerald-200',
  not_required: 'bg-red-50 text-red-600 border border-red-200',
  na:           'bg-gray-100 text-gray-500 border border-gray-200',
};

const STATUS_SYMBOL: Record<TrainingStatus, string> = {
  pending: '√',
  completed: '✓',
  not_required: 'X',
  na: '—',
};

const MONTH_NAMES = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

const TRAINING_MATRIX_FILE_RE = /\.(xlsx|xls|xlsm|docx|doc)$/i;

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
  const inputRef = useRef<HTMLInputElement>(null);

  const DEPARTMENTS = ['QA','QC','Production','Engineering','Engineering and Maintenance','Store','Personnel','Microbiology','R&D'];

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const incoming = Array.from(e.dataTransfer.files).filter(f => TRAINING_MATRIX_FILE_RE.test(f.name));
    setFiles(p => [...p, ...incoming]);
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

      const res = await fetch('/api/training-matrix/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setResults(data.results || []);
        onSuccess();
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-bold text-gray-800 text-base">Upload Training Matrix</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/40 px-4 py-6 text-center hover:bg-purple-50 transition-colors">
            <FileSpreadsheet className="mx-auto h-8 w-8 text-purple-400 mb-2" />
            <p className="text-sm font-semibold text-gray-700">Drop Excel or Word files here</p>
            <p className="text-xs text-gray-500 mt-1">.xlsx, .xls, .xlsm, .docx supported</p>
            <input ref={inputRef} type="file" multiple accept=".xlsx,.xls,.xlsm,.docx,.doc" className="hidden"
              onChange={e => setFiles(p => [...p, ...Array.from(e.target.files || [])])} />
          </div>

          {files.length > 0 && (
            <ul className="space-y-1 max-h-28 overflow-y-auto text-xs">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5">
                  <span className="truncate text-gray-700">{f.name}</span>
                  <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="ml-2 text-red-400 hover:text-red-600"><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Department (override)</label>
              <select value={dept} onChange={e => setDept(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                <option value="">Auto-detect</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
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
              <label className="mb-1 block text-xs font-semibold text-gray-600">Month</label>
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
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className={`rounded px-3 py-2 text-xs ${r.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
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

// ─── Employee Detail Modal ────────────────────────────────────────────────────
function EmployeeDetailModal({ emp, records, onClose }: {
  emp: EmployeeCard;
  records: FlatRecord[];
  onClose: () => void;
}) {
  // Deduplicate SOPs: pick best status per SOP code
  const priority: Record<string, number> = { completed: 3, pending: 2, not_required: 1, na: 0 };
  const sopStatusMap = new Map<string, FlatRecord>();

  for (const r of records) {
    if (r.employeeName !== emp.employeeName || r.department !== emp.department) continue;
    if (r.status === 'na') continue;
    const existing = sopStatusMap.get(r.sopCode);
    const existingP = existing ? (priority[existing.status] ?? 0) : -1;
    const newP = priority[r.status] ?? 0;
    if (newP > existingP) sopStatusMap.set(r.sopCode, r);
  }

  const uniqueRecords = Array.from(sopStatusMap.values()).sort((a, b) => a.sopCode.localeCompare(b.sopCode));
  const required  = uniqueRecords.filter(r => r.status === 'pending' || r.status === 'completed');
  const notReq    = uniqueRecords.filter(r => r.status === 'not_required');
  const completed = uniqueRecords.filter(r => r.status === 'completed');
  const pending   = uniqueRecords.filter(r => r.status === 'pending');

  const hasWarning = emp.required === 0 || emp.completionPct < 20;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4 bg-gray-50 rounded-t-2xl shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-base">{emp.employeeName}</h2>
            <p className="text-xs text-gray-500">{emp.designation || '—'} · {emp.department}</p>
            {hasWarning && (
              <div className="mt-1 flex items-center gap-1.5">
                {emp.required === 0 && (
                  <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                    ⚠ 0 Required SOPs
                  </span>
                )}
                {emp.required > 0 && emp.completionPct < 20 && (
                  <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                    ⚠ Low Completion ({emp.completionPct}%)
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-200"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-5 gap-2">
            {[
              { l: 'Total', v: emp.totalSOPs, bg: 'bg-purple-50', t: 'text-purple-800', title: 'Total = Required + Not Required (NA excluded)' },
              { l: 'Required', v: emp.required,  bg: 'bg-green-50',   t: 'text-green-800', title: 'SOPs with √ mark (training required)' },
              { l: 'Completed', v: emp.completed, bg: 'bg-blue-50', t: 'text-blue-800', title: 'SOPs marked as completed/done' },
              { l: 'Pending',  v: emp.pending,   bg: 'bg-orange-50',  t: 'text-orange-700', title: 'Required SOPs not yet completed' },
              { l: 'Not Req',  v: emp.notRequired, bg: 'bg-red-50', t: 'text-red-700', title: 'SOPs with X mark (not applicable)' },
            ].map(s => (
              <div key={s.l} className={`${s.bg} rounded-xl p-2 text-center`} title={s.title}>
                <p className={`text-lg font-black ${s.t}`}>{s.v}</p>
                <p className="text-[9px] text-gray-500 font-semibold mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>

          {/* Tooltip note */}
          <p className="text-[10px] text-gray-400 italic">Total = Required + Not Required · NA values excluded from all counts</p>

          {/* Completion bar */}
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span className="text-gray-600">Completion ({completed.length} of {required.length} required)</span>
              <span className={emp.completionPct >= 80 ? 'text-emerald-700' : emp.completionPct >= 50 ? 'text-amber-700' : 'text-red-700'}>
                {emp.completionPct}%
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-gray-200">
              <div className={`h-2.5 rounded-full transition-all ${emp.completionPct >= 80 ? 'bg-emerald-500' : emp.completionPct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${emp.completionPct}%` }} />
            </div>
          </div>

          {/* Completed SOPs */}
          {completed.length > 0 && (
            <div>
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">✓ Completed ({completed.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {completed.map(r => (
                  <span key={r.sopCode}
                    className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                    {r.sopCode} ✓
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Pending SOPs */}
          {pending.length > 0 && (
            <div>
              <p className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-2">√ Pending / Required ({pending.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {pending.map(r => (
                  <span key={r.sopCode}
                    className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-orange-50 text-orange-800 border border-orange-200">
                    {r.sopCode} √
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Not required SOPs */}
          {notReq.length > 0 && (
            <div>
              <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">X Not Required ({notReq.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {notReq.map(r => (
                  <span key={r.sopCode}
                    className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-100">
                    {r.sopCode}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type ViewMode = 'cards' | 'table' | 'sop' | 'month';

export default function TrainingMatrixPage() {
  const [viewMode, setViewMode]       = useState<ViewMode>('cards');
  const [records, setRecords]         = useState<FlatRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshKey, setRefreshKey]   = useState(0);
  const [showUpload, setShowUpload]   = useState(false);

  // Filters
  const [dept, setDept]               = useState('all');
  const [month, setMonth]             = useState('all');
  const [year, setYear]               = useState('all');
  const [search, setSearch]           = useState('');
  const [sopSearch, setSopSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TrainingStatus>('all');

  // Selected employee card for detail modal
  const [selectedEmp, setSelectedEmp] = useState<EmployeeCard | null>(null);

  const refresh = () => setRefreshKey(k => k + 1);

  // Fetch all flat records
  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dept  !== 'all') p.set('department', dept);
    if (month !== 'all') p.set('month', month);
    if (year  !== 'all') p.set('year', year);
    if (search)           p.set('search', search);
    if (sopSearch)        p.set('sop', sopSearch);
    if (statusFilter !== 'all') p.set('status', statusFilter);

    fetch(`/api/training-matrix/data?${p}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          // Flatten employee map → flat records array
          const flat: FlatRecord[] = [];
          for (const emp of (d.employees || [])) {
            for (const [sopCode, t] of Object.entries(emp.trainings as Record<string, { status: TrainingStatus; raw: string }>)) {
              flat.push({
                employeeName: emp.employeeName,
                designation:  emp.designation || '',
                department:   emp.department,
                sopCode,
                month:        0,
                monthName:    '',
                year:         0,
                status:       t.status,
                rawSymbol:    t.raw,
              });
            }
          }
          setRecords(flat);
        }
      })
      .finally(() => setLoading(false));
  }, [dept, month, year, search, sopSearch, statusFilter, refreshKey]);

  // Also fetch with month/year info from TrainingMatrixRecord directly
  const [detailedRecords, setDetailedRecords] = useState<FlatRecord[]>([]);
  useEffect(() => {
    const p = new URLSearchParams();
    if (dept  !== 'all') p.set('department', dept);
    if (month !== 'all') p.set('month', month);
    if (year  !== 'all') p.set('year', year);

    fetch(`/api/training-matrix/flat-records?${p}`)
      .then(r => r.json())
      .then(d => { if (d.success) setDetailedRecords(d.records || []); })
      .catch(() => setDetailedRecords([]));
  }, [dept, month, year, refreshKey]);

  // Use detailed records if available, else fall back to flat records
  const allRecords = detailedRecords.length > 0 ? detailedRecords : records;

  // Filtered records
  const filteredRecords = useMemo(() => {
    let r = allRecords;
    if (search)      r = r.filter(x => x.employeeName.toLowerCase().includes(search.toLowerCase()));
    if (sopSearch)   r = r.filter(x => x.sopCode.toLowerCase().includes(sopSearch.toLowerCase()));
    if (statusFilter !== 'all') r = r.filter(x => x.status === statusFilter);
    return r;
  }, [allRecords, search, sopSearch, statusFilter]);

  // KPI
  const kpi = useMemo((): KPI => {
    const empSet = new Set(allRecords.map(r => r.employeeName));
    const sopSet = new Set(allRecords.filter(r => r.status !== 'na').map(r => r.sopCode));

    // Deduplicate: for each employee+sop, pick best status
    const priority: Record<string, number> = { completed: 3, pending: 2, not_required: 1, na: 0 };
    const bestStatus = new Map<string, string>(); // `${emp}||${dept}||${sop}` -> status
    for (const r of allRecords) {
      const key = `${r.employeeName}||${r.department}||${r.sopCode}`;
      const existing = bestStatus.get(key);
      const existingP = existing ? (priority[existing] ?? 0) : -1;
      const newP = priority[r.status] ?? 0;
      if (newP > existingP) bestStatus.set(key, r.status);
    }

    let required = 0, notRequired = 0, completed = 0, pending = 0;
    for (const status of bestStatus.values()) {
      if (status === 'pending')            { required++; pending++; }
      else if (status === 'completed')     { required++; completed++; }
      else if (status === 'not_required')  notRequired++;
      // na: skip
    }
    const pct = required > 0 ? Math.round((completed / required) * 100) : 0;
    return { employees: empSet.size, sops: sopSet.size, required, notRequired, completed, pending, completionPct: pct };
  }, [allRecords]);

  // Employee cards
  const employeeCards = useMemo((): EmployeeCard[] => {
    const map = new Map<string, EmployeeCard>();
    // Track seen SOPs per employee to deduplicate (same SOP may appear in multiple months)
    const seenSops = new Map<string, Map<string, string>>(); // empKey -> sopCode -> best status

    for (const r of filteredRecords) {
      if (r.status === 'na') continue; // Skip NA entirely

      const key = `${r.department}||${r.employeeName}`;
      if (!map.has(key)) {
        map.set(key, {
          employeeName: r.employeeName, designation: r.designation, department: r.department,
          totalSOPs: 0, required: 0, notRequired: 0, completed: 0, pending: 0, completionPct: 0,
        });
        seenSops.set(key, new Map());
      }

      const sopMap = seenSops.get(key)!;
      const existingStatus = sopMap.get(r.sopCode);

      // Priority: completed > pending > not_required
      const priority: Record<string, number> = { completed: 3, pending: 2, not_required: 1 };
      const newPriority = priority[r.status] ?? 0;
      const existingPriority = existingStatus ? (priority[existingStatus] ?? 0) : -1;

      if (newPriority > existingPriority) {
        sopMap.set(r.sopCode, r.status);
      }
    }

    // Now build counts from deduplicated SOPs
    for (const [key, sopMap] of seenSops) {
      const c = map.get(key)!;
      c.completed = 0; c.pending = 0; c.notRequired = 0; c.required = 0; c.totalSOPs = 0;
      for (const status of sopMap.values()) {
        if (status === 'pending')            { c.pending++;  c.required++; }
        else if (status === 'completed')     { c.completed++; c.required++; }
        else if (status === 'not_required')  c.notRequired++;
      }
      c.totalSOPs = c.required + c.notRequired;
      c.completionPct = c.required > 0 ? Math.round((c.completed / c.required) * 100) : 0;
    }

    return Array.from(map.values()).sort((a, b) => b.pending - a.pending || a.employeeName.localeCompare(b.employeeName));
  }, [filteredRecords]);

  // SOP cards
  const sopCards = useMemo((): SOPCard[] => {
    const map = new Map<string, SOPCard>();
    for (const r of filteredRecords) {
      const key = `${r.sopCode}||${r.month}||${r.year}`;
      if (!map.has(key)) map.set(key, {
        sopCode: r.sopCode, department: r.department,
        monthName: r.monthName || '', month: r.month, year: r.year,
        required: 0, notRequired: 0,
      });
      const c = map.get(key)!;
      if (r.status === 'pending' || r.status === 'completed') c.required++;
      else if (r.status === 'not_required') c.notRequired++;
    }
    return Array.from(map.values()).sort((a, b) => a.sopCode.localeCompare(b.sopCode));
  }, [filteredRecords]);

  // Month capsules
  const monthCapsules = useMemo((): MonthCapsule[] => {
    const map = new Map<string, MonthCapsule>();
    for (const r of allRecords) {
      const key = `${r.year}-${r.month}`;
      if (!map.has(key)) map.set(key, {
        month: r.month, monthName: r.monthName || MONTH_NAMES[r.month] || String(r.month),
        year: r.year, sopCount: 0, employeeCount: 0,
        required: 0, notRequired: 0, completed: 0, pending: 0,
      });
      const c = map.get(key)!;
      if (r.status === 'pending')           { c.required++; c.pending++; }
      else if (r.status === 'completed')    { c.required++; c.completed++; }
      else if (r.status === 'not_required')   c.notRequired++;
    }
    // count unique sops and employees per month
    for (const [key, c] of map) {
      const [yr, mo] = key.split('-').map(Number);
      const monthRecs = allRecords.filter(r => r.month === mo && r.year === yr);
      c.sopCount      = new Set(monthRecs.map(r => r.sopCode)).size;
      c.employeeCount = new Set(monthRecs.map(r => r.employeeName)).size;
    }
    return Array.from(map.values()).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  }, [allRecords]);

  // Unique filters from records
  const deptOptions   = useMemo(() => [...new Set(allRecords.map(r => r.department))].filter(Boolean).sort(), [allRecords]);
  const monthOptions  = useMemo(() => {
    const seen = new Map<string, { month: number; monthName: string; year: number }>();
    for (const r of allRecords) {
      const k = `${r.year}-${r.month}`;
      if (!seen.has(k)) seen.set(k, { month: r.month, monthName: r.monthName || MONTH_NAMES[r.month] || '', year: r.year });
    }
    return [...seen.values()].sort((a,b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  }, [allRecords]);
  const yearOptions   = useMemo(() => [...new Set(allRecords.map(r => r.year))].filter(Boolean).sort(), [allRecords]);

  // Employees with highest pending
  const topPending = useMemo(() =>
    [...employeeCards].sort((a, b) => b.pending - a.pending).slice(0, 5),
    [employeeCards]
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa]">

      {/* ── Header ── */}
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
              <p className="text-[10px] text-gray-500">Employee-wise SOP training tracker</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Dept filter */}
            <select value={dept} onChange={e => setDept(e.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:border-purple-500 focus:outline-none">
              <option value="all">All Departments</option>
              {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={month} onChange={e => setMonth(e.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:border-purple-500 focus:outline-none">
              <option value="all">All Months</option>
              {monthOptions.map(m => <option key={`${m.year}-${m.month}`} value={m.month}>{m.monthName} {m.year}</option>)}
            </select>
            <select value={year} onChange={e => setYear(e.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:border-purple-500 focus:outline-none">
              <option value="all">All Years</option>
              {yearOptions.map(y => <option key={y} value={String(y)}>{y}</option>)}
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

        {/* View mode tabs */}
        <div className="mt-2.5 flex gap-1 border-t border-gray-100 pt-2">
          {([
            { id: 'cards',  label: 'Employee Cards',  icon: Users },
            { id: 'sop',    label: 'SOP Summary',     icon: BookOpen },
            { id: 'month',  label: 'Month View',      icon: Calendar },
            { id: 'table',  label: 'Flat Table',      icon: Layers },
          ] as { id: ViewMode; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setViewMode(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === id ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'
              }`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
      </header>

      {/* ── KPI Cards ── */}
      <section className="grid grid-cols-2 gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: 'Employees',    val: kpi.employees,       color: 'text-purple-600 bg-purple-50', icon: Users },
          { label: 'SOPs',         val: kpi.sops,            color: 'text-blue-600 bg-blue-50',     icon: BookOpen },
          { label: '√ Required',   val: kpi.required,        color: 'text-green-700 bg-green-50',   icon: CheckCircle2 },
          { label: '√ Pending',    val: kpi.pending,         color: 'text-amber-600 bg-amber-50',   icon: Clock },
          { label: '✓ Completed',  val: kpi.completed,       color: 'text-emerald-600 bg-emerald-50',icon: Award },
          { label: 'X Not Reqd',   val: kpi.notRequired,     color: 'text-red-500 bg-red-50',       icon: XCircle },
          { label: 'Completion',   val: `${kpi.completionPct}%`,
            color: kpi.completionPct >= 80 ? 'text-emerald-600 bg-emerald-50' : kpi.completionPct >= 50 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50',
            icon: TrendingUp },
        ].map(({ label, val, color, icon: Icon }) => (
          <div key={label} className="flex items-center gap-2 rounded-lg border border-gray-100 p-2.5">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-gray-500">{label}</p>
              <p className="text-sm font-bold text-gray-800">{loading ? '…' : val}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── Month Capsule Bar ── */}
      {monthCapsules.length > 0 && (
        <section className="flex gap-2 overflow-x-auto border-b border-gray-200 bg-gray-50 px-4 py-2">
          {monthCapsules.map(m => {
            const pct = m.required > 0 ? Math.round((m.completed / m.required) * 100) : 0;
            const active = month === String(m.month) && year === String(m.year);
            return (
              <button key={`${m.year}-${m.month}`}
                onClick={() => { setMonth(String(m.month)); setYear(String(m.year)); }}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-all hover:shadow-md ${
                  active ? 'bg-purple-600 border-purple-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-700 hover:border-purple-300'
                }`}>
                <p className={`text-xs font-bold ${active ? 'text-white' : 'text-gray-800'}`}>{m.monthName} {m.year}</p>
                <p className={`text-[9px] mt-0.5 ${active ? 'text-purple-200' : 'text-gray-500'}`}>{m.sopCount} SOPs · {m.employeeCount} employees</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className={`text-[9px] font-bold px-1 py-px rounded ${active ? 'bg-green-400/30 text-green-100' : 'bg-green-100 text-green-800'}`}>√ {m.pending}</span>
                  <span className={`text-[9px] font-bold px-1 py-px rounded ${active ? 'bg-red-400/30 text-red-100' : 'bg-red-50 text-red-700'}`}>✗ {m.notRequired}</span>
                  <span className={`text-[9px] font-bold px-1 py-px rounded ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>{pct}%</span>
                </div>
              </button>
            );
          })}
          {month !== 'all' && (
            <button onClick={() => { setMonth('all'); setYear('all'); }}
              className="shrink-0 self-center rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100">
              Clear ×
            </button>
          )}
        </section>
      )}

      {/* ── Search/Filter Bar ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…"
            className="w-44 rounded-md border border-gray-300 pl-7 pr-2 py-1.5 text-xs focus:border-purple-500 focus:outline-none" />
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={sopSearch} onChange={e => setSopSearch(e.target.value)} placeholder="Filter SOP code…"
            className="w-40 rounded-md border border-gray-300 pl-7 pr-2 py-1.5 text-xs focus:border-purple-500 focus:outline-none" />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1">
          {([
            { s: 'all',          label: 'All',      cls: 'border-gray-300 text-gray-600' },
            { s: 'pending',      label: '√ Reqd',   cls: 'border-green-300 text-green-700 bg-green-50' },
            { s: 'completed',    label: '✓ Done',   cls: 'border-emerald-300 text-emerald-700 bg-emerald-50' },
            { s: 'not_required', label: 'X Not Req',cls: 'border-red-200 text-red-600 bg-red-50' },
          ] as { s: string; label: string; cls: string }[]).map(({ s, label, cls }) => (
            <button key={s}
              onClick={() => setStatusFilter(s as any)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                statusFilter === s ? 'bg-purple-600 border-purple-600 text-white' : cls + ' hover:bg-purple-50'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {(search || sopSearch || statusFilter !== 'all') && (
          <button onClick={() => { setSearch(''); setSopSearch(''); setStatusFilter('all'); }}
            className="flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-600 hover:bg-red-100">
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <span className="ml-auto text-xs text-gray-500">
          {employeeCards.length} employees · {new Set(filteredRecords.map(r => r.sopCode)).size} SOPs
        </span>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-3 bg-gray-50 border-b border-gray-200 px-4 py-1.5">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Legend:</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">√ Required training</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">X Not required</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">✓ Completed</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded px-2 py-0.5">— N/A</span>
      </div>

      {/* ── Main Content ── */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-purple-600" />
        </div>
      ) : allRecords.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400">
          <FileSpreadsheet className="h-12 w-12 opacity-40" />
          <p className="font-semibold">No training data found</p>
          <p className="text-sm">Upload a training matrix Excel file to get started</p>
          <button onClick={() => setShowUpload(true)} className="mt-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700">
            <Upload className="mr-1.5 inline h-4 w-4" /> Upload Matrix
          </button>
        </div>
      ) : (
        <main className="flex-1 p-4">

          {/* ── EMPLOYEE CARDS VIEW ── */}
          {viewMode === 'cards' && (
            <div>
              {/* Top summary strips */}
              {topPending.length > 0 && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" /> Employees with Most Pending Trainings
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {topPending.map(e => (
                      <button key={e.employeeName} onClick={() => setSelectedEmp(e)}
                        className="flex items-center gap-1.5 rounded-lg bg-white border border-amber-200 px-2.5 py-1.5 text-xs hover:bg-amber-50 transition-colors">
                        <span className="font-semibold text-gray-800">{e.employeeName}</span>
                        <span className="font-bold text-amber-700 bg-amber-100 px-1.5 py-px rounded-full text-[10px]">√ {e.pending}</span>
                        <span className="text-gray-400 text-[10px]">{e.department}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Employee cards grid */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {employeeCards.map(emp => {
                  const pct = emp.completionPct;
                  const pctColor = pct >= 80 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-red-700';
                  const pctBg    = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
                  const borderColor = emp.pending > 0 ? 'border-green-200' : 'border-gray-200';

                  return (
                    <button key={`${emp.department}-${emp.employeeName}`}
                      onClick={() => setSelectedEmp(emp)}
                      className={`text-left rounded-xl border ${borderColor} bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-purple-400`}>

                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 text-sm leading-tight truncate">{emp.employeeName}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5 truncate">{emp.designation || '—'}</p>
                          <span className="inline-block mt-1 text-[9px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-px rounded-full">{emp.department}</span>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`text-lg font-black ${pctColor}`}>{pct}%</p>
                          <p className="text-[9px] text-gray-400">complete</p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="h-1.5 rounded-full bg-gray-100 mb-2">
                        <div className={`h-1.5 rounded-full ${pctBg}`} style={{ width: `${pct}%` }} />
                      </div>

                      {/* Warning badge */}
                      {(emp.required === 0 || (emp.required > 0 && emp.completionPct < 20)) && (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {emp.required === 0 && (
                            <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-px rounded-full">⚠ 0 Required</span>
                          )}
                          {emp.required > 0 && emp.completionPct < 20 && (
                            <span className="text-[9px] font-bold bg-orange-100 text-orange-700 px-1.5 py-px rounded-full">⚠ Low ({emp.completionPct}%)</span>
                          )}
                        </div>
                      )}

                      {/* Stats row */}
                      <div className="grid grid-cols-4 gap-1 text-center">
                        <div className="rounded-lg bg-green-50 py-1" title="Required = √ (pending) + completed">
                          <p className="text-xs font-black text-green-700">{emp.required}</p>
                          <p className="text-[8px] text-green-600 font-semibold">Required</p>
                        </div>
                        <div className="rounded-lg bg-orange-50 py-1" title="Pending = Required SOPs not yet completed">
                          <p className="text-xs font-black text-orange-700">{emp.pending}</p>
                          <p className="text-[8px] text-orange-600 font-semibold">√ Pending</p>
                        </div>
                        <div className="rounded-lg bg-blue-50 py-1" title="Completed SOPs">
                          <p className="text-xs font-black text-blue-700">{emp.completed}</p>
                          <p className="text-[8px] text-blue-600 font-semibold">✓ Done</p>
                        </div>
                        <div className="rounded-lg bg-red-50 py-1" title="Not Required (X mark)">
                          <p className="text-xs font-black text-red-600">{emp.notRequired}</p>
                          <p className="text-[8px] text-red-500 font-semibold">✗ N/R</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SOP SUMMARY VIEW ── */}
          {viewMode === 'sop' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sopCards.map(sop => {
                const total = sop.required + sop.notRequired;
                const pct = total > 0 ? Math.round((sop.required / total) * 100) : 0;
                return (
                  <div key={`${sop.sopCode}-${sop.month}-${sop.year}`}
                    className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-mono font-bold text-purple-700 text-sm">{sop.sopCode}</p>
                        {sop.monthName && <p className="text-[10px] text-gray-500 mt-0.5">{sop.monthName} {sop.year || ''}</p>}
                        <span className="inline-block mt-1 text-[9px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-px rounded-full">{sop.department}</span>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pct >= 80 ? 'bg-emerald-100 text-emerald-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div className="rounded-lg bg-green-50 p-2 text-center">
                        <p className="text-base font-black text-green-700">{sop.required}</p>
                        <p className="text-[8px] text-green-600 font-bold">√ Required for</p>
                      </div>
                      <div className="rounded-lg bg-red-50 p-2 text-center">
                        <p className="text-base font-black text-red-600">{sop.notRequired}</p>
                        <p className="text-[8px] text-red-500 font-bold">X Not Required</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── MONTH VIEW ── */}
          {viewMode === 'month' && (
            <div className="space-y-4">
              {monthCapsules.map(m => {
                const pct = m.required > 0 ? Math.round((m.completed / m.required) * 100) : 0;
                const monthEmps = employeeCards.filter(e =>
                  allRecords.some(r => r.employeeName === e.employeeName && r.month === m.month && r.year === m.year)
                );
                return (
                  <div key={`${m.year}-${m.month}`} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    {/* Month header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-500">
                      <div>
                        <h3 className="font-bold text-white text-base">{m.monthName} {m.year}</h3>
                        <p className="text-purple-200 text-xs mt-0.5">{m.sopCount} SOPs · {m.employeeCount} employees</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                          <p className="text-xl font-black text-white">{pct}%</p>
                          <p className="text-purple-200 text-[9px]">complete</p>
                        </div>
                      </div>
                    </div>

                    {/* Month stats */}
                    <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
                      {[
                        { l: '√ Required',  v: m.required,    bg: 'bg-green-50',   t: 'text-green-700' },
                        { l: '√ Pending',   v: m.pending,     bg: 'bg-amber-50',   t: 'text-amber-700' },
                        { l: '✓ Completed', v: m.completed,   bg: 'bg-emerald-50', t: 'text-emerald-700' },
                        { l: 'X Not Req',   v: m.notRequired, bg: 'bg-red-50',     t: 'text-red-600' },
                      ].map(s => (
                        <div key={s.l} className={`${s.bg} p-3 text-center`}>
                          <p className={`text-lg font-black ${s.t}`}>{s.v}</p>
                          <p className="text-[9px] text-gray-500 font-semibold">{s.l}</p>
                        </div>
                      ))}
                    </div>

                    {/* Employees in this month */}
                    {monthEmps.length > 0 && (
                      <div className="p-3 flex flex-wrap gap-2">
                        {monthEmps.map(e => (
                          <button key={e.employeeName} onClick={() => setSelectedEmp(e)}
                            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs hover:bg-purple-50 hover:border-purple-200 transition-colors">
                            <span className="font-semibold text-gray-800">{e.employeeName}</span>
                            {e.pending > 0 && <span className="bg-green-100 text-green-700 font-bold px-1 py-px rounded text-[9px]">√{e.pending}</span>}
                            {e.notRequired > 0 && <span className="bg-red-50 text-red-600 font-bold px-1 py-px rounded text-[9px]">✗{e.notRequired}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── FLAT TABLE VIEW ── */}
          {viewMode === 'table' && (
            <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-10">
                    <tr>
                      {['Employee', 'Designation', 'Department', 'SOP Code', 'Month', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-bold text-gray-700 border-b border-gray-200 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((r, i) => (
                      <tr key={i} className={`border-b border-gray-100 hover:bg-purple-50/30 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                        <td className="px-3 py-1.5 font-semibold text-gray-800 whitespace-nowrap">{r.employeeName}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r.designation || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r.department}</td>
                        <td className="px-3 py-1.5 font-mono font-bold text-purple-700">{r.sopCode}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.monthName || '—'} {r.year || ''}</td>
                        <td className="px-3 py-1.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[r.status]}`}>
                            {STATUS_SYMBOL[r.status]} {r.status === 'pending' ? 'Required' : r.status === 'completed' ? 'Completed' : r.status === 'not_required' ? 'Not Required' : 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-50 border-t border-gray-200 px-4 py-2 text-xs text-gray-500 text-right">
                {filteredRecords.length} records
              </div>
            </div>
          )}

        </main>
      )}

      {/* ── Upload Modal ── */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={refresh} />}

      {/* ── Employee Detail Modal ── */}
      {selectedEmp && (
        <EmployeeDetailModal
          emp={selectedEmp}
          records={allRecords}
          onClose={() => setSelectedEmp(null)}
        />
      )}
    </div>
  );
}
