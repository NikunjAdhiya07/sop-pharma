"use client";

import React, { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import Link from "next/link";
import { normalizeDepartmentName } from "@/lib/mcqTreeBuilder";

// Helper function to clean SOP name from folder path
function cleanSOPName(rawName: string, identifier: string): string {
  if (rawName.includes("/")) {
    const segments = rawName.split("/").filter((s) => s.trim());
    const lastSegment = segments[segments.length - 1] || rawName;
    rawName = lastSegment;
  }

  let cleanedName = rawName
    .replace(new RegExp(`^${identifier}[_\\-\\s]*`, "i"), "")
    .trim();

  cleanedName = cleanedName.replace(/_/g, " ");
  return cleanedName || rawName;
}

// Helper to get department theme colors
// Helper to get department theme colors - High Quality Vibrance
const getDeptTheme = (deptName: string) => {
  const name = deptName.toLowerCase();

  if (name.includes("qa"))
    return {
      text: "text-purple-400",
      textHover: "group-hover:text-purple-300",
      bg: "bg-purple-600",
      badge: "bg-purple-500/10 border-purple-500/20 text-purple-400",
      border: "border-purple-600",
      borderHover: "hover:border-purple-400",
      gradient: "from-purple-900/40 via-indigo-900/40 to-[#0a0817]/40",
      subcatBg: "from-purple-900/20 to-purple-800/10",
      icon: "text-purple-500",
      secondary: "text-purple-200",
      button: "bg-purple-600 hover:bg-purple-700 shadow-purple-500/20",
    };

  if (name.includes("qc"))
    return {
      text: "text-blue-400",
      textHover: "group-hover:text-blue-300",
      bg: "bg-blue-600",
      badge: "bg-blue-500/10 border-blue-500/20 text-blue-400",
      border: "border-blue-600",
      borderHover: "hover:border-blue-400",
      gradient: "from-blue-900/40 via-cyan-900/40 to-[#0a0817]/40",
      subcatBg: "from-blue-900/20 to-blue-800/10",
      icon: "text-blue-500",
      secondary: "text-blue-200",
      button: "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20",
    };

  if (name.includes("microbiology"))
    return {
      text: "text-orange-400",
      textHover: "group-hover:text-orange-300",
      bg: "bg-orange-600",
      badge: "bg-orange-500/10 border-orange-500/20 text-orange-400",
      border: "border-orange-600",
      borderHover: "hover:border-orange-400",
      gradient: "from-orange-900/40 via-amber-900/40 to-[#0a0817]/40",
      subcatBg: "from-orange-900/20 to-orange-800/10",
      icon: "text-orange-500",
      secondary: "text-orange-200",
      button: "bg-orange-600 hover:bg-orange-700 shadow-orange-500/20",
    };

  if (name.includes("production"))
    return {
      text: "text-emerald-400",
      textHover: "group-hover:text-emerald-300",
      bg: "bg-emerald-600",
      badge: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      border: "border-emerald-600",
      borderHover: "hover:border-emerald-400",
      gradient: "from-purple-900/40 via-indigo-900/40 to-[#0a0817]/40",
      subcatBg: "from-purple-900/20 to-purple-800/10",
      icon: "text-purple-500",
      secondary: "text-purple-200",
      button: "bg-purple-600 hover:bg-purple-700 shadow-purple-500/20",
    };

  if (name.includes("store"))
    return {
      text: "text-amber-400",
      textHover: "group-hover:text-amber-300",
      bg: "bg-amber-600",
      badge: "bg-amber-500/10 border-amber-500/20 text-amber-400",
      border: "border-amber-600",
      borderHover: "hover:border-amber-400",
      gradient: "from-amber-900/40 via-yellow-900/40 to-[#0a0817]/40",
      subcatBg: "from-amber-900/20 to-amber-800/10",
      icon: "text-amber-500",
      secondary: "text-amber-200",
      button: "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20",
    };

  if (name.includes("engineering"))
    return {
      text: "text-cyan-400",
      textHover: "group-hover:text-cyan-300",
      bg: "bg-cyan-600",
      badge: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      border: "border-cyan-600",
      borderHover: "hover:border-cyan-400",
      gradient: "from-cyan-900/40 via-blue-900/40 to-[#0a0817]/40",
      subcatBg: "from-cyan-900/20 to-cyan-800/10",
      icon: "text-cyan-500",
      secondary: "text-cyan-200",
      button: "bg-cyan-600 hover:bg-cyan-700 shadow-cyan-500/20",
    };

  if (name.includes("personnel") || name.includes("hr"))
    return {
      text: "text-pink-400",
      textHover: "group-hover:text-pink-300",
      bg: "bg-pink-600",
      badge: "bg-pink-500/10 border-pink-500/20 text-pink-400",
      border: "border-pink-600",
      borderHover: "hover:border-pink-400",
      gradient: "from-pink-900/40 via-rose-900/40 to-[#0a0817]/40",
      subcatBg: "from-pink-900/20 to-pink-800/10",
      icon: "text-pink-500",
      secondary: "text-pink-200",
      button: "bg-pink-600 hover:bg-pink-700 shadow-pink-500/20",
    };

  return {
    text: "text-indigo-400",
    textHover: "group-hover:text-indigo-300",
    bg: "bg-indigo-600",
    badge: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
    border: "border-indigo-600",
    borderHover: "hover:border-indigo-400",
    gradient: "from-[#0a0817] to-indigo-950/40",
    subcatBg: "from-[#0a0817]/50 to-indigo-950/20",
    icon: "text-indigo-500",
    secondary: "text-indigo-200",
    button: "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20",
  };
};

interface SOPNode {
  sopId: string;
  sopCode: string;
  sopName: string;
  sopFileUrl: string;
  sopFileType: "pdf" | "docx";
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
}

interface DepartmentNode {
  type: "department";
  name: string;
  icon?: string;
  totalSOPs: number;
  totalQuestions: number;
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
}: MCQTreeViewProps) {
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  // Expansion state is now managed by parent
  const [isUnorganizedExpanded, setIsUnorganizedExpanded] = useState(false);

  // Archived / Removed SOPs state
  const [archivedSOPs, setArchivedSOPs] = useState<any[]>([]);
  const [showArchivedSection, setShowArchivedSection] = useState(false);

  // Generate More state
  const [generatingMore, setGeneratingMore] = useState<Record<string, boolean>>({});
  const [generateMoreResults, setGenerateMoreResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Delete SOP state
  const [deleteModal, setDeleteModal] = useState<{ sopId: string; sopCode: string; sopName: string } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteSOP = async () => {
    if (!deleteModal) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/mcq-bank/delete-sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sopId: deleteModal.sopId, password: deletePassword }),
      });
      const data = await res.json();
      if (data.success) {
        setDeleteModal(null);
        setDeletePassword('');
        window.location.reload();
      } else {
        setDeleteError(data.error || 'Failed to delete');
      }
    } catch {
      setDeleteError('Network error');
    } finally {
      setDeleteLoading(false);
    }
  };

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
      const res = await fetch('/api/mcq-bank/restore-sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sopIdentifier }),
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

  // Fetch archived SOPs on mount
  useEffect(() => {
    const fetchArchived = async () => {
      try {
        const res = await fetch('/api/mcq-bank/archived');
        const data = await res.json();
        if (data.success && data.archivedSOPs) {
          setArchivedSOPs(data.archivedSOPs);
        }
      } catch (err) {
        console.error('Failed to fetch archived SOPs:', err);
      }
    };
    fetchArchived();
  }, []);

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
    setDeptSearchTerm("");
    setDeptQuestions([]);
    setSimilarGroups([]);
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

      {/* Departments Grid - 4 columns for compact view */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredTree.map((dept) => {
          const theme = getDeptTheme(dept.name);

          return (
            <div
              key={dept.name}
              className={`rounded-xl border border-white/5 ${theme.borderHover} bg-gradient-to-br ${theme.subcatBg} transition-all duration-300 transform hover:scale-[1.03] shadow-lg hover:shadow-xl overflow-hidden cursor-pointer group`}
            >
              {/* Department Header */}
              <button
                onClick={() => setFullScreenDept(dept)}
                className={`w-full px-4 py-4 flex flex-col gap-3 bg-transparent transition-all`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg bg-white/5 border border-white/10 ${theme.text}`}
                    >
                      <Folder className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <h3
                        className={`text-base font-bold text-white ${theme.textHover} transition-colors`}
                      >
                        {dept.name}
                      </h3>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <p className="text-[10px] text-gray-400">
                          {dept.subcategories.length} Subcategor
                          {dept.subcategories.length !== 1 ? "ies" : "y"}
                        </p>
                        {(() => {
                          const normalizedKey = normalizeDepartmentName(
                            dept.name,
                          ).toLowerCase();
                          const trainerName =
                            trainerMappings[normalizedKey] ||
                            trainerMappings[dept.name.toLowerCase()] ||
                            trainerMappings[dept.name];
                          if (!trainerName) return null;
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className="h-1 w-1 rounded-full bg-gray-600" />
                              <div
                                className={`px-1.5 py-0.5 rounded border ${theme.badge} text-[8px] font-black uppercase tracking-wider animate-in fade-in zoom-in duration-500`}
                              >
                                <span className="opacity-60 mr-1">
                                  Trainer:
                                </span>
                                {trainerName}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center border border-white/10 ${theme.text}`}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 w-full mt-1">
                  <div className="bg-black/20 rounded-lg p-2 text-left">
                    <p className="text-gray-400 text-[9px] uppercase tracking-wider font-medium mb-0.5">
                      Total SOPs
                    </p>
                    <span className="text-lg font-bold text-white leading-none">
                      {dept.totalSOPs}
                    </span>
                  </div>
                  <div className="bg-black/20 rounded-lg p-2 text-left">
                    <p className="text-gray-400 text-[9px] uppercase tracking-wider font-medium mb-0.5">
                      Questions
                    </p>
                    <span
                      className={`text-lg font-bold leading-none ${theme.text}`}
                    >
                      {dept.totalQuestions}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Removed / Obsolete SOPs Section */}
      {archivedSOPs.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchivedSection(!showArchivedSection)}
            className="w-full flex items-center justify-between px-6 py-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl hover:bg-rose-500/10 transition-all group"
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
                  {archivedSOPs.length} archived SOP{archivedSOPs.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <ChevronRight className={`h-5 w-5 text-rose-400/60 transition-transform duration-300 ${showArchivedSection ? 'rotate-90' : ''}`} />
          </button>

          {showArchivedSection && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
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

      {/* Full-Screen Department Modal - Premium Overhaul */}
      {fullScreenDept &&
        (() => {
          const theme = getDeptTheme(fullScreenDept.name);
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 lg:p-8 animate-in fade-in duration-300">
              {/* Backdrop Click Handler */}
              <div
                className="absolute inset-0 cursor-pointer"
                onClick={() => setFullScreenDept(null)}
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
                                  "bg-gradient-to-r from-purple-600 to-indigo-600 border-white/20 text-white shadow-[0_0_30px_rgba(147,51,234,0.3)]",
                                inactive:
                                  "bg-purple-500/5 border-purple-500/10 text-purple-400 hover:bg-purple-500/10",
                                dot: "bg-purple-400",
                              },
                              {
                                id: "notChecked" as const,
                                label: "Not Checked",
                                count:
                                  (fullScreenDept.totalQuestions || 0) -
                                  stats.checked,
                                active:
                                  "bg-rose-600 border-white/20 text-white shadow-[0_0_30px_rgba(225,29,72,0.3)]",
                                inactive:
                                  "bg-rose-500/5 border-rose-500/10 text-rose-400 hover:bg-rose-500/10",
                                dot: "bg-rose-400",
                              },
                              {
                                id: "similar" as const,
                                label: "Similar",
                                count: stats.similar,
                                active:
                                  "bg-orange-600 border-white/20 text-white shadow-[0_0_30_rgba(234,88,12,0.3)]",
                                inactive:
                                  "bg-orange-500/5 border-orange-500/10 text-orange-400 hover:bg-orange-500/10",
                                dot: "bg-orange-400",
                              },
                              {
                                id: "reviewed" as const,
                                label: "Reviewed",
                                count: stats.reviewed,
                                active:
                                  "bg-indigo-600 border-white/20 text-white shadow-[0_0_30px_rgba(79,70,229,0.3)]",
                                inactive:
                                  "bg-indigo-500/5 border-indigo-500/10 text-indigo-400 hover:bg-indigo-500/10",
                                dot: "bg-indigo-400",
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
                                    <div
                                      className={`w-1.5 h-1.5 rounded-full ${pill.dot} shadow-[0_0_8px_currentColor]`}
                                    />
                                    {pill.label}: {pill.count}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 -mt-4">
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
                          onClick={() => setFullScreenDept(null)}
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
                            sops: deptSearchTerm.trim()
                              ? sub.sops.filter((s) => {
                                const st = deptSearchTerm
                                  .toLowerCase()
                                  .trim();
                                return (
                                  s.sopName.toLowerCase().includes(st) ||
                                  s.sopCode.toLowerCase().includes(st)
                                );
                              })
                              : sub.sops,
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
                                            <div
                                              className={`p-2.5 rounded-xl bg-white/5 text-gray-500 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-all border border-transparent group-hover:border-indigo-500/20`}
                                            >
                                              <FileText className="h-5 w-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <div className="flex flex-col min-w-0">
                                                  <div className="flex items-center gap-1.5">
                                                    <h4 className="text-xs font-black text-white tracking-widest uppercase">
                                                      {sop.sopCode}
                                                    </h4>
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
                                                {(sop.similarCount || 0) >
                                                  0 && (
                                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md border bg-orange-500/10 text-orange-400 border-orange-500/20 uppercase tracking-widest flex items-center gap-1">
                                                      <span className="w-1 h-1 rounded-full bg-orange-400 shadow-[0_0_5px_currentColor]" />
                                                      {sop.similarCount} Similar
                                                    </span>
                                                  )}
                                                {(sop.checkedCount || 0) >
                                                  0 && (
                                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 uppercase tracking-widest flex items-center gap-1">
                                                      <span className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_5px_currentColor]" />
                                                      {sop.checkedCount} Checked
                                                    </span>
                                                  )}
                                                {(sop.reviewedCount || 0) >
                                                  0 && (
                                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md border bg-indigo-500/10 text-indigo-400 border-indigo-500/20 uppercase tracking-widest flex items-center gap-1">
                                                      <span className="w-1 h-1 rounded-full bg-indigo-400 shadow-[0_0_5px_currentColor]" />
                                                      {sop.reviewedCount} Reviewed
                                                    </span>
                                                  )}
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
                                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20 animate-pulse'
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
                                                          window.location.reload();
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
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setDeleteModal({ sopId: sop.sopId, sopCode: sop.sopCode, sopName: sop.sopName });
                                                }}
                                                className="p-1 rounded-md bg-transparent hover:bg-rose-500/10 text-gray-600 hover:text-rose-400 border border-transparent hover:border-rose-500/20 transition-all opacity-0 group-hover:opacity-100"
                                                title={`Delete ${sop.sopCode}`}
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </button>
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
                        const allSOPs = fullScreenDept.subcategories.flatMap((sub) => sub.sops);
                        const filteredSOPs = allSOPs.filter((s) => {
                          const st = deptSearchTerm.toLowerCase().trim();
                          return (
                            s.sopName.toLowerCase().includes(st) ||
                            s.sopCode.toLowerCase().includes(st)
                          );
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
                                        <div className="flex items-center gap-3">
                                          <div className="p-2 rounded-lg bg-white/5 border border-white/5 text-indigo-400 group-hover:bg-indigo-500/10 group-hover:border-indigo-500/20 transition-colors">
                                            <FileText className="h-4 w-4" />
                                          </div>
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
                                                      window.location.reload();
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
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeleteModal({ sopId: sop.sopId, sopCode: sop.sopCode, sopName: sop.sopName });
                                            }}
                                            className="p-1.5 rounded-lg bg-rose-500/0 hover:bg-rose-500/10 text-gray-600 hover:text-rose-400 border border-transparent hover:border-rose-500/20 transition-all opacity-0 group-hover:opacity-100"
                                            title={`Delete ${sop.sopCode}`}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
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
      {/* Delete SOP Password Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setDeleteModal(null); setDeletePassword(''); setDeleteError(''); }}>
          <div
            className="bg-[#1a1625] rounded-2xl border border-white/10 shadow-2xl p-8 w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Delete SOP</h3>
                <p className="text-xs text-gray-400">This action cannot be undone</p>
              </div>
            </div>

            <div className="bg-black/30 rounded-xl border border-white/5 p-4 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{deleteModal.sopCode}</span>
              </div>
              <p className="text-sm text-gray-300 line-clamp-2">{deleteModal.sopName}</p>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Enter Password to Confirm</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && deletePassword) handleDeleteSOP(); }}
                placeholder="Enter admin password..."
                className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500/50 transition-all"
                autoFocus
              />
              {deleteError && (
                <p className="mt-2 text-xs text-rose-400 font-medium flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {deleteError}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => { setDeleteModal(null); setDeletePassword(''); setDeleteError(''); }}
                className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl border border-white/10 text-sm font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSOP}
                disabled={!deletePassword || deleteLoading}
                className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-600/30 disabled:text-rose-400/50 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20"
              >
                {deleteLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
