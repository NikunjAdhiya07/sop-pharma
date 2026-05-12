'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import FindingCard from './components/FindingCard';
import { CheckSquare, Square, Sparkles, X, Copy, BookOpen, FileText, Layers, CheckCircle } from 'lucide-react';
import { cleanSOPName } from '@/lib/sopLibraryHelper';


/**
 * SOP Compliance Engine - Redesigned with Step-by-Step Workflow
 * 
 * Workflow:
 * 1. Fetch & Review all SOPs
 * 2. Fetch & Review all Guidelines with clauses
 * 3. Run Analysis (with review option before execution)
 * 4. View Results with section references (like MCQ sopReference)
 */

interface Guideline {
  _id: string;
  name: string;
  folderName: string;
  pdfName: string;
  guidelineType: string;
  category: string;
  clauses?: {
    clauseNumber: string;
    clauseTitle: string;
    clauseText: string;
    keywords: string[];
  }[];
  clauseCount?: number;
  isScanned: boolean;
  createdAt: string;
}

interface GuidelineFolder {
  folderName: string;
  guidelineCount: number;
  totalClauses: number;
  lastUpdated?: string;
}

interface SOP {
  _id: string;
  identifier: string;
  name: string;
  department: string;
  version?: string;
  status?: string;
  content?: string;
  location?: string;
}

interface ComplianceFinding {
  guidelineName: string;
  folderName: string;
  pdfName: string;
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  complianceLevel: 'compliant' | 'partial' | 'non-compliant';
  matchConfidence: number;
  sopSectionAffected: string;
  mismatchExplanation: string;
  suggestedAction: string;
  sopTextSnippet: string;
  highlightedIssue: string;
  criticality?: 'critical' | 'high' | 'medium' | 'low';
  issueSeverity?: 'critical' | 'major' | 'minor' | 'informational';
  issueType?: 'missing' | 'weak' | 'incomplete' | 'none';
  guidelineRequirement?: string;
  suggestedText?: string;
  // Section reference (like MCQ sopReference)
  guidelineReference?: string;
}

interface ComplianceReport {
  _id: string;
  sopIdentifier: string;
  sopName: string;
  department: string;
  overallScore: number;
  complianceStatus: string;
  totalGuidelinesChecked: number;
  compliantCount: number;
  partialCount: number;
  nonCompliantCount: number;
  findings: ComplianceFinding[];
  analyzedAt: string;
}

type WorkflowStep = 'fetch-sops' | 'fetch-guidelines' | 'review' | 'analyze' | 'results';

// ── Consolidated Section Card (needs own state for expand toggle) ────────────
function ConsolidatedSectionCard({ sec }: { sec: {
  sectionKey: string;
  isMulti: boolean;
  findings: ComplianceFinding[];
  sources: string[];
  clauses: string[];
  combinedAction: string;
  combinedSuggestion: string;
}}) {
  const [refExpanded, setRefExpanded] = useState(false);
  return (
    <div
      className={`rounded-2xl border overflow-hidden ${
        sec.isMulti ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-white'
      }`}
    >
      {/* Section header */}
      <div className={`px-5 py-3 flex items-center justify-between border-b ${
        sec.isMulti ? 'border-purple-200 bg-purple-100/60' : 'border-gray-100 bg-gray-50'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
            sec.isMulti
              ? 'bg-purple-200 text-purple-800 border border-purple-300'
              : 'bg-gray-100 text-gray-600 border border-gray-200'
          }`}>
            Section {sec.sectionKey}
          </div>
          {sec.isMulti && (
            <span className="text-xs text-purple-600 font-semibold flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              {sec.findings.length} changes combined
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Guideline Refs expand toggle */}
          <button
            onClick={() => setRefExpanded(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
              refExpanded
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            <BookOpen className="h-3 w-3" />
            Guideline Refs
            {refExpanded
              ? <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
              : <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            }
          </button>
          {/* Copy section */}
          <button
            onClick={() => navigator.clipboard.writeText([sec.combinedAction, sec.combinedSuggestion ? `\nPROPOSED VERBIAGE:\n${sec.combinedSuggestion}` : ''].filter(Boolean).join('\n'))}
            className="text-[10px] text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
      </div>

      {/* ── Guideline Reference Expand Panel ── */}
      {refExpanded && (
        <div className="border-b border-blue-100 bg-blue-50">
          <div className="px-5 py-4 space-y-3">
            <p className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] flex items-center gap-1.5">
              <BookOpen className="h-3 w-3" /> Guideline Source References
            </p>
            {sec.findings.map((f, fi) => {
              const isPageId = f.clauseNumber && /^\d{3,}$/.test(f.clauseNumber);
              const pageNum = isPageId ? f.clauseNumber : null;
              const clauseNum = isPageId ? null : f.clauseNumber;
              return (
                <div key={fi} className="bg-white border border-blue-100 rounded-xl overflow-hidden">
                  {/* Finding ref header */}
                  <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-3 flex-wrap">
                    {fi > 0 && sec.isMulti && (
                      <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[9px] font-black flex-shrink-0">{fi + 1}</span>
                    )}
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 border border-blue-200 rounded text-[10px] font-bold text-blue-700">
                      <BookOpen className="h-2.5 w-2.5" />
                      {f.folderName || 'Guideline'}
                    </span>
                    {f.guidelineName && f.guidelineName !== f.folderName && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-100 rounded text-[10px] font-bold text-blue-600 max-w-[180px] truncate" title={f.guidelineName}>
                        {f.guidelineName}
                      </span>
                    )}
                    {f.pdfName && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-200 rounded text-[10px] font-bold text-gray-600 max-w-[200px] truncate" title={f.pdfName}>
                        <FileText className="h-2.5 w-2.5 flex-shrink-0" />
                        {f.pdfName}
                      </span>
                    )}
                    {clauseNum && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-200 rounded text-[10px] font-bold text-gray-600 font-mono">
                        Clause {clauseNum}
                      </span>
                    )}
                    {pageNum && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-50 border border-purple-200 rounded text-[10px] font-black text-purple-700">
                        p.{pageNum}
                      </span>
                    )}
                  </div>
                  {/* Clause title + text */}
                  <div className="px-4 py-3 space-y-2">
                    {f.clauseTitle && (
                      <p className="text-[10px] font-black text-gray-700 uppercase tracking-wider">{f.clauseTitle}</p>
                    )}
                    {(f.clauseText || f.guidelineRequirement) && (
                      <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-blue-300 pl-3 font-mono">
                        {f.clauseText || f.guidelineRequirement}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Sources + clauses pills */}
        <div className="flex flex-wrap gap-2">
          {sec.sources.map(src => (
            <span key={src} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-[10px] font-bold text-blue-700 uppercase tracking-wider">
              <BookOpen className="h-3 w-3" />{src}
            </span>
          ))}
          {sec.clauses.map(cl => (
            <span key={cl} className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-600">
              <FileText className="h-3 w-3" />Clause {cl}
            </span>
          ))}
        </div>

        {/* Issues list (multi only) */}
        {sec.isMulti && (
          <div className="space-y-1">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Issues being resolved:</p>
            {sec.findings.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[9px] font-black flex-shrink-0">{i + 1}</span>
                <span className="leading-relaxed">{f.mismatchExplanation || f.highlightedIssue || 'Gap identified'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Consolidated action */}
        <div>
          <p className="text-[10px] text-emerald-600 font-black uppercase tracking-wider mb-2 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            {sec.isMulti ? 'Consolidated Action' : 'Suggested Action'}
          </p>
          <p className="text-sm text-gray-800 font-medium leading-relaxed whitespace-pre-wrap">{sec.combinedAction}</p>
        </div>

        {/* Proposed verbiage */}
        {sec.combinedSuggestion && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
              <span className="text-[9px] text-emerald-700 font-black uppercase tracking-widest">
                {sec.isMulti ? 'Combined Proposed Verbiage' : 'Proposed Verbiage'}
              </span>
            </div>
            <div className="p-4">
              <pre className="text-gray-700 font-mono text-xs whitespace-pre-wrap leading-relaxed">{sec.combinedSuggestion}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComplianceEnginePage() {
  useAuthGuard();
  const router = useRouter();

  // Workflow State
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('fetch-sops');

  // Data State
  const [folders, setFolders] = useState<GuidelineFolder[]>([]);
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [sops, setSops] = useState<SOP[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  
  // Loading States
  const [loadingSops, setLoadingSops] = useState(false);
  const [loadingGuidelines, setLoadingGuidelines] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [currentResult, setCurrentResult] = useState<any>(null);
  const [totalClausesFromAPI, setTotalClausesFromAPI] = useState(0);
  
  // UI State
  const [selectedReport, setSelectedReport] = useState<ComplianceReport | null>(null);
  const [loadingFullReport, setLoadingFullReport] = useState(false);
  const [expandedGuideline, setExpandedGuideline] = useState<string | null>(null);
  const [loadingGuidelineId, setLoadingGuidelineId] = useState<string | null>(null);
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'compliant' | 'partial' | 'non-compliant'>('all');
  const [filterGuideline, setFilterGuideline] = useState<string>('all');
  const [selectedSopId, setSelectedSopId] = useState<string>('all');
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Applicable Findings State (Checkbox-based)
  const [applicableFindings, setApplicableFindings] = useState<Set<string>>(new Set());
  const [submittingApplicable, setSubmittingApplicable] = useState(false);

  // ── Selection for consolidated summary ──────────────────────────────────────
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<number>>(new Set());
  const [showConsolidatedSummary, setShowConsolidatedSummary] = useState(false);
  const [isSummaryFullScreen, setIsSummaryFullScreen] = useState(false);

  // Handle checkbox toggle for applicable findings
  const handleToggleApplicable = (findingId: string, isChecked: boolean) => {
    setApplicableFindings(prev => {
      const newSet = new Set(prev);
      if (isChecked) {
        newSet.add(findingId);
      } else {
        newSet.delete(findingId);
      }
      return newSet;
    });
  };

  // ── Helpers for consolidated summary ────────────────────────────────────────
  const normaliseSectionKey = (f: ComplianceFinding): string => {
    const raw = (f as any).sopSectionAffected || (f as any).sopSectionNumber || 'General';
    const m = String(raw).match(/(\d[\d.]*)/);
    return m ? m[1] : String(raw).trim() || 'General';
  };

  // Filtered findings currently visible
  const visibleFindings = useMemo(() => {
    if (!selectedReport?.findings) return [];
    return selectedReport.findings
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => (filterStatus === 'all' || f.complianceLevel === filterStatus) &&
                         (filterGuideline === 'all' || f.folderName === filterGuideline));
  }, [selectedReport, filterStatus, filterGuideline]);

  const allFindingsSelected = visibleFindings.length > 0 && visibleFindings.every(({ i }) => selectedFindingIds.has(i));
  const someFindingsSelected = visibleFindings.some(({ i }) => selectedFindingIds.has(i));

  const toggleSelectAllFindings = () => {
    if (allFindingsSelected) {
      const next = new Set(selectedFindingIds);
      visibleFindings.forEach(({ i }) => next.delete(i));
      setSelectedFindingIds(next);
    } else {
      const next = new Set(selectedFindingIds);
      visibleFindings.forEach(({ i }) => next.add(i));
      setSelectedFindingIds(next);
    }
  };

  const toggleFindingSelect = (idx: number) => {
    setSelectedFindingIds(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // Build consolidated sections from selected findings
  const consolidatedSections = useMemo(() => {
    if (!selectedReport?.findings) return [];
    const selected = selectedReport.findings.filter((_, i) => selectedFindingIds.has(i));
    const map = new Map<string, ComplianceFinding[]>();
    for (const f of selected) {
      const key = normaliseSectionKey(f);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries())
      .map(([key, group]) => ({
        sectionKey: key,
        findings: group,
        isMulti: group.length > 1,
        sources: Array.from(new Set(group.map(f => f.folderName || f.guidelineName || 'Guideline').filter(Boolean))),
        clauses: Array.from(new Set(group.map(f => f.clauseNumber).filter(Boolean))),
        combinedAction: Array.from(new Set(group.map((f) => {
          let action = (f.suggestedAction || '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/\r?\n/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          // Clean prefixes (Action:, 1., and Section Key like "5.11")
          action = action
            .replace(/^(Action|Suggestion|Remediation):\s*/i, '')
            .replace(/^(\d+\.|-|\*)\s*/, '')
            .replace(new RegExp(`^${key.replace(/\./g, '\\.')}\\s*`, 'i'), '');
          
          if (!action) return '';
          if (!action.endsWith('.')) action += '.';
          
          return `${action}${f.clauseNumber ? ` [Clause ${f.clauseNumber}]` : ''}`;
        }).filter(Boolean))).join(' '),
        combinedSuggestion: (() => {
          // 1. Gather all raw texts
          const rawTexts = group.map(f => 
            f.suggestedText || (f.suggestedAction?.match(/```([\s\S]*?)```/)?.[1]) || ''
          ).filter(Boolean);

          // 2. Split into potential "section blocks" to detect mixed feedback (e.g. 5.11 inside 1.0)
          let blocks: string[] = [];
          rawTexts.forEach(text => {
             // Split by looking for "Number.Number" at start of lines or sentences
             const parts = text.split(/(?=(?:^|\s|\n)\d+\.\d+\b)/); 
             blocks.push(...parts);
          });

          // 3. Filter blocks belonging to current selection hierarchy
          const relevantBlocks = blocks.map(b => b.trim()).filter(b => {
              if (!b) return false;
              const match = b.match(/^(\d+(?:\.\d+)*)/);
              if (match) {
                  // Keep if it starts with current key (e.g. "5.11" matches "5.11.2")
                  return match[1].startsWith(key);
              }
              // If no number start, it's generic text for this section
              return true;
          });

          if (relevantBlocks.length === 0) return '';
          
          // 4. Clean and Merge
          const sentences = new Set<string>();
          relevantBlocks.forEach(block => {
              // Strip key prefix to avoid "5.11 Text... 5.11 More Text"
              let content = block.replace(new RegExp(`^${key.replace(/\./g, '\\.')}(\\.\\d+)*\\s*[:\\-]?\\s*`, 'i'), '');
              
              // Also strip generic headers if present immediately after number
              // e.g. "Frequency:" in "5.9 Frequency:"
              content = content.replace(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*:/, '').trim();

              if (!content) return;

              // Split into sentences to allow clean merging
              // (Simple split by . ! ?)
              const sent = content.match(/[^.!?]+[.!?]+/g) || [content];
              sent.forEach(s => {
                  const c = s.trim();
                  if (c.length > 2) sentences.add(c);
              });
          });
          
          return `${key} ${Array.from(sentences).join(' ')}`;
        })(),
      }))
      .sort((a, b) => { const na = parseFloat(a.sectionKey), nb = parseFloat(b.sectionKey); return !isNaN(na) && !isNaN(nb) ? na - nb : !isNaN(na) ? -1 : !isNaN(nb) ? 1 : a.sectionKey.localeCompare(b.sectionKey); });
  }, [selectedReport, selectedFindingIds]);

  // Submit all selected applicable findings
  const submitApplicableFindings = async () => {
    if (!selectedReport || applicableFindings.size === 0) return;
    
    try {
      setSubmittingApplicable(true);
      const response = await fetch('/api/compliance/applicable-findings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: selectedReport._id,
          findingIds: Array.from(applicableFindings),
          userId: 'demo-user-id', // Replace with actual user ID from session
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        // Navigate to compiled view
        router.push(`/compliance/applicable?reportId=${selectedReport._id}`);
      } else {
        alert(`Failed to submit findings: ${data.error}`);
      }
    } catch (error) {
      console.error('Error submitting applicable findings:', error);
      alert('Failed to submit applicable findings');
    } finally {
      setSubmittingApplicable(false);
    }
  };

  // Handle selecting a report (fetch full data)
  const handleSelectReport = async (report: ComplianceReport) => {
    setSelectedReport(report); // Show summary info immediately
    setFilterGuideline('all'); // Reset guideline filter when selecting new report
    setLoadingFullReport(true);
    try {
      const response = await fetch(`/api/compliance/analyze?reportId=${report._id}`);
      const data = await response.json();
      if (data.success) {
        setSelectedReport(data.report);
      }
    } catch (error) {
      console.error('Error fetching full report:', error);
    } finally {
      setLoadingFullReport(false);
    }
  };

  // Handle expanding guideline (fetch clauses if missing)
  const handleToggleGuideline = async (guideline: Guideline) => {
    if (expandedGuideline === guideline._id) {
      setExpandedGuideline(null);
      return;
    }

    setExpandedGuideline(guideline._id);

    // If clauses are already loaded, don't fetch again
    if (guideline.clauses && guideline.clauses.length > 0) {
      return;
    }

    setLoadingGuidelineId(guideline._id);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s frontend timeout

      const response = await fetch(`/api/guidelines/upload?id=${guideline._id}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      if (data.success && data.guideline) {
        // Update guidelines array with full data
        setGuidelines(prev => (prev || []).map(g => 
          g._id === guideline._id ? { ...g, clauses: data.guideline.clauses } : g
        ));
      }
    } catch (error) {
      console.error('Error fetching full guideline:', error);
    } finally {
      setLoadingGuidelineId(null);
    }
  };
  
  // Upload State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadFolderName, setUploadFolderName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  
  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);

  // Helper Functions
  const getScoreEmoji = (score: number) => {
    if (score >= 9) return '🟢';
    if (score >= 6) return '🟡';
    return '🔴';
  };

  const getScoreColor = (score: number) => {
    if (score >= 9) return 'text-emerald-600';
    if (score >= 6) return 'text-amber-600';
    return 'text-rose-600';
  };

  // Step 1: Fetch all SOPs
  const fetchSops = async () => {
    setLoadingSops(true);
    try {
      const sopsResponse = await fetch('/api/compliance/sops?limit=500');
      const data = await sopsResponse.json();
      if (data.success) {
        setSops(Array.isArray(data.sops) ? data.sops : []);
        setDepartments(Array.isArray(data.departments) ? data.departments : []);
      } else {
        setSops([]);
        setDepartments([]);
      }
    } catch (error) {
      console.error('Error fetching SOPs:', error);
    } finally {
      setLoadingSops(false);
    }
  };

  // Step 2: Fetch all Guidelines from all folders
  const fetchAllGuidelines = async () => {
    setLoadingGuidelines(true);
    try {
      // First get folders
      const foldersResponse = await fetch('/api/guidelines/folders');
      const foldersData = await foldersResponse.json();
      if (foldersData.success && Array.isArray(foldersData.folders)) {
        setFolders(foldersData.folders);
      } else {
        setFolders([]);
      }

      const guidelinesResponse = await fetch('/api/guidelines/upload?summary=true');
      const guidelinesData = await guidelinesResponse.json();
      console.log('DEBUG: Guidelines API Response:', {
        success: guidelinesData.success,
        count: guidelinesData.guidelines?.length,
        totalClauses: guidelinesData.totalClauses
      });
      if (guidelinesData.success && Array.isArray(guidelinesData.guidelines)) {
        setGuidelines(guidelinesData.guidelines);
        setTotalClausesFromAPI(guidelinesData.totalClauses || 0);
      } else {
        console.warn('DEBUG: Guidelines fetch returned success:false or non-array');
        setGuidelines([]);
        setTotalClausesFromAPI(0);
      }
    } catch (error) {
      console.error('Error fetching guidelines:', error);
    } finally {
      setLoadingGuidelines(false);
    }
  };

  // Fetch existing reports
  const fetchReports = async () => {
    setLoadingReports(true);
    try {
      const response = await fetch('/api/compliance/analyze');
      const data = await response.json();
      if (data.success && Array.isArray(data.reports)) {
        setReports(data.reports);
      } else {
        setReports([]);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoadingReports(false);
    }
  };

  // Upload guidelines
  const handleUploadGuidelines = async () => {
    if (!uploadFolderName.trim() || uploadFiles.length === 0) {
      alert('Please enter a folder name and select PDF files');
      return;
    }

    setIsUploading(true);
    setUploadProgress('Starting upload...');

    try {
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        setUploadProgress(`Uploading ${i + 1}/${uploadFiles.length}: ${file.name}...`);

        const formData = new FormData();
        formData.append('files', file);
        formData.append('folderName', uploadFolderName.trim());
        formData.append('userId', '000000000000000000000001'); // Default/dummy user ID

        const response = await fetch('/api/guidelines/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        if (!data.success) {
          console.error('Upload failed for', file.name, data.error);
        }
      }

      setUploadProgress('✅ Upload complete!');
      setUploadFiles([]);
      setUploadFolderName('');
      setShowUploadModal(false);
      fetchAllGuidelines();
    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress('❌ Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Delete a single guideline
  const handleDeleteGuideline = async (guidelineId: string) => {
    if (!confirm('Are you sure you want to delete this guideline?')) return;

    setDeletingId(guidelineId);
    try {
      const response = await fetch(`/api/guidelines/upload?id=${guidelineId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        fetchAllGuidelines();
      } else {
        alert('Failed to delete guideline: ' + data.error);
      }
    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setDeletingId(null);
    }
  };

  // Delete an entire folder
  const handleDeleteFolder = async (folderName: string) => {
    if (!confirm(`Are you sure you want to delete the folder "${folderName}" and all its guidelines?`)) return;

    setDeletingFolder(folderName);
    try {
      const response = await fetch(`/api/guidelines/folders?folderName=${encodeURIComponent(folderName)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        fetchAllGuidelines();
      } else {
        alert('Failed to delete folder: ' + data.error);
      }
    } catch (error) {
      console.error('Delete folder error:', error);
    } finally {
      setDeletingFolder(null);
    }
  };

  // Delete a compliance report
  const handleDeleteReport = async (reportId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    
    if (!confirm('Are you sure you want to delete this compliance report?')) return;

    try {
      const response = await fetch(`/api/compliance/analyze?reportId=${reportId}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (data.success) {
        // If the deleted report was selected, clear selection
        if (selectedReport && selectedReport._id === reportId) {
          setSelectedReport(null);
        }
        await fetchReports();
      } else {
        alert('Failed to delete report: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting report:', error);
      alert('Error deleting report');
    }
  };
  // Run Analysis for all SOPs
  const runFullAnalysis = async () => {
    if (sops.length === 0) {
      alert('No SOPs available to analyze');
      return;
    }

    if (guidelines.length === 0) {
      alert('No guidelines available. Please upload guidelines first.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisComplete(false);
    setCurrentStep('analyze');
    
    let successCount = 0;
    let failCount = 0;

    const sopsToAnalyze = selectedSopId === 'all' 
      ? sops 
      : sops.filter(s => s._id === selectedSopId);

    if (sopsToAnalyze.length === 0) {
      alert('No SOP selected for analysis');
      return;
    }

    for (let i = 0; i < sopsToAnalyze.length; i++) {
      const sop = sopsToAnalyze[i];
      setAnalysisProgress(`Analyzing ${i + 1}/${sopsToAnalyze.length}: ${sop.identifier} - ${sop.name}`);

      try {
        // Use V3 API (V4 can't handle improperly parsed guidelines)
        const response = await fetch('/api/compliance/analyze-v3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sopId: sop._id,
            userId: '000000000000000000000001',
            config: {
              aiModel: 'gemini-3-pro-preview',
              maxClausesToAnalyze: 200,
            },
          }),
        });


        const data = await response.json();
        if (data.success) {
          successCount++;
          setCurrentResult(data);
          console.log(`✅ ${sop.identifier}: Score ${data.overallScore}/10 - ${data.complianceStatus}`);
        } else {
          failCount++;
          console.warn(`⚠️ ${sop.identifier}: ${data.error || data.userMessage}`);
          // If gatekeeping failed, still show the reason
          if (data.gatekeeping) {
            console.log('   Gatekeeping:', data.gatekeeping);
          }
        }
      } catch (error) {
        console.error('Analysis error for', sop.identifier, error);
        failCount++;
      }

      // Small delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setAnalysisProgress(`✅ Analysis Complete: ${successCount} passed, ${failCount} failed`);
    setIsAnalyzing(false);
    setAnalysisComplete(true);
    fetchReports();
  };

  // Initial load
  useEffect(() => {
    fetchSops();
    fetchAllGuidelines();
    fetchReports();
  }, []);

  // Calculate total clauses (use API provided count if in summary mode)
  const totalClauses = totalClausesFromAPI || (guidelines || []).reduce((sum, g) => sum + (g.clauseCount ?? (g.clauses?.length || 0)), 0);

  const getStepStyle = (stepId: string) => {
    const isActive = currentStep === stepId;
    return `flex-1 flex items-center justify-center gap-3 py-3 px-4 rounded-xl transition-all border ${
      isActive
        ? 'bg-purple-600 text-white shadow-lg border-purple-500'
        : 'bg-white text-gray-500 border-gray-200 hover:bg-purple-50 hover:border-purple-200'
    }`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Fully Compliant': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Partially Compliant': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Non-Compliant': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-700 to-purple-500">
                Compliance Intelligence Engine
              </h1>
              <p className="text-sm text-gray-500 font-medium">
                Automated Regulatory Compliance Validation
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all text-sm font-semibold shadow-sm"
            >
              ← Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Workflow Steps Navigation */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
          {[
            { id: 'fetch-sops', label: '1. SOPs', icon: '📄', count: sops?.length || 0 },
            { id: 'fetch-guidelines', label: '2. Guidelines', icon: '📚', count: guidelines?.length || 0 },
            { id: 'review', label: '3. Review', icon: '👁️', count: null },
            { id: 'analyze', label: '4. Analyze', icon: '🤖', count: null },
            { id: 'results', label: '5. Results', icon: '📊', count: reports?.length || 0 },
          ].map((step) => (
            <button
              key={step.id}
              onClick={() => setCurrentStep(step.id as WorkflowStep)}
              className={getStepStyle(step.id)}
            >
              <span className="text-xl opacity-90">{step.icon}</span>
              <span className="font-semibold text-sm hidden md:inline">{step.label}</span>
              {step.count !== null && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  currentStep === step.id ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 'bg-white/5 text-gray-400 border-white/10'
                }`}>
                  {step.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Step 1: Fetch SOPs */}
        {currentStep === 'fetch-sops' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">SOP Repository</h2>
                  <p className="text-gray-500 mt-1">
                    {sops?.length || 0} SOPs across {departments?.length || 0} departments available for analysis.
                  </p>
                </div>
                <button
                  onClick={fetchSops}
                  disabled={loadingSops}
                  className="px-5 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl transition-all disabled:opacity-50 font-medium text-sm flex items-center gap-2 border border-purple-200"
                >
                  {loadingSops ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>
                      Fetching...
                    </>
                  ) : '🔄 Refresh Data'}
                </button>
              </div>

              {/* Department filter */}
              <div className="mb-6 flex items-center gap-3">
                <span className="text-sm font-medium text-gray-600">Filter by Department:</span>
                <div className="relative">
                  <select
                    value={filterDepartment}
                    onChange={(e) => setFilterDepartment(e.target.value)}
                    className="pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-sm appearance-none cursor-pointer hover:border-purple-300 transition-all font-medium min-w-[240px]"
                  >
                    <option value="all">All Departments ({sops?.length || 0})</option>
                    {(departments || []).map(dept => (
                      <option key={dept} value={dept}>
                        {dept} ({(sops || []).filter(s => s.department === dept).length})
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 text-xs">▼</div>
                </div>
              </div>

              {/* SOP List */}
              {loadingSops ? (
                <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4"></div>
                  <p className="text-gray-500">Loading SOPs...</p>
                </div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto space-y-3 pr-2 light-scrollbar">
                  {(sops || [])
                    .filter(sop => filterDepartment === 'all' || sop.department === filterDepartment)
                    .map((sop) => (
                    <div
                      key={sop._id}
                      className="p-5 bg-gray-50 border border-gray-100 rounded-xl hover:border-purple-200 hover:bg-purple-50/30 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-purple-700 font-bold text-sm bg-purple-50 px-2 py-0.5 rounded border border-purple-100">{sop.identifier}</span>
                            {sop.version && (
                              <span className="text-gray-400 text-xs">v{sop.version}</span>
                            )}
                          </div>
                          <h3 className="text-gray-800 font-medium group-hover:text-purple-700 transition-colors">
                            {cleanSOPName(sop.name, sop.identifier)}
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-bold shadow-sm">
                            📍 {sop.location || 'QA-DP-01'}
                          </span>
                          <span className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-medium shadow-sm">
                            🏢 {sop.department}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-8 pt-6 border-t border-gray-100">
                <button
                  onClick={() => setCurrentStep('fetch-guidelines')}
                  className="px-8 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-all shadow-lg shadow-purple-200"
                >
                  Next: Guidelines →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Fetch Guidelines */}
        {currentStep === 'fetch-guidelines' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Compliance Guidelines</h2>
                  <p className="text-gray-500 mt-1">
                    Managing {guidelines?.length || 0} guidelines ({totalClauses} clauses) across {folders?.length || 0} categories.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all shadow-sm font-medium text-sm flex items-center gap-2"
                  >
                    <span>📤</span> Upload New
                  </button>
                  <button
                    onClick={fetchAllGuidelines}
                    disabled={loadingGuidelines}
                    className="px-5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg transition-all disabled:opacity-50 font-medium text-sm border border-gray-200"
                  >
                    {loadingGuidelines ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
              </div>

              {/* Folder Summary with Delete Buttons */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {(folders || []).filter(folder => folder.guidelineCount > 0).map(folder => (
                  <div key={folder.folderName} className="p-5 bg-purple-50 rounded-xl border border-purple-100 relative group hover:border-purple-300 hover:shadow-md transition-all">
                    {/* Only show delete button for folders with guidelines */}
                    {folder.guidelineCount > 0 && (
                      <button
                        onClick={() => handleDeleteFolder(folder.folderName)}
                        disabled={deletingFolder === folder.folderName}
                        className="absolute top-2 right-2 p-1.5 bg-rose-50 border border-rose-200 text-rose-500 hover:bg-rose-100 rounded-lg transition-all text-xs z-10"
                        title={`Delete ${folder.folderName} folder and all ${folder.guidelineCount} guidelines`}
                      >
                        {deletingFolder === folder.folderName ? '⏳' : '🗑️'}
                      </button>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-purple-500 opacity-80">📁</span>
                        <p className="text-gray-800 font-semibold truncate" title={folder.folderName}>{folder.folderName}</p>
                    </div>

                    <div className="flex items-end justify-between">
                         <div>
                            <p className="text-2xl font-bold text-purple-700 leading-none">{folder.guidelineCount}</p>
                            <p className="text-xs text-gray-500 mt-1">Guidelines</p>
                         </div>
                         <div className="text-right">
                             <p className="text-sm font-medium text-gray-700">{folder.totalClauses}</p>
                             <p className="text-xs text-gray-400">Clauses</p>
                         </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Guidelines List with Expandable Clauses */}
              {loadingGuidelines ? (
                <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4"></div>
                  <p className="text-gray-500">Loading guidelines...</p>
                </div>
              ) : guidelines.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-500">
                  <p className="text-4xl mb-4 grayscale opacity-50">📚</p>
                  <p className="text-lg font-medium text-gray-700">No guidelines found</p>
                  <p className="text-sm mb-6">Upload regulatory documents to get started.</p>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-all"
                  >
                    Upload Documents
                  </button>
                </div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {(guidelines || []).map((guideline) => (
                    <div
                      key={guideline._id}
                      className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden relative group hover:bg-purple-50 hover:border-purple-200 transition-all"
                    >
                      <button
                        onClick={() => handleDeleteGuideline(guideline._id)}
                        disabled={deletingId === guideline._id}
                        className="absolute top-4 right-14 p-1.5 bg-white border border-rose-200 text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-xs z-10 shadow-sm"
                        title="Delete guideline"
                      >
                        {deletingId === guideline._id ? '⏳' : '🗑️'}
                      </button>

                      <button
                        onClick={() => handleToggleGuideline(guideline)}
                        className="w-full p-5 flex items-center justify-between text-left hover:bg-purple-50/50 transition-colors"
                      >
                        <div className="flex-1 pr-12">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold uppercase tracking-wider border border-purple-200">
                                   {guideline.folderName}
                                </span>
                                <span className="text-gray-400 text-xs px-2 border-l border-gray-200">{guideline.guidelineType}</span>
                            </div>
                            <h3 className="text-gray-800 font-semibold text-lg">{guideline.name}</h3>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="px-3 py-1 bg-white text-gray-600 rounded-full text-xs font-medium border border-gray-200">
                            {guideline.clauseCount ?? (guideline.clauses?.length || 0)} clauses
                          </span>
                          <span className={`text-gray-400 transition-transform duration-300 ${expandedGuideline === guideline._id ? 'rotate-180' : ''}`}>
                            ▼
                          </span>
                        </div>
                      </button>

                      {/* Expanded Clause List */}
                      {expandedGuideline === guideline._id && (
                        <div className="px-5 pb-5 pt-2 bg-white border-t border-gray-100">
                          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-2 custom-scrollbar mt-2">
                            {(!guideline.clauses || loadingGuidelineId === guideline._id) ? (
                              <div className="py-8 text-center bg-gray-50 rounded-lg border border-gray-100 shadow-sm">
                                <p className="text-gray-400 text-xs italic mb-2">
                                  {loadingGuidelineId === guideline._id ? '⏳ Fetching detailed clauses...' : '⏳ Waiting to load...'}
                                </p>
                              </div>
                            ) : guideline.clauses.length === 0 ? (
                              <p className="text-gray-400 text-xs italic py-4 text-center">No parsed clauses found.</p>
                            ) : (
                              guideline.clauses.map((clause, idx) => (
                              <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-100 shadow-sm flex gap-4">
                                <div className="flex-shrink-0">
                                    <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-md text-xs font-bold border border-purple-200 block text-center min-w-[3rem]">
                                        {clause.clauseNumber}
                                    </span>
                                </div>
                                <div>
                                    <h4 className="text-gray-800 font-semibold text-sm mb-1">{clause.clauseTitle}</h4>
                                    <p className="text-gray-500 text-xs leading-relaxed">{clause.clauseText}</p>
                                </div>
                              </div>
                                ))
                             )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
                <button
                  onClick={() => setCurrentStep('fetch-sops')}
                  className="px-6 py-3 bg-gray-50 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-100 transition-all"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setCurrentStep('review')}
                  className="px-8 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-all shadow-lg shadow-purple-200"
                >
                  Next: Review Analysis →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl border border-gray-200 transform scale-100">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Upload Guidelines</h2>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Folder / Category Name</label>
                  <input
                    type="text"
                    value={uploadFolderName}
                    onChange={(e) => setUploadFolderName(e.target.value)}
                    placeholder="e.g., EU GMP Part 1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1.5 ml-1">Existing folders will be updated.</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select PDF Documents</label>
                  <div className="relative">
                      <input
                        type="file"
                        multiple
                        accept=".pdf"
                        onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 cursor-pointer"
                      />
                  </div>
                </div>

                {uploadProgress && (
                  <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-sm text-center border border-blue-100 font-medium">
                    {uploadProgress}
                  </div>
                )}
                
                <div className="flex gap-3 mt-8">
                  <button
                    onClick={() => setShowUploadModal(false)}
                    disabled={isUploading}
                    className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl transition-all disabled:opacity-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUploadGuidelines}
                    disabled={isUploading}
                    className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all disabled:opacity-50 shadow-md shadow-purple-200"
                  >
                    {isUploading ? 'Uploading...' : 'Confirm Upload'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review Before Analysis */}
        {currentStep === 'review' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Review Configuration</h2>

              {/* Scope Selection */}
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-6 mb-8">
                <label className="block text-sm font-medium text-gray-600 mb-3">Select Analysis Scope</label>
                <div className="relative">
                  <select
                    value={selectedSopId}
                    onChange={(e) => setSelectedSopId(e.target.value)}
                    className="w-full pl-4 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500/30 appearance-none cursor-pointer"
                  >
                    <option value="all">Analyze All Available SOPs ({sops.length})</option>
                    <optgroup label="Individual SOPs">
                      {sops.map(sop => (
                        <option key={sop._id} value={sop._id}>
                          {sop.identifier} - {cleanSOPName(sop.name, sop.identifier)}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    ▼
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="p-6 bg-purple-50 rounded-2xl border border-purple-200">
                  <p className="text-purple-600 font-medium text-xs uppercase tracking-wider mb-2">Target SOPs</p>
                  <p className="text-4xl font-bold text-gray-800">
                    {selectedSopId === 'all' ? sops.length : 1}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">
                    {selectedSopId === 'all' ? `across ${departments.length} departments` : 'Selected SOP'}
                  </p>
                </div>
                <div className="p-6 bg-rose-50 rounded-2xl border border-rose-200">
                  <p className="text-rose-600 font-medium text-xs uppercase tracking-wider mb-2">Reference Guidelines</p>
                  <p className="text-4xl font-bold text-gray-800">{guidelines.length}</p>
                  <p className="text-gray-500 text-sm mt-1">from {folders.length} categories</p>
                </div>
                <div className="p-6 bg-amber-50 rounded-2xl border border-amber-200">
                  <p className="text-amber-600 font-medium text-xs uppercase tracking-wider mb-2">Total Validation Points</p>
                  <p className="text-4xl font-bold text-gray-800">{totalClauses}</p>
                  <p className="text-gray-500 text-sm mt-1">clauses to verify</p>
                </div>
              </div>

              {/* Analysis Info */}
              <div className="p-6 bg-gray-50 rounded-xl border border-gray-100 mb-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Process Overview</h3>
                <ul className="space-y-3 text-gray-600">
                  <li className="flex items-start gap-3">
                    <span className="text-purple-700 bg-purple-100 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border border-purple-200 flex-shrink-0">1</span>
                    <span>Cross-referencing each SOP against all active guidelines</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-purple-700 bg-purple-100 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border border-purple-200 flex-shrink-0">2</span>
                    <span>AI-driven compliance scoring (Compliant, Partial, Non-Compliant)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-purple-700 bg-purple-100 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border border-purple-200 flex-shrink-0">3</span>
                    <span>Generation of specific section references and remediation suggestions</span>
                  </li>
                </ul>
              </div>

              {/* Estimated Time */}
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-8 text-blue-700">
                 <span className="text-xl">⏱️</span>
                 <div>
                    <p className="font-semibold text-sm">Estimated Duration</p>
                    <p className="text-xs text-blue-600">
                      ~{Math.ceil((selectedSopId === 'all' ? sops.length : 1) * 0.5)} minutes ({(selectedSopId === 'all' ? sops.length : 1)} SOPs × 30s)
                    </p>
                 </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentStep('fetch-guidelines')}
                  className="px-6 py-3 bg-gray-50 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-100 transition-all"
                >
                  ← Back
                </button>
                <button
                  onClick={runFullAnalysis}
                  disabled={sops.length === 0 || guidelines.length === 0}
                  className="px-10 py-4 bg-purple-600 text-white rounded-xl font-bold text-lg hover:bg-purple-700 transition-all disabled:opacity-50 shadow-lg shadow-purple-200"
                >
                  Start Analysis
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Analysis in Progress */}
        {currentStep === 'analyze' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
              <h2 className="text-2xl font-bold text-gray-800 mb-8">
                {isAnalyzing ? 'Processing Compliance Checks...' : 'Analysis Complete'}
              </h2>

              <div className="max-w-xl mx-auto">
                {isAnalyzing && (
                  <div className="mb-8">
                    <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-6"></div>
                    <p className="text-gray-500 animate-pulse">{analysisProgress}</p>
                  </div>
                )}

                {/* Current Result Preview */}
                {currentResult && (
                  <div className="p-6 bg-gray-50 rounded-xl border border-gray-200 text-left shadow-sm transition-all animate-in zoom-in-95 duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Latest Result</span>
                        {currentResult.complianceStatus && (
                            <span className={`px-2 py-1 rounded-md text-xs font-bold ${getStatusColor(currentResult.complianceStatus)}`}>
                            {currentResult.complianceStatus}
                            </span>
                        )}
                    </div>
                    
                    <h3 className="text-lg font-bold text-gray-800 mb-1">{currentResult.sopName}</h3>
                    <p className="text-gray-500 text-sm mb-4 font-mono">{currentResult.sopIdentifier}</p>

                    <div className="flex items-center gap-2">
                        <span className="text-gray-600 text-sm font-medium">Score:</span>
                        <span className={`text-2xl font-bold ${getScoreColor(currentResult.overallScore)}`}>
                          {currentResult.overallScore}/10
                        </span>
                    </div>
                  </div>
                )}

                {analysisComplete && (
                  <div className="mt-8">
                    <button
                      onClick={() => setCurrentStep('results')}
                      className="px-8 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-200"
                    >
                      View Full Report →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Results */}
        {currentStep === 'results' && (
          <div className={`${isFullScreen ? 'fixed inset-0 z-50 bg-[#f8f9fa] p-6 overflow-hidden' : 'grid grid-cols-1 xl:grid-cols-12 gap-8 h-[calc(100vh-180px)]'}`}>

            {/* Reports Sidebar */}
            {!isFullScreen && (
            <div className={`${selectedReport ? 'xl:col-span-4' : 'xl:col-span-12'} bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden transition-all duration-500`}>
              <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  Generated Reports
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-bold">
                    {reports?.length || 0}
                  </span>
                </h2>
                <button
                  onClick={fetchReports}
                  className="p-2 hover:bg-gray-100 text-gray-400 hover:text-purple-600 rounded-lg transition-all"
                  title="Refresh"
                >
                  <span className={loadingReports ? "animate-spin block" : ""}>🔄</span>
                </button>
              </div>

              {loadingReports ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-3"></div>
                  <p className="text-gray-400 text-sm">Loading...</p>
                </div>
              ) : (reports?.length || 0) === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-gray-400">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <span className="text-2xl grayscale opacity-50">📊</span>
                  </div>
                  <p className="font-medium text-gray-500">No reports generated</p>
                  <button
                    onClick={() => setCurrentStep('review')}
                    className="mt-4 text-purple-600 text-sm font-medium hover:underline"
                  >
                    Start New Analysis
                  </button>
                </div>
              ) : (
                <div className={`overflow-y-auto p-3 space-y-2 light-scrollbar ${selectedReport ? 'flex-1' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 space-y-0 w-full'}`}>
                  {(reports || []).map(report => (
                    <div
                      key={report._id}
                      onClick={() => {
                        handleSelectReport(report);
                        setFilterStatus('all');
                      }}
                      className={`relative group p-5 rounded-2xl text-left transition-all duration-300 cursor-pointer border-2 ${
                        selectedReport?._id === report._id
                          ? 'bg-purple-50 border-purple-400 shadow-md shadow-purple-100'
                          : 'bg-gray-50 border-gray-100 hover:border-purple-300 hover:bg-purple-50/50'
                      }`}
                    >
                      <button
                         onClick={(e) => handleDeleteReport(report._id, e)}
                         className="absolute top-2 right-2 p-1.5 hover:bg-rose-50 text-gray-300 hover:text-rose-500 rounded-md opacity-0 group-hover:opacity-100 transition-all z-10"
                         title="Delete Report"
                       >
                        🗑️
                      </button>

                      <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {report.sopIdentifier}
                        </span>
                        <div className="flex items-center gap-2">
                           <div className={`w-3 h-3 rounded-full ${
                             report.overallScore >= 7 ? 'bg-emerald-500' :
                             report.overallScore >= 4 ? 'bg-amber-500' :
                             'bg-rose-500'
                           }`} />
                           <div className="text-lg font-black text-gray-800">
                             <span className={getScoreColor(report.overallScore)}>{report.overallScore}</span>
                             <span className="text-gray-400 text-xs">/10</span>
                           </div>
                        </div>
                      </div>

                      <h3 className={`font-bold text-xs leading-tight mb-4 line-clamp-2 uppercase tracking-tight ${selectedReport?._id === report._id ? 'text-purple-700' : 'text-gray-700'}`} title={report.sopName}>
                        {report.sopName}
                      </h3>

                      <div className="flex items-center justify-between mt-auto">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border ${getStatusColor(report.complianceStatus)}`}>
                            {report.complianceStatus}
                        </span>
                        <span className="text-[9px] text-gray-400 font-medium font-mono">
                          {new Date(report.analyzedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Main Content Area - Report Detail */}
            {selectedReport && (
              <div className={`${isFullScreen ? 'h-full' : 'xl:col-span-8'} flex flex-col gap-6 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300`}>
                
                {/* 1. Header Card */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 relative overflow-hidden flex-shrink-0">
                  <div className="flex flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-6">
                      {/* Score Indicator */}
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-5xl font-black tracking-tighter ${getScoreColor(selectedReport.overallScore)}`}>
                          {selectedReport.overallScore}
                        </span>
                        <span className="text-xl font-bold text-gray-400">/10</span>
                      </div>

                      <div className="h-10 w-px bg-gray-200" />

                      <div className="space-y-0.5">
                        <p className="text-purple-600 text-[10px] font-black uppercase tracking-[0.2em] leading-none">{selectedReport.department}</p>
                        <p className={`text-lg font-black tracking-tight ${getScoreColor(selectedReport.overallScore)} leading-tight`}>
                          {selectedReport.complianceStatus}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full ${
                        selectedReport.overallScore >= 7 ? 'bg-emerald-500' :
                        selectedReport.overallScore >= 4 ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`} />

                      <button
                        onClick={() => setIsFullScreen(!isFullScreen)}
                        className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-xl transition-all border border-gray-200 hover:scale-110 active:scale-95"
                      >
                        {isFullScreen ? '↙️' : '↗️'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto pr-2 space-y-6 light-scrollbar pb-10">
                  
                  {/* Guideline Filter Dropdown */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-600 mb-2">Filter by Guideline Folder</label>
                    <select
                      value={filterGuideline}
                      onChange={(e) => setFilterGuideline(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-sm font-medium"
                    >
                      <option value="all">All Guidelines ({selectedReport.findings?.length || 0})</option>
                      {folders.filter(f => f.guidelineCount > 0).map(folder => {
                        const folderFindings = (selectedReport.findings || []).filter(f => f.folderName === folder.folderName);
                        return (
                          <option key={folder.folderName} value={folder.folderName}>
                            {folder.folderName} ({folderFindings.length})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Filterable Summary Stats */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                     {/* Total Checked */}
                     <div className="p-6 bg-blue-50 rounded-2xl border border-blue-200 flex flex-col justify-between">
                        <div className="flex justify-between items-center mb-4">
                          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Total Checked</p>
                          <span className="text-2xl">📋</span>
                        </div>
                        <p className="text-4xl font-black text-gray-800">{selectedReport.findings?.length || 0}</p>
                     </div>

                     {/* Compliant Filter */}
                     <button
                       onClick={() => setFilterStatus(filterStatus === 'compliant' ? 'all' : 'compliant')}
                       className={`p-6 rounded-2xl border transition-all text-left flex flex-col justify-between ${
                         filterStatus === 'compliant' ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-300 shadow-md' : 'bg-emerald-50 border-emerald-200 hover:border-emerald-400'
                       }`}
                     >
                        <div className="flex justify-between items-center mb-4">
                          <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Compliant</p>
                          <span className="text-2xl">✅</span>
                        </div>
                        <p className="text-4xl font-black text-emerald-700">{selectedReport.compliantCount}</p>
                     </button>

                     {/* Partial Filter */}
                     <button
                       onClick={() => setFilterStatus(filterStatus === 'partial' ? 'all' : 'partial')}
                       className={`p-6 rounded-2xl border transition-all text-left flex flex-col justify-between ${
                         filterStatus === 'partial' ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300 shadow-md' : 'bg-amber-50 border-amber-200 hover:border-amber-400'
                       }`}
                     >
                        <div className="flex justify-between items-center mb-4">
                          <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">Partial</p>
                          <span className="text-2xl">⚠️</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <p className="text-4xl font-black text-amber-700">{selectedReport.partialCount}</p>
                            <p className="text-xs font-bold text-amber-500 font-mono">
                              ({Math.round((selectedReport.partialCount / (selectedReport.findings?.length || 1)) * 100)}%)
                            </p>
                        </div>
                     </button>

                     {/* Non-Compliant Filter */}
                     <button
                       onClick={() => setFilterStatus(filterStatus === 'non-compliant' ? 'all' : 'non-compliant')}
                       className={`p-6 rounded-2xl border transition-all text-left flex flex-col justify-between ${
                         filterStatus === 'non-compliant' ? 'bg-rose-100 border-rose-400 ring-2 ring-rose-300 shadow-md' : 'bg-rose-50 border-rose-200 hover:border-rose-400'
                       }`}
                     >
                        <div className="flex justify-between items-center mb-4">
                          <p className="text-xs font-bold text-rose-700 uppercase tracking-widest">Non-Compliant</p>
                          <span className="text-2xl">❌</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <p className="text-4xl font-black text-rose-700">{selectedReport.nonCompliantCount}</p>
                            <p className="text-xs font-bold text-rose-400 font-mono">
                              ({Math.round((selectedReport.nonCompliantCount / (selectedReport.findings?.length || 1)) * 100)}%)
                            </p>
                        </div>
                     </button>
                  </div>

                  {/* 3. Compliance Distribution */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Compliance Distribution</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{selectedReport.findings?.length || 0} applicable clauses</p>
                    </div>
                    <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex shadow-inner border border-gray-200">
                      <div 
                        className="bg-emerald-500 h-full transition-all duration-1000 flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ width: `${(selectedReport.compliantCount / (selectedReport.findings?.length || 1)) * 100}%` }}
                      >
                        {selectedReport.compliantCount > 0 && Math.round((selectedReport.compliantCount / (selectedReport.findings?.length || 1)) * 100) > 5 && `${Math.round((selectedReport.compliantCount / (selectedReport.findings?.length || 1)) * 100)}%`}
                      </div>
                      <div 
                        className="bg-amber-500 h-full transition-all duration-1000 flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ width: `${(selectedReport.partialCount / (selectedReport.findings?.length || 1)) * 100}%` }}
                      >
                        {selectedReport.partialCount > 0 && Math.round((selectedReport.partialCount / (selectedReport.findings?.length || 1)) * 100) > 5 && `${Math.round((selectedReport.partialCount / (selectedReport.findings?.length || 1)) * 100)}%`}
                      </div>
                      <div 
                        className="bg-rose-500 h-full transition-all duration-1000 flex items-center justify-center text-[10px] font-bold text-white shadow-[inset_0_0_10px_rgba(0,0,0,0.1)]"
                        style={{ width: `${(selectedReport.nonCompliantCount / (selectedReport.findings?.length || 1)) * 100}%` }}
                      >
                        {selectedReport.nonCompliantCount > 0 && Math.round((selectedReport.nonCompliantCount / (selectedReport.findings?.length || 1)) * 100) > 5 && `${Math.round((selectedReport.nonCompliantCount / (selectedReport.findings?.length || 1)) * 100)}%`}
                      </div>
                    </div>
                  </div>

                  {/* Selection Summary Bar */}
                  {applicableFindings.size > 0 && (
                    <div className="bg-purple-50 border-2 border-purple-300 rounded-2xl p-5 flex justify-between items-center shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white font-black text-lg shadow-md">
                          {applicableFindings.size}
                        </div>
                        <div>
                          <p className="text-purple-700 font-bold text-sm">
                            {applicableFindings.size} finding{applicableFindings.size !== 1 ? 's' : ''} selected
                          </p>
                          <p className="text-purple-600 text-xs">
                            Ready to generate compiled SOP text
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setApplicableFindings(new Set())}
                          className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-all border border-gray-200"
                        >
                          Clear Selection
                        </button>
                        <button
                          onClick={submitApplicableFindings}
                          disabled={submittingApplicable}
                          className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-sm font-bold uppercase tracking-wider shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {submittingApplicable ? (
                            <>
                              <span className="animate-spin">⏳</span>
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <span>📝</span>
                              <span>Generate Compiled SOP Text</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Detailed Findings Header */}
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-white flex flex-col gap-3 sticky top-0 z-10">
                      {/* Row 1: title + clear filter */}
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-3">
                          <span className="text-xl">📔</span>
                          Findings with Guideline References
                          {filterStatus !== 'all' && (
                            <span className="text-[10px] font-black text-white px-2.5 py-1 bg-purple-600 rounded-md uppercase tracking-[0.2em]">
                              {filterStatus}
                            </span>
                          )}
                        </h3>
                        {filterStatus !== 'all' && (
                          <button
                            onClick={() => setFilterStatus('all')}
                            className="text-xs font-medium text-purple-600 hover:text-purple-700 hover:underline"
                          >
                            Clear Filters
                          </button>
                        )}
                      </div>

                      {/* Row 2: Select All + Generate Summary */}
                      <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-100">
                        <button
                          onClick={toggleSelectAllFindings}
                          className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                        >
                          {allFindingsSelected ? (
                            <CheckSquare className="h-5 w-5 text-purple-600" />
                          ) : someFindingsSelected ? (
                            <div className="h-5 w-5 rounded border-2 border-purple-500 bg-purple-100 flex items-center justify-center">
                              <div className="h-2 w-2 bg-purple-600 rounded-sm" />
                            </div>
                          ) : (
                            <Square className="h-5 w-5 text-gray-400" />
                          )}
                          {allFindingsSelected ? 'Deselect All' : 'Select All Results'}
                          {someFindingsSelected && (
                            <span className="ml-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-bold rounded-full border border-purple-200">
                              {selectedFindingIds.size} selected
                            </span>
                          )}
                        </button>

                        <button
                          onClick={() => setShowConsolidatedSummary(true)}
                          disabled={selectedFindingIds.size === 0}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            selectedFindingIds.size > 0
                              ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-200'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                          }`}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Generate Consolidated Summary
                          {selectedFindingIds.size > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 bg-white/30 rounded text-[10px]">{selectedFindingIds.size}</span>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="p-6 space-y-6 bg-gray-50 min-h-[400px]">
                      {selectedReport.findings && selectedReport.findings.length > 0
                        ? visibleFindings.map(({ f: finding, i: globalIdx }) => {
                            const isSelected = selectedFindingIds.has(globalIdx);
                            return (
                              <div key={globalIdx} className="relative transition-all duration-300">
                                {/* Selection checkbox */}
                                <div className="absolute -left-2 top-5 z-10">
                                  <button
                                    onClick={() => toggleFindingSelect(globalIdx)}
                                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all shadow-sm ${
                                      isSelected
                                        ? 'bg-purple-600 border-purple-500'
                                        : 'bg-white border-gray-300 hover:border-purple-400'
                                    }`}
                                    title={isSelected ? 'Deselect' : 'Select for summary'}
                                  >
                                    {isSelected && <CheckSquare className="h-3.5 w-3.5 text-white" />}
                                  </button>
                                </div>
                                {/* Highlight ring when selected */}
                                <div className={`transition-all duration-200 rounded-2xl ${
                                  isSelected ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-gray-50' : ''
                                }`}>
                                  <FindingCard
                                    id={`finding-${globalIdx}`}
                                    requirement={finding.guidelineRequirement || finding.clauseText || ''}
                                    gap={finding.mismatchExplanation || finding.highlightedIssue || ''}
                                    impact={finding.highlightedIssue || 'Impact not specified'}
                                    suggestion={finding.suggestedAction || ''}
                                    reference={`${finding.folderName} → ${finding.guidelineName}`}
                                    clauseNumber={finding.clauseNumber}
                                    clauseTitle={finding.clauseTitle || ''}
                                    clauseText={finding.clauseText || ''}
                                    guidelineName={finding.guidelineName || ''}
                                    folderName={finding.folderName || ''}
                                    pdfName={finding.pdfName || ''}
                                    severity={finding.issueSeverity || (finding.criticality === 'critical' || finding.criticality === 'high' ? 'major' : 'minor')}
                                    status={finding.complianceLevel}
                                    confidence={finding.matchConfidence || 0}
                                    sopSection={finding.sopSectionAffected?.split(' - ')[0] || 'N/A'}
                                    sopTextSnippet={finding.sopTextSnippet || ''}
                                    suggestedText={finding.suggestedText || ''}
                                    onToggleApplicable={handleToggleApplicable}
                                    isApplicable={applicableFindings.has(`finding-${globalIdx}`)}
                                  />
                                </div>
                              </div>
                            );
                          })
                        : (
                          <div className="text-center py-20 text-gray-400">
                            <p>No findings found.</p>
                          </div>
                        )
                      }

                      {visibleFindings.length === 0 && selectedReport.findings && selectedReport.findings.length > 0 && (
                        <div className="text-center py-20">
                          <p className="text-gray-400 mb-2">No findings match the current filters</p>
                          <div className="flex gap-2 justify-center mt-3">
                            {filterStatus !== 'all' && (
                              <button
                                onClick={() => setFilterStatus('all')}
                                className="text-purple-400 font-medium hover:text-purple-300 hover:underline text-sm"
                              >
                                Clear Status Filter
                              </button>
                            )}
                            {filterGuideline !== 'all' && (
                              <button
                                onClick={() => setFilterGuideline('all')}
                                className="text-purple-400 font-medium hover:text-purple-300 hover:underline text-sm"
                              >
                                Clear Guideline Filter
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Consolidated Summary Modal ─────────────────────────────────────── */}
      {showConsolidatedSummary && (
        <div className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-all duration-300 ${isSummaryFullScreen ? 'p-0' : 'p-4 pt-12'}`}>
          <div className={`bg-white border border-gray-200 shadow-2xl flex flex-col transition-all duration-300 ${
            isSummaryFullScreen
              ? 'fixed inset-0 w-screen h-screen rounded-none'
              : 'w-full max-w-4xl max-h-[85vh] rounded-2xl'
          }`}>
            {/* Header */}
            <div className={`flex flex-shrink-0 items-center justify-between px-6 py-4 border-b border-gray-100 bg-purple-50 ${isSummaryFullScreen ? '' : 'rounded-t-2xl'}`}>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-xl">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Consolidated Compliance Summary</h2>
                  <p className="text-xs text-gray-500">
                    {consolidatedSections.length} section{consolidatedSections.length !== 1 ? 's' : ''} • {selectedFindingIds.size} findings merged
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSummaryFullScreen(!isSummaryFullScreen)}
                  className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-700 transition-all mr-2"
                  title={isSummaryFullScreen ? "Exit Full Screen" : "Full Screen"}
                >
                  {isSummaryFullScreen
                    ? <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    : <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                  }
                </button>

                <button
                  onClick={() => {
                    const lines: string[] = [
                      `CONSOLIDATED COMPLIANCE SUMMARY — ${selectedReport?.sopName || ''}`,
                      `Generated: ${new Date().toLocaleString()}`,
                      `Sections: ${consolidatedSections.length} | Findings: ${selectedFindingIds.size}`,
                      '', '═'.repeat(60), ''
                    ];
                    consolidatedSections.forEach((sec, i) => {
                      lines.push(`SECTION ${sec.sectionKey}${sec.isMulti ? ` (${sec.findings.length} changes combined)` : ''}`);
                      lines.push(`Sources: ${sec.sources.join(', ')}`);
                      if (sec.clauses.length) lines.push(`Clauses: ${sec.clauses.join(', ')}`);
                      lines.push(''); lines.push(sec.combinedAction);
                      if (sec.combinedSuggestion) { lines.push(''); lines.push('PROPOSED VERBIAGE:'); lines.push(sec.combinedSuggestion); }
                      if (i < consolidatedSections.length - 1) { lines.push(''); lines.push('─'.repeat(60)); lines.push(''); }
                    });
                    navigator.clipboard.writeText(lines.join('\n'));
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy All
                </button>
                <button
                  onClick={() => setShowConsolidatedSummary(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-700 transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Sections */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-gray-50">
              {consolidatedSections.map((sec) => (
                <ConsolidatedSectionCard key={sec.sectionKey} sec={sec} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
