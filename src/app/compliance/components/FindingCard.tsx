'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen, FileText, Hash, AlignLeft, ExternalLink } from 'lucide-react';

// Updated: Dark theme for compliance dashboard

export interface FindingCardProps {
  id: string;
  requirement: string;
  gap: string;
  impact: string;
  suggestion: string;
  reference: string;
  severity: 'critical' | 'major' | 'minor' | 'informational';
  status: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable';
  confidence: number;
  sopSection?: string;
  sopTextSnippet?: string;
  suggestedText?: string;
  clauseNumber?: string;
  clauseTitle?: string;
  clauseText?: string;
  guidelineName?: string;
  folderName?: string;
  pdfName?: string;
  onToggleApplicable?: (findingId: string, isChecked: boolean) => void;
  isApplicable?: boolean;
}

const severityConfig = {
  critical: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    text: 'text-rose-400',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    icon: '🔴',
  },
  major: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    icon: '🟠',
  },
  minor: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    icon: '🟡',
  },
  informational: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    icon: '🔵',
  },
};

const statusConfig = {
  compliant: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-300',
    border: 'border-emerald-500/40',
    label: 'Compliant',
  },
  partial: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
    border: 'border-amber-500/40',
    label: 'Partially Compliant',
  },
  'non-compliant': {
    bg: 'bg-rose-500/20',
    text: 'text-rose-300',
    border: 'border-rose-500/40',
    label: 'Non-Compliant',
  },
  'not-applicable': {
    bg: 'bg-slate-700/50',
    text: 'text-slate-300',
    border: 'border-slate-600/50',
    label: 'Not Applicable',
  },
};

export default function FindingCard({
  id,
  requirement,
  gap,
  impact,
  suggestion,
  reference,
  severity,
  status,
  confidence,
  sopSection,
  sopTextSnippet,
  suggestedText,
  clauseNumber,
  clauseTitle,
  clauseText,
  guidelineName,
  folderName,
  pdfName,
  onToggleApplicable,
  isApplicable = false,
}: FindingCardProps) {
  // Normalise status key: AI sometimes returns "non_compliant" or "notApplicable" variants
  const normStatus = (status || '')
    .toLowerCase()
    .replace(/_/g, '-') as keyof typeof statusConfig;
  const severityStyle = severityConfig[severity as keyof typeof severityConfig] ?? severityConfig.informational;
  const statusStyle  = statusConfig[normStatus] ?? statusConfig.partial;
  const [guidelineExpanded, setGuidelineExpanded] = useState(false);

  // Helper to get breadcrumb from reference
  const breadcrumb = reference.split(' → ');

  // Helper to extract a better reference if clauseNumber is technical (e.g., "1049")
  const displayClause = React.useMemo(() => {
    if (!clauseNumber) return 'GUIDELINE';
    
    // Check if clauseNumber is a technical-looking ID (3+ digits)
    const isTechnicalId = /^\d{3,}$/.test(clauseNumber);
    
    if (isTechnicalId) {
      // Try to find a reference in parentheses at the end: (ICH Q7, 5.20)
      const parenMatch = requirement.match(/\(([^)]+)\)[^.?!]*$/);
      if (parenMatch) {
         // Clean up: remove redundant "Ref." or similar if AI added it
         return parenMatch[1].replace(/Ref[:\s]*/i, '').trim();
      }
      
      // Look for "Section X.Y" or "Clause X.Y" patterns
      const sectionMatch = requirement.match(/(Section|Clause)\s+([\d.]+)/i);
      if (sectionMatch) {
         return `${sectionMatch[1]} ${sectionMatch[2]}`;
      }
    }
    
    return clauseNumber;
  }, [clauseNumber, requirement]);

  // Extract page number from clauseNumber if it's a large numeric ID (e.g. "1083" → page 1083)
  const pageNumber = React.useMemo(() => {
    if (!clauseNumber) return null;
    // If clauseNumber is purely numeric and >= 3 digits, treat it as a page reference
    if (/^\d{3,}$/.test(clauseNumber)) return clauseNumber;
    // Look for [page] pattern in clauseNumber like "5.2.1 [p.45]"
    const pageMatch = clauseNumber.match(/\[p\.?\s*(\d+)\]/i);
    if (pageMatch) return pageMatch[1];
    return null;
  }, [clauseNumber]);

  // Determine the "real" clause display (non-page version)
  const realClauseNumber = React.useMemo(() => {
    if (!clauseNumber) return null;
    if (/^\d{3,}$/.test(clauseNumber)) return null; // It's a page number, not a clause
    return clauseNumber;
  }, [clauseNumber]);

  // Resolve guideline name from reference or prop
  const resolvedGuidelineName = guidelineName || breadcrumb[breadcrumb.length - 1] || 'Unknown Guideline';
  const resolvedFolderName = folderName || breadcrumb[0] || '';

  return (
    <div
      className={`rounded-2xl border ${severityStyle.border} bg-white/5 backdrop-blur-md shadow-xl hover:shadow-purple-500/10 transition-all duration-300 overflow-hidden group`}
    >
      {/* Header */}
      <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/5 border-b border-white/5">
        <div className="flex items-center gap-4">
          {/* 3D Indicator Sphere */}
          <div className="relative">
            <div className={`w-10 h-10 rounded-full shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.5),inset_2px_2px_6px_rgba(255,255,255,0.2)] ${
              status === 'compliant' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' :
              status === 'partial' ? 'bg-gradient-to-br from-amber-400 to-amber-600' :
              'bg-gradient-to-br from-rose-400 to-rose-600'
            }`} />
            <div className="absolute top-1.5 left-2 w-3 h-1.5 bg-white/30 rounded-[50%] blur-[0.5px] -rotate-[30deg]" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border shadow-sm ${severityStyle.badge}`}>
                {severity}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border shadow-sm ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                {statusStyle.label}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <span className="opacity-50">📄</span>
              {breadcrumb.map((item, idx) => (
                <React.Fragment key={idx}>
                  <span className={idx === breadcrumb.length - 1 ? 'text-slate-400' : ''}>{item}</span>
                  {idx < breadcrumb.length - 1 && <span className="mx-1 opacity-30">→</span>}
                </React.Fragment>
              ))}
              {displayClause && <span className="mx-1 opacity-30">→</span>}
              <span className="text-slate-400">{displayClause}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           {/* Expand Guideline Reference Button */}
           <button
             onClick={() => setGuidelineExpanded(v => !v)}
             className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
               guidelineExpanded
                 ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                 : 'bg-white/5 border-white/10 text-slate-400 hover:border-blue-500/30 hover:text-blue-300'
             }`}
             title="View guideline source details"
           >
             <BookOpen className="h-3 w-3" />
             Source
             {guidelineExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
           </button>

           {/* Applicable Checkbox */}
           {onToggleApplicable && status !== 'compliant' && (
             <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-purple-500/30 hover:border-purple-500/50 transition-all">
               <input
                 type="checkbox"
                 id={`applicable-${id}`}
                 checked={isApplicable}
                 onChange={(e) => onToggleApplicable(id, e.target.checked)}
                 className="w-4 h-4 rounded border-2 border-purple-500/50 bg-slate-900/50 
                            checked:bg-purple-600 checked:border-purple-500 
                            focus:ring-2 focus:ring-purple-500/30 focus:ring-offset-0
                            cursor-pointer transition-all accent-purple-600"
               />
               <label 
                 htmlFor={`applicable-${id}`}
                 className="text-xs text-slate-400 cursor-pointer select-none hover:text-purple-300 transition-colors font-medium"
               >
                 Applicable
               </label>
             </div>
           )}
           
           <div className="text-right">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-0.5">Confidence</p>
              <div className="text-2xl font-black tracking-tighter text-emerald-400/90">
                {confidence}%
              </div>
           </div>
        </div>
      </div>

      {/* ── Guideline Reference Expand Panel ─────────────────────────────── */}
      {guidelineExpanded && (
        <div className="border-b border-blue-500/20 bg-gradient-to-br from-blue-950/40 to-slate-900/60 animate-in slide-in-from-top-1 duration-200">
          <div className="px-6 py-4 space-y-4">
            {/* Header row */}
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-4 w-4 text-blue-400" />
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Guideline Source Reference</span>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Guideline Name */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <BookOpen className="h-3 w-3 text-blue-400" />
                  <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Guideline</span>
                </div>
                <p className="text-sm font-bold text-white leading-tight">{resolvedGuidelineName}</p>
                {resolvedFolderName && (
                  <p className="text-[10px] text-blue-300/70 mt-0.5">{resolvedFolderName}</p>
                )}
              </div>

              {/* PDF / Document */}
              {pdfName && (
                <div className="bg-slate-700/40 border border-white/10 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileText className="h-3 w-3 text-slate-400" />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Document</span>
                  </div>
                  <p className="text-sm font-bold text-slate-200 leading-tight break-all">{pdfName}</p>
                </div>
              )}

              {/* Page Number */}
              {pageNumber && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Hash className="h-3 w-3 text-purple-400" />
                    <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Page Reference</span>
                  </div>
                  <p className="text-2xl font-black text-purple-300 leading-none">p.{pageNumber}</p>
                  <p className="text-[9px] text-purple-400/60 mt-0.5">Source page number</p>
                </div>
              )}

              {/* Clause Number (only if it's a real clause, not a page ID) */}
              {realClauseNumber && (
                <div className="bg-slate-700/40 border border-white/10 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Hash className="h-3 w-3 text-slate-400" />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Clause</span>
                  </div>
                  <p className="text-sm font-black text-white font-mono">{realClauseNumber}</p>
                  {clauseTitle && (
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{clauseTitle}</p>
                  )}
                </div>
              )}

              {/* Clause Title (standalone if no clause number) */}
              {clauseTitle && !realClauseNumber && (
                <div className="bg-slate-700/40 border border-white/10 rounded-xl p-3 sm:col-span-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlignLeft className="h-3 w-3 text-slate-400" />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Clause Title</span>
                  </div>
                  <p className="text-sm font-bold text-slate-200 leading-tight">{clauseTitle}</p>
                </div>
              )}
            </div>

            {/* Full Clause Text */}
            {(clauseText || requirement) && (
              <div className="bg-black/30 border border-white/5 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlignLeft className="h-3 w-3 text-blue-400" />
                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">
                      Guideline Text
                      {realClauseNumber && <span className="ml-1 text-blue-300/60">— Clause {realClauseNumber}</span>}
                      {pageNumber && <span className="ml-1 text-purple-300/60">— Page {pageNumber}</span>}
                    </span>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(clauseText || requirement)}
                    className="text-[9px] text-slate-500 hover:text-white transition-colors"
                  >
                    COPY
                  </button>
                </div>
                <div className="p-4">
                  <p className="text-slate-300 text-xs leading-relaxed font-mono whitespace-pre-wrap border-l-2 border-blue-500/30 pl-3">
                    {clauseText || requirement}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content Body */}
      <div className="p-6 space-y-6">
        
        {/* 1. Guideline Requirement */}
        <div className="space-y-3">
          <h4 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="text-rose-400">⚒️ ⚒️</span> Guideline Requirement
          </h4>
          <p className="text-slate-200 text-sm font-bold leading-relaxed">
            {requirement}
          </p>
        </div>

        {/* 2. SOP Context (If available) */}
        {sopTextSnippet && (
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
             <h4 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
               <span>📄</span> Current SOP Content
             </h4>
             <p className="text-slate-300 text-sm italic leading-relaxed pl-4 border-l-2 border-purple-500/50">
               "{sopTextSnippet}"
             </p>
             {sopSection && (
               <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase tracking-widest">Section: {sopSection}</p>
             )}
           </div>
        )}

        {/* 3. Analysis details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Gap */}
          <div className="space-y-3">
             <h4 className="text-amber-400/80 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
               <span>⚠️</span> Gap Identified
             </h4>
             <div className="text-slate-300 text-sm leading-relaxed">
                {gap}
             </div>
          </div>

          {/* Impact */}
          <div className="space-y-3">
             <h4 className="text-orange-400/80 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
               <span>💥</span> Impact Analysis
             </h4>
             <p className="text-slate-300 text-sm leading-relaxed">
                {impact}
             </p>
          </div>
        </div>

        {/* 4. Recommendation */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 shadow-inner">
           <h4 className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
             <span>✅</span> Suggested Action
           </h4>
           
           <div className="space-y-4">
             <p className="text-slate-200 text-sm font-bold leading-relaxed">
               {suggestion.replace(/```[\s\S]*?```/g, '').trim()}
             </p>

             {/* Suggested Text Block */}
             {(suggestedText || (suggestion.match(/```([\s\S]*?)```/)?.[1])) && (
                <div className="mt-4 bg-black/40 rounded-xl border border-white/5 overflow-hidden">
                   <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex justify-between items-center">
                      <span className="text-[9px] text-emerald-400 font-black uppercase tracking-widest">Proposed Verbiage</span>
                      <button 
                        onClick={() => navigator.clipboard.writeText(suggestedText || suggestion.match(/```([\s\S]*?)```/)?.[1] || '')}
                        className="text-[9px] text-slate-500 hover:text-white transition-colors"
                      >
                        COPY
                       </button>
                    </div>
                    <div className="p-4">
                       <pre className="text-slate-300 font-mono text-xs whitespace-pre-wrap leading-relaxed">
                         {suggestedText || suggestion.match(/```([\s\S]*?)```/)?.[1]}
                       </pre>
                    </div>
                 </div>
              )}
            </div>
         </div>

      </div>
    </div>
  );
}
