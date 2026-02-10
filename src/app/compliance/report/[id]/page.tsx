'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

/**
 * Detailed Compliance Report View
 * Shows full compliance analysis with all findings and recommendations
 */

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
}

export default function ComplianceReportDetail() {
  const router = useRouter();
  const params = useParams();
  const reportId = params.id as string;
  
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<'all' | 'compliant' | 'partial' | 'non-compliant'>('all');

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
    if (filterLevel === 'all') return true;
    return finding.complianceLevel === filterLevel;
  }) || [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading report...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-600">Report not found</p>
          <button
            onClick={() => router.push('/compliance')}
            className="mt-4 px-6 py-3 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all"
          >
            ← Back to Compliance
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/compliance')}
            className="mb-4 px-4 py-2 bg-white rounded-lg shadow hover:shadow-lg transition-all"
          >
            ← Back to Compliance
          </button>
          
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">{report.sopName}</h1>
                <p className="text-gray-600 mt-2">
                  {report.sopIdentifier} • Version {report.sopVersion} • {report.department}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Analyzed: {new Date(report.analyzedAt).toLocaleString()}
                </p>
              </div>
              
              <div className="text-right">
                <div className="text-5xl font-bold text-indigo-600 mb-2">
                  {report.overallScore}/10
                </div>
                <div className={`px-4 py-2 rounded-lg text-sm font-semibold inline-block ${
                  report.complianceStatus === 'Fully Compliant'
                    ? 'bg-green-100 text-green-800'
                    : report.complianceStatus === 'Partially Compliant'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {report.complianceStatus}
                </div>
              </div>
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-600">Total Checked</p>
                <p className="text-2xl font-bold text-gray-800">{report.totalGuidelinesChecked}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4">
                <p className="text-sm text-gray-600">Compliant</p>
                <p className="text-2xl font-bold text-green-600">{report.compliantCount}</p>
              </div>
              <div className="bg-yellow-50 rounded-xl p-4">
                <p className="text-sm text-gray-600">Partial</p>
                <p className="text-2xl font-bold text-yellow-600">{report.partialCount}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4">
                <p className="text-sm text-gray-600">Non-Compliant</p>
                <p className="text-2xl font-bold text-red-600">{report.nonCompliantCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => setFilterLevel('all')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              filterLevel === 'all'
                ? 'bg-white shadow-lg text-indigo-600'
                : 'bg-white/50 text-gray-600 hover:bg-white'
            }`}
          >
            All ({report.findings.length})
          </button>
          <button
            onClick={() => setFilterLevel('non-compliant')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              filterLevel === 'non-compliant'
                ? 'bg-white shadow-lg text-red-600'
                : 'bg-white/50 text-gray-600 hover:bg-white'
            }`}
          >
            Non-Compliant ({report.nonCompliantCount})
          </button>
          <button
            onClick={() => setFilterLevel('partial')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              filterLevel === 'partial'
                ? 'bg-white shadow-lg text-yellow-600'
                : 'bg-white/50 text-gray-600 hover:bg-white'
            }`}
          >
            Partial ({report.partialCount})
          </button>
          <button
            onClick={() => setFilterLevel('compliant')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              filterLevel === 'compliant'
                ? 'bg-white shadow-lg text-green-600'
                : 'bg-white/50 text-gray-600 hover:bg-white'
            }`}
          >
            Compliant ({report.compliantCount})
          </button>
        </div>

        {/* Findings List */}
        <div className="space-y-4">
          {filteredFindings.map((finding, index) => (
            <div
              key={index}
              className={`bg-white rounded-2xl shadow-lg p-6 border-l-4 ${
                finding.complianceLevel === 'compliant'
                  ? 'border-green-500'
                  : finding.complianceLevel === 'partial'
                  ? 'border-yellow-500'
                  : 'border-red-500'
              }`}
            >
              {/* Finding Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      finding.complianceLevel === 'compliant'
                        ? 'bg-green-100 text-green-800'
                        : finding.complianceLevel === 'partial'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {finding.complianceLevel.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-500">
                      Confidence: {finding.matchConfidence}%
                    </span>
                  </div>
                  
                  <h3 className="text-xl font-bold text-gray-800">
                    {finding.clauseNumber}: {finding.clauseTitle}
                  </h3>
                  
                  <div className="flex gap-2 mt-2 text-sm text-gray-600">
                    <span className="bg-gray-100 px-2 py-1 rounded">📁 {finding.folderName}</span>
                    <span className="bg-gray-100 px-2 py-1 rounded">📄 {finding.pdfName}</span>
                  </div>
                </div>
              </div>

              {/* Finding Details */}
              <div className="space-y-4">
                {/* Guideline Text */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">📋 Guideline Requirement:</h4>
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    <p className="text-sm text-gray-700">{finding.clauseText}</p>
                  </div>
                </div>

                {/* SOP Section Affected */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">📍 SOP Section Affected:</h4>
                  <p className="text-sm text-gray-800 bg-gray-50 p-3 rounded">
                    {finding.sopSectionAffected}
                  </p>
                </div>

                {/* SOP Text Snippet */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">📝 Relevant SOP Text:</h4>
                  <div className="bg-gray-50 border-l-4 border-gray-300 p-4 rounded">
                    <p className="text-sm text-gray-700 italic">{finding.sopTextSnippet}</p>
                  </div>
                </div>

                {/* Mismatch Explanation */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">❓ Explanation:</h4>
                  <p className="text-sm text-gray-800 bg-yellow-50 p-4 rounded">
                    {finding.mismatchExplanation}
                  </p>
                </div>

                {/* Highlighted Issue */}
                {finding.complianceLevel !== 'compliant' && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">⚠️ Issue Identified:</h4>
                    <p className="text-sm text-red-700 bg-red-50 p-4 rounded font-semibold">
                      {finding.highlightedIssue}
                    </p>
                  </div>
                )}

                {/* Suggested Action */}
                {finding.complianceLevel !== 'compliant' && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">💡 Suggested Action:</h4>
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-l-4 border-indigo-500 p-4 rounded">
                      <p className="text-sm text-gray-800 font-medium">
                        {finding.suggestedAction}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {filteredFindings.length === 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
              <p className="text-gray-500 text-lg">No findings in this category</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-4">
          <button
            onClick={() => window.print()}
            className="flex-1 px-6 py-4 bg-white text-gray-700 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            🖨️ Print Report
          </button>
          <button
            onClick={() => router.push('/compliance')}
            className="flex-1 px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
