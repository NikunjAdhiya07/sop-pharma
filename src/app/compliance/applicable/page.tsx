'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';

interface ApplicableFinding {
  _id: string;
  sopSection: string;
  sopSectionTitle: string;
  sopSectionNumber: string;
  findings: {
    findingId: string;
    guidelineName: string;
    clauseNumber: string;
    clauseTitle: string;
    issueSeverity: string;
    specificGap: string;
    suggestedAction: string;
    proposedVerbiage: string;
    markedAt: string;
  }[];
  compiledVerbiage: string;
  implementationStatus: string;
  createdAt: string;
  updatedAt: string;
}

function ApplicableFindingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportId = searchParams.get('reportId');

  const [applicableFindings, setApplicableFindings] = useState<ApplicableFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState<ApplicableFinding | null>(null);
  const [recompilingId, setRecompilingId] = useState<string | null>(null);

  useEffect(() => {
    if (reportId) {
      fetchApplicableFindings();
    } else {
      setLoading(false);
    }
  }, [reportId]);

  const fetchApplicableFindings = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/compliance/applicable-findings?reportId=${reportId}`);
      const data = await res.json();

      if (data.success) {
        setApplicableFindings(data.data);
      } else {
        console.error('Failed to fetch applicable findings:', data.error);
      }
    } catch (error) {
      console.error('Error fetching applicable findings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecompile = async (id: string) => {
    try {
      setRecompilingId(id);
      const res = await fetch('/api/compliance/applicable-findings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          action: 'recompile',
          userId: 'demo-user-id', // Replace with actual user ID
        }),
      });

      const data = await res.json();
      if (data.success) {
        await fetchApplicableFindings();
      }
    } catch (error) {
      console.error('Error recompiling:', error);
    } finally {
      setRecompilingId(null);
    }
  };

  const handleMarkStatus = async (id: string, action: string) => {
    try {
      const res = await fetch('/api/compliance/applicable-findings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          action,
          userId: 'demo-user-id', // Replace with actual user ID
        }),
      });

      const data = await res.json();
      if (data.success) {
        await fetchApplicableFindings();
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl flex items-center gap-3">
          <span className="animate-spin text-2xl">⏳</span>
          Loading applicable findings...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-slate-400 hover:text-white mb-4 flex items-center gap-2 transition-colors"
          >
            ← Back to Report
          </button>
          <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Applicable Findings</h1>
          <p className="text-slate-400">Review and implement compliance improvements by SOP section</p>
        </div>

        {applicableFindings.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-12 text-center shadow-xl">
            <div className="text-6xl mb-4">📢</div>
            <p className="text-white font-bold text-xl mb-2">No findings yet</p>
            <p className="text-slate-400 text-lg mb-6">You haven't marked any findings as applicable for this report.</p>
            <button
              onClick={() => router.back()}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-purple-500/20 transition-all"
            >
              Mark Findings as Applicable
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            {/* Sections List */}
            <div className="xl:col-span-4 space-y-4">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span>📚</span> Sections ({applicableFindings.length})
              </h2>
              <div className="space-y-3">
                {applicableFindings.map((section) => (
                  <div
                    key={section._id}
                    onClick={() => setSelectedSection(section)}
                    className={`p-5 rounded-2xl cursor-pointer transition-all border-2 group ${
                      selectedSection?._id === section._id
                        ? 'bg-purple-600/20 border-purple-500/50 shadow-lg shadow-purple-500/10'
                        : 'bg-white/5 border-white/10 hover:border-purple-500/30'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className={`font-bold text-sm transition-colors ${
                        selectedSection?._id === section._id ? 'text-purple-300' : 'text-white group-hover:text-purple-300'
                      }`}>
                        {section.sopSection}
                      </h3>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        section.implementationStatus === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        section.implementationStatus === 'in-progress' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                      }`}>
                        {section.implementationStatus}
                      </span>
                    </div>
                    <p className="text-slate-400 text-xs mb-3 line-clamp-2">{section.sopSectionTitle}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      <span>{section.findings.length} issue{section.findings.length !== 1 ? 's' : ''} addressing</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section Detail */}
            <div className="xl:col-span-8">
              {selectedSection ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  {/* Section Header */}
                  <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 shadow-xl">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h2 className="text-2xl font-black text-white mb-1">{selectedSection.sopSection}</h2>
                        <p className="text-slate-300 font-medium">{selectedSection.sopSectionTitle}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Status</p>
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${
                          selectedSection.implementationStatus === 'completed' ? 'bg-emerald-500 text-white' :
                          selectedSection.implementationStatus === 'in-progress' ? 'bg-amber-500 text-white' :
                          'bg-slate-600 text-white'
                        }`}>
                          {selectedSection.implementationStatus}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-6">
                      <button
                        onClick={() => handleMarkStatus(selectedSection._id, 'mark-in-progress')}
                        className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                          selectedSection.implementationStatus === 'in-progress'
                            ? 'bg-amber-500 text-white cursor-default'
                            : 'bg-white/10 hover:bg-amber-600 text-white'
                        }`}
                      >
                        🚧 Mark In Progress
                      </button>
                      <button
                        onClick={() => handleMarkStatus(selectedSection._id, 'mark-completed')}
                        className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                          selectedSection.implementationStatus === 'completed'
                            ? 'bg-emerald-500 text-white cursor-default'
                            : 'bg-white/10 hover:bg-emerald-600 text-white'
                        }`}
                      >
                        ✅ Mark Completed
                      </button>
                    </div>
                  </div>

                  {/* Individual Findings */}
                  <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 overflow-hidden">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                       <span>⚠️</span> Issues Addressed ({selectedSection.findings.length})
                    </h3>
                    <div className="space-y-4">
                      {selectedSection.findings.map((finding, idx) => (
                        <div key={finding.findingId} className="bg-white/5 rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-colors">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-400 font-bold border border-white/5">
                                  {idx + 1}
                                </span>
                                <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                                  {finding.guidelineName} • {finding.clauseNumber}
                                </span>
                              </div>
                              <h4 className="text-base font-bold text-white">{finding.clauseTitle}</h4>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm ${
                              finding.issueSeverity === 'critical' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                              finding.issueSeverity === 'major' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' :
                              finding.issueSeverity === 'minor' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}>
                              {finding.issueSeverity}
                            </span>
                          </div>
                          <p className="text-slate-400 text-sm mb-4 leading-relaxed">{finding.specificGap}</p>
                          <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5">
                            <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                              <span>🔸</span> Individual Suggestion
                            </p>
                            <p className="text-slate-200 text-xs italic leading-relaxed">"{finding.proposedVerbiage}"</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Compiled Verbiage */}
                  <div className="bg-gradient-to-br from-emerald-600/20 to-indigo-600/20 backdrop-blur-md rounded-2xl border border-emerald-500/30 p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-32 -mt-32" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -ml-32 -mb-32" />
                    
                    <div className="relative z-10">
                      <div className="flex justify-between items-center mb-6">
                        <div>
                          <h3 className="text-xl font-black text-emerald-300 flex items-center gap-2">
                            <span>✨</span> Compiled SOP Content
                          </h3>
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">
                            Optimized for regulatory compliance
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRecompile(selectedSection._id)}
                            disabled={recompilingId === selectedSection._id}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 transition-all shadow-lg hover:shadow-purple-500/20 flex items-center gap-2"
                          >
                            {recompilingId === selectedSection._id ? (
                              <>
                                <span className="animate-spin text-sm">🔄</span>
                                <span>Compiling...</span>
                              </>
                            ) : (
                              <>
                                <span>🔄</span>
                                <span>Recompile</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              copyToClipboard(selectedSection.compiledVerbiage);
                              alert('Copied to clipboard!');
                            }}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg hover:shadow-emerald-500/20 flex items-center gap-2"
                          >
                            <span>📋</span>
                            <span>Copy Text</span>
                          </button>
                        </div>
                      </div>

                      <div className="bg-black/60 rounded-2xl p-6 border border-emerald-500/20 shadow-inner">
                        <pre className="text-emerald-50/90 text-base whitespace-pre-wrap leading-loose font-medium font-sans italic selection:bg-emerald-500/30">
                          {selectedSection.compiledVerbiage}
                        </pre>
                      </div>
                      
                      <div className="mt-6 flex items-center gap-3 text-slate-400">
                        <div className="flex -space-x-2">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="w-6 h-6 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[10px] font-black">
                              {i}
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest">
                          Addresses all {selectedSection.findings.length} findings for this section
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-12">
                  <div className="text-6xl mb-4 animate-bounce">👈</div>
                  <h3 className="text-2xl font-black text-white mb-2">Select a Section</h3>
                  <p className="text-slate-400 max-w-sm">Choose an SOP section from the sidebar to view detailed findings and compiled verbiage.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApplicableFindingsPage() {
  useAuthGuard();
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse flex items-center gap-3">
          <span className="text-2xl">⏳</span>
          Initializing...
        </div>
      </div>
    }>
      <ApplicableFindingsContent />
    </Suspense>
  );
}

