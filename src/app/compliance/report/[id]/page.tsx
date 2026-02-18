'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import FindingCard from '../../components/FindingCard';
import {
  Layers, List as ListIcon, PieChart, ChevronRight, ChevronDown,
  AlertTriangle, CheckCircle, Folder, CheckSquare, Square, Sparkles,
  X, Copy, FileText, BookOpen, ClipboardList
} from 'lucide-react';

interface Finding {
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
  suggestedText?: string;
  guidelineRequirement?: string;
  specificGap?: string;
  sopSectionNumber?: string;
}

interface ComplianceReport {
  _id: string;
  sopIdentifier: string;
  sopName: string;
  sopVersion: string;
  department: string;
  overallScore: number;
  complianceStatus: string;
  findings: Finding[];
  totalGuidelinesChecked: number;
  compliantCount: number;
  partialCount: number;
  nonCompliantCount: number;
  analyzedAt: string;
  processingTimeMs: number;
}

// ─── Consolidated section type ────────────────────────────────────────────────
interface ConsolidatedSection {
  sectionKey: string;         // e.g. "5.11" or "General"
  findings: Finding[];        // all findings for this section
  isMulti: boolean;           // true if >1 finding
  sources: string[];          // unique guideline names
  clauses: string[];          // unique clause numbers
  combinedSuggestion: string; // merged suggested text
  combinedAction: string;     // merged suggested action
}

// ─── Helper: normalise section label ─────────────────────────────────────────
function normaliseSectionKey(finding: Finding): string {
  const raw =
    finding.sopSectionAffected ||
    finding.sopSectionNumber ||
    'General';
  // Extract leading numeric pattern like "5.11", "Section 5.11", "Sec. 5.11"
  const m = raw.match(/(\d[\d.]*)/);
  return m ? m[1] : raw.trim() || 'General';
}

// ─── Helper: build consolidated sections from selected findings ───────────────
function buildConsolidatedSections(findings: Finding[]): ConsolidatedSection[] {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = normaliseSectionKey(f);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }

  const sections: ConsolidatedSection[] = [];
  for (const [key, group] of map.entries()) {
    const sources = Array.from(new Set(
      group.map(f => f.folderName || f.guidelineName || f.pdfName || 'Guideline').filter(Boolean)
    ));
    const clauses = Array.from(new Set(
      group.map(f => f.clauseNumber).filter(Boolean)
    ));

    // Merge suggested texts
    const combinedSuggestion = group
      .map(f => f.suggestedText || (f.suggestedAction?.match(/```([\s\S]*?)```/)?.[1]) || '')
      .filter(Boolean)
      .join('\n\n');

    // Merge suggested actions (strip code blocks)
    const combinedAction = group
      .map((f, i) => {
        const action = f.suggestedAction?.replace(/```[\s\S]*?```/g, '').trim() || '';
        if (group.length === 1) return action;
        const clause = f.clauseNumber ? ` [${f.clauseNumber}]` : '';
        return `${i + 1}. ${action}${clause}`;
      })
      .filter(Boolean)
      .join('\n\n');

    sections.push({
      sectionKey: key,
      findings: group,
      isMulti: group.length > 1,
      sources,
      clauses,
      combinedSuggestion,
      combinedAction,
    });
  }

  // Sort: numeric sections first, then alphabetical
  sections.sort((a, b) => {
    const na = parseFloat(a.sectionKey);
    const nb = parseFloat(b.sectionKey);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return a.sectionKey.localeCompare(b.sectionKey);
  });

  return sections;
}

// ─── Summary panel ────────────────────────────────────────────────────────────
function SummaryPanel({
  sections,
  sopName,
  onClose,
}: {
  sections: ConsolidatedSection[];
  sopName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const fullText = useMemo(() => {
    const lines: string[] = [
      `CONSOLIDATED COMPLIANCE UPDATE SUMMARY`,
      `SOP: ${sopName}`,
      `Generated: ${new Date().toLocaleString()}`,
      `Total Sections Affected: ${sections.length}`,
      `Total Findings: ${sections.reduce((s, c) => s + c.findings.length, 0)}`,
      '',
      '═'.repeat(70),
      '',
    ];

    sections.forEach((sec, idx) => {
      lines.push(`SECTION ${sec.sectionKey}${sec.isMulti ? ` — ${sec.findings.length} COMBINED CHANGES` : ''}`);
      lines.push(`Sources: ${sec.sources.join(', ')}`);
      if (sec.clauses.length) lines.push(`Clauses: ${sec.clauses.join(', ')}`);
      lines.push('');

      if (sec.isMulti) {
        lines.push('CONSOLIDATED ACTIONS:');
        lines.push(sec.combinedAction);
      } else {
        lines.push('ACTION:');
        lines.push(sec.combinedAction);
      }

      if (sec.combinedSuggestion) {
        lines.push('');
        lines.push('PROPOSED VERBIAGE:');
        lines.push(sec.combinedSuggestion);
      }

      if (idx < sections.length - 1) {
        lines.push('');
        lines.push('─'.repeat(70));
        lines.push('');
      }
    });

    return lines.join('\n');
  }, [sections, sopName]);

  const handleCopy = () => {
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-16 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-purple-500/30 w-full max-w-4xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-purple-900/40 to-blue-900/40 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-xl">
              <Sparkles className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Consolidated Compliance Summary</h2>
              <p className="text-xs text-gray-400">
                {sections.length} section{sections.length !== 1 ? 's' : ''} •{' '}
                {sections.reduce((s, c) => s + c.findings.length, 0)} findings merged
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Copied!' : 'Copy All'}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Sections */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {sections.map((sec) => (
            <div
              key={sec.sectionKey}
              className={`rounded-2xl border overflow-hidden ${
                sec.isMulti
                  ? 'border-purple-500/40 bg-purple-500/5'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              {/* Section header */}
              <div className={`px-5 py-3 flex items-center justify-between border-b ${
                sec.isMulti ? 'border-purple-500/20 bg-purple-500/10' : 'border-white/5 bg-white/5'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
                    sec.isMulti
                      ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40'
                      : 'bg-white/10 text-gray-300 border border-white/10'
                  }`}>
                    Section {sec.sectionKey}
                  </div>
                  {sec.isMulti && (
                    <span className="text-xs text-purple-400 font-semibold flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" />
                      {sec.findings.length} changes combined
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    const text = [
                      sec.combinedAction,
                      sec.combinedSuggestion ? `\nPROPOSED VERBIAGE:\n${sec.combinedSuggestion}` : ''
                    ].filter(Boolean).join('\n');
                    navigator.clipboard.writeText(text);
                  }}
                  className="text-[10px] text-gray-500 hover:text-white transition-colors flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Sources */}
                <div className="flex flex-wrap gap-2">
                  {sec.sources.map((src) => (
                    <span
                      key={src}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[10px] font-bold text-blue-300 uppercase tracking-wider"
                    >
                      <BookOpen className="h-3 w-3" />
                      {src}
                    </span>
                  ))}
                  {sec.clauses.map((cl) => (
                    <span
                      key={cl}
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-700/50 border border-white/10 rounded-lg text-[10px] font-bold text-gray-400"
                    >
                      <FileText className="h-3 w-3" />
                      Clause {cl}
                    </span>
                  ))}
                </div>

                {/* Individual finding pills (multi only) */}
                {sec.isMulti && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Issues being resolved:</p>
                    <div className="space-y-1">
                      {sec.findings.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                          <span className="mt-0.5 w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[9px] font-black flex-shrink-0">{i + 1}</span>
                          <span className="leading-relaxed">{f.mismatchExplanation || f.highlightedIssue || f.specificGap || 'Gap identified'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Consolidated Action */}
                <div>
                  <p className="text-[10px] text-emerald-400 font-black uppercase tracking-wider mb-2 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {sec.isMulti ? 'Consolidated Action' : 'Suggested Action'}
                  </p>
                  <p className="text-sm text-slate-200 font-medium leading-relaxed whitespace-pre-wrap">
                    {sec.combinedAction}
                  </p>
                </div>

                {/* Proposed Verbiage */}
                {sec.combinedSuggestion && (
                  <div className="bg-black/40 rounded-xl border border-white/5 overflow-hidden">
                    <div className="px-4 py-2 bg-white/5 border-b border-white/5">
                      <span className="text-[9px] text-emerald-400 font-black uppercase tracking-widest">
                        {sec.isMulti ? 'Combined Proposed Verbiage' : 'Proposed Verbiage'}
                      </span>
                    </div>
                    <div className="p-4">
                      <pre className="text-slate-300 font-mono text-xs whitespace-pre-wrap leading-relaxed">
                        {sec.combinedSuggestion}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ComplianceReportDetail() {
  const router = useRouter();
  const params = useParams();
  const reportId = params.id as string;

  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<'all' | 'compliant' | 'partial' | 'non-compliant'>('all');
  const [filterGuideline, setFilterGuideline] = useState<string>('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [grouping, setGrouping] = useState<'none' | 'folder'>('folder');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (reportId) fetchReport();
  }, [reportId]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/compliance/analyze?reportId=${reportId}`);
      const data = await response.json();
      if (data.success) setReport(data.report);
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredFindings = report?.findings.filter(finding => {
    if (filterLevel !== 'all' && finding.complianceLevel !== filterLevel) return false;
    if (filterGuideline !== 'all' && finding.folderName !== filterGuideline) return false;
    return true;
  }) || [];

  // Indices of filtered findings within the original array (for stable IDs)
  const filteredIndices = useMemo(() => {
    if (!report) return [];
    return report.findings.reduce<number[]>((acc, f, i) => {
      if (filterLevel !== 'all' && f.complianceLevel !== filterLevel) return acc;
      if (filterGuideline !== 'all' && f.folderName !== filterGuideline) return acc;
      acc.push(i);
      return acc;
    }, []);
  }, [report, filterLevel, filterGuideline]);

  const allSelected = filteredIndices.length > 0 && filteredIndices.every(i => selectedIds.has(i));
  const someSelected = filteredIndices.some(i => selectedIds.has(i));

  const toggleSelectAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds);
      filteredIndices.forEach(i => next.delete(i));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filteredIndices.forEach(i => next.add(i));
      setSelectedIds(next);
    }
  };

  const toggleSelect = useCallback((globalIdx: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(globalIdx)) next.delete(globalIdx);
      else next.add(globalIdx);
      return next;
    });
  }, []);

  const selectedFindings = useMemo(
    () => report?.findings.filter((_, i) => selectedIds.has(i)) || [],
    [report, selectedIds]
  );

  const consolidatedSections = useMemo(
    () => buildConsolidatedSections(selectedFindings),
    [selectedFindings]
  );

  const guidelineFolders = Array.from(new Set(report?.findings.map(f => f.folderName) || []));

  const folderStats = useMemo(() => {
    if (!report) return {};
    return report.findings.reduce((acc, f) => {
      const folder = f.folderName || 'Other Guidelines';
      if (!acc[folder]) acc[folder] = { total: 0, critical: 0, major: 0, minor: 0, nonCompliant: 0, partial: 0, compliant: 0 };
      acc[folder].total++;
      if (f.complianceLevel === 'non-compliant') { acc[folder].nonCompliant++; acc[folder].critical++; }
      else if (f.complianceLevel === 'partial') { acc[folder].partial++; acc[folder].major++; }
      else if (f.complianceLevel === 'compliant') { acc[folder].compliant++; }
      return acc;
    }, {} as Record<string, { total: number; critical: number; major: number; minor: number; nonCompliant: number; partial: number; compliant: number }>);
  }, [report]);

  const groupedFindings = useMemo(() => {
    if (grouping === 'none') return { 'All Findings': filteredFindings };
    return filteredFindings.reduce((groups, finding) => {
      const folder = finding.folderName || 'Other Guidelines';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(finding);
      return groups;
    }, {} as Record<string, Finding[]>);
  }, [filteredFindings, grouping]);

  useEffect(() => {
    if (grouping === 'folder') setExpandedGroups(new Set(Object.keys(groupedFindings)));
  }, [grouping, groupedFindings]);

  const toggleGroup = (group: string) => {
    const newSet = new Set(expandedGroups);
    if (newSet.has(group)) newSet.delete(group);
    else newSet.add(group);
    setExpandedGroups(newSet);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 9) return 'text-emerald-400';
    if (score >= 6) return 'text-amber-400';
    return 'text-rose-400';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Fully Compliant': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'Partially Compliant': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'Non-Compliant': return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default: return 'bg-white/5 text-gray-300 border-white/10';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto" />
          <p className="text-gray-400 mt-4 text-sm font-medium">Loading report...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-400 font-semibold">Report not found</p>
          <button
            onClick={() => router.push('/compliance')}
            className="mt-6 px-6 py-2.5 bg-white/5 border border-white/10 text-gray-300 rounded-xl hover:bg-white/10 transition-all font-medium"
          >
            ← Back to Compliance
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 font-sans text-white pb-20">

      {/* Summary Modal */}
      {showSummary && (
        <SummaryPanel
          sections={consolidatedSections}
          sopName={report.sopName}
          onClose={() => setShowSummary(false)}
        />
      )}

      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 right-1/3 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Header */}
      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/compliance')}
              className="p-2 hover:bg-white/10 rounded-lg text-gray-400 transition-all"
              title="Back"
            >
              ←
            </button>
            <h1 className="text-lg font-bold text-white truncate max-w-md">{report.sopName}</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${getStatusColor(report.complianceStatus)}`}>
              {report.complianceStatus}
            </span>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Score</p>
              <p className={`text-xl font-bold ${getScoreColor(report.overallScore)} leading-none`}>
                {report.overallScore}/10
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 relative z-10">

        {/* Overview Card */}
        <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl shadow-sm border border-white/5 p-8 mb-8">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2.5 py-0.5 bg-white/10 text-gray-300 text-xs font-bold rounded border border-white/10 uppercase tracking-wider">
                  {report.department}
                </span>
                <span className="text-gray-400 text-sm font-mono font-medium">{report.sopIdentifier}</span>
                {report.sopVersion && <span className="text-gray-400 text-sm">v{report.sopVersion}</span>}
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">{report.sopName}</h2>
              <div className="flex items-center gap-6 text-sm text-gray-400">
                <span>📅 {new Date(report.analyzedAt).toLocaleString()}</span>
                <span>⏱️ {(report.processingTimeMs / 1000).toFixed(1)}s</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 w-full md:w-auto min-w-[400px]">
              {[
                { label: 'Total', value: report.totalGuidelinesChecked, cls: 'bg-slate-700/30 border-white/10 text-white' },
                { label: 'Compliant', value: report.compliantCount, cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
                { label: 'Partial', value: report.partialCount, cls: 'bg-amber-500/10 border-amber-500/30 text-amber-400' },
                { label: 'Non-Compliant', value: report.nonCompliantCount, cls: 'bg-rose-500/10 border-rose-500/30 text-rose-400' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl p-4 border text-center ${s.cls}`}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">{s.label}</p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Guideline Impact Breakdown */}
        {report.findings.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <PieChart className="h-5 w-5 text-purple-400" />
              Guideline Impact Breakdown
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(folderStats).map(([folder, stats]) => (
                <div key={folder} className="bg-slate-800/40 border border-white/5 p-4 rounded-xl flex items-center justify-between hover:bg-slate-800/60 transition-all">
                  <div className="flex flex-col">
                    <span className="font-semibold text-white text-sm truncate max-w-[180px]" title={folder}>{folder}</span>
                    <span className="text-xs text-gray-500">{stats.total} total checks</span>
                  </div>
                  <div className="flex gap-2">
                    {stats.nonCompliant > 0 && (
                      <div className="flex flex-col items-center px-2 py-1 bg-rose-500/10 rounded border border-rose-500/20">
                        <span className="text-rose-400 font-bold text-xs">{stats.nonCompliant}</span>
                        <span className="text-[9px] text-rose-400/70 uppercase">Issues</span>
                      </div>
                    )}
                    {stats.partial > 0 && (
                      <div className="flex flex-col items-center px-2 py-1 bg-amber-500/10 rounded border border-amber-500/20">
                        <span className="text-amber-400 font-bold text-xs">{stats.partial}</span>
                        <span className="text-[9px] text-amber-400/70 uppercase">Partial</span>
                      </div>
                    )}
                    {stats.compliant > 0 && stats.nonCompliant === 0 && stats.partial === 0 && (
                      <div className="flex flex-col items-center px-2 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
                        <span className="text-emerald-400 font-bold text-xs">{stats.compliant}</span>
                        <span className="text-[9px] text-emerald-400/70 uppercase">Pass</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Selection toolbar ── */}
        <div className="mb-4 flex items-center justify-between gap-4 p-4 bg-slate-800/60 border border-white/10 rounded-2xl backdrop-blur-md">
          {/* Select All */}
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2.5 text-sm font-semibold text-gray-300 hover:text-white transition-colors"
          >
            {allSelected ? (
              <CheckSquare className="h-5 w-5 text-purple-400" />
            ) : someSelected ? (
              <div className="h-5 w-5 rounded border-2 border-purple-400 bg-purple-400/20 flex items-center justify-center">
                <div className="h-2 w-2 bg-purple-400 rounded-sm" />
              </div>
            ) : (
              <Square className="h-5 w-5 text-gray-500" />
            )}
            {allSelected ? 'Deselect All' : 'Select All Results'}
            {someSelected && (
              <span className="ml-1 px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs font-bold rounded-full border border-purple-500/30">
                {selectedIds.size} selected
              </span>
            )}
          </button>

          {/* Generate Summary button */}
          <button
            onClick={() => setShowSummary(true)}
            disabled={selectedIds.size === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              selectedIds.size > 0
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 shadow-lg shadow-purple-500/20'
                : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Generate Consolidated Summary
            {selectedIds.size > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                {selectedIds.size}
              </span>
            )}
          </button>
        </div>

        {/* Filter & Grouping Controls */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-6">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'All', count: report.findings.length, color: 'purple' },
              { id: 'non-compliant', label: 'Non-Compliant', count: report.nonCompliantCount, color: 'rose' },
              { id: 'partial', label: 'Partial', count: report.partialCount, color: 'amber' },
              { id: 'compliant', label: 'Compliant', count: report.compliantCount, color: 'emerald' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterLevel(tab.id as any)}
                className={`px-4 py-2 rounded-lg font-medium text-xs transition-all whitespace-nowrap border flex items-center gap-2 ${
                  filterLevel === tab.id
                    ? `bg-${tab.color}-500/20 text-${tab.color}-300 border-${tab.color}-500/50 shadow-sm`
                    : 'bg-slate-800/40 text-gray-400 border-white/10 hover:bg-white/5'
                }`}
              >
                {tab.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] bg-black/20 ${filterLevel === tab.id ? 'text-white' : 'text-gray-500'}`}>
                  {tab.count}
                </span>
              </button>
            ))}

            {/* Guideline Dropdown */}
            {guidelineFolders.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider ml-1">Filter by Guideline</span>
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-white text-xs font-medium hover:bg-slate-700 transition-all flex items-center gap-2 min-w-[240px] justify-between shadow-lg"
                    style={{ backgroundColor: '#1e293b' }}
                  >
                    <span className="truncate max-w-[200px]">
                      {filterGuideline === 'all' ? `All Guidelines (${report.findings.length})` : filterGuideline}
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isDropdownOpen && (
                    <div
                      className="absolute top-full left-0 mt-2 w-full min-w-[240px] rounded-xl shadow-2xl z-[100] overflow-hidden py-1 max-h-[300px] overflow-y-auto ring-1 ring-black/50"
                      style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
                    >
                      <button
                        onClick={() => { setFilterGuideline('all'); setIsDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-3 text-xs font-bold transition-colors flex items-center justify-between border-b border-white/5 ${
                          filterGuideline === 'all' ? 'bg-purple-500/20 text-purple-300' : 'text-gray-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span>All Guidelines</span>
                        <span className="opacity-70 text-[10px] bg-black/30 px-1.5 py-0.5 rounded">{report.findings.length}</span>
                      </button>
                      {guidelineFolders.map(folder => {
                        const folderCount = report.findings.filter(f => f.folderName === folder).length;
                        return (
                          <button
                            key={folder}
                            onClick={() => { setFilterGuideline(folder); setIsDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center justify-between border-b border-white/5 last:border-0 ${
                              filterGuideline === folder ? 'bg-purple-500/20 text-purple-300' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <span className="truncate pr-2">{folder}</span>
                            <span className="opacity-50 text-[10px] whitespace-nowrap bg-black/20 px-1.5 py-0.5 rounded">{folderCount}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 bg-slate-900/50 p-1 rounded-lg border border-white/10">
            <button
              onClick={() => setGrouping('folder')}
              className={`p-2 rounded-md transition-all flex items-center gap-2 text-xs font-bold ${
                grouping === 'folder' ? 'bg-purple-500 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Layers className="h-4 w-4" /> By Guideline
            </button>
            <button
              onClick={() => setGrouping('none')}
              className={`p-2 rounded-md transition-all flex items-center gap-2 text-xs font-bold ${
                grouping === 'none' ? 'bg-purple-500 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <ListIcon className="h-4 w-4" /> Flat List
            </button>
          </div>
        </div>

        {/* Findings List */}
        <div className="space-y-8">
          {Object.entries(groupedFindings).length > 0 ? (
            Object.entries(groupedFindings).map(([groupTitle, groupFindings], groupIdx) => {
              // Map each finding in this group back to its global index
              const groupGlobalIndices = groupFindings.map(gf =>
                report.findings.findIndex(f => f === gf)
              );

              return (
                <div key={groupTitle} className="space-y-4">
                  {grouping !== 'none' && (
                    <button
                      onClick={() => toggleGroup(groupTitle)}
                      className="w-full flex items-center justify-between p-4 bg-slate-800/60 border border-white/10 rounded-xl hover:border-purple-500/30 transition-all group sticky top-[80px] z-40 backdrop-blur-md shadow-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-white/5 text-gray-400 group-hover:text-white transition-colors">
                          {expandedGroups.has(groupTitle)
                            ? <ChevronRight className="h-5 w-5 rotate-90 transition-transform" />
                            : <ChevronRight className="h-5 w-5 transition-transform" />}
                        </div>
                        <div className="text-left">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Folder className="h-5 w-5 text-purple-400" />
                            {groupTitle}
                          </h3>
                          <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                            <span>{groupFindings.length} Finding{groupFindings.length !== 1 ? 's' : ''}</span>
                            {(() => {
                              const nc = groupFindings.filter(f => f.complianceLevel === 'non-compliant').length;
                              const pc = groupFindings.filter(f => f.complianceLevel === 'partial').length;
                              return (
                                <>
                                  {nc > 0 && <span className="text-rose-400 font-semibold">• {nc} Non-Compliant</span>}
                                  {pc > 0 && <span className="text-amber-400 font-semibold">• {pc} Partial</span>}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-purple-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        {expandedGroups.has(groupTitle) ? 'Collapse' : 'Expand'}
                      </span>
                    </button>
                  )}

                  {(grouping === 'none' || expandedGroups.has(groupTitle)) && (
                    <div className={`space-y-6 ${grouping !== 'none' ? 'pl-4 border-l-2 border-white/5 ml-4' : ''}`}>
                      {groupFindings.map((finding, index) => {
                        const globalIdx = groupGlobalIndices[index];
                        const isSelected = selectedIds.has(globalIdx);
                        return (
                          <div key={`${groupTitle}-${index}`} className="relative">
                            {/* Selection checkbox overlay */}
                            <div className="absolute -left-3 top-5 z-10">
                              <button
                                onClick={() => toggleSelect(globalIdx)}
                                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all shadow-lg ${
                                  isSelected
                                    ? 'bg-purple-600 border-purple-500 shadow-purple-500/30'
                                    : 'bg-slate-900 border-slate-600 hover:border-purple-400'
                                }`}
                                title={isSelected ? 'Deselect' : 'Select'}
                              >
                                {isSelected && <CheckSquare className="h-3.5 w-3.5 text-white" />}
                              </button>
                            </div>

                            {/* Highlight ring when selected */}
                            <div className={`transition-all duration-200 rounded-2xl ${
                              isSelected ? 'ring-2 ring-purple-500/50 ring-offset-2 ring-offset-slate-900' : ''
                            }`}>
                              <FindingCard
                                id={`finding-${groupIdx}-${index}`}
                                requirement={finding.clauseText || finding.guidelineRequirement || ''}
                                gap={finding.mismatchExplanation || finding.specificGap || finding.highlightedIssue || ''}
                                impact={finding.highlightedIssue || 'Impact not specified'}
                                suggestion={finding.suggestedAction || ''}
                                reference={`${finding.folderName || 'General'} → ${finding.guidelineName || finding.pdfName}`}
                                clauseNumber={finding.clauseNumber}
                                severity={finding.issueSeverity || findLevelSeverity(finding.complianceLevel)}
                                status={finding.complianceLevel}
                                confidence={finding.matchConfidence || 0}
                                sopSection={finding.sopSectionAffected || finding.sopSectionNumber}
                                sopTextSnippet={finding.sopTextSnippet}
                                suggestedText={finding.suggestedText}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl shadow-sm border border-white/5 p-12 text-center text-gray-400">
              <div className="bg-white/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="h-8 w-8 text-gray-500" />
              </div>
              <p className="text-lg font-medium">No findings match this filter.</p>
              <button
                onClick={() => setFilterLevel('all')}
                className="mt-4 px-4 py-2 bg-purple-500/10 text-purple-400 rounded-lg hover:bg-purple-500/20 transition-all text-sm font-bold"
              >
                View All Findings
              </button>
            </div>
          )}
        </div>

        {/* Bottom action bar */}
        <div className="mt-12 flex justify-center gap-4">
          <button
            onClick={() => window.print()}
            className="px-8 py-3 bg-white/5 border border-white/10 text-gray-300 rounded-xl font-semibold shadow-sm hover:bg-white/10 transition-all flex items-center gap-2"
          >
            <span>🖨️</span> Print Report
          </button>
        </div>
      </div>
    </div>
  );
}

function findLevelSeverity(level: string): 'critical' | 'major' | 'minor' | 'informational' {
  if (level === 'non-compliant') return 'major';
  if (level === 'partial') return 'minor';
  return 'informational';
}
