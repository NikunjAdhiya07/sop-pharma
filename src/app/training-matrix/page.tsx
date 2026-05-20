'use client';

import { Fragment, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuthGuard } from '@/hooks/useAuthGuard';

function stripVersion(code: string): string {
  return String(code || '').toUpperCase().replace(/-\d+$/, '').trim();
}

function monthForCode(monthMap: Record<string, string>, sopCode: string): string {
  const base = stripVersion(sopCode);
  return monthMap[base] || monthMap[sopCode] || '';
}

function hasSopTitle(title?: string | null): boolean {
  return Boolean(String(title ?? '').trim());
}

type FalsySopRow = {
  key: string;
  sopCode: string;
  dept: string;
  month: string;
  trainer: string;
  completed: number;
  pending: number;
  totalApplicable: number;
  completionPct: number;
};

const FALSY_IGNORED_STORAGE = 'training-matrix-falsy-ignored';

function loadFalsyIgnoredKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(FALSY_IGNORED_STORAGE);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
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
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { buildViewDocHref } from '@/lib/viewDocLinks';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_DEPARTMENTS = ['QA', 'QC', 'Microbiology', 'Production', 'Store', 'Engineering', 'Personnel'] as const;
type Dept = string;

const DEPT_ACCENT: Record<string, string> = {
  Total: '#a855f7',
  QA: '#6366f1',
  QC: '#3b82f6',
  Microbiology: '#10b981',
  Production: '#f59e0b',
  Store: '#f97316',
  Engineering: '#64748b',
  Personnel: '#ec4899',
};

const DEPT_ICON: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Total: ClipboardList,
  QA: FlaskConical,
  QC: FlaskConical,
  Microbiology: Microscope,
  Production: Cog,
  Store: Package,
  Engineering: Wrench,
  Personnel: UserRound,
};

function getDeptAccent(dept: string): string {
  return DEPT_ACCENT[dept] || '#a855f7';
}

function getDeptIcon(dept: string): React.ComponentType<{ className?: string; style?: React.CSSProperties }> {
  return DEPT_ICON[dept] || ClipboardList;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT: Record<string, string> = {
  January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr', May: 'May', June: 'Jun',
  July: 'Jul', August: 'Aug', September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
};

type DeptBgTint = 'purple' | 'mint' | 'amber' | 'orange' | 'slate' | 'pink' | 'red';

function deptBgTintClass(bgTint: DeptBgTint): string {
  switch (bgTint) {
    case 'red':
      return 'bg-gradient-to-r from-red-50 to-rose-50';
    case 'pink':
      return 'bg-gradient-to-r from-pink-50 to-rose-50';
    case 'purple':
      return 'bg-gradient-to-r from-violet-50 to-fuchsia-50';
    case 'mint':
      return 'bg-gradient-to-r from-emerald-50 to-teal-50';
    case 'amber':
      return 'bg-gradient-to-r from-amber-50 to-orange-50';
    case 'orange':
      return 'bg-gradient-to-r from-orange-50 to-amber-50';
    default:
      return 'bg-gradient-to-r from-slate-50 to-gray-50';
  }
}

function deptToBgTint(dept: string, expired?: boolean): DeptBgTint {
  if (expired) return 'red';
  if (dept === 'QA') return 'purple';
  if (dept === 'QC' || dept === 'Microbiology') return 'mint';
  if (dept === 'Production') return 'amber';
  if (dept === 'Store') return 'orange';
  if (dept === 'Engineering') return 'slate';
  if (dept === 'Personnel') return 'pink';
  return 'slate';
}

/** Grid columns: #, code, title, dept(DB), dept, month, trainer, docs, ENG MCQs, ENG appr, GUJ MCQs, GUJ appr, expiry */
const SOP_TABLE_GRID_COLS =
  '1.25rem 4.5rem minmax(7rem,1fr) 4.5rem 4.5rem 4rem 7rem 4rem repeat(4, minmax(3rem, 4rem)) 5.5rem';

/** Employee bubbles sit in cols 1–3 (#, code, title) — must not extend under Dept (DB) / Dept / Month / Trainer. */
const SOP_EMP_BUBBLE_GRID_COL = '1 / 4';

const EMP_BUBBLE_GAP_PX = 6;
const EMP_MORE_BTN_RESERVE_PX = 76;

function EmployeeBubbleRow({
  names,
  variant,
  onNameClick,
  onMoreClick,
}: {
  names: string[];
  variant: 'due' | 'pending';
  onNameClick: (name: string) => void;
  onMoreClick?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(names.length);
  const [popupOpen, setPopupOpen] = useState(false);

  const bubbleClass =
    variant === 'due'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
      : 'bg-white/70 text-gray-800 border-white/70 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-800';

  const recomputeVisible = useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure || names.length === 0) {
      setVisibleCount(names.length);
      return;
    }
    const maxW = container.clientWidth;
    if (maxW <= 0) return;

    const chips = Array.from(measure.children) as HTMLElement[];
    if (chips.length === 0) {
      setVisibleCount(names.length);
      return;
    }

    let used = 0;
    let count = 0;
    for (let i = 0; i < chips.length; i++) {
      const chipW = chips[i].offsetWidth;
      const gap = i > 0 ? EMP_BUBBLE_GAP_PX : 0;
      const hasHidden = i < names.length - 1;
      const reserve = hasHidden ? EMP_MORE_BTN_RESERVE_PX : 0;
      if (count > 0 && used + gap + chipW + reserve > maxW) break;
      if (used + gap + chipW > maxW) {
        if (count === 0) count = 1;
        break;
      }
      used += gap + chipW;
      count = i + 1;
    }
    setVisibleCount(Math.min(Math.max(count, 0), names.length));
  }, [names]);

  useLayoutEffect(() => {
    recomputeVisible();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => recomputeVisible());
    ro.observe(el);
    return () => ro.disconnect();
  }, [recomputeVisible]);

  useEffect(() => {
    if (!popupOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreWrapRef.current && !moreWrapRef.current.contains(e.target as Node)) {
        setPopupOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [popupOpen]);

  if (names.length === 0) return null;

  const hidden = names.slice(visibleCount);
  const visible = names.slice(0, visibleCount);

  const renderBubble = (n: string, key?: string) => (
    <button
      key={key ?? n}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onNameClick(n);
      }}
      className={`shrink-0 text-[9px] px-1.5 py-0 rounded-md border leading-tight transition cursor-pointer whitespace-nowrap ${bubbleClass}`}
    >
      {n}
    </button>
  );

  return (
    <div className="relative min-w-0" ref={containerRef}>
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex gap-1.5 whitespace-nowrap"
      >
        {names.map((n) => renderBubble(n, `m-${n}`))}
      </div>
      <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
        {visible.map((n) => renderBubble(n))}
        {hidden.length > 0 ? (
          <div className="relative shrink-0" ref={moreWrapRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onMoreClick) onMoreClick();
                else setPopupOpen((v) => !v);
              }}
              className={`text-[9px] font-semibold px-1.5 py-0 rounded-md border leading-tight transition cursor-pointer whitespace-nowrap ${bubbleClass}`}
            >
              +{hidden.length} more
            </button>
            {!onMoreClick && popupOpen ? (
              <div
                className="absolute left-0 top-full z-50 mt-1 min-w-[12rem] max-w-sm max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-wrap gap-1.5">{hidden.map((n) => renderBubble(n, `h-${n}`))}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** MCQ count columns: green when any MCQs exist, gray when none. */
function mcqCountTone(total: number): string {
  if (total <= 0) return 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
}

/** Approval columns: red / amber / green by approval progress. */
function mcqApprovalTone(approved: number, total: number): string {
  if (total <= 0) return 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100';
  if (approved >= total) return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
  if (approved > 0) return 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100';
  return 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100';
}

function McqMetricColumn({
  sopCode,
  display,
  tone,
  enabled = true,
}: {
  sopCode: string;
  display: string;
  tone: string;
  enabled?: boolean;
}) {
  const base =
    'flex items-center justify-center rounded-lg border min-h-[2rem] w-full px-1 py-1 text-[10px] font-bold tabular-nums leading-tight transition';
  if (!enabled) {
    return (
      <span className={`${base} bg-gray-50/80 text-gray-400 border-gray-200`} title="Not applicable">
        {display}
      </span>
    );
  }
  return (
    <a
      href={`/mcq-bank?search=${encodeURIComponent(sopCode)}`}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="View in MCQ Bank"
      className={`${base} hover:opacity-90 ${tone}`}
    >
      <span className="truncate max-w-full text-center">{display}</span>
    </a>
  );
}

function SopMcqMetrics({
  sopCode,
  isDualLanguage,
  mcqTotal,
  mcqApproved,
  mcqEngTotal,
  mcqEngApproved,
  mcqGujTotal,
  mcqGujApproved,
}: {
  sopCode: string;
  isDualLanguage?: boolean;
  mcqTotal?: number;
  mcqApproved?: number;
  mcqEngTotal?: number;
  mcqEngApproved?: number;
  mcqGujTotal?: number;
  mcqGujApproved?: number;
}) {
  if (mcqTotal === undefined && mcqEngTotal === undefined) {
    return (
      <>
        <span className="flex items-center justify-center text-[10px] text-gray-400 font-semibold">NA</span>
        <span className="flex items-center justify-center text-[10px] text-gray-400 font-semibold">NA</span>
        <span className="flex items-center justify-center text-[10px] text-gray-400 font-semibold">NA</span>
        <span className="flex items-center justify-center text-[10px] text-gray-400 font-semibold">NA</span>
      </>
    );
  }

  const engTotal = isDualLanguage ? (mcqEngTotal ?? 0) : (mcqTotal ?? 0);
  const engAppr = isDualLanguage ? (mcqEngApproved ?? 0) : (mcqApproved ?? 0);
  const gujTotal = isDualLanguage ? (mcqGujTotal ?? 0) : 0;
  const gujAppr = isDualLanguage ? (mcqGujApproved ?? 0) : 0;
  const neutral = 'bg-gray-50 text-gray-400 border-gray-200';

  return (
    <>
      <McqMetricColumn
        sopCode={sopCode}
        display={String(engTotal)}
        tone={mcqCountTone(engTotal)}
      />
      <McqMetricColumn
        sopCode={sopCode}
        display={engTotal > 0 ? `${Math.round((engAppr / engTotal) * 100)}%` : 'NA'}
        tone={mcqApprovalTone(engAppr, engTotal)}
      />
      <McqMetricColumn
        sopCode={sopCode}
        display={isDualLanguage ? String(gujTotal) : 'NA'}
        tone={isDualLanguage ? mcqCountTone(gujTotal) : neutral}
        enabled={!!isDualLanguage}
      />
      <McqMetricColumn
        sopCode={sopCode}
        display={isDualLanguage && gujTotal > 0 ? `${Math.round((gujAppr / gujTotal) * 100)}%` : 'NA'}
        tone={isDualLanguage ? mcqApprovalTone(gujAppr, gujTotal) : neutral}
        enabled={!!isDualLanguage}
      />
    </>
  );
}

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
  sopTrainersAssigned?: number;
  sopTrainersMissing?: number;
  sopTrainersMissingList?: Array<{ sopCode: string; title: string; department: string }>;
  okayCount: number;
  expiredCount: number;
  dueSoon30Count?: number;
  dueSoon30McqReviewed?: number;
  dueSoon30McqPartial?: number;
  dueSoon30McqNotReviewed?: number;
  mcqCreatedCount: number;
  mcqNotCreatedCount: number;
  mcqAllApprovedCount: number;
  mcqPartiallyApprovedCount: number;
  mcqNotApprovedCount: number;
  // SOP-based approval — Non-Dual SOPs sub-universe (mcqEngOnlyCreated)
  mcqApprovedNonDualCount?: number;
  mcqApprovalPartialNonDualCount?: number;
  mcqApprovalMissingNonDualCount?: number;
  // SOP-based approval — Dual SOPs sub-universe (mcqDualBothCreated)
  mcqApprovedDualCount?: number;
  mcqApprovalPartialDualCount?: number;
  mcqApprovalMissingDualCount?: number;
  // Per-language slot approval inside Dual-Found universe (display only)
  mcqDualSlotEngAllApprovedCount?: number;
  mcqDualSlotEngPartiallyApprovedCount?: number;
  mcqDualSlotEngNotApprovedCount?: number;
  mcqDualSlotGujAllApprovedCount?: number;
  mcqDualSlotGujPartiallyApprovedCount?: number;
  mcqDualSlotGujNotApprovedCount?: number;
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
  // Non-Dual SOPs (English-only) breakdown
  mcqEngOnlyCreatedCount?: number;
  mcqEngOnlyNotCreatedCount?: number;
  // (ENG + GUJ) breakdown
  mcqDualSopCount?: number;
  mcqDualEngCreatedCount?: number;
  mcqDualEngNotCreatedCount?: number;
  mcqDualGujCreatedCount?: number;
  mcqDualGujNotCreatedCount?: number;
  mcqDualBothCreatedCount?: number;
  mcqDualEitherIncompleteCount?: number;
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
  sop0TrainerCount?: number;
  sop1TrainerCount?: number;
  sop2PlusTrainerCount?: number;
  sop0TrainerList?: string[];
  sop1TrainerList?: string[];
  sop2PlusTrainerList?: string[];
}

interface TotalCardData {
  dbSopCount: number;
  dbSopsByDept: Record<string, Array<{ sopCode: string; title: string }>>;
  dbSopCountsByDept: Record<string, number>;
  langBreakdown?: Array<{ key: string; label: string; found: number; missing: number }>;
  excelSopCount: number;
  missingSopCount: number;
  trainersAssigned: number;
  trainersMissing: number;
  sopTrainersAssigned?: number;
  sopTrainersMissing?: number;
  sopTrainersMissingList?: Array<{ sopCode: string; title: string; department: string }>;
  okayCount: number;
  expiredCount: number;
  dueSoon30Count?: number;
  dueSoon30McqReviewed?: number;
  dueSoon30McqPartial?: number;
  dueSoon30McqNotReviewed?: number;
  mcqCreatedCount: number;
  mcqNotCreatedCount: number;
  mcqAllApprovedCount: number;
  mcqPartiallyApprovedCount: number;
  mcqNotApprovedCount: number;
  // SOP-based approval — Non-Dual SOPs sub-universe (mcqEngOnlyCreated)
  mcqApprovedNonDualCount?: number;
  mcqApprovalPartialNonDualCount?: number;
  mcqApprovalMissingNonDualCount?: number;
  // SOP-based approval — Dual SOPs sub-universe (mcqDualBothCreated)
  mcqApprovedDualCount?: number;
  mcqApprovalPartialDualCount?: number;
  mcqApprovalMissingDualCount?: number;
  // Per-language slot approval inside Dual-Found universe (display only)
  mcqDualSlotEngAllApprovedCount?: number;
  mcqDualSlotEngPartiallyApprovedCount?: number;
  mcqDualSlotEngNotApprovedCount?: number;
  mcqDualSlotGujAllApprovedCount?: number;
  mcqDualSlotGujPartiallyApprovedCount?: number;
  mcqDualSlotGujNotApprovedCount?: number;
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
  // Non-Dual SOPs (English-only) breakdown
  mcqEngOnlyCreatedCount?: number;
  mcqEngOnlyNotCreatedCount?: number;
  // (ENG + GUJ) breakdown
  mcqDualSopCount?: number;
  mcqDualEngCreatedCount?: number;
  mcqDualEngNotCreatedCount?: number;
  mcqDualGujCreatedCount?: number;
  mcqDualGujNotCreatedCount?: number;
  mcqDualBothCreatedCount?: number;
  mcqDualEitherIncompleteCount?: number;
  employeeCount: number;
  fullyTrained: number;
  incomplete: number;
  departmentCount: number;
  totalDepartments: number;
  missingFromExcelList: Array<{ sopCode: string; title: string; department: string }>;
  trainersMissingList: Array<{ sopCode: string; month: string; department: string }>;
  sop0TrainerCount?: number;
  sop1TrainerCount?: number;
  sop2PlusTrainerCount?: number;
  sop0TrainerList?: string[];
  sop1TrainerList?: string[];
  sop2PlusTrainerList?: string[];
}

interface EmployeeRow {
  name: string;
  designation: string;
  department: string;
  training: Record<string, boolean>;
}

type SopDetailType = 'db' | 'excel' | 'found' | 'missing' | 'obsolete' | 'found_any';

type MatrixViewMode = 'sop' | 'employee' | 'month';
type GroupByMode = 'department' | 'employee' | 'sop' | 'month';
type EmployeeListFilter = 'all' | 'full' | 'incomplete';

type TrainerBucketSource = Pick<
  TotalCardData,
  | 'sop0TrainerCount'
  | 'sop1TrainerCount'
  | 'sop2PlusTrainerCount'
  | 'sop0TrainerList'
  | 'sop1TrainerList'
  | 'sop2PlusTrainerList'
>;

function resolveTrainerBucketCounts(src: TrainerBucketSource | null | undefined) {
  return {
    sop0: src?.sop0TrainerCount ?? src?.sop0TrainerList?.length ?? 0,
    sop1: src?.sop1TrainerCount ?? src?.sop1TrainerList?.length ?? 0,
    sop2Plus: src?.sop2PlusTrainerCount ?? src?.sop2PlusTrainerList?.length ?? 0,
  };
}

function overviewHasTrainerBuckets(payload: OverviewData): boolean {
  const t = payload.totalCard;
  if (!t) return false;
  if ((t.dbSopCount ?? 0) === 0) return true;
  return (
    typeof t.sop0TrainerCount === 'number' &&
    typeof t.sop1TrainerCount === 'number' &&
    typeof t.sop2PlusTrainerCount === 'number'
  );
}

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
  dbDocPathsByCode?: Record<string, { eng?: string; guj?: string; id?: string }>;
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
  const content = (
    <>
      <span className="min-w-0 shrink font-semibold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
      <span className="font-bold tabular-nums shrink-0 leading-tight text-gray-900">{value}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full min-h-[24px] cursor-pointer items-center justify-between gap-1.5 rounded-[4px] border border-transparent px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-purple-100/80 active:bg-purple-200/60 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="flex w-full min-h-[24px] items-center justify-between gap-1.5 rounded-[4px] border border-transparent px-1 py-0.5 text-[10px]">
      {content}
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
    <div className="grid min-h-[26px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[5px] border border-transparent px-1 py-px text-[10px]">
      <span className="min-w-0 truncate text-left font-semibold text-gray-700">{label}</span>
      <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm tabular-nums">
        {onClickGreen ? (
          <button
            type="button"
            onClick={onClickGreen}
            className="min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-emerald-500/70"
          >
            {green}
          </button>
        ) : (
          <span className="min-w-[1.35rem] px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700">{green}</span>
        )}
        <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
        {(() => {
          const isZero = red === 0;
          const colorCls = isZero ? 'text-gray-400' : 'text-red-600';
          const hoverCls = isZero ? 'hover:bg-gray-100 focus:ring-gray-400/70' : 'hover:bg-red-50 focus:ring-red-400/70';
          return onClickRed ? (
            <button
              type="button"
              onClick={onClickRed}
              className={`min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none ${colorCls} transition-colors ${hoverCls} focus:z-10 focus:outline-none focus:ring-1`}
            >
              {red}
            </button>
          ) : (
            <span className={`min-w-[1.35rem] px-1 py-0.5 text-center text-[10px] font-bold leading-none ${colorCls}`}>{red}</span>
          );
        })()}
      </div>
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
    <div className="grid min-h-[26px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[5px] border border-transparent px-1 py-px text-[10px]">
      <span className="min-w-0 truncate text-left font-semibold text-gray-700">{label}</span>
      <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm tabular-nums">
        {onClickGreen ? (
          <button
            type="button"
            onClick={onClickGreen}
            className="min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-emerald-500/70"
          >
            {green}
          </button>
        ) : (
          <span className="min-w-[1.35rem] px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700">{green}</span>
        )}
        <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
        {onClickAmber ? (
          <button
            type="button"
            onClick={onClickAmber}
            className="min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-amber-600 transition-colors hover:bg-amber-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-amber-400/70"
          >
            {amber}
          </button>
        ) : (
          <span className="min-w-[1.35rem] px-1 py-0.5 text-center text-[10px] font-bold leading-none text-amber-600">{amber}</span>
        )}
        <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
        {(() => {
          const isZero = red === 0;
          const colorCls = isZero ? 'text-gray-400' : 'text-red-600';
          const hoverCls = isZero ? 'hover:bg-gray-100 focus:ring-gray-400/70' : 'hover:bg-red-50 focus:ring-red-400/70';
          return onClickRed ? (
            <button
              type="button"
              onClick={onClickRed}
              className={`min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none ${colorCls} transition-colors ${hoverCls} focus:z-10 focus:outline-none focus:ring-1`}
            >
              {red}
            </button>
          ) : (
            <span className={`min-w-[1.35rem] px-1 py-0.5 text-center text-[10px] font-bold leading-none ${colorCls}`}>{red}</span>
          );
        })()}
      </div>
    </div>
  );
}

function RowD({
  label,
  value,
  color,
  onClick,
  tooltip,
}: {
  label: string;
  value: React.ReactNode;
  color: 'green' | 'red' | 'amber';
  onClick?: () => void;
  tooltip?: string;
}) {
  const isZeroRed = color === 'red' && (typeof value === 'number' ? value === 0 : value === '0');
  const colorClass =
    color === 'green' ? 'text-emerald-700'
      : color === 'red' ? (isZeroRed ? 'text-gray-400' : 'text-red-600')
      : 'text-amber-600';
  const hoverBg =
    color === 'green' ? 'hover:bg-emerald-50'
      : color === 'red' ? (isZeroRed ? 'hover:bg-gray-100' : 'hover:bg-red-50')
      : 'hover:bg-amber-50';
  return (
    <div className="grid min-h-[24px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[4px] border border-transparent px-1 py-px text-[10px]">
      <span className="flex min-w-0 items-center gap-0.5 truncate text-[10px] font-semibold text-gray-700">
        {label}
        {tooltip && (
          <span className="group/tip relative inline-flex items-center">
            <svg
              className="h-2.5 w-2.5 cursor-default text-gray-300 transition-colors group-hover/tip:text-gray-500"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.75 10.5h-1.5v-5h1.5v5zm0-6.5h-1.5V3.5h1.5V5z" />
            </svg>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-40 -translate-x-1/2 rounded bg-gray-800 px-2 py-1.5 text-[9px] leading-tight text-white opacity-0 transition-opacity group-hover/tip:opacity-100">
              {tooltip}
            </span>
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onClick}
        className={`min-w-[1.35rem] rounded px-1 py-0.5 text-center font-bold leading-none tabular-nums ${colorClass} ${onClick ? `cursor-pointer ${hoverBg} focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400` : ''}`}
      >
        {value}
      </button>
    </div>
  );
}

function RepetitiveSopsRow({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode; total?: number; color: 'red' | 'amber' | 'green'; tooltip?: string; onClick?: () => void }>;
}) {
  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-x-1 px-1 min-h-[22px]">
      {items.map(({ label, value, color, tooltip, onClick }) => {
        const isZeroRed = color === 'red' && (typeof value === 'number' ? value === 0 : value === '0');
        const colorClass = color === 'red'
          ? (isZeroRed ? 'text-gray-400' : 'text-red-600')
          : color === 'amber' ? 'text-amber-600' : 'text-emerald-700';
        return (
          <span key={label} className="flex shrink-0 items-center gap-x-0.5 tabular-nums" title={tooltip}>
            <span className="shrink-0 cursor-default text-[10px] font-semibold text-gray-500">
              {label}
            </span>
            <button
              type="button"
              onClick={onClick}
              title={tooltip}
              className={`shrink-0 rounded px-0.5 text-center text-[10px] font-bold leading-none ${colorClass} ${onClick ? 'cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-purple-400' : ''}`}
            >
              {value}
            </button>
          </span>
        );
      })}
    </div>
  );
}

function RedCountBtn({
  value,
  onClick,
  title,
  variant = 'lg',
}: {
  value: number;
  onClick?: () => void;
  title?: string;
  variant?: 'lg' | 'sm';
}) {
  const isZero = (value ?? 0) === 0;
  const sizeCls = variant === 'sm'
    ? 'min-w-[1rem] rounded-sm px-0.5 py-px'
    : 'min-w-[1.35rem] rounded px-1 py-0.5';
  const colorCls = isZero
    ? 'text-gray-400 hover:bg-gray-100 focus:ring-gray-400'
    : 'text-red-600 hover:bg-red-50 focus:ring-red-400';
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`${sizeCls} cursor-pointer text-center text-[10px] font-bold leading-none transition-colors ${colorCls} focus:z-10 focus:outline-none focus:ring-1`}
    >
      {value ?? 0}
    </button>
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
          className={`flex flex-col items-center rounded-[4px] border border-transparent px-0.5 py-0.5 transition-colors ${onSelectMonth ? 'hover:bg-purple-100/80 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400' : ''}`}
        >
          <span className="text-[10px] font-medium text-gray-500 leading-none">{MONTH_SHORT[m]}</span>
          <span className="text-[11px] font-bold text-gray-900 leading-tight tabular-nums">{monthCounts[m] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

function deptStripShort(d: string) {
  if (d === 'Microbiology') return 'Micro';
  if (d === 'Production') return 'Prod';
  if (d === 'Engineering') return 'Eng';
  if (d === 'Personnel') return 'Pers';
  if (d === 'NA') return 'NA';
  return d;
}

function ExpiryInlineRow({
  expired,
  near,
  noDate,
  onExpired,
  onNear,
  onNoDate,
}: {
  expired: number;
  near: number;
  noDate: number;
  onExpired?: () => void;
  onNear?: () => void;
  onNoDate?: () => void;
}) {
  const btn =
    'min-w-[1rem] rounded px-0.5 text-[10px] font-bold leading-none tabular-nums focus:outline-none focus:ring-1';
  const label = 'shrink-0 text-[10px] font-medium leading-none text-gray-500';
  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-x-1 px-1 py-0.5">
      <span className="flex shrink-0 items-center gap-x-0.5">
        <span className={label} title="Expired">
          Ex.
        </span>
        {(() => {
          const isZero = expired === 0;
          const cls = isZero
            ? 'text-gray-400 hover:bg-gray-100 focus:ring-gray-400'
            : 'text-red-600 hover:bg-red-50 focus:ring-red-400';
          return onExpired ? (
            <button
              type="button"
              onClick={onExpired}
              className={`${btn} cursor-pointer ${cls}`}
            >
              {expired}
            </button>
          ) : (
            <span className={`${btn} ${isZero ? 'text-gray-400' : 'text-red-600'}`}>{expired}</span>
          );
        })()}
      </span>
      <span className="flex shrink-0 items-center gap-x-0.5">
        <span className={label} title="Near expiry (≤ 30 days)">
          Near
        </span>
        {onNear ? (
          <button
            type="button"
            onClick={onNear}
            className={`${btn} cursor-pointer text-amber-600 hover:bg-amber-50 focus:ring-amber-400`}
          >
            {near}
          </button>
        ) : (
          <span className={`${btn} text-amber-600`}>{near}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-x-0.5">
        <span className={label} title="No expiry date">
          No Dt
        </span>
        {onNoDate ? (
          <button
            type="button"
            onClick={onNoDate}
            className={`${btn} cursor-pointer text-gray-800 hover:bg-gray-100 focus:ring-gray-400`}
          >
            {noDate}
          </button>
        ) : (
          <span className={`${btn} text-gray-800`}>{noDate}</span>
        )}
      </span>
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
  const short = deptStripShort;
  const visible = order;
  return (
    <div className="grid grid-cols-4 gap-x-1 gap-y-0.5">
      {visible.map((d) => (
        <span key={d} className="flex flex-col items-center gap-0.5 rounded-[4px] px-0.5 py-0.5">
          <span className="text-[8px] font-medium text-gray-500 leading-none whitespace-nowrap">{short(d)}</span>
          <span className="inline-flex shrink-0 flex-nowrap items-center gap-px rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm leading-none tabular-nums whitespace-nowrap">
            <button
              type="button"
              onClick={() => onSelectFound?.(d)}
              className={`min-w-[1rem] rounded px-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 ${onSelectFound ? 'cursor-pointer hover:bg-emerald-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-emerald-400' : ''}`}
            >
              {foundCounts?.[d] ?? 0}
            </button>
            <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
            {(() => {
              const v = missingCounts?.[d] ?? 0;
              const isZero = v === 0;
              const colorCls = isZero ? 'text-gray-400' : 'text-red-600';
              const hoverCls = isZero ? 'hover:bg-gray-100 focus:ring-gray-400' : 'hover:bg-red-50 focus:ring-red-400';
              return (
                <button
                  type="button"
                  onClick={() => onSelectMissing?.(d)}
                  className={`min-w-[1rem] rounded px-0.5 text-center text-[10px] font-bold leading-none ${colorCls} ${onSelectMissing ? `cursor-pointer ${hoverCls} focus:z-10 focus:outline-none focus:ring-1` : ''}`}
                >
                  {v}
                </button>
              );
            })()}
          </span>
        </span>
      ))}
    </div>
  );
}

const SummaryStripeContext = createContext<(() => number) | null>(null);

function SummaryTopics({ children }: { children: React.ReactNode }) {
  const stripeRef = useRef(-1);
  stripeRef.current = -1;
  const nextStripe = useCallback(() => {
    stripeRef.current += 1;
    return stripeRef.current;
  }, []);
  return (
    <SummaryStripeContext.Provider value={nextStripe}>
      <div className="flex min-w-0 flex-col gap-0">{children}</div>
    </SummaryStripeContext.Provider>
  );
}

function SummaryTopic({ children }: { children: React.ReactNode }) {
  const nextStripe = useContext(SummaryStripeContext);
  const stripe = nextStripe ? nextStripe() : 0;
  const bg = stripe % 2 === 0 ? 'bg-gray-100' : 'bg-white';
  return (
    <div className={`flex flex-col gap-0 rounded-sm px-0.5 py-0.5 ${bg}`}>{children}</div>
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
      className="flex w-full min-w-0 flex-col overflow-hidden rounded-[10px] bg-white px-2 py-1 text-left"
    >
      <div className="flex w-full items-center gap-1.5 pb-px">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
        <span className="min-w-0 flex-1 text-[11px] font-bold leading-tight text-gray-800 break-words">{title}</span>
      </div>
      <SummaryTopics>{children}</SummaryTopics>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 text-[10px] font-semibold leading-none text-gray-500">{children}</div>
  );
}

const mcqCompactPill =
  'inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/90 px-px tabular-nums';
const mcqCompactSep = 'select-none text-[9px] leading-none text-gray-300';
const mcqCompactBtn =
  'min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none transition-colors focus:outline-none focus:ring-1';

function McqCompactRow2({
  label,
  labelTitle,
  green,
  red,
  onGreen,
  onRed,
}: {
  label: string;
  labelTitle?: string;
  green: number;
  red: number;
  onGreen?: () => void;
  onRed?: () => void;
}) {
  return (
    <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5">
      <span className="min-w-0 truncate text-[10px] font-semibold leading-none text-gray-500" title={labelTitle ?? label}>
        {label}
      </span>
      <div className={mcqCompactPill}>
        <button type="button" onClick={onGreen} className={`${mcqCompactBtn} text-emerald-700 hover:bg-emerald-50 focus:ring-emerald-400`}>
          {green}
        </button>
        <span className={mcqCompactSep}>|</span>
        <button type="button" onClick={onRed} className={`${mcqCompactBtn} text-red-600 hover:bg-red-50 focus:ring-red-400`}>
          {red}
        </button>
      </div>
    </div>
  );
}

function McqCompactRow3({
  label,
  labelTitle,
  green,
  amber,
  red,
  onGreen,
  onAmber,
  onRed,
}: {
  label: string;
  labelTitle?: string;
  green: number;
  amber: number;
  red: number;
  onGreen?: () => void;
  onAmber?: () => void;
  onRed?: () => void;
}) {
  return (
    <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5">
      <span className="min-w-0 truncate text-[10px] font-semibold leading-none text-gray-500" title={labelTitle ?? label}>
        {label}
      </span>
      <div className={mcqCompactPill}>
        <button type="button" onClick={onGreen} className={`${mcqCompactBtn} text-emerald-700 hover:bg-emerald-50 focus:ring-emerald-400`}>
          {green}
        </button>
        <span className={mcqCompactSep}>|</span>
        <button type="button" onClick={onAmber} className={`${mcqCompactBtn} text-amber-600 hover:bg-amber-50 focus:ring-amber-400`}>
          {amber}
        </button>
        <span className={mcqCompactSep}>|</span>
        <button type="button" onClick={onRed} className={`${mcqCompactBtn} text-red-600 hover:bg-red-50 focus:ring-red-400`}>
          {red}
        </button>
      </div>
    </div>
  );
}

function McqCompactSlot2({
  tag,
  green,
  red,
  onGreen,
  onRed,
  greenTitle,
  redTitle,
}: {
  tag: string;
  green: number;
  red: number;
  onGreen?: () => void;
  onRed?: () => void;
  greenTitle?: string;
  redTitle?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-px">
      <span className="shrink-0 text-[10px] italic font-semibold leading-none text-gray-900">{tag}</span>
      <div className={mcqCompactPill}>
        <button type="button" title={greenTitle} onClick={onGreen} className={`${mcqCompactBtn} text-emerald-700 hover:bg-emerald-50 focus:ring-emerald-400`}>
          {green}
        </button>
        <span className={mcqCompactSep}>|</span>
        <button type="button" title={redTitle} onClick={onRed} className={`${mcqCompactBtn} text-red-600 hover:bg-red-50 focus:ring-red-400`}>
          {red}
        </button>
      </div>
    </div>
  );
}

function McqCompactSlot3({
  tag,
  green,
  amber,
  red,
  onGreen,
  onAmber,
  onRed,
  greenTitle,
  amberTitle,
  redTitle,
}: {
  tag: string;
  green: number;
  amber: number;
  red: number;
  onGreen?: () => void;
  onAmber?: () => void;
  onRed?: () => void;
  greenTitle?: string;
  amberTitle?: string;
  redTitle?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-px">
      <span className="shrink-0 text-[10px] italic font-semibold leading-none text-gray-900">{tag}</span>
      <div className={mcqCompactPill}>
        <button type="button" title={greenTitle} onClick={onGreen} className={`${mcqCompactBtn} text-emerald-700 hover:bg-emerald-50 focus:ring-emerald-400`}>
          {green}
        </button>
        <span className={mcqCompactSep}>|</span>
        <button type="button" title={amberTitle} onClick={onAmber} className={`${mcqCompactBtn} text-amber-600 hover:bg-amber-50 focus:ring-amber-400`}>
          {amber}
        </button>
        <span className={mcqCompactSep}>|</span>
        <button type="button" title={redTitle} onClick={onRed} className={`${mcqCompactBtn} text-red-600 hover:bg-red-50 focus:ring-red-400`}>
          {red}
        </button>
      </div>
    </div>
  );
}

function McqCompactSlots2({
  eng,
  guj,
}: {
  eng: { green: number; red: number; onGreen?: () => void; onRed?: () => void; greenTitle?: string; redTitle?: string };
  guj: { green: number; red: number; onGreen?: () => void; onRed?: () => void; greenTitle?: string; redTitle?: string };
}) {
  return (
    <div className="mt-px flex min-w-0 flex-nowrap items-center gap-x-2 opacity-80">
      <McqCompactSlot2 tag="E" {...eng} />
      <McqCompactSlot2 tag="G" {...guj} />
    </div>
  );
}

function McqCompactSlots3({
  eng,
  guj,
}: {
  eng: {
    green: number;
    amber: number;
    red: number;
    onGreen?: () => void;
    onAmber?: () => void;
    onRed?: () => void;
    greenTitle?: string;
    amberTitle?: string;
    redTitle?: string;
  };
  guj: {
    green: number;
    amber: number;
    red: number;
    onGreen?: () => void;
    onAmber?: () => void;
    onRed?: () => void;
    greenTitle?: string;
    amberTitle?: string;
    redTitle?: string;
  };
}) {
  return (
    <div className="mt-px flex min-w-0 flex-nowrap items-center gap-x-2 opacity-80">
      <McqCompactSlot3 tag="E" {...eng} />
      <McqCompactSlot3 tag="G" {...guj} />
    </div>
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
                        className={`border-b border-gray-50 hover:bg-gray-50 ${isFound
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

  const [department, setDepartment] = useState(defaultDept || 'QA');
  const [sopSearch, setSopSearch] = useState('');
  const [sopOptions, setSopOptions] = useState<SopOption[]>([]);
  const [selectedSop, setSelectedSop] = useState<SopOption | null>(null);
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [designations, setDesignations] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
                {DEFAULT_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
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
  const [error, setError] = useState('');

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

// Status badge for assign-SOP training requirement
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    not_required: 'bg-gray-100 text-gray-500',
  };
  const label: Record<string, string> = {
    pending: 'Training required',
    not_required: 'Not required',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[status] || 'bg-gray-100 text-gray-400'}`}>
      {label[status] || status}
    </span>
  );
}

type MasterEmployee = { name: string; designation: string; department: string };

// Step 2 of the assign flow — fill training data for each employee
function AssignSOPDataForm({
  sop,
  dept,
  uploadContext,
  onBack,
  onSuccess,
}: {
  sop: any;
  dept: string;
  uploadContext: { month: number; year: number; monthName: string } | null;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const currentMonth = uploadContext?.month ?? new Date().getMonth() + 1;
  const currentYear = uploadContext?.year ?? new Date().getFullYear();

  const [masterEmployees, setMasterEmployees] = useState<MasterEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const [expandedDesignations, setExpandedDesignations] = useState<Set<string>>(new Set());
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const empKey = (e: { department: string; name: string }) => `${e.department}::${e.name}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEmployeesLoading(true);
      try {
        const res = await fetch(`/api/employees`);
        const json = await res.json();
        if (cancelled) return;
        const emps: MasterEmployee[] = (json.employees || [])
          .filter((e: { name?: string; isActive?: boolean; department?: string }) => e.name && e.isActive !== false && e.department)
          .map((e: { name: string; designation?: string; department: string }) => ({
            name: e.name,
            designation: e.designation || 'Unassigned',
            department: e.department,
          }))
          .sort((a: MasterEmployee, b: MasterEmployee) =>
            a.department.localeCompare(b.department) || a.name.localeCompare(b.name),
          );
        setMasterEmployees(emps);
        // Pre-select employees in the SOP's target department only, by default
        const preselected = emps.filter((e) => e.department.toLowerCase() === dept.toLowerCase());
        setSelectedKeys(new Set(preselected.map(empKey)));
        const departments = Array.from(new Set(emps.map((e) => e.department)));
        // Expand the target department by default; collapse others
        setExpandedDepartments(new Set(
          departments.filter((d) => d.toLowerCase() === dept.toLowerCase()),
        ));
        setExpandedDesignations(new Set(emps.map((e) => `${e.department}::${e.designation}`)));
      } catch {
        if (!cancelled) {
          setMasterEmployees([]);
          setSelectedKeys(new Set());
          setExpandedDepartments(new Set());
          setExpandedDesignations(new Set());
        }
      } finally {
        if (!cancelled) setEmployeesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dept]);

  // Group: department → designation → employees
  const departmentGroups = useMemo(() => {
    const byDept = new Map<string, Map<string, MasterEmployee[]>>();
    for (const emp of masterEmployees) {
      if (!byDept.has(emp.department)) byDept.set(emp.department, new Map());
      const desigMap = byDept.get(emp.department)!;
      const desigKey = emp.designation || 'Unassigned';
      if (!desigMap.has(desigKey)) desigMap.set(desigKey, []);
      desigMap.get(desigKey)!.push(emp);
    }
    return Array.from(byDept.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([department, desigMap]) => ({
        department,
        designations: Array.from(desigMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([designation, emps]) => ({ designation, employees: emps })),
        employees: Array.from(desigMap.values()).flat(),
      }));
  }, [masterEmployees]);

  const toggleEmployee = (emp: MasterEmployee) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const k = empKey(emp);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const toggleDesignation = (department: string, designation: string) => {
    const group = departmentGroups.find((g) => g.department === department);
    const emps = group?.designations.find((d) => d.designation === designation)?.employees || [];
    const allSelected = emps.length > 0 && emps.every((e) => selectedKeys.has(empKey(e)));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allSelected) emps.forEach((e) => next.delete(empKey(e)));
      else emps.forEach((e) => next.add(empKey(e)));
      return next;
    });
  };

  const toggleDepartment = (department: string) => {
    const group = departmentGroups.find((g) => g.department === department);
    const emps = group?.employees || [];
    const allSelected = emps.length > 0 && emps.every((e) => selectedKeys.has(empKey(e)));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allSelected) emps.forEach((e) => next.delete(empKey(e)));
      else emps.forEach((e) => next.add(empKey(e)));
      return next;
    });
  };

  const toggleDepartmentExpand = (department: string) => {
    setExpandedDepartments((prev) => {
      const next = new Set(prev);
      if (next.has(department)) next.delete(department);
      else next.add(department);
      return next;
    });
  };

  const toggleDesignationExpand = (department: string, designation: string) => {
    const k = `${department}::${designation}`;
    setExpandedDesignations((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const selectedCount = selectedKeys.size;
  const selectedDepartmentCount = useMemo(() => {
    const set = new Set<string>();
    for (const k of selectedKeys) set.add(k.split('::')[0]);
    return set.size;
  }, [selectedKeys]);

  const handleSave = async () => {
    // Bucket selected employees by department
    const byDept = new Map<string, Array<{ name: string; designation: string; trainingStatus: string }>>();
    for (const emp of masterEmployees) {
      if (!selectedKeys.has(empKey(emp))) continue;
      if (!byDept.has(emp.department)) byDept.set(emp.department, []);
      byDept.get(emp.department)!.push({
        name: emp.name,
        designation: emp.designation,
        trainingStatus: 'pending',
      });
    }

    if (byDept.size === 0) { setError('Select at least one employee.'); return; }

    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(
        Array.from(byDept.entries()).map(async ([department, employees]) => {
          const res = await fetch('/api/training-matrix/assign-sop-to-matrix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              department,
              sopId: sop._id,
              month,
              year,
              employees,
              createdBy: 'admin',
            }),
          });
          const json = await res.json();
          return { department, ok: res.ok, error: json?.error };
        }),
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        setError(`Failed for: ${failed.map((f) => `${f.department} (${f.error || 'unknown'})`).join(', ')}`);
        setLoading(false);
        return;
      }
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
          <h2 className="font-bold text-gray-800">Assign <span className="font-mono text-purple-700">{sop.identifier}</span> to employees</h2>
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

      {/* Department → Designations → Employees */}
      <div className="flex-1 overflow-auto px-5 py-4">
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium text-gray-600">
            Select employees by department & designation
            {employeesLoading && <span className="ml-1 text-gray-400">— loading from employee master…</span>}
          </p>
          <span className="text-[11px] font-medium text-purple-700">
            {selectedCount} selected · {selectedDepartmentCount} dept{selectedDepartmentCount === 1 ? '' : 's'}
          </span>
        </div>

        {employeesLoading ? (
          <p className="py-6 text-center text-xs text-gray-400">Loading employees from master…</p>
        ) : masterEmployees.length === 0 ? (
          <p className="mt-2 text-xs text-amber-700">
            No employees found in the master. Add them on the{' '}
            <a href="/employees" className="font-medium underline" target="_blank" rel="noreferrer">Employees</a> page.
          </p>
        ) : (
          <div className="space-y-3">
            {departmentGroups.map((dg) => {
              const deptSelectedCount = dg.employees.filter((e) => selectedKeys.has(empKey(e))).length;
              const deptAllSelected = deptSelectedCount === dg.employees.length;
              const deptSomeSelected = deptSelectedCount > 0 && !deptAllSelected;
              const deptExpanded = expandedDepartments.has(dg.department);
              const isTargetDept = dg.department.toLowerCase() === dept.toLowerCase();
              return (
                <div key={dg.department} className="overflow-hidden rounded-lg border border-gray-200">
                  {/* Department header */}
                  <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${isTargetDept ? 'bg-purple-50 border-purple-100' : 'bg-gray-50 border-gray-100'}`}>
                    <input
                      type="checkbox"
                      checked={deptAllSelected}
                      ref={(el) => { if (el) el.indeterminate = deptSomeSelected; }}
                      onChange={() => toggleDepartment(dg.department)}
                      className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => toggleDepartmentExpand(dg.department)}
                      className="flex items-center gap-1.5 text-sm font-bold text-gray-800 hover:text-purple-700"
                    >
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${deptExpanded ? 'rotate-90' : ''}`} />
                      {dg.department}
                      {isTargetDept && (
                        <span className="rounded-full bg-purple-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-800">
                          target
                        </span>
                      )}
                    </button>
                    <span className="ml-auto text-[11px] text-gray-500">
                      {deptSelectedCount}/{dg.employees.length} · {dg.designations.length} designation{dg.designations.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {/* Designations */}
                  {deptExpanded && (
                    <div className="divide-y divide-gray-100">
                      {dg.designations.map(({ designation, employees }) => {
                        const selInGroup = employees.filter((e) => selectedKeys.has(empKey(e))).length;
                        const allSel = selInGroup === employees.length;
                        const someSel = selInGroup > 0 && !allSel;
                        const desigKey = `${dg.department}::${designation}`;
                        const desigExpanded = expandedDesignations.has(desigKey);
                        return (
                          <div key={designation}>
                            <div className="flex items-center gap-2 bg-white px-4 py-2 pl-6">
                              <input
                                type="checkbox"
                                checked={allSel}
                                ref={(el) => { if (el) el.indeterminate = someSel; }}
                                onChange={() => toggleDesignation(dg.department, designation)}
                                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                              />
                              <button
                                type="button"
                                onClick={() => toggleDesignationExpand(dg.department, designation)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-purple-700"
                              >
                                <ChevronRight className={`h-3 w-3 transition-transform ${desigExpanded ? 'rotate-90' : ''}`} />
                                {designation}
                              </button>
                              <span className="text-[11px] text-gray-500">
                                ({selInGroup}/{employees.length})
                              </span>
                            </div>

                            {desigExpanded && (
                              <div className="bg-gray-50/50 py-1">
                                {employees.map((emp) => (
                                  <label
                                    key={empKey(emp)}
                                    className="flex items-center gap-2 pl-16 pr-4 py-1.5 cursor-pointer hover:bg-purple-50/60"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedKeys.has(empKey(emp))}
                                      onChange={() => toggleEmployee(emp)}
                                      className="h-3.5 w-3.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                    <span className="text-xs text-gray-700">{emp.name}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
          <strong>Note:</strong> Selected employees will be added to their respective department training matrices with status <em>Training required</em>. SOP master data (ID, name) is read-only and comes from the central SOP database.
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <button onClick={onBack} className="rounded-lg border px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Back</button>
        <button
          onClick={handleSave}
          disabled={loading || employeesLoading || selectedCount === 0}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-purple-700 disabled:opacity-50"
        >
          <CheckCircle className="h-3.5 w-3.5" /> {loading ? 'Saving…' : `Add to Matrix (${selectedCount} employee${selectedCount === 1 ? '' : 's'} · ${selectedDepartmentCount} dept${selectedDepartmentCount === 1 ? '' : 's'})`}
        </button>
      </div>
    </div>
  );
}

// Main Manage SOPs Modal — shows unassigned SOPs, drives the 2-step assign flow
function ManageMatrixSOPsModal({
  defaultDept,
  departments,
  onClose,
  onRefresh,
}: {
  defaultDept?: string;
  departments?: string[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const deptOptions = departments?.length ? departments : [...DEFAULT_DEPARTMENTS];
  const [dept, setDept] = useState(
    defaultDept && deptOptions.includes(defaultDept) ? defaultDept : (deptOptions[0] || 'QA')
  );
  const [search, setSearch] = useState('');
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [uploadContext, setUploadContext] = useState<{ month: number; year: number; monthName: string } | null>(null);
  const [loading, setLoading] = useState(false);
  // Step: 'list' | 'form'
  const [step, setStep] = useState<'list' | 'form'>('list');
  const [selectedSop, setSelectedSop] = useState<any | null>(null);
  const [saved, setSaved] = useState<string[]>([]); // sopCodes successfully assigned this session

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/training-matrix/unassigned-sops?department=${encodeURIComponent(dept)}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      setUnassigned(json.unassigned || []);
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
            {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
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
  const departments = useMemo(
    () => (data?.departments?.length ? data.departments : [...DEFAULT_DEPARTMENTS]),
    [data]
  );
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showManageSOPs, setShowManageSOPs] = useState(false);
  const [activeDept, setActiveDept] = useState<ActiveDept>('All');
  const [activeMonth, setActiveMonth] = useState<ActiveMonth>('All');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<MatrixViewMode>('sop'); // default: SOP-wise
  const [groupBy, setGroupBy] = useState<GroupByMode>('department');
  const [sopSortField, setSopSortField] = useState<'sopCode' | 'title' | 'dept' | 'dbDept' | 'month' | 'expiry' | 'trainer' | 'applicable' | 'mcq_eng' | 'mcq_guj' | 'mcq_eng_approved' | 'mcq_guj_approved'>('dept');
  const [sopSortDir, setSopSortDir] = useState<'asc' | 'desc'>('asc');
  const [falsyIgnoredKeys, setFalsyIgnoredKeys] = useState<Set<string>>(loadFalsyIgnoredKeys);
  const [falsyPanelExpanded, setFalsyPanelExpanded] = useState(false);
  const [falsyDismissedExpanded, setFalsyDismissedExpanded] = useState(false);
  const [capsuleSopFilter, setCapsuleSopFilter] = useState<null | {
    title: string;
    dept: ActiveDept;
    sopCodes: Set<string>;
    // Optional: for repeat-type filters, store per-SOP dept breakdown for the banner
    repeatMeta?: Array<{ sopCode: string; count: number; depts: string[] }>;
    // Excel-dept-split: one row per Excel upload occurrence (matches green badge counts)
    excelOccurrenceMeta?: Array<{ sopCode: string; uploadDept: string }>;
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
  const [empModalFilter, setEmpModalFilter] = useState<'all' | 'due' | 'assigned'>('all');
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
    const CACHE_KEY = 'training_matrix_overview_cache_v3';
    const FRESH_TTL_MS = 5 * 60 * 1000;

    // Tier 1: localStorage — show any cached data immediately (even if stale), then revalidate.
    // localStorage persists across reloads and new tabs, unlike sessionStorage.
    let hasShownCached = false;
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const { payload, cachedAt } = JSON.parse(raw);
          if (payload?.success && overviewHasTrainerBuckets(payload as OverviewData)) {
            setData(payload as OverviewData);
            setLoading(false);
            hasShownCached = true;
            if (Date.now() - cachedAt <= FRESH_TTL_MS) {
              return; // Fresh — skip network entirely, Redis still warm server-side
            }
            // Stale — fall through to background revalidate without showing spinner
          }
        }
      } catch { /* ignore malformed cache */ }
    }

    // Tier 2: Network fetch. Only show spinner when there is nothing cached to display.
    // On a cache miss the server will serve from Upstash Redis (5 min TTL) if warm.
    if (!hasShownCached) setLoading(true);
    try {
      const url = forceRefresh
        ? '/api/training-matrix/overview?refresh=1'
        : '/api/training-matrix/overview';
      const res = await fetch(url); // no cache: 'no-store' — let browser respect Cache-Control header
      const json = await res.json();
      if (json.success) {
        setData(json as OverviewData);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ payload: json, cachedAt: Date.now() }));
        } catch { /* storage quota — ignore */ }
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
    const depts: Dept[] = activeDept === 'All' ? [...departments] : [activeDept];
    const codes = new Set<string>();
    const monthOf: Record<string, string> = {};
    for (const d of depts) {
      const dSopCodes = data.sopCodesByDept?.[d] || [];
      const dMonthMap = data.sopMonthMapByDept?.[d] || {};
      for (const c of dSopCodes) {
        const sopMonth = monthForCode(dMonthMap, c);
        if (activeMonth === 'All' || sopMonth === activeMonth) {
          codes.add(c);
          monthOf[c] = sopMonth;
        }
      }
    }
    return [...codes].sort((a, b) => a.localeCompare(b)).map((c) => ({ code: c, month: monthOf[c] }));
  }, [data, activeDept, activeMonth]);

  const visibleEmployees = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    const depts: Dept[] = activeDept === 'All' ? [...departments] : [activeDept];
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

  // Lookup map: stripped SOP code → DB-owning department, derived from totalCard.dbSopsByDept.
  const dbDeptBySopCode = useMemo(() => {
    const m = new Map<string, string>();
    const byDept = (data?.totalCard?.dbSopsByDept || {}) as Record<string, Array<{ sopCode: string }>>;
    for (const [d, list] of Object.entries(byDept)) {
      for (const item of list) {
        const key = stripVersion(String(item.sopCode || '')).toUpperCase();
        if (key && !m.has(key)) m.set(key, d);
      }
    }
    return m;
  }, [data]);

  // Month counts for the Total card — always sum all departments (never changes when a dept is selected).
  const totalMonthCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of MONTHS) counts[m] = 0;
    if (!data) return counts;
    for (const d of departments) {
      const m = data.monthCountsByDept?.[d] || {};
      for (const month of MONTHS) counts[month] = (counts[month] || 0) + (m[month] || 0);
    }
    return counts;
  }, [data]);

  // Month-level SOP counts for filter capsules (driven by active dept selection).
  const monthCountsForGrid = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of MONTHS) counts[m] = 0;
    if (!data) return counts;
    if (activeDept !== 'All') {
      const m = data.monthCountsByDept?.[activeDept] || {};
      for (const month of MONTHS) counts[month] = m[month] || 0;
    } else {
      for (const d of departments) {
        const m = data.monthCountsByDept?.[d] || {};
        for (const month of MONTHS) counts[month] = (counts[month] || 0) + (m[month] || 0);
      }
    }
    return counts;
  }, [data, activeDept]);

  const totalUniqueSops = useMemo(() => {
    if (!data) return 0;
    const depts: Dept[] = activeDept === 'All' ? [...departments] : [activeDept];
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
      status?: 'all_db' | 'expired' | 'okay' | 'okay_not_near' | 'no_date' | 'due_soon_30' | 'due_soon_30_mcq_reviewed' | 'due_soon_30_mcq_partial' | 'due_soon_30_mcq_not_reviewed' | 'mcq_created' | 'mcq_not_created' | 'mcq_all_approved' | 'mcq_partially_approved' | 'mcq_not_approved' | 'mcq_eng_created' | 'mcq_eng_not_created' | 'mcq_eng_all_approved' | 'mcq_eng_partially_approved' | 'mcq_eng_not_approved' | 'mcq_guj_created' | 'mcq_guj_not_created' | 'mcq_guj_all_approved' | 'mcq_guj_partially_approved' | 'mcq_guj_not_approved' | 'mcq_eng_only_created' | 'mcq_eng_only_not_created' | 'mcq_dual_eng_created' | 'mcq_dual_eng_not_created' | 'mcq_dual_guj_created' | 'mcq_dual_guj_not_created' | 'mcq_dual_both_created' | 'mcq_dual_either_incomplete' | 'mcq_approved_nondual' | 'mcq_approval_partial_nondual' | 'mcq_approval_missing_nondual' | 'mcq_approved_dual' | 'mcq_approval_partial_dual' | 'mcq_approval_missing_dual' | 'mcq_dual_slot_eng_all_approved' | 'mcq_dual_slot_eng_partially_approved' | 'mcq_dual_slot_eng_not_approved' | 'mcq_dual_slot_guj_all_approved' | 'mcq_dual_slot_guj_partially_approved' | 'mcq_dual_slot_guj_not_approved' | 'sop_0_trainer' | 'sop_1_trainer' | 'sop_2plus_trainer';
    }) => {
      setViewMode('sop');
      setGroupBy('department');
      setActiveMonth('All');
      setSearch('');
      setActiveDept(opts.type !== 'found_any' && opts.dbDept && opts.dbDept !== 'All' ? opts.dbDept as ActiveDept : opts.dept);

      if (data) {
        let codes: string[] = [];
        const deptsToCheck = opts.dept === 'All' ? departments : [opts.dept];

        // Fast-path for language-based DB total filter (ENG / GUJ buttons)
        if (opts.lang && opts.type === 'db') {
          for (const d of deptsToCheck) {
            const deptData = data.perDept?.[d] as any;
            if (!deptData) continue;
            const list: string[] = deptData.langSopListByKey?.[opts.lang] || [];
            codes.push(...list);
          }
          setCapsuleSopFilter({
            title: opts.title,
            dept: opts.dept,
            sopCodes: new Set(codes.map((c) => stripVersion(c))),
          });
          setTimeout(() => {
            tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 80);
          return;
        }

        if (opts.status) {
          // all_db: every DB SOP regardless of Excel upload, scoped by dept if not 'All'
          if (opts.status === 'all_db') {
            const dbByDept = (data.totalCard as any)?.dbSopsByDept || {};
            const deptsForDb = opts.dept === 'All' ? Object.keys(dbByDept) : [opts.dept];
            const allDbCodes = deptsForDb.flatMap((d) => ((dbByDept[d] || []) as any[]).map((x: any) => stripVersion(x.sopCode)));
            codes = Array.from(new Set(allDbCodes));
          } else {
            // Use the exact pre-computed lists that match the backend counts
            for (const d of deptsToCheck) {
              const deptData = data.perDept?.[d] as any;
              if (!deptData) continue;
              let list: string[] = [];
              if (opts.status === 'expired') list = deptData.expiredList || [];
              else if (opts.status === 'okay') list = deptData.okayList || [];
              else if (opts.status === 'okay_not_near') {
                const nearSet = new Set(deptData.dueSoon30List || []);
                list = (deptData.okayList || []).filter((c: string) => !nearSet.has(c));
              } else if (opts.status === 'no_date') {
                list = (deptData.okayList || []).filter((c: string) => !data.sopStatusByCode?.[c]?.targetDate && !data.sopStatusByCode?.[stripVersion(c)]?.targetDate);
              } else if (opts.status === 'due_soon_30') list = deptData.dueSoon30List || [];
              else if (opts.status === 'due_soon_30_mcq_reviewed') list = deptData.dueSoon30McqReviewedList || [];
              else if (opts.status === 'due_soon_30_mcq_partial') list = deptData.dueSoon30McqPartialList || [];
              else if (opts.status === 'due_soon_30_mcq_not_reviewed') list = deptData.dueSoon30McqNotReviewedList || [];
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
              else if (opts.status === 'mcq_eng_only_created') list = deptData.mcqEngOnlyCreatedList || [];
              else if (opts.status === 'mcq_eng_only_not_created') list = deptData.mcqEngOnlyNotCreatedList || [];
              else if (opts.status === 'mcq_dual_eng_created') list = deptData.mcqDualEngCreatedList || [];
              else if (opts.status === 'mcq_dual_eng_not_created') list = deptData.mcqDualEngNotCreatedList || [];
              else if (opts.status === 'mcq_dual_guj_created') list = deptData.mcqDualGujCreatedList || [];
              else if (opts.status === 'mcq_dual_guj_not_created') list = deptData.mcqDualGujNotCreatedList || [];
              else if (opts.status === 'mcq_dual_both_created') list = deptData.mcqDualBothCreatedList || [];
              else if (opts.status === 'mcq_dual_either_incomplete') list = deptData.mcqDualEitherIncompleteList || [];
              // SOP-based approval — Non-Dual + Dual sub-buckets
              else if (opts.status === 'mcq_approved_nondual') list = deptData.mcqApprovedNonDualList || [];
              else if (opts.status === 'mcq_approval_partial_nondual') list = deptData.mcqApprovalPartialNonDualList || [];
              else if (opts.status === 'mcq_approval_missing_nondual') list = deptData.mcqApprovalMissingNonDualList || [];
              else if (opts.status === 'mcq_approved_dual') list = deptData.mcqApprovedDualList || [];
              else if (opts.status === 'mcq_approval_partial_dual') list = deptData.mcqApprovalPartialDualList || [];
              else if (opts.status === 'mcq_approval_missing_dual') list = deptData.mcqApprovalMissingDualList || [];
              // Dual-Found per-language slot approval (display only)
              else if (opts.status === 'mcq_dual_slot_eng_all_approved') list = deptData.mcqDualSlotEngAllApprovedList || [];
              else if (opts.status === 'mcq_dual_slot_eng_partially_approved') list = deptData.mcqDualSlotEngPartiallyApprovedList || [];
              else if (opts.status === 'mcq_dual_slot_eng_not_approved') list = deptData.mcqDualSlotEngNotApprovedList || [];
              else if (opts.status === 'mcq_dual_slot_guj_all_approved') list = deptData.mcqDualSlotGujAllApprovedList || [];
              else if (opts.status === 'mcq_dual_slot_guj_partially_approved') list = deptData.mcqDualSlotGujPartiallyApprovedList || [];
              else if (opts.status === 'mcq_dual_slot_guj_not_approved') list = deptData.mcqDualSlotGujNotApprovedList || [];
              else if (opts.status === 'sop_0_trainer') list = deptData.sop0TrainerList || [];
              else if (opts.status === 'sop_1_trainer') list = deptData.sop1TrainerList || [];
              else if (opts.status === 'sop_2plus_trainer') list = deptData.sop2PlusTrainerList || [];
              codes.push(...list);
            }
          }
        } else if (opts.type === 'found' || opts.type === 'excel' || opts.type === 'found_any') {
          // Match API dbBaseSet.has(c) — includes SOPs whose DB owner is outside known depts.
          const allDbCodes =
            opts.type === 'found_any'
              ? new Set(Object.keys(data.sopStatusByCode || {}).map((c) => stripVersion(c)))
              : null;

          // Excel-dept-split counts each Excel row per upload; preserve occurrences for the table.
          if (opts.type === 'found_any') {
            const occurrences: Array<{ sopCode: string; uploadDept: string }> = [];
            for (const d of deptsToCheck) {
              const deptData = data.perDept?.[d] as any;
              if (!deptData?.uploaded) continue;
              for (const c of deptData.sopCodes || []) {
                const base = stripVersion(c);
                if (!allDbCodes!.has(base)) continue;
                if (opts.dbDept && opts.dbDept !== 'All') {
                  const targetDbCodes = new Set(
                    ((data.totalCard as any)?.dbSopsByDept?.[opts.dbDept] || []).map((x: any) =>
                      stripVersion(x.sopCode),
                    ),
                  );
                  if (!targetDbCodes.has(base)) continue;
                }
                occurrences.push({ sopCode: base, uploadDept: d });
              }
            }
            setCapsuleSopFilter({
              title: opts.title,
              dept: opts.dept,
              sopCodes: new Set(occurrences.map((o) => o.sopCode)),
              excelOccurrenceMeta: occurrences,
            });
            setTimeout(() => {
              tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
            return;
          }

          for (const d of deptsToCheck) {
            const deptData = data.perDept?.[d] as any;
            if (!deptData?.uploaded) continue;
            // 'found' = Excel SOPs that are also in DB.
            // When a cross-dept DeptStrip cell is clicked (dbDept set), the user wants
            // *this card's* Excel SOPs whose DB owner is dbDept. foundInDbList only
            // contains SOPs whose DB owner == this card's dept, so it would always
            // intersect to 0 for any other dbDept. Start from full sopCodes instead.
            let list: string[] =
              opts.dbDept && opts.dbDept !== 'All'
                ? (deptData.sopCodes || [])
                : (deptData.foundInDbList || deptData.sopCodes || []);

            if (opts.dbDept && opts.dbDept !== 'All') {
              const targetDbCodes = new Set(
                ((data.totalCard as any)?.dbSopsByDept?.[opts.dbDept] || []).map((x: any) =>
                  stripVersion(x.sopCode),
                ),
              );
              list = list.filter((c: string) => targetDbCodes.has(stripVersion(c)));
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
        setTimeout(() => {
          tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
        return;
      }
    },
    [data],
  );

  const clearCapsuleFilter = useCallback(() => {
    setCapsuleSopFilter(null);
  }, []);

  const filterAndScroll = useCallback((dept: ActiveDept) => {
    setCapsuleSopFilter(null);
    setViewMode('sop');
    setGroupBy('department');
    setActiveMonth('All');
    setSearch('');
    setActiveDept(dept);
    setTimeout(() => {
      tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  const openEmployeeListPopup = useCallback(
    (dept: ActiveDept, filter: EmployeeListFilter, title: string) => {
      if (!data) return;
      const depts: Dept[] = dept === 'All' ? [...departments] : [dept as Dept];
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

  const openEmployeeModal = useCallback(
    (name: string, departmentHint?: string) => {
      if (!data) return;
      const lookupDepts: Dept[] =
        departmentHint && departmentHint !== 'All' ? [departmentHint as Dept] : [...departments];
      let empRow: { name: string; designation?: string; training?: Record<string, boolean> } | undefined;
      let empDept = departmentHint && departmentHint !== 'All' ? departmentHint : '';
      for (const d of lookupDepts) {
        const found = data.perDept?.[d]?.employees?.find((e: any) => e.name === name);
        if (found) {
          empRow = found;
          empDept = d;
          break;
        }
      }
      const monthMap = (data.sopMonthMapByDept as any)?.[empDept] || {};
      const employeeSops: Array<{ sopCode: string; month: string; symbol: '√' | 'X' | 'NA' }> = [];
      if (empRow) {
        for (const [code, v] of Object.entries(empRow.training || {})) {
          employeeSops.push({ sopCode: code, month: monthForCode(monthMap, code), symbol: v ? '√' : 'X' });
        }
        employeeSops.sort((a, b) => a.sopCode.localeCompare(b.sopCode));
      }
      setEmpModalSearch('');
      setEmpModalFilter('all');
      setEmpModalSort({ field: 'code', dir: 'asc' });
      setDetailModal({
        kind: 'employee',
        title: name,
        subtitle: `${empDept}${empRow?.designation ? ` · ${empRow.designation}` : ''}`,
        employeeName: name,
        employeeSops,
      });
    },
    [data, departments],
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
        const depts = departments.filter((d) =>
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
    const depts: Dept[] = activeDept === 'All' ? [...departments] : [activeDept];

    // Build a global trainer map across ALL depts so DB-only SOPs also show their trainer
    const globalTrainerMap: Record<string, string> = {};
    for (const d of departments) {
      const tb = (data.perDept?.[d] as any)?.trainerBySopCode || {};
      for (const [code, name] of Object.entries(tb)) {
        if (name && !globalTrainerMap[code]) globalTrainerMap[code] = name as string;
      }
    }

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

    // Excel-dept-split filter: one table row per Excel upload occurrence
    if (capsuleSopFilter?.excelOccurrenceMeta) {
      const meta =
        activeDept === 'All'
          ? capsuleSopFilter.excelOccurrenceMeta
          : capsuleSopFilter.excelOccurrenceMeta.filter((o) => o.uploadDept === activeDept);
      const sops = meta
        .map(({ sopCode, uploadDept }) => {
          const dept = uploadDept as Dept;
          const monthMap = data.sopMonthMapByDept?.[dept] || {};
          const status = data.sopStatusByCode?.[sopCode];
          const upper = sopCode.toUpperCase();
          const dualInfo = dualMap.get(upper);
          let completed = 0,
            pending = 0;
          const completedEmployees: string[] = [];
          const pendingEmployees: string[] = [];
          for (const emp of data.perDept?.[dept]?.employees || []) {
            const name = emp.name || '';
            if (
              term &&
              !(
                name.toLowerCase().includes(term) ||
                sopCode.toLowerCase().includes(term) ||
                (monthForCode(monthMap, sopCode) || '').toLowerCase().includes(term)
              )
            )
              continue;
            if (!(sopCode in (emp.training || {}))) continue;
            if (emp.training[sopCode]) {
              completed++;
              completedEmployees.push(name);
            } else {
              pending++;
              pendingEmployees.push(name);
            }
          }
          const totalApplicable = completed + pending;
          const completionPct = totalApplicable ? Math.round((completed / totalApplicable) * 100) : 0;
          return {
            sopCode,
            primaryDept: dept,
            title: (() => {
              const t = titleMap.get(upper) || (status as any)?.title || '';
              return t.toUpperCase() === upper ? '' : t;
            })(),
            isDualLanguage: dualInfo?.isDualLanguage || false,
            gujaratiName: dualInfo?.gujaratiName || '',
            month: monthForCode(monthMap, sopCode) || '',
            trainer: globalTrainerMap[sopCode] || (data.perDept?.[dept]?.trainerBySopCode || {})[sopCode] || '',
            completed,
            pending,
            totalApplicable,
            completionPct,
            pendingEmployees,
            completedEmployees,
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
          if (activeMonth !== 'All' && r.month !== activeMonth) return false;
          if (!term) return true;
          return (
            r.sopCode.toLowerCase().includes(term) ||
            (r.month || '').toLowerCase().includes(term) ||
            r.pendingEmployees.length > 0 ||
            r.completedEmployees.length > 0
          );
        })
        .sort((a, b) => a.sopCode.localeCompare(b.sopCode) || a.primaryDept.localeCompare(b.primaryDept));
      return sops.length > 0 ? [{ department: activeDept === 'All' ? 'All' : activeDept, sops }] : [];
    }

    // Repeat filter: build one deduplicated SOP per entry using its primary dept
    if (capsuleSopFilter?.repeatMeta) {
      const seen = new Set<string>();
      const sops = capsuleSopFilter.repeatMeta
        .filter(({ sopCode }) => {
          const key = sopCode.toUpperCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(({ sopCode, depts: sopDepts }) => {
          const primaryDept = (sopDepts[0] as Dept) || depts[0];
          const monthMap = data.sopMonthMapByDept?.[primaryDept] || {};
          const status = data.sopStatusByCode?.[sopCode];
          const upper = sopCode.toUpperCase();
          const dualInfo = dualMap.get(upper);
          // Aggregate employee stats across all depts that share this SOP
          let completed = 0, pending = 0;
          const completedEmployees: string[] = [];
          const pendingEmployees: string[] = [];
          for (const d of sopDepts as Dept[]) {
            for (const emp of data.perDept?.[d]?.employees || []) {
              if (!(sopCode in (emp.training || {}))) continue;
              if (emp.training[sopCode]) { completed++; completedEmployees.push(emp.name); }
              else { pending++; pendingEmployees.push(emp.name); }
            }
          }
          const totalApplicable = completed + pending;
          const completionPct = totalApplicable ? Math.round((completed / totalApplicable) * 100) : 0;
          return {
            sopCode,
            title: (() => { const t = titleMap.get(upper) || (status as any)?.title || ''; return t.toUpperCase() === upper ? '' : t; })(),
            isDualLanguage: dualInfo?.isDualLanguage || false,
            gujaratiName: dualInfo?.gujaratiName || '',
            month: monthForCode(monthMap, sopCode) || '',
            trainer: globalTrainerMap[sopCode] || (data.perDept?.[primaryDept]?.trainerBySopCode || {})[sopCode] || '',
            completed, pending, totalApplicable, completionPct, pendingEmployees, completedEmployees,
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
          if (activeMonth !== 'All' && r.month !== activeMonth) return false;
          if (!term) return true;
          return r.sopCode.toLowerCase().includes(term) || r.pendingEmployees.length > 0 || r.completedEmployees.length > 0;
        })
        .sort((a, b) => a.sopCode.localeCompare(b.sopCode));
      return sops.length > 0 ? [{ department: depts[0] || 'All', sops }] : [];
    }

    // When a capsule filter is active across all departments, deduplicate SOPs and
    // aggregate employee training data across every department the SOP appears in.
    if (capsuleSopFilter && activeDept === 'All' && !capsuleSopFilter.excelOccurrenceMeta) {
      const allFilteredCodes = Array.from(capsuleSopFilter.sopCodes).sort((a, b) => a.localeCompare(b));

      const sops = allFilteredCodes
        .map((sopCode) => {
          const status = data.sopStatusByCode?.[sopCode];
          const upper = sopCode.toUpperCase();
          const dualInfo = dualMap.get(upper);
          // Find the primary department this SOP actually belongs to
          const primaryDept = departments.find((d) =>
            (data.sopCodesByDept?.[d] || []).some((c: string) => stripVersion(c).toUpperCase() === upper) ||
            ((data.totalCard as any)?.dbSopsByDept?.[d] || []).some((x: any) => stripVersion(x.sopCode).toUpperCase() === upper)
          ) || '';
          // Aggregate employee stats across ALL depts
          let completed = 0, pending = 0;
          const completedEmployees: string[] = [];
          const pendingEmployees: string[] = [];
          let month = '';
          let trainer = globalTrainerMap[sopCode] || '';
          for (const dept of depts) {
            if (!month) month = monthForCode(data.sopMonthMapByDept?.[dept] || {}, sopCode);
            if (!trainer) trainer = (data.perDept?.[dept]?.trainerBySopCode || {})[sopCode] || '';
            for (const emp of data.perDept?.[dept]?.employees || []) {
              const name = emp.name || '';
              if (term && !(name.toLowerCase().includes(term) || sopCode.toLowerCase().includes(term) || (month || '').toLowerCase().includes(term))) continue;
              if (!(sopCode in (emp.training || {}))) continue;
              if (emp.training[sopCode]) { completed++; completedEmployees.push(name); }
              else { pending++; pendingEmployees.push(name); }
            }
          }
          const totalApplicable = completed + pending;
          const completionPct = totalApplicable ? Math.round((completed / totalApplicable) * 100) : 0;
          return {
            sopCode,
            primaryDept,
            title: (() => { const t = titleMap.get(upper) || (status as any)?.title || ''; return t.toUpperCase() === upper ? '' : t; })(),
            isDualLanguage: dualInfo?.isDualLanguage || false,
            gujaratiName: dualInfo?.gujaratiName || '',
            month,
            trainer,
            completed,
            pending,
            totalApplicable,
            completionPct,
            pendingEmployees,
            completedEmployees,
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
          if (activeMonth !== 'All' && r.month !== activeMonth) return false;
          if (!term) return true;
          return r.sopCode.toLowerCase().includes(term) || (r.month || '').toLowerCase().includes(term) || r.pendingEmployees.length > 0 || r.completedEmployees.length > 0;
        });

      return sops.length > 0 ? [{ department: 'All', sops }] : [];
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
      const trainerMap: Record<string, string> = { ...globalTrainerMap, ...(data.perDept?.[dept]?.trainerBySopCode || {}) };

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
            month: monthForCode(monthMap, sopCode) || '',
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
          if (activeMonth !== 'All' && r.month !== activeMonth) return false;
          if (!term) return true;
          // keep if sop matches month/code search too
          return r.sopCode.toLowerCase().includes(term) || (r.month || '').toLowerCase().includes(term) || r.pendingEmployees.length > 0 || r.completedEmployees.length > 0;
        })
        .sort((a, b) => a.sopCode.localeCompare(b.sopCode));

      out.push({ department: dept, sops });
    }

    return out.filter((g) => g.sops.length > 0);
  }, [data, activeDept, activeMonth, search, capsuleSopFilter]);

  const falsySopRows = useMemo((): FalsySopRow[] => {
    const rows: FalsySopRow[] = [];
    for (const g of sopWiseGroups) {
      for (const s of g.sops) {
        const title = (s as { title?: string }).title;
        if (hasSopTitle(title)) continue;
        const dept =
          g.department !== 'All'
            ? g.department
            : ((s as { primaryDept?: string }).primaryDept || g.department);
        rows.push({
          key: `${dept}|${s.sopCode}`,
          sopCode: s.sopCode,
          dept,
          month: s.month || '',
          trainer: (s as { trainer?: string }).trainer || '',
          completed: s.completed,
          pending: s.pending,
          totalApplicable: s.totalApplicable,
          completionPct: s.completionPct,
        });
      }
    }
    return rows.sort((a, b) => a.sopCode.localeCompare(b.sopCode));
  }, [sopWiseGroups]);

  const pendingFalsyRows = useMemo(
    () => falsySopRows.filter((r) => !falsyIgnoredKeys.has(r.key)),
    [falsySopRows, falsyIgnoredKeys]
  );
  const ignoredFalsyRows = useMemo(
    () => falsySopRows.filter((r) => falsyIgnoredKeys.has(r.key)),
    [falsySopRows, falsyIgnoredKeys]
  );

  const ignoreAllFalsy = useCallback(() => {
    const keysToIgnore = pendingFalsyRows.map((r) => r.key);
    setFalsyIgnoredKeys((prev) => {
      const next = new Set(prev);
      for (const k of keysToIgnore) next.add(k);
      try {
        localStorage.setItem(FALSY_IGNORED_STORAGE, JSON.stringify([...next]));
      } catch {
        /* storage quota */
      }
      return next;
    });
    setFalsyPanelExpanded(false);
    setFalsyDismissedExpanded(false);
    setTimeout(() => {
      document.getElementById('falsy-sop-data-ignored')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }, [pendingFalsyRows]);

  const renderTotalCard = (t: TotalCardData) => {
    const trainerBuckets = resolveTrainerBucketCounts(t);
    const TotalIcon = DEPT_ICON.Total;

    // Prefer the authoritative global lang breakdown from the API (covers all DB SOPs regardless of dept).
    // Fall back to aggregating per-dept breakdowns for backward-compat with cached responses.
    const totalLangBreakdown = (() => {
      if (t.langBreakdown && t.langBreakdown.length > 0) {
        return t.langBreakdown.slice().sort((a, b) => (a.key === b.key ? 0 : a.key === 'ENG' ? -1 : 1));
      }
      const map = new Map<string, { found: number; missing: number }>();
      for (const dept of departments) {
        const deptData = data?.perDept?.[dept] as any;
        if (!deptData?.uploaded) continue;
        for (const lr of (deptData.langBreakdown || []) as Array<{ key: string; label: string; found: number; missing: number }>) {
          const existing = map.get(lr.key) || { found: 0, missing: 0 };
          map.set(lr.key, { found: existing.found + lr.found, missing: existing.missing + lr.missing });
        }
      }
      return Array.from(map.entries())
        .sort(([a], [b]) => (a === b ? 0 : a === 'ENG' ? -1 : 1))
        .map(([key, v]) => ({ key, label: key, ...v }));
    })();

    // Aggregate repetitive SOP counts across all uploaded depts
    // De-duplicate by sopCode since same SOP appears in multiple dept lists
    const allRepeat3Plus = new Map<string, { sopCode: string; title: string; department: string; count: number }>();
    const allRepeat2 = new Map<string, { sopCode: string; title: string; department: string; count: number }>();
    const allRepeatOnce = new Map<string, { sopCode: string; title: string; department: string; count: number }>();
    for (const dept of departments) {
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
    for (const dept of departments) {
      const deptData = data?.perDept?.[dept] as any;
      if (!deptData?.uploaded || !deptData.excelDeptSplit) continue;
      const split = deptData.excelDeptSplit;
      totalExcelDeptTotal += split.total ?? 0;
      totalExcelDeptUnknownFound += split.unknownFound ?? 0;
      totalExcelDeptUnknownMissing += split.unknownMissing ?? 0;
      for (const d of departments) {
        totalExcelDeptFoundByDept[d] = (totalExcelDeptFoundByDept[d] || 0) + (split.foundByDept?.[d] || 0);
        totalExcelDeptMissingByDept[d] = (totalExcelDeptMissingByDept[d] || 0) + (split.missingByDept?.[d] || 0);
      }
    }
    const totalExcelDeptFoundSum = Object.values(totalExcelDeptFoundByDept).reduce((a, b) => a + b, 0) + totalExcelDeptUnknownFound;
    const totalExcelDeptMissingSum = Object.values(totalExcelDeptMissingByDept).reduce((a, b) => a + b, 0) + totalExcelDeptUnknownMissing;
    const hasTotalExcelDeptSplit = totalExcelDeptTotal > 0;

    let totalExpiryExpired = 0;
    let totalExpiryNear = 0;
    let totalExpiryNoDate = 0;
    for (const dept of departments) {
      const deptData = data?.perDept?.[dept] as DeptCardData | undefined;
      if (!deptData) continue;
      totalExpiryExpired += deptData.expiredCount ?? 0;
      totalExpiryNear += deptData.dueSoon30Count ?? 0;
      const okayList = ((deptData as any).okayList || []) as string[];
      totalExpiryNoDate += okayList.filter(
        (c) => !data?.sopStatusByCode?.[c]?.targetDate && !data?.sopStatusByCode?.[stripVersion(c)]?.targetDate,
      ).length;
    }

    return (
      <CardShell accent={getDeptAccent('Total')} icon={TotalIcon} title="Total">
        <SummaryTopic>
        <button
          type="button"
          onClick={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'db',
              title: `Total · DB SOPs (${t.dbSopCount})`,
              status: 'all_db',
            })
          }
          className="flex w-full min-h-[24px] cursor-pointer items-center justify-between gap-1.5 rounded-[4px] border border-transparent px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-purple-100/80 active:bg-purple-200/60 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400"
        >
          <span className="min-w-0 shrink font-semibold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis">SOPs (DB)</span>
          <span className="font-bold tabular-nums shrink-0 leading-tight text-gray-900">{t.dbSopCount}</span>
        </button>
        <div className="grid min-h-[26px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[5px] border border-transparent px-1 py-px text-[10px]">
          <span className="min-w-0 truncate text-left font-semibold text-gray-700">In Excel</span>
          <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm tabular-nums">
            <button
              type="button"
              onClick={() =>
                applySummaryCapsuleFilter({
                  dept: 'All',
                  type: 'found',
                  title: 'Total · Found in Excel',
                })
              }
              className="min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-emerald-500/70"
              title="Found"
            >
              {t.excelSopCount}
            </button>
            <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
            <RedCountBtn
              value={t.missingSopCount ?? 0}
              title="Missing"
              onClick={() =>
                applySummaryCapsuleFilter({
                  dept: 'All',
                  type: 'missing',
                  title: 'Total · Missing (DB but not in Excel)',
                })
              }
            />
          </div>
        </div>
        {totalLangBreakdown.length > 0 && (
          <div className="flex min-h-[24px] w-full items-center justify-between gap-1 rounded-[4px] border border-transparent px-1 py-0.5 text-[10px]">
            <span className="min-w-0 shrink truncate font-semibold text-gray-700">Lang (DB)</span>
            <div className="flex items-center gap-2 tabular-nums">
              {totalLangBreakdown.map((lr) => {
                const dbTotal = lr.found + lr.missing;
                return (
                  <span key={lr.key} className="inline-flex items-center gap-1">
                    <span className="text-[9px] font-medium text-gray-500">{lr.label}</span>
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
                      className="min-w-[1.35rem] rounded px-1 text-center text-[10px] font-bold tabular-nums text-gray-900 transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400"
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
        <ExpiryInlineRow
          expired={totalExpiryExpired}
          near={totalExpiryNear}
          noDate={totalExpiryNoDate}
          onExpired={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'Total · Expired SOPs',
              status: 'expired',
            })
          }
          onNear={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'Total · Due in Next 30 Days',
              status: 'due_soon_30',
            })
          }
          onNoDate={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'Total · SOPs with No Expiry Date',
              status: 'no_date',
            })
          }
        />
        {hasTotalExcelDeptSplit && (
          <>
            <div className="grid min-h-[26px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[5px] border border-transparent px-1 py-px text-[10px]">
              <span className="min-w-0 truncate text-left font-semibold text-gray-700">Excel SOP</span>
              <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm tabular-nums">
                <button
                  type="button"
                  onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found_any', title: 'Total · Found in Excel' })}
                  className="min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-emerald-500/70"
                  title="Found"
                >
                  {totalExcelDeptFoundSum}
                </button>
                <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
                <RedCountBtn
                  value={totalExcelDeptMissingSum}
                  title="Missing"
                  onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'missing', title: 'Total · Missing (DB but not in Excel)' })}
                />
              </div>
            </div>
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
                  ? [...departments, 'NA']
                  : departments
              }
              onSelectFound={(dbDept) =>
                applySummaryCapsuleFilter({
                  dept: 'All',
                  dbDept: dbDept === 'NA' ? 'All' : dbDept,
                  type: 'found_any',
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
        </SummaryTopic>
        <SummaryTopic>
        <RowB
          label="SOP wise Trainers"
          green={t.sopTrainersAssigned ?? t.trainersAssigned}
          red={t.sopTrainersMissing ?? t.trainersMissing}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'db',
              title: 'All SOPs · Trainer Assigned',
              status: 'all_db',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'db',
              title: 'All SOPs · Trainer Missing',
              status: 'all_db',
            })
          }
        />
        </SummaryTopic>
        <SummaryTopic>
        {(() => {
          const r3Total = totalRepeat3PlusList.reduce((s, i) => s + (i.count || 0), 0);
          const r2Total = totalRepeat2List.reduce((s, i) => s + (i.count || 0), 0);
          const r1Total = totalRepeatOnceList.reduce((s, i) => s + (i.count || 0), 0);
          const bucketSopSum = totalRepeat3PlusList.length + totalRepeat2List.length + totalRepeatOnceList.length;
          return (
            <>
              <div className="flex w-full min-h-[24px] items-center justify-between gap-1 px-1 py-0.5 text-[10px]">
                <SectionLabel>Repetitive SOPs</SectionLabel>
                <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm tabular-nums">
                  <button
                    type="button"
                    title="All Repetitive SOPs"
                    onClick={() => applyRepeatFilter('All', '3+', [...totalRepeat3PlusList, ...totalRepeat2List, ...totalRepeatOnceList])}
                    className="min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-500/70"
                  >
                    {bucketSopSum}
                  </button>
                  <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
                  <RedCountBtn
                    value={totalExcelDeptMissingSum}
                    title="Missing SOPs (DB but not in Excel)"
                    onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'missing', title: 'Total · Missing (DB but not in Excel)' })}
                  />
                </div>
              </div>
              <RepetitiveSopsRow
                items={[
                  { label: '3+', value: totalRepeat3PlusList.length, total: r3Total, color: 'red', tooltip: 'SOPs scheduled 3 or more times across departments', onClick: () => applyRepeatFilter('All', '3+', totalRepeat3PlusList) },
                  { label: '2×', value: totalRepeat2List.length, total: r2Total, color: 'amber', tooltip: 'SOPs scheduled exactly 2 times across departments', onClick: () => applyRepeatFilter('All', '2', totalRepeat2List) },
                  { label: '1×', value: totalRepeatOnceList.length, total: r1Total, color: 'green', tooltip: 'SOPs scheduled only once (no repetition across departments)', onClick: () => applyRepeatFilter('All', 'once', totalRepeatOnceList) },
                ]}
              />
            </>
          );
        })()}
        </SummaryTopic>
        <SummaryTopic>
        <RowB
          label={`MCQ (100+ created) · ${(t.mcqCreatedCount ?? 0) + (t.mcqNotCreatedCount ?? 0)}`}
          green={t.mcqCreatedCount}
          red={t.mcqNotCreatedCount}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'SOPs · MCQ Created (every required language ≥100)',
              status: 'mcq_created',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'SOPs · MCQ Missing (any required language <100)',
              status: 'mcq_not_created',
            })
          }
        />
        {/* Bottom breakdown — pure SOP-based reconciliation. Every SOP appears
            in exactly one section (Non-Dual or Dual) and contributes one to
            either Found or Missing, so:
              NonDual.Found  + Dual.Found  ≡ Overall.Found
              NonDual.Missing + Dual.Missing ≡ Overall.Missing
            The ENG / GUJ slot rows under "Dual SOPs" are display-only and do
            not feed the reconciliation. */}
        <div className="flex w-full flex-col gap-px px-1 py-0">
          <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5">
            <span className="min-w-0 truncate text-[10px] font-semibold leading-none text-gray-500">{`ENG·${(t.mcqEngOnlyCreatedCount ?? 0) + (t.mcqEngOnlyNotCreatedCount ?? 0)}`}</span>
            <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/90 px-px tabular-nums">
              <button type="button" title="Non-dual SOPs with 100+ ENG MCQs (SOP-level Found)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Non-Dual SOPs · Found (ENG ≥100)', status: 'mcq_eng_only_created' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{t.mcqEngOnlyCreatedCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <RedCountBtn variant="sm" value={t.mcqEngOnlyNotCreatedCount ?? 0} title="Non-dual SOPs with <100 ENG MCQs (SOP-level Missing)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Non-Dual SOPs · Missing (ENG <100)', status: 'mcq_eng_only_not_created' })} />
            </div>
          </div>
          <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5">
            <span className="min-w-0 truncate text-[10px] font-semibold leading-none text-gray-500" title="(ENG + GUJ)">{`(E+G)·${t.mcqDualSopCount ?? 0}`}</span>
            <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/90 px-px tabular-nums">
              <button type="button" title="Dual SOPs with 100+ MCQs in BOTH ENG and GUJ (SOP-level Found)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · Found (ENG ≥100 AND GUJ ≥100)', status: 'mcq_dual_both_created' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{t.mcqDualBothCreatedCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <RedCountBtn variant="sm" value={t.mcqDualEitherIncompleteCount ?? 0} title="Dual SOPs missing 100+ MCQs in EITHER ENG or GUJ (SOP-level Missing)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · Missing (ENG <100 OR GUJ <100)', status: 'mcq_dual_either_incomplete' })} />
            </div>
          </div>
          {/* Display-only per-language slot breakdown for Dual SOPs.
              These do NOT reconcile to the Dual Found/Missing row above — they
              describe individual language slots, not whole SOPs. */}
          <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-x-2 opacity-80">
            <div className="flex shrink-0 items-center gap-px">
              <span className="text-gray-900 text-[10px] italic font-semibold leading-none shrink-0">E</span>
              <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/80 px-px tabular-nums">
                <button type="button" title="Dual SOPs whose ENG slot has 100+ MCQs (display only — not for reconciliation)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · ENG slot ≥100 (display)', status: 'mcq_dual_eng_created' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{t.mcqDualEngCreatedCount ?? 0}</button>
                <span className="select-none text-[9px] leading-none text-gray-300">|</span>
                <RedCountBtn variant="sm" value={t.mcqDualEngNotCreatedCount ?? 0} title="Dual SOPs whose ENG slot has <100 MCQs (display only — not for reconciliation)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · ENG slot <100 (display)', status: 'mcq_dual_eng_not_created' })} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-px">
              <span className="text-gray-900 text-[10px] italic font-semibold leading-none shrink-0">G</span>
              <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/80 px-px tabular-nums">
                <button type="button" title="Dual SOPs whose GUJ slot has 100+ MCQs (display only — not for reconciliation)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · GUJ slot ≥100 (display)', status: 'mcq_dual_guj_created' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{t.mcqDualGujCreatedCount ?? 0}</button>
                <span className="select-none text-[9px] leading-none text-gray-300">|</span>
                <RedCountBtn variant="sm" value={t.mcqDualGujNotCreatedCount ?? 0} title="Dual SOPs whose GUJ slot has <100 MCQs (display only — not for reconciliation)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · GUJ slot <100 (display)', status: 'mcq_dual_guj_not_created' })} />
              </div>
            </div>
          </div>
        </div>
        </SummaryTopic>
        <SummaryTopic>
        <RowC
          label={`MCQ Approved · ${t.mcqCreatedCount ?? 0}`}
          green={t.mcqAllApprovedCount}
          amber={t.mcqPartiallyApprovedCount}
          red={t.mcqNotApprovedCount}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'MCQ All Approved (every required language fully approved)',
              status: 'mcq_all_approved',
            })
          }
          onClickAmber={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'MCQ Partially Approved (some approval, not full)',
              status: 'mcq_partially_approved',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept: 'All',
              type: 'found',
              title: 'MCQ Missing Approval (a required language has no approvals)',
              status: 'mcq_not_approved',
            })
          }
        />
        {/* SOP-based approval breakdown — universe is exactly the SOPs in the
            "MCQ (100+ created) · Found" universe above (mcqCreatedCount).
            Reconciliation guaranteed by construction:
              NonDual.(Approved+Partial+Missing) === mcqEngOnlyCreatedCount
              Dual.(Approved+Partial+Missing)    === mcqDualBothCreatedCount
              Top.(Approved+Partial+Missing)     === mcqCreatedCount
            The ENG slot / GUJ slot rows under "Dual SOPs" are display-only and
            do NOT reconcile to the Dual primary row above them. */}
        <div className="flex w-full flex-col gap-px px-1 py-0">
          <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5">
            <span className="min-w-0 truncate text-[10px] font-semibold leading-none text-gray-500">{`ENG·${t.mcqEngOnlyCreatedCount ?? 0}`}</span>
            <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/90 px-px tabular-nums">
              <button type="button" title="Non-dual SOPs whose ENG MCQs are fully approved" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Non-Dual SOPs · MCQ Approved (ENG fully approved)', status: 'mcq_approved_nondual' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{t.mcqApprovedNonDualCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <button type="button" title="Non-dual SOPs with some ENG approval but not full" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Non-Dual SOPs · MCQ Partially Approved', status: 'mcq_approval_partial_nondual' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-amber-600 transition-colors hover:bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400">{t.mcqApprovalPartialNonDualCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <RedCountBtn variant="sm" value={t.mcqApprovalMissingNonDualCount ?? 0} title="Non-dual SOPs with zero ENG approvals" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Non-Dual SOPs · MCQ Approval Missing (zero approvals)', status: 'mcq_approval_missing_nondual' })} />
            </div>
          </div>
          <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5">
            <span className="min-w-0 truncate text-[10px] font-semibold leading-none text-gray-500" title="(ENG + GUJ)">{`(E+G)·${t.mcqDualBothCreatedCount ?? 0}`}</span>
            <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/90 px-px tabular-nums">
              <button type="button" title="Dual SOPs with BOTH ENG and GUJ fully approved (SOP-level Approved)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · MCQ Approved (ENG fully + GUJ fully)', status: 'mcq_approved_dual' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{t.mcqApprovedDualCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <button type="button" title="Dual SOPs with partial progress — at least one language has approvals or is fully approved, but both aren't fully approved" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · MCQ Partially Approved (some progress on at least one language)', status: 'mcq_approval_partial_dual' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-amber-600 transition-colors hover:bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400">{t.mcqApprovalPartialDualCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <RedCountBtn variant="sm" value={t.mcqApprovalMissingDualCount ?? 0} title="Dual SOPs where BOTH languages have zero approvals (fully missing)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · MCQ Approval Missing (both languages have zero approvals)', status: 'mcq_approval_missing_dual' })} />
            </div>
          </div>
          <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-x-2 opacity-80">
            <div className="flex shrink-0 items-center gap-px">
              <span className="text-gray-900 text-[10px] italic font-semibold leading-none shrink-0">E</span>
              <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/80 px-px tabular-nums">
                <button type="button" title="Dual SOPs whose ENG slot is fully approved (display only — not for reconciliation)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · ENG slot fully approved (display)', status: 'mcq_dual_slot_eng_all_approved' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{t.mcqDualSlotEngAllApprovedCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <button type="button" title="Dual SOPs whose ENG slot has some approvals but not full (display only)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · ENG slot partially approved (display)', status: 'mcq_dual_slot_eng_partially_approved' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-amber-600 transition-colors hover:bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400">{t.mcqDualSlotEngPartiallyApprovedCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <RedCountBtn variant="sm" value={t.mcqDualSlotEngNotApprovedCount ?? 0} title="Dual SOPs whose ENG slot has zero approvals (display only)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · ENG slot zero approvals (display)', status: 'mcq_dual_slot_eng_not_approved' })} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-px">
              <span className="text-gray-900 text-[10px] italic font-semibold leading-none shrink-0">G</span>
              <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/80 px-px tabular-nums">
                <button type="button" title="Dual SOPs whose GUJ slot is fully approved (display only)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · GUJ slot fully approved (display)', status: 'mcq_dual_slot_guj_all_approved' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{t.mcqDualSlotGujAllApprovedCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <button type="button" title="Dual SOPs whose GUJ slot has some approvals but not full (display only)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · GUJ slot partially approved (display)', status: 'mcq_dual_slot_guj_partially_approved' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-amber-600 transition-colors hover:bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400">{t.mcqDualSlotGujPartiallyApprovedCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <RedCountBtn variant="sm" value={t.mcqDualSlotGujNotApprovedCount ?? 0} title="Dual SOPs whose GUJ slot has zero approvals (display only)" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'Dual SOPs · GUJ slot zero approvals (display)', status: 'mcq_dual_slot_guj_not_approved' })} />
              </div>
            </div>
          </div>
        </div>
        </SummaryTopic>
        <SummaryTopic>
        <SectionLabel>Trainers / SOP</SectionLabel>
        <div className="flex w-full min-h-[22px] items-center justify-between gap-1 px-1 py-0 text-[10px]">
          <div className="flex items-center gap-0.5" title="SOPs with 2 or more trainers assigned">
            <span className="text-gray-500 text-[10px] font-medium">2+</span>
            <button type="button" title="SOPs with 2 or more trainers" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'SOPs with 2+ Trainers', status: 'sop_2plus_trainer' })} className="min-w-[1.3rem] cursor-pointer rounded border border-gray-200/80 bg-white/90 px-1 py-0.5 text-center text-[10px] font-bold leading-tight text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400 tabular-nums">{trainerBuckets.sop2Plus}</button>
          </div>
          <div className="flex items-center gap-0.5" title="SOPs with exactly 1 trainer assigned">
            <span className="text-gray-500 text-[10px] font-medium">1</span>
            <button type="button" title="SOPs with 1 trainer" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'SOPs with 1 Trainer', status: 'sop_1_trainer' })} className="min-w-[1.3rem] cursor-pointer rounded border border-gray-200/80 bg-white/90 px-1 py-0.5 text-center text-[10px] font-bold leading-tight text-amber-600 shadow-sm transition-colors hover:bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400 tabular-nums">{trainerBuckets.sop1}</button>
          </div>
          <div className="flex items-center gap-0.5" title="SOPs with no trainer assigned">
            <span className="text-gray-500 text-[10px] font-medium">0</span>
            <button type="button" title="SOPs with 0 trainers" onClick={() => applySummaryCapsuleFilter({ dept: 'All', type: 'found', title: 'SOPs with 0 Trainers', status: 'sop_0_trainer' })} className={`min-w-[1.3rem] cursor-pointer rounded border border-gray-200/80 bg-white/90 px-1 py-0.5 text-center text-[10px] font-bold leading-tight shadow-sm transition-colors focus:outline-none focus:ring-1 tabular-nums ${(trainerBuckets.sop0 ?? 0) === 0 ? 'text-gray-400 hover:bg-gray-100 focus:ring-gray-400' : 'text-red-600 hover:bg-red-50 focus:ring-red-400'}`}>{trainerBuckets.sop0}</button>
          </div>
        </div>
        </SummaryTopic>
        <SummaryTopic>
        <SectionLabel>SOPs / Month</SectionLabel>
        <MonthStrip
          monthCounts={totalMonthCounts}
          onSelectMonth={(m) => {
            setViewMode('sop');
            setGroupBy('department');
            setActiveDept('All');
            setActiveMonth(m);
            setSearch('');
            clearCapsuleFilter();
            setTimeout(() => {
              tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
          }}
        />
        </SummaryTopic>
        <SummaryTopic>
        <RowA label="Departments" value={`${t.departmentCount}/${t.totalDepartments}`} />
        </SummaryTopic>
      </CardShell>
    );
  };

  const renderDeptCard = (dept: Dept, d: DeptCardData) => {
    const deptTrainerBuckets = resolveTrainerBucketCounts(d);
    const Icon = getDeptIcon(dept);
    const dbDeptCount =
      (data?.totalCard?.dbSopCountsByDept as any)?.[dept] ??
      (data?.totalCard?.dbSopsByDept as any)?.[dept]?.length ??
      0;
    return (
      <CardShell accent={getDeptAccent(dept)} icon={Icon} title={dept}>
        <SummaryTopic>
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
            setTimeout(() => {
              tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
          }}
          className="flex w-full min-h-[24px] cursor-pointer items-center justify-between gap-1.5 rounded-[4px] border border-transparent px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-purple-100/80 active:bg-purple-200/60 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400"
        >
          <span className="min-w-0 shrink font-semibold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis">SOPs (DB)</span>
          <span className="font-bold tabular-nums shrink-0 leading-tight text-gray-900">{dbDeptCount}</span>
        </button>
        <div className="grid min-h-[26px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[5px] border border-transparent px-1 py-px text-[10px]">
          <span className="min-w-0 truncate text-left font-semibold text-gray-700">In Excel</span>
          <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm tabular-nums">
            <button
              type="button"
              onClick={() =>
                applySummaryCapsuleFilter({
                  dept,
                  type: 'found',
                  title: `${dept} · Found in Excel`,
                })
              }
              className="min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-emerald-500/70"
              title="Found"
            >
              {d.foundInDb}
            </button>
            <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
            <RedCountBtn
              value={d.missingFromExcel ?? 0}
              title="Missing"
              onClick={() =>
                applySummaryCapsuleFilter({
                  dept,
                  type: 'missing',
                  title: `${dept} · Missing (DB but not in Excel)`,
                })
              }
            />
          </div>
        </div>
        {(d.langBreakdown || []).length > 0 ? (
          <div className="flex min-h-[24px] w-full items-center justify-between gap-1 rounded-[4px] border border-transparent px-1 py-0.5 text-[10px]">
            <span className="min-w-0 shrink truncate font-semibold text-gray-700">Lang (DB)</span>
            <div className="flex items-center gap-2 tabular-nums">
              {(d.langBreakdown || [])
                .slice()
                .sort((a, b) => (a.key === b.key ? 0 : a.key === 'ENG' ? -1 : 1))
                .map((lr) => {
                  const dbTotal = lr.found + lr.missing;
                  return (
                    <span key={lr.key} className="inline-flex items-center gap-1">
                      <span className="text-[9px] font-medium text-gray-500">{lr.label}</span>
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
                        className="min-w-[1.35rem] rounded px-1 text-center text-[10px] font-bold tabular-nums text-gray-900 transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400"
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

        <ExpiryInlineRow
          expired={d.expiredCount ?? 0}
          near={d.dueSoon30Count ?? 0}
          noDate={(((d as any).okayList || []) as string[]).filter((c) => !data?.sopStatusByCode?.[c]?.targetDate && !data?.sopStatusByCode?.[stripVersion(c)]?.targetDate).length}
          onExpired={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · Expired SOPs`,
              status: 'expired',
            })
          }
          onNear={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · Due in Next 30 Days`,
              status: 'due_soon_30',
            })
          }
          onNoDate={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · SOPs with No Expiry Date`,
              status: 'no_date',
            })
          }
        />

        {d.excelDeptSplit?.foundByDept ? (
          <>
            <div className="grid min-h-[26px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[5px] border border-transparent px-1 py-px text-[10px]">
              <span className="min-w-0 truncate text-left font-semibold text-gray-700">Excel SOP</span>
              <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm tabular-nums">
                <button
                  type="button"
                  onClick={() => applySummaryCapsuleFilter({ dept, type: 'found_any', title: `${dept} · Found in Excel` })}
                  className="min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-emerald-500/70"
                  title="Found"
                >
                  {Object.values(d.excelDeptSplit.foundByDept || {}).reduce((a: number, b: unknown) => a + (b as number), 0) + (d.excelDeptSplit.unknownFound ?? 0)}
                </button>
                <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
                <RedCountBtn
                  value={Object.values(d.excelDeptSplit.missingByDept || {}).reduce((a: number, b: unknown) => a + (b as number), 0) + (d.excelDeptSplit.unknownMissing ?? 0)}
                  title="Missing"
                  onClick={() => applySummaryCapsuleFilter({ dept, type: 'missing', title: `${dept} · Missing (DB but not in Excel)` })}
                />
              </div>
            </div>
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
                  ? [...departments, 'NA']
                  : departments
              }
              onSelectFound={(dbDept) =>
                applySummaryCapsuleFilter({
                  dept,
                  dbDept: dbDept === 'NA' ? 'All' : dbDept,
                  type: 'found_any',
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

        </SummaryTopic>
        <SummaryTopic>
        <RowB
          label="SOP wise Trainers"
          green={d.sopTrainersAssigned ?? d.trainersAssigned}
          red={d.sopTrainersMissing ?? d.trainersMissing}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'db',
              title: `${dept} · SOP wise Trainer assigned`,
              status: 'all_db',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'db',
              title: `${dept} · SOP wise Trainer missing`,
              status: 'all_db',
            })
          }
        />
        </SummaryTopic>
        <SummaryTopic>
        {(() => {
          const dMissingSum = Object.values(d.excelDeptSplit?.missingByDept || {}).reduce((a, b) => a + b, 0) + (d.excelDeptSplit?.unknownMissing ?? 0);
          const r3Count = d.repeat3PlusCount ?? 0;
          const r2Count = d.repeat2Count ?? 0;
          const r1Count = d.repeat1Count ?? 0;
          const dr3 = (d.repeat3PlusList ?? []).reduce((s, i) => s + (i.count || 0), 0);
          const dr2 = (d.repeat2List ?? []).reduce((s, i) => s + (i.count || 0), 0);
          const dr1 = (d.repeat1List ?? []).reduce((s, i) => s + (i.count || 0), 0);
          const bucketSopSum = r3Count + r2Count + r1Count;
          return (
            <>
              <div className="flex w-full min-h-[24px] items-center justify-between gap-1 px-1 py-0.5 text-[10px]">
                <SectionLabel>Repetitive SOPs</SectionLabel>
                <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm tabular-nums">
                  <button
                    type="button"
                    title="All Repetitive SOPs"
                    onClick={() => applyRepeatFilter(dept, '3+', [...(d.repeat3PlusList ?? []), ...(d.repeat2List ?? []), ...(d.repeat1List ?? [])])}
                    className="min-w-[1.35rem] cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-500/70"
                  >
                    {bucketSopSum}
                  </button>
                  <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
                  <RedCountBtn
                    value={dMissingSum}
                    title="Missing SOPs (DB but not in Excel)"
                    onClick={() => applySummaryCapsuleFilter({ dept, type: 'missing', title: `${dept} · Missing (DB but not in Excel)` })}
                  />
                </div>
              </div>
              <RepetitiveSopsRow
                items={[
                  { label: '3+', value: d.repeat3PlusCount ?? 0, total: dr3, color: 'red', tooltip: 'SOPs scheduled 3 or more times across departments', onClick: () => applyRepeatFilter(dept, '3+', d.repeat3PlusList ?? []) },
                  { label: '2×', value: d.repeat2Count ?? 0, total: dr2, color: 'amber', tooltip: 'SOPs scheduled exactly 2 times across departments', onClick: () => applyRepeatFilter(dept, '2', d.repeat2List ?? []) },
                  { label: '1×', value: d.repeat1Count ?? 0, total: dr1, color: 'green', tooltip: 'SOPs scheduled only once (no repetition across departments)', onClick: () => applyRepeatFilter(dept, 'once', d.repeat1List ?? []) },
                ]}
              />
            </>
          );
        })()}
        </SummaryTopic>
        <SummaryTopic>
        <RowB
          label={`MCQ (100+ created) · ${(d.mcqCreatedCount ?? 0) + (d.mcqNotCreatedCount ?? 0)}`}
          green={d.mcqCreatedCount ?? 0}
          red={d.mcqNotCreatedCount ?? 0}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · SOPs · MCQ Created (every required language ≥100)`,
              status: 'mcq_created',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · SOPs · MCQ Missing (any required language <100)`,
              status: 'mcq_not_created',
            })
          }
        />
        {/* Bottom breakdown — pure SOP-based reconciliation. NonDual + Dual
            counts always sum to the Overall counts above. The ENG / GUJ slot
            rows under "Dual SOPs" are display-only and intentionally do NOT
            reconcile to the Dual Found/Missing row (they describe individual
            language slots, not whole SOPs). */}
        <div className="flex w-full flex-col gap-px px-1 py-0">
          <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5">
            <span className="min-w-0 truncate text-[10px] font-semibold leading-none text-gray-500">{`ENG·${(d.mcqEngOnlyCreatedCount ?? 0) + (d.mcqEngOnlyNotCreatedCount ?? 0)}`}</span>
            <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/90 px-px tabular-nums">
              <button type="button" title="Non-dual SOPs with 100+ ENG MCQs (SOP-level Found)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Non-Dual SOPs · Found (ENG ≥100)`, status: 'mcq_eng_only_created' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{d.mcqEngOnlyCreatedCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <RedCountBtn variant="sm" value={d.mcqEngOnlyNotCreatedCount ?? 0} title="Non-dual SOPs with <100 ENG MCQs (SOP-level Missing)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Non-Dual SOPs · Missing (ENG <100)`, status: 'mcq_eng_only_not_created' })} />
            </div>
          </div>
          <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5">
            <span className="min-w-0 truncate text-[10px] font-semibold leading-none text-gray-500" title="(ENG + GUJ)">{`(E+G)·${d.mcqDualSopCount ?? 0}`}</span>
            <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/90 px-px tabular-nums">
              <button type="button" title="Dual SOPs with 100+ MCQs in BOTH ENG and GUJ (SOP-level Found)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · Found (ENG ≥100 AND GUJ ≥100)`, status: 'mcq_dual_both_created' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{d.mcqDualBothCreatedCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <RedCountBtn variant="sm" value={d.mcqDualEitherIncompleteCount ?? 0} title="Dual SOPs missing 100+ MCQs in EITHER ENG or GUJ (SOP-level Missing)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · Missing (ENG <100 OR GUJ <100)`, status: 'mcq_dual_either_incomplete' })} />
            </div>
          </div>
          <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-x-2 opacity-80">
            <div className="flex shrink-0 items-center gap-px">
              <span className="text-gray-900 text-[10px] italic font-semibold leading-none shrink-0">E</span>
              <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/80 px-px tabular-nums">
                <button type="button" title="Dual SOPs whose ENG slot has 100+ MCQs (display only — not for reconciliation)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · ENG slot ≥100 (display)`, status: 'mcq_dual_eng_created' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{d.mcqDualEngCreatedCount ?? 0}</button>
                <span className="select-none text-[9px] leading-none text-gray-300">|</span>
                <RedCountBtn variant="sm" value={d.mcqDualEngNotCreatedCount ?? 0} title="Dual SOPs whose ENG slot has <100 MCQs (display only — not for reconciliation)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · ENG slot <100 (display)`, status: 'mcq_dual_eng_not_created' })} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-px">
              <span className="text-gray-900 text-[10px] italic font-semibold leading-none shrink-0">G</span>
              <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/80 px-px tabular-nums">
                <button type="button" title="Dual SOPs whose GUJ slot has 100+ MCQs (display only — not for reconciliation)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · GUJ slot ≥100 (display)`, status: 'mcq_dual_guj_created' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{d.mcqDualGujCreatedCount ?? 0}</button>
                <span className="select-none text-[9px] leading-none text-gray-300">|</span>
                <RedCountBtn variant="sm" value={d.mcqDualGujNotCreatedCount ?? 0} title="Dual SOPs whose GUJ slot has <100 MCQs (display only — not for reconciliation)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · GUJ slot <100 (display)`, status: 'mcq_dual_guj_not_created' })} />
              </div>
            </div>
          </div>
        </div>
        </SummaryTopic>
        <SummaryTopic>
        <RowC
          label={`MCQ Approved · ${d.mcqCreatedCount ?? 0}`}
          green={d.mcqAllApprovedCount ?? 0}
          amber={d.mcqPartiallyApprovedCount ?? 0}
          red={d.mcqNotApprovedCount ?? 0}
          onClickGreen={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · MCQ All Approved (every required language fully approved)`,
              status: 'mcq_all_approved',
            })
          }
          onClickAmber={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · MCQ Partially Approved (some approval, not full)`,
              status: 'mcq_partially_approved',
            })
          }
          onClickRed={() =>
            applySummaryCapsuleFilter({
              dept,
              type: 'found',
              title: `${dept} · MCQ Missing Approval (a required language has zero approvals)`,
              status: 'mcq_not_approved',
            })
          }
        />
        {/* SOP-based approval breakdown (department scope) — universe is the
            "MCQ (100+ created) · Found" SOPs in this department. NonDual+Dual
            sub-totals always sum to the top primary row above. */}
        <div className="flex w-full flex-col gap-px px-1 py-0">
          <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5">
            <span className="min-w-0 truncate text-[10px] font-semibold leading-none text-gray-500">{`ENG·${d.mcqEngOnlyCreatedCount ?? 0}`}</span>
            <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/90 px-px tabular-nums">
              <button type="button" title="Non-dual SOPs whose ENG MCQs are fully approved" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Non-Dual SOPs · MCQ Approved (ENG fully approved)`, status: 'mcq_approved_nondual' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{d.mcqApprovedNonDualCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <button type="button" title="Non-dual SOPs with some ENG approval but not full" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Non-Dual SOPs · MCQ Partially Approved`, status: 'mcq_approval_partial_nondual' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-amber-600 transition-colors hover:bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400">{d.mcqApprovalPartialNonDualCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <RedCountBtn variant="sm" value={d.mcqApprovalMissingNonDualCount ?? 0} title="Non-dual SOPs with zero ENG approvals" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Non-Dual SOPs · MCQ Approval Missing`, status: 'mcq_approval_missing_nondual' })} />
            </div>
          </div>
          <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5">
            <span className="min-w-0 truncate text-[10px] font-semibold leading-none text-gray-500" title="(ENG + GUJ)">{`(E+G)·${d.mcqDualBothCreatedCount ?? 0}`}</span>
            <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/90 px-px tabular-nums">
              <button type="button" title="Dual SOPs with BOTH ENG and GUJ fully approved (SOP-level Approved)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · MCQ Approved (ENG fully + GUJ fully)`, status: 'mcq_approved_dual' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{d.mcqApprovedDualCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <button type="button" title="Dual SOPs with partial progress — at least one language has approvals or is fully approved, but both aren't fully approved" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · MCQ Partially Approved`, status: 'mcq_approval_partial_dual' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-amber-600 transition-colors hover:bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400">{d.mcqApprovalPartialDualCount ?? 0}</button>
              <span className="select-none text-[9px] leading-none text-gray-300">|</span>
              <RedCountBtn variant="sm" value={d.mcqApprovalMissingDualCount ?? 0} title="Dual SOPs where BOTH languages have zero approvals (fully missing)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · MCQ Approval Missing`, status: 'mcq_approval_missing_dual' })} />
            </div>
          </div>
          <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-x-2 opacity-80">
            <div className="flex shrink-0 items-center gap-px">
              <span className="text-gray-900 text-[10px] italic font-semibold leading-none shrink-0">E</span>
              <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/80 px-px tabular-nums">
                <button type="button" title="Dual SOPs whose ENG slot is fully approved (display only)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · ENG slot fully approved (display)`, status: 'mcq_dual_slot_eng_all_approved' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{d.mcqDualSlotEngAllApprovedCount ?? 0}</button>
                <span className="select-none text-[9px] leading-none text-gray-300">|</span>
                <button type="button" title="Dual SOPs whose ENG slot has some approvals but not full (display only)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · ENG slot partially approved (display)`, status: 'mcq_dual_slot_eng_partially_approved' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-amber-600 transition-colors hover:bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400">{d.mcqDualSlotEngPartiallyApprovedCount ?? 0}</button>
                <span className="select-none text-[9px] leading-none text-gray-300">|</span>
                <RedCountBtn variant="sm" value={d.mcqDualSlotEngNotApprovedCount ?? 0} title="Dual SOPs whose ENG slot has zero approvals (display only)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · ENG slot zero approvals (display)`, status: 'mcq_dual_slot_eng_not_approved' })} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-px">
              <span className="text-gray-900 text-[10px] italic font-semibold leading-none shrink-0">G</span>
              <div className="inline-flex shrink-0 items-center gap-px rounded border border-gray-200/70 bg-white/80 px-px tabular-nums">
                <button type="button" title="Dual SOPs whose GUJ slot is fully approved (display only)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · GUJ slot fully approved (display)`, status: 'mcq_dual_slot_guj_all_approved' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{d.mcqDualSlotGujAllApprovedCount ?? 0}</button>
                <span className="select-none text-[9px] leading-none text-gray-300">|</span>
                <button type="button" title="Dual SOPs whose GUJ slot has some approvals but not full (display only)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · GUJ slot partially approved (display)`, status: 'mcq_dual_slot_guj_partially_approved' })} className="min-w-[1rem] cursor-pointer rounded-sm px-0.5 py-px text-center text-[10px] font-bold leading-none text-amber-600 transition-colors hover:bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400">{d.mcqDualSlotGujPartiallyApprovedCount ?? 0}</button>
                <span className="select-none text-[9px] leading-none text-gray-300">|</span>
                <RedCountBtn variant="sm" value={d.mcqDualSlotGujNotApprovedCount ?? 0} title="Dual SOPs whose GUJ slot has zero approvals (display only)" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · Dual SOPs · GUJ slot zero approvals (display)`, status: 'mcq_dual_slot_guj_not_approved' })} />
              </div>
            </div>
          </div>
        </div>
        </SummaryTopic>
        <SummaryTopic>
        <SectionLabel>Trainers / SOP</SectionLabel>
        <div className="flex w-full min-h-[22px] items-center justify-between gap-1 px-1 py-0 text-[10px]">
          <div className="flex items-center gap-0.5" title="SOPs with 2 or more trainers assigned">
            <span className="text-gray-500 text-[10px] font-medium">2+</span>
            <button type="button" title="SOPs with 2 or more trainers" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · SOPs with 2+ Trainers`, status: 'sop_2plus_trainer' })} className="min-w-[1.3rem] cursor-pointer rounded border border-gray-200/80 bg-white/90 px-1 py-0.5 text-center text-[10px] font-bold leading-tight text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400 tabular-nums">{deptTrainerBuckets.sop2Plus}</button>
          </div>
          <div className="flex items-center gap-0.5" title="SOPs with exactly 1 trainer assigned">
            <span className="text-gray-500 text-[10px] font-medium">1</span>
            <button type="button" title="SOPs with 1 trainer" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · SOPs with 1 Trainer`, status: 'sop_1_trainer' })} className="min-w-[1.3rem] cursor-pointer rounded border border-gray-200/80 bg-white/90 px-1 py-0.5 text-center text-[10px] font-bold leading-tight text-amber-600 shadow-sm transition-colors hover:bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400 tabular-nums">{deptTrainerBuckets.sop1}</button>
          </div>
          <div className="flex items-center gap-0.5" title="SOPs with no trainer assigned">
            <span className="text-gray-500 text-[10px] font-medium">0</span>
            <button type="button" title="SOPs with 0 trainers" onClick={() => applySummaryCapsuleFilter({ dept, type: 'found', title: `${dept} · SOPs with 0 Trainers`, status: 'sop_0_trainer' })} className={`min-w-[1.3rem] cursor-pointer rounded border border-gray-200/80 bg-white/90 px-1 py-0.5 text-center text-[10px] font-bold leading-tight shadow-sm transition-colors focus:outline-none focus:ring-1 tabular-nums ${(deptTrainerBuckets.sop0 ?? 0) === 0 ? 'text-gray-400 hover:bg-gray-100 focus:ring-gray-400' : 'text-red-600 hover:bg-red-50 focus:ring-red-400'}`}>{deptTrainerBuckets.sop0}</button>
          </div>
        </div>
        </SummaryTopic>
        <SummaryTopic>
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
            setTimeout(() => {
              tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
          }}
        />
        </SummaryTopic>
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
    bgTint: DeptBgTint;
    left: React.ReactNode;
    chips: React.ReactNode;
    bottom?: React.ReactNode;
    onClick?: () => void;
  }) {
    const tint = deptBgTintClass(bgTint);

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

  function SopRowGrid({
    accent,
    bgTint,
    sr,
    sopCode,
    title,
    gujaratiName,
    isDualLanguage,
    dbDept,
    dept,
    month,
    targetDate,
    expired,
    trainer,
    mcqMetrics,
    bottom,
    onClick,
    isActiveMonth,
    engDocxPath,
    gujDocxPath,
    docIdentifier,
  }: {
    accent: string;
    bgTint: DeptBgTint;
    sr?: number;
    sopCode: string;
    title?: string;
    gujaratiName?: string;
    isDualLanguage?: boolean;
    dbDept?: string;
    dept: string;
    month?: string;
    targetDate?: string | null;
    expired?: boolean;
    trainer?: string;
    mcqMetrics?: React.ReactNode;
    bottom?: React.ReactNode;
    onClick?: () => void;
    isActiveMonth?: boolean;
    engDocxPath?: string;
    gujDocxPath?: string;
    docIdentifier?: string;
  }) {
    const tint = deptBgTintClass(bgTint);

    const expiryLabel = targetDate
      ? new Date(targetDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
      : '—';

    return (
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
        className={`w-full text-left rounded-2xl border shadow-sm hover:shadow-md transition overflow-hidden ${tint} ${onClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-300' : ''}`}
        style={{ borderColor: `${accent}55` }}
      >
        <div
          className="grid items-center gap-x-1.5 gap-y-0.5 px-3 py-1"
          style={{ gridTemplateColumns: SOP_TABLE_GRID_COLS }}
        >
          <span className="text-[9px] font-bold text-gray-400 tabular-nums text-right">{sr != null ? sr : ''}</span>
          <span className="font-mono text-[10px] font-black text-gray-900 truncate" title={sopCode}>{sopCode}</span>
          <div className="flex flex-col min-w-0">
            {title
              ? <span className="text-[11px] font-extrabold text-gray-900 leading-tight break-words">{title}</span>
              : <span className="text-[9px] text-gray-400 italic">—</span>}
            {isDualLanguage && gujaratiName && /[઀-૿]/.test(gujaratiName) && (
              <span className="text-[10px] font-bold text-indigo-700 leading-tight break-words">{gujaratiName}</span>
            )}
          </div>
          <span className="text-[10px] font-semibold text-gray-600 truncate" title={dbDept ? `DB Dept: ${dbDept}` : 'DB Dept: —'}>{dbDept || '—'}</span>
          <span className="text-[10px] font-black text-gray-900 truncate" title={dept}>{dept}</span>
          <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 border text-center truncate ${month ? (isActiveMonth ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white/60 text-gray-600 border-white/60') : 'text-gray-400'}`}>
            {month || '—'}
          </span>
          <span className={`text-[10px] font-semibold truncate ${trainer ? 'text-emerald-700' : 'text-red-500'}`} title={trainer || 'No Trainer'}>
            {trainer || 'No Trainer'}
          </span>
          <div className="flex flex-col items-start justify-center leading-none min-w-0">
            {engDocxPath ? (
              <a
                href={buildViewDocHref(engDocxPath, docIdentifier || sopCode, 'English')}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[9px] font-bold text-emerald-700 hover:underline whitespace-nowrap"
                title={`Open ENG DOCX for ${sopCode}`}
              >
                ENG DOCX
              </a>
            ) : (
              <span className="text-[9px] font-bold text-gray-400 whitespace-nowrap" title="No ENG DOCX">ENG —</span>
            )}
            {isDualLanguage ? (
              gujDocxPath ? (
                <a
                  href={buildViewDocHref(gujDocxPath, docIdentifier || sopCode, 'Gujarati')}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[9px] font-bold text-emerald-700 hover:underline whitespace-nowrap"
                  title={`Open GUJ DOCX for ${sopCode}`}
                >
                  GUJ DOCX
                </a>
              ) : (
                <span className="text-[9px] font-bold text-gray-400 whitespace-nowrap" title="No GUJ DOCX">GUJ —</span>
              )
            ) : null}
          </div>
          {mcqMetrics}
          <span
            className={`text-[9px] font-semibold text-center truncate ${targetDate
              ? expired ? 'text-red-600' : 'text-emerald-700'
              : 'text-gray-400'}`}
            title={targetDate ? (expired ? 'Expired' : 'Valid') : 'No date'}
          >
            {expiryLabel}
          </span>
          {bottom ? (
            <div className="min-w-0 pb-1" style={{ gridColumn: SOP_EMP_BUBBLE_GRID_COL }}>
              {bottom}
            </div>
          ) : null}
        </div>
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
    const tint = deptToBgTint(dept, sop.expired);

    const isActiveMonth = activeMonth !== 'All' && sop.month && sop.month === activeMonth;


    const openEmployee = (n: string) => {
      const lookupDepts: string[] = dept === 'All' ? [...departments] : [dept];
      let empRow: { name: string; designation?: string; training?: Record<string, boolean> } | undefined;
      let empDept = dept;
      for (const d of lookupDepts) {
        const found = data?.perDept?.[d as Dept]?.employees?.find((e: any) => e.name === n);
        if (found) {
          empRow = found;
          empDept = d;
          break;
        }
      }
      const monthMap = (data?.sopMonthMapByDept as any)?.[empDept] || {};
      const employeeSops: Array<{ sopCode: string; month: string; symbol: '√' | 'X' | 'NA' }> = [];
      if (empRow) {
        for (const [code, v] of Object.entries(empRow.training || {})) {
          employeeSops.push({ sopCode: code, month: monthForCode(monthMap, code), symbol: v ? '√' : 'X' });
        }
        employeeSops.sort((a, b) => a.sopCode.localeCompare(b.sopCode));
      }
      setDetailModal({
        kind: 'employee',
        title: n,
        subtitle: `${empDept}${empRow?.designation ? ` · ${empRow.designation}` : ''}`,
        employeeName: n,
        employeeSops,
      });
    };

    const completed = sop.completedEmployees || [];

    const openSopModal = () => {
      if (!data) return;
      const byName = new Map<string, { designation?: string }>();
      const empDepts = dept === 'All' ? departments : [dept as Dept];
      for (const d of empDepts) {
        for (const e of data.perDept?.[d]?.employees || []) byName.set(e.name, { designation: e.designation });
      }
      // Due = √ (completed) + X (pending) — everyone scheduled to give the exam
      const dueNames = [...(sop.completedEmployees || []), ...(sop.pendingEmployees || [])];
      const due = dueNames.map((n) => ({ name: n, designation: byName.get(n)?.designation, department: dept }));
      // Not Necessary = dept employees who have no training record for this SOP (NA)
      const dueSet = new Set(dueNames);
      const notNecessary: Array<{ name: string; designation?: string; department?: string }> = [];
      for (const d of empDepts) {
        for (const e of data.perDept?.[d]?.employees || []) {
          if (dueSet.has(e.name)) continue;
          notNecessary.push({ name: e.name, designation: e.designation, department: d });
        }
      }
      const inExcelDepts = departments.filter((d) =>
        (data.sopCodesByDept?.[d] || []).some((c: string) => c.toUpperCase() === sop.sopCode.toUpperCase())
      );
      setSopDetailSearch('');
      setSopDetailSortField('name');
      setSopDetailSortDir('asc');
      setDetailModal({
        kind: 'sop',
        title: `${sop.sopCode}`,
        sopTitle: sop.title || '',
        subtitle: `${dept === 'All' ? 'All Departments' : dept}${sop.month ? ` · ${sop.month}` : ''}`,
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
        foundEmployees: due,
        missingEmployees: notNecessary,
      });
    };

    const pendingBottom =
      completed.length > 0 ? (
        <EmployeeBubbleRow names={completed} variant="due" onNameClick={openEmployee} onMoreClick={openSopModal} />
      ) : null;

    const docPaths = data?.dbDocPathsByCode?.[stripVersion(sop.sopCode).toUpperCase()]
      || data?.dbDocPathsByCode?.[stripVersion(sop.sopCode)];

    return (
      <SopRowGrid
        accent={accent}
        bgTint={tint}
        sr={sr}
        sopCode={sop.sopCode}
        title={sop.title}
        gujaratiName={sop.gujaratiName}
        isDualLanguage={sop.isDualLanguage}
        dbDept={dbDeptBySopCode.get(stripVersion(sop.sopCode).toUpperCase())}
        dept={dept}
        month={sop.month}
        targetDate={sop.targetDate}
        expired={sop.expired}
        engDocxPath={docPaths?.eng}
        gujDocxPath={docPaths?.guj}
        docIdentifier={docPaths?.id}
        trainer={sop.trainer}
        isActiveMonth={!!isActiveMonth}
        mcqMetrics={
          <SopMcqMetrics
            sopCode={sop.sopCode}
            isDualLanguage={sop.isDualLanguage}
            mcqTotal={sop.mcqTotal}
            mcqApproved={sop.mcqApproved}
            mcqEngTotal={sop.mcqEngTotal}
            mcqEngApproved={sop.mcqEngApproved}
            mcqGujTotal={sop.mcqGujTotal}
            mcqGujApproved={sop.mcqGujApproved}
          />
        }
        bottom={pendingBottom}
        onClick={openSopModal}
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
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2.5 py-0.5 border ${dm.expired ? 'bg-red-100 text-red-700 border-red-300' : 'bg-emerald-100 text-emerald-700 border-emerald-300'
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
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${dm.completionPct >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
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
                      {dm.mcqTotal !== undefined && dm.sopCode && (
                        <div className="w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
                          <div className="grid gap-1.5 mb-1" style={{ gridTemplateColumns: 'repeat(4, minmax(3.25rem, 4.5rem))' }}>
                            <span className="text-[8px] font-bold uppercase text-gray-400 text-center">ENG MCQs</span>
                            <span className="text-[8px] font-bold uppercase text-gray-400 text-center">ENG Appr</span>
                            <span className="text-[8px] font-bold uppercase text-gray-400 text-center">GUJ MCQs</span>
                            <span className="text-[8px] font-bold uppercase text-gray-400 text-center">GUJ Appr</span>
                          </div>
                          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(4, minmax(3.25rem, 4.5rem))' }}>
                            <SopMcqMetrics
                              sopCode={dm.sopCode}
                              isDualLanguage={dm.isDualLanguage}
                              mcqTotal={dm.mcqTotal}
                              mcqApproved={dm.mcqApproved}
                              mcqEngTotal={dm.mcqEngTotal}
                              mcqEngApproved={dm.mcqEngApproved}
                              mcqGujTotal={dm.mcqGujTotal}
                              mcqGujApproved={dm.mcqGujApproved}
                            />
                          </div>
                        </div>
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
                      <span><span className="font-black text-slate-700">{missingRows.length}</span> not necessary</span>
                    </div>
                  </div>

                  {/* ── two tables ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Due — employees who need to give the exam (√ done + X pending) */}
                    <div className="rounded-xl border border-emerald-100 overflow-hidden">
                      <div className="px-4 py-2.5 bg-emerald-50 flex items-center justify-between">
                        <div className="text-sm font-bold text-emerald-800">Due{dm.monthLabel ? ` (${dm.monthLabel})` : ''}</div>
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
                              <tr
                                key={`f-${r.name}-${i}`}
                                className="border-b border-gray-50 hover:bg-emerald-50/30 cursor-pointer"
                                onClick={() => openEmployeeModal(r.name, r.department)}
                              >
                                <td className="px-3 py-2 font-semibold text-gray-900 hover:text-emerald-800">{r.name}</td>
                                <td className="px-3 py-2 text-gray-600">{r.designation || '—'}</td>
                                <td className="px-3 py-2 text-gray-600">{r.department || '—'}</td>
                                <td className="px-3 py-2 font-bold text-emerald-700">{dm.monthLabel || '—'}</td>
                              </tr>
                            ))}
                            {foundRows.length === 0 && (
                              <tr><td colSpan={4} className="px-3 py-10 text-center text-gray-400">No due employees.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Not Necessary — employees with no training record for this SOP */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-between">
                        <div className="text-sm font-bold text-slate-800">Not Necessary</div>
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
                              <tr
                                key={`m-${r.name}-${i}`}
                                className="border-b border-gray-50 hover:bg-slate-50/60 cursor-pointer"
                                onClick={() => openEmployeeModal(r.name, r.department)}
                              >
                                <td className="px-3 py-2 font-semibold text-gray-900 hover:text-slate-800">{r.name}</td>
                                <td className="px-3 py-2 text-gray-600">{r.designation || '—'}</td>
                                <td className="px-3 py-2 text-gray-600">{r.department || '—'}</td>
                              </tr>
                            ))}
                            {missingRows.length === 0 && (
                              <tr><td colSpan={3} className="px-3 py-10 text-center text-gray-400">No "Not Necessary" employees.</td></tr>
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
              const totalDue = allSops.filter((r) => r.symbol !== '√').length;
              const totalAssigned = allSops.filter((r) => r.symbol === '√').length;
              const examCoveragePct = allSops.length > 0 ? Math.round((totalAssigned / allSops.length) * 100) : 0;

              // Search filter
              const q = empModalSearch.trim().toLowerCase();
              let filtered = allSops.filter((r) => {
                if (empModalFilter === 'due' && r.symbol === '√') return false;
                if (empModalFilter === 'assigned' && r.symbol !== '√') return false;
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

              // When no status filter, keep due-first grouping (exam pending before assigned)
              const displayRows = empModalFilter === 'all' && !q
                ? [...filtered.filter((r) => r.symbol !== '√'), ...filtered.filter((r) => r.symbol === '√')]
                : filtered;

              const toggleSort = (field: 'code' | 'name' | 'month') => {
                setEmpModalSort((s) =>
                  s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }
                );
              };

              const toggleFilter = (f: 'due' | 'assigned') => {
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
                      onClick={() => toggleFilter('due')}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition select-none ${empModalFilter === 'due'
                        ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                        : 'bg-gray-100 border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-700'
                        }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${empModalFilter === 'due' ? 'bg-white' : 'bg-gray-400'}`} />
                      Due SOPs: {totalDue}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFilter('assigned')}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition select-none ${empModalFilter === 'assigned'
                        ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                        : 'bg-gray-100 border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600'
                        }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${empModalFilter === 'assigned' ? 'bg-white' : 'bg-gray-400'}`} />
                      Assigned SOPs: {totalAssigned}
                    </button>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${empModalFilter === 'all' && !q ? 'bg-gray-100 border-gray-200 text-gray-600' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                      Scheduled: {allSops.length}
                    </span>
                    {allSops.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 border border-purple-200 px-3 py-1 text-xs font-bold text-purple-700">
                        Exam Coverage: {examCoveragePct}%
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
                            const isDue = r.symbol !== '√';
                            const sopStatus = data?.sopStatusByCode?.[r.sopCode] || data?.sopStatusByCode?.[stripVersion(r.sopCode)];
                            const sopTitle = sopStatus?.title || '—';
                            const isExpired = sopStatus?.expired;
                            const targetDate = sopStatus?.targetDate;
                            const totalMcq = sopStatus?.totalQuestions ?? 0;
                            const approvedMcq = sopStatus?.approvedCount ?? 0;

                            const dueCount = displayRows.filter((x) => x.symbol !== '√').length;
                            const showDueHeader = showSections && idx === 0 && dueCount > 0;
                            const showAssignedHeader = showSections && idx === dueCount && displayRows.filter((x) => x.symbol === '√').length > 0;

                            return (
                              <Fragment key={`es-${r.sopCode}`}>
                                {showDueHeader && (
                                  <tr>
                                    <td colSpan={6} className="px-3 py-1.5 bg-amber-50 border-b border-amber-100">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Due — exam pending ({dueCount})</span>
                                    </td>
                                  </tr>
                                )}
                                {showAssignedHeader && (
                                  <tr>
                                    <td colSpan={6} className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Assigned ({displayRows.filter((x) => x.symbol === '√').length})</span>
                                    </td>
                                  </tr>
                                )}
                                <tr className={`border-b border-gray-50 transition ${isDue ? 'bg-amber-50/25 hover:bg-amber-50/50' : 'hover:bg-emerald-50/20'}`}>
                                  <td className="px-3 py-2">
                                    {isDue ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-800">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                        Due
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                        Assigned
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
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${activeFilter === f
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
                          onClick={() => openEmployeeModal(r.name, r.department)}
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

  function FalsySopDataSection({
    rows,
    expanded,
    onToggle,
    onIgnoreAll,
    dismissed = false,
    sectionId = 'falsy-sop-data',
  }: {
    rows: FalsySopRow[];
    expanded: boolean;
    onToggle: () => void;
    onIgnoreAll?: () => void;
    dismissed?: boolean;
    sectionId?: string;
  }) {
    if (rows.length === 0) return null;
    const borderCls = dismissed ? 'border-gray-300 bg-gray-50' : 'border-red-300 bg-red-50';
    const headerCls = dismissed ? 'border-gray-200 bg-gray-100/80' : 'border-red-200 bg-red-100/80';
    return (
      <section
        id={sectionId}
        className={`rounded-2xl border-2 shadow-sm overflow-hidden ${dismissed ? 'mt-3' : 'mb-4'} ${borderCls}`}
      >
        <div className={`flex flex-wrap items-center gap-2 px-4 py-3 border-b ${headerCls}`}>
          <button
            type="button"
            onClick={onToggle}
            className="flex flex-1 min-w-0 items-center gap-2 text-left hover:opacity-80 transition"
          >
            {expanded ? (
              <ChevronDown className={`h-4 w-4 shrink-0 ${dismissed ? 'text-gray-600' : 'text-red-700'}`} />
            ) : (
              <ChevronRight className={`h-4 w-4 shrink-0 ${dismissed ? 'text-gray-600' : 'text-red-700'}`} />
            )}
            {!dismissed && <AlertTriangle className="h-4 w-4 text-red-700 shrink-0" />}
            <span className={`text-sm font-black ${dismissed ? 'text-gray-700' : 'text-red-900'}`}>
              {dismissed ? 'Ignored falsy data' : 'Falsy data'}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${dismissed ? 'bg-gray-500 text-white' : 'bg-red-600 text-white'}`}
            >
              {rows.length}
            </span>
            <span className={`text-xs w-full sm:w-auto ${dismissed ? 'text-gray-600' : 'text-red-800/90'}`}>
              {dismissed
                ? 'Not included in the registry table — ignored and kept below for reference only.'
                : 'Not included in the registry table — excluded from the training table below.'}
            </span>
          </button>
          {onIgnoreAll && !dismissed && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onIgnoreAll();
              }}
              className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-[11px] font-bold text-red-800 hover:bg-red-100 transition"
            >
              Ignore all
            </button>
          )}
        </div>
        {expanded && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[52rem]">
              <thead className={dismissed ? 'bg-gray-100/80' : 'bg-red-100/50'}>
                <tr>
                  <th className={`px-3 py-2 font-bold ${dismissed ? 'text-gray-600' : 'text-red-900/70'}`}>#</th>
                  <th className={`px-3 py-2 font-bold ${dismissed ? 'text-gray-600' : 'text-red-900/70'}`}>SOP Code</th>
                  <th className={`px-3 py-2 font-bold ${dismissed ? 'text-gray-600' : 'text-red-900/70'}`}>SOP Name</th>
                  <th className={`px-3 py-2 font-bold ${dismissed ? 'text-gray-600' : 'text-red-900/70'}`}>Dept</th>
                  <th className={`px-3 py-2 font-bold ${dismissed ? 'text-gray-600' : 'text-red-900/70'}`}>Month</th>
                  <th className={`px-3 py-2 font-bold ${dismissed ? 'text-gray-600' : 'text-red-900/70'}`}>Trainer</th>
                  <th className={`px-3 py-2 font-bold ${dismissed ? 'text-gray-600' : 'text-red-900/70'}`}>Trained</th>
                  <th className={`px-3 py-2 font-bold ${dismissed ? 'text-gray-600' : 'text-red-900/70'}`}>Pending</th>
                  <th className={`px-3 py-2 font-bold ${dismissed ? 'text-gray-600' : 'text-red-900/70'}`}>%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.key} className={`border-t bg-white/70 hover:bg-white ${dismissed ? 'border-gray-100' : 'border-red-100'}`}>
                    <td className={`px-3 py-2 font-bold tabular-nums ${dismissed ? 'text-gray-400' : 'text-red-400'}`}>{idx + 1}</td>
                    <td className="px-3 py-2 font-mono font-black text-gray-900">{r.sopCode}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${dismissed ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-red-100 border-red-300 text-red-800'}`}
                      >
                        {dismissed ? 'Not in registry' : 'ERROR — empty SOP name'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-bold text-gray-800">{r.dept}</td>
                    <td className="px-3 py-2 text-gray-700">{r.month || '—'}</td>
                    <td className={`px-3 py-2 font-semibold ${r.trainer ? 'text-emerald-700' : 'text-red-600'}`}>
                      {r.trainer || 'No Trainer'}
                    </td>
                    <td className="px-3 py-2 font-bold text-emerald-700">{r.completed}</td>
                    <td className="px-3 py-2 font-bold text-red-700">{r.pending}</td>
                    <td className="px-3 py-2 font-semibold text-gray-800">{r.completionPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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

      const isDefaultSort = sopSortField === 'dept' && sopSortDir === 'asc';
      const sortBar = !isDefaultSort ? (
        <div className="flex items-center px-1 mb-2">
          <button
            type="button"
            onClick={() => { setSopSortField('dept'); setSopSortDir('asc'); }}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border bg-white text-gray-500 border-gray-200 hover:border-purple-400 hover:text-purple-700 transition"
          >
            ↺ Reset Sort
          </button>
        </div>
      ) : null;

      const sopSortFn = (a: { sopCode: string; title?: string; dept: string; dbDept?: string; month: string; targetDate?: string | null; trainer?: string; totalApplicable: number; mcqEngTotal?: number; mcqGujTotal?: number; mcqEngApproved?: number; mcqGujApproved?: number }, b: typeof a) => {
        let va: string | number = '';
        let vb: string | number = '';
        if (sopSortField === 'sopCode') { va = a.sopCode; vb = b.sopCode; }
        else if (sopSortField === 'title') { va = a.title || ''; vb = b.title || ''; }
        else if (sopSortField === 'dept') { va = a.dept; vb = b.dept; }
        else if (sopSortField === 'dbDept') { va = a.dbDept || ''; vb = b.dbDept || ''; }
        else if (sopSortField === 'month') { va = MONTHS.indexOf(a.month); vb = MONTHS.indexOf(b.month); }
        else if (sopSortField === 'expiry') { va = a.targetDate ? new Date(a.targetDate).getTime() : 0; vb = b.targetDate ? new Date(b.targetDate).getTime() : 0; }
        else if (sopSortField === 'trainer') { va = a.trainer || ''; vb = b.trainer || ''; }
        else if (sopSortField === 'applicable') { va = a.totalApplicable; vb = b.totalApplicable; }
        else if (sopSortField === 'mcq_eng') { va = a.mcqEngTotal ?? 0; vb = b.mcqEngTotal ?? 0; }
        else if (sopSortField === 'mcq_guj') { va = a.mcqGujTotal ?? 0; vb = b.mcqGujTotal ?? 0; }
        else if (sopSortField === 'mcq_eng_approved') { va = a.mcqEngApproved ?? 0; vb = b.mcqEngApproved ?? 0; }
        else if (sopSortField === 'mcq_guj_approved') { va = a.mcqGujApproved ?? 0; vb = b.mcqGujApproved ?? 0; }
        if (typeof va === 'number' && typeof vb === 'number') return sopSortDir === 'asc' ? va - vb : vb - va;
        return sopSortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      };

      // Column header row with clickable sort
      const HeaderCell = ({ label, sortKey }: { label: string; sortKey?: typeof sopSortField }) => {
        const active = sortKey && sopSortField === sortKey;
        return (
          <button
            type="button"
            onClick={() => {
              if (!sortKey) return;
              if (active) setSopSortDir((d) => d === 'asc' ? 'desc' : 'asc');
              else { setSopSortField(sortKey); setSopSortDir('asc'); }
            }}
            className={`text-[9px] font-bold uppercase tracking-wider transition ${active ? 'text-purple-700' : 'text-gray-400 hover:text-gray-600'} ${sortKey ? 'cursor-pointer' : ''}`}
          >
            {label}
            {active && <span className="ml-0.5">{sopSortDir === 'asc' ? '↑' : '↓'}</span>}
          </button>
        );
      };

      const colHeader = (
        <div className="grid items-center gap-x-2 px-4 py-1 rounded-xl bg-white/60 border border-gray-100" style={{ gridTemplateColumns: SOP_TABLE_GRID_COLS }}>
          <span className="text-[9px] font-bold text-gray-400 text-right">#</span>
          <HeaderCell label="Code" sortKey="sopCode" />
          <HeaderCell label="Title" sortKey="title" />
          <HeaderCell label="Dept (DB)" sortKey="dbDept" />
          <HeaderCell label="Dept" sortKey="dept" />
          <HeaderCell label="Month" sortKey="month" />
          <HeaderCell label="Trainer" sortKey="trainer" />
          <HeaderCell label="Docs" />
          <HeaderCell label="ENG MCQs" sortKey="mcq_eng" />
          <HeaderCell label="ENG Appr" sortKey="mcq_eng_approved" />
          <HeaderCell label="GUJ MCQs" sortKey="mcq_guj" />
          <HeaderCell label="GUJ Appr" sortKey="mcq_guj_approved" />
          <HeaderCell label="Expiry" sortKey="expiry" />
        </div>
      );

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
          const accent = getDeptAccent((g.department as Dept) || 'Total');
          for (const s of g.sops) {
            if (!map.has(s.sopCode)) map.set(s.sopCode, { sopCode: s.sopCode, title: s.title || '', month: s.month, items: [] });
            map.get(s.sopCode)!.items.push({ dept: g.department, accent, ...s, pendingEmployees: s.pendingEmployees });
          }
        }
        const list = [...map.values()].sort((a, b) => {
          const fa = { sopCode: a.sopCode, title: a.title, dept: a.items[0]?.dept || '', dbDept: dbDeptBySopCode.get(stripVersion(a.sopCode).toUpperCase()) || '', month: a.month, targetDate: (a.items[0] as any)?.targetDate, trainer: (a.items[0] as any)?.trainer || '', totalApplicable: a.items[0]?.totalApplicable || 0, mcqEngTotal: (a.items[0] as any)?.mcqEngTotal, mcqGujTotal: (a.items[0] as any)?.mcqGujTotal, mcqEngApproved: (a.items[0] as any)?.mcqEngApproved, mcqGujApproved: (a.items[0] as any)?.mcqGujApproved };
          const fb = { sopCode: b.sopCode, title: b.title, dept: b.items[0]?.dept || '', dbDept: dbDeptBySopCode.get(stripVersion(b.sopCode).toUpperCase()) || '', month: b.month, targetDate: (b.items[0] as any)?.targetDate, trainer: (b.items[0] as any)?.trainer || '', totalApplicable: b.items[0]?.totalApplicable || 0, mcqEngTotal: (b.items[0] as any)?.mcqEngTotal, mcqGujTotal: (b.items[0] as any)?.mcqGujTotal, mcqEngApproved: (b.items[0] as any)?.mcqEngApproved, mcqGujApproved: (b.items[0] as any)?.mcqGujApproved };
          return sopSortFn(fa, fb);
        });
        const showAllRegistryRows = Boolean(capsuleSopFilter) || activeMonth !== 'All';
        const validList = showAllRegistryRows ? list : list.filter((s) => hasSopTitle(s.title));
        return (
          <div className="overflow-x-auto">
            <div className="space-y-1 min-w-[74rem]">
              {sortBar}
              {colHeader}
              {validList.map((s) => (
                <div key={s.sopCode} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                        {s.sopCode} {s.title && <span className="ml-2 font-sans font-bold text-purple-900 opacity-60">{s.title}</span>}
                      </span>
                      {!!s.month && <span className="text-[10px] font-semibold text-gray-500">{s.month}</span>}
                    </div>
                    <span className="text-[11px] text-gray-500">{s.items.length} dept{s.items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="p-3 space-y-1">
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
          </div>
        );
      }

      // default groupBy department — flat sorted list
      const flatRows = sopWiseGroups.flatMap((g) =>
        g.sops.map((s, rowIdx) => {
          const dept = g.department !== 'All' ? g.department : ((s as any).primaryDept || g.department);
          return {
          key: capsuleSopFilter?.excelOccurrenceMeta ? `${dept}|${s.sopCode}|${rowIdx}` : `${dept}|${s.sopCode}`,
          dept,
          dbDept: dbDeptBySopCode.get(stripVersion(s.sopCode).toUpperCase()) || '',
          accent: getDeptAccent((dept as Dept) || 'Total'),
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
          };
        })
      ).sort(sopSortFn);

      const showAllRegistryRows = Boolean(capsuleSopFilter) || activeMonth !== 'All';
      const validFlatRows = showAllRegistryRows ? flatRows : flatRows.filter((s) => hasSopTitle(s.title));

      return (
        <div className="overflow-x-auto">
          <div className="space-y-1 min-w-[74rem]">
            {sortBar}
            {colHeader}
            {validFlatRows.map((s, idx) => (
              <SopCard
                key={s.key}
                dept={s.dept}
                accent={s.accent}
                sr={idx + 1}
                sop={s}
              />
            ))}
          </div>
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
          const accent = getDeptAccent((k as Dept) || 'Total');
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
                  style={{ background: g.accent || getDeptAccent('Total') }}
                >
                  {g.title}
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent" />
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{g.items.length} capsule{g.items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-3">
                {g.items.map((cap, i) => {
                  const accent = getDeptAccent((cap.department as Dept) || 'Total');
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
                              month: monthForCode(monthMap, sopCode) || '',
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
                  const accent = getDeptAccent((cap.department as Dept) || 'Total');
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
          const accent = getDeptAccent((dept as Dept) || 'Total');
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

      <main className="mx-auto max-w-[1600px] px-5 py-5">
        {/* Cards row */}
        <section className="mb-5 overflow-x-auto">
          {loading && !data ? (
            <div className="grid gap-2 pb-2" style={{ gridTemplateColumns: `repeat(${departments.length + 1}, minmax(190px, 1fr))` }}>
              {Array.from({ length: departments.length + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[340px] animate-pulse rounded-xl bg-white"
                />
              ))}
            </div>
          ) : data ? (
            <div className="grid gap-2 pb-2" style={{ gridTemplateColumns: `repeat(${departments.length + 1}, minmax(190px, 1fr))` }}>
              {renderTotalCard(data.totalCard)}
              {departments.map((dept) => (
                <Fragment key={dept}>{renderDeptCard(dept, data.perDept[dept])}</Fragment>
              ))}
            </div>
          ) : (
            <EmptyState onUpload={() => setShowUpload(true)} />
          )}
        </section>

        {/* Details panel disabled: summary clicks filter capsules instead */}

        {/* Dept + Month filters — single line, depts left, months right */}
        {data && (
          <section className="mb-4">
            <div className="flex w-full items-center justify-between gap-2 flex-nowrap overflow-x-auto">
              <div className="flex items-center gap-1 flex-nowrap shrink-0">
                <Pill
                  label="All Depts"
                  active={activeDept === 'All'}
                  accent={getDeptAccent('Total')}
                  onClick={() => setActiveDept('All')}
                />
                {departments.map((d) => (
                  <Pill
                    key={d}
                    label={d}
                    active={activeDept === d}
                    accent={getDeptAccent(d)}
                    onClick={() => setActiveDept(d)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1 flex-nowrap shrink-0">
                <MonthCapsule
                  label="All"
                  count={totalUniqueSops}
                  active={activeMonth === 'All'}
                  accent={activeDept === 'All' ? getDeptAccent('Total') : getDeptAccent(activeDept)}
                  onClick={() => setActiveMonth('All')}
                />
                {MONTHS.map((m) => (
                  <MonthCapsule
                    key={m}
                    label={MONTH_SHORT[m]}
                    count={monthCountsForGrid[m] || 0}
                    active={activeMonth === m}
                    accent={activeDept === 'All' ? getDeptAccent('Total') : getDeptAccent(activeDept)}
                    onClick={() => setActiveMonth(m)}
                  />
                ))}
              </div>
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
                {viewMode === 'sop' && pendingFalsyRows.length > 0 && (
                  <a
                    href="#falsy-sop-data"
                    className="flex items-center gap-1 rounded-lg border-2 border-red-300 bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-800 hover:bg-red-100 transition"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {pendingFalsyRows.length} falsy
                  </a>
                )}
                {capsuleSopFilter ? (
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-700 border border-purple-200">
                      {capsuleSopFilter.excelOccurrenceMeta?.length ??
                        capsuleSopFilter.repeatMeta?.length ??
                        capsuleSopFilter.sopCodes.size}{' '}
                      SOPs
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

            {viewMode === 'sop' && pendingFalsyRows.length > 0 && (
              <FalsySopDataSection
                rows={pendingFalsyRows}
                expanded={falsyPanelExpanded}
                onToggle={() => setFalsyPanelExpanded((v) => !v)}
                onIgnoreAll={ignoreAllFalsy}
              />
            )}

            <CapsulesBody />

            {viewMode === 'sop' && ignoredFalsyRows.length > 0 && (
              <FalsySopDataSection
                rows={ignoredFalsyRows}
                expanded={falsyDismissedExpanded}
                onToggle={() => setFalsyDismissedExpanded((v) => !v)}
                dismissed
                sectionId="falsy-sop-data-ignored"
              />
            )}
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
          defaultDept={activeDept === 'All' ? departments[0] || 'QA' : activeDept}
          departments={departments}
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
      className="rounded-full px-2 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap transition"
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
      className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap transition"
      style={
        active
          ? { background: accent, color: '#fff' }
          : { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }
      }
    >
      <span>{label}</span>
      <span
        className="rounded-full px-1 text-[8px] font-semibold leading-none"
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
                    style={{ borderLeftColor: getDeptAccent(department as Dept) || '#e5e7eb' }}
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
                          className={`border-white px-2 py-1.5 text-center font-bold ${ok ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
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
