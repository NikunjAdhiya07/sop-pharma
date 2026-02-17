'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import FindingCard from '../../components/FindingCard';
import { Layers, List as ListIcon, PieChart, ChevronRight, ChevronDown, AlertTriangle, CheckCircle, Folder } from 'lucide-react';

/**
 * Detailed Compliance Report View
 * Shows full compliance analysis with all findings and recommendations
 */

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
  // Optional fields that might come from API
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

  useEffect(() => {
    if (reportId) {
      fetchReport();
    }
  }, [reportId]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/compliance/analyze?reportId=${reportId}`);
      const data = await response.json();
      
      if (data.success) {
        setReport(data.report);
      }
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

  // Get unique guideline folders from findings
  const guidelineFolders = Array.from(new Set(report?.findings.map(f => f.folderName) || []));

  // Calculate stats per folder (Guideline Breakdown)
  const folderStats = useMemo(() => {
    if (!report) return {};
    return report.findings.reduce((acc, f) => {
        const folder = f.folderName || 'Other Guidelines';
        if (!acc[folder]) acc[folder] = { total: 0, critical: 0, major: 0, minor: 0, nonCompliant: 0, partial: 0, compliant: 0 };
        
        acc[folder].total++;
        
        if (f.complianceLevel === 'non-compliant') {
            acc[folder].nonCompliant++;
            acc[folder].critical++; // Treating non-compliant as critical/major bucket for simple stats
        } else if (f.complianceLevel === 'partial') {
            acc[folder].partial++;
            acc[folder].major++;
        } else if (f.complianceLevel === 'compliant') {
            acc[folder].compliant++;
        }
        return acc;
    }, {} as Record<string, { total: number, critical: number, major: number, minor: number, nonCompliant: number, partial: number, compliant: number }>);
  }, [report]);

  // Group filtered findings
  const groupedFindings = useMemo(() => {
    if (grouping === 'none') return { 'All Findings': filteredFindings };
    
    return filteredFindings.reduce((groups, finding) => {
      const folder = finding.folderName || 'Other Guidelines';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(finding);
      return groups;
    }, {} as Record<string, Finding[]>);
  }, [filteredFindings, grouping]);

  // Auto-expand all groups initially or when grouping changes
  useEffect(() => {
    if (grouping === 'folder') {
      setExpandedGroups(new Set(Object.keys(groupedFindings)));
    }
  }, [grouping, groupedFindings.length]); // groupedFindings.length is a proxy for data updates

  const toggleGroup = (group: string) => {
    const newSet = new Set(expandedGroups);
    if (newSet.has(group)) newSet.delete(group);
    else newSet.add(group);
    setExpandedGroups(newSet);
  };


  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 9) return 'text-emerald-600';
    if (score >= 6) return 'text-amber-600';
    return 'text-rose-600';
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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto"></div>
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
            className="mt-6 px-6 py-2.5 bg-white/5 border border-white/10 text-gray-300 rounded-xl hover:bg-white/10 transition-all font-medium shadow-sm"
          >
            ← Back to Compliance
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 font-sans text-white pb-20">
      
      {/* Animated Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute top-1/2 right-1/3 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>
      
      {/* Header Bar */}
      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50 shadow-sm relative">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/compliance')}
                className="p-2 hover:bg-white/10 rounded-lg text-gray-400 transition-all"
                title="Back"
              >
                ←
              </button>
              <h1 className="text-lg font-bold text-white truncate max-w-md">
                {report.sopName}
              </h1>
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
        
        {/* Report Overview Card */}
        <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl shadow-sm border border-white/5 p-8 mb-8">
            <div className="flex flex-col md:flex-row gap-8 items-start">
               <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-2.5 py-0.5 bg-white/10 text-gray-300 text-xs font-bold rounded border border-white/10 uppercase tracking-wider">
                      {report.department}
                    </span>
                    <span className="text-gray-400 text-sm font-mono font-medium">{report.sopIdentifier}</span>
                    {report.sopVersion && (
                       <span className="text-gray-400 text-sm">v{report.sopVersion}</span>
                    )}
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-4">{report.sopName}</h2>
                  
                  <div className="flex items-center gap-6 text-sm text-gray-400">
                    <span className="flex items-center gap-1.5">
                      📅 {new Date(report.analyzedAt).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1.5">
                      ⏱️ Analysis time: {(report.processingTimeMs / 1000).toFixed(1)}s
                    </span>
                  </div>
               </div>

               {/* Stats Grid */}
               <div className="grid grid-cols-4 gap-4 w-full md:w-auto min-w-[400px]">
                  <div className="bg-slate-700/30 rounded-xl p-4 border border-white/10 text-center">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Total</p>
                    <p className="text-2xl font-bold text-white">{report.totalGuidelinesChecked}</p>
                  </div>
                  <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/30 text-center">
                    <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-1">Compliant</p>
                    <p className="text-2xl font-bold text-emerald-400">{report.compliantCount}</p>
                  </div>
                  <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/30 text-center">
                    <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-1">Partial</p>
                    <p className="text-2xl font-bold text-amber-400">{report.partialCount}</p>
                  </div>
                  <div className="bg-rose-500/10 rounded-xl p-4 border border-rose-500/30 text-center">
                    <p className="text-xs text-rose-400 font-semibold uppercase tracking-wider mb-1">Non-Compliant</p>
                    <p className="text-2xl font-bold text-rose-400">{report.nonCompliantCount}</p>
                  </div>
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
                     {(stats.nonCompliant === 0 && stats.partial === 0 && stats.compliant === 0) && (
                        <span className="text-gray-500 text-xs">No applicable clauses</span>
                     )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter & Grouping Controls */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-6">
            <div className="flex flex-wrap gap-2">
              {/* Status Filters */}
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
              
              
              {/* Guideline Filter Dropdown (Custom UI - Fixed v2) */}
              {guidelineFolders.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider ml-1">Filter by Guideline Folder</span>
                    <div className="relative" ref={dropdownRef}>
                      <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-white text-xs font-medium hover:bg-slate-700 transition-all flex items-center gap-2 min-w-[240px] justify-between shadow-lg"
                        style={{ backgroundColor: '#1e293b' }}
                      >
                        <span className="truncate max-w-[200px]">
                          {filterGuideline === 'all' ? `All Guidelines (${report.findings.length})` : `${filterGuideline}`}
                        </span>
                        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {/* Dropdown Menu */}
                      {isDropdownOpen && (
                        <div 
                          className="absolute top-full left-0 mt-2 w-full min-w-[240px] rounded-xl shadow-2xl z-[100] overflow-hidden py-1 max-h-[300px] overflow-y-auto ring-1 ring-black/50"
                          style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
                        >
                          <button
                            onClick={() => {
                              setFilterGuideline('all');
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-3 text-xs font-bold transition-colors flex items-center justify-between border-b border-white/5 ${
                              filterGuideline === 'all' 
                                ? 'bg-purple-500/20 text-purple-300' 
                                : 'text-gray-300 hover:bg-white/5 hover:text-white'
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
                                onClick={() => {
                                  setFilterGuideline(folder);
                                  setIsDropdownOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center justify-between border-b border-white/5 last:border-0 ${
                                  filterGuideline === folder
                                    ? 'bg-purple-500/20 text-purple-300' 
                                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
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
                        grouping === 'folder' 
                        ? 'bg-purple-500 text-white shadow-sm' 
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Layers className="h-4 w-4" />
                    By Guideline
                </button>
                <button
                    onClick={() => setGrouping('none')}
                    className={`p-2 rounded-md transition-all flex items-center gap-2 text-xs font-bold ${
                        grouping === 'none' 
                        ? 'bg-purple-500 text-white shadow-sm' 
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <ListIcon className="h-4 w-4" />
                    Flat List
                </button>
            </div>
        </div>

        {/* Findings List */}
        <div className="space-y-8">
          {Object.entries(groupedFindings).length > 0 ? (
            Object.entries(groupedFindings).map(([groupTitle, groupFindings], groupIdx) => (
                <div key={groupTitle} className="space-y-4">
                    {grouping !== 'none' && (
                        <button 
                            onClick={() => toggleGroup(groupTitle)}
                            className="w-full flex items-center justify-between p-4 bg-slate-800/60 border border-white/10 rounded-xl hover:border-purple-500/30 transition-all group sticky top-[80px] z-40 backdrop-blur-md shadow-lg"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-1.5 rounded-lg bg-white/5 text-gray-400 group-hover:text-white transition-colors`}>
                                   {expandedGroups.has(groupTitle) ? <ChevronRight className="h-5 w-5 rotate-90 transition-transform" /> : <ChevronRight className="h-5 w-5 transition-transform" /> }
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Folder className="h-5 w-5 text-purple-400" />
                                        {groupTitle}
                                    </h3>
                                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                                        <span>{groupFindings.length} Finding{groupFindings.length !== 1 ? 's' : ''}</span>
                                        {/* Quick stats for this group */}
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
                            
                            {/* Collapse/Expand hint */}
                            <span className="text-xs text-purple-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                {expandedGroups.has(groupTitle) ? 'Collapse' : 'Expand'}
                            </span>
                        </button>
                    )}
                    
                    {/* Render Group Findings */}
                    {(grouping === 'none' || expandedGroups.has(groupTitle)) && (
                        <div className={`space-y-6 ${grouping !== 'none' ? 'pl-4 border-l-2 border-white/5 ml-4' : ''}`}>
                            {groupFindings.map((finding, index) => (
                              <FindingCard
                                key={`${groupTitle}-${index}`}
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
                            ))}
                        </div>
                    )}
                </div>
            ))
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

        {/* Action Buttons */}
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

// Helper to determine severity if missing
function findLevelSeverity(level: string): 'critical' | 'major' | 'minor' | 'informational' {
    if (level === 'non-compliant') return 'major';
    if (level === 'partial') return 'minor';
    return 'informational';
}
