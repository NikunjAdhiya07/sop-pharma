"use client";

import {
  useState,
  useEffect,
  Suspense,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Filter,
  Download,
  Eye,
  BookOpen,
  Award,
  Loader2,
  Plus,
  Trash2,
  Archive,
  FolderOpen,
  Upload,
  Home,
  ArrowLeft,
  Grid,
  ArrowUpDown,
  SortAsc,
  SortDesc,
  CheckCircle2,
  Star,
  FileText,
  RefreshCw,
  Copy,
  AlertCircle,
  X,
  ChevronsUpDown,
  MoreHorizontal,
  MessageSquare,
  Maximize2,
  Minimize2,
  Users,
  UserPlus,
  Files,
  TrendingUp,
  Clock,
  Edit2,
  Save,
  RotateCcw,
  Lock,
  LockOpen,
  EyeOff,
  Sparkles,
  ScanSearch,
} from "lucide-react";
import Link from "next/link";
import MCQTreeView from "@/components/MCQTreeView";
import TrainerUploadModal from "@/components/TrainerUploadModal";
import TrainingMatrixUploadModal from "@/components/TrainingMatrixUploadModal";
import { useCopyProtection, CopyProtected } from "@/lib/copyProtection";
import { formatSOPDisplayName, cleanSOPName } from "@/lib/sopLibraryHelper";
import { normalizeDepartmentName } from "@/lib/mcqTreeBuilder";
import { DeptGridSkeleton, MCQListSkeleton } from "@/components/MCQSkeleton";
import { cacheBankToIDB, getBankFromIDB, cacheTreeToIDB, getTreeFromIDB } from "@/lib/mcqIDB";
import { saveSession, loadSession, createDebouncedSave } from "@/lib/mcqBankSession";
import { prefetchAdjacentSOPs, backgroundRefreshTree } from "@/lib/mcqPrefetch";

interface MCQ {
  aiIcon: string;
  question: string;
  difficulty: "Easy" | "Medium" | "Hard";
  difficultyStars: "⭐" | "⭐⭐" | "⭐⭐⭐";
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
  isChecked?: boolean;
  isReviewed?: boolean;
  isSimilar?: boolean;
  optionVariants: Array<{
    text: string;
    isCorrect: boolean;
  }>;
}

interface MCQBank {
  _id: string;
  sopId: string;
  sopName: string;
  sopIdentifier: string;
  department?: string;
  mcqs: MCQ[];
  totalQuestions?: number;
  difficultyDistribution?: {
    easy: number;
    medium: number;
    hard: number;
  };
  createdAt: string;
  language?: "English" | "Gujarati";
  checkedCount?: number;
  reviewedCount?: number;
  similarCount?: number;
}

// ─── Client-side similarity scoring (mirrors detect route logic) ─────────────
const STOP_WORDS_CLIENT = new Set([
  'a','an','the','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'to','of','in','on','at','by','for','with','about','as','into','through',
  'before','after','above','below','from','up','down','out','off','over','under',
  'again','then','once','and','but','or','nor','so','yet','both','either','not',
  'no','than','too','very','just','this','that','these','those','it','its',
]);

function clientGetContentWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim()
    .split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS_CLIENT.has(w));
}

function clientJaccard(s1: string, s2: string): number {
  const w1 = new Set(clientGetContentWords(s1));
  const w2 = new Set(clientGetContentWords(s2));
  if (w1.size === 0 && w2.size === 0) return 100;
  if (w1.size === 0 || w2.size === 0) return 0;
  const inter = [...w1].filter(w => w2.has(w)).length;
  return Math.round((inter / new Set([...w1,...w2]).size) * 100);
}

function clientNgram(s1: string, s2: string): number {
  const words1 = clientGetContentWords(s1);
  const words2 = clientGetContentWords(s2);
  const ngrams = (ws: string[]) => {
    const r = new Set<string>();
    for (let i = 0; i < ws.length - 1; i++) r.add(`${ws[i]} ${ws[i+1]}`);
    for (let i = 0; i < ws.length - 2; i++) r.add(`${ws[i]} ${ws[i+1]} ${ws[i+2]}`);
    return r;
  };
  const g1 = ngrams(words1); const g2 = ngrams(words2);
  if (g1.size === 0 || g2.size === 0) return 0;
  const inter = [...g1].filter(g => g2.has(g)).length;
  return Math.round((inter / new Set([...g1,...g2]).size) * 100);
}

function clientCharSim(s1: string, s2: string): number {
  const a = s1.toLowerCase().trim(); const b = s2.toLowerCase().trim();
  if (a === b) return 100;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 100;
  // Simple ratio using shared prefix/suffix as approximation
  const m = longer.length, n = shorter.length;
  const dp: number[][] = Array.from({length: m+1}, (_,i) =>
    Array.from({length: n+1}, (_,j) => i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = longer[i-1]===shorter[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j-1],dp[i-1][j],dp[i][j-1]);
  return Math.round(((longer.length - dp[m][n]) / longer.length) * 100);
}

/** Returns composite similarity (0–100) between two questions.
 *  ≥ 70 = similar enough to reject a regenerated replacement. */
function clientQuestionSimilarity(
  q1: { question: string; options?: string[]; correctAnswer?: string },
  q2: { question: string; options?: string[]; correctAnswer?: string },
): number {
  const qJaccard = clientJaccard(q1.question, q2.question);
  const qNgram   = clientNgram(q1.question, q2.question);
  const qChar    = clientCharSim(q1.question, q2.question);
  const aChar    = clientCharSim(q1.correctAnswer||'', q2.correctAnswer||'');
  const aJacc    = clientJaccard(q1.correctAnswer||'', q2.correctAnswer||'');
  const answerScore = Math.round(aChar*0.7 + aJacc*0.3);
  const optScore = clientJaccard((q1.options||[]).join(' '), (q2.options||[]).join(' '));
  return Math.round(qJaccard*0.30 + qNgram*0.20 + qChar*0.10 + answerScore*0.25 + optScore*0.15);
}
// ─────────────────────────────────────────────────────────────────────────────

function MCQBankContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sopIdFromUrl = searchParams.get("sopId");
  const langFromUrl = searchParams.get("lang");
  const deptFromUrl = searchParams.get("dept");
  const searchFromUrl = searchParams.get("search");

  // ── Performance caches (survive re-renders, cleared on full page reload) ──
  // Bank detail cache: avoid re-fetching the same bank within a session
  const bankDetailCache = useRef<Map<string, MCQBank>>(new Map());
  // Similarity detail cache per bankId
  const similarityCache = useRef<Map<string, Record<number, number[]>>>(new Map());
  // Trainer mappings fetched flag — avoid repeated API calls
  const trainerMappingsFetched = useRef(false);
  // Debounced session saver — writes position state to localStorage max once per 500ms
  const debouncedSaveSession = useRef(createDebouncedSave(500));

  const [mcqBanks, setMcqBanks] = useState<MCQBank[]>([]);
  const [loading, setLoading] = useState(false);
  // Raw search input (updated immediately for UI responsiveness)
  const [searchInputValue, setSearchInputValue] = useState("");
  // Debounced search term (used for actual filtering — 300ms delay)
  const [searchTerm, setSearchTerm] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("All");
  const [selectedMCQBank, setSelectedMCQBank] = useState<MCQBank | null>(null);
  /** All banks for current SOP (English + Gujarati); used to show sections when multiple languages */
  const [selectedMCQBanks, setSelectedMCQBanks] = useState<MCQBank[] | null>(null);
  /** Controls which language's questions are displayed (EN or GU) */
  const [viewLanguage, setViewLanguage] = useState<'English' | 'Gujarati'>('English');
  const [selectedMCQ, setSelectedMCQ] = useState<{
    mcq: MCQ;
    index: number;
  } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null); // e.g. "bankId-index"
  const [actionFeedback, setActionFeedback] = useState<{ id: string, message: string, type: 'success' | 'error' } | null>(null);

  // Inline edit state for Question Analytics modal
  const [editMode, setEditMode] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editDraft, setEditDraft] = useState<{
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalBanks, setTotalBanks] = useState(0);

  // Recycled Questions State
  const [activeTab, setActiveTab] = useState<"active" | "recycled">("active");
  const [recycledQuestions, setRecycledQuestions] = useState<any[]>([]);
  const [loadingRecycled, setLoadingRecycled] = useState(false);

  // Obsolete SOP details (top-bar)
  const [showObsoleteDetails, setShowObsoleteDetails] = useState(false);
  const [obsoleteDetailsLoading, setObsoleteDetailsLoading] = useState(false);
  const [obsoleteDetails, setObsoleteDetails] = useState<any[]>([]);
  const [obsoleteRestoreBusy, setObsoleteRestoreBusy] = useState<string | null>(
    null,
  );

  // Similarity Check State
  const [checkingSimilarity, setCheckingSimilarity] = useState(false);
  const [fixingAnswers, setFixingAnswers] = useState(false);
  const [smartRegenProgress, setSmartRegenProgress] = useState<{
    phase: 'detecting' | 'regenerating' | 'complete';
    totalFound: number;
    totalReplaced: number;
    totalFailed: number;
    currentQuestion: number;
    details: Array<{
      questionIndex: number;
      oldQuestion: string;
      newQuestion: string;
      status: 'replaced' | 'failed' | 'skipped';
    }>;
  } | null>(null);
  const [regenLanguage, setRegenLanguage] = useState<'English' | 'Gujarati'>('English');
  const [similarityResults, setSimilarityResults] = useState<{
    count: number;
    groups: Array<{
      primary: number;
      similar: number[];
    }>;
    summary: string;
  } | null>(null);

  // Refresh persistence state
  const [isOpeningFromUrl, setIsOpeningFromUrl] = useState(!!sopIdFromUrl);
  // Track if page was originally opened via external link (sopId in URL on mount)
  // Used to decide whether closing the modal should go back or stay on this page
  const wasOpenedFromExternalLink = useRef(!!sopIdFromUrl);

  // Store similar question details for inline display
  const [similarQuestionDetails, setSimilarQuestionDetails] = useState<
    Record<number, number[]>
  >({});

  // Expansion State (Lifted from MCQTreeView for persistence)
  const loadExpansionState = useCallback((key: string): Set<string> => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const saved = localStorage.getItem(key);
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  }, []);

  const saveExpansionState = useCallback((key: string, state: Set<string>) => {
    if (typeof window === "undefined") return;
    try {
      const arr = Array.from(state);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(() =>
    loadExpansionState("mcq-tree-expanded-depts"),
  );
  const [refreshDeptStatsKey] = useState(0);
  const [expandedSubcats, setExpandedSubcats] = useState<Set<string>>(() =>
    loadExpansionState("mcq-tree-expanded-subcats"),
  );
  const [expandedSOPs, setExpandedSOPs] = useState<Set<string>>(() =>
    loadExpansionState("mcq-tree-expanded-sops"),
  );

  // Lifted fullScreenDept — survives re-renders caused by loading/state changes.
  // Seeded synchronously from localStorage tree + session so the dept opens on
  // the first frame without waiting for IDB or network.
  const [fullScreenDept, setFullScreenDept] = useState<any>(() => {
    if (typeof window === 'undefined') return null;
    try {
      // Need both the tree cache and the saved dept name to pre-seed
      const storedUser = localStorage.getItem('user');
      const username = storedUser ? JSON.parse(storedUser)?.username || '' : '';
      const CACHE_KEY = `mcq-tree-cache-v4-${username || 'guest'}`;
      const CACHE_TS_KEY = `mcq-tree-cache-timestamp-v4-${username || 'guest'}`;
      const raw = localStorage.getItem(CACHE_KEY);
      const ts  = localStorage.getItem(CACHE_TS_KEY);
      if (!raw || !ts || Date.now() - parseInt(ts) >= 30 * 60 * 1000) return null;

      const tree = JSON.parse(raw);
      // URL param takes priority over saved session
      const params = new URLSearchParams(window.location.search);
      const deptName = params.get('dept') || loadSession()?.deptName;
      if (!deptName || !tree?.tree) return null;

      return tree.tree.find((d: any) => d.name === deptName) ?? null;
    } catch { return null; }
  });

  // Separate loading state for bank-detail fetches so we don't unmount the tree
  const [loadingBankDetail, setLoadingBankDetail] = useState(false);

  // Track whether component has fully mounted (skip clearing session on first render)
  const hasMountedRef = useRef(false);
  useEffect(() => { hasMountedRef.current = true; }, []);

  // Prefetch dashboard route in background so Home navigation is instant
  useEffect(() => { router.prefetch('/dashboard'); }, [router]);

  // Persist active department to session so refresh restores it even if URL loses ?dept=
  useEffect(() => {
    if (fullScreenDept?.name) {
      saveSession({ deptName: fullScreenDept.name });
    } else if (fullScreenDept === null && hasMountedRef.current) {
      // User explicitly closed the dept — clear saved dept so refresh lands on tree root
      saveSession({ deptName: undefined });
    }
  }, [fullScreenDept]);

  // Save expansion state whenever it changes
  useEffect(() => {
    saveExpansionState("mcq-tree-expanded-depts", expandedDepts);
  }, [expandedDepts, saveExpansionState]);

  useEffect(() => {
    saveExpansionState("mcq-tree-expanded-subcats", expandedSubcats);
  }, [expandedSubcats, saveExpansionState]);

  useEffect(() => {
    saveExpansionState("mcq-tree-expanded-sops", expandedSOPs);
  }, [expandedSOPs, saveExpansionState]);
  const viewMode = "tree";

  // ── Instant tree seed from localStorage (synchronous, runs before first paint) ──
  // If there's a valid cache in localStorage we use it immediately so the tree
  // renders on the first frame and the spinner is never shown on refresh.
  const [treeData, setTreeData] = useState<any>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const storedUser = localStorage.getItem('user');
      const username = storedUser ? JSON.parse(storedUser)?.username || '' : '';
      const CACHE_KEY = `mcq-tree-cache-v4-${username || 'guest'}`;
      const CACHE_TS_KEY = `mcq-tree-cache-timestamp-v4-${username || 'guest'}`;
      const raw = localStorage.getItem(CACHE_KEY);
      const ts  = localStorage.getItem(CACHE_TS_KEY);
      if (raw && ts && Date.now() - parseInt(ts) < 30 * 60 * 1000) {
        return JSON.parse(raw);
      }
    } catch { /* non-fatal */ }
    return null;
  });

  // Always start as true on both server and client — useEffect will clear it
  // after seeding from localStorage. A lazy initializer that reads localStorage
  // causes a server(true) vs client(false) mismatch → hydration error.
  const [loadingTree, setLoadingTree] = useState(true);

  // Sort state
  const [sortBy, setSortBy] = useState<
    "name" | "questions" | "date" | "identifier"
  >("identifier");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filterReviewStatus, setFilterReviewStatus] = useState<
    "all" | "checked" | "pending" | "similar" | "reviewed"
  >("all");
  // Lazy rendering: show 30 at a time, more loaded on scroll
  const [visibleCount, setVisibleCount] = useState(30);
  const modalBodyRef = useRef<HTMLDivElement>(null);
  // Modal-level search (search within a SOP's questions)
  const [modalSearch, setModalSearch] = useState("");
  // Raw input value for modal search (debounced into modalSearch)
  const [modalSearchInput, setModalSearchInput] = useState("");
  const [modalSearchInputVisible, setModalSearchInputVisible] = useState(false);

  // Trainer Assignment State
  const [trainerMappings, setTrainerMappings] = useState<
    Record<string, string>
  >({});
  const [showTrainerModal, setShowTrainerModal] = useState(false);
  const [showMatrixModal, setShowMatrixModal] = useState(false);

  // Debounce: update the actual filter term 300ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInputValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInputValue]);

  // Debounce modal search (within a SOP's questions) — 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setModalSearch(modalSearchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [modalSearchInput]);

  const fetchTrainerMappings = async () => {
    // Guard: only fetch once per page load
    if (trainerMappingsFetched.current) return;
    trainerMappingsFetched.current = true;
    try {
      const response = await fetch("/api/departments/trainers");
      const data = await response.json();
      if (data.success) {
        const mapping: Record<string, string> = {};

        // 1. First add department-level trainers
        if (data.trainers) {
          data.trainers.forEach((t: any) => {
            const normalizedDept = normalizeDepartmentName(
              t.departmentName,
            ).toLowerCase();
            mapping[normalizedDept] = t.trainerName;
          });
        }

        // 2. Add SOP-specific trainers (overwrites department if same key, but identifiers are unique)
        if (data.sopTrainers) {
          Object.entries(data.sopTrainers).forEach(([sopCode, trainerName]) => {
            mapping[sopCode.toUpperCase()] = trainerName as string;
          });
        }

        setTrainerMappings(mapping);
      }
    } catch (error) {
      console.error("Error fetching trainers:", error);
    }
  };

  useEffect(() => {
    fetchTrainerMappings();
  }, []);

  // Sync state with URL for deep linking/back navigation
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    let changed = false;

    if (selectedMCQBank) {
      if (params.get("sopId") !== selectedMCQBank.sopId) {
        params.set("sopId", selectedMCQBank.sopId);
        changed = true;
      }
    } else if (params.has("sopId")) {
      params.delete("sopId");
      changed = true;
    }

    if (fullScreenDept) {
      if (params.get("dept") !== fullScreenDept.name) {
        params.set("dept", fullScreenDept.name);
        changed = true;
      }
    } else if (params.has("dept")) {
      params.delete("dept");
      changed = true;
    }

    if (changed) {
      const newQuery = params.toString();
      const newUrl = `${window.location.pathname}${newQuery ? "?" + newQuery : ""}`;
      window.history.replaceState(
        { ...window.history.state, as: newUrl, url: newUrl },
        "",
        newUrl,
      );
    }
  }, [selectedMCQBank?.sopId, fullScreenDept?.name]);

  // Modal dragging and expansion state
  const [isMaximized, setIsMaximized] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Drag handlers for bank detail modal
  const handleMouseDown = (e: React.MouseEvent) => {
    // Prevent dragging if clicking a button or input
    if (
      (e.target as HTMLElement).closest("button") ||
      (e.target as HTMLElement).closest("input")
    )
      return;

    setIsDragging(true);
    setDragStart({
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y,
    });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        setModalPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

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
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Reset modal position when opening
  useEffect(() => {
    if (selectedMCQBank) {
      setModalPosition({ x: 0, y: 0 });
    }
  }, [selectedMCQBank]);

  // Dev-mode bypass for copy/inspect protection (password protected)
  const [devModeUnlocked, setDevModeUnlocked] = useState(false);
  const [showDevModal, setShowDevModal] = useState(false);
  const [devPassword, setDevPassword] = useState("");
  const [devPasswordError, setDevPasswordError] = useState("");
  const [showDevPassword, setShowDevPassword] = useState(false);

  const handleDevUnlock = () => {
    if (devPassword === "1234567") {
      setDevModeUnlocked(true);
      setShowDevModal(false);
      setDevPassword("");
      setDevPasswordError("");
    } else {
      setDevPasswordError("Incorrect password.");
    }
  };

  const handleDevLock = () => {
    setDevModeUnlocked(false);
    setDevPassword("");
    setDevPasswordError("");
  };

  // Apply copy protection to prevent copying/downloading questions
  useCopyProtection(!devModeUnlocked);

  useEffect(() => {
    // When restoring a specific bank from URL (refresh), skip the full bank list
    // load — it takes 2+ minutes for 430 banks. The bank-from-URL effect below
    // will open the correct modal directly. Fetch the list silently in the
    // background so the grid/table view is ready if the user closes the modal.
    if (sopIdFromUrl) {
      setLoading(false); // Don't show the full-page spinner
      // Silently pre-load the bank list in background (won't block modal open)
      fetchMCQBanks();
      return;
    }
    fetchMCQBanks();
    if (viewMode === "tree") {
      fetchTreeData();
    }
  }, [currentPage, viewMode]);

  // Auto-open bank when sopId is in URL (refresh persistence)
  // This runs immediately — it does NOT wait for fetchMCQBanks to finish.
  useEffect(() => {
    if (sopIdFromUrl && !selectedMCQBank && isOpeningFromUrl) {
      const openBankFromUrl = async () => {
        try {
          // Fetch the specific bank(s) for this SOP directly by sopId.
          // We do NOT use summary=true here — we need the full mcqs array.
          const response = await fetch(
            `/api/mcq-bank?sopId=${encodeURIComponent(sopIdFromUrl)}&limit=10`,
            { cache: 'no-store' }
          );
          const data = await response.json();

          if (data.success && data.mcqBanks.length > 0) {
            // Pick the right language if specified in URL
            const banks: MCQBank[] = data.mcqBanks;
            let bank = banks[0];
            if (langFromUrl) {
              const langMatch = banks.find((b: MCQBank) => b.language === langFromUrl);
              if (langMatch) bank = langMatch;
            }

            // Store all returned banks in session cache for instant re-open
            banks.forEach(b => bankDetailCache.current.set(b._id, b));

            // Open directly: set state without the full fetchFullBankDetails round-trip
            const LANGUAGE_ORDER: Record<string, number> = { English: 0, Gujarati: 1 };
            const sorted = [...banks].sort((a, b) => {
              const la = LANGUAGE_ORDER[a.language || 'English'] ?? 2;
              const lb = LANGUAGE_ORDER[b.language || 'English'] ?? 2;
              return la - lb;
            });

            setSelectedMCQBanks(sorted);
            setSelectedMCQBank(bank);
            setRegenLanguage(bank.language || 'English');
            setViewLanguage(bank.language || 'English');
            setActiveTab('active');
            setSimilarityResults(null);
            setVisibleCount(30);

            // Load similarity details in background (non-blocking)
            fetchSimilarityDetails(bank._id);

            setIsOpeningFromUrl(false);
          } else {
            setIsOpeningFromUrl(false);
          }
        } catch (error) {
          console.error('[REFRESH] Error opening bank from URL:', error);
          setIsOpeningFromUrl(false);
        }
      };

      openBankFromUrl();
    }
  }, [sopIdFromUrl, langFromUrl, isOpeningFromUrl, selectedMCQBank]);

  const fetchTreeData = async (forceRefresh = false) => {
    try {
      // Only show full loading state if we don't have data yet
      if (!treeData) setLoadingTree(true);

      // Get current user from localStorage for department-based filtering
      const storedUser = localStorage.getItem("user");
      const currentUser = storedUser ? JSON.parse(storedUser) : null;
      const username = currentUser?.username || "";

      // ── Fast path: already seeded synchronously from localStorage on mount ─
      // Don't re-read caches — just kick off a quiet background refresh so the
      // next page load gets fresh data. Skip slow IDB + localStorage reads.
      if (!forceRefresh && treeData) {
        setLoadingTree(false);
        backgroundRefreshTree(username, (fresh: any) => {
          setTreeData(fresh);
          cacheTreeToIDB(username, fresh).catch(() => {});
          try {
            const CACHE_KEY = `mcq-tree-cache-v4-${username || 'guest'}`;
            const CACHE_TS_KEY = `mcq-tree-cache-timestamp-v4-${username || 'guest'}`;
            localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
            localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
          } catch { /* quota — non-fatal */ }
        }, 3000);
        return;
      }

      // ── Tier 1: IndexedDB (fastest, survives refresh, ~50ms) ─────────────
      if (!forceRefresh) {
        const idbCached = await getTreeFromIDB<any>(username);
        if (idbCached) {
          setTreeData(idbCached);
          console.log("⚡ Tree from IndexedDB — instant");
          setLoadingTree(false);
          // Tier 2 (background): silently refresh so next open is fresh
          backgroundRefreshTree(username, (fresh: any) => {
            setTreeData(fresh);
            cacheTreeToIDB(username, fresh).catch(() => {});
          }, 4000);
          return;
        }
      }

      // ── Tier 2: localStorage (fast, ~5ms parse) ───────────────────────────
      const CACHE_KEY = `mcq-tree-cache-v4-${username || "guest"}`;
      const CACHE_TIMESTAMP_KEY = `mcq-tree-cache-timestamp-v4-${username || "guest"}`;
      const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

      if (!forceRefresh) {
        const cachedData = localStorage.getItem(CACHE_KEY);
        const cacheTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);

        if (cachedData && cacheTimestamp) {
          const age = Date.now() - parseInt(cacheTimestamp);
          if (age < CACHE_DURATION) {
            const parsed = JSON.parse(cachedData);
            setTreeData(parsed);
            console.log("📦 Tree from localStorage (age:", Math.floor(age / 1000), "s)");
            setLoadingTree(false);
            // Promote to IDB for next time
            cacheTreeToIDB(username, parsed).catch(() => {});
            // Background refresh
            backgroundRefreshTree(username, (fresh: any) => {
              setTreeData(fresh);
              cacheTreeToIDB(username, fresh).catch(() => {});
            }, 4000);
            return;
          }
        }
      }

      // ── Tier 3: Network fetch ─────────────────────────────────────────────
      const treeUrl = username
        ? `/api/mcq-bank/tree?username=${encodeURIComponent(username)}`
        : "/api/mcq-bank/tree";
      const response = await fetch(treeUrl);
      const data = await response.json();

      if (data.success) {
        setTreeData(data);

        // Write to both caches
        cacheTreeToIDB(username, data).catch(() => {});
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
          localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
        } catch (e) {
          console.warn("⚠️ localStorage quota exceeded — using IDB only", e);
        }

        console.log("📊 Tree fetched from network and cached:", data.stats);
        if (data.userAccess?.isRestricted) {
          console.log("🔒 Restricted to:", data.userAccess.allowedDepartments);
        }
      }
    } catch (error) {
      console.error("Error fetching tree data:", error);
    } finally {
      setLoadingTree(false);
    }
  };

  // Auto-open department on refresh.
  // Runs whenever treeData arrives (IDB, localStorage, or network).
  // Priority: ?dept= URL param → saved session deptName → nothing.
  useEffect(() => {
    if (!treeData?.tree || fullScreenDept) return; // already open, nothing to do

    const targetDept = deptFromUrl || loadSession()?.deptName;
    if (!targetDept) return;

    const matchingDept = treeData.tree.find((d: any) => d.name === targetDept);
    if (matchingDept) {
      setFullScreenDept(matchingDept);
    }
  }, [deptFromUrl, treeData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle 'search' query parameter
  useEffect(() => {
    if (searchFromUrl) {
      setSearchInputValue(searchFromUrl);
      setSearchTerm(searchFromUrl);
    }
  }, [searchFromUrl]);

  const fetchMCQBanks = async () => {
    try {
      // Fetch MCQ banks with summary mode to avoid timeouts but allow client-side filtering
      const response = await fetch(
        `/api/mcq-bank?limit=1000&page=${currentPage}&summary=true`,
      );
      const data = await response.json();

      if (data.success) {
        setMcqBanks(data.mcqBanks);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages);
          setTotalBanks(data.pagination.total);
        }
      }
    } catch (error) {
      console.error("Error fetching MCQ banks:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchObsoleteDetails = useCallback(async () => {
    setObsoleteDetailsLoading(true);
    try {
      const res = await fetch("/api/mcq-bank/obsolete", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.success) {
        setObsoleteDetails(Array.isArray(j.obsoleteSOPs) ? j.obsoleteSOPs : []);
      } else {
        setObsoleteDetails([]);
      }
    } catch {
      setObsoleteDetails([]);
    } finally {
      setObsoleteDetailsLoading(false);
    }
  }, []);

  const openObsoleteDetails = useCallback(async () => {
    setShowObsoleteDetails(true);
    if (obsoleteDetails.length === 0 && !obsoleteDetailsLoading) {
      await fetchObsoleteDetails();
    }
  }, [fetchObsoleteDetails, obsoleteDetails.length, obsoleteDetailsLoading]);

  const restoreObsoleteSop = useCallback(
    async (sopIdentifier: string) => {
      if (obsoleteRestoreBusy) return;
      const password = window.prompt(
        `Enter password to restore "${sopIdentifier}" from Obsolete:`,
      );
      if (!password) return;
      setObsoleteRestoreBusy(sopIdentifier);
      try {
        const res = await fetch("/api/sop/remove-obsolete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sopIdentifier, password }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.success) {
          window.alert(j.error || "Failed to restore SOP");
          return;
        }
        await fetchObsoleteDetails();
        await fetchTreeData(true);
      } catch {
        window.alert("Network error — please try again");
      } finally {
        setObsoleteRestoreBusy(null);
      }
    },
    [fetchObsoleteDetails, fetchTreeData, obsoleteRestoreBusy],
  );

  /** Open SOP node with all its MCQ banks (English first, then Gujarati) */
  const openSOPNodeWithAllBanks = async (
    sopNode: { sopId: string; sopCode: string; sopName: string; mcqBanks: MCQBank[] },
    filter: "all" | "checked" | "pending" | "similar" | "reviewed" = "all",
  ) => {
    if (!sopNode.mcqBanks?.length) return;
    setFilterReviewStatus(filter);
    setModalSearch(""); setModalSearchInput("");
    setModalSearchInputVisible(false);
    setVisibleCount(30);
    setSimilarQuestionDetails({});
    setActiveTab("active");
    setSimilarityResults(null);

    if (sopNode.mcqBanks.length === 1) {
      await fetchFullBankDetails(sopNode.mcqBanks[0], filter);
      return;
    }

    // Status-dependent filters bypass cache (need fresh isSimilar/isChecked flags from DB)
    const needsFreshData = filter === 'similar' || filter === 'checked' || filter === 'reviewed';

    // Check session cache for all banks
    const allCached = !needsFreshData && sopNode.mcqBanks.every(b => bankDetailCache.current.has(b._id));
    if (allCached) {
      const cachedBanks = sopNode.mcqBanks.map(b => bankDetailCache.current.get(b._id)!);
      const LANGUAGE_ORDER: Record<string, number> = { English: 0, Gujarati: 1 };
      const sorted = [...cachedBanks].sort((a, b) => {
        const la = LANGUAGE_ORDER[a.language || "English"] ?? 2;
        const lb = LANGUAGE_ORDER[b.language || "English"] ?? 2;
        return la - lb;
      });
      const first = sorted[0];
      setSelectedMCQBanks(sorted);
      setSelectedMCQBank(first);
      setRegenLanguage(first.language || "English");
      setViewLanguage(first.language || "English");
      if (similarityCache.current.has(first._id)) {
        setSimilarQuestionDetails(similarityCache.current.get(first._id)!);
      } else {
        fetchSimilarityDetails(first._id);
      }
      return;
    }

    setLoadingBankDetail(true);
    try {
      const ids = sopNode.mcqBanks.map((b) => b._id).join(",");
      const response = await fetch(
        `/api/mcq-bank?ids=${ids}&t=${Date.now()}`,
        { cache: "no-store", headers: { Pragma: "no-cache", "Cache-Control": "no-cache" } },
      );
      const data = await response.json();
      if (!data.success || !data.mcqBanks?.length) {
        alert("Failed to load questions for this SOP");
        return;
      }
      const LANGUAGE_ORDER: Record<string, number> = { English: 0, Gujarati: 1 };
      const sorted = [...data.mcqBanks].sort((a: MCQBank, b: MCQBank) => {
        const la = LANGUAGE_ORDER[a.language || "English"] ?? 2;
        const lb = LANGUAGE_ORDER[b.language || "English"] ?? 2;
        return la - lb;
      });
      // Store each bank in session cache AND IndexedDB
      sorted.forEach(b => {
        bankDetailCache.current.set(b._id, b);
        cacheBankToIDB(b._id, b).catch(() => {});
      });
      const first = sorted[0];
      setSelectedMCQBanks(sorted);
      setSelectedMCQBank(first);
      setRegenLanguage(first.language || "English");
      setViewLanguage(first.language || "English");
      // Save position
      debouncedSaveSession.current({
        bankId: first._id,
        sopId: first.sopId,
        sopCode: first.sopIdentifier,
        sopName: first.sopName,
        language: first.language || 'English',
        filter,
      });
      // Clear similarity cache so fresh data is fetched (important for 'similar' filter)
      if (needsFreshData) similarityCache.current.delete(first._id);
      fetchSimilarityDetails(first._id); // non-blocking
    } catch (err) {
      console.error("Error loading SOP banks:", err);
      alert("Error loading questions");
    } finally {
      setLoadingBankDetail(false);
    }
  };

  const fetchFullBankDetails = async (
    bank: MCQBank,
    filter: "all" | "checked" | "pending" | "similar" | "reviewed" = "all",
  ) => {
    setFilterReviewStatus(filter);
    setModalSearch(""); setModalSearchInput("");
    setModalSearchInputVisible(false);
    setVisibleCount(30);
    setSimilarQuestionDetails({});

    const applyBankToState = (fullBank: MCQBank) => {
      setSelectedMCQBank(fullBank);
      setSelectedMCQBanks([fullBank]);
      setRegenLanguage(fullBank.language || 'English');
      setViewLanguage(fullBank.language || 'English');
      setActiveTab("active");
      setSimilarityResults(null);
      // Save position to session
      debouncedSaveSession.current({
        bankId: fullBank._id,
        sopId: fullBank.sopId,
        sopCode: fullBank.sopIdentifier,
        sopName: fullBank.sopName,
        language: fullBank.language || 'English',
        filter,
      });
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        params.set('sopId', fullBank.sopId);
        params.set('lang', fullBank.language || 'English');
        window.history.replaceState({ ...window.history.state }, '', `${window.location.pathname}?${params.toString()}`);
      }
    };

    try {
      const needsFreshData = filter === 'similar' || filter === 'checked' || filter === 'reviewed';

      // 1. Full data already passed in memory
      const hasFullData =
        bank.mcqs && bank.mcqs.length > 0 && bank.mcqs[0].question && bank.mcqs[0].options;

      if (hasFullData && !needsFreshData) {
        bankDetailCache.current.set(bank._id, bank);
        applyBankToState(bank);
        if (similarityCache.current.has(bank._id)) {
          setSimilarQuestionDetails(similarityCache.current.get(bank._id)!);
        } else {
          fetchSimilarityDetails(bank._id);
        }
        // Write to IDB for next refresh
        cacheBankToIDB(bank._id, bank).catch(() => {});
        return;
      }

      // 2. In-memory session cache
      const cached = bankDetailCache.current.get(bank._id);
      if (cached && !needsFreshData) {
        applyBankToState(cached);
        if (similarityCache.current.has(cached._id)) {
          setSimilarQuestionDetails(similarityCache.current.get(cached._id)!);
        } else {
          fetchSimilarityDetails(cached._id);
        }
        // Background refresh
        fetch(`/api/mcq-bank?id=${bank._id}&limit=1&t=${Date.now()}`, {
          cache: "no-store",
          headers: { Pragma: "no-cache", "Cache-Control": "no-cache" },
        }).then(r => r.json()).then(d => {
          if (d.success && d.mcqBanks.length > 0) {
            const fresh = d.mcqBanks[0];
            bankDetailCache.current.set(bank._id, fresh);
            cacheBankToIDB(bank._id, fresh).catch(() => {});
            setSelectedMCQBank(fresh);
            setMcqBanks(prev => prev.map(b => b._id === bank._id ? fresh : b));
          }
        }).catch(() => {});
        return;
      }

      // 3. IndexedDB (persists across refresh)
      if (!needsFreshData) {
        const idbCached = await getBankFromIDB<MCQBank>(bank._id);
        if (idbCached) {
          console.log(`⚡ Bank ${bank._id} from IndexedDB`);
          bankDetailCache.current.set(bank._id, idbCached);
          applyBankToState(idbCached);
          if (similarityCache.current.has(idbCached._id)) {
            setSimilarQuestionDetails(similarityCache.current.get(idbCached._id)!);
          } else {
            fetchSimilarityDetails(idbCached._id);
          }
          // Background refresh
          fetch(`/api/mcq-bank?id=${bank._id}&limit=1&t=${Date.now()}`, {
            cache: "no-store",
            headers: { Pragma: "no-cache", "Cache-Control": "no-cache" },
          }).then(r => r.json()).then(d => {
            if (d.success && d.mcqBanks.length > 0) {
              const fresh = d.mcqBanks[0];
              bankDetailCache.current.set(bank._id, fresh);
              cacheBankToIDB(bank._id, fresh).catch(() => {});
              setSelectedMCQBank(fresh);
              setMcqBanks(prev => prev.map(b => b._id === bank._id ? fresh : b));
            }
          }).catch(() => {});
          return;
        }
      }

      // 4. Network fetch (first time or forced refresh)
      if (needsFreshData) {
        similarityCache.current.delete(bank._id);
      }

      setLoadingBankDetail(true);
      const response = await fetch(
        `/api/mcq-bank?id=${bank._id}&limit=1&t=${Date.now()}`,
        { cache: "no-store", headers: { Pragma: "no-cache", "Cache-Control": "no-cache" } },
      );
      const data = await response.json();

      if (data.success && data.mcqBanks.length > 0) {
        const fullBank = data.mcqBanks[0];
        bankDetailCache.current.set(bank._id, fullBank);
        // Write to IDB for future refresh restores
        cacheBankToIDB(bank._id, fullBank).catch(() => {});
        applyBankToState(fullBank);
        fetchSimilarityDetails(fullBank._id);
        setMcqBanks((prev) => prev.map((b) => (b._id === bank._id ? fullBank : b)));
      } else {
        alert("Failed to load questions for this bank");
      }
    } catch (error) {
      console.error("Error fetching full bank details:", error);
      alert("Error loading questions");
    } finally {
      setLoadingBankDetail(false);
    }
  };

  const fetchRecycledQuestions = async (sopId: string) => {
    try {
      setLoadingRecycled(true);
      // Add timestamp to prevent caching
      // Assuming sopId is valid ObjectId string
      const response = await fetch(
        `/api/mcq-bank/eliminated?sopId=${sopId}&limit=50&t=${Date.now()}`,
        {
          headers: { "Cache-Control": "no-cache" },
        },
      );
      const data = await response.json();

      if (data.success) {
        setRecycledQuestions(data.questions);
      }
    } catch (error) {
      console.error("Error fetching recycled questions:", error);
    } finally {
      setLoadingRecycled(false);
    }
  };

  const handleCheckSimilarityForSOP = async (bank: MCQBank) => {
    if (checkingSimilarity) return;

    setCheckingSimilarity(true);

    try {
      const response = await fetch("/api/similar-questions/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mcqBankId: bank._id,
          sopId: bank.sopId,
          threshold: 70,
          scanAllBanks: false,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const count = data.flaggedCount || 0;
        if (count === 0) {
          alert(`✅ No similar questions found!`);
        } else {
          alert(`⚠️ Found ${count} similar question(s) (≥70% similarity)`);
        }
      } else {
        alert(`Failed to check similarities: ${data.error}`);
      }
    } catch (error) {
      console.error("Error checking similarities:", error);
      alert("Failed to check similarities. Please try again.");
    } finally {
      setCheckingSimilarity(false);
    }
  };

  const handleSmartRegenerate = async (bank: MCQBank) => {
    if (checkingSimilarity) return;

    setCheckingSimilarity(true);
    setSmartRegenProgress({
      phase: 'detecting',
      totalFound: 0,
      totalReplaced: 0,
      totalFailed: 0,
      currentQuestion: 0,
      details: [],
    });

    let grandTotalReplaced = 0;
    let grandTotalFailed = 0;
    let passNumber = 0;
    const MAX_PASSES = 10; // Safety cap to prevent infinite loop if AI keeps generating similar questions

    try {
      while (passNumber < MAX_PASSES) {
        passNumber++;
        console.log(`🔍 Pass ${passNumber}: Detecting similar questions...`);

        // Reset to detecting phase for each pass
        setSmartRegenProgress(prev => prev ? {
          ...prev,
          phase: 'detecting',
        } : null);

        // PHASE 1: Detect similar questions
        const detectResponse = await fetch("/api/similar-questions/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mcqBankId: bank._id,
            sopId: bank.sopId,
            threshold: 70,
            scanAllBanks: false,
          }),
        });

        const detectData = await detectResponse.json();

        if (!detectData.success || !detectData.similarities) {
          alert("Failed to detect similar questions");
          setSmartRegenProgress(null);
          setCheckingSimilarity(false);
          return;
        }

        const similarQuestions = detectData.similarities;
        const totalSimilar = detectData.flaggedCount || 0;

        if (totalSimilar === 0) {
          // No more similar questions — we're done
          console.log(`✅ Pass ${passNumber}: Zero similar questions remaining. Process complete!`);
          break;
        }

        console.log(`✅ Pass ${passNumber}: Found ${totalSimilar} similar questions — regenerating...`);

        // Update progress
        setSmartRegenProgress(prev => prev ? {
          ...prev,
          phase: 'regenerating',
          totalFound: totalSimilar,
        } : null);

        // PHASE 2: Regenerate similar questions one by one
        let replaced = 0;
        let failed = 0;
        const details: Array<{
          questionIndex: number;
          oldQuestion: string;
          newQuestion: string;
          status: 'replaced' | 'failed' | 'skipped';
        }> = [];

        // Fetch the latest MCQs directly from API so we always have fresh data
        // (can't rely on React state which updates asynchronously)
        let allMcqs: MCQ[] = bank.mcqs || [];
        try {
          const freshBankResponse = await fetch(`/api/mcq-bank?id=${bank._id}&limit=1&t=${Date.now()}`, {
            cache: 'no-store',
            headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache' },
          });
          const freshBankData = await freshBankResponse.json();
          if (freshBankData.success && freshBankData.mcqBanks?.length > 0) {
            allMcqs = freshBankData.mcqBanks[0].mcqs || allMcqs;
          }
        } catch {
          // Fall back to whatever MCQs we have in memory
        }

        // Collect only the SIMILAR (duplicate) question indices — NOT the primary
        const indicesToRegenerate = new Set<number>();
        for (const similarity of similarQuestions) {
          similarity.similarQuestions.forEach((sq: any) => {
            indicesToRegenerate.add(sq.questionIndex);
          });
        }

        // Regenerate each one
        for (const simIdx of Array.from(indicesToRegenerate).sort((a, b) => a - b)) {
          setSmartRegenProgress(prev => prev ? {
            ...prev,
            currentQuestion: simIdx + 1,
          } : null);

          try {
            const oldQuestion = allMcqs[simIdx];
            if (!oldQuestion) continue;

            const MAX_REGEN_ATTEMPTS = 3;
            let accepted = false;

            for (let attempt = 1; attempt <= MAX_REGEN_ATTEMPTS; attempt++) {
              // Step A: dry-run — generate but don't save yet
              const dryRunResponse = await fetch("/api/mcq-bank/generate-replacement", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  mcqBankId: bank._id,
                  sopId: bank.sopId,
                  questionIndex: simIdx,
                  dryRun: true,
                }),
              });

              const dryRunData = await dryRunResponse.json();

              if (!dryRunData.success || !dryRunData.newQuestion) {
                failed++;
                details.push({
                  questionIndex: simIdx,
                  oldQuestion: oldQuestion.question?.substring(0, 80) || 'Old Q',
                  newQuestion: 'Failed',
                  status: 'failed',
                });
                break;
              }

              const candidate = dryRunData.newQuestion;

              // Step B: compare candidate against the ORIGINAL question in-memory
              const similarity = clientQuestionSimilarity(
                { question: oldQuestion.question, options: oldQuestion.options, correctAnswer: oldQuestion.correctAnswer },
                { question: candidate.question, options: candidate.options, correctAnswer: candidate.correctAnswer },
              );

              if (similarity >= 70 && attempt < MAX_REGEN_ATTEMPTS) {
                await new Promise(r => setTimeout(r, 300));
                continue;
              }

              // Step C: candidate is different enough — save the exact validated candidate
              const saveResponse = await fetch("/api/mcq-bank/generate-replacement", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  mcqBankId: bank._id,
                  sopId: bank.sopId,
                  questionIndex: simIdx,
                  dryRun: false,
                  acceptedQuestion: candidate,
                }),
              });

              const saveData = await saveResponse.json();
              if (saveData.success) {
                accepted = true;
                replaced++;
                details.push({
                  questionIndex: simIdx,
                  oldQuestion: oldQuestion.question?.substring(0, 80) || 'Old Q',
                  newQuestion: 'Regenerated',
                  status: 'replaced',
                });
              } else {
                failed++;
                details.push({
                  questionIndex: simIdx,
                  oldQuestion: oldQuestion.question?.substring(0, 80) || 'Old Q',
                  newQuestion: 'Failed',
                  status: 'failed',
                });
              }
              break;
            }

            setSmartRegenProgress(prev => prev ? {
              ...prev,
              totalReplaced: grandTotalReplaced + replaced,
              totalFailed: grandTotalFailed + failed,
              details,
            } : null);

            await new Promise(r => setTimeout(r, 300));

          } catch (error) {
            console.error(`Error regenerating Q${simIdx + 1}:`, error);
            failed++;
          }
        }

        grandTotalReplaced += replaced;
        grandTotalFailed += failed;

        // If this pass replaced nothing (all failed), stop to avoid infinite loop
        if (replaced === 0) {
          console.warn(`⚠️ Pass ${passNumber}: No questions were successfully replaced. Stopping to avoid infinite loop.`);
          break;
        }

        // Invalidate caches before the next detection pass
        bankDetailCache.current.delete(bank._id);
        similarityCache.current.delete(bank._id);

        // Brief pause before next pass
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // FINAL: Mark complete and refresh UI
      console.log('🎉 Smart Regeneration complete!');

      setSmartRegenProgress(prev => prev ? {
        ...prev,
        phase: 'complete',
      } : null);

      // Invalidate caches and do a final verification
      bankDetailCache.current.delete(bank._id);
      similarityCache.current.delete(bank._id);

      await new Promise(resolve => setTimeout(resolve, 500));
      const verifyResponse = await fetch("/api/similar-questions/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mcqBankId: bank._id,
          sopId: bank.sopId,
          threshold: 70,
          scanAllBanks: false,
        }),
      });

      const verifyData = await verifyResponse.json();
      const remaining = verifyData.flaggedCount || 0;

      // Refresh the bank from DB
      if (selectedMCQBank) {
        await fetchFullBankDetails(bank, 'all');
      }

      // Clear similarity UI state and reload fresh
      setSimilarityResults(null);
      setSimilarQuestionDetails({});
      await fetchSimilarityDetails(bank._id);

      alert(
        (`✅ Smart Regeneration Complete!\n\n` +
        `Total Passes Run: ${passNumber}\n` +
        `Total Questions Regenerated: ${grandTotalReplaced}\n` +
        `Total Failed Regenerations: ${grandTotalFailed}\n` +
        `Remaining Similar Questions: ${remaining}\n\n`) +
        (remaining === 0
          ? "🎉 Excellent! All similar questions have been resolved!"
          : `⚠️ ${remaining} questions could not be resolved after ${passNumber} passes. They may need manual review.`)
      );

      setSmartRegenProgress(null);

    } catch (error) {
      console.error('Error in smart regenerate:', error);
      alert('An error occurred during smart regeneration. Please try again.');
      setSmartRegenProgress(null);
    } finally {
      setCheckingSimilarity(false);
    }
  };

  const handleAutoResolveSimilar = async (bank: MCQBank) => {
    if (checkingSimilarity) return;

    if (!confirm(
      `🤖 Auto-Resolve Similar Questions?\n\n` +
      `This will automatically detect and regenerate duplicate/similar questions in "${bank.sopIdentifier}".\n\n` +
      `The process will:\n` +
      `1. Find all similar question clusters\n` +
      `2. Keep the best question in each cluster\n` +
      `3. Regenerate replacements for duplicates\n` +
      `4. Update the bank with fresh questions\n\n` +
      `This runs in the background - you can continue working while it processes.\n\n` +
      `Continue?`
    )) return;

    setCheckingSimilarity(true);
    try {
      // Step 1: Detect similarities first (on the client, so we don't redo it inside the job)
      const detectResponse = await fetch('/api/similar-questions/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcqBankId: bank._id,
          sopId: bank.sopId,
          threshold: 70,
          scanAllBanks: false,
        }),
      });
      const detectData = await detectResponse.json();
      if (!detectData.success) {
        alert(`Failed to detect similarities: ${detectData.error}`);
        setCheckingSimilarity(false);
        return;
      }
      const similarities = detectData.similarities || [];
      if (similarities.length === 0) {
        alert('No similar questions found. Nothing to resolve.');
        setCheckingSimilarity(false);
        return;
      }

      // Step 2: Queue the job, passing pre-detected similarities so the job skips re-detection
      const response = await fetch(`/api/mcq-bank/auto-resolve-similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcqBankId: bank._id,
          similarities,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const jobId = data.jobId;

        // Show that job is queued
        alert(
          `✅ Auto-Resolve Job Queued!\n\n` +
          `Processing will run in the background.\n` +
          `You can close this dialog and continue working.\n\n` +
          `Job ID: ${jobId}\n` +
          `Status will update automatically.`
        );

        // Poll for job completion
        let isComplete = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 360; // 30 minutes with 5s intervals

        while (!isComplete && attempts < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
          attempts++;

          const statusResponse = await fetch(
            `/api/mcq-bank/auto-resolve-similar?jobId=${jobId}`
          );
          const statusData = await statusResponse.json();

          if (statusData.success) {
            const job = statusData.job;

            if (job.status === 'completed') {
              isComplete = true;
              const summary = job.summary;
              alert(
                `✅ Auto-Resolve Complete!\n\n` +
                `Similar Clusters Found: ${summary.found}\n` +
                `Eligible for Replacement: ${summary.eligible}\n` +
                `Questions Replaced: ${summary.replaced}\n` +
                `Questions Kept: ${summary.kept}\n` +
                `Failed Replacements: ${summary.failed}\n` +
                `Questions Eliminated: ${summary.eliminatedCount}\n\n` +
                `Your MCQ bank has been updated with fresh questions!`
              );

              // Invalidate stale caches before refresh
              bankDetailCache.current.delete(bank._id);
              similarityCache.current.delete(bank._id);

              // Refresh the bank from DB (fetches fresh data now caches are cleared)
              if (selectedMCQBank) {
                await fetchFullBankDetails(bank, 'all');
              }

              // Clear similarity results and reload fresh similarity details
              setSimilarityResults(null);
              setSimilarQuestionDetails({});
              await fetchSimilarityDetails(bank._id);
            } else if (job.status === 'failed') {
              isComplete = true;
              alert(`❌ Auto-Resolve Failed!\n\n${job.error}`);
            }
          }
        }

        if (!isComplete) {
          alert('Job processing timed out. Check back later for status.');
        }
      } else {
        alert(`Failed to queue auto-resolve: ${data.error}`);
      }
    } catch (error) {
      console.error('Error queuing auto-resolve:', error);
      alert('Failed to queue auto-resolve. Please try again.');
    } finally {
      setCheckingSimilarity(false);
    }
  };

  const fetchSimilarityDetails = async (bankId: string) => {
    try {
      // Return from cache immediately if available
      if (similarityCache.current.has(bankId)) {
        setSimilarQuestionDetails(similarityCache.current.get(bankId)!);
        return;
      }

      // Fetch only records for this specific bank using the mcqBankId filter
      const response = await fetch(`/api/similar-questions?mcqBankId=${encodeURIComponent(bankId)}`);
      const data = await response.json();

      if (data.success && data.similarQuestions) {
        const detailsMap: Record<number, number[]> = {};

        data.similarQuestions.forEach((record: any) => {
          // toString() handles both ObjectId objects and plain strings
          const primaryBankId = String(record.primaryQuestion?.mcqBankId ?? '');
          if (primaryBankId === bankId) {
            const primaryIndex = record.primaryQuestion.questionIndex;
            const similarIndices = record.similarQuestions
              .filter((sq: any) => String(sq.mcqBankId ?? '') === bankId)
              .map((sq: any) => sq.questionIndex);

            if (similarIndices.length > 0) {
              detailsMap[primaryIndex] = similarIndices;
            }
          }
        });

        // Store in session cache and update state
        similarityCache.current.set(bankId, detailsMap);
        setSimilarQuestionDetails(detailsMap);
      }
    } catch (error) {
      console.error("Error fetching similarity details:", error);
    }
  };

  const handleDeleteQuestion = async (bankId: string, index: number) => {
    try {
      setUpdatingStatus(`${bankId}-${index}`);

      // Get user info from localStorage
      const userInfo = localStorage.getItem("user");
      const headers: HeadersInit = {};
      if (userInfo) {
        headers["x-user-info"] = userInfo;
      }

      const response = await fetch(
        `/api/mcq-bank/delete-question?bankId=${bankId}&index=${index}`,
        {
          method: "DELETE",
          headers,
        },
      );

      const data = await response.json();

      if (data.success) {
        alert(`Question deleted successfully and moved to Recycled section.`);
        // Invalidate cache so next open fetches fresh data
        bankDetailCache.current.delete(bankId);
        similarityCache.current.delete(bankId);
        if (selectedMCQBank) {
          await fetchFullBankDetails(
            { ...selectedMCQBank, _id: bankId },
            filterReviewStatus,
          );
        }
      } else {
        alert(`Failed to delete question: ${data.error}`);
      }
    } catch (error) {
      console.error("Error deleting question:", error);
      alert("Failed to delete question. Please try again.");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleReplaceQuestion = async (
    bankId: string,
    index: number,
    sopId: string,
  ) => {
    if (
      !confirm(
        "Replace this question? The active question will be moved to the Recycled section.",
      )
    ) {
      return;
    }

    try {
      setUpdatingStatus(`${bankId}-${index}`);

      // 1. Delete the question (this archives it to EliminatedQuestions)
      // Get user info from localStorage
      const userInfo = localStorage.getItem("user");
      const headers: HeadersInit = {};
      if (userInfo) {
        headers["x-user-info"] = userInfo;
      }

      const deleteResponse = await fetch(
        `/api/mcq-bank/delete-question?bankId=${bankId}&index=${index}`,
        {
          method: "DELETE",
          headers,
        },
      );

      const deleteData = await deleteResponse.json();

      if (!deleteData.success) {
        alert(`Failed to delete question: ${deleteData.error}`);
        setUpdatingStatus(null);
        return;
      }

      // 2. Generate Replacement
      // Since we just deleted one, we want to insert a new one at the same index
      // Using existing endpoint for generation.
      // Note: generate-replacement endpoint expects mcqBankId, sopId, questionIndex
      const genResponse = await fetch("/api/mcq-bank/generate-replacement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mcqBankId: bankId,
          sopId: sopId,
          questionIndex: index,
        }),
      });

      const genData = await genResponse.json();

      if (genData.success) {
        alert("Question replaced successfully!");
        // Refresh the current bank details to show new question
        // We need to refetch the whole bank
        if (selectedMCQBank) {
          // Create a temp object to pass ID
          fetchFullBankDetails(
            { ...selectedMCQBank, _id: bankId },
            filterReviewStatus,
          );
        }
      } else {
        alert(
          "Question deleted but failed to generate replacement. Please try manually adding a question.",
        );
        if (selectedMCQBank) {
          fetchFullBankDetails(
            { ...selectedMCQBank, _id: bankId },
            filterReviewStatus,
          );
        }
      }
    } catch (error) {
      console.error("Error replacing question:", error);
      alert("Failed to replace question");
    } finally {
      setUpdatingStatus(null);
    }
  };

  // Memoized filter + sort — only recomputes when inputs actually change
  const filteredAndSortedMCQBanks = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();
    let filtered = mcqBanks || [];

    if (searchLower) {
      filtered = filtered.filter((bank) => {
        const nameMatch = (bank.sopName || "").toLowerCase().includes(searchLower);
        const identifierMatch = (bank.sopIdentifier || "").toLowerCase().includes(searchLower);
        const idMatch = (bank.sopId || "").toLowerCase().includes(searchLower);
        return nameMatch || identifierMatch || idMatch;
      });
    }

    if (difficultyFilter !== "All") {
      filtered = filtered.filter((bank) => {
        if (!bank.difficultyDistribution) return false;
        const diffLower = difficultyFilter.toLowerCase() as keyof typeof bank.difficultyDistribution;
        return (bank.difficultyDistribution[diffLower] || 0) > 0;
      });
    }

    const naturalCompare = (a: string, b: string) =>
      (a || "").localeCompare(b || "", undefined, { numeric: true, sensitivity: "base" });

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "identifier":
          comparison = naturalCompare(a.sopIdentifier, b.sopIdentifier);
          break;
        case "name": {
          const cleanA = cleanSOPName(a.sopName, a.sopIdentifier);
          const cleanB = cleanSOPName(b.sopName, b.sopIdentifier);
          comparison = cleanA.localeCompare(cleanB, undefined, { sensitivity: "base" });
          break;
        }
        case "questions":
          comparison = (a.totalQuestions || 0) - (b.totalQuestions || 0);
          break;
        case "date":
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [mcqBanks, searchTerm, difficultyFilter, sortBy, sortOrder]);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Easy":
        return "bg-green-500/20 text-green-300 border-green-500";
      case "Medium":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500";
      case "Hard":
        return "bg-red-500/20 text-red-300 border-red-500";
      default:
        return "bg-gray-500/20 text-gray-300 border-gray-500";
    }
  };

  const deleteMCQBank = async (bankId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this MCQ Bank? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/mcq-bank?id=${bankId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        alert("MCQ Bank deleted successfully");
        await fetchMCQBanks(); // Refresh list
      } else {
        alert("Failed to delete MCQ Bank: " + (data.details || data.error));
      }
    } catch (error) {
      console.error("Error deleting MCQ Bank:", error);
      alert("An error occurred while deleting the question bank.");
    }
  };

  const toggleChecked = async (
    bankId: string,
    index: number,
    currentStatus: boolean,
  ) => {
    const statusKey = `${bankId}-${index}`;
    if (updatingStatus === statusKey) return;

    setUpdatingStatus(statusKey);
    setUpdatingStatus(statusKey);

    // OPTIMISTIC UPDATE: Update UI immediately
    const nextStatus = !currentStatus;

    // Update local modal state immediately
    if (selectedMCQBank && selectedMCQBank._id === bankId) {
      const newMcqs = [...selectedMCQBank.mcqs];
      newMcqs[index] = { ...newMcqs[index], isChecked: nextStatus };
      setSelectedMCQBank({ ...selectedMCQBank, mcqs: newMcqs });
    }

    // Update the main list state
    setMcqBanks((prev) =>
      prev.map((b) => {
        if (b._id === bankId && b.mcqs && b.mcqs.length > 0) {
          const updatedMcqs = [...b.mcqs];
          updatedMcqs[index] = { ...updatedMcqs[index], isChecked: nextStatus };
          return { ...b, mcqs: updatedMcqs };
        }
        return b;
      }),
    );

    try {
      const response = await fetch("/api/mcq-bank/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId,
          questionIndex: index,
          isChecked: nextStatus,
        }),
      });
      const data = await response.json();

      if (!data.success) {
        // REVERT on failure
        console.error("Update failed, reverting:", data.error);
        const revertedStatus = currentStatus;

        if (selectedMCQBank && selectedMCQBank._id === bankId) {
          const newMcqs = [...selectedMCQBank.mcqs];
          newMcqs[index] = { ...newMcqs[index], isChecked: revertedStatus };
          setSelectedMCQBank({ ...selectedMCQBank, mcqs: newMcqs });
        }

        setMcqBanks((prev) =>
          prev.map((b) => {
            if (b._id === bankId && b.mcqs && b.mcqs.length > 0) {
              const updatedMcqs = [...b.mcqs];
              updatedMcqs[index] = {
                ...updatedMcqs[index],
                isChecked: revertedStatus,
              };
              return { ...b, mcqs: updatedMcqs };
            }
            return b;
          }),
        );
      }
    } catch (error) {
      console.error("Error toggling checked status:", error);
      // Revert skipped for brevity but recommended in prod
    } finally {
      setUpdatingStatus(null);
    }
  };

  const toggleReview = async (bank: MCQBank, index: number, mcq: MCQ) => {
    const statusKey = `${bank._id}-${index}`;
    if (updatingStatus === statusKey) return;

    setUpdatingStatus(statusKey);
    const currentStatus = !!mcq.isReviewed;
    const nextStatus = !currentStatus;

    // OPTIMISTIC UPDATE
    if (selectedMCQBank && selectedMCQBank._id === bank._id) {
      const newMcqs = [...selectedMCQBank.mcqs];
      newMcqs[index] = { ...newMcqs[index], isReviewed: nextStatus };
      setSelectedMCQBank({ ...selectedMCQBank, mcqs: newMcqs });
    }

    setMcqBanks((prev) =>
      prev.map((b) => {
        if (b._id === bank._id) {
          if (b.mcqs && b.mcqs.length > 0) {
            const updatedMcqs = [...b.mcqs];
            updatedMcqs[index] = {
              ...updatedMcqs[index],
              isReviewed: nextStatus,
            };
            return { ...b, mcqs: updatedMcqs };
          }
        }
        return b;
      }),
    );

    try {
      // 1. Update flag in MCQBank
      const response = await fetch("/api/mcq-bank/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId: bank._id,
          questionIndex: index,
          isReviewed: nextStatus,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // 2. Sync with MCQReview collection (fire and forget)
        if (nextStatus) {
          // Flagging: create a review entry
          fetch("/api/mcq-review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mcqBankId: bank._id,
              questionIndex: index,
              sopId: bank.sopId,
              sopName: bank.sopName,
              sopIdentifier: bank.sopIdentifier,
              question: mcq,
              flaggedBy: "Trainer",
            }),
          }).catch(console.error);
        } else {
          // Unflagging: delete the review entry
          fetch(
            `/api/mcq-review?mcqBankId=${bank._id}&questionIndex=${index}`,
            {
              method: "DELETE",
            },
          ).catch(console.error);
        }
      } else {
        // Revert on failure (omitted for brevity)
        console.error("Update failed:", data.error);
      }
    } catch (error) {
      console.error("Error toggling review status:", error);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const toggleSimilar = async (bank: MCQBank, index: number, mcq: MCQ, forceStatus?: boolean) => {
    const statusKey = `${bank._id}-${index}`;
    if (updatingStatus === statusKey) return;

    setUpdatingStatus(statusKey);
    const currentStatus = !!mcq.isSimilar;
    const nextStatus = forceStatus !== undefined ? forceStatus : !currentStatus;

    // OPTIMISTIC UPDATE
    if (selectedMCQBank && selectedMCQBank._id === bank._id) {
      const newMcqs = [...selectedMCQBank.mcqs];
      newMcqs[index] = { ...newMcqs[index], isSimilar: nextStatus };
      setSelectedMCQBank({ ...selectedMCQBank, mcqs: newMcqs });
    }

    setSimilarQuestionDetails((prev) => {
      const updated = { ...prev };
      if (!nextStatus) {
        if (updated[index]) {
          delete updated[index];
        } else {
          for (const key in updated) {
            updated[key] = updated[key].filter((i) => i !== index);
            if (updated[key].length === 0) {
              delete updated[key];
            }
          }
        }
      }
      return updated;
    });

    setMcqBanks((prev) =>
      prev.map((b) => {
        if (b._id === bank._id) {
          if (b.mcqs && b.mcqs.length > 0) {
            const updatedMcqs = [...b.mcqs];
            updatedMcqs[index] = {
              ...updatedMcqs[index],
              isSimilar: nextStatus,
            };
            return { ...b, mcqs: updatedMcqs };
          }
        }
        return b;
      }),
    );

    try {
      // 1. Update flag in MCQBank
      const response = await fetch("/api/mcq-bank/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId: bank._id,
          questionIndex: index,
          isSimilar: nextStatus,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // 2. Create/Delete similarity record
        if (nextStatus) {
          // AUTO-DETECT SIMILAR QUESTIONS
          // Trigger similarity detection for this specific MCQ bank
          const detectResponse = await fetch("/api/similar-questions/detect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mcqBankId: bank._id,
              sopId: bank.sopId,
              threshold: 30, // Lowered to 30 for better detection
              targetQuestionIndex: index, // Only detect for this specific question
            }),
          });

          const detectData = await detectResponse.json();

          if (detectData.success && detectData.flaggedCount > 0) {
            console.log(
              `Auto-detected ${detectData.flaggedCount} similar question(s) for Q${index + 1}`,
            );
          } else {
            // If no similar questions found, create a standalone record
            await fetch("/api/similar-questions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sopId: bank.sopId,
                sopName: bank.sopName,
                sopIdentifier: bank.sopIdentifier,
                department: bank.department || "General",
                primaryQuestion: {
                  mcqBankId: bank._id,
                  questionIndex: index,
                  question: mcq,
                },
                similarQuestions: [],
                flaggedBy: "Manual",
              }),
            });
          }
        } else {
          // Unflagging: delete the similarity entry
          // Find and delete the similarity record for this question
          fetch(
            `/api/similar-questions?mcqBankId=${bank._id}&questionIndex=${index}`,
            {
              method: "DELETE",
            },
          ).catch(console.error);

          if (!nextStatus) {
            setActionFeedback({ id: statusKey, message: "Removed from similar", type: "success" });
            setTimeout(() => setActionFeedback(null), 3000);
          }
        }
      } else {
        // Revert on failure
        console.error("Update failed:", data.error);
        if (!nextStatus) {
          setActionFeedback({ id: statusKey, message: "Error removing similar", type: "error" });
          setTimeout(() => setActionFeedback(null), 3000);
        }
        if (selectedMCQBank && selectedMCQBank._id === bank._id) {
          const newMcqs = [...selectedMCQBank.mcqs];
          newMcqs[index] = { ...newMcqs[index], isSimilar: currentStatus };
          setSelectedMCQBank({ ...selectedMCQBank, mcqs: newMcqs });
        }
        setMcqBanks((prev) =>
          prev.map((b) => {
            if (b._id === bank._id && b.mcqs && b.mcqs.length > 0) {
              const updatedMcqs = [...b.mcqs];
              updatedMcqs[index] = {
                ...updatedMcqs[index],
                isSimilar: currentStatus,
              };
              return { ...b, mcqs: updatedMcqs };
            }
            return b;
          }),
        );
      }
    } catch (error) {
      console.error("Error toggling similar status:", error);
      if (!nextStatus) {
        setActionFeedback({ id: statusKey, message: "Network Error", type: "error" });
        setTimeout(() => setActionFeedback(null), 3000);
      }
    } finally {
      setUpdatingStatus(null);
    }
  };

  // Only show the full-page spinner during initial page load (first fetch)
  // Bank-detail loading uses a non-blocking overlay (loadingBankDetail) so the
  // tree component stays mounted and fullScreenDept state is preserved.
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] p-4">
        <div className="max-w-7xl mx-auto pt-8">
          <DeptGridSkeleton count={8} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-2 md:p-4">
      <div className="w-full">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1 text-left">
              <h1 className="text-2xl font-bold mb-1 bg-clip-text text-transparent bg-gradient-to-r from-purple-700 to-purple-500">
                {sopIdFromUrl && selectedMCQBank ? (
                  <>
                    {formatSOPDisplayName(
                      selectedMCQBank.sopName,
                      selectedMCQBank.sopIdentifier,
                    )}
                  </>
                ) : (
                  <>MCQ Question Bank</>
                )}
              </h1>
              <div className="text-gray-600 text-sm">
                {sopIdFromUrl && selectedMCQBank ? (
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-gray-600 tracking-tighter text-xs">
                      {selectedMCQBank.sopIdentifier} -{" "}
                      {selectedMCQBank.totalQuestions} questions available
                    </span>
                    {selectedMCQBank.department &&
                      trainerMappings[
                      normalizeDepartmentName(
                        selectedMCQBank.department,
                      ).toLowerCase()
                      ] && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-purple-50 border border-purple-200 rounded-full">
                          <Users className="h-3 w-3 text-purple-600" />
                          <span className="text-[10px] font-bold text-purple-700 uppercase tracking-widest">
                            Trainer:{" "}
                            {
                              trainerMappings[
                              normalizeDepartmentName(
                                selectedMCQBank.department,
                              ).toLowerCase()
                              ]
                            }
                          </span>
                        </div>
                      )}
                  </div>
                ) : (
                  <p>
                    Browse and manage your generated MCQ banks{" "}
                    {totalBanks > 0 && `(${totalBanks} total)`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
              {/* Back + Home navigation — always visible */}
              <button
                onClick={() => router.back()}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-md transition-all duration-200 border border-gray-300 hover:border-gray-400 whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <Link
                href="/dashboard"
                prefetch={true}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-md transition-all duration-200 shadow-sm whitespace-nowrap"
              >
                <Home className="h-3.5 w-3.5" />
                Home
              </Link>
              {/* Dev-mode toggle: unlock/lock copy+inspect protection */}
              {devModeUnlocked ? (
                <button
                  onClick={handleDevLock}
                  title="Re-enable copy & inspect protection"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-md transition-all duration-200 shadow-sm whitespace-nowrap"
                >
                  <LockOpen className="h-3.5 w-3.5" />
                  Dev Mode ON
                </button>
              ) : (
                <button
                  onClick={() => { setShowDevModal(true); setDevPassword(""); setDevPasswordError(""); }}
                  title="Unlock copy & inspect restrictions (dev only)"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-md transition-all duration-200 border border-gray-300 hover:border-gray-400 whitespace-nowrap"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Dev Mode
                </button>
              )}
              {(!selectedMCQBank && !isOpeningFromUrl) && (
                <>
                  <button
                    onClick={() => fetchTreeData(true)}
                    disabled={loadingTree}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white font-semibold rounded-md hover:bg-emerald-700 transition-all duration-300 shadow-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Refresh MCQ Bank data and clear cache"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${loadingTree ? "animate-spin" : ""}`}
                    />
                    {loadingTree ? "Refreshing..." : "Refresh"}
                  </button>
                  <button
                    onClick={() => void openObsoleteDetails()}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-600 text-white font-semibold rounded-md hover:bg-rose-700 transition-all duration-300 shadow-sm whitespace-nowrap"
                    title="View obsolete SOP details"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Obsolete Details
                  </button>
                  <button
                    onClick={() => router.push("/similar-questions")}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-600 text-white font-semibold rounded-md hover:bg-orange-700 transition-all duration-300 shadow-sm whitespace-nowrap"
                    title="Review similar/duplicate questions"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Similar Questions
                  </button>
                  <button
                    onClick={() => router.push("/sop-upload")}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 transition-all duration-300 shadow-sm whitespace-nowrap"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload SOP
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <TrainingMatrixUploadModal
          isOpen={showMatrixModal}
          onClose={() => setShowMatrixModal(false)}
        />

        {/* Obsolete SOP Details modal */}
        {showObsoleteDetails && (
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowObsoleteDetails(false)}
          >
            <div
              className="w-full max-w-5xl rounded-xl border border-gray-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                    <Archive className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">
                      Obsolete SOP Details
                    </h2>
                    <p className="text-[10px] font-semibold text-gray-500">
                      {obsoleteDetailsLoading
                        ? "Loading…"
                        : `${obsoleteDetails.length} SOP(s)`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowObsoleteDetails(false)}
                  className="rounded p-1 text-gray-400 hover:text-gray-600"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto p-4">
                {obsoleteDetailsLoading ? (
                  <div className="flex items-center justify-center py-16 text-gray-400">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
                    <span className="ml-3 text-sm font-semibold">
                      Loading obsolete SOPs…
                    </span>
                  </div>
                ) : obsoleteDetails.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
                    <Archive className="h-10 w-10 opacity-30" />
                    <p className="text-sm font-semibold">
                      No obsolete SOPs found
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr className="border-b border-gray-200">
                          <th className="px-3 py-2 font-bold uppercase tracking-wider text-[10px] text-gray-600">
                            SOP No
                          </th>
                          <th className="px-3 py-2 font-bold uppercase tracking-wider text-[10px] text-gray-600">
                            Name
                          </th>
                          <th className="px-3 py-2 font-bold uppercase tracking-wider text-[10px] text-gray-600">
                            Department
                          </th>
                          <th className="px-3 py-2 font-bold uppercase tracking-wider text-[10px] text-gray-600">
                            Questions
                          </th>
                          <th className="px-3 py-2 font-bold uppercase tracking-wider text-[10px] text-gray-600">
                            Obsolete At
                          </th>
                          <th className="px-3 py-2 font-bold uppercase tracking-wider text-[10px] text-gray-600 text-right">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {obsoleteDetails.map((sop: any) => (
                          <tr
                            key={`obs-${sop.sopIdentifier}`}
                            className="border-b border-gray-100 hover:bg-rose-50/30"
                          >
                            <td className="px-3 py-2 font-mono font-bold text-rose-800 whitespace-nowrap">
                              {sop.sopIdentifier}
                            </td>
                            <td className="px-3 py-2 font-semibold text-gray-800">
                              {sop.sopName || "—"}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {sop.department || "—"}
                            </td>
                            <td className="px-3 py-2 text-gray-700 font-bold tabular-nums">
                              {sop.totalQuestions ?? 0}
                            </td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                              {sop.obsoleteAt
                                ? new Date(sop.obsoleteAt).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                disabled={obsoleteRestoreBusy === sop.sopIdentifier}
                                onClick={() =>
                                  void restoreObsoleteSop(String(sop.sopIdentifier))
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                <RotateCcw className="h-3 w-3" />
                                {obsoleteRestoreBusy === sop.sopIdentifier
                                  ? "Restoring…"
                                  : "Restore"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Show loading state if opening from URL */}
        {sopIdFromUrl && !selectedMCQBank && isOpeningFromUrl && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="h-12 w-12 text-purple-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Loading MCQ Bank...</p>
            </div>
          </div>
        )}

        {/* Search, Filter, and Sort - only show if not loading from URL */}
        {(!sopIdFromUrl || selectedMCQBank || !isOpeningFromUrl) && (
        <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 mb-4">
          <div className="flex flex-col gap-2">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by SOP name, identifier, or ID..."
                value={searchInputValue}
                onChange={(e) => setSearchInputValue(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-md text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Filters and Sort */}
            <div className="flex flex-col md:flex-row gap-2 items-start md:items-center justify-between">
              {/* Difficulty Filters */}
              <div className="flex gap-1.5 flex-wrap">
                {["All", "Easy", "Medium", "Hard"].map((difficulty) => (
                  <button
                    key={difficulty}
                    onClick={() => setDifficultyFilter(difficulty)}
                    className={`px-2 py-1 text-xs rounded-md font-semibold transition-all ${difficultyFilter === difficulty
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                  >
                    {difficulty}
                  </button>
                ))}
              </div>

              {/* Sort Options */}
              <div className="flex gap-2 items-center">
                <span className="text-gray-600 text-xs font-semibold">
                  Sort by:
                </span>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { value: "identifier", label: "ID" },
                    { value: "name", label: "Name" },
                    { value: "questions", label: "Questions" },
                    { value: "date", label: "Date" },
                  ].map((sort) => (
                    <button
                      key={sort.value}
                      onClick={() => {
                        if (sortBy === sort.value) {
                          setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                        } else {
                          setSortBy(
                            sort.value as
                            | "name"
                            | "questions"
                            | "date"
                            | "identifier",
                          );
                          setSortOrder("asc");
                        }
                      }}
                      className={`px-3 py-1.5 text-xs rounded-md font-semibold transition-all flex items-center gap-1 ${sortBy === sort.value
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                    >
                      {sort.label}
                      {sortBy === sort.value &&
                        (sortOrder === "asc" ? (
                          <SortAsc className="h-3 w-3" />
                        ) : (
                          <SortDesc className="h-3 w-3" />
                        ))}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}


        {/* Tree View */}
        {isOpeningFromUrl ? (
          /* Skeleton: opening a bank from URL */
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl p-4 border border-gray-200 animate-pulse">
                <div className="h-4 w-1/3 bg-gray-200 rounded mb-3" />
                <div className="h-3 w-2/3 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : !selectedMCQBank ? (
          loadingTree ? (
            /* Skeleton: department folder cards */
            <DeptGridSkeleton count={8} />
          ) : treeData ? (
            <MCQTreeView
              key="mcq-tree-view-stable"
              tree={treeData.tree}
              unorganized={treeData.unorganized}
              searchTerm={searchTerm}
              expandedDepts={expandedDepts}
              setExpandedDepts={setExpandedDepts}
              expandedSubcats={expandedSubcats}
              setExpandedSubcats={setExpandedSubcats}
              expandedSOPs={expandedSOPs}
              setExpandedSOPs={setExpandedSOPs}
              fullScreenDept={fullScreenDept}
              setFullScreenDept={setFullScreenDept}
              trainerMappings={trainerMappings}
              refreshDeptStatsKey={refreshDeptStatsKey}
              onViewMCQs={(sopNode, filterStatus = "all") => {
                if (sopNode.mcqBanks && sopNode.mcqBanks.length > 0) {
                  openSOPNodeWithAllBanks(sopNode, filterStatus);
                }
              }}
              onDownloadSOP={(sopNode) => {
                if (!sopNode.sopFileUrl) return;
                const ext = (sopNode.sopFileType || "").toLowerCase();
                if (ext === "docx" || ext === "doc") {
                  const path = sopNode.sopFileUrl.replace(/^\/+/, "");
                  let url = `/dashboard/view-doc?path=${encodeURIComponent(path)}&identifier=${encodeURIComponent(sopNode.sopCode)}`;
                  window.open(url, "_blank");
                } else {
                  window.open(sopNode.sopFileUrl, "_blank");
                }
              }}
            />
          ) : (
            <div className="text-center py-16">
              <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-400 text-xl">No tree data available</p>
            </div>
          )
        ) : null}
        {false && (
          <>
            {/* MCQ Banks Grid - hidden */}
            {filteredAndSortedMCQBanks.length === 0 ? (
              <div className="text-center py-16">
                <BookOpen className="h-16 w-16 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400 text-xl">
                  {searchTerm
                    ? "No MCQ banks match your search"
                    : "No MCQ banks found"}
                </p>
                {searchTerm && (
                  <button
                    onClick={() => { setSearchInputValue(""); setSearchTerm(""); }}
                    className="mt-4 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white/10 backdrop-blur-lg rounded-xl shadow-lg border border-white/20 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10 select-none">
                        <th
                          onClick={() => { if (sortBy === "identifier") setSortOrder(sortOrder === "asc" ? "desc" : "asc"); else { setSortBy("identifier"); setSortOrder("asc"); } }}
                          className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-white/10 transition-colors group"
                        >
                          <div className="flex items-center">
                            ID
                            {sortBy === "identifier" ? (sortOrder === "asc" ? <SortAsc className="h-3.5 w-3.5 ml-1.5 text-purple-400" /> : <SortDesc className="h-3.5 w-3.5 ml-1.5 text-purple-400" />) : <ArrowUpDown className="h-3.5 w-3.5 ml-1.5 opacity-0 group-hover:opacity-40 transition-opacity" />}
                          </div>
                        </th>
                        <th
                          onClick={() => { if (sortBy === "name") setSortOrder(sortOrder === "asc" ? "desc" : "asc"); else { setSortBy("name"); setSortOrder("asc"); } }}
                          className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-white/10 transition-colors group"
                        >
                          <div className="flex items-center">
                            Name
                            {sortBy === "name" ? (sortOrder === "asc" ? <SortAsc className="h-3.5 w-3.5 ml-1.5 text-purple-400" /> : <SortDesc className="h-3.5 w-3.5 ml-1.5 text-purple-400" />) : <ArrowUpDown className="h-3.5 w-3.5 ml-1.5 opacity-0 group-hover:opacity-40 transition-opacity" />}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider">Trainer</th>
                        <th
                          onClick={() => { if (sortBy === "questions") setSortOrder(sortOrder === "asc" ? "desc" : "asc"); else { setSortBy("questions"); setSortOrder("asc"); } }}
                          className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider text-center cursor-pointer hover:bg-white/10 transition-colors group"
                        >
                          <div className="flex items-center justify-center">
                            Questions
                            {sortBy === "questions" ? (sortOrder === "asc" ? <SortAsc className="h-3.5 w-3.5 ml-1.5 text-purple-400" /> : <SortDesc className="h-3.5 w-3.5 ml-1.5 text-purple-400" />) : <ArrowUpDown className="h-3.5 w-3.5 ml-1.5 opacity-0 group-hover:opacity-40 transition-opacity" />}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider text-center">Distribution</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {filteredAndSortedMCQBanks.map((bank) => (
                        <tr key={bank._id} className="hover:bg-white/5 transition-colors group">
                          <td className="px-4 py-3">
                            <span className="text-xs font-mono text-purple-300">{bank.sopIdentifier}</span>
                          </td>
                          <td className="px-4 py-3 max-w-xs md:max-w-sm">
                            <div className="flex items-center gap-3">
                              {/* Status Mini Icons */}
                              <div className="flex items-center gap-1 shrink-0">
                                {bank.checkedCount && bank.checkedCount > 0 && (
                                  <div className={`p-1 rounded ${bank.checkedCount >= (bank.totalQuestions || 0) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`} title={`${bank.checkedCount} Approved`}>
                                    <CheckCircle2 className="h-3 w-3" />
                                  </div>
                                )}
                                {bank.similarCount && bank.similarCount > 0 && (
                                  <div className="p-1 rounded bg-orange-500/20 text-orange-400 animate-pulse" title={`${bank.similarCount} Similar Questions`}>
                                    <AlertCircle className="h-3 w-3" />
                                  </div>
                                )}
                                {bank.reviewedCount && bank.reviewedCount > 0 && (
                                  <div className="p-1 rounded bg-indigo-500/20 text-indigo-400" title={`${bank.reviewedCount} Reviewed`}>
                                    <Star className="h-3 w-3" />
                                  </div>
                                )}
                                {!bank.checkedCount && !bank.similarCount && !bank.reviewedCount && (
                                  <div className="p-1 rounded bg-white/5 text-gray-500" title="Not Checked">
                                    <AlertCircle className="h-3 w-3 opacity-40" />
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white truncate" title={formatSOPDisplayName(bank.sopName, bank.sopIdentifier)}>
                                    {formatSOPDisplayName(bank.sopName, bank.sopIdentifier)}
                                  </span>
                                  {bank.language && bank.language !== 'English' && (
                                    <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                      GU
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-purple-400/70">{bank.sopIdentifier}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {bank.department && trainerMappings[bank.department.toLowerCase()] ? (
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3 text-purple-400 opacity-60 flex-shrink-0" />
                                <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20 whitespace-nowrap">
                                  {trainerMappings[bank.department.toLowerCase()]}
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-500 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-white font-bold text-sm">{bank.totalQuestions || 0}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2 text-[10px]">
                              <span className="bg-green-500/10 text-green-300 border border-green-500/20 px-1.5 py-0.5 rounded">E: {bank.difficultyDistribution?.easy || 0}</span>
                              <span className="bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 px-1.5 py-0.5 rounded">M: {bank.difficultyDistribution?.medium || 0}</span>
                              <span className="bg-red-500/10 text-red-300 border border-red-500/20 px-1.5 py-0.5 rounded">H: {bank.difficultyDistribution?.hard || 0}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => fetchFullBankDetails(bank)}
                                className="p-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded hover:from-purple-700 hover:to-pink-700 transition-all"
                                title="View"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => deleteMCQBank(bank._id)}
                                className="p-1.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 border border-red-500/20 transition-all"
                                title="Delete Bank"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}


        {/* Bank detail loading: skeleton overlay while fetching (shown when no selectedMCQBank yet) */}
        {loadingBankDetail && !selectedMCQBank && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#f8f9fa]">
            <div className="w-full h-full flex flex-col p-6 gap-4 animate-pulse">
              <div className="h-14 w-full bg-gray-200 rounded-xl" />
              <div className="h-8 w-2/3 bg-gray-200 rounded-lg" />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 flex-1 overflow-hidden">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 border border-gray-200">
                    <div className="h-4 w-3/4 bg-gray-200 rounded mb-3" />
                    <div className="h-3 w-full bg-gray-100 rounded mb-2" />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-7 bg-gray-100 rounded-lg" />
                      <div className="h-7 bg-gray-100 rounded-lg" />
                      <div className="h-7 bg-gray-100 rounded-lg" />
                      <div className="h-7 bg-gray-100 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MCQ Bank Detail Modal - Redesigned */}
        {selectedMCQBank &&
          (() => {
            // When multiple banks (English + Gujarati), show sections; otherwise single bank
            const banksToShow: MCQBank[] =
              selectedMCQBanks && selectedMCQBanks.length > 1
                ? selectedMCQBanks
                : selectedMCQBank
                  ? [selectedMCQBank]
                  : [];

            const allMcqs = selectedMCQBank.mcqs || [];
            const searchLower = modalSearch.trim().toLowerCase();

            function applyFilter(mcqList: MCQ[]) {
              let list = (mcqList || []).filter((mcq) => {
                if (difficultyFilter !== "All" && mcq.difficulty !== difficultyFilter) return false;
                if (filterReviewStatus === "checked" && !mcq.isChecked) return false;
                if (filterReviewStatus === "pending" && (mcq.isChecked || mcq.isReviewed)) return false;
                if (filterReviewStatus === "similar" && !mcq.isSimilar) return false;
                if (filterReviewStatus === "reviewed" && !mcq.isReviewed) return false;
                if (searchLower) {
                  const qText = (mcq.question || "").toLowerCase();
                  const opts = (mcq.options || []).join(" ").toLowerCase();
                  const ref = (mcq.sopReference || "").toLowerCase();
                  if (!qText.includes(searchLower) && !opts.includes(searchLower) && !ref.includes(searchLower)) return false;
                }
                return true;
              });
              if (filterReviewStatus === "all") {
                const seen = new Set<string>();
                const deduped: MCQ[] = [];
                for (const mcq of list) {
                  const key = (mcq.question || "").trim().toLowerCase();
                  if (!seen.has(key)) { seen.add(key); deduped.push(mcq); }
                }
                return deduped;
              }
              return list;
            }

            let filtered = applyFilter(allMcqs);

            // Highlight helper
            const highlight = (text: string) => {
              if (!searchLower || !text) return <span>{text}</span>;
              const idx = text.toLowerCase().indexOf(searchLower);
              if (idx === -1) return <span>{text}</span>;
              return (
                <span>
                  {text.slice(0, idx)}
                  <mark className="bg-indigo-500/40 text-indigo-100 rounded px-0.5">
                    {text.slice(idx, idx + searchLower.length)}
                  </mark>
                  {text.slice(idx + searchLower.length)}
                </span>
              );
            };

            return (
              <div className="fixed inset-0 z-[60] flex items-center justify-center animate-in fade-in duration-300">
                <div className="bg-[#f8f9fa] w-full h-full rounded-none flex flex-col overflow-hidden shadow-2xl">
                  {/* ── PREMIUM STICKY HEADER ── */}
                  <div className="sticky top-0 z-20 bg-white border-b border-gray-200 flex-shrink-0">
                    {/* Brand / Navigation Row */}
                    <div className="flex items-center justify-between px-6 py-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <button
                          onClick={() => {
                            if (wasOpenedFromExternalLink.current) {
                              router.back();
                              return;
                            }
                            setSelectedMCQBank(null);
                            setSelectedMCQBanks(null);
                            setViewLanguage('English');
                            // Clear URL parameters when going back
                            if (typeof window !== 'undefined') {
                              const params = new URLSearchParams(window.location.search);
                              params.delete('sopId');
                              params.delete('lang');
                              const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
                              window.history.replaceState({ ...window.history.state }, '', newUrl);
                            }
                          }}
                          className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-all border border-gray-200"
                        >
                          <ArrowLeft className="h-5 w-5" />
                        </button>

                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-[10px] font-bold tracking-widest text-purple-600 uppercase">
                              SOP Identifier
                            </span>
                            <span className="h-1 w-1 rounded-full bg-gray-300" />
                            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                              {viewLanguage || "English"} Version
                            </span>
                            {selectedMCQBank.department &&
                              trainerMappings[
                              normalizeDepartmentName(
                                selectedMCQBank.department,
                              ).toLowerCase()
                              ] && (
                                <>
                                  <span className="h-1 w-1 rounded-full bg-gray-300" />
                                  <span className="text-[10px] text-purple-600 font-bold uppercase tracking-wider flex items-center gap-1.5 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200 shadow-sm animate-in fade-in slide-in-from-left-2 duration-1000">
                                    <Users className="h-3 w-3 opacity-70" />
                                    {
                                      trainerMappings[
                                      normalizeDepartmentName(
                                        selectedMCQBank.department,
                                      ).toLowerCase()
                                      ]
                                    }
                                  </span>
                                </>
                              )}
                          </div>
                          <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-gray-800 flex-shrink-0">
                              {cleanSOPName(
                                selectedMCQBank.sopName,
                                selectedMCQBank.sopIdentifier,
                              )}
                            </h2>
                            <span className="px-2 py-0.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold font-mono">
                              {selectedMCQBank.sopIdentifier}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="hidden md:flex items-center justify-center px-2 py-1 rounded-lg bg-purple-50 border border-purple-200 min-w-[2.5rem]" title="Total Indexed MCQs">
                          <span className="text-[11px] text-purple-700 font-bold">
                            {filtered.length}
                          </span>
                        </div>

                        <div className="h-8 w-px bg-gray-200 mx-2" />

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setModalSearchInputVisible((v) => !v);
                              if (modalSearchInputVisible) setModalSearch(""); setModalSearchInput("");
                            }}
                            className={`p-2 rounded-xl transition-all ${modalSearchInputVisible || modalSearch ? "bg-purple-100 text-purple-700 border border-purple-200" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100 border border-transparent"}`}
                          >
                            <Search className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() =>
                              handleCheckSimilarityForSOP(selectedMCQBank)
                            }
                            disabled={checkingSimilarity}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all border border-amber-200 hover:border-amber-300 disabled:opacity-50 text-xs font-bold uppercase tracking-wider"
                          >
                            {checkingSimilarity ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ScanSearch className="h-4 w-4" />
                            )}
                            <span className="hidden sm:inline">
                              {checkingSimilarity
                                ? "Checking..."
                                : "Check Similar"}
                            </span>
                          </button>
                          <button
                            onClick={() =>
                              handleSmartRegenerate(selectedMCQBank)
                            }
                            disabled={checkingSimilarity}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-violet-700 bg-violet-50 hover:bg-violet-100 transition-all border border-violet-200 hover:border-violet-300 disabled:opacity-50 text-xs font-bold uppercase tracking-wider"
                            title="Detect similar questions and regenerate them with unique content"
                          >
                            {checkingSimilarity ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                            <span className="hidden sm:inline">
                              {checkingSimilarity
                                ? "Processing..."
                                : "Smart Regenerate"}
                            </span>
                          </button>
                          {/* Language switch toggle */}
                          <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden">
                            {(['English', 'Gujarati'] as const).map((lang) => {
                              const hasBank = selectedMCQBanks?.some(b => b.language === lang);
                              const isActive = viewLanguage === lang;
                              return (
                                <button
                                  key={lang}
                                  onClick={() => {
                                    if (!hasBank) return;
                                    setViewLanguage(lang);
                                    setRegenLanguage(lang);
                                    const targetBank = selectedMCQBanks?.find(b => b.language === lang);
                                    if (targetBank) setSelectedMCQBank(targetBank);
                                  }}
                                  disabled={!hasBank}
                                  className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${
                                    isActive
                                      ? 'bg-purple-100 text-purple-700 border-purple-200'
                                      : hasBank
                                        ? 'bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                        : 'bg-gray-50 text-gray-400 cursor-not-allowed opacity-40'
                                  }`}
                                  title={!hasBank ? 'Gujarati version not available for this SOP' : `View ${lang} MCQs`}
                                >
                                  {lang === 'English' ? 'EN' : 'GU'}
                                </button>
                              );
                            })}
                          </div>
                          {/* Reset & Regenerate: auto-fix content + delete bank + regenerate */}
                          <button
                            onClick={async () => {
                              if (!selectedMCQBank || fixingAnswers) return;
                              if (!confirm(
                                `⚠️ Reset & Regenerate "${selectedMCQBank.sopIdentifier}"?\n\n` +
                                `This will DELETE all ${selectedMCQBank.mcqs?.length || 0} existing questions and generate 100 fresh ones in ${regenLanguage}.\n\n` +
                                `Use this to fix wrong correct answers (AI answer-mapping bug).\n\nContinue?`
                              )) return;

                              setFixingAnswers(true);
                              try {
                                // Step 0: If SOP content is missing/too short, try re-extracting from disk first
                                const contentCheckRes = await fetch(`/api/sop/generate-mcqs?sopId=${selectedMCQBank.sopId}`, {
                                  method: 'GET',
                                });
                                // Just get SOP info directly
                                const reextractRes = await fetch('/api/sop/reextract-content', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ 
                                    sopId: selectedMCQBank.sopId,
                                    sopIdentifier: selectedMCQBank.sopIdentifier,
                                  }),
                                });
                                const reextractData = await reextractRes.json();

                                if (!reextractData.success) {
                                  // Content re-extraction failed — file may be missing or scanned image
                                  if (reextractData.error?.includes('not found on disk') || reextractData.error?.includes('re-upload')) {
                                    alert(
                                      `❌ SOP File Not Found on Disk\n\n` +
                                      `The original file for "${selectedMCQBank.sopIdentifier}" is missing.\n\n` +
                                      `Please go to the SOP Library page and:\n` +
                                      `1. Delete this SOP\n` +
                                      `2. Re-upload the original PDF/DOCX file\n` +
                                      `3. Then generate MCQs again`
                                    );
                                    return;
                                  }
                                  // Content extracted but still too short (scanned PDF)
                                  alert(
                                    `❌ Content Extraction Failed\n\n` +
                                    `Error: ${reextractData.error}\n\n` +
                                    `This SOP appears to be a scanned image PDF.\n` +
                                    `Please re-upload a text-based PDF or DOCX version.`
                                  );
                                  return;
                                }

                                console.log(`✅ Content re-extracted: ${reextractData.newLength} chars (${reextractData.wordCount} words)`);

                                // Step 1: Delete the existing MCQ bank
                                const delRes = await fetch(`/api/mcq-bank?id=${selectedMCQBank._id}`, {
                                  method: 'DELETE',
                                });
                                const delData = await delRes.json();
                                if (!delData.success) {
                                  alert(`❌ Failed to delete bank: ${delData.error || delData.details}`);
                                  return;
                                }

                                // Step 2: Close the modal
                                setSelectedMCQBank(null); setSelectedMCQBanks(null);
                                await fetchMCQBanks();

                                alert(
                                  `✅ Content fixed! (${reextractData.newLength} chars extracted)\n` +
                                  `🔄 Now generating ${selectedMCQBank.sopIdentifier} MCQs...\n\n` +
                                  `This may take 2–5 minutes.`
                                );

                                // Step 3: Trigger regeneration
                                const genRes = await fetch('/api/sop/generate-mcqs', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    sopId: selectedMCQBank.sopId,
                                    sopIdentifier: selectedMCQBank.sopIdentifier,
                                    targetCount: 100,
                                    language: regenLanguage,
                                  }),
                                });
                                const genData = await genRes.json();

                                if (genData.success) {
                                  alert(`✅ Regenerated ${genData.total} questions for ${selectedMCQBank.sopIdentifier}!\n\nAll answers are now correct.`);
                                  await fetchMCQBanks();
                                  if (viewMode === 'tree') fetchTreeData(true);
                                } else {
                                  alert(`❌ Generation failed: ${genData.error}\n\nBank was deleted. You can try clicking "Generate 100 MCQs" from the table view.`);
                                }
                              } catch (err) {
                                alert('Network error. Please try again.');
                              } finally {
                                setFixingAnswers(false);
                              }
                            }}
                            disabled={fixingAnswers}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-rose-700 bg-rose-50 hover:bg-rose-100 transition-all border border-rose-200 hover:border-rose-300 disabled:opacity-50 text-xs font-bold uppercase tracking-wider"
                            title="Re-extract content + delete bank + regenerate with correct answers"
                          >
                            {fixingAnswers ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            <span className="hidden sm:inline">
                              {fixingAnswers ? 'Regenerating...' : 'Reset & Regen'}
                            </span>
                          </button>
                          <button
                            onClick={() => setIsMaximized(!isMaximized)}
                            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all border border-transparent"
                            title={isMaximized ? "Restore down" : "Maximize"}
                          >
                            {isMaximized ? (
                              <Minimize2 className="h-5 w-5" />
                            ) : (
                              <Maximize2 className="h-5 w-5" />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              if (wasOpenedFromExternalLink.current) {
                                router.back();
                                return;
                              }
                              setSelectedMCQBank(null);
                              setSelectedMCQBanks(null);
                              // Clear URL parameters when closing
                              if (typeof window !== 'undefined') {
                                const params = new URLSearchParams(window.location.search);
                                params.delete('sopId');
                                params.delete('lang');
                                const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
                                window.history.replaceState({ ...window.history.state }, '', newUrl);
                              }
                            }}
                            className="p-2 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all border border-transparent hover:border-red-200"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Sub-header: Search & Filtering */}
                    <div className="px-6 pb-4 space-y-4">
                      {/* Search bar expanded */}
                      {modalSearchInputVisible && (
                        <div className="relative animate-in slide-in-from-top-2 duration-300">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400/60" />
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search pharmaceutical concepts, references, or codes..."
                            value={modalSearchInput}
                            onChange={(e) => {
                              setModalSearchInput(e.target.value);
                              setVisibleCount(30);
                            }}
                            className="w-full pl-11 pr-12 py-3 bg-white border border-gray-300 rounded-2xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 hover:border-purple-300 transition-all shadow-sm"
                          />
                          {modalSearch && (
                            <button
                              onClick={() => setModalSearch("")}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 bg-gray-100 rounded-md"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Navigation & Status Filter */}
                      <div className="flex items-center justify-between gap-4">
                        <nav className="flex items-center gap-1.5 p-1.5 bg-gray-100 border border-gray-200 rounded-2xl shadow-inner">
                          <button
                            onClick={() => {
                              setActiveTab("active");
                              setVisibleCount(30);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === "active" ? "bg-purple-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-white"}`}
                          >
                            <Grid className="h-3 w-3" />
                            Active ({banksToShow.length > 1 ? banksToShow.reduce((s, b) => s + (b.mcqs?.length ?? 0), 0) : (selectedMCQBank.mcqs?.length ?? 0)})
                          </button>
                          <button
                            onClick={() => {
                              setActiveTab("recycled");
                              if (selectedMCQBank?.sopId)
                                fetchRecycledQuestions(selectedMCQBank.sopId);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === "recycled" ? "bg-rose-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-white"}`}
                          >
                            <Trash2 className="h-3 w-3" />
                            Recycled{" "}
                            {recycledQuestions.length > 0
                              ? `(${recycledQuestions.length})`
                              : ""}
                          </button>
                        </nav>

                        {activeTab === "active" && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden sm:inline mr-1">
                              Status Filter
                            </span>
                            <div className="flex p-1 bg-gray-100 border border-gray-200 rounded-xl gap-1 shadow-inner">
                              {(
                                [
                                  {
                                    id: "all",
                                    label: "All",
                                    icon: <Grid className="h-3.5 w-3.5" />,
                                    color: "bg-indigo-500",
                                    activeClass: "text-indigo-400",
                                  },
                                  {
                                    id: "checked",
                                    label: "Approved",
                                    icon: (
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    ),
                                    color: "bg-emerald-500",
                                    activeClass: "text-emerald-400",
                                  },
                                  {
                                    id: "pending",
                                    label: "Pending",
                                    icon: <Clock className="h-3.5 w-3.5" />,
                                    color: "bg-orange-500",
                                    activeClass: "text-orange-400",
                                  },
                                  {
                                    id: "similar",
                                    label: "Similar",
                                    icon: <Copy className="h-3.5 w-3.5" />,
                                    color: "bg-amber-500",
                                    activeClass: "text-amber-400",
                                  },
                                  {
                                    id: "reviewed",
                                    label: "Reviewed",
                                    icon: <Star className="h-3.5 w-3.5" />,
                                    color: "bg-blue-500",
                                    activeClass: "text-blue-400",
                                  },
                                ] as const
                              ).map((pill) => (
                                <button
                                  key={pill.id}
                                  onClick={() => {
                                    setFilterReviewStatus(pill.id as any);
                                    setVisibleCount(30);
                                  }}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${filterReviewStatus === pill.id
                                    ? `bg-white border-gray-200 shadow-sm ${pill.activeClass}`
                                    : "border-transparent text-gray-400 hover:text-gray-700 hover:bg-white"
                                    }`}
                                >
                                  {pill.icon}
                                  {pill.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── RICH INTERFACE BODY ── */}
                  <div
                    ref={modalBodyRef}
                    className="flex-1 overflow-y-auto custom-scrollbar bg-[#f8f9fa] relative w-full px-0"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      if (
                        el.scrollTop + el.clientHeight >=
                        el.scrollHeight - 200
                      ) {
                        setVisibleCount((v) =>
                          Math.min(v + 20, filtered.length),
                        );
                      }
                    }}
                  >
                    <div className="border-x border-gray-200">
                      {activeTab === "active" ? (
                        banksToShow.length > 1 ? (
                          /* Multiple banks: English section first, then Gujarati */
                          banksToShow.map((bank) => {
                            const bankMcqs = bank.mcqs || [];
                            const filteredBank = applyFilter(bankMcqs);
                            const langLabel = (bank.language || "English") === "Gujarati" ? "Gujarati" : "English";
                            return (
                              <div key={bank._id} className="mb-10">
                                <h3 className="text-sm font-bold text-purple-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-lg bg-purple-50 border border-purple-200">
                                    {langLabel}
                                  </span>
                                  <span className="text-gray-400 font-normal">
                                    ({filteredBank.length} questions)
                                  </span>
                                </h3>
                                {filteredBank.length === 0 ? (
                                  <p className="text-gray-400 text-sm py-4">No questions match filters.</p>
                                ) : (
                                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 p-4">
                                    {filteredBank.slice(0, visibleCount).map((mcq, visibleIdx) => {
                                      const originalIndex = bankMcqs.indexOf(mcq);
                                      const isUpdating = updatingStatus === `${bank._id}-${originalIndex}`;
                                      return (
                                        <div
                                          key={`${bank._id}-${originalIndex}`}
                                          className="group relative bg-white rounded-2xl border border-gray-200 hover:border-purple-300 transition-all duration-300 shadow-sm hover:shadow-md overflow-hidden min-w-0 flex flex-col"
                                          onClick={() => {
                                            setSelectedMCQBank(bank);
                                            setSelectedMCQ({ mcq, index: originalIndex });
                                          }}
                                        >
                                          <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                          <div className="relative flex flex-row items-stretch flex-1">
                                            <div className="flex flex-col items-center justify-start w-14 p-3 gap-2 bg-gray-50 border-r border-gray-100 shrink-0">
                                              <div className="flex flex-col items-center gap-1 pt-1">
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">Index</span>
                                                <div className="w-9 h-9 flex items-center justify-center bg-white border border-gray-200 rounded-lg text-sm font-mono font-bold text-purple-700 shadow-sm group-hover:border-purple-300 transition-colors">
                                                  {originalIndex + 1}
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex-1 flex flex-col px-4 pt-3 pb-4 min-w-0">
                                              <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className={`w-6 h-6 flex items-center justify-center rounded text-[11px] font-black border ${mcq.difficulty === "Easy" ? "bg-blue-50 text-blue-600 border-blue-200" : mcq.difficulty === "Medium" ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-rose-50 text-rose-600 border-rose-200"}`} title={mcq.difficulty}>
                                                    {mcq.difficulty === "Easy" ? "E" : mcq.difficulty === "Medium" ? "M" : "H"}
                                                  </span>
                                                  {bank.language === "Gujarati" && (
                                                    <span className="px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold uppercase tracking-wider">GUJ</span>
                                                  )}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                  {mcq.isSimilar && <div className="p-1 rounded-md bg-amber-50 text-amber-600 border border-amber-200" title="Flagged as Similar"><Copy className="h-3.5 w-3.5" /></div>}
                                                  {mcq.isChecked && <div className="p-1 rounded-md bg-purple-50 text-purple-600 border border-purple-200" title="Approved Status"><CheckCircle2 className="h-3.5 w-3.5" /></div>}
                                                  {mcq.isReviewed && <div className="p-1 rounded-md bg-blue-50 text-blue-600 border border-blue-200" title="Review Completed"><CheckCircle2 className="h-3.5 w-3.5" /></div>}
                                                </div>
                                              </div>
                                              <div className="mb-2.5 min-w-0">
                                                <div className="flex items-start gap-1.5 min-w-0">
                                                  <span className="text-purple-600 text-[15px] font-black mt-px select-none shrink-0">Q.</span>
                                                  <h3 className={`text-[15px] font-bold leading-snug tracking-tight text-gray-800 flex-1 min-w-0 break-words ${bank.language === "Gujarati" ? "font-gujarati text-base" : ""}`}>
                                                    {searchLower ? highlight(mcq.question) : mcq.question}
                                                  </h3>
                                                </div>
                                              </div>
                                              <div className="flex-1 grid grid-cols-2 gap-2 content-stretch">
                                                {(mcq.options || []).slice(0, 4).map((opt: string, oi: number) => {
                                                  const isCorrect = opt === mcq.correctAnswer;
                                                  return (
                                                    <div key={oi} className={`flex items-center gap-2 px-3 py-3 rounded-lg border text-[13px] font-medium ${isCorrect ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-100 text-gray-600"}`}>
                                                      <span className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded text-[10px] font-bold ${isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                                                        {String.fromCharCode(65 + oi)}
                                                      </span>
                                                      <span className={`flex-1 break-words min-w-0 leading-snug ${bank.language === "Gujarati" ? "font-gujarati" : ""}`}>{opt}</span>
                                                      {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : allMcqs.length > 0 ? (
                          filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                              <div className="w-20 h-20 bg-gray-100 border border-gray-200 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
                                <Search className="h-8 w-8 text-gray-400" />
                              </div>
                              <h3 className="text-xl font-bold text-gray-700 mb-2">
                                No results found
                              </h3>
                              <p className="text-gray-500 max-w-xs">
                                {modalSearch
                                  ? `We couldn't find any questions matching "${modalSearch}" in this bank.`
                                  : "Adjust your filters to see more questions."}
                              </p>
                              {modalSearch && (
                                <button
                                  onClick={() => setModalSearch("")}
                                  className="mt-6 px-4 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl hover:bg-purple-100 transition-all font-bold text-xs uppercase tracking-wider"
                                >
                                  Clear search query
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 p-4">
                              {filtered
                                .slice(0, visibleCount)
                                .map((mcq, visibleIdx) => {
                                  const originalIndex = allMcqs.indexOf(mcq);
                                  const isUpdating =
                                    updatingStatus ===
                                    `${selectedMCQBank._id}-${originalIndex}`;
                                  return (
                                    <div
                                      key={originalIndex}
                                      className="group relative bg-white rounded-xl border border-gray-200 hover:border-purple-300 transition-all duration-300 shadow-sm hover:shadow-md overflow-hidden min-w-0 flex flex-col"
                                      onClick={() =>
                                        setSelectedMCQ({
                                          mcq,
                                          index: originalIndex,
                                        })
                                      }
                                    >
                                      {/* Interactive Accent Glow */}
                                      <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                                      {/* Card Content Wrapper */}
                                      <div className="relative flex flex-row items-stretch flex-1">
                                        {/* Sidebar: Navigation Meta */}
                                        <div className="flex flex-col items-center justify-start w-14 p-3 gap-2 bg-gray-50 border-r border-gray-100 shrink-0">
                                          <div className="flex flex-col items-center gap-1 pt-1">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                                              #
                                            </span>
                                            <div className="w-9 h-9 flex items-center justify-center bg-white border border-gray-200 rounded-md text-sm font-mono font-bold text-purple-700 shadow-sm group-hover:border-purple-300 transition-colors">
                                              {originalIndex + 1}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Main Interaction Area */}
                                        <div className="flex-1 flex flex-col px-4 pt-3 pb-4 min-w-0">
                                          {/* Top Meta Area */}
                                          <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span
                                                className={`w-6 h-6 flex items-center justify-center rounded text-[11px] font-black border ${mcq.difficulty === "Easy"
                                                  ? "bg-blue-50 text-blue-600 border-blue-200"
                                                  : mcq.difficulty === "Medium"
                                                    ? "bg-amber-50 text-amber-600 border-amber-200"
                                                    : "bg-rose-50 text-rose-600 border-rose-200"
                                                  }`}
                                                title={mcq.difficulty}
                                              >
                                                {mcq.difficulty === "Easy" ? "E" : mcq.difficulty === "Medium" ? "M" : "H"}
                                              </span>
                                              {selectedMCQBank.language === "Gujarati" && (
                                                <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold uppercase tracking-wider">
                                                  GUJ
                                                </span>
                                              )}
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                              {mcq.isSimilar && (
                                                <div className="p-1 rounded bg-amber-50 text-amber-600 border border-amber-200" title="Flagged as Similar">
                                                  <Copy className="h-3.5 w-3.5" />
                                                </div>
                                              )}
                                              {mcq.isChecked && (
                                                <div className="p-1 rounded bg-purple-50 text-purple-600 border border-purple-200" title="Approved Status">
                                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                                </div>
                                              )}
                                              {mcq.isReviewed && (
                                                <div className="p-1 rounded bg-blue-50 text-blue-600 border border-blue-200" title="Review Completed">
                                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          {/* Question Text */}
                                          <div className="mb-2.5 min-w-0">
                                            <div className="flex items-start gap-1.5 min-w-0">
                                              <span className="text-purple-600 text-[15px] font-black mt-px select-none shrink-0">Q.</span>
                                              <p className={`text-[15px] font-bold leading-snug text-gray-800 flex-1 min-w-0 break-words line-clamp-3 ${selectedMCQBank?.language === "Gujarati" ? "font-gujarati text-base" : ""}`}>
                                                {searchLower ? highlight(mcq.question) : mcq.question}
                                              </p>
                                            </div>
                                          </div>

                                          {/* Options Preview */}
                                          <div className="flex-1 grid grid-cols-2 gap-2 content-stretch">
                                            {(mcq.options || []).slice(0, 4).map((opt, oi) => {
                                              const isCorrect = opt === mcq.correctAnswer;
                                              return (
                                                <div
                                                  key={oi}
                                                  className={`flex items-center gap-2 px-3 py-3 rounded-lg border text-[13px] font-medium ${isCorrect
                                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                                    : "bg-gray-50 border-gray-100 text-gray-600"
                                                    }`}
                                                >
                                                  <span className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded text-[10px] font-bold ${isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                                                    {String.fromCharCode(65 + oi)}
                                                  </span>
                                                  <span className={`flex-1 break-words min-w-0 leading-snug ${selectedMCQBank?.language === "Gujarati" ? "font-gujarati" : ""}`}>
                                                    {searchLower ? highlight(opt) : opt}
                                                  </span>
                                                  {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />}
                                                </div>
                                              );
                                            })}
                                          </div>

                                          {/* Similarity indicators / warnings */}
                                          {mcq.isSimilar &&
                                            similarQuestionDetails[
                                            originalIndex
                                            ] && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedMCQ({ mcq, index: originalIndex });
                                                }}
                                                className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all group/sim animate-in fade-in duration-500"
                                              >
                                                <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                                                  <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                                                </div>
                                                <div className="flex-1 min-w-0 text-left">
                                                  <span className="text-[11px] font-bold text-amber-400 block leading-none mb-0.5">
                                                    {similarQuestionDetails[originalIndex].length} Similar Question{similarQuestionDetails[originalIndex].length > 1 ? "s" : ""} Found
                                                  </span>
                                                  <span className="text-[9px] text-amber-500/60 uppercase tracking-wider">
                                                    Click to compare side by side →
                                                  </span>
                                                </div>
                                                <div className="flex gap-1 flex-shrink-0">
                                                  {similarQuestionDetails[originalIndex].slice(0, 3).map((i) => (
                                                    <span
                                                      key={i}
                                                      className="px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-400 font-bold"
                                                    >
                                                      Q{i + 1}
                                                    </span>
                                                  ))}
                                                  {similarQuestionDetails[originalIndex].length > 3 && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-400 font-bold">
                                                      +{similarQuestionDetails[originalIndex].length - 3}
                                                    </span>
                                                  )}
                                                </div>
                                              </button>
                                            )}
                                        </div>

                                        {/* Action Toolbar - Always Visible */}
                                        <div
                                          className="flex flex-col items-center justify-center gap-1.5 w-full sm:w-11 p-2 bg-gray-50 sm:border-l border-t sm:border-t-0 border-gray-100"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {/* Similar */}
                                          <button
                                            disabled={isUpdating}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleSimilar(selectedMCQBank, originalIndex, mcq);
                                            }}
                                            className={`p-2 rounded-lg transition-all ${mcq.isSimilar ? "bg-amber-500 text-white shadow-sm" : "bg-white text-gray-400 hover:text-amber-600 hover:bg-amber-50 hover:border-amber-200 border border-gray-200"}`}
                                            title="Toggle Similar"
                                          >
                                            {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                                          </button>
                                          {/* Check/Approve */}
                                          <button
                                            disabled={isUpdating}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleChecked(selectedMCQBank._id, originalIndex, !!mcq.isChecked);
                                            }}
                                            className={`p-2 rounded-lg transition-all ${mcq.isChecked ? "bg-emerald-500 text-white shadow-sm" : "bg-white text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 border border-gray-200"}`}
                                            title="Approve"
                                          >
                                            {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                          </button>
                                          {/* Review */}
                                          <button
                                            disabled={isUpdating}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleReview(selectedMCQBank, originalIndex, mcq);
                                            }}
                                            className={`p-2 rounded-lg transition-all ${mcq.isReviewed ? "bg-blue-500 text-white shadow-sm" : "bg-white text-gray-400 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 border border-gray-200"}`}
                                            title="Mark Reviewed"
                                          >
                                            {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          )
                        ) : (
                          <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="w-20 h-20 bg-gray-100 border border-gray-200 rounded-3xl flex items-center justify-center mb-6">
                              <FileText className="h-8 w-8 text-gray-400" />
                            </div>
                            <p className="text-gray-400 uppercase tracking-widest text-[10px] font-bold">
                              Catalogue Empty
                            </p>
                            <h3 className="text-xl font-bold text-gray-600 mt-2">
                              No active questions found
                            </h3>
                          </div>
                        )
                      ) : (
                        <div className="space-y-4">
                          {loadingRecycled ? (
                            <div className="flex flex-col items-center justify-center py-24">
                              <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
                              <p className="text-gray-400 text-xs mt-4 uppercase tracking-widest font-bold">
                                Querying Archive...
                              </p>
                            </div>
                          ) : recycledQuestions.length > 0 ? (
                            <div className="grid grid-cols-1 gap-4">
                              {recycledQuestions.map((elim, i) => (
                                <div
                                  key={i}
                                  className="group bg-white rounded-[24px] p-6 border border-rose-200 hover:border-rose-300 transition-all"
                                >
                                  <div className="flex items-start gap-5">
                                    <div className="flex flex-col items-center gap-1.5">
                                      <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500 shadow-sm">
                                        <Trash2 className="h-5 w-5" />
                                      </div>
                                      <span className="text-[10px] font-bold font-mono text-gray-400">
                                        {typeof (elim as any)
                                          .originalQuestionIndex === "number"
                                          ? `Q${(elim as any).originalQuestionIndex + 1}`
                                          : typeof (elim as any)
                                            .originalIndex === "number"
                                            ? `Q${(elim as any).originalIndex + 1}`
                                            : "ARC"}
                                      </span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                                        <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-bold uppercase tracking-wider">
                                          Archived:{" "}
                                          {new Date(
                                            elim.eliminatedAt,
                                          ).toLocaleDateString()}
                                        </span>
                                        {(elim as any).eliminatedBy &&
                                          (elim as any).eliminatedBy !==
                                          "Unknown User" && (
                                            <span className="px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold uppercase tracking-wider">
                                              Actor:{" "}
                                              {(elim as any).eliminatedBy}
                                            </span>
                                          )}
                                        <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 border border-gray-200 text-[10px] font-bold uppercase tracking-wider">
                                          {elim.eliminationReason === "manual"
                                            ? "Manual Delete"
                                            : elim.eliminationReason}
                                        </span>
                                      </div>

                                      <h3 className="text-lg font-semibold text-gray-400 mb-4 line-through decoration-rose-400 leading-relaxed italic">
                                        {elim.question.question}
                                      </h3>

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-4 border-l-2 border-gray-200">
                                        {elim.question.options?.map(
                                          (opt: string, idx: number) => (
                                            <div
                                              key={idx}
                                              className={`text-xs p-2.5 rounded-xl border ${opt === elim.question.correctAnswer ? "bg-purple-50 text-purple-700 border-purple-200" : "text-gray-400 bg-gray-50 border-gray-100"}`}
                                            >
                                              <span className="font-bold mr-2 text-[10px] underline decoration-gray-300">
                                                0{idx + 1}
                                              </span>{" "}
                                              {opt}
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                              <div className="w-20 h-20 bg-gray-100 border border-gray-200 rounded-3xl flex items-center justify-center mb-6">
                                <X className="h-8 w-8 text-gray-400" />
                              </div>
                              <p className="text-gray-400 uppercase tracking-widest text-[10px] font-bold">
                                Archive Integrity verified
                              </p>
                              <h3 className="text-xl font-bold text-gray-500 mt-2">
                                No recycled items found
                              </h3>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Load more footer */}
                  {activeTab === "active" && visibleCount < filtered.length && (
                    <div className="p-6 bg-white border-t border-gray-200 flex items-center justify-center w-full">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Displaying {visibleCount} of {filtered.length} units
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          setVisibleCount((v) =>
                            Math.min(v + 30, filtered.length),
                          )
                        }
                        className="flex items-center gap-2 px-6 py-2.5 bg-white border border-purple-200 rounded-2xl text-purple-700 hover:bg-purple-50 hover:border-purple-300 transition-all font-bold text-xs uppercase tracking-widest shadow-sm"
                      >
                        <ChevronsUpDown className="h-4 w-4" />
                        Expand Catalog ({filtered.length - visibleCount} units)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

        {/* MCQ Detail Modal — with Similar Questions Side-by-Side */}
        {selectedMCQ &&
          (() => {
            // Bidirectional Similarity Lookup
            // 1. Check if current question is a Primary node
            let relatedIndices: number[] =
              similarQuestionDetails &&
                similarQuestionDetails[selectedMCQ?.index]
                ? [...similarQuestionDetails[selectedMCQ.index]]
                : [];

            // 2. If not found as primary, check if it exists as a "Similar" node in another group
            if (relatedIndices.length === 0 && similarQuestionDetails) {
              for (const [pIdxStr, sIndices] of Object.entries(
                similarQuestionDetails,
              )) {
                if (!Array.isArray(sIndices)) continue;
                const pIdx = parseInt(pIdxStr);
                if (sIndices.includes(selectedMCQ?.index)) {
                  // Found it! This question is similar to Primary(pIdx).
                  // We want to show the Primary AND the other Similars as "related".
                  relatedIndices = [
                    pIdx,
                    ...sIndices.filter((i) => i !== selectedMCQ?.index),
                  ];
                  break;
                }
              }
            }

            // Only show similarity comparison if the question actually has isSimilar flag set in DB
            const hasSimilar = relatedIndices.length > 0 && !!selectedMCQ.mcq.isSimilar;
            const similarIndices = hasSimilar ? relatedIndices : [];
            const allMcqs = selectedMCQBank?.mcqs || [];

            // Render a compact question card for side-by-side comparison
            const renderCompactQuestion = (
              mcq: any,
              idx: number,
              label: string,
              accentColor: string,
            ) => {
              if (!mcq) return null;
              const isApproved = !!mcq.isChecked;
              const approvingKey = `${selectedMCQBank!._id}-${idx}`;
              return (
                <div
                  className={`flex-1 min-w-[300px] max-w-[450px] rounded-2xl border p-5 space-y-4 ${accentColor} flex flex-col`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{mcq.aiIcon || "📝"}</span>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                          {label || "Question"}
                        </p>
                        <p className="text-xs font-bold text-gray-800">
                          Q#{idx + 1}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isApproved && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold uppercase tracking-wider">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Approved
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${getDifficultyColor(mcq.difficulty)}`}
                      >
                        {mcq.difficulty || "Normal"}
                      </span>
                    </div>
                  </div>

                  {/* Question Text */}
                  <h4
                    className={`text-sm font-semibold text-gray-800 leading-relaxed ${selectedMCQBank?.language === "Gujarati" ? "font-gujarati text-base" : ""}`}
                  >
                    {mcq.question || "Loading question content..."}
                  </h4>

                  {/* Options */}
                  <div className="space-y-1.5">
                    {(mcq.options || []).map((opt: any, oi: number) => {
                      const isCorrect = opt === mcq.correctAnswer;
                      return (
                        <div
                          key={oi}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs transition-all ${isCorrect
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-gray-50 border-gray-100 text-gray-600"
                            }`}
                        >
                          <span
                            className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-md text-[9px] font-bold border ${isCorrect
                              ? "bg-emerald-100 border-emerald-200 text-emerald-700"
                              : "bg-gray-100 border-gray-200 text-gray-500"
                              }`}
                          >
                            {String.fromCharCode(65 + oi)}
                          </span>
                          <span
                            className={`${selectedMCQBank?.language === "Gujarati" ? "font-gujarati text-sm" : ""}`}
                          >
                            {opt || ""}
                          </span>
                          {isCorrect && (
                            <CheckCircle2 className="h-3 w-3 ml-auto text-emerald-400" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* SOP Source Reference */}
                  {mcq.sopReference && (
                    <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 flex items-center gap-1">
                        <BookOpen className="h-2.5 w-2.5" /> SOP Source Line
                      </p>
                      <p className="text-[10px] text-blue-600 leading-relaxed italic line-clamp-3">
                        &quot;{mcq.sopReference}&quot;
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 mt-auto">
                    {/* Approve Button */}
                    <button
                      onClick={() => {
                        toggleChecked(selectedMCQBank!._id, idx, isApproved);
                      }}
                      disabled={updatingStatus === approvingKey}
                      className={`col-span-2 px-3 py-2.5 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-1.5 ${isApproved
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30"
                        : "bg-emerald-600/15 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25 hover:border-emerald-400/40"
                        }`}
                    >
                      {updatingStatus === approvingKey ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {isApproved ? "Revoking..." : "Approving..."}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className={`h-3 w-3 ${isApproved ? "fill-emerald-400" : ""}`} />
                          {isApproved ? "Approved ✓" : "Approve Question"}
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        toggleSimilar(selectedMCQBank!, idx, mcq, false);
                      }}
                      disabled={updatingStatus === approvingKey || actionFeedback?.id === approvingKey}
                      className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-1.5 ${actionFeedback?.id === approvingKey
                          ? actionFeedback.type === 'error'
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                        }`}
                    >
                      {updatingStatus === approvingKey ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Removing...
                        </>
                      ) : actionFeedback?.id === approvingKey ? (
                        <>
                          {actionFeedback.type === 'error' ? <X className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                          {actionFeedback.message}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3" /> Not Similar
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        toggleReview(selectedMCQBank!, idx, mcq);
                      }}
                      className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-1.5 ${mcq.isReviewed
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                        }`}
                    >
                      <Star className={`h-3 w-3 ${mcq.isReviewed ? "fill-amber-300" : ""}`} />
                      {mcq.isReviewed ? "Flagged for Review" : "Flag for Review"}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Archive Q${idx + 1}?`))
                          handleDeleteQuestion(selectedMCQBank!._id, idx);
                      }}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-400 text-[10px] font-bold border border-rose-500/20 hover:bg-rose-500/20 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="h-3 w-3" /> Archive
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Regenerate Q${idx + 1}?`))
                          handleReplaceQuestion(
                            selectedMCQBank!._id,
                            idx,
                            selectedMCQBank!.sopId,
                          );
                      }}
                      className="px-3 py-2 rounded-xl bg-indigo-500/10 text-indigo-400 text-[10px] font-bold border border-indigo-500/20 hover:bg-indigo-500/20 transition-all flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="h-3 w-3" /> Regenerate
                    </button>
                  </div>
                </div>
              );
            };

            return (
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70] animate-in fade-in duration-300"
                onClick={() => { setSelectedMCQ(null); setEditMode(false); setEditDraft(null); }}
              >
                <div
                  className={`bg-white rounded-[28px] ${hasSimilar ? "max-w-6xl" : "max-w-3xl"} w-full max-h-[92vh] flex flex-col border border-gray-200 shadow-2xl overflow-hidden`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="bg-purple-600 px-6 py-4 flex-shrink-0 relative overflow-hidden">
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20 text-white font-mono font-bold shadow-lg">
                          {String(selectedMCQ.index + 1).padStart(2, "0")}
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-white tracking-tight leading-none mb-1">
                            {hasSimilar
                              ? "Similarity Comparison"
                              : "Question Analytics"}
                          </h2>
                          <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">
                            SOP: {selectedMCQBank?.sopIdentifier}
                            {hasSimilar && (
                              <span className="ml-3 text-amber-300">
                                ⚠ {similarIndices.length} similar question
                                {similarIndices.length > 1 ? "s" : ""} found
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => { setSelectedMCQ(null); setEditMode(false); setEditDraft(null); }}
                        className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition-all border border-white/20 shadow-inner"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white">
                    {hasSimilar ? (
                      /* ── SIDE-BY-SIDE COMPARISON VIEW ── */
                      <div className="space-y-5">
                        <div className="flex items-center gap-3 px-1">
                          <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b]" />
                          <p className="text-sm text-gray-600">
                            <span className="font-bold text-gray-800">
                              Q#{selectedMCQ.index + 1}
                            </span>{" "}
                            has been flagged as similar to{" "}
                            <span className="font-bold text-amber-600">
                              {similarIndices.length} other question
                              {similarIndices.length > 1 ? "s" : ""}
                            </span>
                            . Compare them side by side below.
                          </p>
                        </div>

                        <div className="flex gap-4 overflow-x-auto pb-2">
                          {/* Primary Question */}
                          {renderCompactQuestion(
                            selectedMCQ.mcq,
                            selectedMCQ.index,
                            "Primary Question",
                            "bg-purple-50 border-purple-200",
                          )}

                          {/* Similar Questions */}
                          {similarIndices.map((simIdx) => {
                            const simMcq = allMcqs[simIdx];
                            if (!simMcq) return null;
                            return (
                              <div key={simIdx} className="contents">
                                {renderCompactQuestion(
                                  simMcq,
                                  simIdx,
                                  "Similar Match",
                                  "bg-amber-50 border-amber-200",
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Quick Link */}
                        <div className="flex items-center justify-center pt-4 border-t border-gray-100">
                          <button
                            onClick={() => {
                              setSelectedMCQ(null);
                              router.push("/mcq-review");
                            }}
                            className="flex items-center gap-3 px-6 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl font-bold transition-all border border-gray-200 text-xs uppercase tracking-widest"
                          >
                            <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                            Resolve in Review Center
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── STANDARD SINGLE QUESTION VIEW ── */
                      <div className="space-y-6">

                        {/* Edit Mode Toggle Bar */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`w-8 h-8 flex items-center justify-center rounded-xl text-sm font-black border ${getDifficultyColor(selectedMCQ.mcq.difficulty)}`} title={selectedMCQ.mcq.difficulty}>
                              {selectedMCQ.mcq.difficulty === "Easy" ? "E" : selectedMCQ.mcq.difficulty === "Medium" ? "M" : "H"}
                            </span>
                          </div>
                          {!editMode ? (
                            <button
                              onClick={() => {
                                setEditDraft({
                                  question: selectedMCQ.mcq.question,
                                  options: [...selectedMCQ.mcq.options],
                                  correctAnswer: selectedMCQ.mcq.correctAnswer,
                                  explanation: selectedMCQ.mcq.explanation || '',
                                });
                                setEditMode(true);
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 hover:border-purple-300 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              Edit Question
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => { setEditMode(false); setEditDraft(null); }}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-500 border border-gray-200 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Cancel
                              </button>
                              <button
                                onClick={async () => {
                                  if (!editDraft || !selectedMCQBank) return;
                                  setEditSaving(true);
                                  try {
                                    const res = await fetch('/api/mcq-bank/edit-question', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        bankId: selectedMCQBank._id,
                                        questionIndex: selectedMCQ.index,
                                        question: editDraft.question,
                                        options: editDraft.options,
                                        correctAnswer: editDraft.correctAnswer,
                                        explanation: editDraft.explanation,
                                      }),
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                      // Update local state immediately
                                      const updatedBanks = mcqBanks.map(b => {
                                        if (b._id !== selectedMCQBank._id) return b;
                                        const updatedMcqs = [...b.mcqs];
                                        updatedMcqs[selectedMCQ.index] = {
                                          ...updatedMcqs[selectedMCQ.index],
                                          question: editDraft.question,
                                          options: editDraft.options,
                                          correctAnswer: editDraft.correctAnswer,
                                          explanation: editDraft.explanation,
                                        };
                                        return { ...b, mcqs: updatedMcqs };
                                      });
                                      setMcqBanks(updatedBanks);
                                      // Also update selectedMCQ and selectedMCQBank
                                      const updatedBank = updatedBanks.find(b => b._id === selectedMCQBank._id);
                                      if (updatedBank) {
                                        setSelectedMCQBank(updatedBank);
                                        setSelectedMCQ({ mcq: updatedBank.mcqs[selectedMCQ.index], index: selectedMCQ.index });
                                      }
                                      setEditMode(false);
                                      setEditDraft(null);
                                    } else {
                                      alert('Failed to save: ' + (data.error || 'Unknown error'));
                                    }
                                  } catch (err) {
                                    alert('Network error while saving.');
                                  } finally {
                                    setEditSaving(false);
                                  }
                                }}
                                disabled={editSaving}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                              >
                                {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                {editSaving ? 'Saving...' : 'Save Changes'}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Question Text */}
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] ml-1">Question</h4>
                          {editMode && editDraft ? (
                            <textarea
                              value={editDraft.question}
                              onChange={e => setEditDraft(d => d ? { ...d, question: e.target.value } : d)}
                              rows={3}
                              className="w-full bg-white border border-purple-200 rounded-2xl p-4 text-gray-800 text-base font-medium leading-relaxed focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none placeholder-gray-400 transition-all"
                              placeholder="Enter the question text..."
                            />
                          ) : (
                            <h3 className={`text-2xl font-bold text-gray-800 leading-tight tracking-tight ${selectedMCQBank?.language === 'Gujarati' ? 'font-gujarati' : ''}`}>
                              {selectedMCQ.mcq.question}
                            </h3>
                          )}
                        </div>

                        {/* Options */}
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] ml-1">
                            {editMode ? 'Edit Options & Select Correct Answer' : 'Proposed Options'}
                          </h4>
                          <div className="space-y-2.5">
                            {((editMode && editDraft ? editDraft.options : selectedMCQ.mcq.options) || []).map((option, index) => {
                              const label = String.fromCharCode(65 + index);
                              const isCorrect = editMode && editDraft
                                ? editDraft.correctAnswer === option || editDraft.correctAnswer === label
                                : option === selectedMCQ.mcq.correctAnswer;
                              return (
                                <div
                                  key={index}
                                  className={`group p-3 rounded-2xl flex items-center gap-3 transition-all border ${
                                    isCorrect
                                      ? 'bg-emerald-50 border-emerald-200'
                                      : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                                  }`}
                                >
                                  {/* Correct Answer Radio/Badge */}
                                  {editMode && editDraft ? (
                                    <button
                                      onClick={() => setEditDraft(d => d ? { ...d, correctAnswer: option } : d)}
                                      title={`Set option ${label} as correct answer`}
                                      className={`w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center text-xs font-bold border transition-all ${
                                        isCorrect
                                          ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20'
                                          : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-300 hover:text-emerald-600'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  ) : (
                                    <div className={`w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center text-xs font-bold border ${
                                      isCorrect
                                        ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                                        : 'bg-white text-gray-500 border-gray-200'
                                    }`}>
                                      {label}
                                    </div>
                                  )}

                                  {/* Option Text */}
                                  {editMode && editDraft ? (
                                    <input
                                      type="text"
                                      value={option}
                                      onChange={e => {
                                        const newOptions = [...editDraft.options];
                                        const oldVal = newOptions[index];
                                        newOptions[index] = e.target.value;
                                        // If this was the correct answer, update correctAnswer too
                                        const newCorrect = editDraft.correctAnswer === oldVal ? e.target.value : editDraft.correctAnswer;
                                        setEditDraft(d => d ? { ...d, options: newOptions, correctAnswer: newCorrect } : d);
                                      }}
                                      className={`flex-1 bg-transparent border-0 text-sm font-medium focus:outline-none ${
                                        isCorrect ? 'text-emerald-400' : 'text-gray-300'
                                      } placeholder-gray-600`}
                                      placeholder={`Option ${label}...`}
                                    />
                                  ) : (
                                    <span className={`${isCorrect ? 'text-purple-700 font-semibold' : 'text-gray-600'} text-base flex-1 ${selectedMCQBank?.language === 'Gujarati' ? 'font-gujarati' : ''}`}>
                                      {option}
                                    </span>
                                  )}

                                  {isCorrect && (
                                    <div className={`ml-auto flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                                      editMode ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'
                                    }`}>
                                      <CheckCircle2 className="h-3 w-3" />
                                      {editMode ? 'Correct' : 'Correct Answer'}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {editMode && (
                            <p className="text-[10px] text-gray-500 ml-1">💡 Click a letter badge to mark it as the correct answer. Edit text directly in each row.</p>
                          )}
                        </div>

                        {/* Insights */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-bold text-purple-600 uppercase tracking-[0.2em] flex items-center gap-2 ml-1">
                              <MessageSquare className="h-3 w-3" /> Pedagogical Rationale
                            </h4>
                            <div className="bg-gray-50 p-4 rounded-[24px] border border-gray-100 shadow-inner">
                              {editMode && editDraft ? (
                                <textarea
                                  value={editDraft.explanation}
                                  onChange={e => setEditDraft(d => d ? { ...d, explanation: e.target.value } : d)}
                                  rows={4}
                                  className="w-full bg-transparent border-0 text-sm text-gray-600 leading-relaxed focus:outline-none resize-none placeholder-gray-400"
                                  placeholder="Explanation / rationale for this question..."
                                />
                              ) : (
                                <p className={`text-sm text-gray-600 leading-relaxed ${selectedMCQBank?.language === 'Gujarati' ? 'font-gujarati text-base' : ''}`}>
                                  {selectedMCQ.mcq.explanation || 'No explanation provided for this question unit.'}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2 ml-1">
                              <BookOpen className="h-3 w-3" /> Technical SOP Context
                            </h4>
                            <div className="bg-blue-50 p-4 rounded-[24px] border border-blue-100 shadow-inner italic">
                              <p className={`text-sm text-blue-600 leading-relaxed ${selectedMCQBank?.language === 'Gujarati' ? 'font-gujarati text-base' : ''}`}>
                                &quot;{selectedMCQ.mcq.sopReference || 'Direct reference content is being indexed...'}&quot;
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="pt-4 border-t border-gray-100 flex flex-wrap gap-4">
                          <div className="flex-1 min-w-[180px] flex items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                            <div className={`p-3 rounded-xl ${selectedMCQ.mcq.isChecked ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                              <CheckCircle2 className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Quality Check</p>
                              <p className={`text-sm font-bold ${selectedMCQ.mcq.isChecked ? 'text-emerald-600' : 'text-gray-500'}`}>
                                {selectedMCQ.mcq.isChecked ? 'Successfully Approved' : 'Pending Verification'}
                              </p>
                            </div>
                          </div>
                          <div className="flex-1 min-w-[180px] flex items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                            <div className={`p-3 rounded-xl ${selectedMCQ.mcq.isReviewed ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-400'}`}>
                              <Star className={`h-5 w-5 ${selectedMCQ.mcq.isReviewed ? 'fill-current' : ''}`} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Priority Review</p>
                              <p className={`text-sm font-bold ${selectedMCQ.mcq.isReviewed ? 'text-amber-600' : 'text-gray-500'}`}>
                                {selectedMCQ.mcq.isReviewed ? 'Review Completed' : 'Standard Priority'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        {!editMode && (
                          <div className="pt-2 flex gap-3">
                            <button
                              onClick={() => router.push('/mcq-review')}
                              className="flex-1 px-6 py-4 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 border border-gray-200 group"
                            >
                              <Star className="h-5 w-5 text-amber-400 fill-amber-400 group-hover:scale-110 transition-transform" />
                              <span className="uppercase tracking-widest text-xs">Go to Review Center</span>
                            </button>
                            <button
                              onClick={async () => {
                                if (selectedMCQBank) {
                                  await handleReplaceQuestion(selectedMCQBank._id, selectedMCQ.index, selectedMCQBank.sopId);
                                  setSelectedMCQ(null);
                                }
                              }}
                              disabled={updatingStatus === `${selectedMCQBank?._id}-${selectedMCQ.index}`}
                              className="flex-1 px-6 py-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_10px_30px_rgba(225,29,72,0.3)] group"
                            >
                              {updatingStatus === `${selectedMCQBank?._id}-${selectedMCQ.index}` ? (
                                <><Loader2 className="h-5 w-5 animate-spin" /><span className="uppercase tracking-widest text-xs">Processing Replace...</span></>
                              ) : (
                                <><RefreshCw className="h-5 w-5 group-hover:rotate-180 transition-transform duration-500" /><span className="uppercase tracking-widest text-xs">Delete & Regenerate Question</span></>
                              )}
                            </button>
                          </div>
                        )}
                        {!editMode && (
                          <p className="text-[10px] text-gray-400 text-center font-medium tracking-[0.2em]">
                            Archiving moves this unit to the recycled section and triggers AI re-generation.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
      </div>


      {/* Modals */}
      {/* Smart Regenerate Progress Modal */}
      {smartRegenProgress && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-300">
            {/* Header */}
            <div className="bg-purple-600 border-b border-purple-700 p-6 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center animate-spin">
                  <Loader2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Smart Regenerate</h2>
                  <p className="text-xs text-white/70 mt-1">
                    {smartRegenProgress.phase === 'detecting' && 'Detecting similar questions...'}
                    {smartRegenProgress.phase === 'regenerating' && `Regenerating (Q${smartRegenProgress.currentQuestion})`}
                    {smartRegenProgress.phase === 'complete' && 'Complete!'}
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Found */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Similar Questions Found</span>
                  <span className="text-sm font-bold text-blue-600">{smartRegenProgress.totalFound}</span>
                </div>
              </div>

              {/* Progress Bar */}
              {smartRegenProgress.phase !== 'detecting' && smartRegenProgress.totalFound > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Progress</span>
                    <span className="text-sm font-bold text-purple-600">
                      {smartRegenProgress.totalReplaced + smartRegenProgress.totalFailed}/{smartRegenProgress.totalFound}
                    </span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-600 rounded-full transition-all duration-300"
                      style={{
                        width: smartRegenProgress.totalFound > 0
                          ? `${((smartRegenProgress.totalReplaced + smartRegenProgress.totalFailed) / smartRegenProgress.totalFound) * 100}%`
                          : '0%'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Replaced</div>
                  <div className="text-2xl font-bold text-emerald-700">{smartRegenProgress.totalReplaced}</div>
                </div>

                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                  <div className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-1">Failed</div>
                  <div className="text-2xl font-bold text-rose-700">{smartRegenProgress.totalFailed}</div>
                </div>
              </div>

              {/* Status */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500 text-center">
                  {smartRegenProgress.phase === 'complete' ? (
                    <span>✅ Smart regeneration completed!</span>
                  ) : (
                    <span>
                      <span className="inline-block animate-bounce mr-1">⏳</span>
                      Processing... Do not close this dialog.
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <TrainerUploadModal
        isOpen={showTrainerModal}
        onClose={() => setShowTrainerModal(false)}
        onSuccess={() => fetchTrainerMappings()}
      />

      {/* Dev Mode Password Modal */}
      {showDevModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-5 w-5 text-amber-500" />
              <h2 className="text-gray-800 font-bold text-lg">Dev Mode Unlock</h2>
            </div>
            <p className="text-gray-500 text-sm">
              Enter the password to disable copy &amp; inspect protection for this session.
            </p>
            <div className="relative">
              <input
                type={showDevPassword ? "text" : "password"}
                value={devPassword}
                onChange={(e) => { setDevPassword(e.target.value); setDevPasswordError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleDevUnlock(); if (e.key === "Escape") { setShowDevModal(false); } }}
                placeholder="Enter password"
                autoFocus
                className="w-full bg-white border border-gray-300 text-gray-800 rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 placeholder-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowDevPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
                tabIndex={-1}
              >
                {showDevPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {devPasswordError && (
              <p className="text-red-400 text-xs -mt-2">{devPasswordError}</p>
            )}
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleDevUnlock}
                className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-md text-sm transition-all"
              >
                Unlock
              </button>
              <button
                onClick={() => { setShowDevModal(false); setDevPassword(""); setDevPasswordError(""); }}
                className="flex-1 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-md text-sm transition-all border border-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function MCQBankPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
          <Loader2 className="h-12 w-12 text-purple-600 animate-spin" />
        </div>
      }
    >
      <MCQBankContent />
    </Suspense>
  );
}
