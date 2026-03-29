'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';

interface CompactDataHeaderProps {
  stats: any;
  alertSummary: any;
  guidelines: any;
  metadata: any;
  onFilterExpired: () => void;
  onFilterNearExpiry: () => void;
  onFilterActive: () => void;
  onFilterDualLanguage: () => void;
  onFilterVideo: () => void;
  onFilterSlides: () => void;
  onTotalClick: () => void;
  onDepartmentsClick: () => void;
  onGuidelinesClick?: () => void;
  inline?: boolean;
}

function MetricPill({
  label,
  value,
  valueColor,
  onClick,
}: {
  label: string;
  value: number | string;
  valueColor: string;
  onClick?: () => void;
}) {
  const isClickable = !!onClick;
  const hoverClass = isClickable ? 'hover:bg-gray-100 focus:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1' : '';
  const cursorClass = isClickable ? 'cursor-pointer' : 'cursor-default';
  return (
    <button
      type="button"
      onClick={onClick}
      className={'flex items-baseline gap-2 rounded-md px-3 py-1.5 text-left transition-colors ' + hoverClass + ' ' + cursorClass}
      title={isClickable ? 'Click to filter' : undefined}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <span className={'text-base font-bold tabular-nums ' + valueColor}>{value}</span>
    </button>
  );
}

function KeyMetricsRow({
  inline,
  totalSOPs,
  dualLanguageSOPs,
  totalDepartments,
  expiredSOPs,
  nearExpiry,
  activeSOPs,
  videosUploaded,
  slidesUploaded,
  totalGuidelines,
  folders,
  onFilterExpired,
  onFilterNearExpiry,
  onFilterActive,
  onFilterDualLanguage,
  onFilterVideo,
  onFilterSlides,
  onTotalClick,
  onDepartmentsClick,
}: {
  inline: boolean;
  totalSOPs: number;
  dualLanguageSOPs: number;
  totalDepartments: number;
  expiredSOPs: number;
  nearExpiry: number;
  activeSOPs: number;
  videosUploaded: number;
  slidesUploaded: number;
  totalGuidelines: number;
  folders: any[];
  onFilterExpired: () => void;
  onFilterNearExpiry: () => void;
  onFilterActive: () => void;
  onFilterDualLanguage: () => void;
  onFilterVideo: () => void;
  onFilterSlides: () => void;
  onTotalClick: () => void;
  onDepartmentsClick: () => void;
}) {
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const guidelinesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (guidelinesRef.current && !guidelinesRef.current.contains(e.target as Node)) {
        setGuidelinesOpen(false);
      }
    }
    if (guidelinesOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [guidelinesOpen]);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {!inline && (
        <span className="mr-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Key metrics
        </span>
      )}
      <span className="h-4 w-px bg-gray-300" aria-hidden />

      <MetricPill label="Total SOPs" value={totalSOPs} valueColor="text-purple-700" onClick={onTotalClick} />
      <MetricPill label="Dual language" value={dualLanguageSOPs} valueColor="text-purple-600" onClick={onFilterDualLanguage} />
      <MetricPill label="Departments" value={totalDepartments} valueColor="text-gray-700" onClick={onDepartmentsClick} />

      <span className="h-4 w-px bg-gray-300" aria-hidden />

      <MetricPill label="Expired" value={expiredSOPs} valueColor="text-red-600" onClick={onFilterExpired} />
      <MetricPill label="Near expiry" value={nearExpiry} valueColor="text-amber-600" onClick={onFilterNearExpiry} />
      <MetricPill label="Active" value={activeSOPs} valueColor="text-emerald-600" onClick={onFilterActive} />

      <span className="h-4 w-px bg-gray-300" aria-hidden />

      <MetricPill label="Videos" value={videosUploaded} valueColor="text-blue-600" onClick={onFilterVideo} />
      <MetricPill label="Slides" value={slidesUploaded} valueColor="text-indigo-600" onClick={onFilterSlides} />

      <span className="h-4 w-px bg-gray-300" aria-hidden />

      <div className="relative flex items-center" ref={guidelinesRef}>
        <button
          type="button"
          onClick={() => setGuidelinesOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded border border-gray-200 bg-white pl-2 pr-1 py-1 transition-colors hover:border-purple-300 hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 cursor-pointer"
          title="Open guidelines"
        >
          <span className="text-[10px] font-semibold text-gray-600 tabular-nums">{totalGuidelines}</span>
          <span className="text-[9px] font-semibold uppercase text-gray-400">Guidelines</span>
          <span className="rounded p-0.5 hover:bg-purple-100 text-purple-600">
            <Plus className="h-3.5 w-3.5" />
          </span>
        </button>
        {guidelinesOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
            <div className="px-3 py-1.5 border-b border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Guideline categories</p>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {folders.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-500">No guideline folders yet.</p>
              ) : (
                folders.map((folder: { folderName: string; guidelineCount: number; totalClauses?: number }, i: number) => (
                  <div
                    key={folder.folderName ?? `folder-${i}`}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-purple-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-800 truncate" title={folder.folderName}>
                      {folder.folderName}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-purple-600 tabular-nums">
                      {folder.guidelineCount} {folder.guidelineCount === 1 ? 'doc' : 'docs'}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-gray-100 px-2 pt-2">
              <Link
                href="/compliance"
                onClick={() => setGuidelinesOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-purple-600 hover:bg-purple-50 transition-colors"
              >
                <FileText className="h-4 w-4" />
                View all in Compliance
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CompactDataHeader({
  stats,
  alertSummary,
  guidelines,
  metadata,
  onFilterExpired,
  onFilterNearExpiry,
  onFilterActive,
  onFilterDualLanguage,
  onFilterVideo,
  onFilterSlides,
  onTotalClick,
  onDepartmentsClick,
  inline = false,
}: CompactDataHeaderProps) {
  const totalSOPs = stats?.totalSOPs ?? 0;
  const expiredSOPs = alertSummary?.expired ?? 0;
  const nearExpiry = (alertSummary?.high ?? 0) + (alertSummary?.medium ?? 0);
  const activeSOPs = Math.max(0, totalSOPs - expiredSOPs);
  const totalDepartments = stats?.departmentDistribution?.length ?? 0;
  const videosUploaded = stats?.totalVideos ?? 0;
  const slidesUploaded = stats?.totalSlides ?? 0;
  const totalGuidelines = guidelines?.total ?? 0;
  const dualLanguageSOPs = metadata?.dualLanguageCount ?? 0;
  const folders = guidelines?.folders ?? [];

  const row = (
    <KeyMetricsRow
      inline={inline}
      totalSOPs={totalSOPs}
      dualLanguageSOPs={dualLanguageSOPs}
      totalDepartments={totalDepartments}
      expiredSOPs={expiredSOPs}
      nearExpiry={nearExpiry}
      activeSOPs={activeSOPs}
      videosUploaded={videosUploaded}
      slidesUploaded={slidesUploaded}
      totalGuidelines={totalGuidelines}
      folders={folders}
      onFilterExpired={onFilterExpired}
      onFilterNearExpiry={onFilterNearExpiry}
      onFilterActive={onFilterActive}
      onFilterDualLanguage={onFilterDualLanguage}
      onFilterVideo={onFilterVideo}
      onFilterSlides={onFilterSlides}
      onTotalClick={onTotalClick}
      onDepartmentsClick={onDepartmentsClick}
    />
  );

  if (inline) {
    return row;
  }
  return (
    <div className="border-b border-gray-200 bg-gray-100 px-3 py-1.5">
      {row}
    </div>
  );
}
