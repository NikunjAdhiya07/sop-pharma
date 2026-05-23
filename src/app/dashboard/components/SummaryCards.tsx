'use client';
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, FolderTree, FileText } from 'lucide-react';
import { useState } from 'react';

export default function SummaryCards({ stats, alertsCount, guidelines, onFilterDept, onFilterMedia, onFilterExpiry, onFilterGuideline }: any) {
  const [expandedDept, setExpandedDept] = useState(false);
  const [expandedGuidelines, setExpandedGuidelines] = useState(false);

  return (
    <div className="flex flex-wrap lg:flex-nowrap gap-4 mb-6">
      {/* Card 1: Total SOPs */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 min-w-[200px] flex-1 flex flex-col justify-center items-start">
        <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-2">Total SOPs</h3>
        <p className="text-4xl font-black text-purple-700">{stats?.totalSOPs || 0}</p>
        <div className="mt-2 text-xs text-gray-500 font-medium">Across all departments</div>
      </div>

      {/* Card 2: Department Overview */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 min-w-[240px] flex-1">
        <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpandedDept(!expandedDept)}>
          <div>
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">All Departments</h3>
            <p className="text-2xl font-bold text-gray-800">{stats?.departmentDistribution?.length || 0}</p>
          </div>
          <div className="bg-purple-50 text-purple-600 p-2 rounded-lg">
            {expandedDept ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </div>
        </div>
        {expandedDept && (
          <div className="mt-4 flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
            {stats?.departmentDistribution?.slice(0, 7).map((d: any, i: number) => (
              <div 
                key={d.department ?? `dept-${i}`} 
                onClick={() => onFilterDept(d.department)}
                className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded cursor-pointer hover:bg-purple-50 transition-colors border border-transparent hover:border-purple-200"
              >
                <span className="font-semibold text-gray-700 truncate w-24" title={d.department}>{d.department}</span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  Versions: {d.count > 0 ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card 3: Media Status */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 min-w-[200px] flex-1">
        <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-3">Media Status</h3>
        <div className="flex flex-col gap-3">
          <div
            onClick={() => onFilterMedia('video')}
            className="flex justify-between items-center cursor-pointer p-2 rounded-lg bg-gray-50 hover:bg-purple-50 transition-colors border border-transparent hover:border-purple-200"
          >
            <span className="font-medium text-gray-700 text-sm">Videos Uploaded</span>
            <span className="font-bold text-purple-700">{stats?.totalVideos || 0}</span>
          </div>
          <div
            onClick={() => onFilterMedia('slides')}
            className="flex justify-between items-center cursor-pointer p-2 rounded-lg bg-gray-50 hover:bg-purple-50 transition-colors border border-transparent hover:border-purple-200"
          >
            <span className="font-medium text-gray-700 text-sm">Slides Uploaded</span>
            <span className="font-bold text-purple-700">{stats?.totalSlides || 0}</span>
          </div>
        </div>
      </div>

      {/* Card 3b: Video Status Breakdown */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 min-w-[220px] flex-1">
        <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-3">Video Status</h3>
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center p-2 rounded-lg bg-green-50">
            <span className="font-medium text-gray-700 text-sm">✓ Found</span>
            <span className="font-bold text-green-600">{stats?.videosFound || 0}</span>
          </div>
          <div className="flex justify-between items-center p-2 rounded-lg bg-red-50">
            <span className="font-medium text-gray-700 text-sm">✗ Not Found</span>
            <span className="font-bold text-red-600">{stats?.videosExpected - (stats?.videosFound || 0) || 0}</span>
          </div>
          <div className="text-xs text-gray-500 text-center pt-1 border-t border-gray-200">
            Out of {stats?.videosExpected || 0} SOPs
          </div>
        </div>
      </div>

      {/* Card 4: Expiry Status */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 min-w-[280px] flex-[1.5]">
        <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-3">Review Expiry Status</h3>
        <div className="grid grid-cols-4 gap-2">
          <button onClick={() => onFilterExpiry('all')} className="flex flex-col items-center justify-center p-2 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors">
            <span className="text-xs font-semibold text-gray-500 uppercase">All</span>
            <span className="text-lg font-bold text-gray-800">{alertsCount?.total || 0}</span>
          </button>
          <button onClick={() => onFilterExpiry('high')} className="flex flex-col items-center justify-center p-2 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 transition-colors">
            <span className="text-xs font-semibold text-orange-600 uppercase">High</span>
            <span className="text-lg font-bold text-orange-700">{alertsCount?.high || 0}</span>
          </button>
          <button onClick={() => onFilterExpiry('medium')} className="flex flex-col items-center justify-center p-2 rounded-lg bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 transition-colors">
            <span className="text-xs font-semibold text-yellow-600 uppercase">Medium</span>
            <span className="text-lg font-bold text-yellow-700">{alertsCount?.medium || 0}</span>
          </button>
          <button onClick={() => onFilterExpiry('low')} className="flex flex-col items-center justify-center p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors">
            <span className="text-xs font-semibold text-emerald-600 uppercase">Low</span>
            <span className="text-lg font-bold text-emerald-700">{alertsCount?.low || 0}</span>
          </button>
          <button onClick={() => onFilterExpiry('expired')} className="flex flex-col items-center justify-center p-2 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 transition-colors col-span-4 mt-1">
            <div className="flex justify-between w-full px-2 items-center">
               <span className="text-xs font-bold text-red-600 uppercase">Expired</span>
               <span className="text-sm font-bold text-red-700">{alertsCount?.expired || 0} SOPs</span>
            </div>
          </button>
        </div>
      </div>

      {/* Card 5: Guidelines */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 min-w-[240px] flex-1">
        <div className="flex justify-between items-center cursor-pointer mb-2" onClick={() => setExpandedGuidelines(!expandedGuidelines)}>
          <div>
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Guidelines</h3>
            <p className="text-2xl font-bold text-purple-700">Total: {guidelines?.total || 0}</p>
          </div>
          <div className="bg-purple-50 text-purple-600 p-2 rounded-lg">
            {expandedGuidelines ? <ChevronDown className="h-5 w-5" /> : <FolderTree className="h-5 w-5" />}
          </div>
        </div>
        
        {expandedGuidelines && (
          <div className="mt-3 flex flex-col gap-2 max-h-36 overflow-y-auto custom-scrollbar pr-2">
            {guidelines?.folders?.map((folder: any, i: number) => (
              <div 
                key={folder.folderName ?? `folder-${i}`} 
                onClick={() => onFilterGuideline(folder.folderName)}
                className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded cursor-pointer hover:bg-purple-50 border border-transparent hover:border-purple-200"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  <span className="font-semibold text-gray-700 truncate">{folder.folderName}</span>
                </div>
                <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">{folder.guidelineCount}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
