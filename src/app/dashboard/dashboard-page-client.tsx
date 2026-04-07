"use client";
import {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
  type ChangeEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import ComplianceFullViewer from "./components/ComplianceFullViewer";
import Link from "next/link";
import {
  countRowDocxPdfAttached,
  countRowDocxPdfForCapsules,
  expectedDocxSlotsForRow,
  expectedPdfSlotsForRow,
} from "@/lib/registryRowDocCounts";
import { filterPrimaryRegistryRows } from "@/lib/registryPrimaryRows";
import {
  classifySopVersionCapsule,
  type SopVersionFilterSegment,
} from "@/lib/sopVersionCapsuleClassify";
import { normalizeSopIdentifierKey } from "@/lib/sopIdentifierNormalize";

export default function DashboardPageClient() {
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
  const searchParams = useSearchParams();
  const [migrateBunnyState, setMigrateBunnyState] = useState<
    | { status: 'idle' }
    | { status: 'checking'; localCount: number | null }
    | { status: 'running' }
    | { status: 'done'; migrated: number; skipped: number; failed: number; total: number }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  /** API metadata from `/api/dashboard/sops` (not shown in UI; avoids stale `setDashboardMeta` reference errors). */
  const [, setDashboardMeta] = useState<Record<string, unknown> | null>(null);
  // User State
  const [user, setUser] = useState<any>(null);

  // Filters State
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<
    "all" | "sopNo" | "sopName" | "department" | "location"
  >("all");
  const [filterDept, setFilterDept] = useState("All");
  const [filterMedia, setFilterMedia] = useState<string>("all");
  const [filterExpiry, setFilterExpiry] = useState("all");
  const [filterDualLang, setFilterDualLang] = useState(false);
  const [filterFileType, setFilterFileType] = useState<
    "all" | "DOCX" | "NO_DOCX" | "PDF" | "NO_PDF"
  >("all");
  const [filterLanguage, setFilterLanguage] = useState<"all" | "ENG" | "GUJ" | "BOTH">(
    "all",
  );
  const [filterAbsoluteSop, setFilterAbsoluteSop] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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

  // Obsolete SOPs filter (shows in main registry table)
  const [filterObsolete, setFilterObsolete] = useState(false);
  const [registrySearchOpen, setRegistrySearchOpen] = useState(false);
  const [obsoleteList, setObsoleteList] = useState<any[]>([]);
  const [obsoleteListLoading, setObsoleteListLoading] = useState(false);
  const [removingObsoleteId, setRemovingObsoleteId] = useState<string | null>(null);
  // which sopNo result panel is currently open (old side-panel)
  const [viewingComplianceSopNo, setViewingComplianceSopNo] = useState<
    string | null
  >(null);
  // which sopNo is open in the new full-screen viewer
  const [viewingComplianceFullSopNo, setViewingComplianceFullSopNo] = useState<
    string | null
  >(null);

  const handleComplianceResult = useCallback(
    (sopNo: string, sopName: string, result: any) => {
      const entry = {
        sopNo,
        sopName,
        findings: Array.isArray(result.findings) ? result.findings : [],
        overallScore: result.overallScore ?? 0,
        clausesAnalyzed: result.clausesAnalyzed ?? 0,
        guidelineDocumentsUsed: result.guidelineDocumentsUsed ?? 0,
        runAt: new Date().toISOString(),
      };
      setComplianceCache((prev) => ({ ...prev, [sopNo]: entry }));
      // Auto-open the full viewer after a new run
      setShowGuidelinesLibrary(false);
      setViewingComplianceFullSopNo(sopNo);
    },
    [],
  );

  const sopRegistryRef = useRef<HTMLDivElement | null>(null);

  // ── Load persisted compliance results on mount (shuttle pre-load) ────────────
  useEffect(() => {
    let cancelled = false;
    fetch('/api/dashboard/sop-guideline-review?listAll=true', { cache: 'no-store' })
      .then(res => res.json())
      .catch(() => ({ success: false }))
      .then((json) => {
        if (cancelled || !json.success || !Array.isArray(json.results)) return;
        const cache: Record<string, ComplianceResult> = {};
        for (const r of json.results) {
          cache[r.sopNo] = {
            sopNo: r.sopNo,
            sopName: r.sopName || '',
            findings: Array.isArray(r.findings) ? r.findings : [],
            overallScore: r.overallScore ?? 0,
            clausesAnalyzed: r.clausesAnalyzed ?? 0,
            guidelineDocumentsUsed: r.guidelineDocumentsUsed ?? 0,
            runAt: r.runAt,
            // Pass through the source so the full viewer can show the badge
            ...(r.source ? { source: r.source } : {}),
          } as any;
        }
        setComplianceCache(cache);
      });
    return () => { cancelled = true; };
  }, []);
  const fetchObsoleteList = async () => {
    setObsoleteListLoading(true);
    try {
      const res = await fetch("/api/sop/obsolete-list");
      const j = await res.json();
      if (j.success) setObsoleteList(j.data ?? []);
    } catch { /* ignore */ }
    finally { setObsoleteListLoading(false); }
  };

  const handleToggleObsoleteFilter = () => {
    if (!filterObsolete) {
      setFilterObsolete(true);
      fetchObsoleteList();
    } else {
      setFilterObsolete(false);
    }
  };

  const handleRemoveFromObsolete = async (identifier: string) => {
    if (removingObsoleteId) return;
    const password = window.prompt(`Enter password to restore "${identifier}" from Obsolete:`);
    if (!password) return;
    setRemovingObsoleteId(identifier);
    try {
      const res = await fetch("/api/sop/remove-obsolete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sopIdentifier: identifier, password }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        window.alert(j.error || "Failed to restore SOP");
        return;
      }
      setObsoleteList(prev => prev.filter(x => x.identifier !== identifier));
      setFilterObsolete(false);
      setLoading(true);
      setRefreshKey(k => k + 1);
    } catch {
      window.alert("Network error — please try again");
    } finally {
      setRemovingObsoleteId(null);
    }
  };

  const [locationImportBusy, setLocationImportBusy] = useState(false);

  const LOCATION_XLSX_INPUT_ID = "dashboard-sop-location-xlsx";

  const primaryRegistryData = useMemo(
    () => filterPrimaryRegistryRows(data),
    [data],
  );

  const effectiveData = data;

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

    // --- Client-side sessionStorage cache (stale-while-revalidate) ---
    // On first visit / hard refresh: show cached data instantly while re-fetching.
    // After each successful fetch the fresh result is written back to sessionStorage.
    const SESSION_KEY = "dashboard_sops_cache";
    const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

    const tryLoadSessionCache = (): boolean => {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return false;
        const { data: cachedData, meta, cachedAt } = JSON.parse(raw);
        if (Date.now() - cachedAt > SESSION_TTL_MS) return false;
        setData(cachedData ?? []);
        setDashboardMeta(meta ?? null);
        setLoading(false);
        return true;
      } catch {
        return false;
      }
    };

    /** Bypass session + server in-memory caches (see /api/dashboard/sops?refresh=1). */
    const forceFresh =
      refreshKey > 0 || searchParams.get("refresh") === "1";
    const hadCache = forceFresh ? false : tryLoadSessionCache();

    const fetchData = async () => {
      // Only show the full-page spinner when there is no cached data to display.
      // If hadCache is true, data is already on screen — fetch silently in background.
      if (!hadCache) setLoading(true);
      try {
        const sopRes = await fetch(
          `/api/dashboard/sops${forceFresh ? "?refresh=1" : ""}`,
          {
            cache: "no-store",
          },
        );
        if (!sopRes.ok) {
          console.error("Failed to fetch SOPs", sopRes.status);
          return;
        }
        const sopsJ = await sopRes.json();

        if (sopsJ.success) {
          const rawData = sopsJ.data ?? [];
          setData(rawData);
          setDashboardMeta((sopsJ.metadata as Record<string, unknown>) ?? null);
          // Persist fresh result to sessionStorage for instant next-visit display.
          try {
            sessionStorage.setItem(
              SESSION_KEY,
              JSON.stringify({ data: rawData, meta: sopsJ.metadata ?? null, cachedAt: Date.now() }),
            );
          } catch { /* quota exceeded — ignore */ }
        }
      } catch (e) {
        console.error("Failed to fetch", e);
      } finally {
        // Always clear loading when the fetch is done (covers both paths).
        setLoading(false);
      }
    };
    fetchData();
  }, [router, refreshKey, searchParams]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  /**
   * Invalidate both the server-side and client-side caches, then trigger a
   * fresh data load. Call this after any upload or mutation that changes SOP data.
   */
  const triggerRefresh = useCallback(async () => {
    // Clear sessionStorage cache so the upcoming fetch writes a fresh entry.
    try { sessionStorage.removeItem("dashboard_sops_cache"); } catch { /* ignore */ }
    // Tell the server to drop its in-memory cache.
    try {
      await fetch("/api/dashboard/invalidate-cache", { method: "POST" });
    } catch { /* non-critical — server cache will expire on its own TTL */ }
    setRefreshKey((k) => k + 1);
  }, []);

  const handleMigrateToBunny = async () => {
    // Step 1: dry-run check
    setMigrateBunnyState({ status: 'checking', localCount: null });
    try {
      const dryRes = await fetch('/api/admin/migrate-to-bunny?dry=1');
      const dryData = await dryRes.json();
      const localCount = dryData.localPathCount ?? 0;
      if (localCount === 0) {
        setMigrateBunnyState({ status: 'done', migrated: 0, skipped: 0, failed: 0, total: 0 });
        return;
      }
      setMigrateBunnyState({ status: 'checking', localCount });
    } catch {
      setMigrateBunnyState({ status: 'error', message: 'Failed to check local files.' });
      return;
    }
  };

  const handleMigrateToBunnyConfirm = async () => {
    setMigrateBunnyState({ status: 'running' });
    try {
      const res = await fetch('/api/admin/migrate-to-bunny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Migration failed');
      setMigrateBunnyState({
        status: 'done',
        migrated: data.migrated ?? 0,
        skipped: data.skipped ?? 0,
        failed: data.failed ?? 0,
        total: data.total ?? 0,
      });
    } catch (err) {
      setMigrateBunnyState({ status: 'error', message: err instanceof Error ? err.message : 'Migration failed.' });
    }
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
      triggerRefresh();
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

  // Shape obsolete list into SOPTable-compatible rows
  const obsoleteTableRows = useMemo(() =>
    obsoleteList.map((item: any) => ({
      _id: item.identifier,
      sopNo: item.identifier,
      sopName: item.englishName || item.gujaratiName || item.identifier,
      englishName: item.englishName || "",
      gujaratiName: item.gujaratiName || "",
      department: item.department || "Other",
      language: item.language || "English",
      isDualLanguage: item.isDualLanguage || false,
      englishVersion: item.englishVersion || false,
      gujaratiVersion: item.gujaratiVersion || false,
      gujaratiFileMissing: item.gujaratiFileMissing || false,
      location: item.location || null,
      expiryDate: item.expiryDate || null,
      version: item.version || null,
      sopFile: item.sopFile || null,
      sopDocuments: item.sopDocuments || [],
      mediaStatus: { videoCount: 0, slideCount: 0, videos: false, slides: false, videoRequired: 0, slideRequired: 0, videoAvailable: 0, slideAvailable: 0 },
      versionArtifacts: [],
      versionArtifactsGujarati: [],
      previousVersionsStatus: [],
      obsoleteAt: item.obsoleteAt || item.archivedAt || null,
      fromRegistry: item.fromRegistry || false,
      isObsolete: true,
    })),
    [obsoleteList],
  );

  // The perfect sorting & filtering logic
  const filteredAndSortedData = useMemo(() => {
    let result = [...filterPrimaryRegistryRows(effectiveData)];

    if (search) {
      const s = search.toLowerCase();
      result = result.filter((d: any) => {
        const fields = {
          sopNo: (d.sopNo || "").toLowerCase(),
          sopName:
            `${d.sopName || ""} ${d.englishName || ""} ${d.gujaratiName || ""}`.toLowerCase(),
          department: (d.department || "").toLowerCase(),
          location: String(d.location || "").toLowerCase(),
        };
        if (searchField === "all") {
          return (
            fields.sopNo.includes(s) ||
            fields.sopName.includes(s) ||
            fields.department.includes(s) ||
            fields.location.includes(s)
          );
        }
        return fields[searchField].includes(s);
      });
    }

    // Filter Department
    if (filterDept !== "All") {
      result = result.filter((d: any) => d.department === filterDept);
    }

    // Dual-language: match capsule "Dual" — rows that expect two EN+GU document slots (same as expectedDocxSlotsForRow === 2)
    if (filterDualLang) {
      result = result.filter((d: any) => expectedDocxSlotsForRow(d) >= 2);
    }

    // Filter File Type — same as capsules: is it fully/partially missing an expected language slot?
    if (filterFileType === "DOCX") {
      result = result.filter((d: any) => countRowDocxPdfForCapsules(d).docx > 0);
    } else if (filterFileType === "NO_DOCX") {
      // Missing if (Expected > Available)
      result = result.filter((d: any) => {
        const avail = countRowDocxPdfForCapsules(d).docx;
        return avail < expectedDocxSlotsForRow(d);
      });
    } else if (filterFileType === "PDF") {
      result = result.filter((d: any) => countRowDocxPdfForCapsules(d).pdf > 0);
    } else if (filterFileType === "NO_PDF") {
      result = result.filter((d: any) => {
        const avail = countRowDocxPdfForCapsules(d).pdf;
        return avail < expectedPdfSlotsForRow(d);
      });
    }

    // Filter Language
    if (filterLanguage === "ENG")
      result = result.filter(
        (d: any) =>
          d.englishVersion ||
          (Array.isArray(d.sopDocuments) &&
            d.sopDocuments.some(
              (doc: any) => (doc.language || "English") !== "Gujarati",
            )),
      );
    else if (filterLanguage === "GUJ")
      result = result.filter(
        (d: any) =>
          d.gujaratiVersion ||
          (Array.isArray(d.sopDocuments) &&
            d.sopDocuments.some((doc: any) => doc.language === "Gujarati")),
      );
    else if (filterLanguage === "BOTH")
      result = result.filter(
        (d: any) => {
          const hasEn =
            d.englishVersion ||
            (Array.isArray(d.sopDocuments) &&
              d.sopDocuments.some(
                (doc: any) => (doc.language || "English") !== "Gujarati",
              ));
          const hasGu =
            d.gujaratiVersion ||
            (Array.isArray(d.sopDocuments) &&
              d.sopDocuments.some((doc: any) => doc.language === "Gujarati"));
          return d.isDualLanguage || (hasEn && hasGu);
        },
      );

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
        filterVersionStatus === "allTwov"
          ? "allTwoFound"
          : filterVersionStatus === "onlyOnev"
              ? "onlyOneFound"
              : "notFound";
      result = result.filter(
        (d: any) => classifySopVersionCapsule(d) === tier,
      );
    }

    // Filter Expiry alerts
    if (filterExpiry !== "all") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
    // Use Math.floor (same as capsule accumulator) so that expired vs near-expiry
    // boundaries are consistent between the capsule counts and the filter results.
      result = result.filter((d: any) => {
        if (filterExpiry === "nodate") return !d.expiryDate;
        if (!d.expiryDate) return false;
        const diffDays = Math.floor(
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

    if (dateFrom || dateTo) {
      const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
      const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
      result = result.filter((d: any) => {
        if (!d.expiryDate) return false;
        const ts = new Date(d.expiryDate).getTime();
        if (Number.isNaN(ts)) return false;
        if (fromTs != null && ts < fromTs) return false;
        if (toTs != null && ts > toTs) return false;
        return true;
      });
    }

    if (filterAbsoluteSop) {
      result = result.filter((d: any) => {
        const docs = countRowDocxPdfForCapsules(d);
        const completeFiles =
          docs.docx >= expectedDocxSlotsForRow(d) &&
          docs.pdf >= expectedPdfSlotsForRow(d);
        const hasMeta = Boolean((d.department || "").trim()) && Boolean((d.sopName || "").trim());
        return completeFiles && hasMeta;
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
            const c = countRowDocxPdfForCapsules(r);
            return c.docx * 2 + c.pdf;
          };
          cmp = rank(a) - rank(b);
          break;
        }

        /** Capsule green/red: distinct DOCX paths per row (matches Files column). */
        case "rowDocxCount": {
          cmp =
            countRowDocxPdfForCapsules(a).docx - countRowDocxPdfForCapsules(b).docx;
          break;
        }

        case "rowPdfCount": {
          cmp = countRowDocxPdfForCapsules(a).pdf - countRowDocxPdfForCapsules(b).pdf;
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
    effectiveData,
    search,
    searchField,
    filterDept,
    filterMedia,
    filterExpiry,
    filterDualLang,
    filterFileType,
    filterLanguage,
    filterVersionStatus,
    filterAbsoluteSop,
    dateFrom,
    dateTo,
    sortConfig,
  ]);


  const supersededSlotCount = useMemo(() => {
    let n = 0;
    for (const r of effectiveData) {
      n +=
        (Array.isArray(r.versionArtifactsSuperseded)
          ? r.versionArtifactsSuperseded.length
          : 0) +
        (Array.isArray(r.versionArtifactsGujaratiSuperseded)
          ? r.versionArtifactsGujaratiSuperseded.length
          : 0);
    }
    return n;
  }, [effectiveData]);

  const mediaTotals = useMemo(() => {
    let totalVideos = 0;
    let totalSlides = 0;
    let totalDocx = 0;
    let totalPdf = 0;
    let pendingVideoSops = 0;
    let pendingSlideSops = 0;
    for (const r of filteredAndSortedData) {
      const v = r.mediaStatus?.videoCount ?? (r.mediaStatus?.videos ? 1 : 0);
      const s = r.mediaStatus?.slideCount ?? (r.mediaStatus?.slides ? 1 : 0);
      const docs = countRowDocxPdfAttached(r);
      totalVideos += v;
      totalSlides += s;
      totalDocx += docs.docx;
      totalPdf += docs.pdf;
      if (v <= 0) pendingVideoSops++;
      if (s <= 0) pendingSlideSops++;
    }
    return {
      totalVideos,
      totalSlides,
      totalDocx,
      totalPdf,
      pendingVideoSops,
      pendingSlideSops,
    };
  }, [filteredAndSortedData]);

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
        case "nodate":
          resetNeutral();
          setFilterExpiry("nodate");
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

  const handleMarkVersionSuperseded = useCallback(
    async (payload: {
      sopNo: string;
      lang: "English" | "Gujarati";
      version: number;
      docxPath?: string;
      pdfPath?: string;
    }) => {
      try {
        const user = (() => {
          try {
            return JSON.parse(localStorage.getItem("user") || "{}");
          } catch {
            return {};
          }
        })();
        const res = await fetch("/api/dashboard/supersede-version", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            createdBy: user?.username || user?.name || "dashboard-user",
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.success) {
          window.alert(j.error || "Failed to move version to Supersede SOP");
          return;
        }
        triggerRefresh();
      } catch {
        window.alert("Network error while superseding version");
      }
    },
    [triggerRefresh],
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
    setFilterAbsoluteSop(false);
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setSearchField("all");
    setSortConfig({ key: "sopNo", direction: "asc" });
    setFilterObsolete(false);
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
              onClick={handleToggleObsoleteFilter}
              className={`rounded-md p-1.5 transition-colors ${filterObsolete ? "bg-rose-200 text-rose-800" : "text-gray-500 hover:bg-rose-100 hover:text-rose-700"}`}
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



          <div className="flex flex-wrap items-center justify-end gap-2 flex-1 lg:flex-none">
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
              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-900 shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
              title="Prior version archive — older version files beyond the two newest per SOP">
              Prior Ver. Archive
              {supersededSlotCount > 0 ? (
                <span className="rounded-full bg-amber-200 px-1 py-px text-[9px] tabular-nums text-amber-950">
                  {supersededSlotCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setShowSOPFolderUploadModal(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-teal-300 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-900 shadow-sm transition-colors hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              title="Upload superseded folders and fetch only SOP versions (annexures skipped)">
              <Upload className="h-3.5 w-3.5" />
              Version Fetch Upload
            </button>

            <div className="flex items-center gap-2 rounded-md border border-purple-200 bg-white/80 px-1.5 py-1">
              <span className="px-1 text-[9px] font-bold uppercase tracking-wide text-purple-700">
                Bulk
              </span>
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-md border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 shadow-sm transition-colors hover:bg-purple-100">
                  <Upload className="h-3.5 w-3.5" /> Bulk Uploads
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </button>
                <div className="absolute right-0 top-full pt-1 hidden w-48 group-hover:block z-50">
                  <div className="flex flex-col gap-1 rounded-md border border-gray-200 bg-white p-1.5 shadow-xl">
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
                    <div className="my-0.5 h-px bg-gray-100 w-full" />
                    <label
                      htmlFor={LOCATION_XLSX_INPUT_ID}
                      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-slate-50 hover:text-slate-800 w-full text-left ${
                        locationImportBusy ? "pointer-events-none opacity-50" : ""
                      }`}>
                      <Upload className="h-3.5 w-3.5 text-slate-500" /> Upload
                      locations
                    </label>
                    <div className="my-0.5 h-px bg-gray-100 w-full" />
                    <button
                      type="button"
                      onClick={handleMigrateToBunny}
                      disabled={migrateBunnyState.status === 'running' || migrateBunnyState.status === 'checking'}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-orange-50 hover:text-orange-700 w-full text-left disabled:opacity-50">
                      <Upload className="h-3.5 w-3.5 text-orange-500" /> Migrate to Bunny
                    </button>
                  </div>
                </div>
              </div>
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

            <Link
              href="/training-matrix"
              className="flex items-center gap-1.5 rounded-md border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 shadow-sm transition-colors hover:bg-teal-100">
              <BarChart2 className="h-3.5 w-3.5" /> Training Matrix
            </Link>
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-white/80 px-1.5 py-1">
              <span className="px-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                Single
              </span>
              <button
                type="button"
                onClick={handleToggleObsoleteFilter}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors ${filterObsolete ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-700" : "border-rose-400 bg-rose-50 text-rose-700 hover:bg-rose-100"}`}>
                <Archive className="h-3.5 w-3.5" /> Obsolete SOPs
              </button>
              <Link
                href="/sop-upload"
                className="flex items-center gap-1.5 rounded-md border border-purple-600 bg-white px-3 py-1.5 text-xs font-semibold text-purple-700 shadow-sm transition-colors hover:bg-purple-50">
                <Plus className="h-3.5 w-3.5" /> SOP Upload
              </Link>
              <Link
                href="/mcq-bank"
                className="flex items-center gap-1.5 rounded-md border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100"
                title="Navigate to MCQ Bank section">
                <BarChart2 className="h-3.5 w-3.5" /> MCQ Bank
              </Link>
            </div>
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
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <h3 className={`text-xs font-bold uppercase tracking-wider ${filterObsolete ? "text-rose-700" : "text-gray-600"}`}>
              {filterObsolete ? "Obsolete SOPs" : "SOP Registry"}
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
            {/* Search — icon-only; expands inline */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setRegistrySearchOpen((v) => !v);
                  if (registrySearchOpen) setSearch("");
                }}
                className={`shrink-0 rounded border p-0.5 transition-colors ${
                  search || registrySearchOpen
                    ? "border-purple-400 bg-purple-50 text-purple-700"
                    : "border-gray-300 bg-white text-gray-500 hover:border-purple-300 hover:text-purple-600"
                }`}
                title="Search SOPs">
                <Search className="h-3.5 w-3.5" />
              </button>
              {registrySearchOpen && (
                <>
                  <select
                    value={searchField}
                    onChange={(e) =>
                      setSearchField(
                        e.target.value as
                          | "all"
                          | "sopNo"
                          | "sopName"
                          | "department"
                          | "location",
                      )
                    }
                    className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 focus:border-purple-500 focus:outline-none">
                    <option value="all">All fields</option>
                    <option value="sopNo">SOP No</option>
                    <option value="sopName">SOP Name</option>
                    <option value="department">Department</option>
                    <option value="location">Location</option>
                  </select>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-40 rounded border border-gray-300 bg-white py-0.5 pl-6 pr-2 text-[11px] text-gray-700 outline-none placeholder:text-gray-400 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {filterObsolete && (
              <span className="rounded-full bg-rose-100 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                Obsolete filter active
              </span>
            )}
            <span className="text-[10px] font-semibold text-gray-500 tabular-nums">
              {filterObsolete ? obsoleteTableRows.length : filteredAndSortedData.length} result
              {(filterObsolete ? obsoleteTableRows.length : filteredAndSortedData.length) !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        {filterObsolete && obsoleteListLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
          </div>
        ) : filterObsolete && obsoleteTableRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
            <Archive className="h-10 w-10 opacity-30" />
            <p className="text-sm font-semibold">No obsolete SOPs found</p>
          </div>
        ) : !filterObsolete && filteredAndSortedData.length === 0 && data.length > 0 ? (
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
                    {filterVersionStatus === "allTwov"
                      ? "All Two Found"
                      : filterVersionStatus === "onlyOnev"
                        ? "Only One Found"
                        : "Not Found"}
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
        {!(filterObsolete && obsoleteListLoading) && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 shadow-sm">
            <SOPTable
              data={filterObsolete ? obsoleteTableRows : filteredAndSortedData}
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
              onMarkVersionSuperseded={handleMarkVersionSuperseded}
              isObsoleteView={filterObsolete}
              onRemoveObsolete={handleRemoveFromObsolete}
              removingObsoleteId={removingObsoleteId}
            />
          </div>
        )}
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
        onSuccess={() => triggerRefresh()}
      />
      <UploadPDFModal
        isOpen={showPdfUploadModal}
        onClose={() => setShowPdfUploadModal(false)}
        onSuccess={() => triggerRefresh()}
      />
      <SOPFolderUploadModal
        isOpen={showSOPFolderUploadModal}
        onClose={() => setShowSOPFolderUploadModal(false)}
        onSuccess={() => triggerRefresh()}
      />

      {/* Migrate to Bunny modal */}
      {migrateBunnyState.status !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-base font-bold text-gray-900">Migrate DOCX files to Bunny CDN</h2>

            {migrateBunnyState.status === 'checking' && migrateBunnyState.localCount === null && (
              <div className="flex items-center gap-3 py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                <p className="text-sm text-gray-600">Scanning for local files…</p>
              </div>
            )}

            {migrateBunnyState.status === 'checking' && migrateBunnyState.localCount !== null && (
              <>
                <p className="mt-2 text-sm text-gray-600">
                  Found <span className="font-bold text-orange-600">{migrateBunnyState.localCount}</span> SOP record{migrateBunnyState.localCount !== 1 ? 's' : ''} with local file paths not yet on Bunny CDN.
                </p>
                <p className="mt-1 text-xs text-gray-500">Files will be uploaded to Bunny and DB records updated. This may take a few minutes.</p>
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => void handleMigrateToBunnyConfirm()}
                    className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
                    <Upload className="h-4 w-4" /> Start migration
                  </button>
                  <button
                    type="button"
                    onClick={() => setMigrateBunnyState({ status: 'idle' })}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </>
            )}

            {migrateBunnyState.status === 'running' && (
              <div className="flex items-center gap-3 py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                <p className="text-sm text-gray-600">Uploading files to Bunny CDN… please wait.</p>
              </div>
            )}

            {migrateBunnyState.status === 'done' && (
              <>
                {migrateBunnyState.total === 0 ? (
                  <p className="mt-2 text-sm text-green-700 font-semibold">All files are already on Bunny CDN.</p>
                ) : (
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-green-700 font-semibold">Migration complete.</p>
                    <p className="text-gray-600">Uploaded: <span className="font-bold text-green-600">{migrateBunnyState.migrated}</span></p>
                    <p className="text-gray-600">Already on CDN: <span className="font-bold text-gray-700">{migrateBunnyState.skipped}</span></p>
                    {migrateBunnyState.failed > 0 && (
                      <p className="text-red-600">Failed: <span className="font-bold">{migrateBunnyState.failed}</span> (file not found on disk)</p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setMigrateBunnyState({ status: 'idle' })}
                  className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Close
                </button>
              </>
            )}

            {migrateBunnyState.status === 'error' && (
              <>
                <p className="mt-2 text-sm text-red-600">{migrateBunnyState.message}</p>
                <button
                  type="button"
                  onClick={() => setMigrateBunnyState({ status: 'idle' })}
                  className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <SupersededVersionsPanel
        open={showSuperseded}
        onClose={() => setShowSuperseded(false)}
        data={effectiveData}
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

      {/* Full-screen compliance viewer — triggered by orange button */}
      {viewingComplianceFullSopNo && complianceCache[viewingComplianceFullSopNo] && (
        <ComplianceFullViewer
          result={complianceCache[viewingComplianceFullSopNo]}
          onClose={() => setViewingComplianceFullSopNo(null)}
          onRerun={() => {
            const result = complianceCache[viewingComplianceFullSopNo];
            const row = data.find(
              (r: any) => String(r.sopNo) === viewingComplianceFullSopNo,
            );
            setViewingComplianceFullSopNo(null);
            setGuidelinesWizardPreset({
              _id: row ? String(row._id) : "",
              sopNo: result.sopNo,
            });
            setShowGuidelinesLibrary(true);
          }}
        />
      )}

    </div>
  );
}
