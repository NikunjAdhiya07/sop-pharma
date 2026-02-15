'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import FindingCard from './components/FindingCard';
import SummaryCards from './components/SummaryCards';

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

export default function ComplianceEnginePage() {
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

  // Handle selecting a report (fetch full data)
  const handleSelectReport = async (report: ComplianceReport) => {
    setSelectedReport(report); // Show summary info immediately
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
    if (score >= 9) return 'text-emerald-500';
    if (score >= 6) return 'text-amber-500';
    return 'text-red-500';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Fully Compliant': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'Partially Compliant': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'Non-Compliant': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getCriticalityColor = (criticality: string) => {
    switch (criticality) {
      case 'critical': return 'bg-red-600/30 text-red-300';
      case 'high': return 'bg-orange-600/30 text-orange-300';
      case 'medium': return 'bg-amber-600/30 text-amber-300';
      case 'low': return 'bg-blue-600/30 text-blue-300';
      default: return 'bg-gray-600/30 text-gray-300';
    }
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

    for (let i = 0; i < sops.length; i++) {
      const sop = sops[i];
      setAnalysisProgress(`Analyzing ${i + 1}/${sops.length}: ${sop.identifier} - ${sop.name}`);

      try {
        // Use V3 API (V4 can't handle improperly parsed guidelines)
        const response = await fetch('/api/compliance/analyze-v3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sopId: sop._id,
            userId: '000000000000000000000001',
            config: {
              aiModel: 'models/gemini-3-flash-preview',
              maxClausesToAnalyze: 30,
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                🔍 SOP Compliance Intelligence Engine
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Automated Regulatory Compliance Validation
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all border border-white/20"
            >
              ← Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Workflow Steps Navigation */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-8 bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
          {[
            { id: 'fetch-sops', label: '1. SOPs', icon: '📄', count: sops.length },
            { id: 'fetch-guidelines', label: '2. Guidelines', icon: '📚', count: guidelines.length },
            { id: 'review', label: '3. Review', icon: '👁️', count: null },
            { id: 'analyze', label: '4. Analyze', icon: '🤖', count: null },
            { id: 'results', label: '5. Results', icon: '📊', count: reports.length },
          ].map((step, idx) => (
            <button
              key={step.id}
              onClick={() => setCurrentStep(step.id as WorkflowStep)}
              className={`flex-1 flex items-center justify-center gap-3 py-3 px-4 rounded-xl transition-all ${
                currentStep === step.id
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                  : 'text-gray-400 hover:bg-white/10'
              }`}
            >
              <span className="text-xl">{step.icon}</span>
              <span className="font-semibold hidden md:inline">{step.label}</span>
              {step.count !== null && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  currentStep === step.id ? 'bg-white/20' : 'bg-white/10'
                }`}>
                  {step.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Step 1: Fetch SOPs */}
        {currentStep === 'fetch-sops' && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">📄 All SOPs in System</h2>
                  <p className="text-gray-400 mt-1">
                    {sops.length} SOPs across {departments.length} departments will be analyzed
                  </p>
                </div>
                <button
                  onClick={fetchSops}
                  disabled={loadingSops}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all disabled:opacity-50"
                >
                  {loadingSops ? '⏳ Fetching...' : '🔄 Refresh'}
                </button>
              </div>

              {/* Department filter */}
              <div className="mb-6">
                <select
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white"
                >
                  <option value="all" className="bg-gray-900">All Departments ({sops.length})</option>
                  {(departments || []).map(dept => (
                    <option key={dept} value={dept} className="bg-gray-900">
                      {dept} ({(sops || []).filter(s => s.department === dept).length})
                    </option>
                  ))}
                </select>
              </div>

              {/* SOP List */}
              {loadingSops ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
                  <p className="text-gray-400 mt-4">Fetching SOPs from database...</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto space-y-2">
                  {(sops || [])
                    .filter(sop => filterDepartment === 'all' || sop.department === filterDepartment)
                    .map((sop) => (
                    <div
                      key={sop._id}
                      className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-purple-400 font-bold mr-3">{sop.identifier}</span>
                          <span className="text-white">{sop.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 bg-white/10 text-gray-400 rounded-lg text-sm">
                            {sop.department}
                          </span>
                          {sop.version && (
                            <span className="text-gray-500 text-sm">v{sop.version}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setCurrentStep('fetch-guidelines')}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold hover:opacity-90 transition-all"
                >
                  Next: View Guidelines →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Fetch Guidelines */}
        {currentStep === 'fetch-guidelines' && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">📚 All Uploaded Guidelines</h2>
                  <p className="text-gray-400 mt-1">
                    Showing {guidelines?.length || 0} of {totalClausesFromAPI > 0 ? 'many' : '0'} guidelines with {totalClauses} total clauses from {folders.length} folders
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all flex items-center gap-2"
                  >
                    📤 Upload Guidelines
                  </button>
                  <button
                    onClick={fetchAllGuidelines}
                    disabled={loadingGuidelines}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all disabled:opacity-50"
                  >
                    {loadingGuidelines ? '⏳ Fetching...' : '🔄 Refresh'}
                  </button>
                </div>
              </div>

              {/* Folder Summary with Delete Buttons */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {(folders || []).map(folder => (
                  <div key={folder.folderName} className="p-4 bg-white/10 rounded-xl border border-white/10 relative group">
                    <button
                      onClick={() => handleDeleteFolder(folder.folderName)}
                      disabled={deletingFolder === folder.folderName}
                      className="absolute top-2 right-2 p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all text-xs"
                      title="Delete folder"
                    >
                      {deletingFolder === folder.folderName ? '⏳' : '🗑️'}
                    </button>
                    <p className="text-purple-400 font-bold">{folder.folderName}</p>
                    <p className="text-white text-2xl font-bold">{folder.guidelineCount}</p>
                    <p className="text-gray-500 text-sm">{folder.totalClauses} clauses</p>
                  </div>
                ))}
              </div>

              {/* Guidelines List with Expandable Clauses */}
              {loadingGuidelines ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
                  <p className="text-gray-400 mt-4">Fetching guidelines from database...</p>
                </div>
              ) : guidelines.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-4xl mb-2">📚</p>
                  <p>No guidelines found. Upload guidelines first.</p>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-xl"
                  >
                    Upload Guidelines
                  </button>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto space-y-4">
                  {(guidelines || []).map((guideline) => (
                    <div
                      key={guideline._id}
                      className="bg-white/5 border border-white/10 rounded-xl overflow-hidden relative group"
                    >
                      <button
                        onClick={() => handleDeleteGuideline(guideline._id)}
                        disabled={deletingId === guideline._id}
                        className="absolute top-4 right-14 p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all text-xs z-10"
                        title="Delete guideline"
                      >
                        {deletingId === guideline._id ? '⏳' : '🗑️'}
                      </button>
                      
                      <button
                        onClick={() => handleToggleGuideline(guideline)}
                        className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-all"
                      >
                        <div>
                          <p className="text-purple-300 text-xs mb-1">📁 {guideline.folderName}</p>
                          <p className="text-white font-semibold pr-16">{guideline.name}</p>
                          <p className="text-gray-500 text-sm">{guideline.guidelineType}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="px-3 py-1 bg-purple-600/30 text-purple-300 rounded-lg text-sm">
                            {guideline.clauseCount ?? (guideline.clauses?.length || 0)} clauses
                          </span>
                          <span className="text-gray-400">
                            {expandedGuideline === guideline._id ? '▼' : '▶'}
                          </span>
                        </div>
                      </button>

                      {/* Expanded Clause List */}
                      {expandedGuideline === guideline._id && (
                        <div className="p-4 border-t border-white/10 bg-white/5">
                          <p className="text-gray-400 text-sm mb-3">📋 Clauses/Sections:</p>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {(!guideline.clauses || loadingGuidelineId === guideline._id) ? (
                              <div className="py-8 text-center">
                                <p className="text-gray-500 text-xs italic mb-2">
                                  {loadingGuidelineId === guideline._id ? '⏳ Fetching detailed clauses...' : '⏳ Waiting to load...'}
                                </p>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleGuideline(guideline);
                                  }}
                                  className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-purple-400 text-xs transition-all"
                                >
                                  {loadingGuidelineId === guideline._id ? 'Reload' : 'Load Clauses Now'}
                                </button>
                              </div>
                            ) : guideline.clauses.length === 0 ? (
                              <p className="text-gray-500 text-xs italic py-2 text-center">No clauses found for this guideline.</p>
                            ) : (
                              guideline.clauses.map((clause, idx) => (
                              <div key={idx} className="p-3 bg-white/5 rounded-lg">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="px-2 py-0.5 bg-purple-600/30 text-purple-300 rounded text-xs font-bold">
                                    {clause.clauseNumber}
                                  </span>
                                  <span className="text-white font-medium text-sm">{clause.clauseTitle}</span>
                                </div>
                                <p className="text-gray-400 text-xs line-clamp-2">{clause.clauseText}</p>
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

              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setCurrentStep('fetch-sops')}
                  className="px-6 py-3 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-all"
                >
                  ← Back: View SOPs
                </button>
                <button
                  onClick={() => setCurrentStep('review')}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold hover:opacity-90 transition-all"
                >
                  Next: Review & Analyze →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-lg w-full shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-6">📤 Upload New Guidelines</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Folder Name</label>
                  <input
                    type="text"
                    value={uploadFolderName}
                    onChange={(e) => setUploadFolderName(e.target.value)}
                    placeholder="e.g., EU GMP Guidelines"
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:border-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">If folder exists, guidelines will be added to it.</p>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Select PDF Files</label>
                  <input
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                  />
                </div>

                {uploadProgress && (
                  <div className="p-3 bg-blue-600/20 text-blue-300 rounded-lg text-sm text-center">
                    {uploadProgress}
                  </div>
                )}
                
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowUploadModal(false)}
                    disabled={isUploading}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUploadGuidelines}
                    disabled={isUploading}
                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {isUploading ? 'Uploading...' : 'Upload Files'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review Before Analysis */}
        {currentStep === 'review' && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <h2 className="text-2xl font-bold text-white mb-6">👁️ Review Before Analysis</h2>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="p-6 bg-gradient-to-br from-purple-600/20 to-purple-900/20 rounded-2xl border border-purple-500/30">
                  <p className="text-purple-300 text-sm mb-2">📄 SOPs to Analyze</p>
                  <p className="text-4xl font-bold text-white">{sops.length}</p>
                  <p className="text-gray-400 text-sm mt-1">across {departments.length} departments</p>
                </div>
                <div className="p-6 bg-gradient-to-br from-pink-600/20 to-pink-900/20 rounded-2xl border border-pink-500/30">
                  <p className="text-pink-300 text-sm mb-2">📚 Guidelines Available</p>
                  <p className="text-4xl font-bold text-white">{guidelines.length}</p>
                  <p className="text-gray-400 text-sm mt-1">from {folders.length} folders</p>
                </div>
                <div className="p-6 bg-gradient-to-br from-amber-600/20 to-amber-900/20 rounded-2xl border border-amber-500/30">
                  <p className="text-amber-300 text-sm mb-2">📋 Total Clauses</p>
                  <p className="text-4xl font-bold text-white">{totalClauses}</p>
                  <p className="text-gray-400 text-sm mt-1">to check against each SOP</p>
                </div>
              </div>

              {/* Analysis Info */}
              <div className="p-6 bg-white/5 rounded-xl border border-white/10 mb-6">
                <h3 className="text-lg font-bold text-white mb-4">🤖 Analysis Process</h3>
                <ul className="space-y-3 text-gray-300">
                  <li className="flex items-start gap-3">
                    <span className="text-purple-400">1.</span>
                    <span>Each SOP will be compared against ALL guideline clauses</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-purple-400">2.</span>
                    <span>AI will assess compliance level: 🟢 Compliant, 🟡 Partial, 🔴 Non-Compliant</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-purple-400">3.</span>
                    <span>Each finding includes specific <strong>Guideline Reference</strong> (e.g., "ICH Q7 Section 5.2")</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-purple-400">4.</span>
                    <span>Scores rated 0-10 with criticality levels (Critical/High/Medium/Low)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-purple-400">5.</span>
                    <span>Actionable suggestions for every non-compliant finding</span>
                  </li>
                </ul>
              </div>

              {/* Estimated Time */}
              <div className="p-4 bg-amber-600/20 border border-amber-500/30 rounded-xl mb-6">
                <p className="text-amber-300 font-semibold">⏱️ Estimated Time</p>
                <p className="text-white">
                  Approximately {Math.ceil(sops.length * 0.5)} - {Math.ceil(sops.length * 1)} minutes
                  ({sops.length} SOPs × ~30-60 seconds each)
                </p>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentStep('fetch-guidelines')}
                  className="px-6 py-3 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-all"
                >
                  ← Back: View Guidelines
                </button>
                <button
                  onClick={runFullAnalysis}
                  disabled={sops.length === 0 || guidelines.length === 0}
                  className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold text-lg hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/30"
                >
                  🚀 Start Full Analysis ({sops.length} SOPs)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Analysis in Progress */}
        {currentStep === 'analyze' && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8">
              <h2 className="text-2xl font-bold text-white mb-6 text-center">
                {isAnalyzing ? '🤖 Analysis in Progress...' : '✅ Analysis Complete'}
              </h2>

              {/* Progress */}
              <div className="max-w-2xl mx-auto">
                {isAnalyzing && (
                  <div className="text-center mb-8">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-500 mx-auto mb-4"></div>
                  </div>
                )}

                <div className="p-6 bg-white/10 rounded-xl text-center mb-6">
                  <p className="text-white text-lg">{analysisProgress}</p>
                </div>

                {/* Current Result Preview */}
                {currentResult && (
                  <div className="p-6 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-gray-400 text-sm mb-2">Latest Result:</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-purple-400 font-bold">{currentResult.sopIdentifier}</p>
                        <p className="text-white">{currentResult.sopName}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-3xl font-bold ${getScoreColor(currentResult.overallScore)}`}>
                          {getScoreEmoji(currentResult.overallScore)} {currentResult.overallScore}/10
                        </p>
                        <p className={`text-sm px-3 py-1 rounded-full inline-block ${getStatusColor(currentResult.complianceStatus)}`}>
                          {currentResult.complianceStatus}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {analysisComplete && (
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={() => setCurrentStep('results')}
                      className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg hover:opacity-90 transition-all"
                    >
                      View All Results →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Results */}
        {currentStep === 'results' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Reports List */}
            <div className={`${selectedReport ? 'lg:col-span-1' : 'lg:col-span-3'} bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6`}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">📊 Compliance Reports</h2>
                <button
                  onClick={fetchReports}
                  disabled={loadingReports}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                >
                  🔄 Refresh
                </button>
              </div>

              {loadingReports ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
                </div>
              ) : reports.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-4xl mb-2">📊</p>
                  <p>No reports yet. Run analysis first.</p>
                  <button
                    onClick={() => setCurrentStep('review')}
                    className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-xl"
                  >
                    Start Analysis
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {(reports || []).map(report => (
                    <div
                      key={report._id}
                      className={`relative w-full p-4 rounded-xl text-left transition-all group ${
                        selectedReport?._id === report._id
                          ? 'bg-purple-600/30 border-2 border-purple-500'
                          : 'bg-white/5 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <button
                        onClick={(e) => handleDeleteReport(report._id, e)}
                        className="absolute top-2 right-2 p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all z-20"
                        title="Delete report"
                      >
                       🗑️
                      </button>

                      <div 
                        onClick={() => handleSelectReport(report)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-purple-400 font-bold">{report.sopIdentifier}</span>
                          <span className={`text-2xl font-bold ${getScoreColor(report.overallScore)}`}>
                            {getScoreEmoji(report.overallScore)} {report.overallScore}/10
                          </span>
                        </div>
                        <p className="text-white text-sm truncate pr-8">{report.sopName}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className={`px-2 py-1 rounded-lg text-xs ${getStatusColor(report.complianceStatus)}`}>
                            {report.complianceStatus}
                          </span>
                          <span className="text-gray-500 text-xs">
                            {new Date(report.analyzedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Report Detail */}
            {selectedReport && (
              <div className="lg:col-span-2 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">{selectedReport.sopIdentifier}</h2>
                    <p className="text-gray-400">{selectedReport.sopName}</p>
                    <p className="text-purple-400 text-sm">{selectedReport.department}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-4xl font-bold ${getScoreColor(selectedReport.overallScore)}`}>
                      {getScoreEmoji(selectedReport.overallScore)} {selectedReport.overallScore}/10
                    </p>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm mt-2 ${getStatusColor(selectedReport.complianceStatus)}`}>
                      {selectedReport.complianceStatus}
                    </span>
                  </div>
                </div>

                {/* Summary Cards - New Component */}
                <SummaryCards
                  overallScore={selectedReport.overallScore}
                  complianceStatus={selectedReport.complianceStatus}
                  totalChecked={selectedReport.totalGuidelinesChecked}
                  compliant={selectedReport.compliantCount}
                  partial={selectedReport.partialCount}
                  nonCompliant={selectedReport.nonCompliantCount}
                />

                {/* Detailed Findings - New Component */}
                <h3 className="text-lg font-bold text-white mb-4">📋 Findings with Guideline References</h3>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                  {selectedReport.findings && selectedReport.findings.length > 0 ? (
                    selectedReport.findings.map((finding, idx) => (
                      <FindingCard
                        key={idx}
                        id={`finding-${idx}`}
                        requirement={finding.guidelineRequirement || finding.clauseText || ''}
                        gap={finding.mismatchExplanation || finding.highlightedIssue || ''}
                        impact={finding.highlightedIssue || 'Impact not specified'}
                        suggestion={finding.suggestedAction || ''}
                        reference={`${finding.folderName} → ${finding.guidelineName} → ${finding.clauseNumber}`}
                        severity={finding.issueSeverity || (finding.criticality === 'critical' || finding.criticality === 'high' ? 'major' : 'minor')}
                        status={finding.complianceLevel}
                        confidence={finding.matchConfidence || 0}
                        sopSection={finding.sopSectionAffected?.split(' - ')[0] || 'N/A'}
                        sopTextSnippet={finding.sopTextSnippet || ''}
                        suggestedText={finding.suggestedText || ''}
                      />
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <p>No findings available</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
