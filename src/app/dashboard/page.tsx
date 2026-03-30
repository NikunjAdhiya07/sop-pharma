"use client";
import {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  User,
  LogOut,
  Shield,
  Search,
  Plus,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Upload,
  Languages,
  BookOpen,
  BarChart2,
  Download,
  Archive,
  X,
  Trash2,
} from "lucide-react";

import CompactFilterBar from "./components/CompactFilterBar";
import DepartmentCapsules, {
  type CapsuleFilterMode,
  type CapsuleAvailMetric,
} from "./components/DepartmentCapsules";
import DashboardCharts from "./components/DashboardCharts";
import SOPTable from "./components/SOPTable";
import DepartmentStatsModal from "./components/DepartmentStatsModal";
import UploadSOPModal, {
  type UploadSOPModalTab,
} from "./components/UploadSOPModal";
import UploadPDFModal from "./components/UploadPDFModal";
import SOPFolderUploadModal from "./components/SOPFolderUploadModal";
import SupersededVersionsPanel from "./components/SupersededVersionsPanel";
import GuidelinesComplianceWizard from "./components/GuidelinesComplianceWizard";
import GuidelinesResultPanel, {
  type ComplianceResult,
} from "./components/GuidelinesResultPanel";
import Link from "next/link";
import { countRowDocxPdfAttached } from "@/lib/registryRowDocCounts";
import { filterPrimaryRegistryRows } from "@/lib/registryPrimaryRows";
import {
  classifySopVersionCapsule,
  type SopVersionFilterSegment,
} from "@/lib/sopVersionCapsuleClassify";
import { normalizeSopIdentifierKey } from "@/lib/sopIdentifierNormalize";

export default function DashboardPage() {
  const router = useRouter();

  // Data State
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadModalTab, setUploadModalTab] =
    useState<UploadSOPModalTab>("english");
  const [showPdfUploadModal, setShowPdfUploadModal] = useState(false);
  const [showSOPFolderUploadModal, setShowSOPFolderUploadModal] =
    useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  /** API metadata from `/api/dashboard/sops` (not shown in UI; avoids stale `setDashboardMeta` reference errors). */
  const [, setDashboardMeta] = useState<Record<string, unknown> | null>(null);
  // User State
  const [user, setUser] = useState<any>(null);

  // Filters State
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("All");
  const [filterMedia, setFilterMedia] = useState<string>("all");
  const [filterExpiry, setFilterExpiry] = useState("all");
  const [filterDualLang, setFilterDualLang] = useState(false);
  const [filterFileType, setFilterFileType] = useState<
    "all" | "DOCX" | "NO_DOCX" | "PDF" | "NO_PDF"
  >("all");
  const [filterLanguage, setFilterLanguage] = useState<"all" | "ENG" | "GUJ">(
    "all",
  );
  const [filterVersionStatus, setFilterVersionStatus] = useState<
    "all" | SopVersionFilterSegment
  >("all");
  const [sortConfig, setSortConfig] = useState({
    key: "sopNo",
    direction: "asc",
  });
  // When true, show charts full-width; when false, show capsules full-width
  const [showCharts, setShowCharts] = useState(false);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [showGuidelinesLibrary, setShowGuidelinesLibrary] = useState(false);
  const [guidelinesWizardPreset, setGuidelinesWizardPreset] = useState<{
    _id: string;
    sopNo: string;
  } | null>(null);
  // keyed by sopNo — stores the last compliance result per SOP row
  const [complianceCache, setComplianceCache] = useState<
    Record<string, ComplianceResult>
  >({});

  // Obsolete SOPs panel
  const [showObsoletePanel, setShowObsoletePanel] = useState(false);
  const [obsoleteList, setObsoleteList] = useState<any[]>([]);
  const [obsoleteListLoading, setObsoleteListLoading] = useState(false);
  // which sopNo result panel is currently open
  const [viewingComplianceSopNo, setViewingComplianceSopNo] = useState<
    string | null
  >(null);

  const handleComplianceResult = useCallback(
    (sopNo: string, sopName: string, result: any) => {
      setComplianceCache((prev) => ({
        ...prev,
        [sopNo]: {
          sopNo,
          sopName,
          findings: Array.isArray(result.findings) ? result.findings : [],
          overallScore: result.overallScore ?? 0,
          clausesAnalyzed: result.clausesAnalyzed ?? 0,
          guidelineDocumentsUsed: result.guidelineDocumentsUsed ?? 0,
          runAt: new Date().toISOString(),
        },
      }));
    },
    [],
  );

  const sopRegistryRef = useRef<HTMLDivElement | null>(null);

  const fetchObsoleteList = async () => {
    setObsoleteListLoading(true);
    try {
      const res = await fetch("/api/sop/obsolete-list");
      const j = await res.json();
      if (j.success) setObsoleteList(j.data ?? []);
    } catch { /* ignore */ }
    finally { setObsoleteListLoading(false); }
  };

  const handleOpenObsoletePanel = () => {
    setShowObsoletePanel(true);
    fetchObsoleteList();
  };
  const [locationImportBusy, setLocationImportBusy] = useState(false);

  const LOCATION_XLSX_INPUT_ID = "dashboard-sop-location-xlsx";

  const primaryRegistryData = useMemo(
    () => filterPrimaryRegistryRows(data),
    [data],
  );

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      setTimeout(() => router.push("/login"), 0);
      return;
    }
    try {
      setUser(JSON.parse(userData));
    } catch {
      localStorage.removeItem("user");
      setTimeout(() => router.push("/login"), 0);
      return;
    }

    const fetchData = async () => {
      try {
        const sopRes = await fetch("/api/dashboard/sops", {
          cache: "no-store",
        });
        if (!sopRes.ok) {
          console.error("Failed to fetch SOPs", sopRes.status);
          return;
        }
        const sopsJ = await sopRes.json();

        if (sopsJ.success) {
          const rawData = sopsJ.data ?? [];
          setData(rawData);
          setDashboardMeta((sopsJ.metadata as Record<string, unknown>) ?? null);
        }
      } catch (e) {
        console.error("Failed to fetch", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [router, refreshKey]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleLocationExcelChange = async (
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLocationImportBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/sop/registry-locations", {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) {
        window.alert(
          j.error ||
            `Import failed (${res.status}). Use your site Excel (DP No. + SOP No.) or a simple SOP NO + LOCATION sheet.`,
        );
        return;
      }
      setRefreshKey((k) => k + 1);
      window.alert(j.message || `Imported ${j.rowsProcessed ?? 0} row(s).`);
    } catch {
      window.alert("Could not import locations");
    } finally {
      setLocationImportBusy(false);
    }
  };

  const handleSort = (key: any) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc")
      direction = "desc";
    setSortConfig({ key, direction });
  };

  // The perfect sorting & filtering logic
  const filteredAndSortedData = useMemo(() => {
    let result = [...filterPrimaryRegistryRows(data)];

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (d: any) =>
          (d.sopNo || "").toLowerCase().includes(s) ||
          (d.sopName || "").toLowerCase().includes(s) ||
          (d.englishName || "").toLowerCase().includes(s) ||
          (d.gujaratiName || "").toLowerCase().includes(s) ||
          (d.department || "").toLowerCase().includes(s) ||
          String(d.location || "")
            .toLowerCase()
            .includes(s),
      );
    }

    // Filter Department
    if (filterDept !== "All") {
      result = result.filter((d: any) => d.department === filterDept);
    }

    // Dual-language: match capsule "Dual" (true bilingual rows with separate GUJ file, not EN-only)
    if (filterDualLang) {
      result = result.filter((d: any) => d.isDualLanguage === true);
    }

    // Filter File Type — same as capsules + Files column (sopFile + sopDocuments; path extension wins over wrong fileType)
    if (filterFileType === "DOCX") {
      result = result.filter((d: any) => countRowDocxPdfAttached(d).docx > 0);
    } else if (filterFileType === "NO_DOCX") {
      result = result.filter((d: any) => countRowDocxPdfAttached(d).docx === 0);
    } else if (filterFileType === "PDF") {
      result = result.filter((d: any) => countRowDocxPdfAttached(d).pdf > 0);
    } else if (filterFileType === "NO_PDF") {
      result = result.filter((d: any) => countRowDocxPdfAttached(d).pdf === 0);
    }

    // Filter Language
    if (filterLanguage === "ENG")
      result = result.filter((d: any) => d.englishVersion);
    else if (filterLanguage === "GUJ")
      result = result.filter((d: any) => d.gujaratiVersion);

    // Filter Media
    if (filterMedia === "video")
      result = result.filter((d: any) => d.mediaStatus?.videos);
    else if (filterMedia === "slides")
      result = result.filter((d: any) => d.mediaStatus?.slides);
    else if (filterMedia === "no-video")
      result = result.filter((d: any) => !d.mediaStatus?.videos);
    else if (filterMedia === "no-slides")
      result = result.filter((d: any) => !d.mediaStatus?.slides);
    else if (filterMedia === "no-media")
      result = result.filter(
        (d: any) => !d.mediaStatus?.videos && !d.mediaStatus?.slides,
      );

    if (filterVersionStatus !== "all") {
      const tier =
        filterVersionStatus === "last2ok"
          ? "green"
          : filterVersionStatus === "zerov"
            ? "grey"
            : "red";
      result = result.filter(
        (d: any) => classifySopVersionCapsule(d) === tier,
      );
    }

    // Filter Expiry alerts
    if (filterExpiry !== "all") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      result = result.filter((d: any) => {
        if (filterExpiry === "nodate") return !d.expiryDate;
        if (!d.expiryDate) return false;
        const diffDays = Math.ceil(
          (new Date(d.expiryDate).getTime() - today.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        if (filterExpiry === "expired") return diffDays < 0;
        if (filterExpiry === "high") return diffDays >= 0 && diffDays <= 30;
        if (filterExpiry === "medium") return diffDays > 30 && diffDays <= 60;
        /** 61–90 day window (charts / planning) */
        if (filterExpiry === "soon90") return diffDays > 60 && diffDays <= 90;
        if (filterExpiry === "low") return diffDays > 60;
        return true;
      });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    /** Parse SOP No into three comparable parts: letter prefix, doc number, revision */
    const parseSop = (s: string) => {
      const norm = normalizeSopIdentifierKey(String(s || "").toUpperCase());
      const m = norm.match(/^([A-Z]{1,6})(\d+)-(\d+)$/);
      if (m)
        return {
          prefix: m[1],
          doc: parseInt(m[2], 10),
          rev: parseInt(m[3], 10),
        };
      return { prefix: norm, doc: 0, rev: 0 };
    };

    /** Compare two SOP Nos numerically (prefix → doc num → revision). Returns -1/0/1 */
    const cmpSopNo = (a: string, b: string): number => {
      const pa = parseSop(a),
        pb = parseSop(b);
      if (pa.prefix !== pb.prefix) return pa.prefix < pb.prefix ? -1 : 1;
      if (pa.doc !== pb.doc) return pa.doc - pb.doc;
      return pa.rev - pb.rev;
    };

    /** Stable tie-break: always sort by SOP No numerically ascending */
    const tieBreak = (a: any, b: any): number =>
      cmpSopNo(String(a.sopNo || ""), String(b.sopNo || ""));

    result.sort((a: any, b: any) => {
      const dir = sortConfig.direction === "asc" ? 1 : -1;
      let cmp = 0;

      switch (sortConfig.key) {
        case "sopNo": {
          cmp = cmpSopNo(String(a.sopNo || ""), String(b.sopNo || ""));
          return cmp !== 0 ? cmp * dir : 0;
        }

        case "version": {
          // Use the display revision extracted from SOP No (e.g. QAGE01-11 → 11)
          // Rows with 0 versions come first in ascending order
          const toDisplayRev = (r: any) => {
            const sopNo = String(r.sopNo || "");
            const m = sopNo.match(/-0*(\d+)$/);
            if (m) return parseInt(m[1], 10);
            const raw = r.version;
            if (raw == null || raw === "—") return -1;
            const n = parseInt(String(raw).replace(/[^\d]/g, ""), 10);
            return isNaN(n) ? -1 : n;
          };
          cmp = toDisplayRev(a) - toDisplayRev(b);
          if (cmp !== 0) return cmp * dir;
          // Within same version, sort SOP No ascending
          return cmpSopNo(String(a.sopNo || ""), String(b.sopNo || ""));
        }

        case "department": {
          const da = (a.department || "").toLowerCase();
          const db = (b.department || "").toLowerCase();
          cmp = da < db ? -1 : da > db ? 1 : 0;
          if (cmp !== 0) return cmp * dir;
          // Within same dept, sort SOP No ascending always
          return cmpSopNo(String(a.sopNo || ""), String(b.sopNo || ""));
        }

        case "sopName": {
          const na = (a.englishName || a.sopName || "").toLowerCase();
          const nb = (b.englishName || b.sopName || "").toLowerCase();
          cmp = na < nb ? -1 : na > nb ? 1 : 0;
          break;
        }

        case "location": {
          const la = (a.location || "").toLowerCase();
          const lb = (b.location || "").toLowerCase();
          // Empty locations go to end regardless of direction
          if (!la && lb) return 1;
          if (la && !lb) return -1;
          cmp = la < lb ? -1 : la > lb ? 1 : 0;
          break;
        }

        case "expiryDate": {
          const ta = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
          const tb = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
          cmp = ta - tb;
          break;
        }

        case "language": {
          const rank = (r: any) =>
            r.isDualLanguage ? 0 : r.gujaratiVersion ? 1 : 2;
          cmp = rank(a) - rank(b);
          break;
        }

        case "priorVersionCount": {
          const count = (r: any) =>
            (Array.isArray(r.versionArtifacts)
              ? r.versionArtifacts.length
              : 0) +
            (Array.isArray(r.versionArtifactsGujarati)
              ? r.versionArtifactsGujarati.length
              : 0);
          cmp = count(a) - count(b);
          break;
        }

        case "videos": {
          cmp =
            (a.mediaStatus?.videoCount ?? (a.mediaStatus?.videos ? 1 : 0)) -
            (b.mediaStatus?.videoCount ?? (b.mediaStatus?.videos ? 1 : 0));
          break;
        }

        case "slides": {
          cmp =
            (a.mediaStatus?.slideCount ?? (a.mediaStatus?.slides ? 1 : 0)) -
            (b.mediaStatus?.slideCount ?? (b.mediaStatus?.slides ? 1 : 0));
          break;
        }

        case "fileType": {
          const rank = (r: any) => {
            const c = countRowDocxPdfAttached(r);
            return c.docx * 2 + c.pdf;
          };
          cmp = rank(a) - rank(b);
          break;
        }

        /** Capsule green/red: distinct DOCX paths per row (matches Files column). */
        case "rowDocxCount": {
          cmp =
            countRowDocxPdfAttached(a).docx - countRowDocxPdfAttached(b).docx;
          break;
        }

        case "rowPdfCount": {
          cmp = countRowDocxPdfAttached(a).pdf - countRowDocxPdfAttached(b).pdf;
          break;
        }

        default: {
          const va = a[sortConfig.key];
          const vb = b[sortConfig.key];
          cmp =
            String(va ?? "").toLowerCase() < String(vb ?? "").toLowerCase()
              ? -1
              : String(va ?? "").toLowerCase() > String(vb ?? "").toLowerCase()
                ? 1
                : 0;
        }
      }

      if (cmp !== 0) return cmp * dir;
      return tieBreak(a, b);
    });

    return result;
  }, [
    data,
    search,
    filterDept,
    filterMedia,
    filterExpiry,
    filterDualLang,
    filterFileType,
    filterLanguage,
    filterVersionStatus,
    sortConfig,
  ]);

  const supersededSlotCount = useMemo(() => {
    let n = 0;
    for (const r of data) {
      n +=
        (Array.isArray(r.versionArtifactsSuperseded)
          ? r.versionArtifactsSuperseded.length
          : 0) +
        (Array.isArray(r.versionArtifactsGujaratiSuperseded)
          ? r.versionArtifactsGujaratiSuperseded.length
          : 0);
    }
    return n;
  }, [data]);

  const capsuleFilterSnapshot = useMemo(
    () => ({
      filterDept,
      filterDualLang,
      filterExpiry,
      filterFileType,
      filterLanguage,
      filterMedia,
      filterVersionStatus,
    }),
    [
      filterDept,
      filterDualLang,
      filterExpiry,
      filterFileType,
      filterLanguage,
      filterMedia,
      filterVersionStatus,
    ],
  );

  /** Green = rows with asset + sort desc; red = rows missing asset + sort asc. */
  const applyCapsuleAvailMiss = useCallback(
    (
      dept: string,
      metric: CapsuleAvailMetric,
      side: "available" | "missing",
    ) => {
      setFilterDept(dept);
      setFilterDualLang(false);
      setFilterExpiry("all");
      setFilterLanguage("all");
      setFilterVersionStatus("all");
      const direction = side === "available" ? "desc" : "asc";
      if (metric === "docx") {
        setFilterMedia("all");
        setFilterFileType(side === "available" ? "DOCX" : "NO_DOCX");
        setSortConfig({ key: "rowDocxCount", direction });
      } else if (metric === "pdf") {
        setFilterMedia("all");
        setFilterFileType(side === "available" ? "PDF" : "NO_PDF");
        setSortConfig({ key: "rowPdfCount", direction });
      } else if (metric === "video") {
        setFilterFileType("all");
        setFilterMedia(side === "available" ? "video" : "no-video");
        setSortConfig({ key: "videos", direction });
      } else {
        setFilterFileType("all");
        setFilterMedia(side === "available" ? "slides" : "no-slides");
        setSortConfig({ key: "slides", direction });
      }
      requestAnimationFrame(() => {
        sopRegistryRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    },
    [],
  );

  const applyCapsuleVersionSegment = useCallback(
    (dept: string, segment: SopVersionFilterSegment) => {
      setFilterDept(dept);
      setFilterDualLang(false);
      setFilterExpiry("all");
      setFilterMedia("all");
      setFilterFileType("all");
      setFilterLanguage("all");
      setFilterVersionStatus(segment);
      setSortConfig({ key: "sopNo", direction: "asc" });
      requestAnimationFrame(() => {
        sopRegistryRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    },
    [],
  );

  /** Chart → registry: expiry windows (optional `department` keeps dept filter for stacked chart clicks). */
  const applyChartExpiryFilter = useCallback(
    (
      key: "all" | "expired" | "high" | "medium" | "soon90" | "nodate",
      department?: string,
    ) => {
      setFilterDept(department ?? "All");
      setFilterDualLang(false);
      setFilterMedia("all");
      setFilterFileType("all");
      setFilterLanguage("all");
      setFilterVersionStatus("all");
      setSearch("");
      setFilterExpiry(key);
      setSortConfig({ key: "expiryDate", direction: "asc" });
      requestAnimationFrame(() => {
        sopRegistryRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    },
    [],
  );

  const applyCapsuleFilter = useCallback(
    (dept: string, mode: CapsuleFilterMode) => {
      setFilterDept(dept);
      /** Full preset for label-based capsule rows: clears green/red (NO_DOCX, no-video, …) and table sort so the registry matches the click (green/red leave sort on row counts). */
      const resetNeutral = () => {
        setFilterDualLang(false);
        setFilterExpiry("all");
        setFilterMedia("all");
        setFilterFileType("all");
        setFilterLanguage("all");
        setFilterVersionStatus("all");
        setSortConfig({ key: "sopNo", direction: "asc" });
      };
      switch (mode) {
        case "all":
          resetNeutral();
          setSearch("");
          break;
        case "dual":
          setFilterDualLang(true);
          setFilterExpiry("all");
          setFilterMedia("all");
          setFilterFileType("all");
          setFilterLanguage("all");
          setFilterVersionStatus("all");
          setSortConfig({ key: "sopNo", direction: "asc" });
          break;
        case "eng":
          resetNeutral();
          setFilterLanguage("ENG");
          break;
        case "guj":
          resetNeutral();
          setFilterLanguage("GUJ");
          break;
        case "expired":
          resetNeutral();
          setFilterExpiry("expired");
          break;
        case "near":
          resetNeutral();
          setFilterExpiry("high");
          break;
        case "docx":
          resetNeutral();
          setFilterFileType("DOCX");
          break;
        case "pdf":
          resetNeutral();
          setFilterFileType("PDF");
          break;
        case "video":
          resetNeutral();
          setFilterMedia("video");
          break;
        case "slides":
          resetNeutral();
          setFilterMedia("slides");
          break;
        default:
          resetNeutral();
      }
      requestAnimationFrame(() => {
        sopRegistryRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    },
    [],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const handleClearFilters = () => {
    setFilterDept("All");
    setFilterMedia("all");
    setFilterExpiry("all");
    setFilterDualLang(false);
    setFilterFileType("all");
    setFilterLanguage("all");
    setFilterVersionStatus("all");
    setSearch("");
    setSortConfig({ key: "sopNo", direction: "asc" });
  };

  const handleFilterExpired = () => {
    setFilterExpiry(filterExpiry === "expired" ? "all" : "expired");
    if (filterExpiry !== "expired")
      setSortConfig({ key: "expiryDate", direction: "asc" });
  };

  const handleFilterNearExpiry = () => {
    if (filterExpiry === "high" || filterExpiry === "medium") {
      setFilterExpiry("all");
    } else {
      setFilterExpiry("high");
      setSortConfig({ key: "expiryDate", direction: "asc" });
    }
  };

  const handleFilterActive = () => {
    setFilterExpiry(filterExpiry === "low" ? "all" : "low");
    if (filterExpiry !== "low")
      setSortConfig({ key: "expiryDate", direction: "desc" });
  };

  const handleFilterDualLanguage = () => {
    setFilterDualLang(!filterDualLang);
  };

  const handleFilterVideo = () => {
    setFilterMedia(filterMedia === "video" ? "all" : "video");
    if (filterMedia !== "video")
      setSortConfig({ key: "mediaStatus", direction: "desc" });
  };

  const handleFilterSlides = () => {
    setFilterMedia(filterMedia === "slides" ? "all" : "slides");
    if (filterMedia !== "slides")
      setSortConfig({ key: "mediaStatus", direction: "desc" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa] text-gray-800">
      {/* Top navigation: title, welcome, key metrics inline */}
      <header className="sticky top-0 z-40 flex shrink-0 flex-col gap-y-2 border-b border-gray-200 bg-gray-100 px-4 py-2.5 shadow-sm">
        {/* Top Row: Title + User Profile */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-600 shadow-sm">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-gray-900">
                SOP Control – Master Dashboard
              </h1>
              <p className="text-[10px] text-gray-600">
                Welcome, {user?.name || "User"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 pl-4 border-l border-gray-200/60">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-100">
              <User className="h-3.5 w-3.5 text-purple-700" />
            </div>
            <div className="hidden md:block mr-2">
              <p className="text-[11px] font-semibold leading-tight text-gray-800">
                {user?.name}
              </p>
              <p className="text-[9px] font-bold uppercase leading-tight tracking-wider text-gray-500">
                {user?.role}
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenObsoletePanel}
              className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-rose-100 hover:text-rose-700"
              title="Obsolete SOPs">
              <Archive className="h-4 w-4" />
            </button>
            {(user?.role === "admin" || user?.role === "qa-head") && (
              <Link
                href="/admin"
                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-purple-200 hover:text-purple-700"
                title="Admin Panel">
                <Shield className="h-4 w-4" />
              </Link>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-100 hover:text-red-700"
              title="Logout">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Bottom Row: Filters & Toolbars */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 w-full">
          {/* Inline filters in header */}
          <div className="hidden lg:flex flex-1 items-center justify-start pr-4">
            <CompactFilterBar
              data={primaryRegistryData}
              filterDept={filterDept}
              filterMedia={filterMedia}
              filterExpiry={filterExpiry}
              filterDualLang={filterDualLang}
              filterFileType={filterFileType}
              filterLanguage={filterLanguage}
              filterVersionStatus={filterVersionStatus}
              search={search}
              onFilterDept={setFilterDept}
              onFilterMedia={setFilterMedia}
              onFilterExpiry={setFilterExpiry}
              onFilterDualLang={setFilterDualLang}
              onClearAll={handleClearFilters}
              inline
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 flex-1 lg:flex-none">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search SOP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-700 outline-none placeholder:text-gray-400 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setGuidelinesWizardPreset(null);
                setShowGuidelinesLibrary(true);
              }}
              className="hidden sm:inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 shadow-sm transition-colors hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              title="Browse stored regulatory guidelines (same library used for SOP checks)">
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              Guidelines
            </button>
            {/* Show charts toggle */}
            <button
              type="button"
              onClick={() => setShowCharts((v) => !v)}
              className="hidden md:inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700 shadow-sm transition-colors hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-500">
              {showCharts ? "Hide charts" : "Show charts"}
            </button>
            <button
              type="button"
              onClick={() => setShowSuperseded(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              title="Older prior-version files beyond the two newest shown in each registry row">
              Superseded Versions
              {supersededSlotCount > 0 ? (
                <span className="rounded-full bg-amber-200 px-1.5 py-px text-[10px] tabular-nums text-amber-950">
                  {supersededSlotCount}
                </span>
              ) : null}
            </button>

            {/* Upload Hub Dropdown */}
            <div className="relative group">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 shadow-sm transition-colors hover:bg-purple-100">
                <Upload className="h-3.5 w-3.5" /> Bulk Uploads{" "}
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>
              <div className="absolute right-0 top-full mt-1 hidden w-48 flex-col gap-1 rounded-md border border-gray-200 bg-white p-1.5 shadow-xl group-hover:flex z-50">
                <button
                  type="button"
                  onClick={() => {
                    setUploadModalTab("english");
                    setShowUploadModal(true);
                  }}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-purple-50 hover:text-purple-700 w-full text-left">
                  <Upload className="h-3.5 w-3.5 text-purple-600" /> Upload SOPs
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadModalTab("gujarati");
                    setShowUploadModal(true);
                  }}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 w-full text-left">
                  <Languages className="h-3.5 w-3.5 text-indigo-600" /> Gujarati
                  folders
                </button>
                <button
                  type="button"
                  onClick={() => setShowPdfUploadModal(true)}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-red-50 hover:text-red-700 w-full text-left">
                  <Upload className="h-3.5 w-3.5 text-red-600" /> Upload PDFs
                </button>
                <button
                  type="button"
                  onClick={() => setShowSOPFolderUploadModal(true)}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-teal-50 hover:text-teal-700 w-full text-left">
                  <Upload className="h-3.5 w-3.5 text-teal-600" /> SOP folders
                </button>
                <div className="my-0.5 h-px bg-gray-100 w-full" />
                <label
                  htmlFor={LOCATION_XLSX_INPUT_ID}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-slate-50 hover:text-slate-800 w-full text-left ${
                    locationImportBusy ? "pointer-events-none opacity-50" : ""
                  }`}>
                  <Upload className="h-3.5 w-3.5 text-slate-500" /> Upload
                  locations
                </label>
              </div>
              <input
                id={LOCATION_XLSX_INPUT_ID}
                type="file"
                accept=".xlsx,.xls,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                tabIndex={-1}
                disabled={locationImportBusy}
                aria-label="Upload location Excel"
                onChange={handleLocationExcelChange}
              />
            </div>

            <Link
              href="/training-matrix"
              className="flex items-center gap-1.5 rounded-md border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 shadow-sm transition-colors hover:bg-teal-100">
              <BarChart2 className="h-3.5 w-3.5" /> Training Matrix
            </Link>
            <Link
              href="/sop-upload"
              className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-purple-700">
              <Plus className="h-3.5 w-3.5" /> Add SOP
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}

      {/* Capsules (always visible) */}
      <section className="border-b border-gray-200 bg-gray-100 px-2 py-1 sm:px-3">
        <div className="min-w-0 max-w-[1920px] mx-auto">
          <DepartmentCapsules
            data={primaryRegistryData}
            showTotalCapsule
            applyCapsuleFilter={applyCapsuleFilter}
            applyCapsuleAvailMiss={applyCapsuleAvailMiss}
            applyCapsuleVersionSegment={applyCapsuleVersionSegment}
            filterSnapshot={capsuleFilterSnapshot}
          />
        </div>
      </section>

      {/* Charts panel toggled from header */}
      {showCharts && (
        <section className="border-b border-gray-200 bg-gray-50 px-2 py-4 sm:px-4">
          <DashboardCharts
            data={primaryRegistryData}
            applyCapsuleFilter={applyCapsuleFilter}
            applyCapsuleAvailMiss={applyCapsuleAvailMiss}
            applyChartExpiryFilter={applyChartExpiryFilter}
          />
        </section>
      )}

      {/* SOP Registry */}
      <main
        ref={sopRegistryRef}
        className="flex flex-1 flex-col px-3 pt-1 pb-2">
        <div className="mb-1 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">
              SOP Registry
            </h3>
            <button
              type="button"
              onClick={handleClearFilters}
              className="shrink-0 rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-400"
              title="Clear search and all filters (default view)">
              Reset
            </button>
            <button
              type="button"
              onClick={async () => {
                const XLSX = (await import("xlsx")).default || await import("xlsx");
                const missing = primaryRegistryData.filter((d: any) => countRowDocxPdfAttached(d).docx === 0);
                const wsData = missing.map((d: any) => ({
                  "SOP Number": d.sopNo || "",
                  "SOP Name": d.englishName || d.sopName || "",
                  "Department": d.department || "",
                  "Version": d.version ?? "",
                  "File Status": "DOCX Missing"
                }));
                const ws = XLSX.utils.json_to_sheet(wsData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Missing DOCX");
                XLSX.writeFile(wb, "Missing_DOCX_SOPs.xlsx");
              }}
              className="shrink-0 flex items-center gap-1 rounded border border-green-300 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 shadow-sm transition-colors hover:bg-green-100 hover:border-green-400"
              title="Download list of SOPs missing DOCX files">
              <Download className="h-3 w-3" /> Export Missing DOCX
            </button>
          </div>
          <span className="text-[10px] font-semibold text-gray-500 tabular-nums shrink-0">
            {filteredAndSortedData.length} result
            {filteredAndSortedData.length !== 1 ? "s" : ""}
          </span>
        </div>
        {filteredAndSortedData.length === 0 && data.length > 0 ? (
          <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[11px] leading-snug text-amber-950 shadow-sm">
            <p className="font-bold text-amber-950">
              No SOPs match the current filters
            </p>
            <p className="mt-1 text-amber-900">
              {filterDualLang ? (
                <>
                  <strong>Dual language only</strong> is on — the table only
                  lists SOPs with both English and Gujarati files (same as the
                  &quot;Dual&quot; count in capsules).{" "}
                </>
              ) : null}
              {filterDept !== "All" ? (
                <>
                  Department is <strong>{filterDept}</strong>.{" "}
                </>
              ) : null}
              {filterExpiry !== "all" ? <>Expiry filter is active. </> : null}
              {filterFileType !== "all" ? (
                <>
                  File filter:{" "}
                  <strong>
                    {filterFileType === "NO_DOCX"
                      ? "Missing DOCX"
                      : filterFileType === "NO_PDF"
                        ? "Missing PDF"
                        : filterFileType}
                  </strong>
                  .{" "}
                </>
              ) : null}
              {filterLanguage !== "all" ? (
                <>
                  Language <strong>{filterLanguage}</strong> filter is on.{" "}
                </>
              ) : null}
              {filterMedia !== "all" && filterMedia !== "no-media" ? (
                <>
                  Media:{" "}
                  <strong>
                    {filterMedia === "no-video"
                      ? "No video"
                      : filterMedia === "no-slides"
                        ? "No slides"
                        : filterMedia}
                  </strong>
                  .{" "}
                </>
              ) : null}
              {filterVersionStatus !== "all" ? (
                <>
                  Version:{" "}
                  <strong>
                    {filterVersionStatus === "last2ok"
                      ? "Last-two complete"
                      : filterVersionStatus === "zerov"
                        ? "No prior versions"
                        : "Missing prior versions"}
                  </strong>
                  .{" "}
                </>
              ) : null}
              {search.trim() ? <>Search text is narrowing results. </> : null}
              <button
                type="button"
                onClick={handleClearFilters}
                className="mt-1 inline font-bold text-purple-800 underline decoration-purple-400 hover:text-purple-950">
                Reset all filters
              </button>{" "}
              or adjust the header / column filters.
            </p>
          </div>
        ) : null}
        <div className="rounded-lg border border-gray-200 bg-gray-50 shadow-sm">
          <SOPTable
            data={filteredAndSortedData}
            sortConfig={sortConfig}
            onSort={handleSort}
            filterDeptFromParent={filterDept}
            complianceCache={complianceCache}
            onViewCompliance={(sopNo: string) =>
              setViewingComplianceSopNo(sopNo)
            }
            onOpenGuidelineWizard={(row: { _id: string; sopNo: string }) => {
              setGuidelinesWizardPreset(row);
              setShowGuidelinesLibrary(true);
            }}
            onMarkObsolete={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </main>

      <DepartmentStatsModal
        isOpen={showDeptModal}
        onClose={() => setShowDeptModal(false)}
        data={primaryRegistryData}
      />
      <UploadSOPModal
        isOpen={showUploadModal}
        initialTab={uploadModalTab}
        onClose={() => setShowUploadModal(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
      <UploadPDFModal
        isOpen={showPdfUploadModal}
        onClose={() => setShowPdfUploadModal(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
      <SOPFolderUploadModal
        isOpen={showSOPFolderUploadModal}
        onClose={() => setShowSOPFolderUploadModal(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
      <SupersededVersionsPanel
        open={showSuperseded}
        onClose={() => setShowSuperseded(false)}
        data={data}
      />
      <GuidelinesComplianceWizard
        open={showGuidelinesLibrary}
        onClose={() => setShowGuidelinesLibrary(false)}
        registryRows={data}
        presetSop={guidelinesWizardPreset}
        onResult={handleComplianceResult}
      />
      {viewingComplianceSopNo && complianceCache[viewingComplianceSopNo] && (
        <GuidelinesResultPanel
          result={complianceCache[viewingComplianceSopNo]}
          onClose={() => setViewingComplianceSopNo(null)}
          onRerun={() => {
            const result = complianceCache[viewingComplianceSopNo];
            // find the registry row for this sopNo to get the _id
            const row = data.find(
              (r: any) => String(r.sopNo) === viewingComplianceSopNo,
            );
            setViewingComplianceSopNo(null);
            setGuidelinesWizardPreset({
              _id: row ? String(row._id) : "",
              sopNo: result.sopNo,
            });
            setShowGuidelinesLibrary(true);
          }}
        />
      )}

      {/* Obsolete SOPs Panel */}
      {showObsoletePanel && (
        <div
          className="fixed inset-0 z-[990] flex items-start justify-end bg-black/30 backdrop-blur-sm"
          onClick={() => setShowObsoletePanel(false)}>
          <div
            className="relative m-3 mt-14 w-full max-w-md rounded-xl border border-rose-200 bg-white shadow-2xl flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-rose-100 px-4 py-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-100">
                  <Archive className="h-4 w-4 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Obsolete SOPs</h3>
                  <p className="text-[9px] text-gray-500 uppercase tracking-wide font-semibold">
                    Removed from registry &amp; MCQ bank
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowObsoletePanel(false)}
                className="rounded p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
              {obsoleteListLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
                </div>
              ) : obsoleteList.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
                  <Trash2 className="h-8 w-8 opacity-30" />
                  <p className="text-xs font-semibold">No obsolete SOPs found</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {obsoleteList.map((item: any) => (
                    <div
                      key={item.identifier}
                      className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] font-bold text-rose-800 tracking-wide">
                            {item.identifier}
                          </p>
                          {item.englishName && (
                            <p className="text-[10px] font-semibold text-gray-800 truncate mt-0.5">
                              {item.englishName}
                            </p>
                          )}
                          {item.gujaratiName && (
                            <p className="text-[10px] text-indigo-700 font-semibold truncate">
                              {item.gujaratiName}
                            </p>
                          )}
                          <p className="text-[9px] text-gray-500 mt-0.5">{item.department}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          {item.fromMCQBank && (
                            <span className="inline-block rounded-full bg-amber-100 border border-amber-200 px-1.5 py-px text-[8px] font-bold text-amber-800 uppercase tracking-wide">
                              MCQ Bank
                            </span>
                          )}
                          {item.fromRegistry && (
                            <span className="ml-1 inline-block rounded-full bg-rose-100 border border-rose-200 px-1.5 py-px text-[8px] font-bold text-rose-700 uppercase tracking-wide">
                              Registry
                            </span>
                          )}
                          {item.mcqCount != null && (
                            <p className="text-[9px] text-gray-500 mt-0.5 tabular-nums">
                              {item.mcqCount} MCQs
                            </p>
                          )}
                          {item.obsoleteAt && (
                            <p className="text-[9px] text-gray-400 mt-0.5">
                              {new Date(item.obsoleteAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-gray-100 px-4 py-2 text-[9px] text-gray-400 text-right">
              {obsoleteList.length} record{obsoleteList.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
