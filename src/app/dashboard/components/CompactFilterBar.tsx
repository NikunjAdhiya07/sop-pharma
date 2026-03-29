"use client";
import { Filter, X } from "lucide-react";
import { isArtifactOnlyRegistryRow } from "@/lib/registryPrimaryRows";
import type { SopVersionFilterSegment } from "@/lib/sopVersionCapsuleClassify";

interface CompactFilterBarProps {
  data: any[];
  filterDept: string;
  filterMedia: string;
  filterExpiry: string;
  filterDualLang: boolean;
  filterFileType?: string;
  filterLanguage?: string;
  filterVersionStatus?: "all" | SopVersionFilterSegment;
  search: string;
  onFilterDept: (dept: string) => void;
  onFilterMedia: (media: string) => void;
  onFilterExpiry: (expiry: string) => void;
  onFilterDualLang?: (v: boolean) => void;
  onClearAll: () => void;
  inline?: boolean;
}

export default function CompactFilterBar({
  data,
  filterDept,
  filterMedia,
  filterExpiry,
  filterDualLang,
  filterFileType,
  filterLanguage,
  filterVersionStatus,
  search,
  onFilterDept,
  onFilterMedia,
  onFilterExpiry,
  onFilterDualLang,
  onClearAll,
  inline = false,
}: CompactFilterBarProps) {
  const totalSOPs = data.length;
  const departmentsMap = new Map<string, number>();
  let totalVideos = 0;
  let totalSlides = 0;
  let expiredCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  data.forEach((row: any) => {
    if (isArtifactOnlyRegistryRow(row)) return;
    const dept = row.department || "Unknown";
    departmentsMap.set(dept, (departmentsMap.get(dept) || 0) + 1);

    if (row.mediaStatus?.videos) totalVideos += 1;
    if (row.mediaStatus?.slides) totalSlides += 1;

    if (row.expiryDate) {
      const diffDays = Math.ceil(
        (new Date(row.expiryDate).getTime() - today.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (diffDays < 0) expiredCount += 1;
      else if (diffDays <= 30) highCount += 1;
      else if (diffDays <= 60) mediumCount += 1;
      else lowCount += 1;
    }
  });

  const departments = Array.from(departmentsMap.entries()).map(
    ([department, count]) => ({
      department,
      count,
    }),
  );

  const fileFilterLabel =
    filterFileType === "NO_DOCX"
      ? "Missing DOCX"
      : filterFileType === "NO_PDF"
        ? "Missing PDF"
        : filterFileType;
  const mediaFilterLabel =
    filterMedia === "no-video"
      ? "No video"
      : filterMedia === "no-slides"
        ? "No slides"
        : filterMedia;

  const versionFilterLabel =
    filterVersionStatus === "last2ok"
      ? "Last-two complete"
      : filterVersionStatus === "zerov"
        ? "No prior versions"
        : filterVersionStatus === "missingv"
          ? "Missing priors"
          : null;

  const activeFilters = [
    filterDept !== "All" ? `Dept: ${filterDept}` : null,
    filterMedia !== "all" ? `Media: ${mediaFilterLabel}` : null,
    filterExpiry !== "all" ? `Expiry: ${filterExpiry}` : null,
    filterFileType && filterFileType !== "all"
      ? `File: ${fileFilterLabel}`
      : null,
    filterLanguage && filterLanguage !== "all"
      ? `Lang: ${filterLanguage}`
      : null,
    filterDualLang ? "Dual language only" : null,
    filterVersionStatus && filterVersionStatus !== "all"
      ? `Version: ${versionFilterLabel}`
      : null,
    search ? `Search` : null,
  ].filter(Boolean);

  const wrapperClass = inline
    ? "flex flex-wrap items-center gap-2"
    : "flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-100 px-3 py-1.5";

  return (
    <div className={wrapperClass}>
      {!inline && (
        <div className="flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-gray-200">
            <Filter className="h-3 w-3 text-gray-500" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
            Filters
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <label
            htmlFor="dept-select"
            className="text-[10px] font-semibold text-gray-500">
            Dept
          </label>
          <select
            id="dept-select"
            value={filterDept}
            onChange={(e) => onFilterDept(e.target.value)}
            className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20">
            <option value="All">All ({totalSOPs})</option>
            {departments.map((d: any, i: number) => (
              <option key={d.department ?? `dept-${i}`} value={d.department}>
                {d.department} ({d.count})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <label
            htmlFor="media-select"
            className="text-[10px] font-semibold text-gray-500">
            Media
          </label>
          <select
            id="media-select"
            value={filterMedia}
            onChange={(e) => onFilterMedia(e.target.value)}
            className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20">
            <option value="all">All</option>
            <option value="video">Has videos ({totalVideos})</option>
            <option value="slides">Has slides ({totalSlides})</option>
            <option value="no-video">No video</option>
            <option value="no-slides">No slides</option>
            <option value="no-media">No media</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <label
            htmlFor="expiry-select"
            className="text-[10px] font-semibold text-gray-500">
            Expiry
          </label>
          <select
            id="expiry-select"
            value={filterExpiry}
            onChange={(e) => onFilterExpiry(e.target.value)}
            className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20">
            <option value="all">All ({totalSOPs})</option>
            <option value="expired">Expired ({expiredCount})</option>
            <option value="high">High ({highCount})</option>
            <option value="medium">Medium ({mediumCount})</option>
            <option value="low">Low ({lowCount})</option>
          </select>
        </div>

        {typeof onFilterDualLang === "function" && (
          <label
            className="flex cursor-pointer items-center gap-2"
            title="Only SOPs with both English and Gujarati files (same as the “Dual” line in department capsules). Turn off to see all SOPs in the selected department.">
            <input
              type="checkbox"
              checked={filterDualLang}
              onChange={(e) => onFilterDualLang(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-xs font-semibold text-gray-600">
              Dual language only
            </span>
          </label>
        )}

        {inline && (
          <button
            type="button"
            onClick={onClearAll}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
            title="Reset search and filters">
            Reset
          </button>
        )}
      </div>

      {!inline && activeFilters.length > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Active:</span>
          {activeFilters.map((f, i) => (
            <span
              key={i}
              className="rounded-md bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700">
              {f}
            </span>
          ))}
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50">
            <X className="h-3.5 w-3.5" /> Clear all
          </button>
        </div>
      )}
    </div>
  );
}
