"use client";
import { Filter, X } from "lucide-react";
import { isArtifactOnlyRegistryRow } from "@/lib/registryPrimaryRows";
import type { SopVersionFilterSegment } from "@/lib/sopVersionCapsuleClassify";

interface CompactFilterBarProps {
  data: any[];
  filterDept: string;
  filterLanguage?: string;
  filterVersionStatus?: "all" | SopVersionFilterSegment;
  filterAbsoluteSop?: boolean;
  search: string;
  onFilterDept: (dept: string) => void;
  onFilterLanguage?: (language: "all" | "ENG" | "GUJ" | "BOTH") => void;
  onFilterAbsoluteSop?: (v: boolean) => void;
  onClearAll: () => void;
  inline?: boolean;
}

export default function CompactFilterBar({
  data,
  filterDept,
  filterLanguage,
  filterVersionStatus,
  filterAbsoluteSop = false,
  search,
  onFilterDept,
  onFilterLanguage,
  onFilterAbsoluteSop,
  onClearAll,
  inline = false,
}: CompactFilterBarProps) {
  const totalSOPs = data.length;
  const departmentsMap = new Map<string, number>();

  data.forEach((row: any) => {
    if (isArtifactOnlyRegistryRow(row)) return;
    const dept = row.department || "Unknown";
    departmentsMap.set(dept, (departmentsMap.get(dept) || 0) + 1);
  });

  const departments = Array.from(departmentsMap.entries()).map(
    ([department, count]) => ({ department, count }),
  );

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
    filterLanguage && filterLanguage !== "all"
      ? `Lang: ${filterLanguage}`
      : null,
    filterAbsoluteSop ? "Absolute SOP" : null,
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
          <label htmlFor="lang-select" className="text-[10px] font-semibold text-gray-500">
            Lang
          </label>
          <select
            id="lang-select"
            value={filterLanguage || "all"}
            onChange={(e) => onFilterLanguage?.(e.target.value as "all" | "ENG" | "GUJ" | "BOTH")}
            className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20">
            <option value="all">All</option>
            <option value="ENG">ENG</option>
            <option value="GUJ">GUJ</option>
            <option value="BOTH">BOTH</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => onFilterAbsoluteSop?.(!filterAbsoluteSop)}
          className={`rounded border px-2 py-1 text-[10px] font-semibold ${filterAbsoluteSop ? "border-purple-500 bg-purple-100 text-purple-700" : "border-gray-300 bg-white text-gray-600"}`}
          title="Show only SOP rows with complete document set">
          Absolute SOP
        </button>

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
