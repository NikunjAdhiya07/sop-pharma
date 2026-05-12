'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuthGuard } from '@/hooks/useAuthGuard';

function stripVersion(code: string): string {
  return String(code || '').toUpperCase().replace(/-\d+$/, '').trim();
}
import {
  ArrowLeft,
  Upload,
  RefreshCw,
  Search,
  Download,
  X,
  FileSpreadsheet,
  ClipboardList,
  FlaskConical,
  Microscope,
  Cog,
  Package,
  Wrench,
  UserRound,
  Plus,
  Trash2,
  Pencil,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPARTMENTS = ['QA', 'QC', 'Microbiology', 'Production', 'Store', 'Engineering', 'Personnel'] as const;
type Dept = (typeof DEPARTMENTS)[number];

const DEPT_ACCENT: Record<Dept | 'Total', string> = {
  Total: '#a855f7',
  QA: '#6366f1',
  QC: '#3b82f6',
  Microbiology: '#10b981',
  Production: '#f59e0b',
  Store: '#ef4444',
  Engineering: '#64748b',
  Personnel: '#ec4899',
};

const DEPT_ICON: Record<Dept | 'Total', React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Total: ClipboardList,
  QA: FlaskConical,
  QC: FlaskConical,
  Microbiology: Microscope,
  Production: Cog,
  Store: Package,
  Engineering: Wrench,
  Personnel: UserRound,
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT: Record<string, string> = {
  January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr', May: 'May', June: 'Jun',
  July: 'Jul', August: 'Aug', September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeptCardData {
  uploaded: boolean;
  sopCount: number;
  foundInDb: number;
  foundObsolete?: number;
  missingFromExcel: number;
  langBreakdown?: Array<{ key: string; label: string; found: number; missing: number }>;
  excelDeptSplit?: {
    total: number;
    foundByDept: Record<string, number>;
    missingByDept: Record<string, number>;
    unknownFound?: number;
    unknownMissing?: number;
  };
  trainersAssigned: number;
  trainersMissing: number;
  okayCount: number;
  expiredCount: number;
  dueSoon60Count?: number;
  dueSoon60McqReviewed?: number;
  dueSoon60McqPartial?: number;
  dueSoon60McqNotReviewed?: number;
  mcqCreatedCount: number;
  mcqNotCreatedCount: number;
  mcqAllApprovedCount: number;
  mcqPartiallyApprovedCount: number;
  mcqNotApprovedCount: number;
  mcqEngCreatedCount?: number;
  mcqEngNotCreatedCount?: number;
  mcqEngAllApprovedCount?: number;
  mcqEngPartiallyApprovedCount?: number;
  mcqEngNotApprovedCount?: number;
  mcqGujCreatedCount?: number;
  mcqGujNotCreatedCount?: number;
  mcqGujAllApprovedCount?: number;
  mcqGujPartiallyApprovedCount?: number;
  mcqGujNotApprovedCount?: number;
  employeeCount: number;
  fullyTrained: number;
  incomplete: number;
  monthCounts: Record<string, number>;
  sopCodes: string[];
  employees: EmployeeRow[];
  fileUrl: string | null;
  uploadedAt: string | null;
  fileName?: string;
  missingFromExcelList: Array<{ sopCode: string; title: string; department: string }>;
  trainersMissingList: Array<{ sopCode: string; month: string; department: string }>;
  trainerBySopCode?: Record<string, string>;
  repeat3PlusCount?: number;
  repeat2Count?: number;
  repeat1Count?: number;
  repeat3PlusList?: Array<{ sopCode: string; title: string; department: string; count: number }>;
  repeat2List?: Array<{ sopCode: string; title: string; department: string; count: number }>;
  repeat1List?: Array<{ sopCode: string; title: string; department: string; count: number }>;
}

interface TotalCardData {
  dbSopCount: number;
  dbSopsByDept: Record<string, Array<{ sopCode: string; title: string }>>;
  dbSopCountsByDept: Record<string, number>;
  excelSopCount: number;
  missingSopCount: number;
  trainersAssigned: number;
  trainersMissing: number;
  okayCount: number;
  expiredCount: number;
  dueSoon60Count?: number;
  dueSoon60McqReviewed?: number;
  dueSoon60McqPartial?: number;
  dueSoon60McqNotReviewed?: number;
  mcqCreatedCount: number;
  mcqNotCreatedCount: number;
  mcqAllApprovedCount: number;
  mcqPartiallyApprovedCount: number;
  mcqNotApprovedCount: number;
  mcqEngCreatedCount?: number;
  mcqEngNotCreatedCount?: number;
  mcqEngAllApprovedCount?: number;
  mcqEngPartiallyApprovedCount?: number;
  mcqEngNotApprovedCount?: number;
  mcqGujCreatedCount?: number;
  mcqGujNotCreatedCount?: number;
  mcqGujAllApprovedCount?: number;
  mcqGujPartiallyApprovedCount?: number;
  mcqGujNotApprovedCount?: number;
  employeeCount: number;
  fullyTrained: number;
  incomplete: number;
  departmentCount: number;
  totalDepartments: number;
  missingFromExcelList: Array<{ sopCode: string; title: string; department: string }>;
  trainersMissingList: Array<{ sopCode: string; month: string; department: string }>;
}

interface EmployeeRow {
  name: string;
  designation: string;
  department: string;
  training: Record<string, boolean>;
}

type SopDetailType = 'db' | 'excel' | 'found' | 'missing' | 'obsolete';

type MatrixViewMode = 'sop' | 'employee' | 'month';
type GroupByMode = 'department' | 'employee' | 'sop' | 'month';
type EmployeeListFilter = 'all' | 'full' | 'incomplete';

interface OverviewData {
  departments: Dept[];
  perDept: Record<Dept, DeptCardData>;
  totalCard: TotalCardData;
  employees: EmployeeRow[];
  sopCodesByDept: Record<Dept, string[]>;
  sopMonthMapByDept: Record<Dept, Record<string, string>>;
  monthCountsByDept: Record<Dept, Record<string, number>>;
  sopStatusByCode: Record<string, { 
    expired: boolean; 
    targetDate: string | null; 
    totalQuestions: number; 
    approvedCount: number; 
    engTotalQuestions?: number;
    engApprovedCount?: number;
    gujTotalQuestions?: number;
    gujApprovedCount?: number;
    title?: string;
  }>;
}

type ActiveDept = 'All' | Dept;
type ActiveMonth = 'All' | string;

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    setConfirming(false);
    setError('');
    setResults([]);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      fd.append('clearAll', 'true');
      const res = await fetch('/api/training-matrix/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setResults(data.results || []);
        onSuccess();
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (e: any) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
              <FileSpreadsheet className="h-4 w-4 text-purple-600" />
            </div>
            <h2 className="font-bold text-gray-800">Upload Training Matrix</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
            <span><strong>All existing matrix data will be replaced</strong> with the new Excel files. This cannot be undone.</span>
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = Array.from(e.dataTransfer.files).filter((f) => /\.xlsx$/i.test(f.name));
              setFiles((prev) => [...prev, ...dropped]);
            }}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/50 p-6 text-center transition hover:border-purple-400"
          >
            <Upload className="mx-auto mb-2 h-8 w-8 text-purple-400" />
            <p className="text-sm font-medium text-gray-700">Click or drop Excel files here</p>
            <p className="mt-1 text-xs text-gray-500">Supports .xlsx — one file per department</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []);
                setFiles((prev) => [...prev, ...chosen]);
              }}
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-xs">
                  <span className="truncate text-gray-700">{f.name}</span>
                  <button
                    onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}

          {results.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-2 text-xs ${r.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
                >
                  <div className="font-medium">{r.fileName}</div>
                  {r.ok ? (
                    <div className="mt-0.5 text-[11px]">
                      {r.department} — {r.employees} employees, {r.sops} SOPs
                      {r.fileUrl ? ' — uploaded to CDN' : ''}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-[11px]">{r.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {confirming ? (
          <div className="border-t px-5 py-3 space-y-2">
            <p className="text-xs text-gray-700 font-medium">Are you sure? This will delete all existing training matrix data and replace it with the selected {files.length} file{files.length !== 1 ? 's' : ''}.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} className="rounded-lg border px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Yes, replace all data'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <button onClick={onClose} className="rounded-lg border px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Close
            </button>
            <button
              onClick={() => setConfirming(true)}
              disabled={!files.length || uploading}
              className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {`Upload ${files.length || ''}`.trim()}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── List Modal (Missing SOPs / Missing Trainers) ─────────────────────────────

interface ListModalColumn {
  key: string;
  label: string;
  width?: string;
}

function ListModal({
  title,
  columns,
  rows,
  onClose,
}: {
  title: string;
  columns: ListModalColumn[];
  rows: Array<Record<string, any>>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto p-4">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Nothing to show.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-600"
                      style={{ width: c.width }}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    {columns.map((c) => (
                      <td key={c.key} className="px-3 py-2 text-gray-700">
                        {r[c.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function DbSopModal({
  total,
  deptOrder,
  dbSopCountsByDept,
  dbSopsByDept,
  onClose,
}: {
  total: number;
  deptOrder: readonly string[];
  dbSopCountsByDept: Record<string, number>;
  dbSopsByDept: Record<string, Array<{ sopCode: string; title: string }>>;
  onClose: () => void;
}) {
  const [activeDept, setActiveDept] = useState<string>(deptOrder[0] || 'QA');
  const [term, setTerm] = useState('');

  const rows = useMemo(() => {
    const list = dbSopsByDept?.[activeDept] || [];
    const q = term.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.sopCode.toLowerCase().includes(q) || (r.title || '').toLowerCase().includes(q));
  }, [activeDept, dbSopsByDept, term]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-800">DB SOPs (Department-wise)</h2>
            <div className="mt-0.5 text-xs text-gray-500">Total SOPs in DB: {total}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-12 gap-0">
          <aside className="col-span-4 border-r bg-gray-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search SOP code / title…"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-purple-300 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              {deptOrder.map((d) => {
                const active = d === activeDept;
                const count = dbSopCountsByDept?.[d] ?? (dbSopsByDept?.[d]?.length || 0);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setActiveDept(d)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition"
                    style={
                      active
                        ? { background: '#ede9fe', border: '1px solid #c4b5fd' }
                        : { background: '#fff', border: '1px solid #e5e7eb' }
                    }
                  >
                    <span className={`font-semibold ${active ? 'text-purple-700' : 'text-gray-700'}`}>{d}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="col-span-8 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-800">{activeDept}</div>
              <div className="text-xs text-gray-500">
                Showing {rows.length} / {(dbSopsByDept?.[activeDept]?.length || 0)}
              </div>
            </div>

            <div className="max-h-[70vh] overflow-auto rounded-xl border border-gray-100">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-600" style={{ width: 160 }}>
                      SOP Code
                    </th>
                    <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-600">Title</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.sopCode} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-800">{r.sopCode}</td>
                      <td className="px-3 py-2 text-gray-700">{r.title || '—'}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-8 text-center text-sm text-gray-500">
                        No SOPs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Card building blocks ─────────────────────────────────────────────────────

function RowA({
  label,
  value,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-normal text-gray-500">{label}</span>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="text-[11px] font-bold text-gray-900 hover:underline"
        >
          {value}
        </button>
      ) : (
        <span className="text-[11px] font-bold text-gray-900">{value}</span>
      )}
    </div>
  );
}

function RowB({
  label,
  green,
  red,
  onClickGreen,
  onClickRed,
}: {
  label: string;
  green: number;
  red: number;
  onClickGreen?: () => void;
  onClickRed?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-gray-500">{label}</span>
      <span className="flex items-center gap-1.5">
        {onClickGreen ? (
          <button
            type="button"
            onClick={onClickGreen}
            className="text-[11px] font-bold text-emerald-600 hover:underline"
          >
            {green}
          </button>
        ) : (
          <span className="text-[11px] font-bold text-emerald-600">{green}</span>
        )}
        {onClickRed ? (
          <button
            type="button"
            onClick={onClickRed}
            className="text-[11px] font-bold text-red-600 hover:underline"
          >
            {red}
          </button>
        ) : (
          <span className="text-[11px] font-bold text-red-600">{red}</span>
        )}
      </span>
    </div>
  );
}

function RowC({
  label,
  green,
  amber,
  red,
  onClickGreen,
  onClickAmber,
  onClickRed,
}: {
  label: string;
  green: number;
  amber: number;
  red: number;
  onClickGreen?: () => void;
  onClickAmber?: () => void;
  onClickRed?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-gray-500">{label}</span>
      <span className="flex items-center gap-1.5">
        {onClickGreen ? (
          <button
            type="button"
            onClick={onClickGreen}
            className="text-[11px] font-bold text-emerald-600 hover:underline"
          >
            {green}
          </button>
        ) : (
          <span className="text-[11px] font-bold text-emerald-600">{green}</span>
        )}
        {onClickAmber ? (
          <button
            type="button"
            onClick={onClickAmber}
            className="text-[11px] font-bold text-amber-500 hover:underline"
          >
            {amber}
          </button>
        ) : (
          <span className="text-[11px] font-bold text-amber-500">{amber}</span>
        )}
        {onClickRed ? (
          <button
            type="button"
            onClick={onClickRed}
            className="text-[11px] font-bold text-red-600 hover:underline"
          >
            {red}
          </button>
        ) : (
          <span className="text-[11px] font-bold text-red-600">{red}</span>
        )}
      </span>
    </div>
  );
}

function RowD({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  color: 'green' | 'red' | 'amber';
  onClick?: () => void;
}) {
  const colorClass =
    color === 'green' ? 'text-emerald-600' : color === 'red' ? 'text-red-600' : 'text-amber-600';
  return (
    <div className="flex items-center justify-between pl-2">
      <span className="text-[9px] text-gray-400">{label}</span>
      <button
        type="button"
        onClick={onClick}
        className={`text-[10px] font-semibold ${colorClass} ${onClick ? 'hover:underline' : ''}`}
      >
        {value}
      </button>
    </div>
  );
}

function MonthStrip({
  monthCounts,
  onSelectMonth,
}: {
  monthCounts: Record<string, number>;
  onSelectMonth?: (m: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-x-1 gap-y-0.5">
      {MONTHS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onSelectMonth?.(m)}
          className={`flex flex-col items-center rounded transition-colors ${onSelectMonth ? 'hover:bg-gray-100' : ''}`}
        >
          <span className="text-[8px] text-gray-400 leading-none">{MONTH_SHORT[m]}</span>
          <span className="text-[9px] font-bold text-gray-700 leading-tight">{monthCounts[m] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

function DeptStrip({
  foundCounts,
  missingCounts,
  order,
  onSelectFound,
  onSelectMissing,
}: {
  foundCounts: Record<string, number>;
  missingCounts: Record<string, number>;
  order: readonly string[];
  onSelectFound?: (dept: string) => void;
  onSelectMissing?: (dept: string) => void;
}) {
  const short = (d: string) => {
    if (d === 'Microbiology') return 'Micro';
    if (d === 'Production') return 'Prod';
    if (d === 'Engineering') return 'Eng';
    if (d === 'Personnel') return 'Pers';
    if (d === 'NA') return 'NA';
    return d; // QA, QC, Store
  };
  const visible = order.filter((d) => (foundCounts?.[d] ?? 0) > 0 || (missingCounts?.[d] ?? 0) > 0);
  return (
    <div className="grid grid-cols-4 gap-x-1 gap-y-0.5">
      {visible.map((d) => (
        <span key={d} className="flex flex-col items-center">
          <span className="text-[8px] text-gray-400 leading-none">{short(d)}</span>
          <span className="flex items-center gap-1 leading-tight tabular-nums">
            <button
              type="button"
              onClick={() => onSelectFound?.(d)}
              className={`text-[9px] font-bold text-emerald-700 ${onSelectFound ? 'hover:underline' : ''}`}
            >
              {foundCounts?.[d] ?? 0}
            </button>
            <button
              type="button"
              onClick={() => onSelectMissing?.(d)}
              className={`text-[9px] font-bold text-red-600 ${onSelectMissing ? 'hover:underline' : ''}`}
            >
              {missingCounts?.[d] ?? 0}
            </button>
          </span>
        </span>
      ))}
    </div>
  );
}

function CardShell({
  accent,
  children,
  icon: Icon,
  title,
}: {
  accent: string;
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
}) {
  return (
    <div
      className="rounded-[12px] bg-white px-3 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.07)] transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] flex-1 min-w-0"
      style={{ border: `1.5px solid ${accent}` }}
    >
      <div className="mb-2 flex items-center gap-1">
        <Icon className="h-[13px] w-[13px] flex-shrink-0" style={{ color: accent }} />
        <span className="text-[12px] font-semibold text-gray-900 truncate">{title}</span>
      </div>
      <div className="space-y-[5px]">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="my-[4px] border-t border-gray-100" />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-300">{children}</div>
  );
}

function SopDetailsInline({
  title,
  dept,
  type,
  rows,
  loading,
  error,
  onClear,
}: {
  title: string;
  dept: string;
  type: SopDetailType;
  rows: any[];
  loading: boolean;
  error: string;
  onClear: () => void;
}) {
  const [term, setTerm] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<
    'sopCode' | 'title' | 'sopNo' | 'version' | 'month' | 'status' | 'versionStatus'
  >('sopCode');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return rows || [];
    return (rows || []).filter((r: any) => {
      const code = String(r?.sopCode || '').toLowerCase();
      const name = String(r?.title || '').toLowerCase();
      const sopNo = String(r?.db?.sopNo || '').toLowerCase();
      const month = String(r?.excel?.month || '').toLowerCase();
      return code.includes(q) || name.includes(q) || sopNo.includes(q) || month.includes(q);
    });
  }, [rows, term]);

  const sorted = useMemo(() => {
    const list = [...(filtered || [])];
    const dir = sortDir === 'asc' ? 1 : -1;

    const norm = (v: any) => String(v ?? '').toLowerCase();
    const num = (v: any) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? n : -1;
    };

    const getStatusRank = (r: any) => {
      const dbPresent = !!r?.db?.present;
      const excelPresent = !!r?.excel?.present;
      const obsoletePresent = !!r?.obsolete?.present;
      if (!dbPresent && obsoletePresent && excelPresent) return 3; // Found (obsolete)
      if (dbPresent && excelPresent) return 2; // Found
      if (dbPresent && !excelPresent) return 1; // DB only
      return 0; // Excel only / not found
    };
    const getVersionRank = (r: any) => {
      const v = r?.db?.version;
      return v === null || v === undefined ? 0 : 1;
    };

    list.sort((a, b) => {
      if (sortKey === 'sopCode') return dir * norm(a?.sopCode).localeCompare(norm(b?.sopCode));
      if (sortKey === 'title') return dir * norm(a?.title).localeCompare(norm(b?.title));
      if (sortKey === 'sopNo') return dir * norm(a?.db?.sopNo).localeCompare(norm(b?.db?.sopNo));
      if (sortKey === 'month') return dir * norm(a?.excel?.month).localeCompare(norm(b?.excel?.month));
      if (sortKey === 'version') return dir * (num(a?.db?.version) - num(b?.db?.version));
      if (sortKey === 'status') return dir * (getStatusRank(a) - getStatusRank(b));
      if (sortKey === 'versionStatus') return dir * (getVersionRank(a) - getVersionRank(b));
      return 0;
    });
    return list;
  }, [filtered, sortDir, sortKey]);

  const summary = useMemo(() => {
    const s = { found: 0, foundObsolete: 0, dbOnly: 0, excelOnly: 0, versionMissing: 0 };
    for (const r of rows || []) {
      const dbPresent = !!r?.db?.present;
      const excelPresent = !!r?.excel?.present;
      const obsoletePresent = !!r?.obsolete?.present;
      if (dbPresent && excelPresent) s.found++;
      else if (!dbPresent && obsoletePresent && excelPresent) s.foundObsolete++;
      else if (dbPresent && !excelPresent) s.dbOnly++;
      else if (!dbPresent && excelPresent) s.excelOnly++;
      if (dbPresent && (r?.db?.version === null || r?.db?.version === undefined)) s.versionMissing++;
    }
    return s;
  }, [rows]);

  const badge =
    type === 'db'
      ? 'DB'
      : type === 'excel'
        ? 'Excel'
        : type === 'found'
          ? 'Found'
          : 'Missing';

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b bg-gray-50 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-bold text-gray-900">{title}</div>
            <span className="rounded-full bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 text-[11px] font-bold">
              {dept}
            </span>
            <span className="rounded-full bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 text-[11px] font-bold">
              {badge}
            </span>
            <span className="text-xs text-gray-500">Showing {sorted.length} / {(rows || []).length}</span>
            <span className="text-[11px] text-gray-500">
              Found: <span className="font-bold text-emerald-700">{summary.found}</span>
              <span className="mx-1 text-gray-300">·</span>
              Obsolete: <span className="font-bold text-purple-700">{summary.foundObsolete}</span>
              <span className="mx-1 text-gray-300">·</span>
              DB-only: <span className="font-bold text-amber-700">{summary.dbOnly}</span>
              <span className="mx-1 text-gray-300">·</span>
              Excel-only: <span className="font-bold text-red-700">{summary.excelOnly}</span>
              <span className="mx-1 text-gray-300">·</span>
              Ver missing: <span className="font-bold text-red-700">{summary.versionMissing}</span>
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search SOP code / name / SOP No / month…"
              className="w-full max-w-xl rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-purple-300 focus:outline-none"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Clear
        </button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading SOP details…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-gray-100">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  {(
                    [
                      { key: 'sopCode', label: 'SOP Code', w: 130 },
                      { key: 'title', label: 'Name' },
                      { key: 'sopNo', label: 'SOP No', w: 140 },
                      { key: 'version', label: 'Ver', w: 80 },
                      { key: 'versionStatus', label: 'Ver Status', w: 110 },
                      { key: 'month', label: 'Month', w: 90 },
                      { key: 'status', label: 'Status', w: 110 },
                      { key: 'raw', label: 'Raw', w: 120 },
                    ] as any[]
                  ).map((h) => {
                    if (h.key === 'raw') {
                      return (
                        <th
                          key={h.key}
                          className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-600"
                          style={h.w ? { width: h.w } : undefined}
                        >
                          {h.label}
                        </th>
                      );
                    }
                    const active = sortKey === h.key;
                    return (
                      <th
                        key={h.key}
                        style={h.w ? { width: h.w } : undefined}
                        className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-600"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const k = h.key as any;
                            if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                            else {
                              setSortKey(k);
                              setSortDir('asc');
                            }
                          }}
                          className={`inline-flex items-center gap-1 hover:underline ${active ? 'text-purple-700' : ''}`}
                          title="Click to sort"
                        >
                          {h.label}
                          {active ? <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r: any) => {
                  const key = String(r?.sopCode || '');
                  const isOpen = !!expanded[key];
                  const excel = r?.excel || {};
                  const db = r?.db || {};
                  const dbPresent = !!db?.present;
                  const excelPresent = !!excel?.present;
                  const obsoletePresent = !!r?.obsolete?.present;
                  const isFound = dbPresent && excelPresent;
                  const isDbOnly = dbPresent && !excelPresent;
                  const isExcelOnly = !dbPresent && excelPresent;
                  const isFoundObsolete = !dbPresent && obsoletePresent && excelPresent;
                  const versionMissingDb = dbPresent && (db?.version === null || db?.version === undefined);
                  const obsId = String(r?.obsolete?.identifier || '').trim();
                  const obsVerMatch = obsId.match(/-0*(\d+)$/);
                  const obsVersion = obsVerMatch ? parseInt(obsVerMatch[1], 10) : null;
                  const displaySopNo = db?.sopNo || (obsoletePresent ? obsId : '');
                  const displayVersion = dbPresent ? (db?.version ?? null) : obsoletePresent ? obsVersion : null;
                  const versionAvailable = dbPresent
                    ? !versionMissingDb
                    : obsoletePresent
                      ? displayVersion !== null
                      : false;
                  return (
                    <Fragment key={key}>
                      <tr
                        className={`border-b border-gray-50 hover:bg-gray-50 ${
                          isFound
                            ? 'bg-emerald-50/40'
                            : isFoundObsolete
                              ? 'bg-purple-50/50'
                              : isDbOnly
                                ? 'bg-amber-50/40'
                                : isExcelOnly
                                  ? 'bg-red-50/30'
                                  : ''
                        }`}
                      >
                        <td className="px-3 py-2 font-mono font-bold text-gray-900">
                          {r?.sopCode}
                        </td>
                        <td className="px-3 py-2 text-gray-800">
                          <div className="font-semibold">{r?.title || '—'}</div>
                          {db?.isDualLanguage && r?.raw?.registryRow?.gujaratiName && (
                            <div className="mt-0.5 text-[11px] text-indigo-700 font-medium">{r.raw.registryRow.gujaratiName}</div>
                          )}
                          {(db?.location || db?.trainer) && (
                            <div className="mt-0.5 text-[11px] text-gray-500">
                              {db?.location ? <span>Loc: {db.location}</span> : null}
                              {db?.location && db?.trainer ? <span className="mx-1">·</span> : null}
                              {db?.trainer ? <span>Trainer: {db.trainer}</span> : null}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-gray-700">{displaySopNo || '—'}</td>
                        <td className="px-3 py-2 font-bold text-gray-700">{displayVersion ?? '—'}</td>
                        <td className="px-3 py-2">
                          {!versionAvailable ? (
                            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                              Missing
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                              Available
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-700">{excel?.month || '—'}</td>
                        <td className="px-3 py-2">
                          {isFound ? (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                              Found
                            </span>
                          ) : isFoundObsolete ? (
                            <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700">
                              Found (obsolete)
                            </span>
                          ) : isDbOnly ? (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                              DB only
                            </span>
                          ) : isExcelOnly ? (
                            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                              Not found
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-bold text-gray-600">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setExpanded((s) => ({ ...s, [key]: !s[key] }))}
                            className="text-purple-700 font-semibold hover:underline"
                          >
                            {isOpen ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-gray-50 bg-gray-50/60">
                          <td colSpan={8} className="px-3 py-3">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                              <div className="rounded-xl border border-gray-200 bg-white p-3">
                                <div className="text-[11px] font-bold text-gray-700 mb-2">DB (registry row)</div>
                                <pre className="max-h-[260px] overflow-auto text-[10px] leading-snug text-gray-700 whitespace-pre-wrap">
                                  {JSON.stringify(r?.raw?.registryRow ?? null, null, 2)}
                                </pre>
                              </div>
                              <div className="rounded-xl border border-gray-200 bg-white p-3">
                                <div className="text-[11px] font-bold text-gray-700 mb-2">Excel upload (stored in DB)</div>
                                <pre className="max-h-[260px] overflow-auto text-[10px] leading-snug text-gray-700 whitespace-pre-wrap">
                                  {JSON.stringify(r?.raw?.upload ?? null, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-500">
                      No SOPs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Assign SOP to Matrix Modal ───────────────────────────────────────────────

interface SopOption { _id: string; identifier: string; name: string; department: string; version?: string }

function AssignSOPModal({
  defaultDept,
  onClose,
  onSuccess,
}: {
  defaultDept?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [department, setDepartment]     = useState(defaultDept || 'QA');
  const [sopSearch, setSopSearch]       = useState('');
  const [sopOptions, setSopOptions]     = useState<SopOption[]>([]);
  const [selectedSop, setSelectedSop]   = useState<SopOption | null>(null);
  const [month, setMonth]               = useState(currentMonth);
  const [year, setYear]                 = useState(currentYear);
  const [designations, setDesignations] = useState('');
  const [loading, setLoading]           = useState(false);
  const [searching, setSearching]       = useState(false);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState('');

  useEffect(() => {
    if (!sopSearch.trim()) { setSopOptions([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/training-matrix/sops-for-matrix?department=${encodeURIComponent(department)}&search=${encodeURIComponent(sopSearch)}`);
        const json = await res.json();
        setSopOptions(json.sops || []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [sopSearch, department]);

  const handleAssign = async () => {
    if (!selectedSop) { setError('Please select a SOP from the master database.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/training-matrix/matrix-sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department,
          sopId: selectedSop._id,
          effectiveMonth: month,
          effectiveYear: year,
          designationApplicability: designations.split(',').map((s) => s.trim()).filter(Boolean),
          createdBy: 'admin',
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to assign SOP'); return; }
      setSuccess(`SOP ${selectedSop.identifier} assigned to ${department} matrix.`);
      setTimeout(() => { onSuccess(); onClose(); }, 1200);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-800">Assign SOP to Matrix</h2>
            <p className="mt-0.5 text-xs text-gray-500">SOPs are sourced from the master SOP database — no manual entry.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              <CheckCircle className="h-3.5 w-3.5 shrink-0" /> {success}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Department *</label>
              <select
                value={department}
                onChange={(e) => { setDepartment(e.target.value); setSelectedSop(null); setSopSearch(''); setSopOptions([]); }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-purple-300 focus:outline-none"
              >
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Effective Month/Year *</label>
              <div className="flex gap-1">
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-gray-200 px-2 py-2 text-xs focus:border-purple-300 focus:outline-none"
                >
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m.slice(0, 3)}</option>)}
                </select>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-20 rounded-lg border border-gray-200 px-2 py-2 text-xs focus:border-purple-300 focus:outline-none"
                  min={2020}
                  max={2099}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Search SOP (master DB) *</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={sopSearch}
                onChange={(e) => { setSopSearch(e.target.value); setSelectedSop(null); }}
                placeholder="Type SOP code or name…"
                className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-xs focus:border-purple-300 focus:outline-none"
              />
              {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">searching…</span>}
            </div>
            {sopOptions.length > 0 && !selectedSop && (
              <div className="mt-1 max-h-44 overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                {sopOptions.map((s) => (
                  <button
                    key={s._id}
                    type="button"
                    onClick={() => { setSelectedSop(s); setSopSearch(`${s.identifier} — ${s.name}`); setSopOptions([]); }}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-purple-50"
                  >
                    <span className="font-mono font-semibold text-purple-700 shrink-0">{s.identifier}</span>
                    <span className="text-gray-600 line-clamp-1">{s.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-gray-400">{s.department}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedSop && (
              <div className="mt-1 flex items-center gap-2 rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-800">
                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-purple-600" />
                <span className="font-semibold">{selectedSop.identifier}</span>
                <span className="text-gray-600">{selectedSop.name}</span>
                <button type="button" onClick={() => { setSelectedSop(null); setSopSearch(''); }} className="ml-auto text-purple-400 hover:text-purple-700">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Designation Applicability (optional, comma-separated)</label>
            <input
              value={designations}
              onChange={(e) => setDesignations(e.target.value)}
              placeholder="e.g. Analyst, Senior Analyst, Team Lead"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-purple-300 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button onClick={onClose} className="rounded-lg border px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleAssign}
            disabled={loading || !selectedSop}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> {loading ? 'Assigning…' : 'Assign to Matrix'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Matrix Entry Modal ───────────────────────────────────────────────────

interface MatrixEntryRow {
  _id?: string;
  department: string;
  employeeName: string;
  designation?: string;
  sopCode: string;
  month: number;
  year: number;
  trainingStatus?: string;
  qualificationStatus?: string;
  trainingDate?: string;
  retrainingDate?: string;
  trainerName?: string;
  evaluationResult?: string;
  competencyStatus?: string;
  remarks?: string;
}

function EditMatrixEntryModal({
  entry,
  onClose,
  onSuccess,
}: {
  entry: MatrixEntryRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<MatrixEntryRow>({ ...entry });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const set = (key: keyof MatrixEntryRow, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const isNew = !form._id;
      const url = '/api/training-matrix/matrix-entries';
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew
        ? { ...form, createdBy: 'admin' }
        : { id: form._id, ...form, updatedBy: 'admin' };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Save failed'); return; }
      setSuccess('Entry saved successfully.');
      setTimeout(() => { onSuccess(); onClose(); }, 900);
    } finally {
      setLoading(false);
    }
  };

  const labelCls = 'mb-1 block text-xs font-medium text-gray-600';
  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-purple-300 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-800">{form._id ? 'Edit' : 'Add'} Matrix Entry</h2>
            <p className="mt-0.5 text-xs text-gray-500">{entry.employeeName} — {entry.sopCode} — {MONTHS[entry.month - 1]} {entry.year}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[60vh] overflow-auto p-5">
          {error && <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> {error}</div>}
          {success && <div className="mb-3 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700"><CheckCircle className="h-3.5 w-3.5" /> {success}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Training Status</label>
              <select value={form.trainingStatus || 'not_started'} onChange={(e) => set('trainingStatus', e.target.value)} className={inputCls}>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="retraining_required">Retraining Required</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Qualification Status</label>
              <select value={form.qualificationStatus || 'pending'} onChange={(e) => set('qualificationStatus', e.target.value)} className={inputCls}>
                <option value="pending">Pending</option>
                <option value="qualified">Qualified</option>
                <option value="not_qualified">Not Qualified</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Training Date</label>
              <input type="date" value={form.trainingDate ? form.trainingDate.slice(0, 10) : ''} onChange={(e) => set('trainingDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Retraining Date</label>
              <input type="date" value={form.retrainingDate ? form.retrainingDate.slice(0, 10) : ''} onChange={(e) => set('retrainingDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Trainer Name</label>
              <input value={form.trainerName || ''} onChange={(e) => set('trainerName', e.target.value)} className={inputCls} placeholder="Trainer name" />
            </div>
            <div>
              <label className={labelCls}>Competency Status</label>
              <input value={form.competencyStatus || ''} onChange={(e) => set('competencyStatus', e.target.value)} className={inputCls} placeholder="e.g. Competent" />
            </div>
            <div>
              <label className={labelCls}>Evaluation Result</label>
              <input value={form.evaluationResult || ''} onChange={(e) => set('evaluationResult', e.target.value)} className={inputCls} placeholder="e.g. Pass / Score" />
            </div>
            <div>
              <label className={labelCls}>Remarks</label>
              <input value={form.remarks || ''} onChange={(e) => set('remarks', e.target.value)} className={inputCls} placeholder="Optional remarks" />
            </div>
          </div>

          <p className="mt-4 text-[10px] text-gray-400">SOP master data (ID, name, version) is read-only and cannot be changed here.</p>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button onClick={onClose} className="rounded-lg border px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-purple-700 disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" /> {loading ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Remove SOP from Matrix Modal ─────────────────────────────────────────────

function RemoveSOPModal({
  assignmentId,
  sopCode,
  department,
  onClose,
  onSuccess,
}: {
  assignmentId: string;
  sopCode: string;
  department: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleRemove = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/training-matrix/matrix-sop/${assignmentId}?deletedBy=admin`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to remove SOP'); setLoading(false); return; }
      onSuccess();
      onClose();
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-bold text-gray-800">Remove SOP from Matrix</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">
          <div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold">Remove <span className="font-mono">{sopCode}</span> from <span className="font-semibold">{department}</span> matrix?</p>
              <p className="mt-1 text-xs">This will soft-delete the SOP assignment and all associated matrix entries. Historical data is preserved. The SOP master record is not affected.</p>
            </div>
          </div>
          {error && <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> {error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button onClick={onClose} className="rounded-lg border px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleRemove}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-red-700 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> {loading ? 'Removing…' : 'Yes, Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Manage Matrix SOPs Panel ──────────────────────────────────────────────────

// Status badge colour helper
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:      'bg-amber-100 text-amber-700',
    completed:    'bg-green-100 text-green-700',
    not_required: 'bg-gray-100 text-gray-500',
    na:           'bg-gray-100 text-gray-400',
  };
  const label: Record<string, string> = {
    pending: 'Pending', completed: 'Completed', not_required: 'Not Required', na: 'N/A',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[status] || 'bg-gray-100 text-gray-400'}`}>
      {label[status] || status}
    </span>
  );
}

// Step 2 of the assign flow — fill training data for each employee
function AssignSOPDataForm({
  sop,
  dept,
  uploadContext,
  existingEmployees,
  onBack,
  onSuccess,
}: {
  sop: any;
  dept: string;
  uploadContext: { month: number; year: number; monthName: string } | null;
  existingEmployees: Array<{ name: string; designation: string }>;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const currentMonth = uploadContext?.month ?? new Date().getMonth() + 1;
  const currentYear  = uploadContext?.year  ?? new Date().getFullYear();

  // Each row: employee name + designation + training status
  const [rows, setRows] = useState<Array<{ name: string; designation: string; trainingStatus: string }>>(
    existingEmployees.length > 0
      ? existingEmployees.map((e) => ({ name: e.name, designation: e.designation, trainingStatus: 'pending' }))
      : [{ name: '', designation: '', trainingStatus: 'pending' }],
  );
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear]   = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const addRow = () => setRows((r) => [...r, { name: '', designation: '', trainingStatus: 'pending' }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, key: string, val: string) =>
    setRows((r) => r.map((row, idx) => idx === i ? { ...row, [key]: val } : row));

  const handleSave = async () => {
    const validRows = rows.filter((r) => r.name.trim());
    if (!validRows.length) { setError('Add at least one employee.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/training-matrix/assign-sop-to-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department: dept,
          sopId:      sop._id,
          month,
          year,
          employees:  validRows,
          createdBy:  'admin',
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to assign SOP'); setLoading(false); return; }
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-purple-300 focus:outline-none';

  return (
    <div className="flex flex-col" style={{ maxHeight: '80vh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <button onClick={onBack} className="rounded-lg p-1.5 hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-gray-800">Assign <span className="font-mono text-purple-700">{sop.identifier}</span> to {dept}</h2>
          <p className="mt-0.5 text-xs text-gray-500 truncate">{sop.name}</p>
        </div>
      </div>

      {/* Month/year selector */}
      <div className="flex items-center gap-3 border-b bg-gray-50 px-5 py-3">
        <span className="text-xs font-medium text-gray-600">Effective month:</span>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className={inputCls}
        >
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className={`w-20 ${inputCls}`}
          min={2020} max={2099}
        />
        {uploadContext && (
          <span className="text-[10px] text-gray-400">Latest upload: {uploadContext.monthName} {uploadContext.year}</span>
        )}
      </div>

      {/* Employee rows */}
      <div className="flex-1 overflow-auto px-5 py-4">
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        )}

        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-gray-600">
            Set training status for each employee ({rows.filter(r => r.name.trim()).length} / {rows.length})
          </p>
          <button
            onClick={addRow}
            className="flex items-center gap-1 rounded-lg border border-dashed border-purple-300 px-2.5 py-1 text-[11px] font-medium text-purple-600 hover:bg-purple-50"
          >
            <Plus className="h-3 w-3" /> Add employee
          </button>
        </div>

        {/* Column headers */}
        <div className="mb-1 grid grid-cols-[2fr_1.5fr_1.5fr_1.5fr_auto] gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1">
          <span>Employee Name</span>
          <span>Designation</span>
          <span>Training Status</span>
          <span>Qualification</span>
          <span className="w-6" />
        </div>

        <div className="space-y-2">
          {rows.map((row, i) => {
            // A row is in "new employee" mode if the user explicitly chose __new__
            // or if there are no existing employees to pick from.
            const isNewMode = row.name === '__new__' || (existingEmployees.length === 0);
            const displayName = row.name === '__new__' ? '' : row.name;
            return (
            <div key={i} className="grid grid-cols-[2fr_1.5fr_1.5fr_1.5fr_auto] items-center gap-2">
              {existingEmployees.length > 0 && !isNewMode ? (
                <select
                  value={row.name}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      // Switch to free-text mode; clear name + designation
                      updateRow(i, 'name', '__new__');
                      updateRow(i, 'designation', '');
                    } else {
                      const emp = existingEmployees.find((x) => x.name === e.target.value);
                      updateRow(i, 'name', e.target.value);
                      if (emp) updateRow(i, 'designation', emp.designation);
                    }
                  }}
                  className={inputCls}
                >
                  <option value="">— select —</option>
                  {existingEmployees.map((e) => (
                    <option key={e.name} value={e.name}>{e.name}</option>
                  ))}
                  <option disabled>──────────</option>
                  <option value="__new__">＋ New employee…</option>
                </select>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    value={displayName}
                    onChange={(e) => updateRow(i, 'name', e.target.value)}
                    placeholder="Enter employee name"
                    autoFocus={row.name === '__new__'}
                    className={`flex-1 ${inputCls}`}
                  />
                  {existingEmployees.length > 0 && (
                    <button
                      type="button"
                      title="Back to dropdown"
                      onClick={() => { updateRow(i, 'name', ''); updateRow(i, 'designation', ''); }}
                      className="shrink-0 rounded p-1 text-gray-300 hover:text-gray-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
              <input
                value={row.designation}
                onChange={(e) => updateRow(i, 'designation', e.target.value)}
                placeholder="Designation"
                className={inputCls}
              />
              <select
                value={row.trainingStatus}
                onChange={(e) => updateRow(i, 'trainingStatus', e.target.value)}
                className={inputCls}
              >
                <option value="pending">Pending (√)</option>
                <option value="completed">Completed (✓)</option>
                <option value="not_required">Not Required (X)</option>
                <option value="na">N/A</option>
              </select>
              <StatusBadge status={row.trainingStatus || 'pending'} />
              <button
                onClick={() => removeRow(i)}
                disabled={rows.length === 1}
                className="rounded p-1 text-gray-300 hover:text-red-500 disabled:opacity-30"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
          })}
        </div>

        <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
          <strong>Note:</strong> This SOP will appear as a new column in the {dept} training matrix. SOP master data (ID, name) is read-only and comes from the central SOP database.
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <button onClick={onBack} className="rounded-lg border px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Back</button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-purple-700 disabled:opacity-50"
        >
          <CheckCircle className="h-3.5 w-3.5" /> {loading ? 'Saving…' : `Add to Matrix (${rows.filter(r => r.name.trim()).length} employees)`}
        </button>
      </div>
    </div>
  );
}

// Main Manage SOPs Modal — shows unassigned SOPs, drives the 2-step assign flow
function ManageMatrixSOPsModal({
  defaultDept,
  onClose,
  onRefresh,
}: {
  defaultDept?: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [dept, setDept]         = useState(defaultDept || 'QA');
  const [search, setSearch]     = useState('');
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [existingEmployees, setExistingEmployees] = useState<Array<{ name: string; designation: string }>>([]);
  const [uploadContext, setUploadContext] = useState<{ month: number; year: number; monthName: string } | null>(null);
  const [loading, setLoading]   = useState(false);
  // Step: 'list' | 'form'
  const [step, setStep]         = useState<'list' | 'form'>('list');
  const [selectedSop, setSelectedSop] = useState<any | null>(null);
  const [saved, setSaved]       = useState<string[]>([]); // sopCodes successfully assigned this session

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/training-matrix/unassigned-sops?department=${encodeURIComponent(dept)}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res  = await fetch(url);
      const json = await res.json();
      setUnassigned(json.unassigned || []);
      setExistingEmployees(json.existingEmployees || []);
      setUploadContext(json.uploadContext || null);
    } finally {
      setLoading(false);
    }
  }, [dept, search]);

  useEffect(() => { load(); }, [load]);

  const handleAssignClick = (sop: any) => {
    setSelectedSop(sop);
    setStep('form');
  };

  const handleAssignSuccess = () => {
    if (selectedSop) setSaved((s) => [...s, selectedSop.identifier]);
    setStep('list');
    setSelectedSop(null);
    load();
    onRefresh();
  };

  if (step === 'form' && selectedSop) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
          <AssignSOPDataForm
            sop={selectedSop}
            dept={dept}
            uploadContext={uploadContext}
            existingEmployees={existingEmployees}
            onBack={() => { setStep('list'); setSelectedSop(null); }}
            onSuccess={handleAssignSuccess}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl" style={{ maxHeight: '85vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-800">Assign SOP to Matrix</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              SOPs listed here are in the master DB but <strong>not yet in the {dept} Excel matrix</strong>. Click Assign to add one.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b bg-gray-50 px-5 py-3">
          <select
            value={dept}
            onChange={(e) => { setDept(e.target.value); setSaved([]); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:border-purple-300 focus:outline-none"
          >
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SOP code or name…"
              className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-purple-300 focus:outline-none"
            />
          </div>
          <button onClick={load} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-white">
            <RefreshCw className="h-3 w-3" />
          </button>
          <span className="shrink-0 text-[11px] text-gray-400">
            {loading ? 'loading…' : `${unassigned.length} unassigned`}
          </span>
        </div>

        {/* SOP list */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading SOPs…</div>
          ) : unassigned.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-400" />
              <p className="text-sm font-medium text-gray-600">All SOPs are already in the {dept} matrix!</p>
              <p className="mt-1 text-xs text-gray-400">Upload a new Excel file to add more SOPs.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="border-b px-4 py-2.5 font-semibold text-gray-600">SOP Code</th>
                  <th className="border-b px-4 py-2.5 font-semibold text-gray-600">SOP Name</th>
                  <th className="border-b px-4 py-2.5 font-semibold text-gray-600 w-28">Action</th>
                </tr>
              </thead>
              <tbody>
                {unassigned.map((s: any) => {
                  const alreadySaved = saved.includes(s.identifier);
                  return (
                    <tr key={s._id} className={`border-b border-gray-100 ${alreadySaved ? 'bg-green-50' : 'hover:bg-purple-50/40'}`}>
                      <td className="px-4 py-2.5 font-mono font-semibold text-purple-700">{s.identifier}</td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-[280px]">
                        <span className="line-clamp-2">{s.name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {alreadySaved ? (
                          <span className="flex items-center gap-1 text-green-600 text-[11px] font-medium">
                            <CheckCircle className="h-3.5 w-3.5" /> Added
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAssignClick(s)}
                            className="flex items-center gap-1 rounded-lg bg-purple-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-purple-700"
                          >
                            <Plus className="h-3 w-3" /> Assign
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3">
          <p className="text-[11px] text-gray-400">
            SOPs already in the matrix come from the uploaded Excel files.
          </p>
          <button onClick={onClose} className="rounded-lg border px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Client ─────────────────────────────────────────────────────────

export default function TrainingMatrixPage() {
  useAuthGuard();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showManageSOPs, setShowManageSOPs] = useState(false);
  const [activeDept, setActiveDept] = useState<ActiveDept>('All');
  const [activeMonth, setActiveMonth] = useState<ActiveMonth>('All');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<MatrixViewMode>('sop'); // default: SOP-wise
  const [groupBy, setGroupBy] = useState<GroupByMode>('department');
  const [capsuleSopFilter, setCapsuleSopFilter] = useState<null | {
    title: string;
    dept: ActiveDept;
    sopCodes: Set<string>;
    // Optional: for repeat-type filters, store per-SOP dept breakdown for the banner
    repeatMeta?: Array<{ sopCode: string; count: number; depts: string[] }>;
  }>(null);
  const [detailModal, setDetailModal] = useState<null | {
    kind: 'sop' | 'employee' | 'monthDept' | 'employeeList';
    title: string;
    subtitle?: string;
    // SOP details
    sopCode?: string;
    sopTitle?: string;
    department?: string;
    monthLabel?: string;
    trainer?: string;
    targetDate?: string | null;
    expired?: boolean;
    completionPct?: number;
    totalApplicable?: number;
    inExcelDepts?: string[];
    mcqTotal?: number;
    mcqApproved?: number;
    mcqEngTotal?: number;
    mcqEngApproved?: number;
    mcqGujTotal?: number;
    mcqGujApproved?: number;
    isDualLanguage?: boolean;
    foundEmployees?: Array<{ name: string; designation?: string; department?: string }>;
    missingEmployees?: Array<{ name: string; designation?: string; department?: string }>;
    // Employee details
    employeeName?: string;
    // Employee details (SOP schedule table)
    employeeSops?: Array<{ sopCode: string; month: string; symbol: '√' | 'X' | 'NA' }>;
    // Month+Dept details (loaded)
    month?: number;
    year?: number;
    // Employee list popup
    employeeListRows?: Array<{ name: string; designation: string; department: string; fullyTrained: boolean; totalSops: number; trainedSops: number }>;
    employeeListFilter?: EmployeeListFilter;
  }>(null);
  const [monthDetail, setMonthDetail] = useState<{
    loading: boolean;
    error: string;
    sopRows: Array<{ sopCode: string; trained: number; pending: number; totalApplicable: number; completionPct: number }>;
  }>({ loading: false, error: '', sopRows: [] });

  const [sopDetailSearch, setSopDetailSearch] = useState('');
  const [sopDetailSortField, setSopDetailSortField] = useState<'name' | 'designation' | 'department'>('name');
  const [sopDetailSortDir, setSopDetailSortDir] = useState<'asc' | 'desc'>('asc');

  const [empModalSearch, setEmpModalSearch] = useState('');
  const [empModalFilter, setEmpModalFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [empModalSort, setEmpModalSort] = useState<{ field: 'code' | 'name' | 'month'; dir: 'asc' | 'desc' }>({ field: 'code', dir: 'asc' });

  const [missingModal, setMissingModal] = useState<null | {
    title: string;
    kind: 'sop' | 'trainer' | 'repeat-sop';
    rows: Array<Record<string, any>>;
  }>(null);

  const [sopDetailsPanel, setSopDetailsPanel] = useState<null | {
    dept: Dept;
    type: SopDetailType;
    title: string;
  }>(null);
  const [sopDetails, setSopDetails] = useState<{
    loading: boolean;
    error: string;
    rows: any[];
  }>({ loading: false, error: '', rows: [] });

  const [showDbSops, setShowDbSops] = useState(false);
  const tableSectionRef = useRef<HTMLElement>(null);

  // Capsule views data (employee-wise / month-wise) comes from TrainingMatrixRecord
  const [capsuleLoading, setCapsuleLoading] = useState(false);
  const [capsuleError, setCapsuleError] = useState<string>('');
  const [deptMonthGroups, setDeptMonthGroups] = useState<any[]>([]);
  const [empCapsules, setEmpCapsules] = useState<any[]>([]);

  const fetchData = useCallback(async (forceRefresh = false) => {
    const SESSION_KEY = 'training_matrix_overview_cache';
    const SESSION_TTL_MS = 5 * 60 * 1000;

    // Tier 1: sessionStorage — if fresh, skip network entirely (prevents refetch on navigation)
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) {
          const { payload, cachedAt } = JSON.parse(raw);
          if (Date.now() - cachedAt <= SESSION_TTL_MS && payload?.success) {
            console.log('📦 TrainingMatrix: fresh sessionStorage cache — skipping network');
            setData(payload as OverviewData);
            setLoading(false);
            return; // ← Cache is fresh, no need to refetch
          }
        }
      } catch { /* ignore malformed cache */ }
    }

    // Tier 2: Network fetch (no cache or cache expired)
    setLoading(true);
    try {
      const url = forceRefresh
        ? '/api/training-matrix/overview?refresh=1'
        : '/api/training-matrix/overview';
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setData(json as OverviewData);
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify({ payload: json, cachedAt: Date.now() }));
        } catch { /* quota — ignore */ }
      }
    } catch (e) {
      console.error('Failed to load overview', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Keep groupBy reasonable per view
  useEffect(() => {
    if (viewMode === 'month' && groupBy === 'sop') setGroupBy('department');
    if (viewMode === 'employee' && groupBy === 'month') setGroupBy('department');
  }, [viewMode, groupBy]);

  // Build the SOP list for the table based on active dept + month
  const visibleSops = useMemo(() => {
    if (!data) return [];
    const depts: Dept[] = activeDept === 'All' ? [...DEPARTMENTS] : [activeDept];
    const codes = new Set<string>();
    const monthOf: Record<string, string> = {};
    for (const d of depts) {
      const dSopCodes = data.sopCodesByDept?.[d] || [];
      const dMonthMap = data.sopMonthMapByDept?.[d] || {};
      for (const c of dSopCodes) {
        if (activeMonth === 'All' || dMonthMap[c] === activeMonth) {
          codes.add(c);
          monthOf[c] = dMonthMap[c] || '';
        }
      }
    }
    return [...codes].sort((a, b) => a.localeCompare(b)).map((c) => ({ code: c, month: monthOf[c] }));
  }, [data, activeDept, activeMonth]);

  const visibleEmployees = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    const depts: Dept[] = activeDept === 'All' ? [...DEPARTMENTS] : [activeDept];
    return data.employees
      .filter((e) => depts.includes(e.department as Dept))
      .filter((e) => !term || e.name.toLowerCase().includes(term) || (e.designation || '').toLowerCase().includes(term));
  }, [data, activeDept, search]);

  const activeMonthNumber = useMemo(() => {
    if (activeMonth === 'All') return 'all';
    const idx = MONTHS.findIndex((m) => m === activeMonth);
    if (idx < 0) return 'all';
    return String(idx + 1);
  }, [activeMonth]);

  // Month-level SOP counts for the capsule grid (driven by active dept)
  const monthCountsForGrid = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of MONTHS) counts[m] = 0;
    if (!data) return counts;
    const depts: Dept[] = activeDept === 'All' ? [...DEPARTMENTS] : [activeDept];
    if (activeDept !== 'All') {
      // Single dept: use the pre-aggregated counts directly
      const m = data.monthCountsByDept?.[depts[0]] || {};
      for (const month of MONTHS) counts[month] = m[month] || 0;
    } else {
      // All depts: sum each department's pre-aggregated monthly counts directly
      for (const d of depts) {
        const m = data.monthCountsByDept?.[d] || {};
        for (const month of MONTHS) counts[month] = (counts[month] || 0) + (m[month] || 0);
      }
    }
    return counts;
  }, [data, activeDept]);

  const totalUniqueSops = useMemo(() => {
    if (!data) return 0;
    const depts: Dept[] = activeDept === 'All' ? [...DEPARTMENTS] : [activeDept];
    const codes = new Set<string>();
    for (const d of depts) {
      (data.sopCodesByDept?.[d] || []).forEach((c: string) => codes.add(c));
    }
    return codes.size;
  }, [data, activeDept]);

  const fetchCapsuleViews = useCallback(async () => {
    setCapsuleLoading(true);
    setCapsuleError('');
    try {
      const deptParam = activeDept === 'All' ? 'all' : activeDept;

      // Month-wise: dept capsules grouped by month/year
      const pDept = new URLSearchParams({
        view: 'dept',
        month: activeMonthNumber,
        year: 'all',
        department: deptParam,
        status: 'all',
        examPending: 'false',
      });
      const rDept = await fetch(`/api/training-matrix/capsule-data?${pDept.toString()}`, { cache: 'no-store' });
      const jDept = await rDept.json();
      if (!jDept?.success) throw new Error(jDept?.error || 'Failed to load month view');
      setDeptMonthGroups(Array.isArray(jDept.monthGroups) ? jDept.monthGroups : []);

      // Employee-wise: employee capsules list
      const pEmp = new URLSearchParams({
        view: 'employee',
        month: activeMonthNumber,
        year: 'all',
        department: deptParam,
        employee: search || '',
        sop: '',
        status: 'all',
        examPending: 'false',
      });
      const rEmp = await fetch(`/api/training-matrix/capsule-data?${pEmp.toString()}`, { cache: 'no-store' });
      const jEmp = await rEmp.json();
      if (!jEmp?.success) throw new Error(jEmp?.error || 'Failed to load employee view');
      setEmpCapsules(Array.isArray(jEmp.capsules) ? jEmp.capsules : []);
    } catch (e: any) {
      setCapsuleError(e?.message || 'Failed to load capsule views');
      setDeptMonthGroups([]);
      setEmpCapsules([]);
    } finally {
      setCapsuleLoading(false);
    }
  }, [activeDept, activeMonthNumber, search]);

  useEffect(() => {
    // Only needed for employee/month views
    if (viewMode === 'employee' || viewMode === 'month') {
      fetchCapsuleViews();
    }
  }, [viewMode, fetchCapsuleViews]);

  useEffect(() => {
    if (!detailModal || detailModal.kind !== 'monthDept') return;
    if (!detailModal.department || !detailModal.month || !detailModal.year) return;

    let cancelled = false;
    (async () => {
      setMonthDetail({ loading: true, error: '', sopRows: [] });
      try {
        const department = String(detailModal.department);
        const month = String(detailModal.month);
        const year = String(detailModal.year);
        const p = new URLSearchParams({
          department,
          month,
          year,
        });
        const res = await fetch(`/api/training-matrix/data?${p.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!json?.success) throw new Error(json?.error || 'Failed to load month details');
        const employees = Array.isArray(json.employees) ? json.employees : [];
        const sopMap = new Map<string, { trained: number; pending: number }>();

        for (const emp of employees) {
          const trainings = emp.trainings || {};
          for (const [sopCode, t] of Object.entries(trainings as Record<string, any>)) {
            const st = String((t as any)?.status || '');
            if (!sopMap.has(sopCode)) sopMap.set(sopCode, { trained: 0, pending: 0 });
            const row = sopMap.get(sopCode)!;
            if (st === 'completed') row.trained++;
            if (st === 'pending') row.pending++;
          }
        }

        const rows = [...sopMap.entries()]
          .map(([sopCode, v]) => {
            const totalApplicable = v.trained + v.pending;
            const completionPct = totalApplicable ? Math.round((v.trained / totalApplicable) * 100) : 0;
            return { sopCode, trained: v.trained, pending: v.pending, totalApplicable, completionPct };
          })
          .sort((a, b) => a.sopCode.localeCompare(b.sopCode));

        if (!cancelled) setMonthDetail({ loading: false, error: '', sopRows: rows });
      } catch (e: any) {
        if (!cancelled) setMonthDetail({ loading: false, error: e?.message || 'Failed to load details', sopRows: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailModal]);

  const exportToExcel = () => {
    if (!visibleEmployees.length) return;
    const header = ['Employee Name', 'Designation', 'Department', ...visibleSops.map((s) => s.code), 'Trained', 'Total', 'Pct'];
    const rows = visibleEmployees.map((e) => {
      let trained = 0;
      let total = 0;
      const cells = visibleSops.map((s) => {
        const code = s.code;
        if (code in (e.training || {})) {
          total += 1;
          if (e.training[code]) {
            trained += 1;
            return {
              v: '√',
              t: 's'
            };
          }
          return {
            v: 'X',
            t: 's'
          };
        }
        return '';
      });
      const pct = total ? Math.round((trained / total) * 100) : 0;
      return [e.name, e.designation || '', e.department, ...cells, trained, total, `${pct}%`];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Training Matrix');
    const filename = `training-matrix${activeDept !== 'All' ? `_${activeDept}` : ''}${activeMonth !== 'All' ? `_${activeMonth}` : ''}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const openMissingSop = (rows: Array<{ sopCode: string; title: string; department: string }>) => {
    setMissingModal({
      title: 'Missing SOPs (in DB but not in Excel)',
      kind: 'sop',
      rows,
    });
  };
  const openMissingTrainer = (rows: Array<{ sopCode: string; month: string; department: string }>) => {
    setMissingModal({
      title: 'SOPs without a Trainer',
      kind: 'trainer',
      rows,
    });
  };

  const applySummaryCapsuleFilter = useCallback(
    async (opts: {
      dept: ActiveDept;
      dbDept?: string;
      type: SopDetailType;
      title: string;
      lang?: string;
      trainer?: 'assigned' | 'missing';
      status?: 'expired' | 'okay' | 'due_soon_60' | 'due_soon_60_mcq_reviewed' | 'due_soon_60_mcq_partial' | 'due_soon_60_mcq_not_reviewed' | 'mcq_created' | 'mcq_not_created' | 'mcq_all_approved' | 'mcq_partially_approved' | 'mcq_not_approved' | 'mcq_eng_created' | 'mcq_eng_not_created' | 'mcq_eng_all_approved' | 'mcq_eng_partially_approved' | 'mcq_eng_not_approved' | 'mcq_guj_created' | 'mcq_guj_not_created' | 'mcq_guj_all_approved' | 'mcq_guj_partially_approved' | 'mcq_guj_not_approved';
    }) => {
      setViewMode('sop');
      setGroupBy('department');
      setActiveMonth('All');
      setSearch('');
      setActiveDept(opts.dbDept && opts.dbDept !== 'All' ? opts.dbDept as ActiveDept : opts.dept);

      if (data) {
        let codes: string[] = [];
        const deptsToCheck = opts.dept === 'All' ? DEPARTMENTS : [opts.dept];

        // Fast-path for language-based DB total filter (ENG / GUJ buttons)
        if (opts.lang && opts.type === 'db') {
          for (const d of deptsToCheck) {
            const deptData = data.perDept?.[d] as any;
            if (!deptData?.uploaded) continue;
            const list: string[] = deptData.langSopListByKey?.[opts.lang] || [];
            codes.push(...list);
          }
          setCapsuleSopFilter({
            title: opts.title,
            dept: opts.dept,
            sopCodes: new Set(codes.map((c) => stripVersion(c))),
          });
          return;
        }

        if (opts.status) {
          // Use the exact pre-computed lists that match the backend counts
          for (const d of deptsToCheck) {
            const deptData = data.perDept?.[d] as any;
            if (!deptData?.uploaded) continue;
            let list: string[] = [];
            if (opts.status === 'expired') list = deptData.expiredList || [];
            else if (opts.status === 'okay') list = deptData.okayList || [];
            else if (opts.status === 'due_soon_60') list = deptData.dueSoon60List || [];
            else if (opts.status === 'due_soon_60_mcq_reviewed') list = deptData.dueSoon60McqReviewedList || [];
            else if (opts.status === 'due_soon_60_mcq_partial') list = deptData.dueSoon60McqPartialList || [];
            else if (opts.status === 'due_soon_60_mcq_not_reviewed') list = deptData.dueSoon60McqNotReviewedList || [];
            else if (opts.status === 'mcq_created') list = deptData.mcqCreatedList || [];
            else if (opts.status === 'mcq_not_created') list = deptData.mcqNotCreatedList || [];
            else if (opts.status === 'mcq_all_approved') list = deptData.mcqAllApprovedList || [];
            else if (opts.status === 'mcq_partially_approved') list = deptData.mcqPartiallyApprovedList || [];
            else if (opts.status === 'mcq_not_approved') list = deptData.mcqNotApprovedList || [];
            else if (opts.status === 'mcq_eng_created') list = deptData.mcqEngCreatedList || [];
            else if (opts.status === 'mcq_eng_not_created') list = deptData.mcqEngNotCreatedList || [];
            else if (opts.status === 'mcq_eng_all_approved') list = deptData.mcqEngAllApprovedList || [];
            else if (opts.status === 'mcq_eng_partially_approved') list = deptData.mcqEngPartiallyApprovedList || [];
            else if (opts.status === 'mcq_eng_not_approved') list = deptData.mcqEngNotApprovedList || [];
            else if (opts.status === 'mcq_guj_created') list = deptData.mcqGujCreatedList || [];
            else if (opts.status === 'mcq_guj_not_created') list = deptData.mcqGujNotCreatedList || [];
            else if (opts.status === 'mcq_guj_all_approved') list = deptData.mcqGujAllApprovedList || [];
            else if (opts.status === 'mcq_guj_partially_approved') list = deptData.mcqGujPartiallyApprovedList || [];
            else if (opts.status === 'mcq_guj_not_approved') list = deptData.mcqGujNotApprovedList || [];
            codes.push(...list);
          }
        } else if (opts.type === 'found' || opts.type === 'excel') {
          for (const d of deptsToCheck) {
            const deptData = data.perDept?.[d] as any;
            if (!deptData?.uploaded) continue;
            // 'found' = Excel SOPs that are also in DB
            let list = (deptData.foundInDbList || deptData.sopCodes || []);
            if (opts.dbDept && opts.dbDept !== 'All') {
              const targetDbCodes = new Set(((data.totalCard as any)?.dbSopsByDept?.[opts.dbDept] || []).map((x: any) => x.sopCode));
              list = list.filter((c: string) => targetDbCodes.has(c));
            }
            codes.push(...list);
          }
        } else if (opts.type === 'missing') {
          if (opts.dept === 'All') {
            codes = (data.totalCard as any)?.missingFromExcelList?.map((c: any) => c?.sopCode || c) || [];
          } else {
            codes = (data.perDept?.[opts.dept] as any)?.missingFromExcelList?.map((c: any) => c?.sopCode || c) || [];
          }
          if (opts.dbDept && opts.dbDept !== 'All') {
            const targetDbCodes = new Set(((data.totalCard as any)?.dbSopsByDept?.[opts.dbDept] || []).map((x: any) => x.sopCode));
            codes = codes.filter((c: string) => targetDbCodes.has(c));
          }
        }

        if (opts.trainer) {
          codes = codes.filter((c) => {
            let tr = '';
            for (const d of deptsToCheck) {
              if ((data.perDept?.[d] as any)?.trainerBySopCode?.[c]) {
                tr = (data.perDept?.[d] as any).trainerBySopCode[c];
                break;
              }
            }
            return opts.trainer === 'assigned' ? !!tr : !tr;
          });
        }

        setCapsuleSopFilter({
          title: opts.title,
          dept: opts.dept,
          sopCodes: new Set(codes.map((c) => stripVersion(c))),
        });
        return;
      }
    },
    [data],
  );

  const clearCapsuleFilter = useCallback(() => {
    setCapsuleSopFilter(null);
  }, []);

  const openEmployeeListPopup = useCallback(
    (dept: ActiveDept, filter: EmployeeListFilter, title: string) => {
      if (!data) return;
      const depts: Dept[] = dept === 'All' ? [...DEPARTMENTS] : [dept as Dept];
      const rows: Array<{ name: string; designation: string; department: string; fullyTrained: boolean; totalSops: number; trainedSops: number }> = [];
      for (const d of depts) {
        const deptData = data.perDept?.[d];
        if (!deptData?.uploaded) continue;
        const sopCodes = data.sopCodesByDept?.[d] || [];
        for (const emp of deptData.employees || []) {
          const totalSops = sopCodes.length;
          const trainedSops = sopCodes.filter((c: string) => emp.training?.[c] === true).length;
          const fullyTrained = totalSops > 0 && trainedSops === totalSops;
          rows.push({ name: emp.name, designation: emp.designation || '', department: d, fullyTrained, totalSops, trainedSops });
        }
      }
      setDetailModal({ kind: 'employeeList', title, employeeListRows: rows, employeeListFilter: filter });
    },
    [data],
  );

  // Applies a repeat-based filter directly to the SOP table (no modal)
  const applyRepeatFilter = useCallback(
    (dept: ActiveDept, bucket: '3+' | '2' | 'once', list: Array<{ sopCode: string; count: number }>) => {
      if (!list?.length || !data) return;
      setViewMode('sop');
      setGroupBy('department');
      setActiveMonth('All');
      setSearch('');
      setActiveDept('All'); // show all depts so cross-dept SOPs are visible

      // Build per-SOP dept membership using sopCodesByDept
      const repeatMeta = list.map(({ sopCode, count }) => {
        const depts = DEPARTMENTS.filter((d) =>
          (data.sopCodesByDept?.[d] || []).some((c: string) => c.toUpperCase() === sopCode.toUpperCase())
        );
        return { sopCode, count, depts };
      });

      const label = bucket === '3+' ? 'Repeat 3+' : bucket === '2' ? 'Repeat 2' : 'Once';
      setCapsuleSopFilter({
        title: `${dept} · ${label} (${list.length} SOPs shared across departments)`,
        dept: 'All',
        sopCodes: new Set(list.map((r) => r.sopCode.toUpperCase())),
        repeatMeta,
      });

      // Scroll to table
      setTimeout(() => {
        tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    },
    [data]
  );

  // SOP-wise capsules computed from the uploaded Excel snapshot (overview)
  const sopWiseGroups = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    const depts: Dept[] = activeDept === 'All' ? [...DEPARTMENTS] : [activeDept];

    // Build a title lookup from dbSopsByDept
    const titleMap = new Map<string, string>();
    const dualMap = new Map<string, { isDualLanguage: boolean; gujaratiName: string }>();
    for (const sopList of Object.values((data.totalCard as any)?.dbSopsByDept || {})) {
      for (const s of sopList as Array<{ sopCode: string; title: string; isDualLanguage?: boolean; gujaratiName?: string }>) {
        if (s.sopCode) {
          const key = stripVersion(s.sopCode).toUpperCase();
          titleMap.set(key, s.title || '');
          if (s.isDualLanguage) {
            dualMap.set(key, { isDualLanguage: true, gujaratiName: s.gujaratiName || '' });
          }
        }
      }
    }

    // dept → sopCode → { completed, pending, notRequired, employeesPending, employeesCompleted }
    const out: Array<{
      department: string;
      sops: Array<{
        sopCode: string;
        title: string;
        isDualLanguage?: boolean;
        gujaratiName?: string;
        month: string;
        completed: number;
        pending: number;
        totalApplicable: number;
        completionPct: number;
        pendingEmployees: string[];
        completedEmployees: string[];
        targetDate: string | null;
        expired: boolean;
        mcqTotal?: number;
        mcqApproved?: number;
        mcqEngTotal?: number;
        mcqEngApproved?: number;
        mcqGujTotal?: number;
        mcqGujApproved?: number;
      }>;
    }> = [];

    for (const dept of depts) {
      const employees = data.perDept?.[dept]?.employees || [];
      const excelCodes = (data.sopCodesByDept?.[dept] || []).map((c: string) => stripVersion(c));
      const dbCodes = ((data.totalCard as any)?.dbSopsByDept?.[dept] || []).map((x: any) => stripVersion(x.sopCode));
      const baseCodes = Array.from(new Set([...excelCodes, ...dbCodes]));
      const sopCodes = capsuleSopFilter
        ? baseCodes.filter((c) => capsuleSopFilter.sopCodes.has(String(c).toUpperCase()))
        : baseCodes;
      const monthMap = data.sopMonthMapByDept?.[dept] || {};
      const trainerMap: Record<string, string> = data.perDept?.[dept]?.trainerBySopCode || {};

      const sopStats = new Map<string, {
        completed: number;
        pending: number;
        pendingEmployees: string[];
        completedEmployees: string[];
      }>();

      for (const code of sopCodes) {
        sopStats.set(code, { completed: 0, pending: 0, pendingEmployees: [], completedEmployees: [] });
      }

      for (const emp of employees) {
        const name = emp.name || '';
        if (term && !(name.toLowerCase().includes(term) || (emp.designation || '').toLowerCase().includes(term))) {
          continue;
        }
        for (const code of sopCodes) {
          if (!(code in (emp.training || {}))) continue;
          const ok = !!emp.training[code];
          const stat = sopStats.get(code);
          if (!stat) continue;
          if (ok) {
            stat.completed += 1;
            stat.completedEmployees.push(name);
          } else {
            stat.pending += 1;
            stat.pendingEmployees.push(name);
          }
        }
      }

      const sops = sopCodes
        .map((sopCode) => {
          const stat = sopStats.get(sopCode) || { completed: 0, pending: 0, pendingEmployees: [], completedEmployees: [] };
          const totalApplicable = stat.completed + stat.pending;
          const completionPct = totalApplicable ? Math.round((stat.completed / totalApplicable) * 100) : 0;
          const status = data.sopStatusByCode?.[sopCode];
          const upper = sopCode.toUpperCase();
          const dualInfo = dualMap.get(upper);
          return {
            sopCode,
            title: (() => {
              const t = titleMap.get(upper) || (data.sopStatusByCode?.[sopCode] as any)?.title || (data.sopStatusByCode?.[upper] as any)?.title || '';
              return t.toUpperCase() === upper ? '' : t;
            })(),
            isDualLanguage: dualInfo?.isDualLanguage || false,
            gujaratiName: dualInfo?.gujaratiName || '',
            month: monthMap[sopCode] || '',
            trainer: trainerMap[sopCode] || '',
            completed: stat.completed,
            pending: stat.pending,
            totalApplicable,
            completionPct,
            pendingEmployees: stat.pendingEmployees,
            completedEmployees: stat.completedEmployees,
            targetDate: status?.targetDate || null,
            expired: !!status?.expired,
            mcqTotal: status?.totalQuestions || 0,
            mcqApproved: status?.approvedCount || 0,
            mcqEngTotal: (status as any)?.engTotalQuestions || 0,
            mcqEngApproved: (status as any)?.engApprovedCount || 0,
            mcqGujTotal: (status as any)?.gujTotalQuestions || 0,
            mcqGujApproved: (status as any)?.gujApprovedCount || 0,
          };
        })
        .filter((r) => {
          if (!term) return true;
          // keep if sop matches month/code search too
          return r.sopCode.toLowerCase().includes(term) || (r.month || '').toLowerCase().includes(term) || r.pendingEmployees.length > 0 || r.completedEmployees.length > 0;
        })
        .sort((a, b) => a.sopCode.localeCompare(b.sopCode));

      out.push({ department: dept, sops });
    }

    return out.filter((g) => g.sops.length > 0);
  }, [data, activeDept, search, capsuleSopFilter]);

  const renderTotalCard = (t: TotalCardData) => {
    const TotalIcon = DEPT_ICON.Total;

    // Aggregate lang breakdown across all uploaded depts
    const totalLangMap = new Map<string, { found: number; missing: number }>();
    for (const dept of DEPARTMENTS) {
      const deptData = data?.perDept?.[dept] as any;
      if (!deptData?.uploaded) continue;
      for (const lr of (deptData.langBreakdown || []) as Array<{ key: string; label: string; found: number; missing: number }>) {
        const existing = totalLangMap.get(lr.key) || { found: 0, missing: 0 };
        totalLangMap.set(lr.key, { found: existing.found + lr.found, missing: existing.missing + lr.missing });
      }
    }
    const totalLangBreakdown = Array.from(totalLangMap.entries())
      .sort(([a], [b]) => (a === b ? 0 : a === 'ENG' ? -1 : 1))
      .map(([key, v]) => ({ key, label: key, ...v }));

    // Aggregate repetitive SOP counts across all uploaded depts
    // De-duplicate by sopCode since same SOP appears in multiple dept lists
    const allRepeat3Plus = new Map<string, { sopCode: string; title: string; department: string; count: number }>();
    const allRepeat2 = new Map<string, { sopCode: string; title: string; department: string; count: number }>();
    const allRepeatOnce = new Map<string, { sopCode: string; title: string; department: string; count: number }>();
    for (const dept of DEPARTMENTS) {
      const deptData = data?.perDept?.[dept] as any;
      if (!deptData?.uploaded) continue;
      for (const item of (deptData.repeat3PlusList || []) as Array<{ sopCode: string; title: string; department: string; count: number }>) {
        if (!allRepeat3Plus.has(item.sopCode)) allRepeat3Plus.set(item.sopCode, item);
      }
      for (const item of (deptData.repeat2List || []) as Array<{ sopCode: string; title: string; department: string; count: number }>) {
        if (!allRepeat2.has(item.sopCode)) allRepeat2.set(item.sopCode, item);
      }
      for (const item of (deptData.repeat1List || []) as Array<{ sopCode: string; title: string; department: string; count: number }>) {
        if (!allRepeatOnce.has(item.sopCode)) allRepeatOnce.set(item.sopCode, item);
      }
    }
    const totalRepeat3PlusList = Array.from(allRepeat3Plus.values());
    const totalRepeat2List = Array.from(allRepeat2.values());
    const totalRepeatOnceList = Array.from(allRepeatOnce.values());

    // Aggregate Excel SOP Dept Split across all uploaded depts
    const totalExcelDeptFoundByDept: Record<string, number> = {};
    const totalExcelDeptMissingByDept: Record<string, number> = {};
    let totalExcelDeptUnknownFound = 0;
    let totalExcelDeptUnknownMissing = 0;
    let totalExcelDeptTotal = 0;
    for (const dept of DEPARTMENTS) {
      const deptData = data?.perDept?.[dept] as any;
      if (!deptData?.uploaded || !deptData.excelDeptSplit) continue;
      const split = deptData.excelDeptSplit;
      totalExcelDeptTotal += split.total ?? 0;
      totalExcelDeptUnknownFound += split.unknownFound ?? 0;
      totalExcelDeptUnknownMissing += split.unknownMissing ?? 0;
      for (const d of DEPARTMENTS) {
        totalExcelDeptFoundByDept[d] = (totalExcelDeptFoundByDept[d] || 0) + (split.foundByDept?.[d] || 0);
        totalExcelDeptMissingByDept[d] = (totalExcelDeptMissingByDept[d] || 0) + (split.missingByDept?.[d] || 0);
      }
    }
    const hasTotalExcelDeptSplit = totalExcelDeptTotal > 0;

    return (
      <CardShell accent={DEPT_ACCENT.Total} icon={TotalIcon} title="Total">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-normal text-gray-500">SOPs (DB)</span>
          <button
            type="button"
            onClick={() => {
              clearCapsuleFilter();
              setViewMode('sop');
              setGroupBy('department');
              setActiveMonth('All');
              setSearch('');
              setActiveDept('All');
            }}
            className="text-[11px] font-bold text-gray-900 hover:underline"
          >
            {t.dbSopCount}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-normal text-gray-500">In Excel</span>
          <div className="flex items-center gap-1.5 tabular-nums">
            <button
              type="button"
              onClick={() =>
                applySummaryCapsuleFilter({
                  dept: 'All',
                  type: 'found',
                  title: 'Total · Found in Excel',
                })
              }
              className="text-[11px] font-bold text-emerald-600 hover:underline"
              title="Found"
            >
              {t.excelSopCount}
            </button>
            <span className="text-[10px] text-gray-300 select-none">/</span>
            <button
              type="button"
              onClick={() =>
                applySummaryCapsuleFilter({
                  dept: 'All',
                  type: 'missing',
                  title: 'Total · Missing (DB but not in Excel)',
                })
              }
              className="text-[11px] font-bold text-red-600 hover:underline"
              title="Missing"
            >
              {t.missingSopCount}
            </button>
          </div>
        </div>
        {totalLangBreakdown.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-normal text-gray-500 shrink-0">Lang (DB)</span>
            <div className="flex items-center gap-3 tabular-nums">
              {totalLangBreakdown.map((lr) => {
                const dbTotal = lr.found + lr.missing;
                return (
                  <span key={lr.key} className="inline-flex items-center gap-1">
                    <span className="text-[10px] font-semibold text-gray-500">{lr.label}</span>
                    <button
                      type="button"
                      onClick={() =>
                        applySummaryCapsuleFilter({
                          dept: 'All',
                          type: 'db',
                          title: `Total · ${lr.label} (DB Total)`,
                          lang: lr.key,
                        })
                      }
                      className="text-[11px] font-bold text-gray-900 hover:text-emerald-600 hover:underline transition-colors"
                      title={`DB Total (${lr.found} Found + ${lr.missing} Missing)`}
                    >
                      {dbTotal}
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {hasTotalExcelDeptSplit && (
          <>
            <Divider />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-normal text-gray-500">Excel SOP Dept Split</span>
              <span className="text-[11px] font-bold text-gray-900 tabular-nums">{totalExcelDeptTotal}</span>
            </div>
            <SectionLabel>Found in Excel (DB Dept)</SectionLabel>
            <DeptStrip
              foundCounts={{
                ...totalExcelDeptFoundByDept,
                ...(totalExcelDeptUnknownFound > 0 ? { NA: totalExcelDeptUnknownFound } : {}),
              }}
              missingCounts={{
                ...totalExcelDeptMissingByDept,
                ...(totalExcelDeptUnknownMissing > 0 ? { NA: totalExcelDeptUnknownMissing } : {}),
              }}
              order={
                totalExcelDeptUnknownFound > 0 || totalExcelDeptUnknownMissing > 0
                  ? ([...DEPARTMENTS, 'NA'] as const)
                  : DEPARTMENTS
              }
              onSelectFound={(dbDept) =>
                applySummaryCapsuleFilter({
                  dept: 'All',
                  dbDept: dbDept === 'NA' ? 'All' : dbDept,
                  type: 'found',
                  title: `Total · Found (DB Dept: ${dbDept})`,
                })
              }
              onSelectMissing={(dbDept) =>
                applySummaryCapsuleFilter({
                  dept: 'All',
                  dbDept: dbDept === 'NA' ? 'All' : dbDept,
                  type: 'missing',
                  title: `Total · Missing (DB Dept: ${dbDept})`,
                })
              }
            />
          </>
        )}
        <Divider />
        <RowB
          label="Trainers"
          green={t.trainersAssigned}
          red={t.trainersMissing}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'Trainer assigned',
              trainer: 'assigned',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'Trainer missing',
              trainer: 'missing',
            })
          }
        />
        <Divider />
        <SectionLabel>Repetitive SOPs</SectionLabel>
        <RowD
          label="Repeat 3+"
          value={totalRepeat3PlusList.length}
          color="red"
          onClick={() => applyRepeatFilter('All', '3+', totalRepeat3PlusList)}
        />
        <RowD
          label="Repeat 2"
          value={totalRepeat2List.length}
          color="amber"
          onClick={() => applyRepeatFilter('All', '2', totalRepeat2List)}
        />
        <RowD
          label="Once"
          value={totalRepeatOnceList.length}
          color="green"
          onClick={() => applyRepeatFilter('All', 'once', totalRepeatOnceList)}
        />
        <RowB
          label="MCQ (100+ created)"
          green={t.mcqCreatedCount}
          red={t.mcqNotCreatedCount}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'MCQ Created (100+)',
              status: 'mcq_created',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'MCQ Not Created (<100)',
              status: 'mcq_not_created',
            })
          }
        />
        <div className="flex items-center justify-between pl-2">
          <span className="text-[10px] text-gray-400">↳ ENG</span>
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'MCQ ENG Created (100+)', status: 'mcq_eng_created' })} className="text-[11px] font-bold text-emerald-600 hover:underline">{t.mcqEngCreatedCount ?? 0}</button>
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'MCQ ENG Not Created (<100)', status: 'mcq_eng_not_created' })} className="text-[11px] font-bold text-red-600 hover:underline">{t.mcqEngNotCreatedCount ?? 0}</button>
          </span>
        </div>
        <div className="flex items-center justify-between pl-2">
          <span className="text-[10px] text-gray-400">↳ GUJ</span>
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'MCQ GUJ Created (100+)', status: 'mcq_guj_created' })} className="text-[11px] font-bold text-emerald-600 hover:underline">{t.mcqGujCreatedCount ?? 0}</button>
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'MCQ GUJ Not Created (<100)', status: 'mcq_guj_not_created' })} className="text-[11px] font-bold text-red-600 hover:underline">{t.mcqGujNotCreatedCount ?? 0}</button>
          </span>
        </div>
        <RowC
          label="MCQ Approved"
          green={t.mcqAllApprovedCount}
          amber={t.mcqPartiallyApprovedCount}
          red={t.mcqNotApprovedCount}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'MCQ All Approved',
              status: 'mcq_all_approved',
            })
          }
          onClickAmber={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'MCQ Partially Approved',
              status: 'mcq_partially_approved',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'MCQ Not Approved',
              status: 'mcq_not_approved',
            })
          }
        />
        <div className="flex items-center justify-between pl-2">
          <span className="text-[10px] text-gray-400">↳ ENG</span>
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'MCQ ENG All Approved', status: 'mcq_eng_all_approved' })} className="text-[11px] font-bold text-emerald-600 hover:underline">{t.mcqEngAllApprovedCount ?? 0}</button>
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'MCQ ENG Partially Approved', status: 'mcq_eng_partially_approved' })} className="text-[11px] font-bold text-amber-500 hover:underline">{t.mcqEngPartiallyApprovedCount ?? 0}</button>
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'MCQ ENG Not Approved', status: 'mcq_eng_not_approved' })} className="text-[11px] font-bold text-red-600 hover:underline">{t.mcqEngNotApprovedCount ?? 0}</button>
          </span>
        </div>
        <div className="flex items-center justify-between pl-2">
          <span className="text-[10px] text-gray-400">↳ GUJ</span>
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'MCQ GUJ All Approved', status: 'mcq_guj_all_approved' })} className="text-[11px] font-bold text-emerald-600 hover:underline">{t.mcqGujAllApprovedCount ?? 0}</button>
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'MCQ GUJ Partially Approved', status: 'mcq_guj_partially_approved' })} className="text-[11px] font-bold text-amber-500 hover:underline">{t.mcqGujPartiallyApprovedCount ?? 0}</button>
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'MCQ GUJ Not Approved', status: 'mcq_guj_not_approved' })} className="text-[11px] font-bold text-red-600 hover:underline">{t.mcqGujNotApprovedCount ?? 0}</button>
          </span>
        </div>
        <RowB
          label="SOP Expiry Status"
          green={t.okayCount}
          red={t.expiredCount}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'Valid SOPs',
              status: 'okay',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'Expired SOPs',
              status: 'expired',
            })
          }
        />
        {(t.dueSoon60Count ?? 0) > 0 && (
          <>
            <RowD
              label="Due in next 60 days"
              value={t.dueSoon60Count ?? 0}
              color="amber"
              onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Due in Next 60 Days', status: 'due_soon_60' })}
            />
            <RowD label="└ Reviewed" value={t.dueSoon60McqReviewed ?? 0} color="green" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Due in 60 Days · Reviewed', status: 'due_soon_60_mcq_reviewed' })} />
            <RowD label="└ Partially Reviewed" value={t.dueSoon60McqPartial ?? 0} color="amber" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Due in 60 Days · Partially Reviewed', status: 'due_soon_60_mcq_partial' })} />
            <RowD label="└ Not Reviewed" value={t.dueSoon60McqNotReviewed ?? 0} color="red" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Due in 60 Days · Not Reviewed', status: 'due_soon_60_mcq_not_reviewed' })} />
          </>
        )}
        <Divider />
        <RowA
          label="Employees"
          value={t.employeeCount}
          onClick={() => openEmployeeListPopup('All', 'all', 'All Employees')}
        />
        <RowD
          label="100% Trained"
          value={t.fullyTrained}
          color="green"
          onClick={() => openEmployeeListPopup('All', 'full', '100% Trained Employees')}
        />
        <RowD
          label="Incomplete"
          value={t.incomplete}
          color="amber"
          onClick={() => openEmployeeListPopup('All', 'incomplete', 'Incomplete Employees')}
        />
        <Divider />
        <SectionLabel>SOPs / Month</SectionLabel>
        <MonthStrip
          monthCounts={monthCountsForGrid}
          onSelectMonth={(m) => {
            setViewMode('sop');
            setGroupBy('department');
            setActiveDept('All');
            setActiveMonth(m);
            setSearch('');
            clearCapsuleFilter();
          }}
        />
        <Divider />
        <RowA label="Departments" value={`${t.departmentCount}/${t.totalDepartments}`} />
      </CardShell>
    );
  };

  const renderDeptCard = (dept: Dept, d: DeptCardData) => {
    const Icon = DEPT_ICON[dept];
    const dbDeptCount =
      (data?.totalCard?.dbSopCountsByDept as any)?.[dept] ??
      (data?.totalCard?.dbSopsByDept as any)?.[dept]?.length ??
      0;
    return (
      <CardShell accent={DEPT_ACCENT[dept]} icon={Icon} title={dept}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-normal text-gray-500">SOPs (DB)</span>
          <button
            type="button"
            onClick={() => {
              const dbSopList: Array<{ sopCode: string }> = (data?.totalCard?.dbSopsByDept as any)?.[dept] || [];
              setCapsuleSopFilter({
                title: `${dept} · DB SOPs (${dbDeptCount})`,
                dept,
                sopCodes: new Set(dbSopList.map((x) => String(x.sopCode).toUpperCase())),
              });
              setViewMode('sop');
              setGroupBy('department');
              setActiveMonth('All');
              setSearch('');
              setActiveDept(dept);
            }}
            className="text-[11px] font-bold text-gray-900 hover:underline"
          >
            {dbDeptCount}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-normal text-gray-500">In Excel</span>
          <div className="flex items-center gap-1.5 tabular-nums">
            <button
              type="button"
              onClick={() =>
                applySummaryCapsuleFilter({
                  dept,
                  type: 'found',
                  title: `${dept} · Found in Excel`,
                })
              }
              className="text-[11px] font-bold text-emerald-600 hover:underline"
              title="Found"
            >
              {d.foundInDb}
            </button>
            <span className="text-[10px] text-gray-300 select-none">/</span>
            <button
              type="button"
              onClick={() =>
                applySummaryCapsuleFilter({
                  dept,
                  type: 'missing',
                  title: `${dept} · Missing (DB but not in Excel)`,
                })
              }
              className="text-[11px] font-bold text-red-600 hover:underline"
              title="Missing"
            >
              {d.missingFromExcel}
            </button>
          </div>
        </div>
        {(d.langBreakdown || []).length > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-normal text-gray-500 shrink-0">Lang (DB)</span>
            <div className="flex items-center gap-3 tabular-nums">
              {(d.langBreakdown || [])
                .slice()
                .sort((a, b) => (a.key === b.key ? 0 : a.key === 'ENG' ? -1 : 1))
                .map((lr) => {
                  const dbTotal = lr.found + lr.missing;
                  return (
                    <span key={lr.key} className="inline-flex items-center gap-1">
                      <span className="text-[10px] font-semibold text-gray-500">{lr.label}</span>
                      <button
                        type="button"
                        onClick={() =>
                          applySummaryCapsuleFilter({
                            dept,
                            type: 'db',
                            title: `${dept} · ${lr.label} (DB Total)`,
                            lang: lr.key,
                          })
                        }
                        className="text-[11px] font-bold text-gray-900 hover:text-emerald-600 hover:underline transition-colors"
                        title={`DB Total (${lr.found} Found + ${lr.missing} Missing)`}
                      >
                        {dbTotal}
                      </button>
                    </span>
                  );
                })}
            </div>
          </div>
        ) : null}

        {d.excelDeptSplit?.foundByDept ? (
          <>
            <Divider />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-normal text-gray-500">Excel SOP Dept Split</span>
              <span className="text-[11px] font-bold text-gray-900 tabular-nums">{d.excelDeptSplit.total ?? 0}</span>
            </div>
            <SectionLabel>Found in Excel (DB Dept)</SectionLabel>
            <DeptStrip
              foundCounts={{
                ...(d.excelDeptSplit.foundByDept || {}),
                ...((d.excelDeptSplit.unknownFound ?? 0) > 0 ? { NA: d.excelDeptSplit.unknownFound ?? 0 } : {}),
              }}
              missingCounts={{
                ...(d.excelDeptSplit.missingByDept || {}),
                ...((d.excelDeptSplit.unknownMissing ?? 0) > 0 ? { NA: d.excelDeptSplit.unknownMissing ?? 0 } : {}),
              }}
              order={
                (d.excelDeptSplit.unknownFound ?? 0) > 0 || (d.excelDeptSplit.unknownMissing ?? 0) > 0
                  ? ([...DEPARTMENTS, 'NA'] as const)
                  : DEPARTMENTS
              }
              onSelectFound={(dbDept) =>
                applySummaryCapsuleFilter({
                  dept,
                  dbDept: dbDept === 'NA' ? 'All' : dbDept,
                  type: 'found',
                  title: `${dept} · Found (DB Dept: ${dbDept})`,
                })
              }
              onSelectMissing={(dbDept) =>
                applySummaryCapsuleFilter({
                  dept,
                  dbDept: dbDept === 'NA' ? 'All' : dbDept,
                  type: 'missing',
                  title: `${dept} · Missing (DB Dept: ${dbDept})`,
                })
              }
            />
          </>
        ) : null}

        <Divider />
        <RowB
          label="Trainers"
          green={d.trainersAssigned}
          red={d.trainersMissing}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · Trainer assigned`,
              trainer: 'assigned',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · Trainer missing`,
              trainer: 'missing',
            })
          }
        />
        <Divider />
        <SectionLabel>Repetitive SOPs</SectionLabel>
        <RowD
          label="Repeat 3+"
          value={d.repeat3PlusCount ?? 0}
          color="red"
          onClick={() => applyRepeatFilter(dept, '3+', d.repeat3PlusList ?? [])}
        />
        <RowD
          label="Repeat 2"
          value={d.repeat2Count ?? 0}
          color="amber"
          onClick={() => applyRepeatFilter(dept, '2', d.repeat2List ?? [])}
        />
        <RowD
          label="Once"
          value={d.repeat1Count ?? 0}
          color="green"
          onClick={() => applyRepeatFilter(dept, 'once', d.repeat1List ?? [])}
        />
        <RowB
          label="MCQ (100+ created)"
          green={d.mcqCreatedCount ?? 0}
          red={d.mcqNotCreatedCount ?? 0}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · MCQ Created (100+)`,
              status: 'mcq_created',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · MCQ Not Created (<100)`,
              status: 'mcq_not_created',
            })
          }
        />
        <div className="flex items-center justify-between pl-2">
          <span className="text-[10px] text-gray-400">↳ ENG</span>
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · MCQ ENG Created (100+)`, status: 'mcq_eng_created' })} className="text-[11px] font-bold text-emerald-600 hover:underline">{d.mcqEngCreatedCount ?? 0}</button>
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · MCQ ENG Not Created (<100)`, status: 'mcq_eng_not_created' })} className="text-[11px] font-bold text-red-600 hover:underline">{d.mcqEngNotCreatedCount ?? 0}</button>
          </span>
        </div>
        <div className="flex items-center justify-between pl-2">
          <span className="text-[10px] text-gray-400">↳ GUJ</span>
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · MCQ GUJ Created (100+)`, status: 'mcq_guj_created' })} className="text-[11px] font-bold text-emerald-600 hover:underline">{d.mcqGujCreatedCount ?? 0}</button>
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · MCQ GUJ Not Created (<100)`, status: 'mcq_guj_not_created' })} className="text-[11px] font-bold text-red-600 hover:underline">{d.mcqGujNotCreatedCount ?? 0}</button>
          </span>
        </div>
        <RowC
          label="MCQ Approved"
          green={d.mcqAllApprovedCount ?? 0}
          amber={d.mcqPartiallyApprovedCount ?? 0}
          red={d.mcqNotApprovedCount ?? 0}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · MCQ All Approved`,
              status: 'mcq_all_approved',
            })
          }
          onClickAmber={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · MCQ Partially Approved`,
              status: 'mcq_partially_approved',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · MCQ Not Approved`,
              status: 'mcq_not_approved',
            })
          }
        />
        <div className="flex items-center justify-between pl-2">
          <span className="text-[10px] text-gray-400">↳ ENG</span>
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · MCQ ENG All Approved`, status: 'mcq_eng_all_approved' })} className="text-[11px] font-bold text-emerald-600 hover:underline">{d.mcqEngAllApprovedCount ?? 0}</button>
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · MCQ ENG Partially Approved`, status: 'mcq_eng_partially_approved' })} className="text-[11px] font-bold text-amber-500 hover:underline">{d.mcqEngPartiallyApprovedCount ?? 0}</button>
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · MCQ ENG Not Approved`, status: 'mcq_eng_not_approved' })} className="text-[11px] font-bold text-red-600 hover:underline">{d.mcqEngNotApprovedCount ?? 0}</button>
          </span>
        </div>
        <div className="flex items-center justify-between pl-2">
          <span className="text-[10px] text-gray-400">↳ GUJ</span>
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · MCQ GUJ All Approved`, status: 'mcq_guj_all_approved' })} className="text-[11px] font-bold text-emerald-600 hover:underline">{d.mcqGujAllApprovedCount ?? 0}</button>
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · MCQ GUJ Partially Approved`, status: 'mcq_guj_partially_approved' })} className="text-[11px] font-bold text-amber-500 hover:underline">{d.mcqGujPartiallyApprovedCount ?? 0}</button>
            <button type="button" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · MCQ GUJ Not Approved`, status: 'mcq_guj_not_approved' })} className="text-[11px] font-bold text-red-600 hover:underline">{d.mcqGujNotApprovedCount ?? 0}</button>
          </span>
        </div>
        <RowB
          label="SOP Expiry Status"
          green={d.okayCount}
          red={d.expiredCount}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · Valid SOPs`,
              status: 'okay',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · Expired SOPs`,
              status: 'expired',
            })
          }
        />
        {(d.dueSoon60Count ?? 0) > 0 && (
          <>
            <RowD
              label="Due in next 60 days"
              value={d.dueSoon60Count ?? 0}
              color="amber"
              onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Due in Next 60 Days`, status: 'due_soon_60' })}
            />
            <RowD label="└ Reviewed" value={d.dueSoon60McqReviewed ?? 0} color="green" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Due in 60 Days · Reviewed`, status: 'due_soon_60_mcq_reviewed' })} />
            <RowD label="└ Partially Reviewed" value={d.dueSoon60McqPartial ?? 0} color="amber" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Due in 60 Days · Partially Reviewed`, status: 'due_soon_60_mcq_partial' })} />
            <RowD label="└ Not Reviewed" value={d.dueSoon60McqNotReviewed ?? 0} color="red" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Due in 60 Days · Not Reviewed`, status: 'due_soon_60_mcq_not_reviewed' })} />
          </>
        )}
        {/* (no extra Assigned/Missing rows; shown inline above) */}
        <Divider />
        <RowA
          label="Employees"
          value={d.employeeCount}
          onClick={() => openEmployeeListPopup(dept, 'all', `${dept} — All Employees`)}
        />
        <RowD
          label="100% Trained"
          value={d.fullyTrained}
          color="green"
          onClick={() => openEmployeeListPopup(dept, 'full', `${dept} — 100% Trained`)}
        />
        <RowD
          label="Incomplete"
          value={d.incomplete}
          color="amber"
          onClick={() => openEmployeeListPopup(dept, 'incomplete', `${dept} — Incomplete`)}
        />
        <Divider />
        <SectionLabel>SOPs / Month</SectionLabel>
        <MonthStrip
          monthCounts={d.monthCounts}
          onSelectMonth={(m) => {
            setViewMode('sop');
            setGroupBy('department');
            setActiveDept(dept);
            setActiveMonth(m);
            setSearch('');
            clearCapsuleFilter();
          }}
        />
      </CardShell>
    );
  };

  function ViewToggle() {
    return null;
  }

  function ProgressPill({ pct }: { pct: number }) {
    const cls = pct >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : pct >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-red-50 text-red-700 border-red-200';
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{pct}%</span>;
  }

  function CapsuleChip({
    label,
    value,
    tone,
  }: {
    label: string;
    value: React.ReactNode;
    tone: 'green' | 'red' | 'amber' | 'slate' | 'violet';
  }) {
    const cls =
      tone === 'green'
        ? 'bg-emerald-600 text-white'
        : tone === 'red'
          ? 'bg-red-600 text-white'
          : tone === 'amber'
            ? 'bg-amber-500 text-white'
            : tone === 'violet'
              ? 'bg-violet-600 text-white'
              : 'bg-slate-600 text-white';
    return (
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black shadow-sm ${cls}`}>
        <span className="opacity-90">{label}</span>
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-black">{value}</span>
      </span>
    );
  }

  function RowCapsuleShell({
    accent,
    bgTint,
    left,
    chips,
    bottom,
    onClick,
  }: {
    accent: string;
    bgTint: 'pink' | 'purple' | 'amber' | 'slate' | 'mint' | 'red';
    left: React.ReactNode;
    chips: React.ReactNode;
    bottom?: React.ReactNode;
    onClick?: () => void;
  }) {
    const tint =
      bgTint === 'red'
        ? 'bg-gradient-to-r from-red-50 to-rose-50'
        : bgTint === 'pink'
          ? 'bg-gradient-to-r from-pink-50 to-rose-50'
          : bgTint === 'purple'
            ? 'bg-gradient-to-r from-violet-50 to-fuchsia-50'
            : bgTint === 'mint'
              ? 'bg-gradient-to-r from-emerald-50 to-teal-50'
              : bgTint === 'amber'
                ? 'bg-gradient-to-r from-amber-50 to-orange-50'
                : 'bg-gradient-to-r from-slate-50 to-gray-50';

    return (
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
        className={`w-full text-left rounded-2xl border shadow-sm hover:shadow-md transition overflow-hidden ${tint} ${onClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-300' : ''}`}
        style={{ borderColor: `${accent}55` }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">{left}</div>
          <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2">{chips}</div>
        </div>
        {bottom ? <div className="px-4 pb-3">{bottom}</div> : null}
      </div>
    );
  }

  function SopCard({
    dept,
    accent,
    sop,
    sr,
  }: {
    dept: string;
    accent: string;
    sr?: number;
    sop: {
      sopCode: string;
      title?: string;
      isDualLanguage?: boolean;
      gujaratiName?: string;
      month: string;
      trainer?: string;
      completed: number;
      pending: number;
      totalApplicable: number;
      completionPct: number;
      pendingEmployees: string[];
      completedEmployees?: string[];
      targetDate?: string | null;
      expired?: boolean;
      mcqTotal?: number;
      mcqApproved?: number;
      mcqEngTotal?: number;
      mcqEngApproved?: number;
      mcqGujTotal?: number;
      mcqGujApproved?: number;
    };
  }) {
    const tint: 'pink' | 'purple' | 'amber' | 'slate' | 'mint' | 'red' = sop.expired
      ? 'red'
      : dept === 'QA' ? 'purple'
        : dept === 'QC' ? 'mint'
          : dept === 'Microbiology' ? 'mint'
            : dept === 'Production' ? 'amber'
              : dept === 'Store' ? 'pink'
                : dept === 'Engineering' ? 'slate'
                  : 'pink';

    const isActiveMonth = activeMonth !== 'All' && sop.month && sop.month === activeMonth;

    return (
      <RowCapsuleShell
        accent={accent}
        bgTint={tint}
        onClick={() => {
          if (!data) return;
          const deptEmployees = data.perDept?.[dept as Dept]?.employees || [];
          const byName = new Map<string, { designation?: string }>();
          for (const e of deptEmployees) byName.set(e.name, { designation: e.designation });
          const found = (sop.completedEmployees || []).map((n) => ({ name: n, designation: byName.get(n)?.designation, department: dept }));
          const missing = (sop.pendingEmployees || []).map((n) => ({ name: n, designation: byName.get(n)?.designation, department: dept }));
          const inExcelDepts = DEPARTMENTS.filter((d) =>
            (data.sopCodesByDept?.[d] || []).some((c: string) => c.toUpperCase() === sop.sopCode.toUpperCase())
          );
          setSopDetailSearch('');
          setSopDetailSortField('name');
          setSopDetailSortDir('asc');
          setDetailModal({
            kind: 'sop',
            title: `${sop.sopCode}`,
            sopTitle: sop.title || '',
            subtitle: `${dept}${sop.month ? ` · ${sop.month}` : ''}`,
            sopCode: sop.sopCode,
            department: dept,
            monthLabel: sop.month,
            trainer: sop.trainer || '',
            targetDate: sop.targetDate,
            expired: sop.expired,
            completionPct: sop.completionPct,
            totalApplicable: sop.totalApplicable,
            inExcelDepts,
            mcqTotal: sop.mcqTotal,
            mcqApproved: sop.mcqApproved,
            mcqEngTotal: sop.mcqEngTotal,
            mcqEngApproved: sop.mcqEngApproved,
            mcqGujTotal: sop.mcqGujTotal,
            mcqGujApproved: sop.mcqGujApproved,
            isDualLanguage: sop.isDualLanguage,
            foundEmployees: found,
            missingEmployees: missing,
          });
        }}
        left={
          <div className="flex items-start gap-3 min-w-0">
            {sr != null && (
              <span className="flex-shrink-0 mt-0.5 text-[10px] font-bold text-gray-400 tabular-nums w-5 text-right leading-[2.2]">
                {sr}
              </span>
            )}
            <div className="flex-shrink-0 mt-0.5">
              <div className="inline-flex flex-col">
                <span className="inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-white/70 border border-white/70 shadow-sm max-w-[280px]">
                  <span className="font-mono text-[12px] font-black text-gray-900 flex-shrink-0">{sop.sopCode}</span>
                  {sop.title && (
                    <>
                      <span className="text-gray-300 text-[10px] flex-shrink-0">|</span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-sans text-[10px] font-semibold text-gray-600 truncate max-w-[200px]" title={sop.title}>{sop.title}</span>
                        {sop.isDualLanguage && sop.gujaratiName && (
                          <span className="font-sans text-[10px] font-medium text-indigo-700 truncate max-w-[200px]" title={sop.gujaratiName}>{sop.gujaratiName}</span>
                        )}
                      </div>
                    </>
                  )}
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-[11px] font-black text-gray-900">{dept}</span>
                {!!sop.month && (
                  <span
                    className={`text-[10px] font-black rounded-full px-2 py-0.5 border ${
                      isActiveMonth ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white/60 text-gray-600 border-white/60'
                    }`}
                    title={isActiveMonth ? 'Exam scheduled in selected month' : 'Scheduled month'}
                  >
                    {sop.month}
                  </span>
                )}
                {sop.targetDate ? (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2.5 py-0.5 border ${
                      sop.expired
                        ? 'bg-red-100 text-red-700 border-red-300'
                        : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                    }`}
                    title={sop.expired ? 'This SOP has expired' : 'This SOP is valid'}
                  >
                    <span className="text-[9px]">{sop.expired ? '⚠' : '✓'}</span>
                    Expiry:
                    <span className="font-black">{new Date(sop.targetDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2.5 py-0.5 border bg-gray-100 text-gray-500 border-gray-300"
                    title="No expiry/review date set for this SOP"
                  >
                    <span className="text-[9px]">—</span>
                    No date
                  </span>
                )}
                <ProgressPill pct={sop.completionPct} />
                {(() => {
                  if (!data) return null;
                  const inExcelDepts = DEPARTMENTS.filter((d) =>
                    (data.sopCodesByDept?.[d] || []).some((c: string) => c.toUpperCase() === sop.sopCode.toUpperCase())
                  );
                  if (inExcelDepts.length === 0) return null;
                  return (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMissingModal({
                          title: `${sop.sopCode} · Appears in ${inExcelDepts.length} Excel file(s)`,
                          kind: 'sop',
                          rows: inExcelDepts.map(d => ({ sopCode: sop.sopCode, department: d, title: sop.title || '' }))
                        });
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition shadow-sm ml-1"
                      title={`Click to see which departments have this SOP in their Excel`}
                    >
                      in excel: <span className="font-black bg-indigo-200 text-indigo-800 rounded-full px-1.5">{inExcelDepts.length}</span>
                    </button>
                  );
                })()}
              </div>
              <div className="mt-0.5 flex items-center gap-3 flex-wrap">
                <span className="text-[10px] text-gray-500">
                  Applicable: <span className="font-black text-gray-800">{sop.totalApplicable}</span>
                </span>
                {sop.trainer ? (
                  <span className="text-[10px] font-semibold text-emerald-700">
                    {sop.trainer}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-red-500">
                    No Trainer
                  </span>
                )}
              </div>
            </div>
          </div>
        }
        chips={
          <>
            {sop.mcqTotal !== undefined && (
              <div className="flex flex-col gap-1 items-end">
                <a
                  href={`/mcq-bank?search=${encodeURIComponent(sop.sopCode)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition hover:opacity-80 min-w-[130px] ${
                    (sop.isDualLanguage ? (sop.mcqEngTotal ?? 0) : sop.mcqTotal) > 0
                      ? (sop.isDualLanguage ? (sop.mcqEngApproved ?? 0) : (sop.mcqApproved ?? 0)) === (sop.isDualLanguage ? (sop.mcqEngTotal ?? 0) : sop.mcqTotal)
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : (sop.isDualLanguage ? (sop.mcqEngApproved ?? 0) : (sop.mcqApproved ?? 0)) > 0
                          ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                  title="Click to view MCQ Bank details"
                >
                  <span>{sop.isDualLanguage ? 'ENG MCQs' : 'MCQs'}: {sop.isDualLanguage ? (sop.mcqEngTotal ?? 0) : sop.mcqTotal}</span>
                  {(sop.isDualLanguage ? (sop.mcqEngTotal ?? 0) : sop.mcqTotal) > 0 && (
                    <span className="opacity-75 px-1 border-l border-current">
                      {sop.isDualLanguage ? (sop.mcqEngApproved ?? 0) : (sop.mcqApproved ?? 0)}/{(sop.isDualLanguage ? (sop.mcqEngTotal ?? 0) : sop.mcqTotal)} Appr.
                    </span>
                  )}
                </a>
                {sop.isDualLanguage && (
                  <a
                    href={`/mcq-bank?search=${encodeURIComponent(sop.sopCode)}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition hover:opacity-80 min-w-[130px] ${
                      (sop.mcqGujTotal ?? 0) > 0
                        ? (sop.mcqGujApproved ?? 0) === (sop.mcqGujTotal ?? 0)
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : (sop.mcqGujApproved ?? 0) > 0
                            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                            : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                    title="Click to view MCQ Bank details"
                  >
                    <span>GUJ MCQs: {sop.mcqGujTotal ?? 0}</span>
                    {(sop.mcqGujTotal ?? 0) > 0 && (
                      <span className="opacity-75 px-1 border-l border-current">
                        {sop.mcqGujApproved ?? 0}/{sop.mcqGujTotal ?? 0} Appr.
                      </span>
                    )}
                  </a>
                )}
              </div>
            )}
            <CapsuleChip label="√ Due" value={sop.completed} tone="green" />
            <CapsuleChip label="X/NA" value={sop.pending} tone="slate" />
          </>
        }
        bottom={
          sop.pendingEmployees.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {sop.pendingEmployees.slice(0, 12).map((n) => {
                const deptEmployees = data?.perDept?.[dept as Dept]?.employees || [];
                const byName = new Map<string, { designation?: string }>();
                for (const e of deptEmployees) byName.set(e.name, { designation: e.designation });
                const sopCodes = data?.sopCodesByDept?.[dept as Dept] || [];
                const empRow = data?.perDept?.[dept as Dept]?.employees?.find((e: any) => e.name === n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const monthMap = (data?.sopMonthMapByDept as any)?.[dept] || {};
                      const employeeSops: Array<{ sopCode: string; month: string; symbol: '√' | 'X' | 'NA' }> = [];
                      if (empRow) {
                        for (const [sopCode, v] of Object.entries(empRow.training || {})) {
                          employeeSops.push({ sopCode, month: monthMap[sopCode] || '', symbol: v ? '√' : 'X' });
                        }
                        employeeSops.sort((a, b) => a.sopCode.localeCompare(b.sopCode));
                      }
                      setDetailModal({
                        kind: 'employee',
                        title: n,
                        subtitle: `${dept}${empRow?.designation ? ` · ${empRow.designation}` : ''}`,
                        employeeName: n,
                        employeeSops,
                      });
                    }}
                    className="text-[10px] bg-white/70 text-gray-800 border border-white/70 px-2 py-0.5 rounded-lg hover:bg-purple-50 hover:border-purple-200 hover:text-purple-800 transition cursor-pointer"
                  >
                    {n}
                  </button>
                );
              })}
              {sop.pendingEmployees.length > 12 ? (
                <span className="text-[10px] font-semibold text-gray-500 px-1">
                  +{sop.pendingEmployees.length - 12} more
                </span>
              ) : null}
            </div>
          ) : null
        }
      />
    );
  }

  function DetailModal() {
    if (!detailModal) return null;

    const close = () => {
      setDetailModal(null);
      setMonthDetail({ loading: false, error: '', sopRows: [] });
      setEmpModalSearch('');
      setEmpModalFilter('all');
      setEmpModalSort({ field: 'code', dir: 'asc' });
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
        <div
          className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b px-5 py-4 bg-gray-50">
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 truncate">{detailModal.title}</h2>
              {detailModal.subtitle && <div className="mt-0.5 text-xs text-gray-500 truncate">{detailModal.subtitle}</div>}
            </div>
            <button onClick={close} className="rounded-lg p-1.5 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[75vh] overflow-auto p-5 space-y-6">
            {detailModal.kind === 'sop' && (() => {
              const sortFn = (a: any, b: any) => {
                const va = (a[sopDetailSortField] || '').toLowerCase();
                const vb = (b[sopDetailSortField] || '').toLowerCase();
                return sopDetailSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
              };
              const toggle = (field: 'name' | 'designation' | 'department') => {
                if (sopDetailSortField === field) setSopDetailSortDir((d) => d === 'asc' ? 'desc' : 'asc');
                else { setSopDetailSortField(field); setSopDetailSortDir('asc'); }
              };
              const SortIcon = ({ field }: { field: string }) => (
                <span className="ml-0.5 opacity-50 text-[9px]">
                  {sopDetailSortField === field ? (sopDetailSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                </span>
              );

              const q = sopDetailSearch.trim().toLowerCase();
              const filterRows = (rows: Array<{ name: string; designation?: string; department?: string }>) =>
                rows.filter((r) => !q || r.name.toLowerCase().includes(q) || (r.designation || '').toLowerCase().includes(q));

              const foundRows = filterRows(detailModal.foundEmployees || []).sort(sortFn);
              const missingRows = filterRows(detailModal.missingEmployees || []).sort(sortFn);

              const dm = detailModal;

              return (
                <div className="space-y-5">
                  {/* ── SOP info bar ── */}
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-black text-gray-900">{dm.sopCode}</span>
                      {dm.sopTitle && (
                        <span className="text-sm font-semibold text-gray-700">{dm.sopTitle}</span>
                      )}
                      <span className="text-xs font-semibold text-gray-500">{dm.department}</span>
                      {dm.monthLabel && (
                        <span className="rounded-full bg-white border border-gray-300 px-2 py-0.5 text-[10px] font-bold text-gray-700">
                          {dm.monthLabel}
                        </span>
                      )}
                      {dm.targetDate ? (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2.5 py-0.5 border ${
                          dm.expired ? 'bg-red-100 text-red-700 border-red-300' : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                        }`}>
                          <span className="text-[9px]">{dm.expired ? '⚠' : '✓'}</span>
                          Expiry: <span className="font-black">{new Date(dm.targetDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2.5 py-0.5 border bg-gray-100 text-gray-500 border-gray-300">
                          <span className="text-[9px]">—</span> No date
                        </span>
                      )}
                      {dm.completionPct !== undefined && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          dm.completionPct >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : dm.completionPct >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                        }`}>{dm.completionPct}%</span>
                      )}
                      {dm.inExcelDepts && dm.inExcelDepts.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 border bg-indigo-50 text-indigo-700 border-indigo-200">
                          in excel: <span className="font-black bg-indigo-200 text-indigo-800 rounded-full px-1.5">{dm.inExcelDepts.length}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="text-[11px] text-gray-500">
                        Applicable: <span className="font-black text-gray-800">{dm.totalApplicable ?? '—'}</span>
                      </span>
                      {dm.trainer ? (
                        <span className="text-[11px] font-semibold text-emerald-700">{dm.trainer}</span>
                      ) : (
                        <span className="text-[11px] font-semibold text-red-500">No Trainer</span>
                      )}
                      {/* MCQ chips */}
                      {dm.mcqTotal !== undefined && (
                        <a
                          href={`/mcq-bank?search=${encodeURIComponent(dm.sopCode || '')}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border hover:opacity-80 ${
                            (dm.isDualLanguage ? (dm.mcqEngTotal ?? 0) : dm.mcqTotal) > 0
                              ? (dm.isDualLanguage ? (dm.mcqEngApproved ?? 0) : (dm.mcqApproved ?? 0)) === (dm.isDualLanguage ? (dm.mcqEngTotal ?? 0) : dm.mcqTotal)
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : (dm.isDualLanguage ? (dm.mcqEngApproved ?? 0) : (dm.mcqApproved ?? 0)) > 0
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-gray-50 text-gray-600 border-gray-200'
                          }`}
                        >
                          {dm.isDualLanguage ? 'ENG MCQs' : 'MCQs'}: {dm.isDualLanguage ? (dm.mcqEngTotal ?? 0) : dm.mcqTotal}
                          {(dm.isDualLanguage ? (dm.mcqEngTotal ?? 0) : dm.mcqTotal ?? 0) > 0 && (
                            <span className="opacity-75 px-1 border-l border-current">
                              {dm.isDualLanguage ? (dm.mcqEngApproved ?? 0) : (dm.mcqApproved ?? 0)}/{dm.isDualLanguage ? (dm.mcqEngTotal ?? 0) : dm.mcqTotal} Appr.
                            </span>
                          )}
                        </a>
                      )}
                      {dm.isDualLanguage && dm.mcqGujTotal !== undefined && (
                        <a
                          href={`/mcq-bank?search=${encodeURIComponent(dm.sopCode || '')}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border hover:opacity-80 ${
                            (dm.mcqGujTotal ?? 0) > 0
                              ? (dm.mcqGujApproved ?? 0) === (dm.mcqGujTotal ?? 0) ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : (dm.mcqGujApproved ?? 0) > 0 ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-gray-50 text-gray-600 border-gray-200'
                          }`}
                        >
                          GUJ MCQs: {dm.mcqGujTotal ?? 0}
                          {(dm.mcqGujTotal ?? 0) > 0 && (
                            <span className="opacity-75 px-1 border-l border-current">
                              {dm.mcqGujApproved ?? 0}/{dm.mcqGujTotal ?? 0} Appr.
                            </span>
                          )}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* ── search + counts ── */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-xs">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        value={sopDetailSearch}
                        onChange={(e) => setSopDetailSearch(e.target.value)}
                        placeholder="Search employee / designation…"
                        className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-purple-300 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span><span className="font-black text-emerald-700">{foundRows.length}</span> due</span>
                      <span><span className="font-black text-slate-700">{missingRows.length}</span> not scheduled</span>
                    </div>
                  </div>

                  {/* ── two tables ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Found / Due */}
                    <div className="rounded-xl border border-emerald-100 overflow-hidden">
                      <div className="px-4 py-2.5 bg-emerald-50 flex items-center justify-between">
                        <div className="text-sm font-bold text-emerald-800">√ Exam Due ({dm.monthLabel || '—'})</div>
                        <div className="text-xs font-semibold text-emerald-700">{foundRows.length} / {(detailModal.foundEmployees || []).length}</div>
                      </div>
                      <div className="overflow-auto max-h-[50vh]">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-white sticky top-0 z-10">
                            <tr>
                              <th className="border-b px-3 py-2 font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap" onClick={() => toggle('name')}>
                                Employee <SortIcon field="name" />
                              </th>
                              <th className="border-b px-3 py-2 font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap" onClick={() => toggle('designation')}>
                                Designation <SortIcon field="designation" />
                              </th>
                              <th className="border-b px-3 py-2 font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap" onClick={() => toggle('department')}>
                                Dept <SortIcon field="department" />
                              </th>
                              <th className="border-b px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">Month</th>
                            </tr>
                          </thead>
                          <tbody>
                            {foundRows.map((r, i) => (
                              <tr key={`f-${r.name}-${i}`} className="border-b border-gray-50 hover:bg-emerald-50/30">
                                <td className="px-3 py-2 font-semibold text-gray-900">{r.name}</td>
                                <td className="px-3 py-2 text-gray-600">{r.designation || '—'}</td>
                                <td className="px-3 py-2 text-gray-600">{r.department || '—'}</td>
                                <td className="px-3 py-2 font-bold text-emerald-700">{dm.monthLabel || '—'}</td>
                              </tr>
                            ))}
                            {foundRows.length === 0 && (
                              <tr><td colSpan={4} className="px-3 py-10 text-center text-gray-400">No √ (due) employees.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Missing / X/NA */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-between">
                        <div className="text-sm font-bold text-slate-800">X / NA (Not Scheduled)</div>
                        <div className="text-xs font-semibold text-slate-600">{missingRows.length} / {(detailModal.missingEmployees || []).length}</div>
                      </div>
                      <div className="overflow-auto max-h-[50vh]">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-white sticky top-0 z-10">
                            <tr>
                              <th className="border-b px-3 py-2 font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap" onClick={() => toggle('name')}>
                                Employee <SortIcon field="name" />
                              </th>
                              <th className="border-b px-3 py-2 font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap" onClick={() => toggle('designation')}>
                                Designation <SortIcon field="designation" />
                              </th>
                              <th className="border-b px-3 py-2 font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap" onClick={() => toggle('department')}>
                                Dept <SortIcon field="department" />
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {missingRows.map((r, i) => (
                              <tr key={`m-${r.name}-${i}`} className="border-b border-gray-50 hover:bg-slate-50/60">
                                <td className="px-3 py-2 font-semibold text-gray-900">{r.name}</td>
                                <td className="px-3 py-2 text-gray-600">{r.designation || '—'}</td>
                                <td className="px-3 py-2 text-gray-600">{r.department || '—'}</td>
                              </tr>
                            ))}
                            {missingRows.length === 0 && (
                              <tr><td colSpan={3} className="px-3 py-10 text-center text-gray-400">No X/NA employees.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {detailModal.kind === 'employee' && (() => {
              const allSops = detailModal.employeeSops || [];
              const totalPending = allSops.filter((r) => r.symbol !== '√').length;
              const totalCompleted = allSops.filter((r) => r.symbol === '√').length;

              // Search filter
              const q = empModalSearch.trim().toLowerCase();
              let filtered = allSops.filter((r) => {
                if (empModalFilter === 'pending' && r.symbol === '√') return false;
                if (empModalFilter === 'completed' && r.symbol !== '√') return false;
                if (q) {
                  const sopStatus = data?.sopStatusByCode?.[r.sopCode] || data?.sopStatusByCode?.[stripVersion(r.sopCode)];
                  const title = (sopStatus?.title || '').toLowerCase();
                  return r.sopCode.toLowerCase().includes(q) || title.includes(q) || (r.month || '').toLowerCase().includes(q);
                }
                return true;
              });

              // Sort
              filtered = [...filtered].sort((a, b) => {
                let va = '', vb = '';
                if (empModalSort.field === 'code') { va = a.sopCode; vb = b.sopCode; }
                else if (empModalSort.field === 'month') { va = a.month || ''; vb = b.month || ''; }
                else if (empModalSort.field === 'name') {
                  const sa = data?.sopStatusByCode?.[a.sopCode] || data?.sopStatusByCode?.[stripVersion(a.sopCode)];
                  const sb = data?.sopStatusByCode?.[b.sopCode] || data?.sopStatusByCode?.[stripVersion(b.sopCode)];
                  va = sa?.title || ''; vb = sb?.title || '';
                }
                const cmp = va.localeCompare(vb);
                return empModalSort.dir === 'asc' ? cmp : -cmp;
              });

              // When no status filter, keep pending-first grouping
              const displayRows = empModalFilter === 'all' && !q
                ? [...filtered.filter((r) => r.symbol !== '√'), ...filtered.filter((r) => r.symbol === '√')]
                : filtered;

              const toggleSort = (field: 'code' | 'name' | 'month') => {
                setEmpModalSort((s) =>
                  s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }
                );
              };

              const toggleFilter = (f: 'pending' | 'completed') => {
                setEmpModalFilter((cur) => (cur === f ? 'all' : f));
              };

              const SortArrow = ({ field }: { field: 'code' | 'name' | 'month' }) => (
                <span className="ml-0.5 text-[9px] opacity-50">
                  {empModalSort.field === field ? (empModalSort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                </span>
              );

              // Section headers only when showing all without search
              const showSections = empModalFilter === 'all' && !q;

              return (
                <div className="space-y-3">
                  {/* Summary + filter pills row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleFilter('pending')}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition select-none ${
                        empModalFilter === 'pending'
                          ? 'bg-red-500 border-red-500 text-white shadow-sm'
                          : 'bg-gray-100 border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${empModalFilter === 'pending' ? 'bg-white' : 'bg-gray-400'}`} />
                      Pending: {totalPending}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFilter('completed')}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition select-none ${
                        empModalFilter === 'completed'
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                          : 'bg-gray-100 border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${empModalFilter === 'completed' ? 'bg-white' : 'bg-gray-400'}`} />
                      Completed: {totalCompleted}
                    </button>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${empModalFilter === 'all' && !q ? 'bg-gray-100 border-gray-200 text-gray-600' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                      Total: {allSops.length}
                    </span>
                    {allSops.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 border border-purple-200 px-3 py-1 text-xs font-bold text-purple-700">
                        {Math.round((totalCompleted / allSops.length) * 100)}% Complete
                      </span>
                    )}
                    {/* Search */}
                    <div className="ml-auto relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                      <input
                        value={empModalSearch}
                        onChange={(e) => setEmpModalSearch(e.target.value)}
                        placeholder="Search SOP code or name…"
                        className="rounded-lg border border-gray-200 py-1.5 pl-7 pr-3 text-xs focus:border-purple-300 focus:outline-none w-52"
                      />
                      {empModalSearch && (
                        <button type="button" onClick={() => setEmpModalSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Active filter hint */}
                  {(empModalFilter !== 'all' || q) && (
                    <div className="flex items-center gap-2 text-[11px] text-gray-500">
                      Showing {displayRows.length} of {allSops.length} SOPs
                      {empModalFilter !== 'all' && (
                        <button type="button" onClick={() => setEmpModalFilter('all')} className="ml-1 text-purple-600 hover:underline font-medium">
                          Clear filter
                        </button>
                      )}
                    </div>
                  )}

                  {/* SOP table */}
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-auto max-h-[52vh]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th className="border-b px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Status</th>
                            <th
                              className="border-b px-3 py-2 font-semibold text-gray-500 whitespace-nowrap cursor-pointer select-none hover:text-gray-800"
                              onClick={() => toggleSort('code')}
                            >
                              SOP Code <SortArrow field="code" />
                            </th>
                            <th
                              className="border-b px-3 py-2 font-semibold text-gray-500 whitespace-nowrap cursor-pointer select-none hover:text-gray-800"
                              onClick={() => toggleSort('name')}
                            >
                              SOP Name <SortArrow field="name" />
                            </th>
                            <th
                              className="border-b px-3 py-2 font-semibold text-gray-500 whitespace-nowrap cursor-pointer select-none hover:text-gray-800"
                              onClick={() => toggleSort('month')}
                            >
                              Month <SortArrow field="month" />
                            </th>
                            <th className="border-b px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Expiry</th>
                            <th className="border-b px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">MCQs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayRows.map((r, idx) => {
                            const isPending = r.symbol !== '√';
                            const sopStatus = data?.sopStatusByCode?.[r.sopCode] || data?.sopStatusByCode?.[stripVersion(r.sopCode)];
                            const sopTitle = sopStatus?.title || '—';
                            const isExpired = sopStatus?.expired;
                            const targetDate = sopStatus?.targetDate;
                            const totalMcq = sopStatus?.totalQuestions ?? 0;
                            const approvedMcq = sopStatus?.approvedCount ?? 0;

                            const pendingCount = displayRows.filter((x) => x.symbol !== '√').length;
                            const showPendingHeader = showSections && idx === 0 && pendingCount > 0;
                            const showCompletedHeader = showSections && idx === pendingCount && displayRows.filter((x) => x.symbol === '√').length > 0;

                            return (
                              <Fragment key={`es-${r.sopCode}`}>
                                {showPendingHeader && (
                                  <tr>
                                    <td colSpan={6} className="px-3 py-1.5 bg-red-50 border-b border-red-100">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-red-500">Pending ({pendingCount})</span>
                                    </td>
                                  </tr>
                                )}
                                {showCompletedHeader && (
                                  <tr>
                                    <td colSpan={6} className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Completed ({displayRows.filter((x) => x.symbol === '√').length})</span>
                                    </td>
                                  </tr>
                                )}
                                <tr className={`border-b border-gray-50 transition ${isPending ? 'bg-red-50/25 hover:bg-red-50/50' : 'hover:bg-emerald-50/20'}`}>
                                  <td className="px-3 py-2">
                                    {isPending ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-200 px-2 py-0.5 text-[10px] font-black text-red-700">
                                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                        Pending
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                        Completed
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-mono font-bold text-gray-900 whitespace-nowrap">{r.sopCode}</td>
                                  <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={sopTitle}>{sopTitle}</td>
                                  <td className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">{r.month || '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    {isExpired ? (
                                      <span className="text-red-600 font-bold">Expired{targetDate ? ` (${targetDate.slice(0, 10)})` : ''}</span>
                                    ) : targetDate ? (
                                      <span className="text-gray-600">{targetDate.slice(0, 10)}</span>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    {totalMcq > 0 ? (
                                      <span className={`font-semibold ${approvedMcq === totalMcq ? 'text-emerald-700' : approvedMcq > 0 ? 'text-amber-700' : 'text-red-700'}`}>
                                        {approvedMcq}/{totalMcq}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>
                                </tr>
                              </Fragment>
                            );
                          })}
                          {displayRows.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-3 py-10 text-center text-gray-400">
                                {allSops.length === 0 ? 'No SOP schedule found.' : 'No results match your search / filter.'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {detailModal.kind === 'monthDept' && (
              <div className="space-y-4">
                {monthDetail.loading ? (
                  <div className="flex items-center justify-center py-16 text-gray-400">
                    <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading details…
                  </div>
                ) : monthDetail.error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{monthDetail.error}</div>
                ) : (
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between">
                      <div className="text-sm font-bold text-gray-800">SOP Summary</div>
                      <div className="text-xs font-semibold text-gray-600">{monthDetail.sopRows.length} SOPs</div>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white sticky top-0">
                        <tr>
                          <th className="border-b px-3 py-2 font-semibold text-gray-600">SOP Code</th>
                          <th className="border-b px-3 py-2 font-semibold text-gray-600">Found</th>
                          <th className="border-b px-3 py-2 font-semibold text-gray-600">Missing</th>
                          <th className="border-b px-3 py-2 font-semibold text-gray-600">Applicable</th>
                          <th className="border-b px-3 py-2 font-semibold text-gray-600">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthDetail.sopRows.map((r) => (
                          <tr key={r.sopCode} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono font-bold text-gray-900">{r.sopCode}</td>
                            <td className="px-3 py-2 font-bold text-emerald-700">{r.trained}</td>
                            <td className="px-3 py-2 font-bold text-red-700">{r.pending}</td>
                            <td className="px-3 py-2 text-gray-700">{r.totalApplicable}</td>
                            <td className="px-3 py-2 text-gray-700">{r.completionPct}%</td>
                          </tr>
                        ))}
                        {monthDetail.sopRows.length === 0 && (
                          <tr><td colSpan={5} className="px-3 py-10 text-center text-gray-400">No SOP records.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {detailModal.kind === 'employeeList' && (() => {
              const allRows = detailModal.employeeListRows || [];
              const activeFilter = detailModal.employeeListFilter || 'all';
              const visibleRows = activeFilter === 'full' ? allRows.filter((r) => r.fullyTrained)
                : activeFilter === 'incomplete' ? allRows.filter((r) => !r.fullyTrained)
                : allRows;
              return (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between">
                    <div className="text-sm font-bold text-gray-800">Employees ({visibleRows.length})</div>
                    <div className="flex items-center gap-2">
                      {(['all', 'full', 'incomplete'] as EmployeeListFilter[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setDetailModal({ ...detailModal, employeeListFilter: f })}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                            activeFilter === f
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {f === 'all' ? 'All' : f === 'full' ? '100% Trained' : 'Incomplete'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white sticky top-0">
                      <tr>
                        <th className="border-b px-3 py-2 font-semibold text-gray-600">Name</th>
                        <th className="border-b px-3 py-2 font-semibold text-gray-600">Designation</th>
                        <th className="border-b px-3 py-2 font-semibold text-gray-600">Department</th>
                        <th className="border-b px-3 py-2 font-semibold text-gray-600">Trained / Total SOPs</th>
                        <th className="border-b px-3 py-2 font-semibold text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((r, i) => (
                        <tr
                          key={`${r.name}-${i}`}
                          className="border-b border-gray-50 hover:bg-purple-50/30 cursor-pointer"
                          onClick={() => {
                            const deptData = data?.perDept?.[r.department as Dept];
                            const monthMap = (data?.sopMonthMapByDept as any)?.[r.department] || {};
                            const empRow = deptData?.employees?.find((e: any) => e.name === r.name);
                            const employeeSops: Array<{ sopCode: string; month: string; symbol: '√' | 'X' | 'NA' }> = [];
                            if (empRow) {
                              for (const [sopCode, v] of Object.entries(empRow.training || {})) {
                                employeeSops.push({ sopCode, month: monthMap[sopCode] || '', symbol: (v as boolean) ? '√' : 'X' });
                              }
                              employeeSops.sort((a, b) => a.sopCode.localeCompare(b.sopCode));
                            }
                            setDetailModal({
                              kind: 'employee',
                              title: r.name,
                              subtitle: `${r.department}${r.designation ? ` · ${r.designation}` : ''}`,
                              employeeName: r.name,
                              employeeSops,
                            });
                          }}
                        >
                          <td className="px-3 py-2 font-semibold text-gray-900">{r.name}</td>
                          <td className="px-3 py-2 text-gray-700">{r.designation || '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{r.department}</td>
                          <td className="px-3 py-2 text-gray-700">{r.trainedSops} / {r.totalSops}</td>
                          <td className="px-3 py-2">
                            {r.fullyTrained ? (
                              <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-black">100%</span>
                            ) : (
                              <span className="rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 text-[10px] font-black">
                                {r.totalSops > 0 ? Math.round((r.trainedSops / r.totalSops) * 100) : 0}%
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {visibleRows.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-10 text-center text-gray-400">No employees found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  }

  function CapsulesBody() {
    if (!data) return null;

    if (viewMode === 'sop') {
      if (sopWiseGroups.length === 0) {
        return (
          <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500">
            No SOP-wise data matches the current filters.
          </div>
        );
      }

      // groupBy: department (default) or sop
      if (groupBy === 'sop') {
        // Flatten across depts, group by sop code
        const map = new Map<string, { 
          sopCode: string; 
          title: string; 
          month: string; 
          isDualLanguage?: boolean;
          gujaratiName?: string;
          items: Array<{ 
            dept: string; 
            accent: string; 
            completed: number; 
            pending: number; 
            totalApplicable: number; 
            completionPct: number; 
            pendingEmployees: string[];
            completedEmployees?: string[];
            targetDate?: string | null;
            expired?: boolean;
            mcqTotal?: number;
            mcqApproved?: number;
            mcqEngTotal?: number;
            mcqEngApproved?: number;
            mcqGujTotal?: number;
            mcqGujApproved?: number;
          }> 
        }>();
        for (const g of sopWiseGroups) {
          const accent = DEPT_ACCENT[(g.department as Dept) || 'Total'] || '#a855f7';
          for (const s of g.sops) {
            if (!map.has(s.sopCode)) map.set(s.sopCode, { sopCode: s.sopCode, title: s.title || '', month: s.month, items: [] });
            map.get(s.sopCode)!.items.push({ dept: g.department, accent, ...s, pendingEmployees: s.pendingEmployees });
          }
        }
        const list = [...map.values()].sort((a, b) => a.sopCode.localeCompare(b.sopCode));
        return (
          <div className="space-y-6">
            {list.map((s) => (
              <div key={s.sopCode} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                      {s.sopCode} {s.title && <span className="ml-2 font-sans font-bold text-purple-900 opacity-60">{s.title}</span>}
                    </span>
                    {!!s.month && <span className="text-[10px] font-semibold text-gray-500">{s.month}</span>}
                  </div>
                  <span className="text-[11px] text-gray-500">{s.items.length} dept{s.items.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="p-4 space-y-3">
                  {s.items.map((it, idx) => (
                    <SopCard
                      key={`${s.sopCode}|${it.dept}`}
                      dept={it.dept}
                      accent={it.accent}
                      sr={idx + 1}
                      sop={{
                        sopCode: s.sopCode,
                        title: s.title || '',
                        month: s.month,
                        trainer: (it as any).trainer || '',
                        completed: it.completed,
                        pending: it.pending,
                        totalApplicable: it.totalApplicable,
                        completionPct: it.completionPct,
                        pendingEmployees: it.pendingEmployees,
                        completedEmployees: (it as any).completedEmployees || [],
                        targetDate: (it as any).targetDate,
                        expired: (it as any).expired,
                        mcqTotal: (it as any).mcqTotal,
                        mcqApproved: (it as any).mcqApproved,
                        mcqEngTotal: (it as any).mcqEngTotal,
                        mcqEngApproved: (it as any).mcqEngApproved,
                        mcqGujTotal: (it as any).mcqGujTotal,
                        mcqGujApproved: (it as any).mcqGujApproved,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      }

      // default groupBy department
      let globalSr = 0;
      return (
        <div className="space-y-8">
          {sopWiseGroups.map((g) => {
            const accent = DEPT_ACCENT[(g.department as Dept) || 'Total'] || '#a855f7';
            return (
              <div key={g.department}>
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-sm whitespace-nowrap"
                    style={{ background: accent }}
                  >
                    {g.department}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent" />
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">{g.sops.length} SOPs</span>
                </div>
                <div className="space-y-3">
                  {g.sops.map((s) => {
                    globalSr += 1;
                    return (
                      <SopCard
                        key={`${g.department}|${s.sopCode}`}
                        dept={g.department}
                        accent={accent}
                        sr={globalSr}
                        sop={{
                          sopCode: s.sopCode,
                          title: (s as any).title || '',
                          isDualLanguage: (s as any).isDualLanguage,
                          gujaratiName: (s as any).gujaratiName,
                          month: s.month,
                          trainer: (s as any).trainer || '',
                          completed: s.completed,
                          pending: s.pending,
                          totalApplicable: s.totalApplicable,
                          completionPct: s.completionPct,
                          pendingEmployees: s.pendingEmployees,
                          completedEmployees: (s as any).completedEmployees || [],
                          targetDate: s.targetDate,
                          expired: s.expired,
                          mcqTotal: s.mcqTotal,
                          mcqApproved: s.mcqApproved,
                          mcqEngTotal: s.mcqEngTotal,
                          mcqEngApproved: s.mcqEngApproved,
                          mcqGujTotal: s.mcqGujTotal,
                          mcqGujApproved: s.mcqGujApproved,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Employee-wise / Month-wise: render the existing capsule style, grouped by parent selection
    if (capsuleLoading) {
      return (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      );
    }
    if (capsuleError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
          {capsuleError}
        </div>
      );
    }

    if (viewMode === 'employee') {
      if (!empCapsules.length) {
        return (
          <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500">
            No employee-wise data matches the current filters.
          </div>
        );
      }

      const groups: Array<{ key: string; title: string; items: any[]; accent?: string }> = [];
      if (groupBy === 'employee') {
        const m = new Map<string, any[]>();
        for (const c of empCapsules) {
          const k = c.employeeName || 'Unknown';
          if (!m.has(k)) m.set(k, []);
          m.get(k)!.push(c);
        }
        for (const [k, items] of m) groups.push({ key: k, title: k, items });
      } else {
        // default: department
        const m = new Map<string, any[]>();
        for (const c of empCapsules) {
          const k = c.department || 'Unknown';
          if (!m.has(k)) m.set(k, []);
          m.get(k)!.push(c);
        }
        for (const [k, items] of m) {
          const accent = DEPT_ACCENT[(k as Dept) || 'Total'] || '#a855f7';
          groups.push({ key: k, title: k, items, accent });
        }
      }

      return (
        <div className="space-y-8">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-sm whitespace-nowrap"
                  style={{ background: g.accent || DEPT_ACCENT.Total }}
                >
                  {g.title}
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent" />
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{g.items.length} capsule{g.items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-3">
                {g.items.map((cap, i) => {
                  const accent = DEPT_ACCENT[(cap.department as Dept) || 'Total'] || '#a855f7';
                  return (
                    <RowCapsuleShell
                      key={`${cap.employeeName}|${cap.year}-${cap.month}-${i}`}
                      accent={accent}
                      bgTint="slate"
                      onClick={() => {
                        // Build from uploaded Excel snapshot (not TrainingMatrixRecord status),
                        // because √ means scheduled for that month (not "found/missing").
                        const dept = String(cap.department || '');
                        const name = String(cap.employeeName || '');
                        const snapshotEmp =
                          (data?.employees || []).find((e) => e.department === dept && e.name === name) ||
                          (data?.employees || []).find((e) => e.name === name);
                        const monthMap = (data?.sopMonthMapByDept as any)?.[dept] || {};
                        const employeeSops: Array<{ sopCode: string; month: string; symbol: '√' | 'X' | 'NA' }> = [];
                        if (snapshotEmp) {
                          for (const [sopCode, v] of Object.entries(snapshotEmp.training || {})) {
                            employeeSops.push({
                              sopCode,
                              month: monthMap[sopCode] || '',
                              symbol: v ? '√' : 'X',
                            });
                          }
                          employeeSops.sort((a, b) => a.sopCode.localeCompare(b.sopCode));
                        }
                        setDetailModal({
                          kind: 'employee',
                          title: name,
                          subtitle: `${dept}${snapshotEmp?.designation ? ` · ${snapshotEmp.designation}` : ''}`,
                          employeeName: name,
                          employeeSops,
                        });
                      }}
                      left={
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-black text-gray-900 truncate">{cap.employeeName}</span>
                            <span className="text-[10px] font-semibold text-gray-500">{cap.monthName} {cap.year}</span>
                            <ProgressPill pct={cap.completionPct || 0} />
                          </div>
                          <div className="mt-1 text-[10px] text-gray-500 truncate">
                            {cap.department}{cap.designation ? ` · ${cap.designation}` : ''} · Scheduled:{' '}
                            <span className="font-black text-gray-800">{cap.totalScheduled}</span>
                          </div>
                        </div>
                      }
                      chips={
                        <>
                          <CapsuleChip label="Found" value={cap.completed} tone="green" />
                          <CapsuleChip label="Missing" value={cap.pending} tone={cap.pending > 0 ? 'amber' : 'slate'} />
                          <CapsuleChip label="Not Req" value={cap.notRequired} tone="slate" />
                        </>
                      }
                      bottom={
                        Array.isArray(cap.pendingSopCodes) && cap.pendingSopCodes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {cap.pendingSopCodes.slice(0, 12).map((c: string) => (
                              <span key={c} className="font-mono text-[10px] bg-white/70 text-gray-800 border border-white/70 px-2 py-0.5 rounded-md">{c}</span>
                            ))}
                            {cap.pendingSopCodes.length > 12 ? (
                              <span className="text-[10px] font-semibold text-gray-500 px-1">+{cap.pendingSopCodes.length - 12} more</span>
                            ) : null}
                          </div>
                        ) : null
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // Month-wise: dept capsules grouped by month, or grouped by department
    if (!deptMonthGroups.length) {
      return (
        <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500">
          No month-wise data matches the current filters.
        </div>
      );
    }

    if (groupBy === 'month') {
      return (
        <div className="space-y-8">
          {deptMonthGroups.map((mg: any) => (
            <div key={`${mg.year}-${mg.month}`}>
              <div className="flex items-center gap-3 mb-4">
                <span className="bg-purple-600 text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-sm whitespace-nowrap">
                  {mg.monthName} {mg.year}
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-purple-200 to-transparent" />
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{mg.capsules?.length || 0} dept</span>
              </div>
              <div className="space-y-3">
                {(mg.capsules || []).map((cap: any) => {
                  const accent = DEPT_ACCENT[(cap.department as Dept) || 'Total'] || '#a855f7';
                  const pct = cap.completionPct || 0;
                  return (
                    <RowCapsuleShell
                      key={`${mg.year}-${mg.month}|${cap.department}`}
                      accent={accent}
                      bgTint="purple"
                      onClick={() => {
                        setDetailModal({
                          kind: 'monthDept',
                          title: `${cap.department}`,
                          subtitle: `${mg.monthName} ${mg.year}`,
                          department: cap.department,
                          month: mg.month,
                          year: mg.year,
                        });
                      }}
                      left={
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-black text-gray-900 truncate">{cap.department}</span>
                            <span className="text-[10px] font-semibold text-gray-500">{mg.monthName} {mg.year}</span>
                            <ProgressPill pct={pct} />
                          </div>
                          <div className="mt-1 text-[10px] text-gray-500">
                            SOPs scheduled: <span className="font-black text-gray-800">{cap.sopCount}</span>
                          </div>
                        </div>
                      }
                      chips={
                        <>
                          <CapsuleChip label="Found" value={cap.completed} tone="green" />
                          <CapsuleChip label="Missing" value={cap.pending} tone={cap.pending > 0 ? 'amber' : 'slate'} />
                          <CapsuleChip label="Not Req" value={cap.notRequired} tone="slate" />
                        </>
                      }
                      bottom={
                        Array.isArray(cap.topPendingSops) && cap.topPendingSops.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {cap.topPendingSops.slice(0, 10).map((c: string) => (
                              <span key={c} className="font-mono text-[10px] bg-white/70 text-gray-800 border border-white/70 px-2 py-0.5 rounded-md">{c}</span>
                            ))}
                            {cap.topPendingSops.length > 10 ? (
                              <span className="text-[10px] font-semibold text-gray-500 px-1">+{cap.topPendingSops.length - 10} more</span>
                            ) : null}
                          </div>
                        ) : null
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // groupBy department (default): flatten monthGroups into dept sections
    const deptMap = new Map<string, any[]>();
    for (const mg of deptMonthGroups) {
      for (const cap of (mg.capsules || [])) {
        const k = cap.department || 'Unknown';
        if (!deptMap.has(k)) deptMap.set(k, []);
        deptMap.get(k)!.push({ ...cap, _monthName: mg.monthName, _year: mg.year });
      }
    }
    const deptList = [...deptMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    return (
      <div className="space-y-8">
        {deptList.map(([dept, caps]) => {
          const accent = DEPT_ACCENT[(dept as Dept) || 'Total'] || '#a855f7';
          return (
            <div key={dept}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-sm whitespace-nowrap" style={{ background: accent }}>
                  {dept}
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent" />
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{caps.length} month{caps.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-3">
                {caps
                  .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
                  .map((cap: any) => {
                    const pct = cap.completionPct || 0;
                    return (
                      <RowCapsuleShell
                        key={`${dept}|${cap.year}-${cap.month}`}
                        accent={accent}
                        bgTint="mint"
                        onClick={() => {
                          setDetailModal({
                            kind: 'monthDept',
                            title: `${dept}`,
                            subtitle: `${cap._monthName} ${cap.year}`,
                            department: dept,
                            month: cap.month,
                            year: cap.year,
                          });
                        }}
                        left={
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[12px] font-black text-gray-900 truncate">{cap._monthName} {cap.year}</span>
                              <ProgressPill pct={pct} />
                            </div>
                            <div className="mt-1 text-[10px] text-gray-500">
                              SOPs scheduled: <span className="font-black text-gray-800">{cap.sopCount}</span>
                            </div>
                          </div>
                        }
                        chips={
                          <>
                            <CapsuleChip label="Found" value={cap.completed} tone="green" />
                            <CapsuleChip label="Missing" value={cap.pending} tone={cap.pending > 0 ? 'amber' : 'slate'} />
                            <CapsuleChip label="Not Req" value={cap.notRequired} tone="slate" />
                          </>
                        }
                      />
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800">
              <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
            </Link>
            <div className="h-4 w-px bg-gray-200" />
            <h1 className="text-sm font-bold tracking-tight">Training Matrix</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={loading}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <Link
              href="/employees"
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <UserRound className="h-3.5 w-3.5" /> Employees
            </Link>
            <button
              onClick={() => setShowManageSOPs(true)}
              className="flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100"
              suppressHydrationWarning
            >
              <Plus className="h-3.5 w-3.5" /> Manage SOPs
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-purple-700"
              suppressHydrationWarning
            >
              <Upload className="h-3.5 w-3.5" /> Upload Excel Files
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-5">
        {/* Cards row */}
        <section className="mb-5">
          {loading && !data ? (
            <div className="flex gap-3.5 overflow-x-auto pb-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[340px] min-w-[220px] animate-pulse rounded-xl border border-gray-100 bg-white"
                />
              ))}
            </div>
          ) : data ? (
            <div className="flex gap-2">
              {renderTotalCard(data.totalCard)}
              {DEPARTMENTS.map((dept) => <Fragment key={dept}>{renderDeptCard(dept, data.perDept[dept])}</Fragment>)}
            </div>
          ) : (
            <EmptyState onUpload={() => setShowUpload(true)} />
          )}
        </section>

        {/* Details panel disabled: summary clicks filter capsules instead */}

        {/* Dept filter pills */}
        {data && (
          <section className="mb-3">
            <div className="flex flex-wrap gap-2">
              <Pill
                label="All Depts"
                active={activeDept === 'All'}
                accent={DEPT_ACCENT.Total}
                onClick={() => setActiveDept('All')}
              />
              {DEPARTMENTS.map((d) => (
                <Pill
                  key={d}
                  label={d}
                  active={activeDept === d}
                  accent={DEPT_ACCENT[d]}
                  onClick={() => setActiveDept(d)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Month capsules */}
        {data && (
          <section className="mb-4">
            <div className="flex flex-wrap gap-1.5">
              <MonthCapsule
                label="All"
                count={totalUniqueSops}
                active={activeMonth === 'All'}
                accent={activeDept === 'All' ? DEPT_ACCENT.Total : DEPT_ACCENT[activeDept]}
                onClick={() => setActiveMonth('All')}
              />
              {MONTHS.map((m) => (
                <MonthCapsule
                  key={m}
                  label={MONTH_SHORT[m]}
                  count={monthCountsForGrid[m] || 0}
                  active={activeMonth === m}
                  accent={activeDept === 'All' ? DEPT_ACCENT.Total : DEPT_ACCENT[activeDept]}
                  onClick={() => setActiveMonth(m)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Training table */}
        {data && (
          <section ref={tableSectionRef}>
            <div className="mb-2 flex items-center justify-between">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={viewMode === 'sop' ? 'Search SOP / employee…' : 'Search…'}
                  className="rounded-lg border border-gray-200 py-1.5 pl-7 pr-3 text-xs focus:border-purple-300 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                {capsuleSopFilter ? (
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-700 border border-purple-200">
                      {capsuleSopFilter.sopCodes.size} SOPs
                    </span>
                    <span className="text-[11px] font-semibold text-gray-700 truncate max-w-xs" title={capsuleSopFilter.title}>
                      {capsuleSopFilter.title}
                    </span>
                    <button
                      type="button"
                      onClick={clearCapsuleFilter}
                      className="flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-700 hover:bg-purple-100 shrink-0"
                    >
                      <X className="h-3 w-3" /> Clear
                    </button>
                  </div>
                ) : null}
                <ViewToggle />
                <button
                  onClick={exportToExcel}
                  disabled={!visibleEmployees.length}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  title="Exports the uploaded Excel snapshot matrix"
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
              </div>
            </div>

            <CapsulesBody />
          </section>
        )}
      </main>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            fetchData(true);
          }}
        />
      )}

      {showManageSOPs && (
        <ManageMatrixSOPsModal
          defaultDept={activeDept === 'All' ? 'QA' : activeDept}
          onClose={() => setShowManageSOPs(false)}
          onRefresh={() => fetchData(true)}
        />
      )}

      {missingModal && (
        <ListModal
          title={missingModal.title}
          columns={
            missingModal.kind === 'sop'
              ? [
                { key: 'sopCode', label: 'SOP Code', width: '140px' },
                { key: 'title', label: 'SOP Title' },
                { key: 'department', label: 'Department', width: '160px' },
              ]
              : missingModal.kind === 'repeat-sop'
              ? [
                { key: 'sopCode', label: 'SOP Code', width: '140px' },
                { key: 'count', label: 'Times in Excel', width: '120px' },
                { key: 'title', label: 'SOP Title' },
              ]
              : [
                { key: 'sopCode', label: 'SOP Code', width: '140px' },
                { key: 'month', label: 'Scheduled Month', width: '160px' },
                { key: 'department', label: 'Department', width: '160px' },
              ]
          }
          rows={missingModal.rows}
          onClose={() => setMissingModal(null)}
        />
      )}

      {/* DB SOP modal disabled: summary buttons filter capsules instead */}

      <DetailModal />

      <style jsx>{`
        .tm-cards-scroll::-webkit-scrollbar {
          height: 4px;
        }
        .tm-cards-scroll::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Pill({
  label,
  active,
  accent,
  onClick,
}: {
  label: string;
  active: boolean;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-4 py-1.5 text-[12px] font-medium transition"
      style={
        active
          ? { background: accent, color: '#fff' }
          : { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }
      }
    >
      {label}
    </button>
  );
}

function MonthCapsule({
  label,
  count,
  active,
  accent,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-medium transition"
      style={
        active
          ? { background: accent, color: '#fff' }
          : { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }
      }
    >
      <span>{label}</span>
      <span
        className="rounded-full px-1 text-[9px] font-semibold"
        style={
          active ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : { background: '#fff', color: '#6b7280' }
        }
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
      <FileSpreadsheet className="mb-2 h-10 w-10 text-gray-300" />
      <p className="mb-3 text-sm text-gray-600">Upload training matrix Excel files to begin</p>
      <button
        onClick={onUpload}
        className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-medium text-white hover:bg-purple-700"
      >
        Upload Excel Files
      </button>
    </div>
  );
}

// ─── Training Table ───────────────────────────────────────────────────────────

function TrainingTable({
  employees,
  sops,
  activeDept,
}: {
  employees: EmployeeRow[];
  sops: Array<{ code: string; month: string }>;
  activeDept: ActiveDept;
}) {
  if (!employees.length) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500">
        No employees match the current filters.
      </div>
    );
  }

  const grouped: Array<{ department: string; rows: EmployeeRow[] }> = [];
  if (activeDept === 'All') {
    const map = new Map<string, EmployeeRow[]>();
    for (const e of employees) {
      if (!map.has(e.department)) map.set(e.department, []);
      map.get(e.department)!.push(e);
    }
    for (const [department, rows] of map) grouped.push({ department, rows });
  } else {
    grouped.push({ department: activeDept, rows: employees });
  }

  return (
    <div className="overflow-auto rounded-xl border border-gray-100 bg-white shadow-sm">
      <table className="min-w-full border-collapse text-left text-[11px]">
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className="sticky left-0 z-20 w-[160px] border-b border-gray-200 bg-gray-50 px-3 py-2 font-semibold text-gray-700">
              Employee Name
            </th>
            <th className="sticky left-[160px] z-20 w-[140px] border-b border-gray-200 bg-gray-50 px-3 py-2 font-semibold text-gray-700">
              Designation
            </th>
            {sops.map((s) => (
              <th
                key={s.code}
                title={`${s.code}${s.month ? ` — ${s.month}` : ''}`}
                className="border-b border-gray-200 px-2 py-2 text-center font-semibold text-gray-700"
                style={{ minWidth: 58 }}
              >
                {s.code}
              </th>
            ))}
            <th className="w-[150px] border-b border-gray-200 bg-gray-50 px-3 py-2 font-semibold text-gray-700">
              Summary
            </th>
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ department, rows }) => (
            <Fragment key={`grp-${department}`}>
              {activeDept === 'All' && (
                <tr key={`hdr-${department}`}>
                  <td
                    colSpan={sops.length + 3}
                    className="border-l-[3px] bg-gray-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600"
                    style={{ borderLeftColor: DEPT_ACCENT[department as Dept] || '#e5e7eb' }}
                  >
                    {department} <span className="ml-2 text-gray-400">({rows.length})</span>
                  </td>
                </tr>
              )}
              {rows.map((e) => {
                let trained = 0;
                let total = 0;
                for (const s of sops) {
                  if (s.code in (e.training || {})) {
                    total += 1;
                    if (e.training[s.code]) trained += 1;
                  }
                }
                const pct = total ? Math.round((trained / total) * 100) : 0;
                return (
                  <tr key={`${e.department}-${e.name}`} className="hover:bg-gray-50">
                    <td className="sticky left-0 z-10 w-[160px] bg-white px-3 py-1.5 text-gray-800">
                      {e.name}
                    </td>
                    <td className="sticky left-[160px] z-10 w-[140px] bg-white px-3 py-1.5 text-gray-600">
                      {e.designation || '—'}
                    </td>
                    {sops.map((s) => {
                      const hasCell = s.code in (e.training || {});
                      if (!hasCell) {
                        return (
                          <td key={s.code} className="border-gray-100 px-2 py-1.5 text-center text-gray-300">
                            —
                          </td>
                        );
                      }
                      const ok = e.training[s.code];
                      return (
                        <td
                          key={s.code}
                          className={`border-gray-100 px-2 py-1.5 text-center font-bold ${ok ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                            }`}
                        >
                          {ok ? '✓' : '✗'}
                        </td>
                      );
                    })}
                    <td className="w-[150px] px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-gray-700">
                          {trained}/{total}
                        </span>
                        <div className="h-1.5 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
