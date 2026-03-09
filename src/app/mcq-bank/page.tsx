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
  FolderOpen,
  Upload,
  ArrowLeft,
  Grid,
  List,
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
  Table,
  Clock,
  Edit2,
  Save,
  RotateCcw,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import MCQTreeView from "@/components/MCQTreeView";
import TrainerUploadModal from "@/components/TrainerUploadModal";
import TrainingMatrixUploadModal from "@/components/TrainingMatrixUploadModal";
import { useCopyProtection, CopyProtected } from "@/lib/copyProtection";
import { formatSOPDisplayName, cleanSOPName } from "@/lib/sopLibraryHelper";
import { normalizeDepartmentName } from "@/lib/mcqTreeBuilder";

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
}

function MCQBankContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sopIdFromUrl = searchParams.get("sopId");
  const deptFromUrl = searchParams.get("dept");

  const [mcqBanks, setMcqBanks] = useState<MCQBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("All");
  const [selectedMCQBank, setSelectedMCQBank] = useState<MCQBank | null>(null);
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

  // Similarity Check State
  const [checkingSimilarity, setCheckingSimilarity] = useState(false);
  const [fixingAnswers, setFixingAnswers] = useState(false);
  const [similarityResults, setSimilarityResults] = useState<{
    count: number;
    groups: Array<{
      primary: number;
      similar: number[];
    }>;
    summary: string;
  } | null>(null);

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
  const [expandedSubcats, setExpandedSubcats] = useState<Set<string>>(() =>
    loadExpansionState("mcq-tree-expanded-subcats"),
  );
  const [expandedSOPs, setExpandedSOPs] = useState<Set<string>>(() =>
    loadExpansionState("mcq-tree-expanded-sops"),
  );

  // Lifted fullScreenDept — survives re-renders caused by loading/state changes
  // This is the key to correct "Back" navigation from MCQ modal → department view
  const [fullScreenDept, setFullScreenDept] = useState<any>(null);

  // Separate loading state for bank-detail fetches so we don't unmount the tree
  const [loadingBankDetail, setLoadingBankDetail] = useState(false);

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
  const [viewMode, setViewMode] = useState<"grid" | "tree">("tree");
  const [treeData, setTreeData] = useState<any>(null);
  const [loadingTree, setLoadingTree] = useState(false);

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
  const [modalSearchInputVisible, setModalSearchInputVisible] = useState(false);

  // Trainer Assignment State
  const [trainerMappings, setTrainerMappings] = useState<
    Record<string, string>
  >({});
  const [showTrainerModal, setShowTrainerModal] = useState(false);
  const [showMatrixModal, setShowMatrixModal] = useState(false);

  const fetchTrainerMappings = async () => {
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
  const [isMaximized, setIsMaximized] = useState(false);
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

  // Apply copy protection to prevent copying/downloading questions
  useCopyProtection();

  useEffect(() => {
    fetchMCQBanks();
    if (viewMode === "tree") {
      fetchTreeData();
    }
  }, [currentPage, viewMode]);

  const fetchTreeData = async (forceRefresh = false) => {
    try {
      // Only show full loading state if we don't have data yet
      if (!treeData) setLoadingTree(true);

      // Get current user from localStorage for department-based filtering
      const storedUser = localStorage.getItem("user");
      const currentUser = storedUser ? JSON.parse(storedUser) : null;
      const username = currentUser?.username || "";

      // Per-user cache key so restricted users don't see each other's cached data
      const CACHE_KEY = `mcq-tree-cache-v1-${username || "guest"}`;
      const CACHE_TIMESTAMP_KEY = `mcq-tree-cache-timestamp-${username || "guest"}`;
      const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cachedData = localStorage.getItem(CACHE_KEY);
        const cacheTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);

        if (cachedData && cacheTimestamp) {
          const age = Date.now() - parseInt(cacheTimestamp);
          if (age < CACHE_DURATION) {
            const parsed = JSON.parse(cachedData);
            setTreeData(parsed);
            console.log(
              "📦 Using cached tree data (age:",
              Math.floor(age / 1000),
              "seconds)",
            );
            setLoadingTree(false);
            return;
          }
        }
      }

      // Fetch fresh data — pass username so API can apply department restrictions
      const treeUrl = username
        ? `/api/mcq-bank/tree?username=${encodeURIComponent(username)}`
        : "/api/mcq-bank/tree";
      const response = await fetch(treeUrl);
      const data = await response.json();

      if (data.success) {
        setTreeData(data);

        // Cache the data
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());

        console.log("📊 Tree data loaded and cached:", data.stats);
        if (data.userAccess?.isRestricted) {
          console.log(
            "🔒 Department access restricted to:",
            data.userAccess.allowedDepartments,
          );
        }
      }
    } catch (error) {
      console.error("Error fetching tree data:", error);
    } finally {
      setLoadingTree(false);
    }
  };

  // Auto-select MCQ bank when sopId is in URL
  useEffect(() => {
    if (sopIdFromUrl && mcqBanks.length > 0) {
      const matchingBank = mcqBanks.find((bank) => bank.sopId === sopIdFromUrl);
      if (matchingBank) {
        fetchFullBankDetails(matchingBank);
      }
    }
  }, [sopIdFromUrl, mcqBanks]);

  // Auto-open department when dept is in URL
  useEffect(() => {
    if (deptFromUrl && treeData?.tree) {
      const matchingDept = treeData.tree.find(
        (d: any) => d.name === deptFromUrl,
      );
      if (matchingDept) {
        setFullScreenDept(matchingDept);
      }
    }
  }, [deptFromUrl, treeData]);

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

  const fetchFullBankDetails = async (
    bank: MCQBank,
    filter: "all" | "checked" | "pending" | "similar" | "reviewed" = "all",
  ) => {
    setFilterReviewStatus(filter);
    // Reset modal-level search and visible count when opening a new SOP
    setModalSearch("");
    setModalSearchInputVisible(false);
    setVisibleCount(30);
    setSimilarQuestionDetails({});
    // Always fetch latest from DB when opening modal to ensure persistence
    try {
      // Check if we have FULL question data (not just partial status flags)
      // Partial data from tree view only has isChecked/isReviewed, not question/options
      const hasFullData =
        bank.mcqs &&
        bank.mcqs.length > 0 &&
        bank.mcqs[0].question &&
        bank.mcqs[0].options;

      if (hasFullData) {
        setSelectedMCQBank(bank);
        setActiveTab("active"); // Reset to active tab when opening modal
        setSimilarityResults(null); // Clear previous similarity results
        return;
      }

      setLoadingBankDetail(true);
      // Use the ID filter for pinpoint precision
      // timestamp to prevent browser caching
      const response = await fetch(
        `/api/mcq-bank?id=${bank._id}&limit=1&t=${Date.now()}`,
        {
          cache: "no-store",
          headers: {
            Pragma: "no-cache",
            "Cache-Control": "no-cache",
          },
        },
      );
      const data = await response.json();

      if (data.success && data.mcqBanks.length > 0) {
        const fullBank = data.mcqBanks[0];
        setSelectedMCQBank(fullBank);
        setActiveTab("active"); // Reset to active tab
        setSimilarityResults(null); // Clear previous similarity results

        // Fetch similarity details for questions with isSimilar flag
        await fetchSimilarityDetails(fullBank._id);

        // Update the bank in our local list state
        setMcqBanks((prev) =>
          prev.map((b) => (b._id === bank._id ? fullBank : b)),
        );
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
    setSimilarityResults(null);
    setSimilarQuestionDetails({}); // Clear previous details

    try {
      const response = await fetch("/api/similar-questions/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mcqBankId: bank._id,
          sopId: bank.sopId,
          threshold: 50, // Higher threshold to only flag truly similar questions
          scanAllBanks: false, // Only check within this bank
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Build groups showing which questions are similar to each other
        const groups = data.similarities.map((sim: any) => ({
          primary: sim.primaryQuestion.questionIndex,
          similar: sim.similarQuestions.map((sq: any) => sq.questionIndex),
        }));

        // Create a map of question index -> similar question indices
        const detailsMap: Record<number, number[]> = {};
        groups.forEach((group: any) => {
          detailsMap[group.primary] = group.similar;
        });

        console.log("📊 Similarity Details Map:", detailsMap);
        console.log("📊 Groups:", groups);

        setSimilarQuestionDetails(detailsMap);

        // Create a summary string like "Q92 = Q71, Q67, Q2..."
        const summaryParts = groups.slice(0, 3).map((group: any) => {
          const similarList = group.similar
            .slice(0, 3)
            .map((i: number) => `Q${i + 1}`)
            .join(", ");
          const more = group.similar.length > 3 ? "..." : "";
          return `Q${group.primary + 1} = ${similarList}${more}`;
        });
        const moreSummary =
          groups.length > 3 ? ` +${groups.length - 3} more` : "";
        const summary = summaryParts.join("; ") + moreSummary;

        setSimilarityResults({
          count: data.flaggedCount || 0,
          groups,
          summary,
        });

        // DON'T refresh the bank here - it would overwrite our similarity details
        // The isSimilar flags are already updated by the API
        // Just update the local bank state with the new flags
        if (selectedMCQBank) {
          const updatedMcqs = selectedMCQBank.mcqs.map((mcq, idx) => {
            const isFlagged = detailsMap.hasOwnProperty(idx);
            return isFlagged ? { ...mcq, isSimilar: true } : mcq;
          });
          setSelectedMCQBank({ ...selectedMCQBank, mcqs: updatedMcqs });
        }

        if (data.flaggedCount > 0) {
          // Build detailed alert message
          const detailsText = groups
            .slice(0, 10)
            .map((group: any) => {
              const similarList = group.similar
                .map((i: number) => `Q${i + 1}`)
                .join(", ");
              return `Q${group.primary + 1} = ${similarList}`;
            })
            .join("\n");
          const moreText =
            groups.length > 10
              ? `\n... and ${groups.length - 10} more groups`
              : "";

          alert(
            `Found ${data.flaggedCount} question(s) with similarities!\n\n${detailsText}${moreText}`,
          );
        } else {
          alert("No similar questions found in this SOP.");
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

  const fetchSimilarityDetails = async (bankId: string) => {
    try {
      // Fetch all similarity records (we'll filter client-side since API doesn't support mcqBankId filter)
      const response = await fetch(`/api/similar-questions`);
      const data = await response.json();

      if (data.success && data.similarQuestions) {
        // Build a map of question index -> similar question indices
        // Only include records where the primary question is from this bank
        const detailsMap: Record<number, number[]> = {};

        data.similarQuestions.forEach((record: any) => {
          // Check if this record's primary question belongs to the current bank
          if (record.primaryQuestion.mcqBankId === bankId) {
            const primaryIndex = record.primaryQuestion.questionIndex;
            const similarIndices = record.similarQuestions
              .filter((sq: any) => sq.mcqBankId === bankId) // Only show similar questions from same bank
              .map((sq: any) => sq.questionIndex);

            if (similarIndices.length > 0) {
              detailsMap[primaryIndex] = similarIndices;
            }
          }
        });

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
        // Refresh the bank
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

  // Efficient search and filter function
  const filteredAndSortedMCQBanks = (() => {
    // First, filter by search term (case-insensitive)
    const searchLower = searchTerm.toLowerCase().trim();
    let filtered = mcqBanks || [];

    // Apply search filter
    if (searchLower) {
      filtered = filtered.filter((bank) => {
        const nameMatch = (bank.sopName || "")
          .toLowerCase()
          .includes(searchLower);
        const identifierMatch = (bank.sopIdentifier || "")
          .toLowerCase()
          .includes(searchLower);
        const idMatch = (bank.sopId || "").toLowerCase().includes(searchLower);
        return nameMatch || identifierMatch || idMatch;
      });
    }

    // Apply difficulty filter
    if (difficultyFilter !== "All") {
      filtered = filtered.filter((bank) => {
        if (!bank.difficultyDistribution) return false;
        const diffLower =
          difficultyFilter.toLowerCase() as keyof typeof bank.difficultyDistribution;
        return (bank.difficultyDistribution[diffLower] || 0) > 0;
      });
    }

    // Helper for natural sorting (deals with numbers in strings correctly)
    const naturalCompare = (a: string, b: string) => {
      return (a || "").localeCompare(b || "", undefined, {
        numeric: true,
        sensitivity: "base",
      });
    };

    // Then sort the filtered results
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "identifier":
          comparison = naturalCompare(a.sopIdentifier, b.sopIdentifier);
          break;
        case "name":
          // Clean the names of identifier prefixes before comparing for a true "Name" sort
          const cleanA = cleanSOPName(a.sopName, a.sopIdentifier);
          const cleanB = cleanSOPName(b.sopName, b.sopIdentifier);
          comparison = cleanA.localeCompare(cleanB, undefined, {
            sensitivity: "base",
          });
          break;
        case "questions":
          comparison = (a.totalQuestions || 0) - (b.totalQuestions || 0);
          break;
        case "date":
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return sorted;
  })();

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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-2 md:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Navigation - only show if not viewing from SOP Library */}
        {!sopIdFromUrl && <PageHeader />}

        {/* Header */}
        <div className="mb-4">
          {/* Back button when viewing from SOP Library */}
          {sopIdFromUrl && selectedMCQBank && (
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-gray-300 hover:text-white mb-2 transition-colors text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to SOP Library
            </button>
          )}

          <div className="flex items-center justify-between mb-3">
            <div className="flex-1 text-left">
              <h1 className="text-2xl font-bold text-white mb-1 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
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
              <div className="text-gray-300 text-sm">
                {sopIdFromUrl && selectedMCQBank ? (
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-gray-300 tracking-tighter text-xs">
                      {selectedMCQBank.sopIdentifier} -{" "}
                      {selectedMCQBank.totalQuestions} questions available
                    </span>
                    {selectedMCQBank.department &&
                      trainerMappings[
                      normalizeDepartmentName(
                        selectedMCQBank.department,
                      ).toLowerCase()
                      ] && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded-full">
                          <Users className="h-3 w-3 text-purple-400" />
                          <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">
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
            {!sopIdFromUrl && (
              <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
                <button
                  onClick={() => fetchTreeData(true)}
                  disabled={loadingTree}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-md hover:from-green-700 hover:to-emerald-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  title="Refresh MCQ Bank data and clear cache"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${loadingTree ? "animate-spin" : ""}`}
                  />
                  {loadingTree ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  onClick={() => (window.location.href = "/similar-questions")}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-orange-600 to-red-600 text-white font-semibold rounded-md hover:from-orange-700 hover:to-red-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-sm whitespace-nowrap"
                  title="Review similar/duplicate questions"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Similar Questions
                </button>

                <button
                  onClick={() => (window.location.href = "/sop-upload")}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-md hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-sm whitespace-nowrap"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload SOP
                </button>

              </div>
            )}
          </div>
        </div>

        <TrainingMatrixUploadModal
          isOpen={showMatrixModal}
          onClose={() => setShowMatrixModal(false)}
        />

        {/* Search, Filter, and Sort */}
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-3 shadow-md border border-white/20 mb-4">
          <div className="flex flex-col gap-2">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by SOP name, identifier, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-transparent transition-all"
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
                      : "bg-white/10 text-gray-300 hover:bg-white/20"
                      }`}
                  >
                    {difficulty}
                  </button>
                ))}
              </div>

              {/* Sort Options */}
              <div className="flex gap-2 items-center">
                <span className="text-gray-300 text-xs font-semibold">
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
                        : "bg-white/10 text-gray-300 hover:bg-white/20"
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

        {/* View Mode Toggle */}
        {!sopIdFromUrl && (
          <div className="flex justify-end mb-4">
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-1 border border-white/20 inline-flex">
              <button
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all ${viewMode === "grid"
                  ? "bg-purple-600 text-white"
                  : "text-gray-300 hover:text-white"
                  }`}
              >
                <Table className="h-4 w-4" />
                Table View
              </button>
              <button
                onClick={() => setViewMode("tree")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all ${viewMode === "tree"
                  ? "bg-purple-600 text-white"
                  : "text-gray-300 hover:text-white"
                  }`}
              >
                <List className="h-4 w-4" />
                Folder View
              </button>
            </div>
          </div>
        )}

        {/* Tree View */}
        {viewMode === "tree" && !sopIdFromUrl ? (
          loadingTree ? (
            <div className="text-center py-16">
              <Loader2 className="h-12 w-12 text-purple-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-400 text-xl">
                Loading folder structure...
              </p>
            </div>
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
              onViewMCQs={(sopNode, filterStatus = "all") => {
                // Find the first MCQ bank for this SOP
                if (sopNode.mcqBanks && sopNode.mcqBanks.length > 0) {
                  fetchFullBankDetails(sopNode.mcqBanks[0], filterStatus);
                }
              }}
              onDownloadSOP={(sopNode) => {
                // Open SOP file in new tab
                if (sopNode.sopFileUrl) {
                  window.open(sopNode.sopFileUrl, "_blank");
                }
              }}
            />
          ) : (
            <div className="text-center py-16">
              <BookOpen className="h-16 w-16 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 text-xl">No tree data available</p>
            </div>
          )
        ) : (
          <>
            {/* MCQ Banks Grid */}
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
                    onClick={() => setSearchTerm("")}
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
                            <span className="text-xs font-bold text-white line-clamp-2" title={formatSOPDisplayName(bank.sopName, bank.sopIdentifier)}>
                              {formatSOPDisplayName(bank.sopName, bank.sopIdentifier)}
                            </span>
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

        {/* Pagination and Summary */}
        {filteredAndSortedMCQBanks.length > 0 && (
          <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20">
            <div className="flex items-center justify-between">
              <div className="text-gray-300">
                Showing{" "}
                <span className="text-white font-semibold">
                  {filteredAndSortedMCQBanks.length}
                </span>{" "}
                of{" "}
                <span className="text-white font-semibold">{totalBanks}</span>{" "}
                MCQ Bank(s)
                {searchTerm && (
                  <span className="ml-2 text-purple-300">(filtered)</span>
                )}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Previous
                  </button>

                  <div className="flex items-center gap-2">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-10 h-10 rounded-lg font-semibold transition-all ${currentPage === pageNum
                            ? "bg-purple-600 text-white"
                            : "bg-white/10 text-gray-300 hover:bg-white/20"
                            }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MCQ Bank Detail Modal - Redesigned */}
        {selectedMCQBank &&
          (() => {
            // Compute filtered questions inside the render block
            const allMcqs = selectedMCQBank.mcqs || [];
            const searchLower = modalSearch.trim().toLowerCase();
            let filtered = allMcqs.filter((mcq, idx) => {
              if (
                difficultyFilter !== "All" &&
                mcq.difficulty !== difficultyFilter
              )
                return false;
              if (filterReviewStatus === "checked" && !mcq.isChecked)
                return false;
              if (filterReviewStatus === "pending" && (mcq.isChecked || mcq.isReviewed))
                return false;
              if (filterReviewStatus === "similar" && !mcq.isSimilar)
                return false;
              if (filterReviewStatus === "reviewed" && !mcq.isReviewed)
                return false;
              if (searchLower) {
                const qText = (mcq.question || "").toLowerCase();
                const opts = (mcq.options || []).join(" ").toLowerCase();
                const ref = (mcq.sopReference || "").toLowerCase();
                if (
                  !qText.includes(searchLower) &&
                  !opts.includes(searchLower) &&
                  !ref.includes(searchLower)
                )
                  return false;
              }
              return true;
            });

            // Deduplicate questions by text in All view
            if (filterReviewStatus === "all") {
              const seen = new Set<string>();
              const deduped: typeof filtered = [];
              for (const mcq of filtered) {
                const key = (mcq.question || "").trim().toLowerCase();
                if (!seen.has(key)) {
                  seen.add(key);
                  deduped.push(mcq);
                }
              }
              filtered = deduped;
            }

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
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
                <div
                  className={`bg-[#0f0d1e] border border-indigo-500/20 shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${isMaximized
                    ? "w-full h-full rounded-none"
                    : "w-full max-w-[1400px] h-[90vh] rounded-[28px]"
                    }`}
                >
                  {/* ── PREMIUM STICKY HEADER ── */}
                  <div className="sticky top-0 z-20 bg-[#13102a]/95 border-b border-indigo-500/10 flex-shrink-0 backdrop-blur-xl">
                    {/* Brand / Navigation Row */}
                    <div className="flex items-center justify-between px-6 py-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <button
                          onClick={() => setSelectedMCQBank(null)}
                          className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-white/5"
                        >
                          <ArrowLeft className="h-5 w-5" />
                        </button>

                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-[10px] font-bold tracking-widest text-[#8B5CF6] uppercase">
                              SOP Identifier
                            </span>
                            <span className="h-1 w-1 rounded-full bg-gray-600" />
                            <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                              {selectedMCQBank.language || "English"} Version
                            </span>
                            {selectedMCQBank.department &&
                              trainerMappings[
                              normalizeDepartmentName(
                                selectedMCQBank.department,
                              ).toLowerCase()
                              ] && (
                                <>
                                  <span className="h-1 w-1 rounded-full bg-gray-600" />
                                  <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider flex items-center gap-1.5 bg-purple-500/10 px-2 py-0.5 rounded-lg border border-purple-500/20 shadow-sm animate-in fade-in slide-in-from-left-2 duration-1000">
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
                            <h2 className="text-xl font-bold text-gray-100 truncate flex-shrink-0 max-w-[200px] lg:max-w-md">
                              {cleanSOPName(
                                selectedMCQBank.sopName,
                                selectedMCQBank.sopIdentifier,
                              )}
                            </h2>
                            <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-xs font-bold font-mono">
                              {selectedMCQBank.sopIdentifier}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                          <div className="flex -space-x-1.5">
                            {[1, 2, 3].map((i) => (
                              <div
                                key={i}
                                className="w-5 h-5 rounded-full border-2 border-slate-700 bg-gradient-to-br from-indigo-500 to-purple-500 text-[8px] flex items-center justify-center text-white font-bold"
                              >
                                {i}
                              </div>
                            ))}
                          </div>
                          <span className="text-[11px] text-gray-400 ml-1 font-medium">
                            {filtered.length} Indexed MCQs
                          </span>
                        </div>

                        <div className="h-8 w-px bg-white/5 mx-2" />

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setModalSearchInputVisible((v) => !v);
                              if (modalSearchInputVisible) setModalSearch("");
                            }}
                            className={`p-2 rounded-xl transition-all ${modalSearchInputVisible || modalSearch ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"}`}
                          >
                            <Search className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() =>
                              handleCheckSimilarityForSOP(selectedMCQBank)
                            }
                            disabled={checkingSimilarity}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-all border border-amber-500/20 hover:border-amber-500/30 disabled:opacity-50 text-xs font-bold uppercase tracking-wider"
                          >
                            {checkingSimilarity ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                            <span className="hidden sm:inline">
                              {checkingSimilarity
                                ? "Checking..."
                                : "Check Similar"}
                            </span>
                          </button>
                          {/* Reset & Regenerate: auto-fix content + delete bank + regenerate */}
                          <button
                            onClick={async () => {
                              if (!selectedMCQBank || fixingAnswers) return;
                              if (!confirm(
                                `⚠️ Reset & Regenerate "${selectedMCQBank.sopIdentifier}"?\n\n` +
                                `This will DELETE all ${selectedMCQBank.mcqs?.length || 0} existing questions and generate 100 fresh ones.\n\n` +
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
                                setSelectedMCQBank(null);
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
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-all border border-rose-500/20 hover:border-rose-500/30 disabled:opacity-50 text-xs font-bold uppercase tracking-wider"
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
                            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all border border-transparent"
                            title={isMaximized ? "Restore down" : "Maximize"}
                          >
                            {isMaximized ? (
                              <Minimize2 className="h-5 w-5" />
                            ) : (
                              <Maximize2 className="h-5 w-5" />
                            )}
                          </button>
                          <button
                            onClick={() => setSelectedMCQBank(null)}
                            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#FE4A49]/10 hover:text-[#FE4A49] transition-all border border-transparent hover:border-[#FE4A49]/20"
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
                            value={modalSearch}
                            onChange={(e) => {
                              setModalSearch(e.target.value);
                              setVisibleCount(30);
                            }}
                            className="w-full pl-11 pr-12 py-3 bg-indigo-950/20 border border-indigo-500/30 rounded-2xl text-sm text-gray-100 placeholder-indigo-300/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 hover:border-indigo-500/50 transition-all shadow-inner"
                          />
                          {modalSearch && (
                            <button
                              onClick={() => setModalSearch("")}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white bg-white/5 rounded-md"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Navigation & Status Filter */}
                      <div className="flex items-center justify-between gap-4">
                        <nav className="flex items-center gap-1.5 p-1.5 bg-indigo-950/30 border border-indigo-500/10 rounded-2xl shadow-inner">
                          <button
                            onClick={() => {
                              setActiveTab("active");
                              setVisibleCount(30);
                            }}
                            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "active" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`}
                          >
                            <Grid className="h-4 w-4" />
                            Active ({selectedMCQBank.mcqs?.length ?? 0})
                          </button>
                          <button
                            onClick={() => {
                              setActiveTab("recycled");
                              if (selectedMCQBank?.sopId)
                                fetchRecycledQuestions(selectedMCQBank.sopId);
                            }}
                            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "recycled" ? "bg-gradient-to-r from-rose-600 to-orange-600 text-white shadow-lg shadow-rose-500/20" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`}
                          >
                            <Trash2 className="h-4 w-4" />
                            Recycled{" "}
                            {recycledQuestions.length > 0
                              ? `(${recycledQuestions.length})`
                              : ""}
                          </button>
                        </nav>

                        {activeTab === "active" && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest hidden sm:inline mr-1">
                              Status Filter
                            </span>
                            <div className="flex p-1 bg-indigo-950/30 border border-indigo-500/10 rounded-xl gap-1 shadow-inner">
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
                                    ? `bg-white/5 border-white/10 ${pill.activeClass}`
                                    : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5"
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
                    className="flex-1 overflow-y-auto custom-scrollbar bg-[#0f0d1e] relative w-full px-6"
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
                    <div className="px-6 py-6 border-x border-white/5">
                      {activeTab === "active" ? (
                        allMcqs.length > 0 ? (
                          filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                              <div className="w-20 h-20 bg-slate-800/40 border border-white/10 rounded-3xl flex items-center justify-center mb-6 shadow-2xl">
                                <Search className="h-8 w-8 text-indigo-400/40" />
                              </div>
                              <h3 className="text-xl font-bold text-gray-200 mb-2">
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
                                  className="mt-6 px-4 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl hover:bg-indigo-500/20 transition-all font-bold text-xs uppercase tracking-wider"
                                >
                                  Clear search query
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 p-4">
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
                                      className="group relative bg-[#1a1535] rounded-2xl border border-indigo-500/10 hover:border-indigo-500/25 transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-indigo-500/10 overflow-hidden min-w-0"
                                      onClick={() =>
                                        setSelectedMCQ({
                                          mcq,
                                          index: originalIndex,
                                        })
                                      }
                                    >
                                      {/* Interactive Accent Glow */}
                                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                                      {/* Card Content Wrapper */}
                                      <div className="relative flex flex-col sm:flex-row items-stretch min-h-[100px]">
                                        {/* Sidebar: Navigation Meta */}
                                        <div className="flex sm:flex-col items-center justify-between sm:justify-start w-full sm:w-12 p-3 gap-2 bg-white/[0.02] border-b sm:border-b-0 sm:border-r border-white/5">
                                          <div className="flex flex-col items-center gap-1">
                                            <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest font-mono">
                                              Index
                                            </span>
                                            <div className="w-7 h-7 flex items-center justify-center bg-[#1a1625] border border-white/10 rounded-lg text-[10px] font-mono font-bold text-indigo-300 shadow-inner group-hover:border-indigo-500/30 transition-colors">
                                              {originalIndex + 1}
                                            </div>
                                          </div>

                                          <div className="h-px w-6 bg-white/5 hidden sm:block" />

                                          <div className="flex flex-col items-center gap-1">
                                            <span className="text-sm leading-none group-hover:scale-110 transition-transform duration-300 transform-gpu">
                                              {mcq.aiIcon}
                                            </span>
                                          </div>
                                        </div>

                                        {/* Main Interaction Area */}
                                        <div className="flex-1 flex flex-col p-3 min-w-0">
                                          {/* Top Meta Area */}
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span
                                                className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider border ${mcq.difficulty === "Easy"
                                                  ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
                                                  : mcq.difficulty ===
                                                    "Medium"
                                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                                  }`}
                                              >
                                                {mcq.difficulty}
                                              </span>
                                              {selectedMCQBank.language ===
                                                "Gujarati" && (
                                                  <span className="px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[9px] font-bold uppercase tracking-wider">
                                                    GUJ
                                                  </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                              <div className="flex items-center gap-1">
                                                {mcq.isSimilar && (
                                                  <div
                                                    className="p-1 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                                    title="Flagged as Similar"
                                                  >
                                                    <Copy className="h-3 w-3" />
                                                  </div>
                                                )}
                                                {mcq.isChecked && (
                                                  <div
                                                    className="p-1 rounded-md bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                                    title="Approved Status"
                                                  >
                                                    <CheckCircle2 className="h-3 w-3" />
                                                  </div>
                                                )}
                                                {mcq.isReviewed && (
                                                  <div
                                                    className="p-1 rounded-md bg-blue-500/10 text-blue-500 border border-blue-500/20"
                                                    title="Review Completed"
                                                  >
                                                    <Star className="h-3 w-3 fill-current" />
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Question Text */}
                                          <div className="mb-2 min-w-0">
                                            <div className="flex items-start gap-2 min-w-0">
                                              <span className="text-indigo-400 text-xs font-bold mt-0.5 select-none shrink-0">
                                                Q.
                                              </span>
                                              <h3
                                                className={`text-sm font-semibold leading-snug tracking-tight text-gray-100 flex-1 min-w-0 break-words ${selectedMCQBank?.language === "Gujarati" ? "font-gujarati text-base" : ""}`}
                                              >
                                                {searchLower
                                                  ? highlight(mcq.question)
                                                  : mcq.question}
                                              </h3>
                                            </div>
                                          </div>

                                          {/* Options Preview (Subtle grid) */}
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 mt-auto">
                                            {(mcq.options || [])
                                              .slice(0, 4)
                                              .map((opt, oi) => {
                                                const isCorrect =
                                                  opt === mcq.correctAnswer;
                                                return (
                                                  <div
                                                    key={oi}
                                                    className={`flex items-start gap-2 p-1.5 rounded-lg transition-all border ${isCorrect
                                                      ? "bg-purple-500/10 border-purple-500/20 text-purple-200"
                                                      : "bg-[#1a1625]/50 border-white/5 text-gray-400 group-hover:bg-[#1a1625] group-hover:border-white/10"
                                                      }`}
                                                  >
                                                    <span
                                                      className={`w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-md text-[8px] font-bold border ${isCorrect
                                                        ? "bg-purple-500/20 border-purple-500/30 text-purple-300"
                                                        : "bg-white/5 border-white/5 text-gray-500"
                                                        }`}
                                                    >
                                                      {String.fromCharCode(
                                                        65 + oi,
                                                      )}
                                                    </span>
                                                    <span
                                                      className={`text-[10px] flex-1 min-w-0 break-words ${selectedMCQBank?.language === "Gujarati" ? "font-gujarati text-xs" : ""}`}
                                                    >
                                                      {searchLower
                                                        ? highlight(opt)
                                                        : opt}
                                                    </span>
                                                    {isCorrect && (
                                                      <CheckCircle2 className="h-3 w-3 ml-auto text-purple-500" />
                                                    )}
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

                                        {/* Action Toolbar on Hover */}
                                        <div
                                          className="flex flex-col items-center justify-center gap-2 w-full sm:w-12 p-2 bg-indigo-600/5 sm:border-l border-t sm:border-t-0 border-white/5 opacity-0 group-hover:opacity-100 transition-all duration-300 transform sm:translate-x-full group-hover:translate-x-0 group-hover:bg-indigo-600/10"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {/* Similar */}
                                          <button
                                            disabled={isUpdating}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleSimilar(
                                                selectedMCQBank,
                                                originalIndex,
                                                mcq,
                                              );
                                            }}
                                            className={`p-2 rounded-xl transition-all ${mcq.isSimilar ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30" : "bg-white/5 text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/20 border border-transparent"}`}
                                          >
                                            {isUpdating ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <Copy className="h-4 w-4" />
                                            )}
                                          </button>
                                          {/* Check/Approve */}
                                          <button
                                            disabled={isUpdating}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleChecked(
                                                selectedMCQBank._id,
                                                originalIndex,
                                                !!mcq.isChecked,
                                              );
                                            }}
                                            className={`p-2 rounded-xl transition-all ${mcq.isChecked ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30" : "bg-white/5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/20 border border-transparent"}`}
                                          >
                                            {isUpdating ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <CheckCircle2 className="h-4 w-4" />
                                            )}
                                          </button>
                                          {/* Star/Review */}
                                          <button
                                            disabled={isUpdating}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleReview(
                                                selectedMCQBank,
                                                originalIndex,
                                                mcq,
                                              );
                                            }}
                                            className={`p-2 rounded-xl transition-all ${mcq.isReviewed ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30" : "bg-white/5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/20 border border-transparent"}`}
                                          >
                                            {isUpdating ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <Star
                                                className={`h-4 w-4 ${mcq.isReviewed ? "fill-current" : ""}`}
                                              />
                                            )}
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
                            <div className="w-20 h-20 bg-[#131722] border border-white/5 rounded-3xl flex items-center justify-center mb-6">
                              <FileText className="h-8 w-8 text-gray-600" />
                            </div>
                            <p className="text-gray-500 uppercase tracking-widest text-[10px] font-bold">
                              Catalogue Empty
                            </p>
                            <h3 className="text-xl font-bold text-gray-200 mt-2">
                              No active questions found
                            </h3>
                          </div>
                        )
                      ) : (
                        <div className="space-y-4">
                          {loadingRecycled ? (
                            <div className="flex flex-col items-center justify-center py-24">
                              <Loader2 className="h-10 w-10 animate-spin text-indigo-500/40" />
                              <p className="text-gray-500 text-xs mt-4 uppercase tracking-widest font-bold">
                                Querying Archive...
                              </p>
                            </div>
                          ) : recycledQuestions.length > 0 ? (
                            <div className="grid grid-cols-1 gap-4">
                              {recycledQuestions.map((elim, i) => (
                                <div
                                  key={i}
                                  className="group bg-[#0E121B] rounded-[24px] p-6 border border-rose-500/10 hover:border-rose-500/30 transition-all opacity-80 hover:opacity-100"
                                >
                                  <div className="flex items-start gap-5">
                                    <div className="flex flex-col items-center gap-1.5">
                                      <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-inner">
                                        <Trash2 className="h-5 w-5" />
                                      </div>
                                      <span className="text-[10px] font-bold font-mono text-gray-500">
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
                                        <span className="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20 text-[10px] font-bold uppercase tracking-wider">
                                          Archived:{" "}
                                          {new Date(
                                            elim.eliminatedAt,
                                          ).toLocaleDateString()}
                                        </span>
                                        {(elim as any).eliminatedBy &&
                                          (elim as any).eliminatedBy !==
                                          "Unknown User" && (
                                            <span className="px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold uppercase tracking-wider">
                                              Actor:{" "}
                                              {(elim as any).eliminatedBy}
                                            </span>
                                          )}
                                        <span className="px-2 py-0.5 rounded-lg bg-indigo-950/40 text-indigo-400/60 border border-indigo-500/10 text-[10px] font-bold uppercase tracking-wider">
                                          {elim.eliminationReason === "manual"
                                            ? "Manual Delete"
                                            : elim.eliminationReason}
                                        </span>
                                      </div>

                                      <h3 className="text-lg font-semibold text-indigo-300/40 mb-4 line-through decoration-rose-500/40 leading-relaxed italic">
                                        {elim.question.question}
                                      </h3>

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-4 border-l-2 border-indigo-500/10">
                                        {elim.question.options?.map(
                                          (opt: string, idx: number) => (
                                            <div
                                              key={idx}
                                              className={`text-xs p-2.5 rounded-xl border ${opt === elim.question.correctAnswer ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "text-indigo-400/40 bg-indigo-950/20 border-transparent"}`}
                                            >
                                              <span className="font-bold mr-2 text-[10px] underline decoration-indigo-500/20">
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
                              <div className="w-20 h-20 bg-indigo-950/40 border border-indigo-500/20 rounded-3xl flex items-center justify-center mb-6">
                                <X className="h-8 w-8 text-indigo-400/40" />
                              </div>
                              <p className="text-indigo-400/30 uppercase tracking-widest text-[10px] font-bold">
                                Archive Integrity verified
                              </p>
                              <h3 className="text-xl font-bold text-indigo-300/40 mt-2">
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
                    <div className="p-6 bg-[#13102a] border-t border-indigo-500/10 flex items-center justify-center w-full">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                          Displaying {visibleCount} of {filtered.length} units
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          setVisibleCount((v) =>
                            Math.min(v + 30, filtered.length),
                          )
                        }
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-950/40 border border-indigo-500/20 rounded-2xl text-indigo-300 hover:text-white hover:bg-indigo-600/20 hover:border-indigo-500/40 transition-all font-bold text-xs uppercase tracking-widest shadow-lg"
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

            const hasSimilar = relatedIndices.length > 0;
            const similarIndices = relatedIndices;
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
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                          {label || "Question"}
                        </p>
                        <p className="text-xs font-bold text-white">
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
                    className={`text-sm font-semibold text-gray-100 leading-relaxed ${selectedMCQBank?.language === "Gujarati" ? "font-gujarati text-base" : ""}`}
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
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                            : "bg-white/5 border-white/5 text-gray-400"
                            }`}
                        >
                          <span
                            className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-md text-[9px] font-bold border ${isCorrect
                              ? "bg-emerald-500/30 border-emerald-500/40 text-emerald-300"
                              : "bg-white/5 border-white/10 text-gray-500"
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
                    <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-3 space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-blue-400/70 flex items-center gap-1">
                        <BookOpen className="h-2.5 w-2.5" /> SOP Source Line
                      </p>
                      <p className="text-[10px] text-blue-300/80 leading-relaxed italic line-clamp-3">
                        &quot;{mcq.sopReference}&quot;
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 mt-auto">
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
                          : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-200"
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
                  className={`bg-[#0f0d1e] rounded-[28px] ${hasSimilar ? "max-w-6xl" : "max-w-3xl"} w-full max-h-[92vh] flex flex-col border border-indigo-500/15 shadow-2xl shadow-black/60 overflow-hidden`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 px-6 py-4 flex-shrink-0 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
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
                        className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all border border-white/10 shadow-inner"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {hasSimilar ? (
                      /* ── SIDE-BY-SIDE COMPARISON VIEW ── */
                      <div className="space-y-5">
                        <div className="flex items-center gap-3 px-1">
                          <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b]" />
                          <p className="text-sm text-gray-300">
                            <span className="font-bold text-white">
                              Q#{selectedMCQ.index + 1}
                            </span>{" "}
                            has been flagged as similar to{" "}
                            <span className="font-bold text-amber-400">
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
                            "bg-indigo-500/5 border-indigo-500/20",
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
                                  "bg-amber-500/5 border-amber-500/20",
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Quick Link */}
                        <div className="flex items-center justify-center pt-4 border-t border-white/5">
                          <button
                            onClick={() => {
                              setSelectedMCQ(null);
                              router.push("/mcq-review");
                            }}
                            className="flex items-center gap-3 px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold transition-all border border-white/10 text-xs uppercase tracking-widest"
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
                            <span className="text-4xl">{selectedMCQ.mcq.aiIcon}</span>
                            <span className={`px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-widest border ${getDifficultyColor(selectedMCQ.mcq.difficulty)}`}>
                              {selectedMCQ.mcq.difficultyStars} {selectedMCQ.mcq.difficulty}
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
                              className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 hover:border-indigo-500/40 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              Edit Question
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => { setEditMode(false); setEditDraft(null); }}
                                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
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
                          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">Question</h4>
                          {editMode && editDraft ? (
                            <textarea
                              value={editDraft.question}
                              onChange={e => setEditDraft(d => d ? { ...d, question: e.target.value } : d)}
                              rows={3}
                              className="w-full bg-indigo-500/5 border border-indigo-500/30 rounded-2xl p-4 text-white text-base font-medium leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none placeholder-gray-600 transition-all"
                              placeholder="Enter the question text..."
                            />
                          ) : (
                            <h3 className={`text-2xl font-bold text-gray-100 leading-tight tracking-tight ${selectedMCQBank?.language === 'Gujarati' ? 'font-gujarati' : ''}`}>
                              {selectedMCQ.mcq.question}
                            </h3>
                          )}
                        </div>

                        {/* Options */}
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">
                            {editMode ? 'Edit Options & Select Correct Answer' : 'Proposed Options'}
                          </h4>
                          <div className="space-y-2.5">
                            {(editMode && editDraft ? editDraft.options : selectedMCQ.mcq.options).map((option, index) => {
                              const label = String.fromCharCode(65 + index);
                              const isCorrect = editMode && editDraft
                                ? editDraft.correctAnswer === option || editDraft.correctAnswer === label
                                : option === selectedMCQ.mcq.correctAnswer;
                              return (
                                <div
                                  key={index}
                                  className={`group p-3 rounded-2xl flex items-center gap-3 transition-all border ${
                                    isCorrect
                                      ? 'bg-emerald-600/10 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.08)]'
                                      : 'bg-white/5 border-white/5 hover:border-white/10'
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
                                          : 'bg-slate-900 text-gray-500 border-white/5 hover:border-emerald-500/30 hover:text-emerald-400'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  ) : (
                                    <div className={`w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center text-xs font-bold border ${
                                      isCorrect
                                        ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white border-purple-400 shadow-lg'
                                        : 'bg-slate-900 text-gray-500 border-white/5'
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
                                    <span className={`${isCorrect ? 'text-purple-400 font-semibold' : 'text-gray-400'} text-base flex-1 ${selectedMCQBank?.language === 'Gujarati' ? 'font-gujarati' : ''}`}>
                                      {option}
                                    </span>
                                  )}

                                  {isCorrect && (
                                    <div className={`ml-auto flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                                      editMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'
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
                            <h4 className="text-[10px] font-bold text-[#8B5CF6] uppercase tracking-[0.2em] flex items-center gap-2 ml-1">
                              <MessageSquare className="h-3 w-3" /> Pedagogical Rationale
                            </h4>
                            <div className="bg-slate-800/30 p-4 rounded-[24px] border border-white/5 shadow-inner">
                              {editMode && editDraft ? (
                                <textarea
                                  value={editDraft.explanation}
                                  onChange={e => setEditDraft(d => d ? { ...d, explanation: e.target.value } : d)}
                                  rows={4}
                                  className="w-full bg-transparent border-0 text-sm text-gray-400 leading-relaxed focus:outline-none resize-none placeholder-gray-600"
                                  placeholder="Explanation / rationale for this question..."
                                />
                              ) : (
                                <p className={`text-sm text-gray-400 leading-relaxed ${selectedMCQBank?.language === 'Gujarati' ? 'font-gujarati text-base' : ''}`}>
                                  {selectedMCQ.mcq.explanation || 'No explanation provided for this question unit.'}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2 ml-1">
                              <BookOpen className="h-3 w-3" /> Technical SOP Context
                            </h4>
                            <div className="bg-slate-800/30 p-4 rounded-[24px] border border-white/5 shadow-inner italic">
                              <p className={`text-sm text-blue-400/80 leading-relaxed ${selectedMCQBank?.language === 'Gujarati' ? 'font-gujarati text-base' : ''}`}>
                                &quot;{selectedMCQ.mcq.sopReference || 'Direct reference content is being indexed...'}&quot;
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="pt-4 border-t border-white/5 flex flex-wrap gap-4">
                          <div className="flex-1 min-w-[180px] flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                            <div className={`p-3 rounded-xl ${selectedMCQ.mcq.isChecked ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/10 text-gray-500'}`}>
                              <CheckCircle2 className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Quality Check</p>
                              <p className={`text-sm font-bold ${selectedMCQ.mcq.isChecked ? 'text-emerald-400' : 'text-gray-400'}`}>
                                {selectedMCQ.mcq.isChecked ? 'Successfully Approved' : 'Pending Verification'}
                              </p>
                            </div>
                          </div>
                          <div className="flex-1 min-w-[180px] flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                            <div className={`p-3 rounded-xl ${selectedMCQ.mcq.isReviewed ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/10 text-gray-500'}`}>
                              <Star className={`h-5 w-5 ${selectedMCQ.mcq.isReviewed ? 'fill-current' : ''}`} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Priority Review</p>
                              <p className={`text-sm font-bold ${selectedMCQ.mcq.isReviewed ? 'text-amber-400' : 'text-gray-400'}`}>
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
                              className="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-3 border border-white/10 group"
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
                          <p className="text-[10px] text-gray-500 text-center font-medium uppercase tracking-[0.2em]">
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

      {/* Non-blocking loading overlay for bank detail fetch — tree stays mounted */}
      {loadingBankDetail && (
        <div className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm flex items-center justify-center pointer-events-all">
          <div className="flex flex-col items-center gap-3 bg-[#0f1117] border border-white/10 rounded-2xl px-8 py-6 shadow-2xl">
            <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
            <p className="text-gray-300 text-sm font-medium">
              Loading questions...
            </p>
          </div>
        </div>
      )}

      {/* Modals */}
      <TrainerUploadModal 
        isOpen={showTrainerModal} 
        onClose={() => setShowTrainerModal(false)}
        onSuccess={() => fetchTrainerMappings()}
      />

    </div>
  );
}

export default function MCQBankPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
          <Loader2 className="h-12 w-12 text-purple-400 animate-spin" />
        </div>
      }
    >
      <MCQBankContent />
    </Suspense>
  );
}
