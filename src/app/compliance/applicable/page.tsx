'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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

export default function ApplicableFindingsPage() {
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
        <div className="text-white text-xl">Loading applicable findings...</div>
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
            className="text-slate-400 hover:text-white mb-4 flex items-center gap-2"
          >
            ← Back to Report
          </button>
          <h1 className="text-4xl font-black text-white mb-2">Applicable Findings</h1>
          <p className="text-slate-400">Review and implement compliance improvements by SOP section</p>
        </div>

        {applicableFindings.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-12 text-center">
            <p className="text-slate-400 text-lg">No findings marked as applicable yet.</p>
            <button
              onClick={() => router.back()}
              className="mt-4 px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg"
            >
              Go Back to Mark Findings
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            {/* Sections List */}
            <div className="xl:col-span-4 space-y-4">
              <h2 className="text-xl font-bold text-white mb-4">Sections ({applicableFindings.length})</h2>
              {applicableFindings.map((section) => (
                <div
                  key={section._id}
                  onClick={() => setSelectedSection(section)}
                  className={`p-5 rounded-2xl cursor-pointer transition-all border-2 ${
                    selectedSection?._id === section._id
                      ? 'bg-purple-600/20 border-purple-500/50'
                      : 'bg-white/5 border-white/10 hover:border-purple-500/30'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-white text-sm">{section.sopSection}</h3>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      section.implementationStatus === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                      section.implementationStatus === 'in-progress' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-slate-500/20 text-slate-300'
                    }`}>
                      {section.implementationStatus}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mb-3">{section.sopSectionTitle}</p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{section.findings.length} finding{section.findings.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Section Detail */}
            {selectedSection && (
              <div className="xl:col-span-8 space-y-6">
                {/* Section Header */}
                <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6">
                  <h2 className="text-2xl font-black text-white mb-2">{selectedSection.sopSection}</h2>
                  <p className="text-slate-300 mb-4">{selectedSection.sopSectionTitle}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleMarkStatus(selectedSection._id, 'mark-in-progress')}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold"
                    >
                      Mark In Progress
                    </button>
                    <button
                      onClick={() => handleMarkStatus(selectedSection._id, 'mark-completed')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold"
                    >
                      Mark Completed
                    </button>
                  </div>
                </div>

                {/* Individual Findings */}
                <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6">
                  <h3 className="text-lg font-bold text-white mb-4">Issues Addressed ({selectedSection.findings.length})</h3>
                  <div className="space-y-4">
                    {selectedSection.findings.map((finding, idx) => (
                      <div key={finding.findingId} className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="text-[10px] text-slate-500 font-bold uppercase">
                              {idx + 1}. {finding.guidelineName} - {finding.clauseNumber}
                            </span>
                            <h4 className="text-sm font-bold text-white mt-1">{finding.clauseTitle}</h4>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                            finding.issueSeverity === 'critical' ? 'bg-rose-500/20 text-rose-300' :
                            finding.issueSeverity === 'major' ? 'bg-orange-500/20 text-orange-300' :
                            finding.issueSeverity === 'minor' ? 'bg-amber-500/20 text-amber-300' :
                            'bg-blue-500/20 text-blue-300'
                          }`}>
                            {finding.issueSeverity}
                          </span>
                        </div>
                        <p className="text-slate-400 text-xs mb-2">{finding.specificGap}</p>
                        <div className="bg-black/30 rounded-lg p-3 mt-2">
                          <p className="text-[10px] text-emerald-400 font-bold uppercase mb-1">Individual Proposed Text:</p>
                          <p className="text-slate-300 text-xs font-mono">{finding.proposedVerbiage}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Compiled Verbiage */}
                <div className="bg-gradient-to-br from-emerald-500/10 to-purple-500/10 backdrop-blur-md rounded-2xl border border-emerald-500/30 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-emerald-300">📝 Compiled Section Text</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRecompile(selectedSection._id)}
                        disabled={recompilingId === selectedSection._id}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                      >
                        {recompilingId === selectedSection._id ? 'Recompiling...' : '🔄 Recompile'}
                      </button>
                      <button
                        onClick={() => copyToClipboard(selectedSection.compiledVerbiage)}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold"
                      >
                        📋 Copy
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold mb-3">
                    This text addresses all {selectedSection.findings.length} issue(s) in this section
                  </p>
                  <div className="bg-black/40 rounded-xl p-5 border border-white/5">
                    <pre className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed font-sans">
                      {selectedSection.compiledVerbiage}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
