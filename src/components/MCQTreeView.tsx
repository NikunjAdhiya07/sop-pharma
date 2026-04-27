"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  BookOpen,
  Download,
  Eye,
  SortAsc,
  SortDesc,
  Star,
  Search,
  Loader2,
  X,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  MessageSquare,
  Info,
  ArrowRight,
  Users,
  Maximize2,
  Minimize2,
  LayoutList,
  FolderOpen as FolderOpenIcon, // alias if needed, though FolderOpen is used
  Archive,
  Trash2,
  Plus,
  RotateCcw,
  Zap,
  XCircle,
  RefreshCw,
  Copy,
} from "lucide-react";
import Link from "next/link";
import { normalizeDepartmentName } from "@/lib/mcqTreeBuilder";

function cleanSOPName(rawName: string, identifier: string): string {
  let name = rawName || "";

  if (name.includes("/")) {
    const segments = name.split("/").filter((s) => s.trim());
    const lastSegment = segments[segments.length - 1] || name;
    name = lastSegment;
  }

  // Remove identifier prefix if present
  if (identifier) {
    const idUpper = identifier.toUpperCase();
    const nameUpper = name.toUpperCase();

    if (nameUpper.startsWith(idUpper)) {
      name = name.substring(identifier.length).replace(/^[\s\-_:\.]+/, "").trim();
    } else {
      // Also try stripping without the revision if identifier has one (e.g. QAGE01-10 -> QAGE01)
      const baseIdMatch = identifier.match(/^([A-Z]+\d+)/i);
      if (baseIdMatch) {
        const baseId = baseIdMatch[1].toUpperCase();
        if (nameUpper.startsWith(baseId)) {
          name = name.substring(baseId.length).replace(/^[\s\-_:\.]+/, "").trim();
        }
      }
    }
  }

  // Strip leading digits followed by spaces or separators (common in file lists, e.g. "0 BATCH...")
  name = name.replace(/^[0-9]+[\s\-_:\.]+/, "").trim();

  // Remove underscores and clean up whitespace
  name = name.replace(/_/g, " ").replace(/\s+/g, " ").trim();

  // If name is purely numeric (e.g. "1774768105796"), or empty, use a default
  const isPurelyNumeric = /^[0-9\s\-_:\.]+$/.test(name);
  if (!name || isPurelyNumeric) {
    return "Standard Operating Procedure";
  }

  return name;
}

// Helper to get department theme colors
// Helper to get department theme colors - High Quality Vibrance
const getDeptTheme = (deptName: string) => {
  const name = deptName.toLowerCase();

  if (name.includes("qa"))
    return {
      text: "text-white",
      textHover: "group-hover:text-purple-100",
      bg: "bg-purple-600",
      badge: "bg-white/20 border-white/30 text-white",
      border: "border-purple-500",
      borderHover: "hover:border-purple-400",
      gradient: "from-purple-600 via-purple-700 to-purple-800",
      subcatBg: "from-purple-600 to-purple-700",
      cardBg: "bg-gradient-to-br from-purple-500 to-purple-700",
      statBg: "bg-purple-800/40",
      icon: "text-purple-200",
      secondary: "text-purple-100",
      accentText: "text-purple-200",
      button: "bg-white/20 hover:bg-white/30 text-white border-white/30",
    };

  if (name.includes("qc"))
    return {
      text: "text-white",
      textHover: "group-hover:text-blue-100",
      bg: "bg-blue-600",
      badge: "bg-white/20 border-white/30 text-white",
      border: "border-blue-500",
      borderHover: "hover:border-blue-400",
      gradient: "from-blue-500 via-blue-600 to-blue-700",
      subcatBg: "from-blue-500 to-blue-700",
      cardBg: "bg-gradient-to-br from-blue-500 to-blue-700",
      statBg: "bg-blue-800/40",
      icon: "text-blue-200",
      secondary: "text-blue-100",
      accentText: "text-blue-200",
      button: "bg-white/20 hover:bg-white/30 text-white border-white/30",
    };

  if (name.includes("microbiology"))
    return {
      text: "text-white",
      textHover: "group-hover:text-orange-100",
      bg: "bg-orange-600",
      badge: "bg-white/20 border-white/30 text-white",
      border: "border-orange-500",
      borderHover: "hover:border-orange-400",
      gradient: "from-orange-500 via-orange-600 to-orange-700",
      subcatBg: "from-orange-500 to-orange-700",
      cardBg: "bg-gradient-to-br from-orange-500 to-orange-700",
      statBg: "bg-orange-800/40",
      icon: "text-orange-200",
      secondary: "text-orange-100",
      accentText: "text-orange-200",
      button: "bg-white/20 hover:bg-white/30 text-white border-white/30",
    };

  if (name.includes("production"))
    return {
      text: "text-white",
      textHover: "group-hover:text-emerald-100",
      bg: "bg-emerald-600",
      badge: "bg-white/20 border-white/30 text-white",
      border: "border-emerald-500",
      borderHover: "hover:border-emerald-400",
      gradient: "from-emerald-500 via-emerald-600 to-emerald-700",
      subcatBg: "from-emerald-500 to-emerald-700",
      cardBg: "bg-gradient-to-br from-emerald-500 to-emerald-700",
      statBg: "bg-emerald-800/40",
      icon: "text-emerald-200",
      secondary: "text-emerald-100",
      accentText: "text-emerald-200",
      button: "bg-white/20 hover:bg-white/30 text-white border-white/30",
    };

  if (name.includes("store"))
    return {
      text: "text-white",
      textHover: "group-hover:text-amber-100",
      bg: "bg-amber-600",
      badge: "bg-white/20 border-white/30 text-white",
      border: "border-amber-500",
      borderHover: "hover:border-amber-400",
      gradient: "from-amber-500 via-amber-600 to-amber-700",
      subcatBg: "from-amber-500 to-amber-700",
      cardBg: "bg-gradient-to-br from-amber-500 to-amber-700",
      statBg: "bg-amber-800/40",
      icon: "text-amber-200",
      secondary: "text-amber-100",
      accentText: "text-amber-200",
      button: "bg-white/20 hover:bg-white/30 text-white border-white/30",
    };

  if (name.includes("engineering"))
    return {
      text: "text-white",
      textHover: "group-hover:text-cyan-100",
      bg: "bg-cyan-600",
      badge: "bg-white/20 border-white/30 text-white",
      border: "border-cyan-500",
      borderHover: "hover:border-cyan-400",
      gradient: "from-cyan-500 via-cyan-600 to-cyan-700",
      subcatBg: "from-cyan-500 to-cyan-700",
      cardBg: "bg-gradient-to-br from-cyan-500 to-cyan-700",
      statBg: "bg-cyan-800/40",
      icon: "text-cyan-200",
      secondary: "text-cyan-100",
      accentText: "text-cyan-200",
      button: "bg-white/20 hover:bg-white/30 text-white border-white/30",
    };

  if (name.includes("personnel") || name.includes("hr"))
    return {
      text: "text-white",
      textHover: "group-hover:text-pink-100",
      bg: "bg-pink-600",
      badge: "bg-white/20 border-white/30 text-white",
      border: "border-pink-500",
      borderHover: "hover:border-pink-400",
      gradient: "from-pink-500 via-pink-600 to-rose-600",
      subcatBg: "from-pink-500 to-rose-600",
      cardBg: "bg-gradient-to-br from-pink-500 to-rose-600",
      statBg: "bg-pink-800/40",
      icon: "text-pink-200",
      secondary: "text-pink-100",
      accentText: "text-pink-200",
      button: "bg-white/20 hover:bg-white/30 text-white border-white/30",
    };

  return {
    text: "text-white",
    textHover: "group-hover:text-indigo-100",
    bg: "bg-indigo-600",
    badge: "bg-white/20 border-white/30 text-white",
    border: "border-indigo-500",
    borderHover: "hover:border-indigo-400",
    gradient: "from-indigo-500 via-indigo-600 to-indigo-700",
    subcatBg: "from-indigo-500 to-indigo-700",
    cardBg: "bg-gradient-to-br from-indigo-500 to-indigo-700",
    statBg: "bg-indigo-800/40",
    icon: "text-indigo-200",
    secondary: "text-indigo-100",
    accentText: "text-indigo-200",
    button: "bg-white/20 hover:bg-white/30 text-white border-white/30",
  };
};

interface SOPNode {
  sopId: string;
  sopCode: string;
  sopName: string;
  sopFileUrl: string;
  sopFileUrlGujarati?: string;
  sopFileType: "pdf" | "docx";
  isObsolete?: boolean;
  mcqBanks: any[];
  totalQuestions: number;
  checkedCount?: number;
  reviewedCount?: number;
  similarCount?: number;
}

interface SubcategoryNode {
  code: string;
  name: string;
  sops: SOPNode[];
  totalSOPs: number;
  totalQuestions: number;
  checkedCount?: number;
  reviewedCount?: number;
  similarCount?: number;
}

interface DepartmentNode {
  type: "department";
  name: string;
  icon?: string;
  totalSOPs: number;
  totalQuestions: number;
  checkedCount?: number;
  reviewedCount?: number;
  similarCount?: number;
  subcategories: SubcategoryNode[];
}

interface MCQTreeViewProps {
  tree: DepartmentNode[];
  unorganized: {
    sops: SOPNode[];
    totalSOPs: number;
    totalQuestions: number;
  };
  searchTerm?: string;
  onViewMCQs: (
    sopNode: SOPNode,
    filterStatus?: "all" | "checked" | "pending" | "similar" | "reviewed",
  ) => void;
  onDownloadSOP: (sopNode: SOPNode) => void;

  // Lifted state for persistence
  expandedDepts: Set<string>;
  setExpandedDepts: (expanded: Set<string>) => void;
  expandedSubcats: Set<string>;
  setExpandedSubcats: (expanded: Set<string>) => void;
  expandedSOPs: Set<string>;
  setExpandedSOPs: (expanded: Set<string>) => void;

  // Lifted fullScreenDept so it survives parent re-renders (e.g. loading spinner)
  fullScreenDept: DepartmentNode | null;
  setFullScreenDept: (dept: DepartmentNode | null) => void;
  trainerMappings?: Record<string, string>;
  // Increment this from the parent to force a dept-stats refresh
  refreshDeptStatsKey?: number;
}

export default function MCQTreeView({
  tree,
  unorganized,
  searchTerm = "",
  onViewMCQs,
  onDownloadSOP,
  expandedDepts,
  setExpandedDepts,
  expandedSubcats,
  setExpandedSubcats,
  expandedSOPs,
  setExpandedSOPs,
  fullScreenDept,
  setFullScreenDept,
  trainerMappings = {},
  refreshDeptStatsKey = 0,
}: MCQTreeViewProps) {
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  // Expansion state is now managed by parent
  const [isUnorganizedExpanded, setIsUnorganizedExpanded] = useState(false);
  const [showDeptCards, setShowDeptCards] = useState(false);
  // Inline subcategory dropdown expansion state for folder cards
  const [expandedFolderDropdowns, setExpandedFolderDropdowns] = useState<Set<string>>(new Set());
  const toggleFolderDropdown = (deptName: string) => {
    setExpandedFolderDropdowns(prev => {
      const next = new Set(prev);
      if (next.has(deptName)) next.delete(deptName); else next.add(deptName);
      return next;
    });
  };

  // MCQ Registry table state
  const [mcqRegistryDeptFilter, setMcqRegistryDeptFilter] = useState('All');
  const [mcqRegistryLangFilter, setMcqRegistryLangFilter] = useState('All');
  const [mcqRegistrySearch, setMcqRegistrySearch] = useState('');
  const [mcqRegistryMcqFilter, setMcqRegistryMcqFilter] = useState<'all' | 'found' | 'notfound'>('all');
  const [mcqRegistrySortCol, setMcqRegistrySortCol] = useState<'identifier' | 'name' | 'dept' | 'lang' | 'totalQ' | 'remaining' | 'approved' | 'partial' | 'similar' | 'lastUpdated'>('identifier');
  const [mcqRegistrySortDir, setMcqRegistrySortDir] = useState<'asc' | 'desc'>('asc');
  const mcqRegistryRef = useRef<HTMLDivElement>(null);

  // Archived / Removed SOPs state
  const [archivedSOPs, setArchivedSOPs] = useState<any[]>([]);
  const [showArchivedSection, setShowArchivedSection] = useState(false);
  const [showObsoleteDetails, setShowObsoleteDetails] = useState(false);
  const [restoringAllArchived, setRestoringAllArchived] = useState(false);
  const [restoreAllResult, setRestoreAllResult] = useState<{ success: boolean; message: string } | null>(null);

  // Per-department MCQ stats from /api/mcq-bank/dept-stats (includes total SOP count from SOP model)
  const [deptStats, setDeptStats] = useState<Record<string, {
    totalSOPs: number;
    totalSopPairs: number;
    mcqFoundPairs: number;
    mcqNotFoundPairs: number;
    sopWithMCQs: number;
    sopWithoutMCQs: number;
    approvedSOPs: number;
    partialSOPs: number;
    pendingSOPs: number;
    similarSOPs: number;
    totalQuestions: number;
    checkedCount: number;
    reviewedCount: number;
    similarCount: number;
    sopEng: number;
    sopGuj: number;
    sopCompletedGen: number;
    sopUnder100MCQs: number;
    totalSopEng: number;
    totalSopGuj: number;
    remainingEng: number;
    remainingGuj: number;
    remainingSOPs: { identifier: string; name: string }[];
  }>>({});
  // Overall remaining SOPs list (no MCQ bank yet) — from dept-stats API
  const [overallRemainingSOPs, setOverallRemainingSOPs] = useState<{ identifier: string; name: string }[]>([]);
  // When set, show a "remaining SOPs" panel instead of opening fullscreen dept modal
  const [remainingPanel, setRemainingPanel] = useState<{ dept: string; sops: { identifier: string; name: string }[] } | null>(null);
  const [deptStatsLoading, setDeptStatsLoading] = useState(true);

  // Generate More state
  const [generatingMore, setGeneratingMore] = useState<Record<string, boolean>>({});
  const [generateMoreResults, setGenerateMoreResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Approval filter for department modal (set by clicking capsules on dept cards)
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'approved' | 'partial' | 'pending' | 'similar' | 'sops' | 'checked' | 'reviewed' | 'completed' | 'target' | 'zero'>('all');

  // Delete SOP state
  // Delete feature intentionally removed — SOPs should only be marked obsolete via dashboard.

  // Restore SOP state
  const [restoringSOPs, setRestoringSOPs] = useState<Record<string, boolean>>({});
  const [restoreResults, setRestoreResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const handleRestoreSOP = async (sopIdentifier: string) => {
    setRestoringSOPs(prev => ({ ...prev, [sopIdentifier]: true }));
    setRestoreResults(prev => {
      const next = { ...prev };
      delete next[sopIdentifier];
      return next;
    });
    try {
      const password = window.prompt(`Enter password to restore "${sopIdentifier}" from Obsolete:`);
      if (!password) {
        setRestoreResults(prev => ({ ...prev, [sopIdentifier]: { success: false, message: 'Cancelled' } }));
        return;
      }
      const res = await fetch('/api/sop/remove-obsolete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sopIdentifier: sopIdentifier, password }),
      });
      const data = await res.json();
      if (data.success) {
        setRestoreResults(prev => ({ ...prev, [sopIdentifier]: { success: true, message: 'Restored!' } }));
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setRestoreResults(prev => ({ ...prev, [sopIdentifier]: { success: false, message: data.error || 'Failed' } }));
      }
    } catch {
      setRestoreResults(prev => ({ ...prev, [sopIdentifier]: { success: false, message: 'Network error' } }));
    } finally {
      setRestoringSOPs(prev => ({ ...prev, [sopIdentifier]: false }));
    }
  };

  const handleRestoreAllArchived = async () => {
    if (restoringAllArchived) return;
    setRestoringAllArchived(true);
    setRestoreAllResult(null);
    try {
      const password = window.prompt(`Enter password to restore ALL obsolete SOPs:`);
      if (!password) {
        setRestoreAllResult({ success: false, message: 'Cancelled' });
        return;
      }
      const identifiers = (archivedSOPs || []).map((s: any) => String(s?.sopIdentifier || '').trim()).filter(Boolean);
      if (identifiers.length === 0) {
        setRestoreAllResult({ success: true, message: 'No obsolete SOPs to restore.' });
        return;
      }
      let ok = 0;
      let failed = 0;
      for (const sopIdentifier of identifiers) {
        const res = await fetch('/api/sop/remove-obsolete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sopIdentifier, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) ok++;
        else failed++;
      }
      setRestoreAllResult({
        success: failed === 0,
        message: `Restored ${ok} SOP(s).${failed ? ` Failed: ${failed}.` : ''}`,
      });
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setRestoreAllResult({ success: false, message: 'Network error' });
    } finally {
      setRestoringAllArchived(false);
    }
  };

  // Bulk Dept Regeneration state
  const [bulkRegenJob, setBulkRegenJob] = useState<{
    jobId: string;
    department: string;
    status: string;
    cancelled: boolean;
    progress: {
      banksTotal: number;
      banksProcessed: number;
      banksSucceeded: number;
      banksFailed: number;
      banksSkipped: number;
      totalQuestionsReplaced: number;
      totalQuestionsFailed: number;
    };
    bankResults: Array<{
      bankId: string;
      sopIdentifier: string;
      sopName: string;
      language: string;
      status: string;
      questionsReplaced: number;
      questionsFailed: number;
      remainingSimilar: number;
      autoResolveJobId?: string;
      logs: string[];
      replacements: Array<{
        similarityScore: number;
        oldQuestion: string;
        oldAnswer: string;
        oldOptions: string[];
        newQuestion: string;
        newAnswer: string;
        newOptions: string[];
      }>;
      error?: string;
    }>;
    error?: string;
  } | null>(null);
  const [bulkRegenLoading, setBulkRegenLoading] = useState(false);
  const [bulkRegenCancelling, setBulkRegenCancelling] = useState(false);
  const [bulkRegenError, setBulkRegenError] = useState('');
  const [showBulkRegenModal, setShowBulkRegenModal] = useState(false);
  const [expandedBulkLogBanks, setExpandedBulkLogBanks] = useState<Set<string>>(new Set());
  const [bulkRegenDetailBank, setBulkRegenDetailBank] = useState<{
    bankId: string; sopIdentifier: string; sopName: string; language: string;
    status: string; questionsReplaced: number; questionsFailed: number;
    remainingSimilar: number; logs: string[];
    replacements: Array<{
      similarityScore: number;
      oldQuestion: string; oldAnswer: string; oldOptions: string[];
      newQuestion: string; newAnswer: string; newOptions: string[];
    }>;
    error?: string;
  } | null>(null);
  const bulkRegenPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drag state for bulk regen modal
  const [bulkRegenDragging, setBulkRegenDragging] = useState(false);
  const [bulkRegenModalPos, setBulkRegenModalPos] = useState({ x: 0, y: 0 });
  const [bulkRegenDragStart, setBulkRegenDragStart] = useState({ x: 0, y: 0 });

  const BULK_REGEN_STORAGE_KEY = 'mcq_bulk_regen_results';

  // Persist a completed/failed/cancelled job to localStorage so results survive refresh
  const persistBulkRegenJob = (job: NonNullable<typeof bulkRegenJob>) => {
    try {
      const done = ['completed', 'failed', 'cancelled'].includes(job.status);
      if (!done) return;
      const stored: Record<string, unknown> = JSON.parse(localStorage.getItem(BULK_REGEN_STORAGE_KEY) || '{}');
      stored[job.department] = job;
      localStorage.setItem(BULK_REGEN_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // localStorage unavailable — silently skip
    }
  };

  // Remove a department's saved result (called when a new run starts)
  const clearPersistedBulkRegenJob = (department: string) => {
    try {
      const stored: Record<string, unknown> = JSON.parse(localStorage.getItem(BULK_REGEN_STORAGE_KEY) || '{}');
      delete stored[department];
      localStorage.setItem(BULK_REGEN_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // ignore
    }
  };

  // Restore the last completed job for a department from localStorage
  const getPersistedBulkRegenJob = (department: string) => {
    try {
      const stored: Record<string, any> = JSON.parse(localStorage.getItem(BULK_REGEN_STORAGE_KEY) || '{}');
      return stored[department] ?? null;
    } catch {
      return null;
    }
  };

  // Fetch per-department MCQ stats (includes total SOP count from SOP model)
  const fetchDeptStats = useCallback(async () => {
    setDeptStatsLoading(true);
    try {
      const res = await fetch(`/api/mcq-bank/dept-stats?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.departments) {
        const map: typeof deptStats = {};
        for (const ds of data.departments) {
          map[ds.department] = ds;
        }
        setDeptStats(map);
        if (data.overall?.remainingSOPs) {
          setOverallRemainingSOPs(data.overall.remainingSOPs);
        }
      }
    } catch (err) {
      console.error('Failed to fetch dept stats:', err);
    } finally {
      setDeptStatsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopBulkRegenPolling = () => {
    if (bulkRegenPollRef.current) {
      clearInterval(bulkRegenPollRef.current);
      bulkRegenPollRef.current = null;
    }
  };

  const startBulkRegenPolling = (jobId: string) => {
    stopBulkRegenPolling();
    bulkRegenPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/mcq-bank/bulk-department-regenerate?jobId=${jobId}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.success && data.job) {
          const updatedJob = { ...data.job, jobId: data.job.id || jobId };
          setBulkRegenJob(updatedJob);
          const done = ['completed', 'failed', 'cancelled'].includes(data.job.status);
          if (done) {
            stopBulkRegenPolling();
            persistBulkRegenJob(updatedJob);
            fetchDeptStats();
          }
        }
      } catch (err) {
        console.error('[bulk-regen] Polling error:', err);
      }
    }, 3000);
  };

  const handleStartBulkRegen = async (department: string) => {
    setBulkRegenLoading(true);
    setBulkRegenError('');
    setExpandedBulkLogBanks(new Set());
    clearPersistedBulkRegenJob(department);
    try {
      const res = await fetch('/api/mcq-bank/bulk-department-regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department }),
      });
      const data = await res.json();

      // 409 = a job is already running — resume polling it instead of showing an error
      if (res.status === 409 && data.jobId) {
        const statusRes = await fetch(`/api/mcq-bank/bulk-department-regenerate?jobId=${data.jobId}`, { cache: 'no-store' });
        const statusData = await statusRes.json();
        if (statusData.success && statusData.job) {
          setBulkRegenJob({ ...statusData.job, jobId: statusData.job.id || data.jobId });
        }
        setShowBulkRegenModal(true);
        startBulkRegenPolling(data.jobId);
        return;
      }

      if (!res.ok || !data.success) {
        setBulkRegenError(data.error || 'Failed to start bulk regeneration');
        return;
      }
      // Fetch initial job state
      const statusRes = await fetch(`/api/mcq-bank/bulk-department-regenerate?jobId=${data.jobId}`, { cache: 'no-store' });
      const statusData = await statusRes.json();
      if (statusData.success && statusData.job) {
        setBulkRegenJob({ ...statusData.job, jobId: statusData.job.id || data.jobId });
      }
      setShowBulkRegenModal(true);
      startBulkRegenPolling(data.jobId);
    } catch (err: any) {
      setBulkRegenError(err.message || 'Network error');
    } finally {
      setBulkRegenLoading(false);
    }
  };

  const handleCancelBulkRegen = async () => {
    if (!bulkRegenJob || bulkRegenCancelling) return;
    setBulkRegenCancelling(true);
    try {
      await fetch(`/api/mcq-bank/bulk-department-regenerate?jobId=${bulkRegenJob.jobId}`, {
        method: 'DELETE',
      });
      stopBulkRegenPolling();
      const cancelled = { ...bulkRegenJob, status: 'cancelled', cancelled: true };
      setBulkRegenJob(cancelled);
      persistBulkRegenJob(cancelled);
    } catch (err) {
      console.error('[bulk-regen] Cancel error:', err);
    } finally {
      setBulkRegenCancelling(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopBulkRegenPolling();
  }, []);

  // Fetch obsolete SOPs (same source of truth as Dashboard) on mount
  useEffect(() => {
    const fetchArchived = async () => {
      try {
        const res = await fetch('/api/mcq-bank/obsolete');
        const data = await res.json();
        if (data.success && (data.obsoleteSOPs || data.archivedSOPs)) {
          setArchivedSOPs(data.obsoleteSOPs || data.archivedSOPs);
        }
      } catch (err) {
        console.error('Failed to fetch obsolete SOPs:', err);
      }
    };
    fetchArchived();
  }, []);

  useEffect(() => {
    fetchDeptStats();
  }, [fetchDeptStats, refreshDeptStatsKey]);

  // fullScreenDept is now lifted to parent — no local state needed

  // Modal dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Sort state for each department
  const [deptSortBy, setDeptSortBy] = useState<
    Record<
      string,
      | "name"
      | "sops"
      | "questions"
      | "checked"
      | "similar"
      | "reviewed"
      | "notChecked"
    >
  >({});
  const [deptSortOrder, setDeptSortOrder] = useState<
    Record<string, "asc" | "desc">
  >({});

  // Sort state for each subcategory
  const [subcatSortBy, setSubcatSortBy] = useState<
    Record<
      string,
      | "name"
      | "questions"
      | "identifier"
      | "checked"
      | "similar"
      | "reviewed"
      | "notChecked"
    >
  >({});
  const [subcatSortOrder, setSubcatSortOrder] = useState<
    Record<string, "asc" | "desc">
  >({});

  // Department modal: filter mode (questions view vs SOP view)
  const [deptFilterMode, setDeptFilterMode] = useState<
    "sops" | "checked" | "similar" | "reviewed" | "notChecked"
  >("sops");
  const [sopViewMode, setSOPViewMode] = useState<"file" | "table">("table");
  const [tableSortCol, setTableSortCol] = useState<"code" | "name" | "questions" | "checked" | "reviewed" | "similar">("code");
  const [tableSortDir, setTableSortDir] = useState<"asc" | "desc">("asc");

  const [deptSearchTerm, setDeptSearchTerm] = useState("");
  const [deptQuestions, setDeptQuestions] = useState<any[]>([]);
  // Similar questions grouping state
  const [similarGroups, setSimilarGroups] = useState<any[]>([]);
  const [loadingSimilarGroups, setLoadingSimilarGroups] = useState(false);

  const [loadingDeptQuestions, setLoadingDeptQuestions] = useState(false);

  // Fetch all questions for a department when switching to questions view
  const fetchDeptQuestions = useCallback(
    async (
      deptName: string,
      filter: "checked" | "similar" | "reviewed" | "notChecked",
    ) => {
      // If filter is 'similar', we use a specialized fetch for grouped data
      if (filter === "similar") {
        setLoadingSimilarGroups(true);
        try {
          const res = await fetch(
            `/api/similar-questions?department=${encodeURIComponent(deptName)}`,
            { cache: "no-store" },
          );
          const data = await res.json();
          if (data.success) {
            setSimilarGroups(data.similarQuestions || []);
          } else {
            setSimilarGroups([]);
          }
        } catch (err) {
          console.error("Error fetching similar groups:", err);
        } finally {
          setLoadingSimilarGroups(false);
        }
        return; // Skip normal fetch
      }

      setLoadingDeptQuestions(true);
      try {
        // Collect all MCQ bank IDs from the tree data (already available in fullScreenDept)
        // This is reliable because the tree computes departments from SOP identifiers,
        // NOT from the folderDepartment field which may not be set on MCQ bank documents.
        const bankIds: string[] = [];
        if (fullScreenDept) {
          fullScreenDept.subcategories.forEach((sub: any) => {
            sub.sops.forEach((sop: any) => {
              if (sop.mcqBanks && sop.mcqBanks.length > 0) {
                sop.mcqBanks.forEach((bank: any) => {
                  if (bank._id) bankIds.push(bank._id.toString());
                });
              }
            });
          });
        }

        if (bankIds.length === 0) {
          setDeptQuestions([]);
          return;
        }

        // Use bulk IDs endpoint — single request, native driver preserves isChecked/isReviewed/isSimilar
        const allQs: any[] = [];

        // Split IDs into chunks to avoid URL length limits (~2000 chars per chunk)
        const chunkSize = 50;
        for (let i = 0; i < bankIds.length; i += chunkSize) {
          const chunk = bankIds.slice(i, i + chunkSize);
          const idsParam = chunk.join(",");
          const res = await fetch(
            `/api/mcq-bank?ids=${idsParam}&t=${Date.now()}`,
            { cache: "no-store" },
          );
          const data = await res.json();
          if (data.success && data.mcqBanks) {
            data.mcqBanks.forEach((bank: any) => {
              if (bank.mcqs && bank.mcqs.length > 0) {
                bank.mcqs.forEach((mcq: any, idx: number) => {
                  allQs.push({
                    ...mcq,
                    _bankId: bank._id,
                    _sopIdentifier: bank.sopIdentifier || "",
                    _sopName: bank.sopName || "",
                    _originalIndex: idx,
                  });
                });
              }
            });
          }
        }
        setDeptQuestions(allQs);
      } catch (err) {
        console.error("Error fetching dept questions:", err);
      } finally {
        setLoadingDeptQuestions(false);
      }
    },
    [fullScreenDept],
  );

  // Reset filter mode when department changes
  useEffect(() => {
    setDeptFilterMode("sops");
    setDeptSearchTerm("");
    setDeptQuestions([]);
    setSimilarGroups([]);
    // Do NOT reset approvalFilter here, because onRowClick sets a specific filter BEFORE opening the modal!
  }, [fullScreenDept?.name]);

  // Efficient search filter function
  const searchLower = searchTerm.toLowerCase().trim();

  const matchesSOP = (sop: SOPNode): boolean => {
    if (!searchLower) return true;
    return (
      sop.sopName.toLowerCase().includes(searchLower) ||
      sop.sopCode.toLowerCase().includes(searchLower) ||
      sop.sopId.toLowerCase().includes(searchLower)
    );
  };

  const matchesSubcategory = (subcat: SubcategoryNode): boolean => {
    if (!searchLower) return true;
    // Match if subcategory name/code matches OR any SOP within it matches
    const subcatMatch =
      subcat.name.toLowerCase().includes(searchLower) ||
      subcat.code.toLowerCase().includes(searchLower);
    const sopMatch = subcat.sops.some(matchesSOP);
    return subcatMatch || sopMatch;
  };

  const matchesDepartment = (dept: DepartmentNode): boolean => {
    if (!searchLower) return true;
    // Match if department name matches OR any subcategory within it matches
    const deptMatch = dept.name.toLowerCase().includes(searchLower);
    const subcatMatch = dept.subcategories.some(matchesSubcategory);
    return deptMatch || subcatMatch;
  };

  // Helper for natural sorting (deals with numbers in strings correctly)
  const naturalCompare = (a: string, b: string) => {
    return a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  };

  // Sorting functions
  const sortSubcategories = (
    subcats: SubcategoryNode[],
    deptName: string,
  ): SubcategoryNode[] => {
    const sortBy = deptSortBy[deptName] || "name";
    const sortOrder = deptSortOrder[deptName] || "asc";

    return [...subcats].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "name":
          comparison = naturalCompare(a.name, b.name);
          break;
        case "sops":
          comparison = a.totalSOPs - b.totalSOPs;
          break;
        case "questions":
          comparison = a.totalQuestions - b.totalQuestions;
          break;
        case "checked":
          comparison =
            a.sops.reduce((sum, s) => sum + (s.checkedCount || 0), 0) -
            b.sops.reduce((sum, s) => sum + (s.checkedCount || 0), 0);
          break;
        case "similar":
          comparison =
            a.sops.reduce((sum, s) => sum + (s.similarCount || 0), 0) -
            b.sops.reduce((sum, s) => sum + (s.similarCount || 0), 0);
          break;
        case "reviewed":
          comparison =
            a.sops.reduce((sum, s) => sum + (s.reviewedCount || 0), 0) -
            b.sops.reduce((sum, s) => sum + (s.reviewedCount || 0), 0);
          break;
        case "notChecked":
          comparison =
            a.sops.reduce(
              (sum, s) => sum + (s.totalQuestions - (s.checkedCount || 0)),
              0,
            ) -
            b.sops.reduce(
              (sum, s) => sum + (s.totalQuestions - (s.checkedCount || 0)),
              0,
            );
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });
  };

  const sortSOPs = (sops: SOPNode[], subcatKey: string): SOPNode[] => {
    const sortBy = subcatSortBy[subcatKey] || "identifier"; // Default to identifier
    const sortOrder = subcatSortOrder[subcatKey] || "asc"; // Default ascending for identifiers

    return [...sops].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "identifier":
          comparison = naturalCompare(a.sopCode, b.sopCode);
          break;
        case "name":
          // Clean the names of identifier prefixes before comparing for a true "Name" sort
          const cleanA = cleanSOPName(a.sopName, a.sopCode);
          const cleanB = cleanSOPName(b.sopName, b.sopCode);
          comparison = cleanA.localeCompare(cleanB, undefined, {
            sensitivity: "base",
          });
          break;
        case "questions":
          comparison = a.totalQuestions - b.totalQuestions;
          break;
        case "checked":
          comparison = (a.checkedCount || 0) - (b.checkedCount || 0);
          break;
        case "similar":
          comparison = (a.similarCount || 0) - (b.similarCount || 0);
          break;
        case "reviewed":
          comparison = (a.reviewedCount || 0) - (b.reviewedCount || 0);
          break;
        case "notChecked":
          comparison =
            a.totalQuestions -
            (a.checkedCount || 0) -
            (b.totalQuestions - (b.checkedCount || 0));
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });
  };

  const toggleDeptSort = (
    deptName: string,
    sortType:
      | "name"
      | "sops"
      | "questions"
      | "checked"
      | "similar"
      | "reviewed"
      | "notChecked",
  ) => {
    if (deptSortBy[deptName] === sortType) {
      setDeptSortOrder({
        ...deptSortOrder,
        [deptName]: deptSortOrder[deptName] === "asc" ? "desc" : "asc",
      });
    } else {
      setDeptSortBy({ ...deptSortBy, [deptName]: sortType });
      // Default to descending for numeric stats, ascending for name
      const defaultOrder = [
        "questions",
        "sops",
        "checked",
        "similar",
        "reviewed",
        "notChecked",
      ].includes(sortType)
        ? "desc"
        : "asc";
      setDeptSortOrder({ ...deptSortOrder, [deptName]: defaultOrder });
    }
  };

  const toggleSubcatSort = (
    subcatKey: string,
    sortType:
      | "name"
      | "questions"
      | "identifier"
      | "checked"
      | "similar"
      | "reviewed"
      | "notChecked",
  ) => {
    if (subcatSortBy[subcatKey] === sortType) {
      setSubcatSortOrder({
        ...subcatSortOrder,
        [subcatKey]: subcatSortOrder[subcatKey] === "asc" ? "desc" : "asc",
      });
    } else {
      setSubcatSortBy({ ...subcatSortBy, [subcatKey]: sortType });
      // Default to descending for numeric stats
      const defaultOrder = [
        "questions",
        "checked",
        "similar",
        "reviewed",
        "notChecked",
      ].includes(sortType)
        ? "desc"
        : "asc";
      setSubcatSortOrder({ ...subcatSortOrder, [subcatKey]: defaultOrder });
    }
  };

  // Drag handlers for modal
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y,
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setModalPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add/remove mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  // Reset modal position when opening
  useEffect(() => {
    if (fullScreenDept) {
      setModalPosition({ x: 0, y: 0 });
    }
  }, [fullScreenDept]);

  // Drag handlers for bulk regen modal
  const handleBulkRegenMouseDown = (e: React.MouseEvent) => {
    setBulkRegenDragging(true);
    setBulkRegenDragStart({
      x: e.clientX - bulkRegenModalPos.x,
      y: e.clientY - bulkRegenModalPos.y,
    });
  };

  const handleBulkRegenMouseMove = (e: MouseEvent) => {
    if (bulkRegenDragging) {
      setBulkRegenModalPos({
        x: e.clientX - bulkRegenDragStart.x,
        y: e.clientY - bulkRegenDragStart.y,
      });
    }
  };

  const handleBulkRegenMouseUp = () => {
    setBulkRegenDragging(false);
  };

  useEffect(() => {
    if (bulkRegenDragging) {
      window.addEventListener('mousemove', handleBulkRegenMouseMove);
      window.addEventListener('mouseup', handleBulkRegenMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleBulkRegenMouseMove);
        window.removeEventListener('mouseup', handleBulkRegenMouseUp);
      };
    }
  }, [bulkRegenDragging, bulkRegenDragStart]);

  // Reset bulk regen modal position when opening
  useEffect(() => {
    if (showBulkRegenModal) {
      setBulkRegenModalPos({ x: 0, y: 0 });
    }
  }, [showBulkRegenModal]);

  // Filter tree based on search
  const filteredTree = tree.filter(matchesDepartment).map((dept) => ({
    ...dept,
    subcategories: sortSubcategories(
      dept.subcategories.filter(matchesSubcategory).map((subcat) => ({
        ...subcat,
        sops: subcat.sops.filter(matchesSOP),
      })),
      dept.name,
    ),
  }));

  // Filter unorganized SOPs
  const filteredUnorganized = {
    ...unorganized,
    sops: unorganized.sops.filter(matchesSOP),
    totalSOPs: unorganized.sops.filter(matchesSOP).length,
  };

  const toggleDepartment = (deptName: string) => {
    const newExpanded = new Set(expandedDepts);
    if (newExpanded.has(deptName)) {
      newExpanded.delete(deptName);
    } else {
      newExpanded.add(deptName);
    }
    setExpandedDepts(newExpanded);
  };

  const toggleSubcategory = (key: string) => {
    const newExpanded = new Set(expandedSubcats);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSubcats(newExpanded);
  };

  const toggleSOP = (sopId: string) => {
    const newExpanded = new Set(expandedSOPs);
    if (newExpanded.has(sopId)) {
      newExpanded.delete(sopId);
    } else {
      newExpanded.add(sopId);
    }
    setExpandedSOPs(newExpanded);
  };

  return (
    <div className="space-y-6">
      {/* Search Results Info */}
      {searchLower && (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
          <p className="text-blue-300 text-sm">
            <span className="font-semibold">Search Results:</span> Found{" "}
            {filteredTree.reduce(
              (acc, dept) =>
                acc +
                dept.subcategories.reduce(
                  (acc2, sub) => acc2 + sub.sops.length,
                  0,
                ),
              0,
            )}{" "}
            SOPs
            {filteredTree.length > 0 &&
              ` across ${filteredTree.length} department(s)`}
          </p>
        </div>
      )}

      {/* No Results Message */}
      {searchLower &&
        filteredTree.length === 0 &&
        filteredUnorganized.sops.length === 0 && (
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-gray-400 text-lg mb-2">
              No SOPs match your search
            </p>
            <p className="text-gray-500 text-sm">
              Try different keywords or clear the search
            </p>
          </div>
        )}

      {/* ══════════════════════════════════════════════════════════════════
           MCQ STATUS CARDS — horizontal scroll, one card per dept
          ══════════════════════════════════════════════════════════════════ */}
      {(() => {
        const DEPT_ORDER = ['QA','QC','Microbiology','Production','Store','Engineering and Maintenance','Personnel'];

        const orderedDepts = [
          ...DEPT_ORDER.map(n => tree.find(d => d.name === n)).filter(Boolean),
          ...tree.filter(d => !DEPT_ORDER.includes(d.name)),
        ] as typeof tree;

        // Overall totals from API only
        const overall = (() => {
          const base = {
            totalSOPs:0, totalSopPairs:0, mcqFoundPairs:0, mcqNotFoundPairs:0,
            sopWithMCQs:0, sopWithoutMCQs:0,
            approvedSOPs:0, partialSOPs:0, pendingSOPs:0, similarSOPs:0,
            totalQuestions:0, checkedCount:0, reviewedCount:0, similarCount:0,
            sopEng:0, sopGuj:0, sopCompletedGen:0, sopUnder100MCQs:0,
            totalSopEng:0, totalSopGuj:0, remainingEng:0, remainingGuj:0,
          };
          for (const ds of Object.values(deptStats)) {
            base.totalSOPs          += ds.totalSOPs          ?? 0;
            base.totalSopPairs      += ds.totalSopPairs      ?? 0;
            base.mcqFoundPairs      += ds.mcqFoundPairs      ?? 0;
            base.mcqNotFoundPairs   += ds.mcqNotFoundPairs   ?? 0;
            base.sopWithMCQs        += ds.sopWithMCQs        ?? 0;
            base.sopWithoutMCQs     += ds.sopWithoutMCQs     ?? 0;
            base.approvedSOPs       += ds.approvedSOPs       ?? 0;
            base.partialSOPs        += ds.partialSOPs        ?? 0;
            base.pendingSOPs        += ds.pendingSOPs        ?? 0;
            base.similarSOPs        += ds.similarSOPs        ?? 0;
            base.totalQuestions     += ds.totalQuestions     ?? 0;
            base.checkedCount       += ds.checkedCount       ?? 0;
            base.reviewedCount      += ds.reviewedCount      ?? 0;
            base.similarCount       += ds.similarCount       ?? 0;
            base.sopEng             += ds.sopEng             ?? 0;
            base.sopGuj             += ds.sopGuj             ?? 0;
            base.sopCompletedGen    += ds.sopCompletedGen    ?? 0;
            base.sopUnder100MCQs    += ds.sopUnder100MCQs    ?? 0;
            base.totalSopEng        += ds.totalSopEng        ?? 0;
            base.totalSopGuj        += ds.totalSopGuj        ?? 0;
            base.remainingEng       += ds.remainingEng       ?? 0;
            base.remainingGuj       += ds.remainingGuj       ?? 0;
          }
          return base;
        })();
        const overallCoverage = overall.totalSOPs > 0 ? Math.round((overall.sopWithMCQs / overall.totalSOPs) * 100) : 0;

        // Row: label left, value right — white bg style
        const R = ({ label, value, vc = 'text-gray-900', dim = false, onClick }: {
          label: string; value: number; vc?: string; dim?: boolean; onClick?: () => void;
        }) => (
          <div
            className={`flex items-center justify-between px-3 py-[4px] border-b border-gray-100 last:border-0 ${onClick ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors' : ''}`}
            onClick={onClick}
            title={onClick ? `Filter by ${label}` : undefined}
          >
            <span className="text-[11px] text-gray-500 font-medium leading-none">{label}</span>
            <span className={`text-[13px] font-black tabular-nums leading-none ${dim || value === 0 ? 'text-gray-300' : vc} ${onClick ? 'underline decoration-dotted underline-offset-2' : ''}`}>{value}</span>
          </div>
        );

        // Section divider with label
        const Divider = ({ label }: { label: string }) => (
          <div className="px-3 py-[3px] bg-gray-50 border-y border-gray-200">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">{label}</span>
          </div>
        );

        const CoverageBar = ({ pct }: { pct: number }) => (
          <div className="px-3 pt-2 pb-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Coverage</span>
              <span className={`text-[9px] font-black ${pct >= 100 ? 'text-emerald-500' : pct >= 60 ? 'text-blue-500' : 'text-amber-500'}`}>{pct}%</span>
            </div>
            <div className="w-full h-[3px] bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        );

        // Horizontal stat item
        const Stat = ({ label, value, vc = 'text-gray-900', onClick, br = false }: {
          label: string; value: number; vc?: string; onClick?: () => void; br?: boolean;
        }) => (
          <div
            className={`flex flex-col items-center justify-center flex-1 py-1.5 ${br ? 'border-r border-gray-100' : ''} ${onClick ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors' : ''}`}
            onClick={onClick}
          >
            <span className="text-[7.5px] text-gray-400 font-black uppercase tracking-tight leading-none mb-1">{label}</span>
            <span className={`text-[12px] font-black tabular-nums leading-none ${value === 0 ? 'text-gray-200' : vc}`}>{value}</span>
          </div>
        );

        // ── Exact copy of Dashboard's CapsuleMetric ──────────────────────────
        const CM = ({
          label, value, vc, onClick, isActive = false,
        }: {
          label: string; value: number; vc?: string;
          onClick?: () => void; isActive?: boolean;
        }) => (
          <button
            type="button"
            onClick={onClick ? (e) => { e.preventDefault(); e.stopPropagation(); onClick(); } : undefined}
            aria-pressed={isActive ? true : undefined}
            className={`flex w-full min-h-[24px] cursor-pointer items-center justify-between gap-1.5 rounded-[4px] px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-purple-100/80 active:bg-purple-200/60 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:ring-offset-0 ${
              isActive ? "border border-purple-400 bg-purple-100/90" : "border border-transparent"
            }`}
          >
            <span className="min-w-0 shrink text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
            <span className={`font-bold tabular-nums shrink-0 leading-tight ${vc ?? "text-gray-900"}`}>{value}</span>
          </button>
        );

        // ── Exact copy of Dashboard's "Expired | Near | No Dt" row pattern ──
        // flex w-full gap-0.5, each item in flex-1 min-w-0 wrapper
        const TripleRow = ({ items }: {
          items: { label: string; value: number; vc?: string; onClick?: () => void; isActive?: boolean }[];
        }) => (
          <div className="flex w-full gap-0.5">
            {items.map((item) => (
              <div key={item.label} className="flex-1 min-w-0">
                <CM label={item.label} value={item.value} vc={item.vc} onClick={item.onClick} isActive={item.isActive} />
              </div>
            ))}
          </div>
        );

        // ── Exact copy of Dashboard's coverage section ────────────────────────
        const CovBar = ({ pct, label = "COVERAGE" }: { pct: number; label?: string }) => (
          <div className="pt-1.5 mt-1.5 border-t border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
              <span className={`text-[9px] font-black ${
                pct >= 100 ? "text-emerald-600" : pct >= 60 ? "text-blue-600" : "text-amber-500"
              }`}>{pct}%</span>
            </div>
            <div className="w-full h-[3px] bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : "bg-amber-500"
                }`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        );

        // ── MCQ Capsule Card — exact structural clone of DepartmentCapsuleCard ─
        const Card = ({
          title, subtitle, isGrand = false,
          totalSOPs, sopWithMCQs, sopWithoutMCQs,
          approvedSOPs, partialSOPs, pendingSOPs, similarSOPs,
          totalSopEng, totalSopGuj, remainingEng, remainingGuj,
          totalSopPairs, mcqFoundPairs, mcqNotFoundPairs,
          onOpen, onRowClick, onRemainingClick, onMcqFoundClick, onMcqNotFoundClick,
          genCompleted, genTarget, genRemaining, onGenClick,
        }: {
          title: string; subtitle: string; isGrand?: boolean;
          totalSOPs: number; sopWithMCQs: number; sopWithoutMCQs: number;
          approvedSOPs: number; partialSOPs: number; pendingSOPs: number; similarSOPs: number;
          totalSopEng: number; totalSopGuj: number; remainingEng: number; remainingGuj: number;
          totalSopPairs?: number; mcqFoundPairs?: number; mcqNotFoundPairs?: number;
          onOpen?: () => void;
          onRowClick?: (f: "approved" | "partial" | "pending" | "similar") => void;
          onRemainingClick?: () => void;
          onMcqFoundClick?: () => void;
          onMcqNotFoundClick?: () => void;
          genCompleted?: number; genTarget?: number; genRemaining?: number;
          onGenClick?: (f: "completed" | "target" | "zero") => void;
        }) => (
          <div className={`flex w-full min-w-0 flex-col rounded-[10px] border px-2 py-1.5 text-left shadow-sm ${
            isGrand ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white"
          }`}>

            {/* ── Header ── */}
            <div
              role="button"
              tabIndex={isGrand ? -1 : 0}
              onClick={isGrand ? undefined : onOpen}
              onKeyDown={isGrand ? undefined : (e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); }
              }}
              className={`mb-2 flex w-full min-h-[40px] items-start gap-1.5 rounded-md border-b pb-2 ${
                isGrand
                  ? "cursor-default border-purple-200"
                  : "cursor-pointer border-gray-100 hover:bg-purple-50/80 focus:outline-none focus:ring-2 focus:ring-purple-400"
              }`}
            >
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-600" />
              <div className="min-w-0 flex-1">
                <span className="block min-w-0 text-[11px] font-bold leading-tight text-gray-800 truncate" title={title}>{title}</span>
                <span className="block text-[9px] font-medium text-gray-500 leading-tight mt-0.5">{subtitle}</span>
              </div>
            </div>

            {/* ── Summary counts (Total card only) — same style as CM rows ── */}
            {isGrand && totalSopPairs !== undefined && (
              <div className="flex flex-col gap-0 border-t border-transparent pt-0.5 mb-1">
                <CM label="Unique SOPs" value={totalSOPs} />
                <CM label="Total Versions" value={totalSopPairs ?? 0} />
                <CM label="MCQ Found" value={mcqFoundPairs ?? 0} vc="text-emerald-600" onClick={onMcqFoundClick} />
                <CM label="Not Found" value={mcqNotFoundPairs ?? 0} vc={mcqNotFoundPairs && mcqNotFoundPairs > 0 ? "text-red-600" : "text-gray-900"} onClick={onMcqNotFoundClick} />
              </div>
            )}

            {/* ── SOP counts — totalSOPs from SOP collection matches Dashboard ── */}
            <div className="flex flex-col gap-0 border-t border-transparent pt-0.5">

              <CM label="SOPs" value={totalSOPs} onClick={onOpen} />
              <CM label="w/ EN" value={totalSopEng} />
              <CM label="w/ GU" value={totalSopGuj} vc="text-orange-500" />

              <TripleRow items={[
                { label: "Approved", value: approvedSOPs, vc: "text-emerald-600",
                  onClick: onRowClick ? () => onRowClick("approved") : undefined },
                { label: "Partial",  value: partialSOPs,  vc: "text-amber-500",
                  onClick: onRowClick ? () => onRowClick("partial")  : undefined },
                { label: "Pending",  value: pendingSOPs,  vc: "text-red-600",
                  onClick: onRowClick ? () => onRowClick("pending")  : undefined },
              ]} />

              <CM label="Similar" value={similarSOPs}
                onClick={onRowClick ? () => onRowClick("similar") : undefined} />

            </div>

            {/* ── Remaining SOPs (no MCQs yet) ── */}
            <div className={`mt-1.5 pt-1.5 border-t ${isGrand ? "border-purple-200" : "border-gray-100"}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <FileText className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="min-w-0 flex-1 text-[11px] font-bold leading-tight text-gray-800">Remaining</span>
              </div>
              <div className="flex flex-col gap-0 border-t border-transparent pt-0.5">
                <CM label="w/ MCQs"   value={sopWithMCQs}    vc="text-emerald-600" onClick={onOpen} />
                <CM label="Remaining" value={sopWithoutMCQs} vc={sopWithoutMCQs > 0 ? "text-red-600" : "text-gray-900"} onClick={onRemainingClick} />
                <TripleRow items={[
                  { label: "EN rem.", value: remainingEng, vc: remainingEng > 0 ? "text-red-600" : "text-gray-900",
                    onClick: onRemainingClick },
                  { label: "GU rem.", value: remainingGuj, vc: remainingGuj > 0 ? "text-red-600" : "text-gray-900",
                    onClick: onRemainingClick },
                ]} />
              </div>
            </div>

            {/* ── Generation section (Total card only) ── */}
            {genCompleted !== undefined && (
              <div className={`mt-1.5 pt-1.5 border-t ${isGrand ? "border-purple-200" : "border-gray-100"}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <BookOpen className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                  <span className="min-w-0 flex-1 text-[11px] font-bold leading-tight text-gray-800">Generation</span>
                </div>
                <div className="flex flex-col gap-0 border-t border-transparent pt-0.5">
                  <CM label="Total SOPs" value={sopWithMCQs} vc="text-blue-600" />
                  <TripleRow items={[
                    { label: "Completed", value: genCompleted, vc: "text-emerald-600",
                      onClick: onGenClick ? () => onGenClick("completed") : undefined },
                    { label: "Target",    value: genTarget ?? 0, vc: "text-amber-500",
                      onClick: onGenClick ? () => onGenClick("target")    : undefined },
                    { label: "Remaining", value: genRemaining ?? 0, vc: "text-red-600",
                      onClick: onGenClick ? () => onGenClick("zero")      : undefined },
                  ]} />
                </div>
              </div>
            )}
          </div>
        );

        const handleGenerationClick = (filter: 'completed' | 'target' | 'zero') => {
          const allSubcats = tree.flatMap(dept =>
            dept.subcategories.map(sub => ({
              ...sub,
              name: `[${dept.name}] ${sub.name}`,
            }))
          );
          const fakeDept: typeof tree[0] = {
            type: "department",
            name: "All Departments",
            icon: "🌐",
            totalSOPs: overall.totalSOPs,
            totalQuestions: overall.totalQuestions,
            checkedCount: overall.checkedCount,
            reviewedCount: overall.reviewedCount,
            similarCount: overall.similarCount,
            subcategories: allSubcats,
          };
          setApprovalFilter(filter);
          setSOPViewMode('table');
          setFullScreenDept(fakeDept);
        };

        return (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">MCQ Status</span>
              {deptStatsLoading && <span className="text-[9px] text-gray-500">Loading…</span>}
            </div>

            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 2xl:grid-cols-9 px-1 py-2 sm:px-2">

              {/* Total card */}
              <Card
                title="Total"
                subtitle={`${orderedDepts.length} departments`}
                isGrand
                totalSOPs={overall.totalSOPs}
                totalSopPairs={overall.totalSopPairs}
                mcqFoundPairs={overall.mcqFoundPairs}
                mcqNotFoundPairs={overall.mcqNotFoundPairs}
                sopWithMCQs={overall.sopWithMCQs}
                sopWithoutMCQs={overall.sopWithoutMCQs}
                approvedSOPs={overall.approvedSOPs}
                partialSOPs={overall.partialSOPs}
                pendingSOPs={overall.pendingSOPs}
                similarSOPs={overall.similarSOPs}
                totalSopEng={overall.totalSopEng}
                totalSopGuj={overall.totalSopGuj}
                remainingEng={overall.remainingEng}
                remainingGuj={overall.remainingGuj}
                onRemainingClick={() => {
                  setRemainingPanel({ dept: 'All Departments', sops: overallRemainingSOPs });
                }}
                onMcqFoundClick={() => {
                  setMcqRegistryMcqFilter('found');
                  setTimeout(() => mcqRegistryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                }}
                onMcqNotFoundClick={() => {
                  setRemainingPanel({ dept: 'All Departments', sops: overallRemainingSOPs });
                }}
                genCompleted={overall.sopCompletedGen}
                genTarget={overall.sopUnder100MCQs}
                genRemaining={Math.max(0, overall.sopWithMCQs - overall.sopCompletedGen - overall.sopUnder100MCQs)}
                onGenClick={handleGenerationClick}
              />

              {/* Per-dept cards */}
              {orderedDepts.map((dept) => {
                const ds = deptStats[dept.name];
                return (
                  <Card
                    key={dept.name}
                    title={dept.name}
                    subtitle={`${dept.subcategories?.length ?? 0} subcategories`}
                    totalSOPs={ds?.totalSOPs       ?? 0}
                    sopWithMCQs={ds?.sopWithMCQs   ?? 0}
                    sopWithoutMCQs={ds?.sopWithoutMCQs ?? 0}
                    approvedSOPs={ds?.approvedSOPs  ?? 0}
                    partialSOPs={ds?.partialSOPs    ?? 0}
                    pendingSOPs={ds?.pendingSOPs    ?? 0}
                    similarSOPs={ds?.similarSOPs    ?? 0}
                    totalSopEng={ds?.totalSopEng    ?? 0}
                    totalSopGuj={ds?.totalSopGuj    ?? 0}
                    remainingEng={ds?.remainingEng  ?? 0}
                    remainingGuj={ds?.remainingGuj  ?? 0}
                    onOpen={() => { setApprovalFilter('all'); setFullScreenDept(dept); }}
                    onRowClick={(filter) => { setApprovalFilter(filter); setSOPViewMode('table'); setFullScreenDept(dept); }}
                    onRemainingClick={() => {
                      const remSops = ds?.remainingSOPs ?? [];
                      setRemainingPanel({ dept: dept.name, sops: remSops });
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Department folder grid */}
      {/* Collapsible header */}
      <button
        onClick={() => setShowDeptCards(prev => !prev)}
        className="w-full flex items-center gap-3 px-4 py-3 mb-2 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors text-left group"
      >
        <span className="flex items-center justify-center w-7 h-7 rounded-md bg-gradient-to-br from-violet-500 to-indigo-500 shadow-sm shrink-0">
          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-800">
            By Department <span className="text-gray-500 font-medium">({tree.length})</span>
          </span>
          <p className="text-xs text-gray-400 leading-none mt-0.5">Filter MCQs by department</p>
        </div>
        <span className="text-gray-400 group-hover:text-gray-600 transition-colors shrink-0">
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showDeptCards ? '' : '-rotate-90'}`} />
        </span>
      </button>

      {showDeptCards && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {tree.map((dept) => {
          const theme = getDeptTheme(dept.name);
          const subcategoryCount = dept.subcategories?.length ?? 0;
          const totalSOPs = dept.totalSOPs ?? dept.subcategories?.reduce(
            (acc, sub) => acc + (sub.sops?.length ?? 0),
            0
          ) ?? 0;
          const totalQuestions = dept.totalQuestions ?? dept.subcategories?.reduce(
            (acc, sub) => acc + (sub.totalQuestions ?? sub.sops?.reduce((s, sop) => s + (sop.totalQuestions ?? 0), 0) ?? 0),
            0
          ) ?? 0;
          const normalizedKey = normalizeDepartmentName(dept.name).toLowerCase();
          const trainerName =
            trainerMappings[normalizedKey] ||
            trainerMappings[dept.name.toLowerCase()] ||
            trainerMappings[dept.name];

          const ds = deptStats[dept.name];
          const realTotalSOPs  = ds?.totalSOPs     ?? totalSOPs;
          const sopWithMCQs    = ds?.sopWithMCQs   ?? totalSOPs;
          const sopWithoutMCQs = ds?.sopWithoutMCQs ?? 0;
          const sopEng         = ds?.sopEng ?? 0;
          const sopGuj         = ds?.sopGuj ?? 0;
          const allDeptSOPs    = dept.subcategories?.flatMap((sub) => sub.sops ?? []) ?? [];
          const treeApproved   = allDeptSOPs.filter((sop) => (sop.totalQuestions ?? 0) > 0 && (sop.checkedCount ?? 0) >= (sop.totalQuestions ?? 0)).length;
          const treeSimilar    = allDeptSOPs.filter((sop) => (sop.similarCount ?? 0) > 0).length;
          const approvedSOPs   = ds ? ds.approvedSOPs : treeApproved;
          const pendingSOPs    = ds ? ds.pendingSOPs  : Math.max(0, sopWithMCQs - treeApproved - treeSimilar);
          const similarSOPs    = ds ? ds.similarSOPs  : treeSimilar;
          const mcqCoverage    = realTotalSOPs > 0 ? Math.round((sopWithMCQs / realTotalSOPs) * 100) : 0;

          const isFolderExpanded = expandedFolderDropdowns.has(dept.name);

          return (
            <div
              key={dept.name}
              className={`rounded-xl border-0 ${theme.cardBg} transition-all duration-300 shadow-lg hover:shadow-2xl overflow-hidden group`}
            >
              {/* Main clickable header area */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => { setApprovalFilter('all'); setFullScreenDept(dept); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setApprovalFilter('all'); setFullScreenDept(dept); } }}
                className="w-full px-4 pt-4 pb-3 flex flex-col gap-0 bg-transparent transition-all text-left cursor-pointer"
              >
                {/* Header */}
                <div className="flex items-center justify-between w-full mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white/20 border border-white/30 text-white">
                      <Folder className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white transition-colors">{dept.name}</h3>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <p className="text-[10px] text-white/70">{subcategoryCount} Subcategor{subcategoryCount !== 1 ? "ies" : "y"}</p>
                        {trainerName && (
                          <div className="flex items-center gap-1.5">
                            <span className="h-1 w-1 rounded-full bg-white/40" />
                            <div className="px-1.5 py-0.5 rounded border bg-white/20 border-white/30 text-white text-[8px] font-black uppercase tracking-wider">
                              <span className="opacity-70 mr-1">Trainer:</span>{trainerName}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFolderDropdown(dept.name); }}
                    title={isFolderExpanded ? 'Hide folders' : 'Show folders'}
                    className="h-6 w-6 rounded-full flex items-center justify-center border border-white/30 bg-white/20 text-white flex-shrink-0 hover:bg-white/30 transition-all duration-200"
                  >
                    <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${isFolderExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Top stats */}
                <div className="grid grid-cols-2 gap-1.5 w-full mb-3">
                  <div className="bg-black/20 rounded-lg p-2 text-left">
                    <p className="text-white/60 text-[8px] uppercase tracking-wider font-bold mb-0.5">SOP</p>
                    <span className="text-base font-black leading-none text-white">{sopWithMCQs}</span>
                  </div>
                  <div className="bg-black/20 rounded-lg p-2 text-left">
                    <p className="text-white/60 text-[8px] uppercase tracking-wider font-bold mb-0.5">Questions</p>
                    <span className="text-base font-black leading-none text-white">{totalQuestions}</span>
                  </div>
                </div>

                {/* Coverage bar */}
                <div className="w-full mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[8px] font-bold text-white/70 uppercase tracking-wider">MCQ Coverage</span>
                    <span className="text-[9px] font-black text-white">{mcqCoverage}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-black/25 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700 bg-white/80" style={{ width: `${mcqCoverage}%` }} />
                  </div>
                </div>

                {/* Status capsules */}
                <div className="grid grid-cols-2 gap-1.5 w-full mb-2">
                  <div
                    role="button" tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setApprovalFilter('approved'); setFullScreenDept(dept); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setApprovalFilter('approved'); setFullScreenDept(dept); } }}
                    className="flex items-center gap-1.5 justify-between bg-white/15 border border-white/25 rounded-lg px-2.5 py-1.5 hover:bg-white/25 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-white shrink-0" />
                      <span className="text-[9px] font-bold text-white/80 uppercase tracking-wide">Approved</span>
                    </div>
                    <span className="text-sm font-black text-white leading-none">{approvedSOPs}</span>
                  </div>
                  <div
                    role="button" tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setApprovalFilter('pending'); setFullScreenDept(dept); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setApprovalFilter('pending'); setFullScreenDept(dept); } }}
                    className="flex items-center gap-1.5 justify-between bg-white/15 border border-white/25 rounded-lg px-2.5 py-1.5 hover:bg-white/25 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-yellow-200 shrink-0" />
                      <span className="text-[9px] font-bold text-white/80 uppercase tracking-wide">Pending</span>
                    </div>
                    <span className="text-sm font-black text-yellow-200 leading-none">{pendingSOPs}</span>
                  </div>
                  <div className="flex items-center gap-1.5 justify-between bg-white/15 border border-white/25 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-1">
                      <Copy className="h-3 w-3 text-red-200 shrink-0" />
                      <span className="text-[9px] font-bold text-white/80 uppercase tracking-wide">Similar</span>
                    </div>
                    <span className={`text-sm font-black leading-none ${similarSOPs > 0 ? 'text-red-200' : 'text-white/40'}`}>{similarSOPs}</span>
                  </div>
                  <div className="flex items-center gap-1.5 justify-between bg-white/15 border border-white/25 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3 text-white/60 shrink-0" />
                      <span className="text-[9px] font-bold text-white/80 uppercase tracking-wide">Remaining</span>
                    </div>
                    <span className={`text-sm font-black leading-none ${sopWithoutMCQs > 0 ? 'text-white' : 'text-white/30'}`}>{sopWithoutMCQs}</span>
                  </div>
                </div>

                {/* Question breakdown */}
                {((dept.checkedCount || 0) > 0 || (dept.similarCount || 0) > 0) && (
                  <div className="flex items-center gap-1.5 w-full bg-black/20 rounded-lg px-2 py-1.5 overflow-hidden flex-wrap">
                    <span className="text-[8px] font-bold text-white/60 uppercase tracking-wider mr-0.5">Qs:</span>
                    {(dept.checkedCount || 0) > 0 && (
                      <div className="flex items-center gap-1 bg-white/15 px-1.5 py-0.5 rounded border border-white/25">
                        <CheckCircle2 className="h-2.5 w-2.5 text-green-200 shrink-0" />
                        <span className="text-[9px] font-bold text-green-200 leading-none">{dept.checkedCount}</span>
                        <span className="text-[8px] text-white/60 leading-none">chkd</span>
                      </div>
                    )}
                    {(dept.reviewedCount || 0) > 0 && (
                      <div className="flex items-center gap-1 bg-white/15 px-1.5 py-0.5 rounded border border-white/25">
                        <Eye className="h-2.5 w-2.5 text-blue-200 shrink-0" />
                        <span className="text-[9px] font-bold text-blue-200 leading-none">{dept.reviewedCount}</span>
                        <span className="text-[8px] text-white/60 leading-none">rvwd</span>
                      </div>
                    )}
                    {(dept.similarCount || 0) > 0 && (
                      <div className="flex items-center gap-1 bg-white/15 px-1.5 py-0.5 rounded border border-white/25 animate-pulse">
                        <AlertTriangle className="h-2.5 w-2.5 text-red-200 shrink-0" />
                        <span className="text-[9px] font-bold text-red-200 leading-none">{dept.similarCount}</span>
                        <span className="text-[8px] text-white/60 leading-none">sim</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Inline subcategory dropdown */}
              {isFolderExpanded && (
                <div className="border-t border-white/10 bg-black/30 px-3 py-2 flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {dept.subcategories.map((sub) => {
                    const subSOPs = sub.sops?.length ?? sub.totalSOPs ?? 0;
                    const subQs = sub.totalQuestions ?? sub.sops?.reduce((s, sop) => s + (sop.totalQuestions ?? 0), 0) ?? 0;
                    const subChecked = sub.checkedCount ?? sub.sops?.reduce((s, sop) => s + (sop.checkedCount ?? 0), 0) ?? 0;
                    const subSimilar = sub.similarCount ?? sub.sops?.reduce((s, sop) => s + (sop.similarCount ?? 0), 0) ?? 0;
                    return (
                      <button
                        key={sub.code}
                        onClick={() => { setApprovalFilter('all'); setFullScreenDept(dept); }}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-left w-full group/sub"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderOpen className="h-3 w-3 text-white/40 shrink-0 group-hover/sub:text-white/70 transition-colors" />
                          <div className="min-w-0">
                            <p className="text-[9px] font-black text-white/80 uppercase tracking-wider leading-tight truncate">{sub.code}</p>
                            <p className="text-[8px] text-white/40 leading-tight truncate">{sub.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[8px] text-white/50">{subSOPs} SOPs</span>
                          {subQs > 0 && <span className="text-[8px] font-bold text-white/70">{subQs}Q</span>}
                          {subChecked > 0 && <span className="text-[8px] font-bold text-emerald-300">✓{subChecked}</span>}
                          {subSimilar > 0 && <span className="text-[8px] font-bold text-red-300">⚠{subSimilar}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>}

      {/* ══════════════════════════════════════════════════════════════════
           MCQ REGISTRY TABLE — mirrors SOP Registry style
          ══════════════════════════════════════════════════════════════════ */}
      {(() => {
        // Build flat registry rows from tree: one row per SOP bank
        const allRows: {
          identifier: string; name: string; dept: string; lang: string;
          totalQ: number; checkedCount: number; reviewedCount: number;
          similarCount: number; approvedSOPs: number; partialSOPs: number;
          pendingSOPs: number; lastUpdated: string | null;
          sopNode: SOPNode;
        }[] = [];

        tree.forEach((dept) => {
          dept.subcategories.forEach((sub) => {
            sub.sops.forEach((sop) => {
              sop.mcqBanks.forEach((bank: any) => {
                const lang = bank.language === 'Gujarati' ? 'Gujarati' : 'English';
                const totalQ = bank.mcqs?.length ?? sop.totalQuestions ?? 0;
                const checkedCount = bank.mcqs?.filter((q: any) => q.isChecked).length ?? sop.checkedCount ?? 0;
                const reviewedCount = bank.mcqs?.filter((q: any) => q.isReviewed).length ?? sop.reviewedCount ?? 0;
                const similarCount = bank.mcqs?.filter((q: any) => q.isSimilar).length ?? sop.similarCount ?? 0;

                let genStatus = 'Pending';
                if (totalQ >= 100) genStatus = 'Completed';
                else if (totalQ > 0) genStatus = 'In Progress';

                let approvalStatus = 'Pending';
                if (totalQ > 0 && checkedCount >= totalQ) approvalStatus = 'Approved';
                else if (similarCount > 0) approvalStatus = 'Similar';
                else if (totalQ > 0 && checkedCount > 0) approvalStatus = 'Partial';

                const lastUpdated = bank.updatedAt || bank.createdAt || null;

                allRows.push({
                  identifier: sop.sopCode,
                  name: cleanSOPName(sop.sopName, sop.sopCode),
                  dept: dept.name,
                  lang,
                  totalQ,
                  checkedCount,
                  reviewedCount,
                  similarCount,
                  approvedSOPs: approvalStatus === 'Approved' ? 1 : 0,
                  partialSOPs: approvalStatus === 'Partial' ? 1 : 0,
                  pendingSOPs: approvalStatus === 'Pending' ? 1 : 0,
                  lastUpdated,
                  sopNode: sop,
                });
              });
            });
          });
        });

        // Filter
        const filtered = allRows.filter((row) => {
          if (mcqRegistryDeptFilter !== 'All' && row.dept !== mcqRegistryDeptFilter) return false;
          if (mcqRegistryLangFilter !== 'All' && row.lang !== mcqRegistryLangFilter) return false;
          // mcqRegistryMcqFilter: 'found' = has MCQ bank (all rows qualify), 'notfound' = no bank (none qualify — shown via remaining panel)
          if (mcqRegistryMcqFilter === 'notfound') return false;
          if (mcqRegistrySearch) {
            const q = mcqRegistrySearch.toLowerCase();
            if (!row.identifier.toLowerCase().includes(q) && !row.name.toLowerCase().includes(q) && !row.dept.toLowerCase().includes(q)) return false;
          }
          return true;
        });

        // Sort
        const sorted = [...filtered].sort((a, b) => {
          let cmp = 0;
          switch (mcqRegistrySortCol) {
            case 'identifier': cmp = a.identifier.localeCompare(b.identifier, undefined, { numeric: true }); break;
            case 'name': cmp = a.name.localeCompare(b.name); break;
            case 'dept': cmp = a.dept.localeCompare(b.dept); break;
            case 'lang': cmp = a.lang.localeCompare(b.lang); break;
            case 'totalQ': cmp = a.totalQ - b.totalQ; break;
            case 'remaining': cmp = (a.totalQ - a.checkedCount) - (b.totalQ - b.checkedCount); break;
            case 'approved': cmp = a.approvedSOPs - b.approvedSOPs; break;
            case 'partial': cmp = a.partialSOPs - b.partialSOPs; break;
            case 'similar': cmp = a.similarCount - b.similarCount; break;
            case 'lastUpdated':
              cmp = (a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0) - (b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0);
              break;
          }
          return mcqRegistrySortDir === 'asc' ? cmp : -cmp;
        });

        const toggleRegistrySort = (col: typeof mcqRegistrySortCol) => {
          if (mcqRegistrySortCol === col) setMcqRegistrySortDir(d => d === 'asc' ? 'desc' : 'asc');
          else { setMcqRegistrySortCol(col); setMcqRegistrySortDir('asc'); }
        };

        const SortIcon = ({ col }: { col: typeof mcqRegistrySortCol }) => {
          if (mcqRegistrySortCol !== col) return <span className="text-white/20 ml-0.5">↕</span>;
          return <span className="text-purple-300 ml-0.5">{mcqRegistrySortDir === 'asc' ? '↑' : '↓'}</span>;
        };

        const uniqueDepts = ['All', ...Array.from(new Set(allRows.map(r => r.dept))).sort()];

        return (
          <div className="mt-8" ref={mcqRegistryRef}>
            {/* Section header */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                  <LayoutList className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">MCQ Registry</h3>
                  <p className="text-[10px] text-gray-500 mt-0.5">{sorted.length} of {allRows.length} banks</p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search SOPs..."
                    value={mcqRegistrySearch}
                    onChange={e => setMcqRegistrySearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-800 text-[11px] placeholder-gray-400 focus:outline-none focus:border-purple-400 w-44 transition-colors"
                  />
                </div>
                {/* Dept filter */}
                <select
                  value={mcqRegistryDeptFilter}
                  onChange={e => setMcqRegistryDeptFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-800 text-[11px] focus:outline-none focus:border-purple-400 cursor-pointer"
                >
                  {uniqueDepts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {/* Language filter */}
                <select
                  value={mcqRegistryLangFilter}
                  onChange={e => setMcqRegistryLangFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-800 text-[11px] focus:outline-none focus:border-purple-400 cursor-pointer"
                >
                  <option value="All">All Languages</option>
                  <option value="English">English</option>
                  <option value="Gujarati">Gujarati</option>
                </select>
                {/* MCQ Found active filter badge + clear */}
                {mcqRegistryMcqFilter === 'found' && (
                  <button
                    onClick={() => setMcqRegistryMcqFilter('all')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-700 text-[10px] font-bold hover:bg-emerald-200 transition-colors"
                  >
                    MCQ Found <X className="h-3 w-3 ml-0.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-100">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-200/70 border-b border-gray-200">
                      {([
                        ['identifier', 'SOP No.'],
                        ['name', 'SOP Name'],
                        ['dept', 'Dept'],
                        ['lang', 'Lang'],
                        ['totalQ', 'Total MCQs'],
                        ['remaining', 'Remaining'],
                        ['approved', 'Approved'],
                        ['partial', 'Partial'],
                        ['similar', 'Similar'],
                        ['lastUpdated', 'Last Updated'],
                      ] as [typeof mcqRegistrySortCol, string][]).map(([col, label]) => (
                        <th
                          key={col}
                          onClick={() => toggleRegistrySort(col)}
                          className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-gray-500 cursor-pointer hover:text-gray-800 whitespace-nowrap select-none transition-colors"
                        >
                          {label}<SortIcon col={col} />
                        </th>
                      ))}
                      <th className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="text-center py-12 text-gray-500 text-sm">No MCQ banks match the current filters.</td>
                      </tr>
                    ) : sorted.map((row, idx) => {
                      const remaining = Math.max(0, row.totalQ - row.checkedCount);
                      const complianceStatus = row.totalQ >= 100 ? 'Compliant' : row.totalQ > 0 ? 'Partial' : 'None';
                      const genStatus = row.totalQ >= 100 ? 'Completed' : row.totalQ > 0 ? 'In Progress' : 'Not Started';
                      return (
                        <tr
                          key={`${row.identifier}-${row.lang}-${idx}`}
                          className="border-b border-gray-200 hover:bg-gray-200/60 transition-colors group/row"
                        >
                          {/* SOP No */}
                          <td className="px-3 py-2.5">
                            <span className="text-[10px] font-black text-purple-700 uppercase tracking-wider">{row.identifier}</span>
                          </td>
                          {/* SOP Name */}
                          <td className="px-3 py-2.5 max-w-[220px]">
                            <span className="text-[11px] text-gray-700 leading-tight line-clamp-2">{row.name}</span>
                          </td>
                          {/* Dept */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="text-[10px] font-bold text-gray-500">{row.dept}</span>
                          </td>
                          {/* Lang */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                              row.lang === 'Gujarati' ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-blue-100 text-blue-700 border border-blue-200'
                            }`}>{row.lang === 'Gujarati' ? 'GUJ' : 'ENG'}</span>
                          </td>
                          {/* Total MCQs */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`text-[12px] font-black tabular-nums ${row.totalQ >= 100 ? 'text-emerald-600' : row.totalQ > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{row.totalQ}</span>
                          </td>
                          {/* Remaining MCQs */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`text-[12px] font-black tabular-nums ${remaining > 0 ? 'text-red-500' : 'text-gray-400'}`}>{remaining}</span>
                          </td>
                          {/* Approved */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`text-[11px] font-bold tabular-nums ${row.checkedCount > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{row.checkedCount}</span>
                          </td>
                          {/* Partial */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`text-[11px] font-bold tabular-nums ${row.partialSOPs > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{row.reviewedCount}</span>
                          </td>
                          {/* Similar */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`text-[11px] font-bold tabular-nums ${row.similarCount > 0 ? 'text-red-500' : 'text-gray-400'}`}>{row.similarCount}</span>
                          </td>
                          {/* Last Updated */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="text-[10px] text-gray-500">
                              {row.lastUpdated ? new Date(row.lastUpdated).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                            </span>
                          </td>
                          {/* Actions */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <button
                              onClick={() => onViewMCQs(row.sopNode, 'all')}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-100 border border-purple-200 text-purple-700 text-[9px] font-bold uppercase tracking-wider hover:bg-purple-200 transition-all"
                            >
                              <Eye className="h-3 w-3" />
                              View MCQs
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Removed / Obsolete SOPs Section */}
      {archivedSOPs.length > 0 && (
        <div className="mt-8">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowArchivedSection(!showArchivedSection)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowArchivedSection((v) => !v);
              }
            }}
            className="w-full flex items-center justify-between px-6 py-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl hover:bg-rose-500/10 transition-all group cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-rose-500/30"
            aria-expanded={showArchivedSection}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Archive className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-black text-rose-300 uppercase tracking-widest">
                  Removed / Obsolete SOPs
                </h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">
                  {archivedSOPs.length} obsolete SOP{archivedSOPs.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowObsoleteDetails(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-200 hover:bg-rose-500/15"
                title="View obsolete SOP details"
              >
                Details
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRestoreAllArchived();
                }}
                disabled={restoringAllArchived}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-200 hover:bg-rose-500/15 disabled:opacity-50"
                title="Restore all archived SOPs back to MCQ Bank"
              >
                {restoringAllArchived ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Restoring…
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore all
                  </>
                )}
              </button>
              <ChevronRight className={`h-5 w-5 text-rose-400/60 transition-transform duration-300 ${showArchivedSection ? 'rotate-90' : ''}`} />
            </div>
          </div>

          {showArchivedSection && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
              {restoreAllResult ? (
                <div className={`col-span-full rounded-2xl border px-4 py-3 text-[11px] font-semibold ${
                  restoreAllResult.success
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/20 bg-rose-500/10 text-rose-200'
                }`}>
                  {restoreAllResult.message}
                </div>
              ) : null}
              {archivedSOPs.map((sop: any) => (
                <div
                  key={sop.sopIdentifier}
                  className="relative bg-[#131722] rounded-2xl border border-rose-500/10 p-5 hover:border-rose-500/20 transition-all group/card overflow-hidden"
                >
                  {/* Decorative accent */}
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-rose-500/40 via-rose-500/20 to-transparent" />

                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <Trash2 className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-rose-300 uppercase tracking-widest">
                        {sop.sopIdentifier}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate">
                        {sop.sopName}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/20 rounded-lg p-2">
                      <p className="text-gray-500 text-[8px] uppercase tracking-wider font-bold">Questions</p>
                      <p className="text-sm font-bold text-gray-300">{sop.totalQuestions || 0}</p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-2">
                      <p className="text-gray-500 text-[8px] uppercase tracking-wider font-bold">Archived</p>
                      <p className="text-sm font-bold text-gray-400">
                        {sop.archivedAt ? new Date(sop.archivedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-[8px] font-bold text-rose-400 uppercase tracking-widest">
                        Obsolete
                      </span>
                      {sop.department && (
                        <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                          {sop.department}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRestoreSOP(sop.sopIdentifier)}
                      disabled={restoringSOPs[sop.sopIdentifier]}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        restoreResults[sop.sopIdentifier]
                          ? restoreResults[sop.sopIdentifier].success
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : restoringSOPs[sop.sopIdentifier]
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 cursor-wait'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/10'
                      }`}
                    >
                      {restoringSOPs[sop.sopIdentifier] ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Restoring...
                        </>
                      ) : restoreResults[sop.sopIdentifier] ? (
                        <>{restoreResults[sop.sopIdentifier].message}</>
                      ) : (
                        <>
                          <RotateCcw className="h-3 w-3" />
                          Retrieve
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Obsolete SOP Details modal */}
      {showObsoleteDetails && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowObsoleteDetails(false)}
        >
          <div
            className="w-full max-w-5xl rounded-2xl border border-white/10 bg-[#0D1117] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300 border border-rose-500/20">
                  <Archive className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white">Obsolete SOP Details</h2>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
                    {archivedSOPs.length} obsolete SOP{archivedSOPs.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowObsoleteDetails(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:text-white hover:bg-white/10"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[72vh] overflow-auto p-4">
              <div className="overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-white/5 backdrop-blur">
                    <tr className="border-b border-white/10">
                      <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">SOP No</th>
                      <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Name</th>
                      <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Department</th>
                      <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Questions</th>
                      <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Obsolete At</th>
                      <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedSOPs.map((sop: any) => (
                      <tr key={`obs-${sop.sopIdentifier}`} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2 font-mono font-black text-rose-300 whitespace-nowrap">{sop.sopIdentifier}</td>
                        <td className="px-3 py-2 text-gray-200 font-semibold">{sop.sopName || "—"}</td>
                        <td className="px-3 py-2 text-gray-400">{sop.department || "—"}</td>
                        <td className="px-3 py-2 text-gray-300 font-bold tabular-nums">{sop.totalQuestions ?? 0}</td>
                        <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                          {sop.obsoleteAt ? new Date(sop.obsoleteAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleRestoreSOP(sop.sopIdentifier)}
                            disabled={restoringSOPs[sop.sopIdentifier]}
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
                          >
                            {restoringSOPs[sop.sopIdentifier] ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Restoring…
                              </>
                            ) : (
                              <>
                                <RotateCcw className="h-3.5 w-3.5" />
                                Restore
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remaining SOPs Panel — SOPs with no MCQ bank yet */}
      {remainingPanel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 cursor-pointer bg-black/60 backdrop-blur-sm" onClick={() => setRemainingPanel(null)} />
          <div className="relative w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl bg-[#0D1117] border border-white/10 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
              <div>
                <h3 className="text-base font-black text-white">Remaining SOPs — No MCQs Yet</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">{remainingPanel.dept} · {remainingPanel.sops.length} SOP{remainingPanel.sops.length !== 1 ? 's' : ''} pending generation</p>
              </div>
              <button onClick={() => setRemainingPanel(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* List */}
            <div className="overflow-y-auto flex-1 px-4 py-3">
              {remainingPanel.sops.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">All SOPs have MCQ banks generated.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {remainingPanel.sops.map((sop) => (
                    <div key={sop.identifier} className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                      <div className="mt-0.5 p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
                        <FileText className="h-3 w-3 text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-amber-300 uppercase tracking-wider leading-tight">{sop.identifier}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight line-clamp-2">{sop.name || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Department Modal - Premium Overhaul */}
      {fullScreenDept &&
        (() => {
          const theme = getDeptTheme(fullScreenDept.name);
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 lg:p-8 animate-in fade-in duration-300">
              {/* Backdrop Click Handler */}
              <div
                className="absolute inset-0 cursor-pointer"
                onClick={() => {
                  setApprovalFilter('all');
                  setFullScreenDept(null);
                }}
              />

              <div
                className={`relative flex flex-col ${isCinemaMode ? "w-full h-full rounded-none" : "w-full max-w-[90rem] h-[92vh] rounded-[32px]"} bg-[#0D1117] overflow-hidden shadow-2xl border border-white/10 transition-all duration-500`}
                style={
                  !isCinemaMode
                    ? {
                      transform: `translate(${modalPosition.x}px, ${modalPosition.y}px)`,
                    }
                    : {}
                }
              >
                {/* Header Area with Rich Dynamic Gradients - Draggable Header */}
                {!isCinemaMode && (
                  <div
                    onMouseDown={handleMouseDown}
                    className={`relative px-8 py-6 bg-gradient-to-br ${theme.gradient} border-b border-white/5 overflow-hidden shrink-0 shadow-lg cursor-grab active:cursor-grabbing animate-in slide-in-from-top duration-500`}
                  >
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div
                          className={`w-14 h-14 rounded-2xl ${theme.badge} flex items-center justify-center text-3xl shadow-[0_10px_30px_rgba(0,0,0,0.3)] border border-white/10 group-hover:scale-105 transition-transform duration-500`}
                        >
                          <span className="drop-shadow-xl">
                            {fullScreenDept.icon || "📁"}
                          </span>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-4 flex-wrap">
                            <h2 className="text-3xl font-black text-white tracking-tight leading-none">
                              {fullScreenDept.name}
                            </h2>
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-white/50 text-[10px] font-bold uppercase tracking-widest">
                                Digital Repository
                              </span>
                              {trainerMappings[
                                fullScreenDept.name.toLowerCase()
                              ] && (
                                  <div
                                    className={`px-3 py-1 rounded-full border ${theme.badge} flex items-center gap-1.5`}
                                  >
                                    <Users className="h-3 w-3 opacity-70" />
                                    <span className="text-[10px] font-bold tracking-widest uppercase">
                                      {
                                        trainerMappings[
                                        fullScreenDept.name.toLowerCase()
                                        ]
                                      }
                                    </span>
                                  </div>
                                )}
                            </div>
                          </div>

                          <div className="flex items-center gap-5">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]" />
                              <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest leading-none">
                                <strong className="text-white mr-1.5">
                                  {fullScreenDept.totalQuestions}
                                </strong>{" "}
                                Question Units
                              </span>
                            </div>
                            <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]" />
                              <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest leading-none">
                                <strong className="text-white mr-1.5">
                                  {fullScreenDept.totalSOPs}
                                </strong>{" "}
                                Active SOPs
                              </span>
                            </div>
                          </div>

                          {/* High Quality Filter Pills */}
                          {(() => {
                            const stats = {
                              checked: 0,
                              similar: 0,
                              reviewed: 0,
                            };
                            fullScreenDept.subcategories.forEach((sub) => {
                              sub.sops.forEach((sop) => {
                                stats.checked += sop.checkedCount || 0;
                                stats.similar += sop.similarCount || 0;
                                stats.reviewed += sop.reviewedCount || 0;
                              });
                            });

                            const filterPills = [
                              {
                                id: "checked" as const,
                                label: "Approved",
                                count: stats.checked,
                                active:
                                  "bg-gradient-to-r from-emerald-600 to-emerald-500 border-white/20 text-white shadow-[0_0_30px_rgba(16,185,129,0.3)]",
                                inactive:
                                  "bg-emerald-500/5 border-emerald-500/10 text-emerald-400 hover:bg-emerald-500/10",
                                dot: "bg-emerald-400",
                                icon: <CheckCircle2 className="h-3 w-3" />,
                              },
                              {
                                id: "notChecked" as const,
                                label: "Not Checked",
                                count:
                                  (fullScreenDept.totalQuestions || 0) -
                                  stats.checked,
                                active:
                                  "bg-gradient-to-r from-rose-600 to-rose-500 border-white/20 text-white shadow-[0_0_30px_rgba(225,29,72,0.3)]",
                                inactive:
                                  "bg-rose-500/5 border-rose-500/10 text-rose-400 hover:bg-rose-500/10",
                                dot: "bg-rose-400",
                                icon: <AlertCircle className="h-3 w-3" />,
                              },
                              {
                                id: "similar" as const,
                                label: "Similar",
                                count: stats.similar,
                                active:
                                  "bg-gradient-to-r from-orange-600 to-orange-500 border-white/20 text-white shadow-[0_0_30_rgba(234,88,12,0.3)]",
                                inactive:
                                  "bg-orange-500/5 border-orange-500/10 text-orange-400 hover:bg-orange-500/10",
                                dot: "bg-orange-400",
                                icon: <AlertTriangle className="h-3 w-3" />,
                              },
                              {
                                id: "reviewed" as const,
                                label: "Reviewed",
                                count: stats.reviewed,
                                active:
                                  "bg-gradient-to-r from-indigo-600 to-indigo-500 border-white/20 text-white shadow-[0_0_30px_rgba(79,70,229,0.3)]",
                                inactive:
                                  "bg-indigo-500/5 border-indigo-500/10 text-indigo-400 hover:bg-indigo-500/10",
                                dot: "bg-indigo-400",
                                icon: <Star className="h-3 w-3" />,
                              },
                            ];

                            return (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {filterPills.map((pill) => (
                                  <button
                                    key={pill.id}
                                    onClick={() => {
                                      if (deptFilterMode === pill.id) {
                                        setDeptFilterMode("sops");
                                      } else {
                                        setDeptFilterMode(pill.id);
                                        fetchDeptQuestions(
                                          fullScreenDept.name,
                                          pill.id,
                                        );
                                      }
                                    }}
                                    className={`inline-flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.2em] px-2.5 py-1 ${pill.id === "similar" ? "rounded-lg" : "rounded-lg"} border transition-all duration-300 ${deptFilterMode === pill.id
                                      ? pill.active
                                      : pill.inactive
                                      }`}
                                  >
                                    {pill.icon}
                                    {pill.label}: {pill.count}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 -mt-4">
                        {/* Bulk Smart Regenerate button — always visible, processes ALL banks */}
                        {(() => {
                          const totalBanks = fullScreenDept.subcategories.reduce(
                            (acc, sub) => acc + sub.sops.reduce((s, sop) => s + (sop.mcqBanks?.length || 0), 0),
                            0
                          );
                          const isJobActive = bulkRegenJob?.department === fullScreenDept.name &&
                            ['pending', 'running'].includes(bulkRegenJob?.status || '');
                          const isJobDone = (
                            bulkRegenJob?.department === fullScreenDept.name &&
                            ['completed', 'failed', 'cancelled'].includes(bulkRegenJob?.status || '')
                          ) || (
                            !bulkRegenJob && !!getPersistedBulkRegenJob(fullScreenDept.name)
                          );

                          return (
                            <button
                              onClick={() => {
                                if (isJobActive) {
                                  setShowBulkRegenModal(true);
                                } else if (isJobDone) {
                                  // Restore from localStorage if in-memory state was lost
                                  if (!bulkRegenJob) {
                                    const saved = getPersistedBulkRegenJob(fullScreenDept.name);
                                    if (saved) setBulkRegenJob(saved);
                                  }
                                  setShowBulkRegenModal(true);
                                } else {
                                  handleStartBulkRegen(fullScreenDept.name);
                                  setShowBulkRegenModal(true);
                                }
                              }}
                              disabled={bulkRegenLoading}
                              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all font-bold text-[9px] uppercase tracking-widest backdrop-blur-xl shadow-lg group ${
                                isJobActive
                                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 cursor-pointer'
                                  : isJobDone
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                                  : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border-orange-500/20 hover:border-orange-500/40'
                              }`}
                              title="Auto-detect & resolve similar questions across all SOPs in this department"
                            >
                              {bulkRegenLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : isJobActive ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                <Zap className="h-3 w-3 group-hover:scale-125 transition-transform" />
                              )}
                              {isJobActive
                                ? `Running (${bulkRegenJob?.progress.banksProcessed}/${bulkRegenJob?.progress.banksTotal})`
                                : isJobDone
                                ? 'View Results'
                                : `Bulk Smart Regen`}
                            </button>
                          );
                        })()}

                        <Link href="/mcq-review">
                          <button className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/10 transition-all font-bold text-[9px] uppercase tracking-widest backdrop-blur-xl shadow-lg group">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400 group-hover:scale-125 transition-transform" />
                            Review
                          </button>
                        </Link>

                        <button
                          onClick={() => setIsCinemaMode(true)}
                          className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all group shadow-md"
                          title="Expand View (Cinema Mode)"
                        >
                          <Maximize2 className="h-4 w-4 text-white/70 group-hover:text-white transition-all duration-300" />
                        </button>

                        <button
                          onClick={() => {
                            setApprovalFilter('all');
                            setFullScreenDept(null);
                          }}
                          className="p-2.5 bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 rounded-lg transition-all group shadow-md"
                        >
                          <X className="h-4 w-4 text-white/70 group-hover:text-white group-hover:rotate-90 transition-all duration-300" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Toolbar: Search & View Controls */}
                <div className="px-6 py-3 bg-[#0D1117] border-b border-white/5 shrink-0 flex items-center justify-between shadow-md">
                  {isCinemaMode && (
                    <div className="flex items-center gap-3 mr-4">
                      <button
                        onClick={() => setIsCinemaMode(false)}
                        className="p-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/20 transition-all group"
                        title="Exit Expand View"
                      >
                        <Minimize2 className="h-4 w-4" />
                      </button>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-0.5">
                          {fullScreenDept.name}
                        </span>
                        <span className="text-[7px] font-bold text-gray-600 uppercase tracking-tighter">
                          Expand View Active
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-4 flex-1 max-w-3xl">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <input
                        type="text"
                        placeholder="Query department SOPs, codes, or specific questions..."
                        value={deptSearchTerm}
                        onChange={(e) => setDeptSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 bg-slate-800/40 border border-white/10 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
                      />
                      {deptSearchTerm && (
                        <button
                          onClick={() => setDeptSearchTerm("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Active Filter Badge */}
                    {approvalFilter !== 'all' && (() => {
                      const filterMeta: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
                        approved: { label: 'Approved', color: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', icon: <CheckCircle2 className="h-3 w-3 shrink-0" /> },
                        partial:  { label: 'Partial',  color: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300', icon: <AlertCircle className="h-3 w-3 shrink-0" /> },
                        pending:  { label: 'Pending',  color: 'bg-rose-500/15 border-rose-500/40 text-rose-300',       icon: <AlertTriangle className="h-3 w-3 shrink-0" /> },
                        similar:  { label: 'Similar',  color: 'bg-amber-500/15 border-amber-500/40 text-amber-300',    icon: <Copy className="h-3 w-3 shrink-0" /> },
                        sops:     { label: 'All SOPs', color: 'bg-purple-500/15 border-purple-500/40 text-purple-300', icon: <FileText className="h-3 w-3 shrink-0" /> },
                        checked:  { label: 'Checked Questions', color: 'bg-blue-500/15 border-blue-500/40 text-blue-300', icon: <CheckCircle2 className="h-3 w-3 shrink-0" /> },
                        reviewed: { label: 'Reviewed Questions', color: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300', icon: <Star className="h-3 w-3 shrink-0" /> },
                        completed:{ label: 'Completed (≥100)', color: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', icon: <CheckCircle2 className="h-3 w-3 shrink-0" /> },
                        target:   { label: 'Target (<100)', color: 'bg-amber-500/15 border-amber-500/40 text-amber-300', icon: <AlertCircle className="h-3 w-3 shrink-0" /> },
                        zero:     { label: 'Remaining (0)', color: 'bg-rose-500/15 border-rose-500/40 text-rose-300', icon: <FileText className="h-3 w-3 shrink-0" /> },
                      };
                      const meta = filterMeta[approvalFilter] ?? filterMeta.pending;
                      return (
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest shrink-0 ${meta.color}`}>
                          {meta.icon}
                          <span>{meta.label} Filter</span>
                          <button
                            onClick={() => setApprovalFilter('all')}
                            className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
                            title="Clear filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })()}

                    {/* View Strategy Toggle */}
                    {deptFilterMode === "sops" ? (
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 bg-slate-800/30 p-1 rounded-xl border border-white/5">
                          <button
                            onClick={() => setSOPViewMode("file")}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${sopViewMode === "file"
                              ? `${theme.button} text-white shadow-md`
                              : "text-gray-500 hover:text-gray-300"
                              }`}
                          >
                            <FolderOpen className="w-3 h-3 inline mr-1.5" /> File View
                          </button>
                          <button
                            onClick={() => setSOPViewMode("table")}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${sopViewMode === "table"
                              ? `${theme.button} text-white shadow-md`
                              : "text-gray-500 hover:text-gray-300"
                              }`}
                          >
                            <LayoutList className="w-3 h-3 inline mr-1.5" /> Table View
                          </button>
                        </div>
                        {sopViewMode === "file" && (
                          <div className="flex items-center gap-1.5 bg-slate-800/30 p-1 rounded-xl border border-white/5">
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest ml-2 mr-1">
                              Sort by:
                            </span>
                            {[
                              { value: "name", label: "Identity" },
                              { value: "sops", label: "Density" },
                              { value: "questions", label: "Volume" },
                            ].map((sort) => (
                              <button
                                key={sort.value}
                                onClick={() =>
                                  toggleDeptSort(
                                    fullScreenDept.name,
                                    sort.value as "name" | "sops" | "questions",
                                  )
                                }
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${deptSortBy[fullScreenDept.name] === sort.value
                                  ? `${theme.button} text-white shadow-md`
                                  : "text-gray-500 hover:text-gray-300"
                                  }`}
                              >
                                {sort.label}
                                {deptSortBy[fullScreenDept.name] === sort.value &&
                                  (deptSortOrder[fullScreenDept.name] === "asc" ? (
                                    <SortAsc className="h-3 w-3" />
                                  ) : (
                                    <SortDesc className="h-3 w-3" />
                                  ))}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setDeptFilterMode("sops")}
                          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-indigo-400 hover:text-indigo-300 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all border border-white/10"
                        >
                          <ArrowLeft className="h-3 w-3" />
                          Return to Structural View
                        </button>

                        {deptFilterMode !== "similar" && (
                          <button
                            onClick={() => {
                              setDeptFilterMode("similar");
                              fetchDeptQuestions(
                                fullScreenDept.name,
                                "similar",
                              );
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 hover:text-orange-300 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all border border-orange-500/20"
                          >
                            <AlertCircle className="h-3 w-3" />
                            Check Similar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Main Scroll Content */}
                <div className="overflow-y-auto flex-1 p-6 space-y-6 custom-scrollbar bg-[#0D1117]">
                  {deptFilterMode !== "sops" ? (
                    <div className="max-w-6xl mx-auto">
                      {loadingDeptQuestions ? (
                        <div className="flex flex-col items-center justify-center py-32 space-y-6">
                          <div className="relative">
                            <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Loader2 className="h-6 w-6 text-indigo-400 animate-pulse" />
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-white font-bold tracking-widest uppercase text-xs">
                              Cataloging Assets
                            </p>
                            <p className="text-gray-500 text-sm mt-1">
                              Indexing questions across all SOP identifiers...
                            </p>
                          </div>
                        </div>
                      ) : (
                        (() => {
                          let filtered = deptQuestions.filter((q) => {
                            if (deptFilterMode === "checked")
                              return q.isChecked === true;
                            if (deptFilterMode === "notChecked")
                              return q.isChecked !== true;
                            if (deptFilterMode === "similar") return false; // Handled by separate view
                            if (deptFilterMode === "reviewed")
                              return q.isReviewed === true;
                            return true;
                          });

                          if (deptSearchTerm.trim()) {
                            const searchLow = deptSearchTerm
                              .toLowerCase()
                              .trim();
                            filtered = filtered.filter(
                              (q) =>
                                (q.question || "")
                                  .toLowerCase()
                                  .includes(searchLow) ||
                                (q._sopIdentifier || "")
                                  .toLowerCase()
                                  .includes(searchLow) ||
                                (q._sopName || "")
                                  .toLowerCase()
                                  .includes(searchLow),
                            );
                          }

                          if (filtered.length === 0) {
                            return (
                              <div className="flex flex-col items-center justify-center py-32 text-center">
                                <div className="w-20 h-20 bg-white/5 rounded-[40px] flex items-center justify-center mb-6 border border-white/5 shadow-inner">
                                  <BookOpen className="h-10 w-10 text-gray-700" />
                                </div>
                                <h3 className="text-2xl font-bold text-gray-400">
                                  Inventory Empty
                                </h3>
                                <p className="text-gray-600 text-sm mt-2">
                                  No question units currently match your
                                  specified filters.
                                </p>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-4">
                              <div className="flex items-center gap-3 mb-8 px-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]" />
                                <h3 className="text-lg font-bold text-white tracking-tight">
                                  Displaying{" "}
                                  <span className="text-indigo-400">
                                    {filtered.length} matching units
                                  </span>{" "}
                                  across department records
                                </h3>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {filtered.slice(0, 100).map((q) => (
                                  <div
                                    key={`${q._bankId}-${q._originalIndex}`}
                                    className="group relative bg-[#131722] rounded-2xl border border-white/5 p-6 hover:border-indigo-500/40 transition-all duration-500 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)] overflow-hidden min-w-0"
                                  >
                                    {/* Hover Backdrop Decor */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                                    <div className="relative flex items-center justify-between mb-4">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="px-2 py-1 bg-black/40 rounded-lg border border-white/5 text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                                          {q._sopIdentifier}
                                        </div>
                                        <div className="px-2 py-1 bg-black/40 rounded-lg border border-white/5 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                          #{q._originalIndex + 1}
                                        </div>
                                        {q.difficulty && (
                                          <div
                                            className={`px-2 py-1 rounded-lg border text-[9px] font-bold uppercase tracking-widest ${q.difficulty === "Easy"
                                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                              : q.difficulty === "Medium"
                                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                              }`}
                                          >
                                            {q.difficulty}
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {q.isChecked && (
                                          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                                            <CheckCircle2 className="h-4 w-4" />
                                          </div>
                                        )}
                                        {q.isSimilar && (
                                          <div className="p-2 bg-orange-500/10 text-orange-400 rounded-xl border border-orange-500/20">
                                            <AlertCircle className="h-4 w-4" />
                                          </div>
                                        )}
                                        {q.isReviewed && (
                                          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                                            <Star className="h-4 w-4" />
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <h3 className="text-xl font-bold text-gray-100 leading-tight mb-8 tracking-tight group-hover:text-white transition-colors">
                                      {q.question.replace(/^⭐\s*/, "")}
                                    </h3>

                                    {q.options && q.options.length > 0 && (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {q.options.map(
                                          (opt: any, optIdx: number) => {
                                            const optLabel =
                                              String.fromCharCode(65 + optIdx);
                                            const isCorrect =
                                              q.correctAnswer === optLabel ||
                                              q.correctAnswer === opt ||
                                              (q.optionVariants &&
                                                q.optionVariants.find(
                                                  (v: any) => v.text === opt,
                                                )?.isCorrect);

                                            return (
                                              <div
                                                key={optIdx}
                                                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${isCorrect
                                                  ? "bg-emerald-500/10 border-emerald-500/30"
                                                  : "bg-black/20 border-white/5"
                                                  }`}
                                              >
                                                <div
                                                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold border ${isCorrect
                                                    ? "bg-emerald-500 text-white border-emerald-400 shadow-lg"
                                                    : "bg-white/5 text-gray-500 border-white/10"
                                                    }`}
                                                >
                                                  {optLabel}
                                                </div>
                                                <span
                                                  className={`text-sm ${isCorrect ? "text-emerald-400 font-bold" : "text-gray-400"}`}
                                                >
                                                  {opt}
                                                </span>
                                              </div>
                                            );
                                          },
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()
                      )}

                      {/* Similar Questions Special View */}
                      {deptFilterMode === "similar" && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                          {loadingSimilarGroups ? (
                            <div className="flex flex-col items-center justify-center py-20 space-y-6">
                              <div className="relative">
                                <div className="w-16 h-16 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <AlertCircle className="h-6 w-6 text-orange-400 animate-pulse" />
                                </div>
                              </div>
                              <div className="text-center">
                                <p className="text-white font-bold tracking-widest uppercase text-xs">
                                  Clusters Detected
                                </p>
                                <p className="text-gray-500 text-sm mt-1 animate-pulse">
                                  Analyzing similarity vectors and grouping
                                  related questions...
                                </p>
                              </div>
                            </div>
                          ) : similarGroups.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-[40px] border border-white/5 text-center shadow-inner">
                              <div className="w-24 h-24 bg-orange-500/10 rounded-full flex items-center justify-center mb-6 text-orange-400 border border-orange-500/20 shadow-[0_0_30px_rgba(249,115,22,0.1)]">
                                <CheckCircle2 className="h-10 w-10" />
                              </div>
                              <h3 className="text-3xl font-black text-white tracking-tight mb-2">
                                No Similarities Detected
                              </h3>
                              <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
                                Great news! No duplicate or similar questions
                                were found in the{" "}
                                <span className="text-indigo-400 font-bold">
                                  {fullScreenDept.name}
                                </span>{" "}
                                department. The repository is clean.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-8">
                              <div className="flex items-center justify-between px-2">
                                <div className="flex items-center gap-4">
                                  <div className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_15px_#f97316]" />
                                  <h3 className="text-2xl font-black text-white tracking-tight">
                                    Detected{" "}
                                    <span className="text-orange-400">
                                      {similarGroups.length} Similarity Clusters
                                    </span>
                                  </h3>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                                    Grouped by Primary Question
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-8">
                                {similarGroups.map((group) => (
                                  <div
                                    key={group._id}
                                    className="bg-[#131722] rounded-[40px] border border-white/5 overflow-hidden shadow-2xl hover:shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all duration-500 group"
                                  >
                                    {/* Group Header */}
                                    <div className="bg-gradient-to-r from-white/[0.03] to-transparent border-b border-white/5 px-10 py-6 flex items-center justify-between">
                                      <div className="flex items-center gap-6">
                                        <div className="px-4 py-1.5 bg-black/40 rounded-xl border border-white/10 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] shadow-inner">
                                          {group.sopIdentifier}
                                        </div>
                                        <div className="px-4 py-1.5 bg-orange-500/10 rounded-xl border border-orange-500/20 text-[11px] font-black text-orange-400 uppercase tracking-[0.2em] flex items-center gap-2 shadow-[0_0_15px_rgba(249,115,22,0.1)]">
                                          <AlertCircle className="h-3 w-3" />
                                          Pending Review
                                        </div>
                                      </div>
                                      <span className="text-[10px] text-gray-600 font-mono tracking-widest uppercase">
                                        ID: {group._id.slice(-6)}
                                      </span>
                                    </div>

                                    <div className="p-10 grid grid-cols-1 xl:grid-cols-2 gap-12 relative">
                                      {/* Vertical Divider */}
                                      <div className="hidden xl:block absolute top-10 bottom-10 left-1/2 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

                                      {/* Primary Question Column */}
                                      <div className="space-y-6">
                                        <div className="flex items-center gap-4 border-b border-indigo-500/10 pb-4">
                                          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                                            <Star className="h-5 w-5 fill-indigo-400" />
                                          </div>
                                          <div>
                                            <h4 className="text-sm font-black text-indigo-100 uppercase tracking-widest leading-none mb-1">
                                              Primary Question
                                            </h4>
                                            <p className="text-[10px] font-bold text-indigo-400/60 uppercase tracking-wider">
                                              The source of truth
                                            </p>
                                          </div>
                                        </div>

                                        <div className="p-8 rounded-[24px] bg-gradient-to-b from-indigo-500/[0.03] to-transparent border border-indigo-500/10 group-hover:border-indigo-500/20 transition-all shadow-inner">
                                          <p className="text-lg font-medium text-gray-100 leading-relaxed mb-8 tracking-tight">
                                            {group.primaryQuestion.question?.question?.replace(
                                              /^⭐\s*/,
                                              "",
                                            ) || "Question text missing"}
                                          </p>

                                          <div className="space-y-3">
                                            {group.primaryQuestion.question?.options?.map(
                                              (opt: string, i: number) => {
                                                const isCorrect =
                                                  opt ===
                                                  group.primaryQuestion.question
                                                    ?.correctAnswer;
                                                return (
                                                  <div
                                                    key={i}
                                                    className={`px-5 py-4 rounded-2xl border text-sm flex items-center gap-4 transition-all ${isCorrect ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : "bg-black/20 border-white/5 text-gray-400 hover:bg-white/5"}`}
                                                  >
                                                    <span
                                                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border ${isCorrect ? "bg-emerald-500 text-white border-emerald-400 shadow-lg" : "bg-white/5 border-white/10 text-gray-500"}`}
                                                    >
                                                      {String.fromCharCode(
                                                        65 + i,
                                                      )}
                                                    </span>
                                                    <span className="leading-snug">
                                                      {opt}
                                                    </span>
                                                  </div>
                                                );
                                              },
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Similar Question Column */}
                                      <div className="space-y-6">
                                        <div className="flex items-center gap-4 border-b border-orange-500/10 pb-4">
                                          <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.15)]">
                                            <AlertCircle className="h-5 w-5" />
                                          </div>
                                          <div>
                                            <h4 className="text-sm font-black text-orange-100 uppercase tracking-widest leading-none mb-1">
                                              Similar Variant (
                                              {group.similarQuestions.length})
                                            </h4>
                                            <p className="text-[10px] font-bold text-orange-400/60 uppercase tracking-wider">
                                              Detected duplicate candidate
                                            </p>
                                          </div>
                                        </div>

                                        {group.similarQuestions.map(
                                          (sq: any, idx: number) => (
                                            <div
                                              key={idx}
                                              className="p-8 rounded-[24px] bg-gradient-to-b from-orange-500/[0.03] to-transparent border border-orange-500/10 group-hover:border-orange-500/20 transition-all relative shadow-inner"
                                            >
                                              <div className="absolute top-0 right-0 p-6">
                                                <div className="px-3 py-1.5 bg-orange-500/20 rounded-lg border border-orange-500/30 text-[10px] font-black text-orange-300 uppercase tracking-wider shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                                                  {sq.similarityScore}% Match
                                                </div>
                                              </div>

                                              <p className="text-lg font-medium text-gray-100 leading-relaxed mb-8 pr-20 tracking-tight">
                                                {sq.question?.question?.replace(
                                                  /^⭐\s*/,
                                                  "",
                                                ) || "Question text missing"}
                                              </p>

                                              <div className="space-y-3">
                                                {sq.question?.options?.map(
                                                  (opt: string, i: number) => {
                                                    const isCorrect =
                                                      opt ===
                                                      sq.question
                                                        ?.correctAnswer;
                                                    return (
                                                      <div
                                                        key={i}
                                                        className={`px-5 py-4 rounded-2xl border text-sm flex items-center gap-4 transition-all ${isCorrect ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : "bg-black/20 border-white/5 text-gray-400 hover:bg-white/5"}`}
                                                      >
                                                        <span
                                                          className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border ${isCorrect ? "bg-emerald-500 text-white border-emerald-400 shadow-lg" : "bg-white/5 border-white/10 text-gray-500"}`}
                                                        >
                                                          {String.fromCharCode(
                                                            65 + i,
                                                          )}
                                                        </span>
                                                        <span className="leading-snug">
                                                          {opt}
                                                        </span>
                                                      </div>
                                                    );
                                                  },
                                                )}
                                              </div>
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    </div>

                                    {/* Action Footer */}
                                    <div className="bg-black/40 px-10 py-5 flex items-center justify-between border-t border-white/5 backdrop-blur-xl">
                                      <div className="flex items-center gap-4 text-[10px] text-gray-500 font-medium uppercase tracking-widest">
                                        <Info className="h-4 w-4" />
                                        <span>
                                          Review required to resolve conflict
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-4">
                                        <button className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5 transition-all">
                                          Ignore
                                        </button>
                                        <Link
                                          href={`/mcq-review?tab=similar&id=${group._id}`}
                                        >
                                          <button className="px-8 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-black uppercase tracking-widest shadow-[0_10px_30px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_40px_rgba(249,115,22,0.4)] transition-all flex items-center gap-3 transform hover:-translate-y-1">
                                            Resolve Conflict
                                            <ArrowRight className="h-4 w-4" />
                                          </button>
                                        </Link>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : sopViewMode === "file" ? (
                    <div className="w-full space-y-4">
                      {sortSubcategories(
                        fullScreenDept.subcategories
                          .map((sub) => ({
                            ...sub,
                            sops: sub.sops.filter((s) => {
                              const st = deptSearchTerm.toLowerCase().trim();
                              const matchesSearch = !st || s.sopName.toLowerCase().includes(st) || s.sopCode.toLowerCase().includes(st);
                              if (!matchesSearch) return false;
                              if (approvalFilter === 'approved') return (s.totalQuestions ?? 0) > 0 && (s.checkedCount ?? 0) >= (s.totalQuestions ?? 0);
                              if (approvalFilter === 'similar')  return (s.similarCount ?? 0) > 0;
                              if (approvalFilter === 'partial')  return (s.totalQuestions ?? 0) > 0 && (s.checkedCount ?? 0) > 0 && (s.checkedCount ?? 0) < (s.totalQuestions ?? 0) && (s.similarCount ?? 0) === 0;
                              if (approvalFilter === 'pending')  return (s.totalQuestions ?? 0) > 0 && (s.checkedCount ?? 0) === 0 && (s.similarCount ?? 0) === 0;
                              if (approvalFilter === 'checked')  return (s.checkedCount ?? 0) > 0;
                              if (approvalFilter === 'reviewed') return (s.reviewedCount ?? 0) > 0;
                              if (approvalFilter === 'completed') return (s.mcqBanks && s.mcqBanks.length > 0) && (s.totalQuestions ?? 0) >= 100;
                              if (approvalFilter === 'target')   return (s.mcqBanks && s.mcqBanks.length > 0) && (s.totalQuestions ?? 0) > 0 && (s.totalQuestions ?? 0) < 100;
                              if (approvalFilter === 'zero')     return (s.mcqBanks && s.mcqBanks.length > 0) && (s.totalQuestions ?? 0) === 0;
                              return true;
                            }),
                          }))
                          .filter((sub) => sub.sops.length > 0),
                        fullScreenDept.name,
                      ).map((subcat) => {
                        const subcatKey = `${fullScreenDept.name}-${subcat.code}`;
                        const isSubcatExpanded = expandedSubcats.has(subcatKey);

                        return (
                          <div
                            key={subcatKey}
                            className={`rounded-xl border border-white/5 overflow-hidden bg-[#1a1625] focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all shadow-md shadow-black/20`}
                          >
                            <div
                              onClick={() => toggleSubcategory(subcatKey)}
                              className={`w-full px-5 py-4 flex items-center justify-between transition-all group cursor-pointer ${isSubcatExpanded ? "bg-white/[0.02] border-b border-white/5" : "hover:bg-white/[0.02]"}`}
                            >
                              <div className="flex items-center gap-4">
                                <div
                                  className={`p-2 rounded-xl bg-[#231f36] ${theme.text} shadow-sm ring-1 ring-white/5`}
                                >
                                  {isSubcatExpanded ? (
                                    <FolderOpen className="h-5 w-5" />
                                  ) : (
                                    <Folder className="h-5 w-5" />
                                  )}
                                </div>
                                <div className="text-left space-y-0.5">
                                  <h4 className="text-base font-bold text-gray-200 tracking-tight flex items-center gap-2 group-hover:text-white transition-colors">
                                    {subcat.name}
                                    <span className="text-[9px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 font-bold uppercase tracking-wider border border-indigo-500/20">
                                      {subcat.code}
                                    </span>
                                  </h4>
                                  <div className="flex items-center gap-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                                    <span>{subcat.totalSOPs} Active SOPs</span>
                                    <span className="w-1 h-1 rounded-full bg-gray-700" />
                                    <span>
                                      {subcat.totalQuestions} Questions
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div
                                className={`p-2 rounded-lg ${isSubcatExpanded ? "bg-indigo-500/20 text-indigo-300" : "bg-white/5 text-gray-600"} transition-all group-hover:bg-indigo-500/10 group-hover:text-indigo-400`}
                              >
                                <ChevronRight
                                  className={`h-4 w-4 transition-transform duration-300 ${isSubcatExpanded ? "rotate-90" : ""}`}
                                />
                              </div>
                            </div>

                            {isSubcatExpanded && (
                              <div className="bg-[#13111c]/30 animate-in slide-in-from-top-2 duration-300 border-t border-white/5 shadow-inner">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-white/5">
                                  {sortSOPs(subcat.sops, subcatKey).map(
                                    (sop) => {
                                      const hasQuestions =
                                        sop.totalQuestions > 0;
                                      return (
                                        <div
                                          key={sop.sopId}
                                          onClick={() =>
                                            sop.mcqBanks &&
                                              sop.mcqBanks.length > 0
                                              ? onViewMCQs(sop)
                                              : undefined
                                          }
                                          className={`group relative bg-[#1a1625] hover:bg-[#231f36] transition-all duration-200 cursor-pointer flex items-center justify-between px-5 py-4`}
                                        >
                                          {/* Ambient Row Light */}
                                          <div className="absolute inset-y-0 left-0 w-1 bg-indigo-500/0 group-hover:bg-indigo-500 transition-all" />

                                          <div className="flex items-center gap-4">
                                            <div className="flex-shrink-0">
                                              {(sop.checkedCount || 0) > 0 && (sop.checkedCount || 0) >= sop.totalQuestions ? (
                                                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)] transition-all group-hover:bg-emerald-500/20" title="Approved / Checked">
                                                  <CheckCircle2 className="h-5 w-5" />
                                                </div>
                                              ) : (sop.similarCount || 0) > 0 ? (
                                                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.15)] transition-all group-hover:bg-orange-500/20" title="Has Similar Questions">
                                                  <AlertTriangle className="h-5 w-5" />
                                                </div>
                                              ) : (sop.checkedCount || 0) > 0 ? (
                                                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-all group-hover:bg-blue-500/20" title="Reviewing">
                                                  <RotateCcw className="h-5 w-5" />
                                                </div>
                                              ) : (
                                                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-gray-500 transition-all group-hover:bg-indigo-500/10 group-hover:border-indigo-500/20 group-hover:text-indigo-400">
                                                  <FileText className="h-5 w-5" />
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <div className="flex flex-col min-w-0">
                                                  <div className="flex items-center gap-1.5">
                                                    <h4 className="text-xs font-black text-white tracking-widest uppercase">
                                                      {sop.sopCode}
                                                    </h4>
                                                    {sop.isObsolete ? (
                                                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200 border border-rose-500/30 tracking-wider">
                                                        OBSOLETE
                                                      </span>
                                                    ) : null}
                                                    {(() => {
                                                      const upCode = sop.sopCode
                                                        .toUpperCase()
                                                        .trim();
                                                      const baseCodeMatch =
                                                        upCode.match(
                                                          /^([A-Z]{2,4}\d+)/,
                                                        );
                                                      const baseCode =
                                                        baseCodeMatch
                                                          ? baseCodeMatch[1]
                                                          : "";

                                                      const sopTrainer =
                                                        trainerMappings[
                                                        upCode
                                                        ] ||
                                                        (baseCode &&
                                                          trainerMappings[
                                                          baseCode
                                                          ]);
                                                      const deptName =
                                                        fullScreenDept?.name ||
                                                        "";
                                                      const nk =
                                                        normalizeDepartmentName(
                                                          deptName,
                                                        ).toLowerCase();
                                                      const deptTrainer =
                                                        trainerMappings[nk] ||
                                                        trainerMappings[
                                                        deptName.toLowerCase()
                                                        ];

                                                      const trainerName =
                                                        sopTrainer ||
                                                        deptTrainer;
                                                      if (!trainerName)
                                                        return null;

                                                      return (
                                                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 tracking-wider flex items-center gap-1 ml-1.5">
                                                          <Users className="h-2.5 w-2.5" />
                                                          {trainerName}
                                                        </span>
                                                      );
                                                    })()}
                                                  </div>
                                                </div>
                                                <span
                                                  className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border uppercase tracking-widest ${hasQuestions
                                                    ? "bg-black/40 text-gray-400 border-white/10"
                                                    : "bg-gray-800 text-gray-600 border-transparent"
                                                    }`}
                                                >
                                                  {sop.totalQuestions} Qs
                                                </span>
                                                {/* Status markers removed here because we have the main icon now */}
                                              </div>
                                              <p className="text-[10px] text-gray-500 font-medium group-hover:text-gray-300 transition-colors truncate">
                                                {cleanSOPName(
                                                  sop.sopName,
                                                  sop.sopCode,
                                                )}
                                              </p>
                                            </div>
                                          </div>
                                            <div className="flex items-center gap-2">
                                              {/* Case 1: No MCQ Bank at all → Generate fresh 100 */}
                                              {sop.totalQuestions === 0 && (!sop.mcqBanks || sop.mcqBanks.length === 0) && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setGeneratingMore(prev => ({ ...prev, [sop.sopId]: true }));
                                                    setGenerateMoreResults(prev => { const next = { ...prev }; delete next[sop.sopId]; return next; });
                                                    fetch('/api/sop/generate-mcqs', {
                                                      method: 'POST',
                                                      headers: { 'Content-Type': 'application/json' },
                                                      body: JSON.stringify({ sopId: sop.sopId, targetCount: 100 }),
                                                    })
                                                      .then(res => res.json())
                                                      .then(data => {
                                                        if (data.success) {
                                                          setGenerateMoreResults(prev => ({ ...prev, [sop.sopId]: { success: true, message: `+${data.total || 100} Qs` } }));
                                                          Object.keys(localStorage).forEach(key => {
                                                              if (key.startsWith('mcq-tree-cache')) localStorage.removeItem(key);
                                                            });
                                                          setTimeout(() => window.location.reload(), 800);
                                                        } else {
                                                          setGenerateMoreResults(prev => ({ ...prev, [sop.sopId]: { success: false, message: data.error || 'Error' } }));
                                                        }
                                                      })
                                                      .catch(() => setGenerateMoreResults(prev => ({ ...prev, [sop.sopId]: { success: false, message: 'Network error' } })))
                                                      .finally(() => setGeneratingMore(prev => ({ ...prev, [sop.sopId]: false })));
                                                  }}
                                                  disabled={generatingMore[sop.sopId]}
                                                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[8px] font-bold uppercase tracking-wider border transition-all ${
                                                    generateMoreResults[sop.sopId]
                                                      ? generateMoreResults[sop.sopId].success
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                      : generatingMore[sop.sopId]
                                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 cursor-wait'
                                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                                                  }`}
                                                  title="Generate 100 MCQs for this SOP"
                                                >
                                                  {generatingMore[sop.sopId] ? (
                                                    <><Loader2 className="h-2.5 w-2.5 animate-spin" />Generating...</>
                                                  ) : generateMoreResults[sop.sopId] ? (
                                                    <>{generateMoreResults[sop.sopId].message}</>
                                                  ) : (
                                                    <><Plus className="h-2.5 w-2.5" />Gen 100 MCQs</>
                                                  )}
                                                </button>
                                              )}
                                              {/* Case 2: Has MCQ bank but under 100 → Top up */}
                                              {sop.totalQuestions < 100 && sop.mcqBanks && sop.mcqBanks.length > 0 && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    const bankId = sop.mcqBanks[0]._id || sop.mcqBanks[0];
                                                    setGeneratingMore(prev => ({ ...prev, [sop.sopId]: true }));
                                                    setGenerateMoreResults(prev => {
                                                      const next = { ...prev };
                                                      delete next[sop.sopId];
                                                      return next;
                                                    });
                                                    fetch('/api/mcq-bank/generate-more', {
                                                      method: 'POST',
                                                      headers: { 'Content-Type': 'application/json' },
                                                      body: JSON.stringify({ bankId, sopId: sop.sopId }),
                                                    })
                                                      .then(res => res.json())
                                                      .then(data => {
                                                        if (data.success) {
                                                          setGenerateMoreResults(prev => ({
                                                            ...prev,
                                                            [sop.sopId]: { success: true, message: `+${data.generated}` },
                                                          }));
                                                          Object.keys(localStorage).forEach(key => {
                                                              if (key.startsWith('mcq-tree-cache')) localStorage.removeItem(key);
                                                            });
                                                          setTimeout(() => window.location.reload(), 800);
                                                        } else {
                                                          setGenerateMoreResults(prev => ({
                                                            ...prev,
                                                            [sop.sopId]: { success: false, message: 'Error' },
                                                          }));
                                                        }
                                                      })
                                                      .catch(() => {
                                                        setGenerateMoreResults(prev => ({
                                                          ...prev,
                                                          [sop.sopId]: { success: false, message: 'Error' },
                                                        }));
                                                      })
                                                      .finally(() => {
                                                        setGeneratingMore(prev => ({ ...prev, [sop.sopId]: false }));
                                                      });
                                                  }}
                                                  disabled={generatingMore[sop.sopId]}
                                                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[8px] font-bold uppercase tracking-wider border transition-all ${
                                                    generatingMore[sop.sopId]
                                                      ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 cursor-wait'
                                                      : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20'
                                                  }`}
                                                  title={`Generate ${100 - sop.totalQuestions} more questions`}
                                                >
                                                  {generatingMore[sop.sopId] ? (
                                                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                  ) : (
                                                    <Plus className="h-2.5 w-2.5" />
                                                  )}
                                                  +{100 - sop.totalQuestions}
                                                </button>
                                              )}
                                              <div className="p-1.5 rounded-md bg-white/5 text-gray-600 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors">
                                                <ChevronRight className="h-3 w-3" />
                                              </div>
                                            </div>
                                        </div>
                                      );
                                    },
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="w-full bg-[#131722] rounded-2xl border border-white/5 shadow-xl overflow-hidden mt-4">
                      {/* TABLE VIEW */}
                      {(() => {
                        // Mirror API classification exactly (dept-stats route.ts)
                        const isSopApproved  = (sop: SOPNode) => (sop.totalQuestions ?? 0) > 0 && (sop.checkedCount ?? 0) >= (sop.totalQuestions ?? 0);
                        const isSopSimilar   = (sop: SOPNode) => (sop.similarCount ?? 0) > 0;
                        const isSopPartial   = (sop: SOPNode) => {
                          const total   = sop.totalQuestions ?? 0;
                          const checked = sop.checkedCount   ?? 0;
                          return total > 0 && !isSopApproved(sop) && !isSopSimilar(sop) && checked > 0;
                        };
                        const isSopPending   = (sop: SOPNode) => {
                          const total = sop.totalQuestions ?? 0;
                          return total > 0 && !isSopApproved(sop) && !isSopSimilar(sop) && (sop.checkedCount ?? 0) === 0;
                        };
                        const hasSopChecked  = (sop: SOPNode) => (sop.checkedCount  ?? 0) > 0;
                        const hasSopReviewed = (sop: SOPNode) => (sop.reviewedCount ?? 0) > 0;

                        const allSOPs = fullScreenDept.subcategories.flatMap((sub) => sub.sops);
                        const filteredSOPs = allSOPs.filter((s) => {
                          const st = deptSearchTerm.toLowerCase().trim();
                          const matchesSearch =
                            s.sopName.toLowerCase().includes(st) ||
                            s.sopCode.toLowerCase().includes(st);
                          if (!matchesSearch) return false;
                          if (approvalFilter === 'approved') return isSopApproved(s);
                          if (approvalFilter === 'partial')  return isSopPartial(s);
                          if (approvalFilter === 'pending')  return isSopPending(s);
                          if (approvalFilter === 'similar')  return isSopSimilar(s);
                          if (approvalFilter === 'checked')  return hasSopChecked(s);
                          if (approvalFilter === 'reviewed') return hasSopReviewed(s);
                          if (approvalFilter === 'completed') return (s.mcqBanks && s.mcqBanks.length > 0) && (s.totalQuestions ?? 0) >= 100;
                          if (approvalFilter === 'target')   return (s.mcqBanks && s.mcqBanks.length > 0) && (s.totalQuestions ?? 0) > 0 && (s.totalQuestions ?? 0) < 100;
                          if (approvalFilter === 'zero')     return (s.mcqBanks && s.mcqBanks.length > 0) && (s.totalQuestions ?? 0) === 0;
                          // 'sops' and 'all' — show everything
                          return true;
                        });

                        const handleTableSort = (col: "code" | "name" | "questions" | "checked" | "reviewed" | "similar") => {
                          if (tableSortCol === col) {
                            setTableSortDir(tableSortDir === "asc" ? "desc" : "asc");
                          } else {
                            setTableSortCol(col);
                            setTableSortDir("asc");
                          }
                        };

                        const sortedSOPs = [...filteredSOPs].sort((a, b) => {
                          let valA: any = "";
                          let valB: any = "";

                          switch (tableSortCol) {
                            case "code":
                              valA = a.sopCode;
                              valB = b.sopCode;
                              break;
                            case "name":
                              valA = cleanSOPName(a.sopName, a.sopCode);
                              valB = cleanSOPName(b.sopName, b.sopCode);
                              break;
                            case "questions":
                              valA = a.totalQuestions || 0;
                              valB = b.totalQuestions || 0;
                              break;
                            case "checked":
                              valA = a.checkedCount || 0;
                              valB = b.checkedCount || 0;
                              break;
                            case "reviewed":
                              valA = a.reviewedCount || 0;
                              valB = b.reviewedCount || 0;
                              break;
                            case "similar":
                              valA = a.similarCount || 0;
                              valB = b.similarCount || 0;
                              break;
                            default:
                              valA = a.sopCode;
                              valB = b.sopCode;
                          }

                          if (typeof valA === "string" && typeof valB === "string") {
                            return tableSortDir === "asc"
                              ? valA.localeCompare(valB, undefined, { numeric: true })
                              : valB.localeCompare(valA, undefined, { numeric: true });
                          }

                          return tableSortDir === "asc" ? valA - valB : valB - valA;
                        });

                        return (
                          <div className="w-full overflow-x-auto min-h-[400px]">
                            <table className="w-full text-left border-collapse">
                              <thead className="bg-[#1a1625]/80 backdrop-blur-md sticky top-0 z-10 border-b border-white/10">
                                <tr>
                                  {[
                                    { id: "code", label: "Protocol ID" },
                                    { id: "name", label: "SOP Name" },
                                    { id: "questions", label: "Units" },
                                    { id: "checked", label: "Approved" },
                                    { id: "reviewed", label: "Reviewed" },
                                    { id: "similar", label: "Similar" },
                                  ].map((col) => (
                                    <th
                                      key={col.id}
                                      onClick={() => handleTableSort(col.id as any)}
                                      className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap"
                                    >
                                      <div className="flex items-center gap-2">
                                        {col.label}
                                        {tableSortCol === col.id ? (
                                          tableSortDir === "asc" ? (
                                            <SortAsc className="h-3 w-3 text-indigo-400" />
                                          ) : (
                                            <SortDesc className="h-3 w-3 text-indigo-400" />
                                          )
                                        ) : (
                                          <SortAsc className="h-3 w-3 opacity-0 group-hover:opacity-30 transition-opacity" />
                                        )}
                                      </div>
                                    </th>
                                  ))}
                                  <th className="p-4 text-right"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {sortedSOPs.map((sop) => {
                                  return (
                                    <tr
                                      key={sop.sopId}
                                      onClick={() =>
                                        sop.mcqBanks && sop.mcqBanks.length > 0 ? onViewMCQs(sop) : undefined
                                      }
                                      className="hover:bg-white/[0.02] cursor-pointer transition-colors group"
                                    >
                                      <td className="p-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                          {/* Status icon - large and prominent */}
                                          {(sop.checkedCount || 0) > 0 && (sop.checkedCount || 0) >= sop.totalQuestions ? (
                                            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex-shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.15)]" title="Approved / Checked">
                                              <CheckCircle2 className="h-4 w-4" />
                                            </div>
                                          ) : (sop.similarCount || 0) > 0 ? (
                                            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 flex-shrink-0 animate-pulse shadow-[0_0_10px_rgba(249,115,22,0.15)]" title="Has Similar Questions">
                                              <AlertTriangle className="h-4 w-4" />
                                            </div>
                                          ) : sop.totalQuestions > 0 ? (
                                            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/5 border border-white/10 text-gray-500 flex-shrink-0" title="Not Checked">
                                              <AlertCircle className="h-4 w-4" />
                                            </div>
                                          ) : (
                                            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/5 border border-white/10 text-gray-600 flex-shrink-0">
                                              <FileText className="h-4 w-4" />
                                            </div>
                                          )}
                                          <span className="text-xs font-black text-white tracking-widest uppercase">
                                            {sop.sopCode}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="p-4">
                                        <div className="flex flex-col gap-1">
                                          <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors line-clamp-1">
                                            {cleanSOPName(sop.sopName, sop.sopCode)}
                                          </span>
                                          {(() => {
                                            const upCode = sop.sopCode.toUpperCase().trim();
                                            const baseCodeMatch = upCode.match(/^([A-Z]{2,4}\d+)/);
                                            const baseCode = baseCodeMatch ? baseCodeMatch[1] : "";
                                            const sopTrainer = trainerMappings[upCode] || (baseCode && trainerMappings[baseCode]);
                                            const deptName = fullScreenDept?.name || "";
                                            const nk = normalizeDepartmentName(deptName).toLowerCase();
                                            const deptTrainer = trainerMappings[nk] || trainerMappings[deptName.toLowerCase()];
                                            const trainerName = sopTrainer || deptTrainer;
                                            if (!trainerName) return null;

                                            return (
                                              <span className="text-[9px] font-bold text-gray-500 flex items-center gap-1">
                                                <Users className="h-3 w-3 opacity-60" />
                                                {trainerName}
                                              </span>
                                            );
                                          })()}
                                        </div>
                                      </td>
                                      <td className="p-4 whitespace-nowrap">
                                        <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-bold text-gray-300 w-max inline-block">
                                          {sop.totalQuestions}
                                        </span>
                                      </td>
                                      <td className="p-4 whitespace-nowrap">
                                        {sop.checkedCount && sop.checkedCount > 0 ? (
                                          <span className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 flex items-center gap-1.5 w-max">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            {sop.checkedCount}
                                          </span>
                                        ) : (
                                          <span className="text-gray-600">-</span>
                                        )}
                                      </td>
                                      <td className="p-4 whitespace-nowrap">
                                        {sop.reviewedCount && sop.reviewedCount > 0 ? (
                                          <span className="px-2.5 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400 flex items-center gap-1.5 w-max">
                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                            {sop.reviewedCount}
                                          </span>
                                        ) : (
                                          <span className="text-gray-600">-</span>
                                        )}
                                      </td>
                                      <td className="p-4 whitespace-nowrap">
                                        {sop.similarCount && sop.similarCount > 0 ? (
                                          <span className="px-2.5 py-1 rounded bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold text-orange-400 flex items-center gap-1.5 w-max shadow-[0_0_10px_rgba(249,115,22,0.1)]">
                                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                                            {sop.similarCount}
                                          </span>
                                        ) : (
                                          <span className="text-gray-600">-</span>
                                        )}
                                      </td>
                                      <td className="p-4 text-right whitespace-nowrap">
                                        <div className="flex items-center justify-end gap-2">
                                          {/* Case 1: No MCQ Bank → Generate fresh 100 */}
                                          {sop.totalQuestions === 0 && (!sop.mcqBanks || sop.mcqBanks.length === 0) && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setGeneratingMore(prev => ({ ...prev, [sop.sopId]: true }));
                                                setGenerateMoreResults(prev => { const next = { ...prev }; delete next[sop.sopId]; return next; });
                                                fetch('/api/sop/generate-mcqs', {
                                                  method: 'POST',
                                                  headers: { 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ sopId: sop.sopId, targetCount: 100 }),
                                                })
                                                  .then(res => res.json())
                                                  .then(data => {
                                                    if (data.success) {
                                                      setGenerateMoreResults(prev => ({ ...prev, [sop.sopId]: { success: true, message: `+${data.total || 100} Qs Generated!` } }));
                                                      Object.keys(localStorage).forEach(key => {
                                                        if (key.startsWith('mcq-tree-cache')) localStorage.removeItem(key);
                                                      });
                                                      setTimeout(() => window.location.reload(), 800);
                                                    } else {
                                                      setGenerateMoreResults(prev => ({ ...prev, [sop.sopId]: { success: false, message: data.error || 'Failed' } }));
                                                    }
                                                  })
                                                  .catch(() => setGenerateMoreResults(prev => ({ ...prev, [sop.sopId]: { success: false, message: 'Network error' } })))
                                                  .finally(() => setGeneratingMore(prev => ({ ...prev, [sop.sopId]: false })));
                                              }}
                                              disabled={generatingMore[sop.sopId]}
                                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all ${
                                                generateMoreResults[sop.sopId]
                                                  ? generateMoreResults[sop.sopId].success
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                  : generatingMore[sop.sopId]
                                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 cursor-wait'
                                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 animate-pulse'
                                              }`}
                                              title="Generate 100 MCQs for this SOP (no bank exists yet)"
                                            >
                                              {generatingMore[sop.sopId] ? (
                                                <>
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                  Generating...
                                                </>
                                              ) : generateMoreResults[sop.sopId] ? (
                                                <>{generateMoreResults[sop.sopId].message}</>
                                              ) : (
                                                <>
                                                  <Plus className="h-3 w-3" />
                                                  Generate 100 MCQs
                                                </>
                                              )}
                                            </button>
                                          )}
                                          {/* Case 2: Has bank but under 100 → Top up */}
                                          {sop.totalQuestions < 100 && sop.mcqBanks && sop.mcqBanks.length > 0 && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const bankId = sop.mcqBanks[0]._id || sop.mcqBanks[0];
                                                const sopIdVal = sop.sopId;
                                                setGeneratingMore(prev => ({ ...prev, [sop.sopId]: true }));
                                                setGenerateMoreResults(prev => {
                                                  const next = { ...prev };
                                                  delete next[sop.sopId];
                                                  return next;
                                                });
                                                fetch('/api/mcq-bank/generate-more', {
                                                  method: 'POST',
                                                  headers: { 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ bankId, sopId: sopIdVal }),
                                                })
                                                  .then(res => res.json())
                                                  .then(data => {
                                                    if (data.success) {
                                                      setGenerateMoreResults(prev => ({
                                                        ...prev,
                                                        [sop.sopId]: { success: true, message: `+${data.generated} Qs` },
                                                      }));
                                                      Object.keys(localStorage).forEach(key => {
                                                        if (key.startsWith('mcq-tree-cache')) localStorage.removeItem(key);
                                                      });
                                                      setTimeout(() => window.location.reload(), 800);
                                                    } else {
                                                      setGenerateMoreResults(prev => ({
                                                        ...prev,
                                                        [sop.sopId]: { success: false, message: data.error || 'Failed' },
                                                      }));
                                                    }
                                                  })
                                                  .catch(() => {
                                                    setGenerateMoreResults(prev => ({
                                                      ...prev,
                                                      [sop.sopId]: { success: false, message: 'Network error' },
                                                    }));
                                                  })
                                                  .finally(() => {
                                                    setGeneratingMore(prev => ({ ...prev, [sop.sopId]: false }));
                                                  });
                                              }}
                                              disabled={generatingMore[sop.sopId]}
                                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all ${
                                                generateMoreResults[sop.sopId]
                                                  ? generateMoreResults[sop.sopId].success
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                  : generatingMore[sop.sopId]
                                                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 cursor-wait'
                                                    : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/30'
                                              }`}
                                              title={`Generate ${100 - sop.totalQuestions} more questions to reach 100`}
                                            >
                                              {generatingMore[sop.sopId] ? (
                                                <>
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                  Generating...
                                                </>
                                              ) : generateMoreResults[sop.sopId] ? (
                                                <>{generateMoreResults[sop.sopId].message}</>
                                              ) : (
                                                <>
                                                  <Plus className="h-3 w-3" />
                                                  +{100 - sop.totalQuestions} Qs
                                                </>
                                              )}
                                            </button>
                                          )}
                                          <ChevronRight className="h-4 w-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                                {sortedSOPs.length === 0 && (
                                  <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-500 text-sm">
                                      No SOPs match your search criteria.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      {/* Delete SOP feature removed */}

      {/* ── Bulk Regen SOP Detail Modal ─────────────────────────────────── */}
      {bulkRegenDetailBank && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setBulkRegenDetailBank(null)} />

          <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-[#0D1117] rounded-[20px] border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="px-6 py-5 border-b border-white/5 bg-gradient-to-r from-[#0D1117] to-indigo-950/20 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl border ${
                    bulkRegenDetailBank.status === 'completed'
                      ? 'bg-emerald-500/10 border-emerald-500/20'
                      : 'bg-rose-500/10 border-rose-500/20'
                  }`}>
                    {bulkRegenDetailBank.status === 'completed'
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      : <XCircle className="h-5 w-5 text-rose-400" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-white">{bulkRegenDetailBank.sopIdentifier}</h3>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                        bulkRegenDetailBank.language === 'Gujarati'
                          ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                          : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                      }`}>{bulkRegenDetailBank.language === 'Gujarati' ? 'GU' : 'EN'}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{bulkRegenDetailBank.sopName}</p>
                  </div>
                </div>
                <button onClick={() => setBulkRegenDetailBank(null)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                {bulkRegenDetailBank.questionsReplaced > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    <span className="text-[10px] font-black text-emerald-400">{bulkRegenDetailBank.questionsReplaced} similar replaced</span>
                  </div>
                )}
                {bulkRegenDetailBank.questionsReplaced === 0 && bulkRegenDetailBank.status === 'completed' && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg">
                    <CheckCircle2 className="h-3 w-3 text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-400">No similar questions found — bank is clean</span>
                  </div>
                )}
                {bulkRegenDetailBank.questionsFailed > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                    <AlertTriangle className="h-3 w-3 text-rose-400" />
                    <span className="text-[10px] font-black text-rose-400">{bulkRegenDetailBank.questionsFailed} generation failed</span>
                  </div>
                )}
                {bulkRegenDetailBank.remainingSimilar === 0 && bulkRegenDetailBank.questionsReplaced > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                    <Zap className="h-3 w-3 text-indigo-400" />
                    <span className="text-[10px] font-black text-indigo-400">Verified unique</span>
                  </div>
                )}
              </div>

              {/* Uniqueness guarantee note */}
              {bulkRegenDetailBank.questionsReplaced > 0 && (
                <div className="mt-3 px-3 py-2 bg-indigo-500/5 border border-indigo-500/15 rounded-xl">
                  <p className="text-[9px] text-indigo-300 leading-relaxed">
                    <span className="font-black">Uniqueness Guarantee:</span> Each replacement question was generated with the full list of existing questions provided to the AI as context to avoid. After replacement, the bank was re-scanned to confirm zero similar pairs remain. The replaced questions have been archived.
                  </p>
                </div>
              )}
            </div>

            {/* Body — replacements list */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

              {bulkRegenDetailBank.replacements?.length > 0 ? (
                <>
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                    Replacement Details — {bulkRegenDetailBank.replacements.length} question{bulkRegenDetailBank.replacements.length !== 1 ? 's' : ''} replaced
                  </p>

                  {bulkRegenDetailBank.replacements.map((rec, ri) => (
                    <div key={ri} className="rounded-xl border border-white/8 overflow-hidden">
                      {/* Replacement number + similarity score */}
                      <div className="flex items-center gap-3 px-4 py-2 bg-white/[0.03] border-b border-white/5">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Replacement #{ri + 1}</span>
                        <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400">
                          {rec.similarityScore}% similar to kept question
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
                        {/* OLD QUESTION */}
                        <div className="p-4 bg-rose-500/[0.03]">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                            <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest">Similar Question (Removed)</span>
                          </div>
                          <p className="text-[11px] text-gray-200 leading-relaxed font-medium mb-3">{rec.oldQuestion}</p>
                          <div className="space-y-1.5 mb-3">
                            {rec.oldOptions.map((opt, oi) => (
                              <div key={oi} className={`flex items-start gap-2 text-[10px] px-2 py-1 rounded-lg ${
                                opt === rec.oldAnswer
                                  ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                                  : 'text-gray-500'
                              }`}>
                                <span className="shrink-0 font-black">{String.fromCharCode(65 + oi)}.</span>
                                <span>{opt}{opt === rec.oldAnswer && <span className="ml-1 text-[8px] font-black text-rose-400">✓ answer</span>}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* NEW QUESTION */}
                        <div className="p-4 bg-emerald-500/[0.03]">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">New Unique Question (Added)</span>
                          </div>
                          <p className="text-[11px] text-gray-200 leading-relaxed font-medium mb-3">{rec.newQuestion}</p>
                          <div className="space-y-1.5 mb-3">
                            {rec.newOptions.map((opt, oi) => (
                              <div key={oi} className={`flex items-start gap-2 text-[10px] px-2 py-1 rounded-lg ${
                                opt === rec.newAnswer
                                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                                  : 'text-gray-500'
                              }`}>
                                <span className="shrink-0 font-black">{String.fromCharCode(65 + oi)}.</span>
                                <span>{opt}{opt === rec.newAnswer && <span className="ml-1 text-[8px] font-black text-emerald-400">✓ answer</span>}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                /* No replacements — show the logs instead */
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Processing Log</p>
                  {(bulkRegenDetailBank.logs || []).map((line, li) => {
                    const isNew = line.includes('↑') || line.includes('New question');
                    const isError = line.includes('❌');
                    const isWarn = line.includes('⚠');
                    const isSimilar = line.includes('~') || line.toLowerCase().includes('similar') || line.toLowerCase().includes('cluster');
                    const isOk = line.includes('✓') || line.includes('VERIFIED');
                    return (
                      <div key={li} className={`flex items-start gap-2 text-[9px] font-mono leading-relaxed ${
                        isNew ? 'text-emerald-300' : isError ? 'text-rose-400' : isWarn ? 'text-amber-400' :
                        isSimilar ? 'text-orange-300' : isOk ? 'text-emerald-400' : 'text-gray-500'
                      }`}>
                        <span className="shrink-0 w-3">{isNew?'↑':isError?'✗':isWarn?'!':isSimilar?'~':isOk?'✓':'·'}</span>
                        <span className="break-all">{line}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-white/5 bg-black/20 shrink-0 flex items-center justify-between">
              <p className="text-[9px] text-gray-600">
                {bulkRegenDetailBank.replacements?.length > 0
                  ? `${bulkRegenDetailBank.replacements?.length ?? 0} replacement${(bulkRegenDetailBank.replacements?.length ?? 0) !== 1 ? 's' : ''} · all questions are now unique`
                  : 'No replacements made for this bank'}
              </p>
              <button
                onClick={() => setBulkRegenDetailBank(null)}
                className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/10 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Regen Error Toast */}
      {bulkRegenError && (
        <div className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-5 py-4 bg-rose-900/90 border border-rose-500/40 rounded-2xl shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-sm">
          <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
          <p className="text-rose-200 text-xs font-bold">{bulkRegenError}</p>
          <button onClick={() => setBulkRegenError('')} className="ml-auto text-rose-400 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bulk Smart Regeneration Progress Modal */}
      {showBulkRegenModal && bulkRegenJob && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/70" onClick={() => {
            // Only allow closing if job is done
            if (['completed', 'failed', 'cancelled'].includes(bulkRegenJob.status)) {
              setShowBulkRegenModal(false);
            }
          }} />

          <div
            className="relative w-full max-w-2xl bg-[#0D1117] rounded-[24px] border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
            style={{ transform: `translate(${bulkRegenModalPos.x}px, ${bulkRegenModalPos.y}px)` }}
          >
            {/* Header */}
            <div
              className="px-6 py-5 bg-gradient-to-r from-orange-900/30 via-amber-900/20 to-[#0D1117] border-b border-white/5 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={handleBulkRegenMouseDown}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <Zap className="h-5 w-5 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Bulk Smart Regeneration</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                      {bulkRegenJob.department}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {['pending', 'running'].includes(bulkRegenJob.status) && (
                    <button
                      onClick={handleCancelBulkRegen}
                      disabled={bulkRegenCancelling}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/40 text-rose-400 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-wait"
                    >
                      {bulkRegenCancelling
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <XCircle className="h-3 w-3" />}
                      {bulkRegenCancelling ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}
                  {['completed', 'failed', 'cancelled'].includes(bulkRegenJob.status) && (
                    <button
                      onClick={() => setShowBulkRegenModal(false)}
                      className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all"
                    >
                      <X className="h-4 w-4 text-white/70 hover:text-white" />
                    </button>
                  )}
                </div>
              </div>

              {/* Overall Progress Bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    {bulkRegenJob.progress.banksProcessed} / {bulkRegenJob.progress.banksTotal} banks
                  </span>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    bulkRegenJob.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                    bulkRegenJob.status === 'failed' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                    bulkRegenJob.status === 'cancelled' ? 'bg-gray-500/10 border-gray-500/20 text-gray-400' :
                    bulkRegenJob.status === 'running' ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
                    'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                  }`}>
                    {bulkRegenJob.status === 'running' ? 'Processing...' : bulkRegenJob.status}
                  </span>
                </div>
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      bulkRegenJob.status === 'completed' ? 'bg-emerald-500' :
                      bulkRegenJob.status === 'cancelled' ? 'bg-gray-500' :
                      bulkRegenJob.status === 'failed' ? 'bg-rose-500' :
                      'bg-gradient-to-r from-orange-500 to-amber-400'
                    }`}
                    style={{
                      width: bulkRegenJob.progress.banksTotal > 0
                        ? `${Math.round((bulkRegenJob.progress.banksProcessed / bulkRegenJob.progress.banksTotal) * 100)}%`
                        : '0%'
                    }}
                  />
                </div>
              </div>

              {/* Summary Pills */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg" title="Similar questions detected and replaced with fresh AI-generated questions">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  <span className="text-[10px] font-black text-emerald-400">{bulkRegenJob.progress.totalQuestionsReplaced} similar replaced</span>
                </div>
                {bulkRegenJob.progress.totalQuestionsFailed > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 rounded-lg" title="Questions where AI generation failed — originals kept unchanged">
                    <AlertTriangle className="h-3 w-3 text-rose-400" />
                    <span className="text-[10px] font-black text-rose-400">{bulkRegenJob.progress.totalQuestionsFailed} generation failed</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg" title="Banks fully processed (including clean banks with no similar questions)">
                  <span className="text-[10px] font-bold text-gray-400">{bulkRegenJob.progress.banksSucceeded} banks processed</span>
                </div>
              </div>
            </div>

            {/* Per-Bank List */}
            <div className="overflow-y-auto max-h-[55vh] px-6 py-4 space-y-2">
              {bulkRegenJob.bankResults.map((bank, idx) => {
                const hasLogs = bank.logs && bank.logs.length > 0;
                const isExpanded = expandedBulkLogBanks.has(bank.bankId);
                const isDone = bank.status === 'completed' || bank.status === 'failed';

                return (
                  <div
                    key={bank.bankId}
                    className={`rounded-xl overflow-hidden border transition-all ${
                      bank.status === 'running' ? 'border-orange-500/20' :
                      bank.status === 'completed' ? 'border-emerald-500/20' :
                      bank.status === 'failed' ? 'border-rose-500/20' : 'border-white/5'
                    } ${isDone ? 'cursor-pointer hover:border-white/20 hover:bg-white/[0.02]' : ''}`}
                    onClick={() => { if (isDone) setBulkRegenDetailBank(bank as any); }}
                  >
                    <div className={`flex items-center gap-3 p-3 transition-all ${
                      bank.status === 'running' ? 'bg-orange-500/5' :
                      bank.status === 'completed' ? 'bg-emerald-500/5' :
                      bank.status === 'failed' ? 'bg-rose-500/5' :
                      bank.status === 'skipped' ? 'opacity-50' : ''
                    }`}>
                      {/* Status Icon */}
                      <div className="shrink-0">
                        {bank.status === 'running' && <RefreshCw className="h-4 w-4 text-orange-400 animate-spin" />}
                        {bank.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                        {bank.status === 'failed' && <XCircle className="h-4 w-4 text-rose-400" />}
                        {bank.status === 'skipped' && <AlertCircle className="h-4 w-4 text-gray-500" />}
                        {bank.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-white/20 border-dashed" />}
                      </div>

                      {/* Bank Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-white uppercase tracking-wider">{bank.sopIdentifier}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                            bank.language === 'Gujarati'
                              ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                              : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                          }`}>{bank.language === 'Gujarati' ? 'GU' : 'EN'}</span>
                        </div>
                        <p className="text-[9px] text-gray-500 truncate mt-0.5">{bank.sopName}</p>
                        {bank.error && <p className="text-[9px] text-rose-400 mt-0.5 truncate">{bank.error}</p>}
                      </div>

                      {/* Stats + click hint */}
                      <div className="shrink-0 flex items-center gap-2">
                        {bank.status === 'completed' && (
                          <>
                            {bank.questionsReplaced > 0 ? (
                              <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                                {bank.questionsReplaced} replaced
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-gray-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">clean</span>
                            )}
                            {bank.questionsFailed > 0 && (
                              <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
                                {bank.questionsFailed} failed
                              </span>
                            )}
                          </>
                        )}
                        {bank.status === 'pending' && <span className="text-[9px] text-gray-600 font-bold">queued</span>}
                        {bank.status === 'running' && <span className="text-[9px] text-orange-300 font-bold animate-pulse">Processing</span>}
                        {isDone && <ChevronRight className="h-3.5 w-3.5 text-gray-600 shrink-0" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            {['completed', 'failed', 'cancelled'].includes(bulkRegenJob.status) && (
              <div className="px-6 py-4 border-t border-white/5 bg-black/20">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[10px] text-gray-500 flex-1">
                    {bulkRegenJob.status === 'completed'
                      ? `Done! Auto-detected and replaced ${bulkRegenJob.progress.totalQuestionsReplaced} similar questions across ${bulkRegenJob.progress.banksSucceeded} banks.`
                      : bulkRegenJob.status === 'cancelled'
                      ? `Cancelled after processing ${bulkRegenJob.progress.banksProcessed} banks. Progress has been saved.`
                      : `Completed with errors. ${bulkRegenJob.progress.banksSucceeded} banks resolved, ${bulkRegenJob.progress.banksFailed} failed.`}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setShowBulkRegenModal(false);
                        handleStartBulkRegen(bulkRegenJob.department);
                        setShowBulkRegenModal(true);
                      }}
                      disabled={bulkRegenLoading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 rounded-lg text-[9px] font-black uppercase tracking-widest border border-orange-500/20 hover:border-orange-500/40 transition-all disabled:opacity-50 disabled:cursor-wait"
                    >
                      {bulkRegenLoading
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <RefreshCw className="h-3 w-3" />}
                      Rerun
                    </button>
                    <button
                      onClick={() => setShowBulkRegenModal(false)}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/10 transition-all"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
